import { createLogger } from "@/utils/logger";
import { QueueService } from "./queue.service";
import { AIService } from "./ai.service";
import { getRepository } from "@/config/database";
import { Document, Model, User } from "@/entities";
import { DocumentStatus, ApiProvider, MessageRole } from "@/types/ai.types";
import { S3Service } from "./s3.service";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { MessagesService } from "./messages.service";
import { Repository } from "typeorm";

const logger = createLogger(__filename);

export class DocumentQueueService {
  private queueService: QueueService;
  private aiService: AIService;
  private modelRepo: Repository<Model>;
  private documentRepo: Repository<Document>;
  private userRepo: Repository<User>;

  constructor() {
    this.queueService = new QueueService(MessagesService.pubSub);
    this.aiService = new AIService();
    this.modelRepo = getRepository(Model);
    this.documentRepo = getRepository(Document);
    this.userRepo = getRepository(User);
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
        throw new Error(`Document ${documentId} not found`);
      }

      const embeddingsModelId = document.embeddingsModelId || document.owner?.documentsEmbeddingsModelId;
      const summarizationModelId = document.summaryModelId || document.owner?.documentSummarizationModelId;

      if (!embeddingsModelId) {
        logger.warn(`No embeddings model configured for document ${document.id}, skipping embeddings`);
      }

      // Update document status
      document.status = DocumentStatus.EMBEDDING;
      document.statusProgress = 0;
      await this.documentRepo.save(document);
      this.queueService.publishDocumentStatus(document);

      // Create connection params for AI service
      const connection = User.getConnectionInfo(document.owner);

      // Download chunked JSON from S3
      const s3Service = new S3Service(document.owner?.toToken());
      const chunkedContent = await this.downloadS3Content(s3Service, `${s3key}.chunked.json`);
      const chunkedData = JSON.parse(chunkedContent);

      // Process embeddings if model is configured
      if (embeddingsModelId) {
        await this.processEmbeddings(document, chunkedData, embeddingsModelId, connection);
      }

      if (!summarizationModelId) {
        logger.warn(`No summarization model configured for document ${document.id}, skipping summary`);
      }

      // Update document status for summarization
      document.status = DocumentStatus.SUMMARIZING;
      document.statusProgress = 0.5;
      await this.documentRepo.save(document);
      this.queueService.publishDocumentStatus(document);

      // Generate summary if model is configured
      if (summarizationModelId) {
        document.summary = await this.generateSummary(document, s3key, summarizationModelId, s3Service, connection);
      }

      // Mark document as ready
      document.status = DocumentStatus.READY;
      document.statusProgress = 1;
      document.embeddingsModelId = embeddingsModelId;
      document.summaryModelId = summarizationModelId;

      await this.documentRepo.save(document);
      this.queueService.publishDocumentStatus(document);

      logger.info(`Successfully indexed document ${documentId}`);
    } catch (error) {
      logger.error(error, `Failed to index document ${documentId}`);

      // Update document status to error
      const documentRepo = getRepository(Document);
      const document = await documentRepo.findOne({ where: { id: documentId } });
      if (document) {
        document.status = DocumentStatus.ERROR;
        document.statusInfo = error instanceof Error ? error.message : "Unknown error";
        await documentRepo.save(document);
        this.queueService.publishDocumentStatus(document);
      }

      throw error;
    }
  }

  private async processEmbeddings(
    document: Document,
    chunkedData: any,
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

    // TODO: This is a simplified version. In a real implementation, you would:
    // 1. Store chunks in a database with vector embeddings
    // 2. Use a vector database like pgvector
    // 3. Batch the embedding requests for efficiency

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Get embeddings for chunk text
      const embeddingResponse = await this.aiService.getEmbeddings(model.apiProvider, connection, {
        modelId: model.modelId,
        input: chunk.text,
      });

      // Update progress
      const progress = ((i + 1) / chunks.length) * 0.5; // First half of progress
      document.statusProgress = progress;
      await getRepository(Document).save(document);
      this.queueService.publishDocumentStatus(document);

      // TODO: Store chunk with embedding in database
      // This would typically involve:
      // - Creating a DocumentChunk entity
      // - Storing the chunk text, page, and embedding vector
      // - Using pgvector for efficient similarity search

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
      const userRepo = getRepository(User);
      const user = await userRepo.findOne({
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

      // TODO: get maxTokens for each model
      const maxContentLength = 16 * 1024;
      const contentToSummarize =
        markdownContent.length > maxContentLength
          ? markdownContent.substring(0, maxContentLength) + "..."
          : markdownContent;

      // Generate summary
      const summaryResponse = await this.aiService.invokeModel(model.apiProvider, connection, {
        modelId,
        messages: [
          {
            role: MessageRole.USER,
            body: `Please provide a comprehensive summary of the following document in up to 1024 words. 
              Focus on the main topics, key findings, and important details:\n\n${contentToSummarize}`,
          },
        ],
        maxTokens: 1500,
        temperature: 0.3,
      });

      logger.info(`Generated summary for document ${document.id} (${summaryResponse.content.length} characters)`);

      return summaryResponse.content;
    } catch (error) {
      logger.error(error, `Failed to generate summary for document ${document.id}`);
      // Don't fail the whole process if summary generation fails
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
