import { createLogger } from "@/utils/logger";
import { DocumentQueueService } from "./document-queue.service";
import {
  SQS_ACCESS_KEY_ID,
  SQS_DOCUMENTS_QUEUE,
  SQS_INDEX_DOCUMENTS_QUEUE,
  SQS_ENDPOINT,
  SQS_REGION,
  SQS_SECRET_ACCESS_KEY,
} from "@/config/application";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
  Message,
  ListQueuesCommand,
} from "@aws-sdk/client-sqs";
import { SubscriptionsService } from "./subscriptions.service";

const logger = createLogger(__filename);

export class SQSService {
  private sqs: SQSClient;
  private outputQueueUrl: string;
  private indexQueueUrl: string;
  private documentQueueService: DocumentQueueService;
  private polling = false;
  private pollInterval?: NodeJS.Timeout;

  constructor(subscriptionsService: SubscriptionsService) {
    this.outputQueueUrl = SQS_DOCUMENTS_QUEUE || "";
    this.indexQueueUrl = SQS_INDEX_DOCUMENTS_QUEUE || "";
    this.documentQueueService = new DocumentQueueService(subscriptionsService);

    // Initialize SQS client
    logger.info({ SQS_ENDPOINT, SQS_ACCESS_KEY_ID, SQS_REGION }, "Initializing SQS client");
    this.sqs = new SQSClient({
      endpoint: SQS_ENDPOINT || undefined,
      region: SQS_REGION || "us-east-1",
      credentials:
        SQS_ACCESS_KEY_ID && SQS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: SQS_ACCESS_KEY_ID,
              secretAccessKey: SQS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  async startup(): Promise<void> {
    if (!this.indexQueueUrl) {
      logger.warn("SQS_INDEX_DOCUMENTS_QUEUE not configured, skipping SQS listener");
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

    const poll = async () => {
      if (!this.polling) {
        return;
      }

      const cmd = new ListQueuesCommand({
        MaxResults: 100,
      });

      const response = await this.sqs.send(cmd);
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

      try {
        const command = new ReceiveMessageCommand({
          QueueUrl: this.indexQueueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 15,
          VisibilityTimeout: 90,
          AttributeNames: ["All"],
        });

        const result = await this.sqs!.send(command);
        const messages = result.Messages || [];

        logger.debug(`Got ${messages.length} messages from SQS`);

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
      } catch (error) {
        logger.error(error, `Error polling SQS on ${this.indexQueueUrl}`);
      }

      // Schedule next poll
      if (this.polling) {
        clearTimeout(this.pollInterval);
        this.pollInterval = setTimeout(poll, 100);
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
          .catch(error => {
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
