import { createLogger } from "@/utils/logger";
import { SubscriptionsService } from "./messaging/subscriptions.service";
import { AIService } from "./ai/ai.service";
import { getRepository } from "@/config/database";
import { Document, Message, Model, User } from "@/entities";
import { DocumentStatus, MessageRole, ModelMessageContent, ParsedJsonDocument } from "@/types/ai.types";
import { S3Service } from "./data";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { Repository } from "typeorm";
import { PROMPT_DOCUMENT_SUMMARY } from "@/config/ai/prompts";
import { EmbeddingsService } from "./ai/embeddings.service";
import { CHARACTERS_PER_TOKEN, SUMMARIZING_OUTPUT_TOKENS, SUMMARIZING_TEMPERATURE } from "@/config/ai/common";

const logger = createLogger(__filename);

export class DocumentQueueService {
  private subService: SubscriptionsService;
  private aiService: AIService;
  private embeddingsService: EmbeddingsService;
  private modelRepo: Repository<Model>;
  private documentRepo: Repository<Document>;
  private userRepo: Repository<User>;
  private messageRepo: Repository<Message>;

  constructor(subService: SubscriptionsService) {
    this.subService = subService;
    this.aiService = new AIService();
    this.embeddingsService = new EmbeddingsService();
    this.modelRepo = getRepository(Model);
    this.documentRepo = getRepository(Document);
    this.userRepo = getRepository(User);
    this.messageRepo = getRepository(Message);
  }

  async handleIndexDocumentCommand(command: { command: string; documentId: string; s3key: string }): Promise<void> {
    const { documentId, s3key } = command;

    try {
      logger.info(`Processing index_document command for document ${documentId}`);

      // Get document
      const document = await this.documentRepo.findOne({
        where: { id: documentId },
        relations: ["owner"],
      });

      if (!document) {
        logger.warn(command, `Document ${documentId} not found`);
        return;
      }

      const embeddingsModelId = document.embeddingsModelId || document.owner?.documentsEmbeddingsModelId;
      const summarizationModelId = document.summaryModelId || document.owner?.documentSummarizationModelId;

      document.embeddingsModelId = embeddingsModelId;
      document.summaryModelId = summarizationModelId;
      document.statusInfo = undefined;

      if (!embeddingsModelId) {
        logger.warn(`No embeddings model configured for document ${document.id}, skipping embeddings`);
      }

      // Create connection params for AI service
      const connection = User.getConnectionInfo(document.owner);

      // Download chunked JSON from S3
      const s3Service = new S3Service(document.owner?.toToken());
      const chunkedContent = await this.downloadS3Content(s3Service, `${s3key}.chunked.json`);
      const chunkedData = JSON.parse(chunkedContent);

      // Process embeddings if model is configured
      if (embeddingsModelId) {
        document.status = DocumentStatus.EMBEDDING;
        document.statusProgress = 0;
        await this.documentRepo.save(document);
        this.subService.publishDocumentStatus(document);

        await this.processEmbeddings(document, chunkedData, embeddingsModelId, connection);
      }

      if (!summarizationModelId) {
        logger.warn(`No summarization model configured for document ${document.id}, skipping summary`);
      }

      // Generate summary if model is configured
      if (summarizationModelId) {
        // Update document status for summarization
        document.status = DocumentStatus.SUMMARIZING;
        document.statusProgress = 0.5;
        await this.documentRepo.save(document);
        this.subService.publishDocumentStatus(document);

        document.summary = await this.generateSummary(document, s3key, summarizationModelId, s3Service, connection);
      }

      // Mark document as ready
      document.status = DocumentStatus.READY;
      document.statusProgress = 1;

      await this.documentRepo.save(document);
      this.subService.publishDocumentStatus(document);

      logger.info(`Successfully indexed document ${documentId}`);
    } catch (error) {
      logger.error(error, `Failed to index document ${documentId}`);

      // Update document status to error
      const document = await this.documentRepo.findOne({ where: { id: documentId } });
      if (document) {
        document.status = DocumentStatus.ERROR;
        document.statusInfo = error instanceof Error ? error.message : "Unknown error";
        await this.documentRepo.save(document);
        this.subService.publishDocumentStatus(document);
      }

      throw error;
    }
  }

  private async processEmbeddings(
    document: Document,
    chunkedData: ParsedJsonDocument,
    modelId: string,
    connection: ConnectionParams
  ): Promise<void> {
    const chunks = chunkedData.chunks || [];
    logger.info(`Processing ${chunks.length} chunks for embeddings`);

    const model = await this.modelRepo.findOne({
      where: { modelId: modelId },
    });

    if (!model) {
      logger.warn(`Embeddings model ${modelId} not found`);
      return;
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      await this.embeddingsService.generateEmbedding(document, chunk, model, connection);

      // Update progress
      const progress = (i + 1) / chunks.length;
      document.statusProgress = progress;
      await this.documentRepo.save(document);
      this.subService.publishDocumentStatus(document);

      logger.debug(`Processed embedding for chunk ${i + 1}/${chunks.length}`);
    }
  }

  private async generateSummary(
    document: Document,
    s3key: string,
    modelId: string,
    s3Service: S3Service,
    connection: ConnectionParams
  ): Promise<string | undefined> {
    try {
      // Get user for S3 service
      const user = await this.userRepo.findOne({
        where: { id: document.ownerId },
      });

      if (!user) {
        throw new Error(`User ${document.ownerId} not found`);
      }

      const model = await this.modelRepo.findOne({
        where: { modelId: modelId },
      });

      if (!model) {
        logger.warn(`Embeddings model ${modelId} not found`);
        return undefined;
      }

      // Download markdown content
      const markdownContent = await this.downloadS3Content(s3Service, `${s3key}.parsed.md`);

      const maxContentLength = (model.maxInputTokens || 8 * 1024) * CHARACTERS_PER_TOKEN;
      const contentToSummarize =
        markdownContent.length > maxContentLength ? markdownContent.substring(0, maxContentLength) : markdownContent;

      // Generate summary
      const summaryResponse = await this.aiService.completeChat(
        connection,
        {
          modelId,
          apiProvider: model.apiProvider,
          maxTokens: SUMMARIZING_OUTPUT_TOKENS,
          temperature: SUMMARIZING_TEMPERATURE,
        },
        [
          this.messageRepo.create({
            id: "",
            role: MessageRole.USER,
            content: PROMPT_DOCUMENT_SUMMARY({ content: contentToSummarize }),
          }),
        ]
      );

      logger.info(`Generated summary for document ${document.id} (${summaryResponse.content.length} characters)`);

      return summaryResponse.content;
    } catch (error) {
      logger.error(error, `Failed to generate summary for document ${document.id}`);
    }
  }

  private async downloadS3Content(s3Service: S3Service, key: string): Promise<string> {
    const s3Client = await s3Service.getClient();
    if (!s3Client) {
      throw new Error("S3 client not available");
    }

    const command = new GetObjectCommand({
      Bucket: s3Service.bucket,
      Key: key,
    });

    const response = await s3Client.send(command);

    const content = await response.Body?.transformToString();
    if (!content) {
      throw new Error(`No content found for key ${key}`);
    }

    return content;
  }
}
