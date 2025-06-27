import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { PubSub } from "graphql-subscriptions";
import { In, MoreThan, MoreThanOrEqual, Repository } from "typeorm";
import type { WebSocket } from "ws";

import { Message } from "../entities/Message";
import { AIService } from "./ai.service";
import { NEW_MESSAGE } from "@/resolvers/message.resolver";
import { Chat, Model, User } from "@/entities";
import { CreateMessageInput } from "@/types/graphql/inputs";
import {
  InvokeModelParamsRequest,
  MessageRole,
  MessageType,
  ModelMessageContent,
  ModelResponseMetadata,
} from "@/types/ai.types";
import { notEmpty, ok } from "@/utils/assert";
import { getErrorMessage } from "@/utils/errors";
import { CONTEXT_MESSAGES_LIMIT, DEFAULT_PROMPT } from "@/config/ai";
import { createLogger } from "@/utils/logger";
import { getRepository } from "@/config/database";
import { IncomingMessage } from "http";
import { QueueService } from "./queue.service";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { S3Service } from "./s3.service";

const logger = createLogger(__filename);

export class MessagesService {
  private messageRepository: Repository<Message>;
  private chatRepository: Repository<Chat>;
  private modelRepository: Repository<Model>;

  private queueService: QueueService;
  private aiService: AIService;

  // one staticGraphQL PubSub instance for subscriptions
  private static pubSub = new PubSub();
  private static clients: WeakMap<WebSocket, string> = new WeakMap<WebSocket, string>();

  constructor() {
    this.queueService = new QueueService(MessagesService.pubSub);
    this.aiService = new AIService();
    this.messageRepository = getRepository(Message);
    this.chatRepository = getRepository(Chat);
    this.modelRepository = getRepository(Model);
  }

  public connectClient(socket: WebSocket, request: IncomingMessage, chatId: string) {
    const clientIp = request.headers["x-forwarded-for"] || request.socket.remoteAddress;
    logger.info({ chatId, clientIp }, "Client connected");

    MessagesService.clients.set(socket, chatId);
    setTimeout(() => {
      MessagesService.pubSub.publish(NEW_MESSAGE, { chatId, data: { type: MessageType.SYSTEM } });
    }, 300);

    this.queueService.connectClient(socket, chatId);
  }

  public disconnectClient(socket: WebSocket) {
    const chatId = MessagesService.clients.get(socket);
    MessagesService.clients.delete(socket);
    this.queueService.disconnectClient(socket, chatId);
  }

  public publishGraphQL(routingKey: string, payload: unknown) {
    MessagesService.pubSub.publish(routingKey, payload);
  }

  public subscribeGraphQL(routingKey: string, dynamicId: unknown): AsyncIterable<unknown> {
    return {
      [Symbol.asyncIterator]: () => MessagesService.pubSub.asyncIterator(routingKey),
    };
  }

  public async createMessage(input: CreateMessageInput, connection: ConnectionParams, user: User): Promise<Message> {
    const { chatId, images, modelId } = input;
    if (!chatId) throw new Error("Chat ID is required");
    if (!modelId) throw new Error("Model ID is required");
    const chat = await this.chatRepository.findOne({
      where: { id: chatId },
    });
    if (!chat) throw new Error("Chat not found");

    const model = await this.modelRepository.findOne({
      where: {
        modelId,
        user: { id: user.id }, // Ensure the model belongs to the user
      },
    });
    if (!model) throw new Error("Model not found");

    // Get previous messages for context
    const previousMessages = await this.messageRepository.find({
      where: { chatId },
      order: { createdAt: "DESC" },
      take: CONTEXT_MESSAGES_LIMIT,
    });

    // Save user message
    const userMessage = await this.publishUserMessage(input, user, chat, model, connection);
    const inputMessages = previousMessages.reverse();
    inputMessages.push(userMessage);

    // Generate AI response
    const assistantMessage = await this.messageRepository.save(
      this.messageRepository.create({
        content: "",
        role: MessageRole.ASSISTANT,
        modelId: model.modelId, // real model used
        modelName: model.name,
        chatId,
        user,
        chat,
      })
    );

    await this.publishAssistantMessage(input, connection, user, model, chat, inputMessages, assistantMessage);

    return userMessage;
  }

