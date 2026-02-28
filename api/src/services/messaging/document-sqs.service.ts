import { createLogger } from "@/utils/logger";
import { DocumentQueueService, IndexDocumentPayload } from "../document-queue.service";
import { Message } from "@aws-sdk/client-sqs";
import { APPLICATION_FEATURE, globalConfig } from "@/global-config";
import { SubscriptionsService } from "./subscriptions.service";
import { ok } from "@/utils/assert";
import { BaseSqsService } from "./base-sqs.service";

const logger = createLogger(__filename);

export class DocumentSqsService extends BaseSqsService {
  private outputQueueUrl: string;
  private indexQueueUrl: string;
  private documentQueueService: DocumentQueueService;

  constructor(subscriptionsService: SubscriptionsService) {
    super({
      maxNumberOfMessages: globalConfig.sqs.documentsQueueMaxMessagesCount,
      waitTimeSeconds: 5,
      visibilityTimeout: 30,
    });

    const { documentsQueue, indexDocumentsQueue } = globalConfig.sqs;

    if (globalConfig.features?.includes(APPLICATION_FEATURE.RAG)) {
      ok(documentsQueue, "SQS_DOCUMENTS_QUEUE must be configured");
      ok(indexDocumentsQueue, "SQS_INDEX_DOCUMENTS_QUEUE must be configured");
      this.outputQueueUrl = documentsQueue;
      this.indexQueueUrl = indexDocumentsQueue;
      this.documentQueueService = new DocumentQueueService(subscriptionsService);
    }
  }

  protected get pollQueueUrl(): string {
    return this.indexQueueUrl;
  }

  protected getRequiredQueueUrls(): string[] {
    return [this.indexQueueUrl, this.outputQueueUrl];
  }

  async startup(): Promise<void> {
    if (globalConfig.features?.includes(APPLICATION_FEATURE.RAG)) {
      await this.startSqs();
      logger.info(`${this.constructor.name} started, polling queue: ${this.indexQueueUrl}`);
    } else {
      logger.warn("RAG not configured, skipping indexing SQS listener");
    }
  }

  /**
   * Send a JSON object as a message to the SQS queue
   */
  async sendJsonMessage(
    message: unknown,
    delaySeconds: number = 0,
    indexQueue: boolean = false
  ): Promise<string | undefined> {
    const messageBody = JSON.stringify(message);
    return this.sendMessage(messageBody, indexQueue ? this.indexQueueUrl : this.outputQueueUrl, delaySeconds);
  }

  protected async handleMessage(message: Message): Promise<boolean> {
    if (!message.Body) {
      logger.warn("Received message without body");
      return true;
    }

    try {
      const command = JSON.parse(message.Body) as IndexDocumentPayload;
      logger.info(`Processing DocumentSQS message: ${command.command} for document ${command.documentId}`);

      if (command.command === "index_document") {
        this.documentQueueService
          .handleIndexDocumentCommand(command)
          .then(processed => (processed ? this.deleteMessage(message) : undefined))
          .catch((error: unknown) => {
            logger.error(error, `Failed to process index_document command for document ${command.documentId}`);
          });
        return false;
      }

      logger.info(`Skip command: ${command.command}`);
      return false;
    } catch (error) {
      logger.error(error, "Error handling Document SQS message");
      throw error;
    }
  }
}
