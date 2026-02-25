import { createLogger } from "@/utils/logger";
import { Message as SQSMessage } from "@aws-sdk/client-sqs";
import { globalConfig } from "@/global-config";
import { getRepository } from "@/config/database";
import { Message } from "@/entities/Message";
import { Repository } from "typeorm";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { TokenPayload } from "@/utils/jwt";
import { CreateMessageRequest } from "@/types/ai.types";
import { ok } from "@/utils/assert";
import { User } from "@/entities";
import { BaseSqsService } from "./base-sqs.service";

const logger = createLogger(__filename);

export const COMMAND_CONTINUE_REQUEST = "continue_request";

export interface RequestQueuePayload {
  input: CreateMessageRequest;
  modelId: string;
  message: Message;
  userToken: TokenPayload;
  connection: ConnectionParams;
  requestId: string;
  lastSequenceNumber?: number;
}

export interface QueueCommand {
  command: string;
  expiration: number;
  payload: RequestQueuePayload;
}

export type QueueCommandCallback = (
  payload: RequestQueuePayload,
  user: User,
  cleanupMessage: () => Promise<void>,
  expired?: boolean
) => Promise<void>;

export class RequestsSqsService extends BaseSqsService {
  private queueUrl?: string;
  private userRepository: Repository<User> = getRepository(User);

  private handlers: Record<string, QueueCommandCallback[]> = {};

  constructor() {
    super({
      maxNumberOfMessages: globalConfig.sqs.requestsQueueMaxMessagesCount,
      waitTimeSeconds: globalConfig.sqs.requestsQueueWaitTimeSec,
      visibilityTimeout: globalConfig.sqs.requestsQueueVisibilityTimeoutSec,
    });

    this.queueUrl = globalConfig.sqs.requestsQueue;
    this.userRepository = getRepository(User);
  }

  protected get pollQueueUrl(): string {
    return this.queueUrl!;
  }

  subscribe(command: string, callback: QueueCommandCallback) {
    if (!this.handlers[command]) {
      this.handlers[command] = [];
    }
    this.handlers[command].push(callback);
  }

  isConfigured(): boolean {
    return !!this.queueUrl && !!this.sqs;
  }

  async startup(): Promise<void> {
    if (!this.queueUrl) {
      logger.warn("SQS_REQUESTS_QUEUE not configured, skipping requests SQS listener");
      return;
    }

    await this.startSqs();
    logger.info(`Requests SQS Service started, polling queue: ${this.queueUrl}`);
  }

  async shutdown(): Promise<void> {
    this.handlers = {};
    await super.shutdown();
  }

  async enqueueRequest(
    payload: RequestQueuePayload,
    delayMs?: number,
    command: string = COMMAND_CONTINUE_REQUEST,
    expirationSec?: number
  ): Promise<string | undefined> {
    if (!this.queueUrl) {
      throw new Error("Requests SQS client was not started.");
    }

    if (delayMs === undefined) {
      delayMs = globalConfig.sqs.requestsRetrySubsequentDelayMs;
    }
    if (expirationSec === undefined) {
      expirationSec = globalConfig.sqs.requestsExpirationSec;
    }

    const now = new Date();
    const expiration = now.setSeconds(now.getSeconds() + expirationSec);
    const messageBody = JSON.stringify({
      command,
      expiration,
      payload,
    });

    const messageId = await this.sendMessage(messageBody, this.queueUrl, Math.floor(delayMs / 1000));
    return messageId;
  }

  protected async handleMessage(sqsMessage: SQSMessage): Promise<boolean> {
    if (!sqsMessage.Body) {
      logger.warn("Received Requests SQS message without body");
      return true;
    }

    try {
      const cmd = JSON.parse(sqsMessage.Body) as QueueCommand;
      ok(cmd.payload, "Invalid message payload");
      ok(cmd.payload.message, "Missing message in payload");

      const expired = cmd.expiration ? new Date(cmd.expiration) < new Date() : false;
      if (expired) {
        logger.debug(
          { command: cmd.command, messageId: cmd.payload.message.id },
          "Skipping expired Requests SQS message"
        );
        await this.deleteMessage(sqsMessage);
      }

      await this.processRequest(cmd, () => (expired ? Promise.resolve() : this.deleteMessage(sqsMessage))).catch(
        (error: unknown) => {
          logger.error(error, `Failed to process process_request command for message ${cmd.payload.message.id}`);
        }
      );
      return false; // deletion handled inside processRequest chain
    } catch (error) {
      logger.error(error, "Error handling Requests SQS message");
      throw error;
    }
  }

  private async processRequest(cmd: QueueCommand, cleanupMessage: () => Promise<void>): Promise<void> {
    const handlers = this.handlers[cmd.command] || [];
    if (handlers.length === 0) {
      return logger.warn(`No handlers registered for command ${cmd.command}`);
    }

    const expired = cmd.expiration ? new Date(cmd.expiration) < new Date() : false;
    const user = await this.userRepository.findOne({ where: { id: cmd.payload.userToken.userId } });
    if (!user) {
      return logger.error(`User not found for Requests SQS message, userId: ${cmd.payload.userToken.userId}`);
    }

    await Promise.all(handlers.map(async handler => handler(cmd.payload, user, cleanupMessage, expired)));
  }
}
