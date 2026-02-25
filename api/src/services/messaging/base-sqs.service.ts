import { createLogger } from "@/utils/logger";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
  Message,
  ListQueuesCommand,
} from "@aws-sdk/client-sqs";
import { globalConfig } from "@/global-config";

const logger = createLogger(__filename);

export interface SqsPollingOptions {
  maxNumberOfMessages?: number;
  waitTimeSeconds?: number;
  visibilityTimeout?: number;
}

export abstract class BaseSqsService {
  protected sqs?: SQSClient;
  private polling = false;
  private pollInterval?: NodeJS.Timeout;

  constructor(protected readonly pollingOptions: SqsPollingOptions = {}) {}

  protected abstract get pollQueueUrl(): string;
  protected abstract handleMessage(message: Message): Promise<boolean>;

  /**
   * Override to require additional queue URLs to be accessible before polling starts.
   * Defaults to [pollQueueUrl].
   */
  protected getRequiredQueueUrls(): string[] {
    return [this.pollQueueUrl];
  }

  /**
   * Initializes the SQS client and starts polling.
   * Call this from the subclass startup() after verifying configuration.
   */
  protected async startSqs(): Promise<void> {
    const { endpoint, accessKeyId, secretAccessKey, region } = globalConfig.sqs;

    this.sqs = new SQSClient({
      endpoint,
      region,
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });

    this.polling = true;
    this.startPolling();
  }

  async shutdown(): Promise<void> {
    if (!this.polling) return;
    this.sqs?.destroy();
    this.polling = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
    }
    logger.info(`${this.constructor.name} stopped`);
  }

  protected async sendMessage(
    messageBody: string,
    queueUrl: string,
    delaySeconds: number = 0
  ): Promise<string | undefined> {
    if (!this.sqs) {
      throw new Error(`${this.constructor.name} SQS client was not started.`);
    }

    try {
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: messageBody,
        DelaySeconds: delaySeconds || undefined,
      });

      const result = await this.sqs.send(command);

      logger.debug(
        {
          messageId: result.MessageId,
          md5: result.MD5OfMessageBody,
          messageLength: messageBody.length,
          delaySeconds,
        },
        `Sent ${this.constructor.name} SQS message`
      );

      return result.MessageId;
    } catch (error) {
      logger.error(error, `Failed to send ${this.constructor.name} SQS message`);
      throw error;
    }
  }

  protected async deleteMessage(message: Message, queueUrl?: string): Promise<void> {
    const url = queueUrl ?? this.pollQueueUrl;
    try {
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: url,
        ReceiptHandle: message.ReceiptHandle!,
      });
      await this.sqs!.send(deleteCommand);
    } catch (error) {
      logger.warn(
        error,
        `Failed to delete ${this.constructor.name} SQS message with ReceiptHandle ${message.ReceiptHandle}`
      );
    }
  }

  private startPolling(): void {
    if (!this.sqs || !this.polling) return;

    let failedRetries = 0;

    const poll = async () => {
      if (!this.polling || failedRetries > 10) {
        return;
      }

      const listCmd = new ListQueuesCommand({ MaxResults: 100 });

      try {
        const response = await this.sqs!.send(listCmd);

        for (const url of this.getRequiredQueueUrls()) {
          if (!response.QueueUrls?.includes(url)) {
            logger.info(`SQS queue ${url} does not exist or is not accessible`);
            clearTimeout(this.pollInterval);
            this.pollInterval = setTimeout(poll, 3000);
            return;
          }
        }

        const receiveCmd = new ReceiveMessageCommand({
          QueueUrl: this.pollQueueUrl,
          MaxNumberOfMessages: this.pollingOptions.maxNumberOfMessages ?? 5,
          WaitTimeSeconds: this.pollingOptions.waitTimeSeconds ?? 15,
          VisibilityTimeout: this.pollingOptions.visibilityTimeout ?? 15,
          AttributeNames: ["All"],
        });

        const result = await this.sqs!.send(receiveCmd);
        const messages = result.Messages || [];

        await Promise.all(
          messages.map(message =>
            this.handleMessage(message)
              .then(handled => {
                if (handled) {
                  return this.deleteMessage(message);
                }
              })
              .catch(error => {
                logger.error(error, `Error processing ${this.constructor.name} SQS message`);
              })
          )
        );

        failedRetries = 0;
      } catch (error) {
        logger.error(error, `Error polling ${this.constructor.name} SQS on ${this.pollQueueUrl}`);
        failedRetries++;
      }

      if (this.polling) {
        clearTimeout(this.pollInterval);
        this.pollInterval = setTimeout(poll, failedRetries ? 100 * Math.pow(2, failedRetries) : 30);
      }
    };

    poll();
  }
}
