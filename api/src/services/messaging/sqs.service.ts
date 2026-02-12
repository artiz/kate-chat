import { createLogger } from "@/utils/logger";
import { DocumentQueueService } from "../document-queue.service";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
  Message,
  ListQueuesCommand,
} from "@aws-sdk/client-sqs";
import { globalConfig } from "@/global-config";
import { SubscriptionsService } from "./subscriptions.service";
import { ok } from "assert";

const logger = createLogger(__filename);

export class SQSService {
  private sqs: SQSClient;
  private outputQueueUrl: string;
  private indexQueueUrl: string;
  private documentQueueService: DocumentQueueService;
  private polling = false;
  private pollInterval?: NodeJS.Timeout;

  constructor(subscriptionsService: SubscriptionsService) {
    const { documentsQueue, indexDocumentsQueue, endpoint, accessKeyId, secretAccessKey, region } = globalConfig.sqs;

    if (globalConfig.features.rag) {
      ok(documentsQueue, "SQS_DOCUMENTS_QUEUE must be configured");
      ok(indexDocumentsQueue, "SQS_INDEX_DOCUMENTS_QUEUE must be configured");
      this.outputQueueUrl = documentsQueue;
      this.indexQueueUrl = indexDocumentsQueue;
      this.documentQueueService = new DocumentQueueService(subscriptionsService);
    }

    // Initialize SQS client
    logger.info({ endpoint, accessKeyId, region }, "Initializing SQS client");
    this.sqs = new SQSClient({
      endpoint,
      region,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    });
  }

  async startup(): Promise<void> {
    if (!globalConfig.features.rag) {
      logger.warn("RAG not configured, skipping indexing SQS listener");
      return;
    }

    this.polling = true;
    this.startPolling();

    logger.info(`API SQS Service started, polling queue: ${this.indexQueueUrl}`);
  }

  async shutdown(): Promise<void> {
    if (!this.polling) return;
    this.sqs.destroy();
    this.polling = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
    }
    logger.info("API SQS Service stopped");
  }

  /**
   * Send an arbitrary JSON string message to the SQS queue
   */
  async sendMessage(
    messageBody: string,
    delaySeconds: number = 0,
    indexQueue: boolean = false
  ): Promise<string | undefined> {
    const queueUrl = indexQueue ? this.indexQueueUrl : this.outputQueueUrl;

    if (!queueUrl) {
      logger.warn(`SQS queue ${queueUrl} not configured, message not sent`);
      return;
    }
    if (!this.sqs) {
      throw new Error("SQS client not initialized.");
    }

    try {
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: messageBody,
        DelaySeconds: delaySeconds || undefined,
      });

      const result = await this.sqs.send(command);

      logger.info(
        {
          messageId: result.MessageId,
          md5: result.MD5OfMessageBody,
          messageLength: messageBody.length,
          delaySeconds,
        },
        "Sent SQS message"
      );

      return result.MessageId;
    } catch (error) {
      logger.error(error, "Failed to send SQS message");
      throw error;
    }
  }

  /**
   * Send a JSON object as a message to the SQS queue
   */
  async sendJsonMessage(
    message: any,
    delaySeconds: number = 0,
    indexQueue: boolean = false
  ): Promise<string | undefined> {
    const messageBody = JSON.stringify(message);
    return this.sendMessage(messageBody, delaySeconds, indexQueue);
  }

  /**
   * Send a delayed message (useful for retry logic)
   */
  async sendDelayedMessage(messageBody: string, delayMinutes: number): Promise<string | undefined> {
    const delaySeconds = Math.min(delayMinutes * 60, 900); // AWS SQS max delay is 15 minutes
    return this.sendMessage(messageBody, delaySeconds);
  }

  private startPolling(): void {
    if (!this.sqs || !this.polling) return;

    let failedRetries = 0;

    const poll = async () => {
      if (!this.polling || failedRetries > 10) {
        return;
      }

      const cmd = new ListQueuesCommand({
        MaxResults: 100,
      });

      try {
        const response = await this.sqs.send(cmd);
        logger.trace({ queues: response.QueueUrls }, "Fetched SQS queue list");

        if (!response.QueueUrls?.includes(this.indexQueueUrl)) {
          logger.info(`SQS queue ${this.indexQueueUrl} does not exist or is not accessible`);
          clearTimeout(this.pollInterval);
          this.pollInterval = setTimeout(poll, 3000);
          return;
        }
        if (!response.QueueUrls?.includes(this.outputQueueUrl)) {
          logger.info(`SQS processing queue ${this.outputQueueUrl} does not exist or is not accessible`);
          clearTimeout(this.pollInterval);
          this.pollInterval = setTimeout(poll, 3000);
          return;
        }

        const command = new ReceiveMessageCommand({
          QueueUrl: this.indexQueueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 15,
          VisibilityTimeout: 90,
          AttributeNames: ["All"],
        });

        const result = await this.sqs.send(command);
        const messages = result.Messages || [];

        for (const message of messages) {
          try {
            const handled = await this.handleMessage(message);

            // Delete message after successful processing
            if (handled) {
              await this.deleteMessage(message);
            }
          } catch (error) {
            logger.error(error, "Error processing message");
            // Message will become visible again after timeout
          }
        }

        failedRetries = 0; // Reset on success
      } catch (error) {
        logger.error(error, `Error polling SQS on ${this.indexQueueUrl}`);
        failedRetries++;
      }

      // Schedule next poll
      if (this.polling) {
        clearTimeout(this.pollInterval);
        this.pollInterval = setTimeout(poll, Math.min(1000, 100 * Math.pow(2, failedRetries)));
      }
    };

    // Start polling
    poll();
  }

  private async handleMessage(message: Message): Promise<boolean> {
    if (!message.Body) {
      logger.warn("Received message without body");
      return true;
    }

    try {
      const command = JSON.parse(message.Body);
      logger.info(`Processing SQS message: ${command.command} for document ${command.documentId}`);

      if (command.command === "index_document") {
        this.documentQueueService
          .handleIndexDocumentCommand(command)
          .then(() => this.deleteMessage(message))
          .catch((error: unknown) => {
            logger.error(error, `Failed to process index_document command for document ${command.documentId}`);
          });
        return false;
      }

      logger.info(`Skip command: ${command.command}`);
      return false;
    } catch (error) {
      logger.error(error, "Error handling SQS message");
      throw error;
    }
  }

  private async deleteMessage(message: Message) {
    const deleteCommand = new DeleteMessageCommand({
      QueueUrl: this.indexQueueUrl,
      ReceiptHandle: message.ReceiptHandle!,
    });
    await this.sqs.send(deleteCommand);
  }
}