  public async switchMessageModel(
    messageId: string,
    modelId: string,
    connection: ConnectionParams,
    user: User
  ): Promise<Message> {
    // Find the original message
    let originalMessage = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ["chat", "chat.user", "user"],
    });

    if (!originalMessage) throw new Error("Message not found");
    if (!originalMessage.chat) throw new Error("Chat not found for this message");
    if (originalMessage.role === MessageRole.USER) throw new Error("User messages cannot be switched");
    // Verify the message belongs to the current user's chat
    if (originalMessage.chat.user?.id !== user.id) throw new Error("Unauthorized access to this message");

    const chat = originalMessage.chat;

    // Find the new model
    const model = await this.modelRepository.findOne({
      where: {
        modelId,
        user: { id: user.id },
      },
    });

    if (!model) throw new Error("Model not found or not accessible");

    // Get previous messages for context (up to the original message)
    const chatId = originalMessage.chatId || originalMessage.chat.id;
    const contextMessages = await this.messageRepository
      .createQueryBuilder("message")
      .where("message.chatId = :chatId", { chatId })
      .andWhere("message.createdAt <= :createdAt", { createdAt: originalMessage.createdAt })
      .andWhere("message.id <> :id", { id: originalMessage.id })
      .orderBy("message.createdAt", "ASC")
      .getMany();

    const files =
      originalMessage?.jsonContent
        ?.filter(content => content.fileName)
        .map(content => content.fileName)
        .filter(notEmpty) || [];

    await this.removeFiles(connection, files, chat, user);

    originalMessage.content = ""; // Clear content to indicate it's being regenerated
    originalMessage.modelId = model.modelId; // Update to the new model
    originalMessage.modelName = model.name; // Update model name
    originalMessage = await this.messageRepository.save(originalMessage);

    const input: CreateMessageInput = {
      chatId,
      content: "",
      modelId: model.modelId,
      role: MessageRole.ASSISTANT,
      temperature: chat.temperature,
      maxTokens: chat.maxTokens,
      topP: chat.topP,
    };

    const s3Service = new S3Service(user.toToken());

    // Call publishAssistantMessage to generate new response
    await this.publishAssistantMessage(input, connection, user, model, chat, contextMessages, originalMessage);

    return originalMessage;
  }

  public async deleteMessage(
    connection: ConnectionParams,
    id: string,
    deleteFollowing: boolean = false,
    user: User
  ): Promise<string[]> {
    const message = await this.messageRepository.findOne({
      where: { id },
      relations: ["chat"],
    });

    if (!message) throw new Error("Message not found");
    if (!message.chat) throw new Error("Chat not found for this message");

    const chatId = message.chatId;
    const chat = message.chat;

    // Get all file references that need to be removed
    const deletedImageFiles: string[] = [];

    // Process this message's images
    if (message.jsonContent?.length) {
      for (const content of message.jsonContent) {
        if (content.contentType === "image" && content.fileName) {
          deletedImageFiles.push(content.fileName);
        }
      }
    }

    // If deleteFollowing is true, find and delete all messages after this one
    const messagesToDelete = (
      deleteFollowing
        ? await this.messageRepository.find({
            where: {
              chatId,
              createdAt: MoreThanOrEqual(message.createdAt),
            },
          })
        : [
            message.role === MessageRole.USER
              ? // If the message is from the user, find the one next system or error message
                await this.messageRepository.findOne({
                  where: {
                    chatId,
                    createdAt: MoreThan(message.createdAt),
                    role: In([MessageRole.SYSTEM, MessageRole.ERROR]),
                  },
                  order: { createdAt: "ASC" },
                })
              : null,
          ]
    ).filter(notEmpty);

    const result: string[] = [message.id]; // Start with the original message ID
    if (messagesToDelete.length) {
      // Process each message to find image files
      for (const msg of messagesToDelete) {
        if (msg.jsonContent?.length) {
          for (const content of msg.jsonContent) {
            if (content.contentType === "image" && content.fileName) {
              deletedImageFiles.push(content.fileName);
            }
          }
        }

        // Delete the following message
        if (msg.id !== id) {
          // Skip the original message, we'll delete it separately
          result.push(msg.id);
          await this.messageRepository.remove(msg);
        }
      }
    }

    // Delete the original message
    await this.messageRepository.remove(message);

    // Remove image files from disk and update chat.files
    if (deletedImageFiles.length > 0) {
      await this.removeFiles(connection, deletedImageFiles, chat, user);
    }

    return result; // Return all deleted message IDs including the original
  }

  public async saveImageFromBase64(
    s3Service: S3Service,
    content: string,
    { chatId, messageId, index = 0 }: { chatId: string; messageId: string; index?: number }
  ): Promise<{ fileName: string; contentType: string }> {
    // Parse extension from base64 content if possible, default to .png
    const matches = content.match(/^data:image\/(\w+);base64,/);
    const type = matches ? `${matches[1]}` : "png";
    const fileName = `${chatId}-${messageId}-${index}.${type}`;
    const contentType = `image/${type}`;

    // Upload to S3
    await s3Service.uploadFile(content, fileName, contentType);

    // Return the file key
    return {
      fileName,
      contentType,
    };
  }

  protected async publishUserMessage(
    input: CreateMessageInput,
    user: User,
    chat: Chat,
    model: Model,
    connection: ConnectionParams
  ): Promise<Message> {
    const { images, role = MessageRole.USER } = input;
    let { content = "" } = input;

    let userMessage = await this.messageRepository
      .save({
        content,
        role,
        modelId: model.modelId, // real model used
        modelName: model.name,
        chatId: chat.id,
        user,
        chat,
      })
      .catch(err => {
        this.queueService.publishError(chat.id, getErrorMessage(err));
        throw err;
      });

    // Set chat isPristine to false when adding the first message
    if (chat.isPristine) {
      chat.isPristine = false;
      await this.chatRepository.save(chat);
    }

    let jsonContent: ModelMessageContent[] | undefined = undefined;

    // If there's an image, handle it
    if (images) {
      const s3Service = new S3Service(user.toToken());
      jsonContent = [];

      if (content) {
        jsonContent.push({ content, contentType: "text" });
      }

      for (let index = 0; index < images.length; ++index) {
        const image = images[index];
        const { fileName } = await this.saveImageFromBase64(s3Service, image.bytesBase64, {
          chatId: chat.id,
          messageId: userMessage.id,
          index,
        });

        jsonContent.push({
          content: image.bytesBase64,
          contentType: "image",
          fileName,
          mimeType: image.mimeType,
        });

        // For display purposes, append image markdown to the content
        content += `${content ? "\n\n" : ""}![Uploaded Image](${s3Service.getFileUrl(fileName)})`;
      }

      chat.files = [...(chat.files || []), ...images.map(img => img.fileName)];
      await this.chatRepository.save(chat);
    }

    // update message content
    userMessage.jsonContent = jsonContent;
    userMessage.content = content;
    userMessage = await this.messageRepository.save(userMessage).catch(err => {
      this.queueService.publishError(chat.id, getErrorMessage(err));
      throw err;
    });

    // Publish message to Queue
    await this.queueService.publishMessage(chat.id, userMessage);

    return userMessage;
  }

  protected async publishAssistantMessage(
    input: CreateMessageInput,
    connection: ConnectionParams,
    user: User,
    model: Model,
    chat: Chat,
    inputMessages: Message[],
    assistantMessage: Message
  ): Promise<void> {
    const systemPrompt = user.defaultSystemPrompt || DEFAULT_PROMPT;
    const request: InvokeModelParamsRequest = {
      modelId: model.modelId,
      systemPrompt,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      topP: input.topP,
    };

    const completeRequest = async (message: Message) => {
      ok(message);
      const savedMessage = await this.messageRepository.save(message);

      // Publish message to Queue
      await this.queueService.publishMessage(chat.id, savedMessage);
    };

    if (!model.supportsStreaming) {
      // sync call
      try {
        const aiResponse = await this.aiService.getCompletion(model.apiProvider, connection, request, inputMessages);

        if (aiResponse.type === "image") {
          const s3Service = new S3Service(user.toToken());
          // Save base64 image to S3
          const { fileName, contentType } = await this.saveImageFromBase64(s3Service, aiResponse.content, {
            chatId: chat.id,
            messageId: assistantMessage.id,
          });

          assistantMessage.content = `![Generated Image](${s3Service.getFileUrl(fileName)})`;
          assistantMessage.jsonContent = [
            {
              content: aiResponse.content,
              contentType: "image",
              fileName,
              mimeType: contentType,
            },
          ];

          chat.files = [...(chat.files || []), fileName];
          await this.chatRepository.save(chat);
        } else {
          assistantMessage.content = aiResponse.content;
        }

        await completeRequest(assistantMessage);
      } catch (error: unknown) {
        logger.error(error, "Error generating AI response");

        logger.debug(`Publishing AI response event for chat ${chat.id}`);
        assistantMessage.content = getErrorMessage(error);
        assistantMessage.role = MessageRole.ERROR;

        await completeRequest(assistantMessage).catch(err => {
          this.queueService.publishError(chat.id, getErrorMessage(err));
          logger.error(err, "Error sending AI response");
        });
      }

      return;
    }

    const handleStreaming = async (
      token: string,
      completed?: boolean,
      error?: Error,
      metadata?: ModelResponseMetadata
    ) => {
      if (completed) {
        if (error) {
          return completeRequest({
            ...assistantMessage,
            content: getErrorMessage(error),
            role: MessageRole.ERROR,
          }).catch(err => logger.error(err, "Error sending AI response"));
        }

        assistantMessage.content = token;
        assistantMessage.metadata = metadata;

        completeRequest(assistantMessage).catch(err => {
          this.queueService.publishError(chat.id, getErrorMessage(err));
          logger.error(err, "Error sending AI response");
        });

        // stream token
      } else {
        assistantMessage.content += token;
        await this.queueService.publishMessage(chat.id, assistantMessage, true);
      }
    };

    this.aiService.streamCompletion(model.apiProvider, connection, request, inputMessages, handleStreaming);
  }

  protected async removeFiles(
    connection: ConnectionParams,
    deletedImageFiles: string[],
    chat: Chat,
    user: User
  ): Promise<void> {
    if (!deletedImageFiles || deletedImageFiles.length === 0) return;

    let s3Service = new S3Service(user.toToken());

    // Remove the files from the chat.files array
    if (chat.files?.length) {
      chat.files = chat.files.filter(file => !deletedImageFiles.includes(file));
      await this.chatRepository.save(chat);
    }

    // Delete the files from S3
    // TODO: move this to a background job
    await Promise.all(
      deletedImageFiles.map(async fileName => {
        try {
          await s3Service.deleteFile(fileName);
        } catch (error) {
          logger.error(`Failed to delete file ${fileName}: ${error}`);
        }
      })
    );
  }
}
