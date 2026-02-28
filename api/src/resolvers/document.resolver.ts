import { Resolver, Mutation, Arg, Ctx, Query, Subscription, Root, ID, FieldResolver } from "type-graphql";
import { getRepository } from "@/config/database";

import { Document, DocumentMetadata } from "@/entities/Document";
import { GraphQLContext } from ".";
import { BaseResolver } from "./base.resolver";
import { Repository, ILike } from "typeorm";
import { S3Service } from "@/services/data";
import { DocumentStatusMessage, DocumentsResponse } from "@/types/graphql/responses";
import { GetDocumentsInput } from "@/types/graphql/inputs";
import { DocumentStatus } from "@/types/api";
import { globalConfig } from "@/global-config";
import { ExpirationMap } from "@/utils/data/expiration-map";
import { logger } from "@/utils/logger";

@Resolver(Document)
export class DocumentResolver extends BaseResolver {
  private documentRepo: Repository<Document>;
  private statusMap: ExpirationMap<string, DocumentMetadata>;

  constructor() {
    super(); // Call the constructor of BaseResolver to initialize userRepository
    this.documentRepo = getRepository(Document);
    this.statusMap = new ExpirationMap(60000);
  }

  @FieldResolver(() => String, { nullable: true })
  downloadUrl(@Root() document: Document) {
    return document.s3key ? S3Service.getFileUrl(document.s3key, document.fileName) : undefined;
  }

  @FieldResolver(() => String, { nullable: true })
  downloadUrlMarkdown(@Root() document: Document) {
    return document.s3key &&
      [DocumentStatus.READY, DocumentStatus.CHUNKING, DocumentStatus.EMBEDDING, DocumentStatus.SUMMARIZING].includes(
        document.status
      )
      ? S3Service.getFileUrl(document.s3key + ".parsed.md", document.fileName + ".md")
      : undefined;
  }

  @Mutation(() => Document)
  async reindexDocument(@Arg("id", () => ID) id: string, @Ctx() context: GraphQLContext): Promise<Document> {
    await this.validateContextToken(context);
    const documentSqsService = this.getDocumentSqsService(context);

    const document = await this.documentRepo.findOne({
      where: { id },
    });

    if (!document) throw new Error("Document not found");
    if (!document.s3key) throw new Error("Document was not uploaded yet");

    document.status = DocumentStatus.CHUNKING;
    document.statusProgress = 1;
    await this.documentRepo.save(document);

    await documentSqsService.sendJsonMessage(
      {
        command: "index_document",
        documentId: document.id,
        s3key: document.s3key,
        mime: document.mime,
      },
      0,
      true
    );

    return document;
  }

  @Query(() => DocumentsResponse)
  async getDocuments(
    @Arg("input", { nullable: true }) input: GetDocumentsInput = {},
    @Ctx() context: GraphQLContext
  ): Promise<DocumentsResponse> {
    const user = await this.validateContextUser(context);
    const { offset = 0, limit = 20, searchTerm } = input;

    let query = this.documentRepo
      .createQueryBuilder("document")
      .where("document.ownerId = :userId", { userId: user.id });

    if (searchTerm) {
      query = query.where([{ fileName: ILike(`%${searchTerm}%`) }]);
    }

    query = query.orderBy("document.createdAt", "DESC").skip(offset).take(limit);
    const [documents, total] = await query.getManyAndCount();

    return {
      documents,
      total,
      hasMore: offset + limit < total,
    };
  }

  @Mutation(() => Document)
  async processDocument(
    @Arg("id", () => ID) id: string,
    @Arg("force", { nullable: true }) force: boolean = false,
    @Ctx() context: GraphQLContext
  ): Promise<Document> {
    await this.validateContextToken(context);
    const sqsService = this.getDocumentSqsService(context);

    const document = await this.documentRepo.findOne({
      where: { id },
    });

    if (!document) throw new Error("Document not found");
    if (!document.s3key) throw new Error("Document was not uploaded yet");

    await sqsService.sendJsonMessage({
      command: "parse_document",
      documentId: document.id,
      s3key: document.s3key,
    });

    return document;
  }

