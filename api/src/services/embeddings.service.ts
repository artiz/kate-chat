import pgvector from "pgvector";
import { createLogger } from "@/utils/logger";
import { SubscriptionsService } from "./subscriptions.service";
import { AIService } from "./ai.service";
import { AppDataSource, DB_TYPE, getRepository } from "@/config/database";
import { Document, DocumentChunk, Model, User } from "@/entities";
import { ParsedDocumentChunk } from "@/types/ai.types";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { In, Not, Repository } from "typeorm";
import { run } from "node:test";
import { ok } from "assert";
import { EMBEDDINGS_DIMENSIONS } from "@/config/ai";
import { notEmpty } from "@/utils/assert";

const logger = createLogger(__filename);

export class EmbeddingsService {
  private aiService: AIService;
  private modelRepo: Repository<Model>;
  private documentRepo: Repository<Document>;
  private documentChunksRepo: Repository<DocumentChunk>;

  constructor() {
    this.aiService = new AIService();
    this.modelRepo = getRepository(Model);
    this.documentRepo = getRepository(Document);
    this.documentChunksRepo = getRepository(DocumentChunk);
  }

  public async generateEmbedding(
    document: Document,
    chunk: ParsedDocumentChunk,
    model: Model,
    connection: ConnectionParams
  ): Promise<DocumentChunk> {
    // Get embeddings for chunk text
    const embeddingResponse = await this.aiService.getEmbeddings(model.apiProvider, connection, {
      modelId: model.modelId,
      input: chunk.text,
    });

    const embedding = embeddingResponse.embedding;
    if (embedding.length < EMBEDDINGS_DIMENSIONS) {
      embedding.push(...Array(EMBEDDINGS_DIMENSIONS - embedding.length).fill(0));
    }

    const selector = {
      documentId: document.id,
      page: chunk.page,
      pageIndex: chunk.id,
    };
    let entity = await this.documentChunksRepo.findOne({
      where: selector,
    });

    if (!entity) {
      entity = this.documentChunksRepo.create(selector);
    }
    entity.content = chunk.text;
    entity.embedding = embedding;
    entity.modelId = model.modelId;
    entity = await this.documentChunksRepo.save(entity);

    // SQLite specific
    if (DB_TYPE === "sqlite") {
      const runner = AppDataSource.createQueryRunner();
      try {
        const rows = await runner.manager.query<{ rowid: number }[]>(
          `SELECT rowid FROM document_chunks where "id"=? LIMIT 1`,
          [entity.id]
        );
        const rowid = rows?.[0]?.rowid;
        ok(rowid, `SQLite Row ID not found for chunk ${entity.id}`);
        await runner.manager.query("DELETE FROM vss_document_chunks WHERE rowid = ?", [rowid]);
        await runner.manager.query(
          "INSERT INTO vss_document_chunks (rowid, embedding) VALUES (CAST(? AS INTEGER), ?)",
          [rowid, JSON.stringify(embedding)]
        );
      } finally {
        runner.release();
      }
    }

    return entity;
  }

  public async findChunks(
    documentIds: string[],
    query: string,
    connection: ConnectionParams,
    { limit = 5, loadFullPage = false }: { limit: number; loadFullPage: boolean }
  ): Promise<DocumentChunk[]> {
    // TODO: for each doc:
    // generate query embedding by doc.embeddingModelId
    // find 20 most similar chunks

    const documents = await this.documentRepo.findBy({
      id: In([...new Set(documentIds)]),
    });

    const modelIds = new Set(documents.map(doc => doc.embeddingsModelId).filter(notEmpty));
    ok(modelIds.size, `No valid embeddings model IDs found for documents`);
    const modelsMap = (
      await this.modelRepo.findBy({
        modelId: In([...modelIds]),
      })
    ).reduce(
      (acc, model) => {
        acc[model.modelId] = model;
        return acc;
      },
      {} as Record<string, Model>
    );

    const results: DocumentChunk[] = [];

    // TODO: make one call if all docs use same embeddings model

    for (const document of documents) {
      const documentChunks: DocumentChunk[] = [];

      if (!document.embeddingsModelId) {
        logger.warn(`Document ${document.id} has no embeddings model setup`);
        continue;
      }
      const model = modelsMap[document.embeddingsModelId];
      const queryEmbeddingRes = await this.aiService.getEmbeddings(model.apiProvider, connection, {
        modelId: model.modelId,
        input: query,
      });
      const queryEmbedding = queryEmbeddingRes.embedding;
      if (queryEmbedding.length < EMBEDDINGS_DIMENSIONS) {
        queryEmbedding.push(...Array(EMBEDDINGS_DIMENSIONS - queryEmbedding.length).fill(0));
      }

      if (DB_TYPE === "sqlite") {
        const runner = AppDataSource.createQueryRunner();
        try {
          const chunks = await runner.manager.query<(DocumentChunk & { rowid: number; distance: number })[]>(
            `SELECT vdc.rowid, vdc.distance, dc.*
                FROM vss_document_chunks vdc
                LEFT JOIN document_chunks dc ON vdc.rowid = dc.rowid
                WHERE 
                dc.documentId = ? AND
                vdc.embedding MATCH ? AND vdc.k = ? ORDER BY vdc.distance`,
            [document.id, JSON.stringify(queryEmbedding), limit]
          );

          documentChunks.push(...chunks);
        } catch (err) {
          logger.error(err, `Failed to query document ${document.id} chunks`);
        } finally {
          runner.release();
        }
      } else if (DB_TYPE === "postgres") {
        const chunks = await this.documentChunksRepo
          .createQueryBuilder("document_chunks")
          .where("document_chunks.documentId = :documentId", { documentId: document.id })
          .orderBy("embedding <-> :embedding")
          .setParameters({ embedding: pgvector.toSql(queryEmbedding) })
          .limit(limit)
          .getMany();

        documentChunks.push(...chunks);
      } else if (DB_TYPE === "mssql") {
        const runner = AppDataSource.createQueryRunner();
        try {
          const chunks = await runner.manager.query<(DocumentChunk & { distance: number })[]>(
            `
            DECLARE @question AS VECTOR (${EMBEDDINGS_DIMENSIONS}) = '${JSON.stringify(queryEmbedding)}';
            SELECT TOP (${limit}) *, VECTOR_DISTANCE('cosine', @question, embedding) AS distance
              FROM document_chunks dc
              WHERE documentId = '${document.id}'
              ORDER BY VECTOR_DISTANCE('cosine', @question, embedding)`
          );

          documentChunks.push(...chunks);
        } catch (err) {
          logger.error(err, `Failed to query document ${document.id} chunks`);
        } finally {
          runner.release();
        }
      } else {
        logger.warn(`Unsupported embeddings database type: ${DB_TYPE}`);
      }

      if (loadFullPage) {
        const chunkPages = new Set(documentChunks.map(c => c.page).filter(p => p > 0));
        if (chunkPages.size) {
          const chunks = await this.documentChunksRepo.find({
            where: {
              page: In([...chunkPages]),
              documentId: document.id,
              id: Not(In(documentChunks.map(c => c.id))),
            },
          });
          documentChunks.push(...chunks);
        }
      }

      results.push(...documentChunks.map(c => ({ ...c, documentName: document.fileName })));
    }

    return results;
  }
}
