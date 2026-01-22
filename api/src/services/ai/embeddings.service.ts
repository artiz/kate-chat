import pgvector from "pgvector";
import { createLogger } from "@/utils/logger";
import { AIService } from "./ai.service";
import { AppDataSource, DB_TYPE, getRepository } from "@/config/database";
import { Document, DocumentChunk, Model, User } from "@/entities";
import { ParsedDocumentChunk } from "@/types/ai.types";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { In, Repository } from "typeorm";
import { EMBEDDINGS_DIMENSIONS } from "@/config/ai/common";
import { notEmpty, ok } from "@/utils/assert";

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
    const selector = {
      documentId: document.id,
      page: chunk.page,
      pageIndex: chunk.id,
    };
    let entity = await this.documentChunksRepo.findOne({
      where: selector,
    });

    if (entity && entity.modelId === model.modelId) {
      let embedding = entity?.embedding;
      if (DB_TYPE === "sqlite") {
        const runner = AppDataSource.createQueryRunner();
        try {
          const rows = await runner.manager.query<{ rowid: number }[]>(
            `SELECT rowid FROM document_chunks where "id"=? LIMIT 1`,
            [entity.id]
          );
          const rowid = rows?.[0]?.rowid;
          if (rowid) {
            const embeds = await runner.manager.query<{ embedding_vec: string }[]>(
              `SELECT vec_to_json(embedding) as embedding_vec FROM vss_document_chunks where rowid=? LIMIT 1`,
              [rowid]
            );
            embedding = embeds?.[0]?.embedding_vec ? JSON.parse(embeds[0].embedding_vec) : undefined;
          }
        } finally {
          runner.release();
        }
      }

      if (embedding && embedding.length === EMBEDDINGS_DIMENSIONS) {
        logger.debug(
          { documentId: document.id, chunkId: chunk.id, page: chunk.page },
          `Embedding already exists for chunk`
        );
        return entity;
      }
    }

    // Get embeddings for chunk text
    const embeddingResponse = await this.aiService.getEmbeddings(model.apiProvider, connection, {
      modelId: model.modelId,
      input: chunk.text,
    });

    const embedding = embeddingResponse.embedding;
    if (embedding.length < EMBEDDINGS_DIMENSIONS) {
      embedding.push(...Array(EMBEDDINGS_DIMENSIONS - embedding.length).fill(0));
    }

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
    const documents = await this.documentRepo.findBy({
      id: In([...new Set(documentIds)]),
    });

    logger.debug({ documentIds: documentIds || [], documents, query }, `Query chunks`);

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
    const documentByModel: Record<string, Document[]> = Object.keys(modelsMap).reduce(
      (acc, modelId) => {
        acc[modelId] = documents.filter(doc => doc.embeddingsModelId === modelId);
        return acc;
      },
      {} as Record<string, Document[]>
    );

    for (const [modelId, documents] of Object.entries(documentByModel)) {
      const documentsChunks: DocumentChunk[] = [];

      const model = modelsMap[modelId];
      const queryEmbeddingRes = await this.aiService.getEmbeddings(model.apiProvider, connection, {
        modelId,
        input: query,
      });
      const queryEmbedding = queryEmbeddingRes.embedding;
      if (queryEmbedding.length < EMBEDDINGS_DIMENSIONS) {
        queryEmbedding.push(...Array(EMBEDDINGS_DIMENSIONS - queryEmbedding.length).fill(0));
      }

      const documentIds = documents.map(doc => doc.id);

      if (DB_TYPE === "sqlite") {
        const runner = AppDataSource.createQueryRunner();
        try {
          const chunks = await runner.manager.query<(DocumentChunk & { rowid: number; distance: number })[]>(
            `SELECT vdc.rowid, vdc.distance, dc.*, d.fileName as "documentName"
                FROM vss_document_chunks vdc
                LEFT JOIN document_chunks dc ON vdc.rowid = dc.rowid
                LEFT JOIN documents d ON dc.documentId = d.id
                WHERE 
                dc.documentId IN (${documentIds.map(s => `'${s}'`).join(", ")}) AND
                vdc.embedding MATCH ? AND vdc.k = ? ORDER BY vdc.distance`,
            [JSON.stringify(queryEmbedding), limit]
          );

          documentsChunks.push(...chunks);
        } catch (err) {
          logger.error(err, `Failed to query documents ${documentIds.join(", ")} chunks`);
        } finally {
          runner.release();
        }
      } else if (DB_TYPE === "postgres") {
        const chunks = await this.documentChunksRepo
          .createQueryBuilder("document_chunk")
          .leftJoinAndSelect("document_chunk.document", "document")
          .where("document_chunk.documentId IN (:...documentIds)", { documentIds })
          .orderBy("embedding <-> :embedding")
          .setParameters({ embedding: pgvector.toSql(queryEmbedding) })
          .limit(limit)
          .getMany();

        documentsChunks.push(...chunks);
      } else if (DB_TYPE === "mssql") {
        const runner = AppDataSource.createQueryRunner();
        try {
          const chunks = await runner.manager.query<(DocumentChunk & { distance: number })[]>(
            `
            DECLARE @question AS VECTOR (${EMBEDDINGS_DIMENSIONS}) = '${JSON.stringify(queryEmbedding)}';
            SELECT TOP (${limit}) *, VECTOR_DISTANCE('cosine', @question, embedding) AS distance, d.fileName as "documentName"
              FROM document_chunks dc
              LEFT JOIN documents d ON dc.documentId = d.id
              WHERE documentId IN (${documentIds.map(s => `'${s}'`).join(", ")})
              ORDER BY VECTOR_DISTANCE('cosine', @question, embedding)`
          );

          documentsChunks.push(...chunks);
        } catch (err) {
          logger.error(err, `Failed to query documents ${documentIds.join(", ")} chunks`);
        } finally {
          runner.release();
        }
      } else {
        logger.warn(`Unsupported embeddings database type: ${DB_TYPE}`);
      }

      if (loadFullPage) {
        const loadedChunkIds = new Set(documentsChunks.map(c => c.id));
        for (var docId of documentIds) {
          const chunkPages = new Set(
            documentsChunks
              .filter(c => c.documentId === docId)
              .map(c => c.page)
              .filter(p => p > 0)
          );
          if (chunkPages.size) {
            const chunks = await this.documentChunksRepo.find({
              where: {
                page: In([...chunkPages]),
                documentId: docId,
              },
            });

            documentsChunks.push(...chunks.filter(c => !loadedChunkIds.has(c.id)));
          }
        }
      }

      results.push(
        ...documentsChunks.map(c => ({ ...c, documentName: c.documentName || c?.document?.fileName || c.documentId }))
      );
    }

    return results;
  }
}