  @Mutation(() => Boolean)
  async deleteDocument(@Arg("id", () => ID) id: string, @Ctx() context: GraphQLContext): Promise<boolean> {
    const user = await this.validateContextUser(context);
    const s3Service = new S3Service(user.toToken());

    const document = await this.documentRepo.findOne({
      where: { id, owner: { id: user.id } },
    });

    if (!document) throw new Error("Document not found");

    // Delete from S3 if exists
    if (document.s3key) {
      await s3Service.deleteByPrefix(document.s3key);
    }

    // Delete from database
    await this.documentRepo.remove(document);
    return true;
  }

  @Subscription(() => [DocumentStatusMessage], {
    topics: globalConfig.redis.channelDocumentStatus,
    filter: ({ payload, args }) => {
      return (
        [DocumentStatus.ERROR, DocumentStatus.DELETING].includes(payload.status) ||
        args.documentIds.includes(payload.documentId)
      );
    },
  })
  async documentsStatus(
    @Root() payload: DocumentStatusMessage,
    @Ctx() context: GraphQLContext,
    @Arg("documentIds", () => [String]) documentIds: string[]
  ): Promise<DocumentStatusMessage[]> {
    await this.validateContextToken(context);

    const metadata = this.statusMap.get(payload.documentId) || payload.metadata || {};
    if (payload.pagesCount) {
      metadata.pagesCount = payload.pagesCount;
    }

    if (payload.startTime || payload.currentTime) {
      switch (payload.status) {
        case DocumentStatus.PARSING:
          if (!metadata.parsingStartedAt) metadata.parsingStartedAt = payload.startTime || payload.currentTime;
          break;
        case DocumentStatus.CHUNKING:
          if (!metadata.chunkingStartedAt) metadata.chunkingStartedAt = payload.startTime || payload.currentTime;
          break;
        case DocumentStatus.EMBEDDING:
          if (!metadata.embeddingStartedAt) metadata.embeddingStartedAt = payload.startTime || payload.currentTime;
          break;
        case DocumentStatus.SUMMARIZING:
          if (!metadata.summarizationStartedAt)
            metadata.summarizationStartedAt = payload.startTime || payload.currentTime;
          break;
      }
    }

    if (payload.endTime || payload.currentTime) {
      switch (payload.status) {
        case DocumentStatus.PARSING:
          metadata.parsingEndedAt = payload.endTime || payload.currentTime;
          break;
        case DocumentStatus.CHUNKING:
          metadata.chunkingEndedAt = payload.endTime || payload.currentTime;
          break;
        case DocumentStatus.EMBEDDING:
          metadata.embeddingEndedAt = payload.endTime || payload.currentTime;
          break;
        case DocumentStatus.SUMMARIZING:
          metadata.summarizationEndedAt = payload.endTime || payload.currentTime;
          break;
      }
    }

    if (metadata.pagesCount) {
      if (metadata.parsingEndedAt && metadata.parsingStartedAt) {
        metadata.parsingPagePerSecond =
          metadata.pagesCount / ((metadata.parsingEndedAt - metadata.parsingStartedAt) / 100_000_000);
      }
      if (metadata.chunkingEndedAt && metadata.chunkingStartedAt) {
        metadata.chunkingPagePerSecond =
          metadata.pagesCount / ((metadata.chunkingEndedAt - metadata.chunkingStartedAt) / 100_000_000);
      }
      if (metadata.embeddingEndedAt && metadata.embeddingStartedAt) {
        metadata.embeddingPagePerSecond =
          metadata.pagesCount / ((metadata.embeddingEndedAt - metadata.embeddingStartedAt) / 100_000_000);
      }
    }

    this.statusMap.set(payload.documentId, metadata);

    logger.trace({ documentId: payload.documentId, metadata }, "Updated document metadata");

    // from documents processor, so we need to update document status
    if (payload.sync) {
      const metadata = this.statusMap.get(payload.documentId);
      await this.documentRepo.update(
        { id: payload.documentId },
        {
          status: payload.status,
          statusInfo: payload.statusInfo,
          statusProgress: payload.statusProgress,
          pagesCount: metadata?.pagesCount || undefined,
          metadata,
        }
      );
    }

    return [payload];
  }
}
