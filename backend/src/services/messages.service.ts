import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { PubSub } from "graphql-subscriptions";
import { In, MoreThan, Repository } from "typeorm";
import type { WebSocket } from "ws";

import { Message, MessageRole, MessageType } from "../entities/Message";
import { AIService } from "./ai.service";
import { NEW_MESSAGE } from "@/resolvers/message.resolver";
import { Chat, Model, User } from "@/entities";
import { CreateMessageInput } from "@/types/graphql/inputs";
import { ModelMessageContent } from "@/types/ai.types";
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
    // Initialize S3 service with connection params
    const s3Service = new S3Service(connection);
    const { chatId, modelId, images, role = MessageRole.USER } = input;
    let { content = "" } = input;

    if (!chatId) throw new Error("Chat ID is required");
    if (!modelId) throw new Error("Model ID is required");

    const chat = await this.chatRepository.findOne({
      where: { id: chatId },
    });
    if (!chat) throw new Error("Chat not found");

    // Verify the model exists
    logger.debug(`Fetching model with ID: ${modelId} for user ${user.id}`);

    const model = await this.modelRepository.findOne({
      where: {
        modelId,
        user: { id: user.id }, // Ensure the model belongs to the user
      },
    });
    if (!model) throw new Error("Model not found");

    // Create and save user message
    let message = await this.messageRepository
      .save({
        content,
        role,
        modelId: model.modelId, // real model used
        modelName: model.name,
        chatId,
        user,
        chat,
      })
      .catch(err => {
        this.queueService.publishError(chatId, getErrorMessage(err));
        throw err;
      });

    let jsonContent: ModelMessageContent[] | undefined = undefined;

    // If there's an image, handle it
    if (images) {
      jsonContent = [];

      if (content) {
        jsonContent.push({
          content,
          contentType: "text",
        });
      }

      for (let index = 0; index < images.length; ++index) {
        const image = images[index];
        const imageFile = await this.saveImageFromBase64(s3Service, image.bytesBase64, {
          chatId: chat.id,
          messageId: message.id,
          isInput: true,
          index,
        });

        jsonContent.push({
          content: image.bytesBase64,
          contentType: "image",
          fileName: imageFile,
          mimeType: image.mimeType,
        });

        // For display purposes, append image markdown to the content
        content += `${content ? "\n\n" : ""}![Uploaded Image](${s3Service.getFileUrl(imageFile)})`;
      }

      chat.files = [...(chat.files || []), ...images.map(img => img.fileName)];
      await this.chatRepository.save(chat);
    }

    // update message content
    message.jsonContent = jsonContent;
    message.content = content;
    message = await this.messageRepository.save(message).catch(err => {
      this.queueService.publishError(chatId, getErrorMessage(err));
      throw err;
    });

    // Set chat isPristine to false when adding the first message
    if (chat.isPristine) {
      chat.isPristine = false;
      await this.chatRepository.save(chat);
    }

    // Publish message to Queue
    await this.queueService.publishMessage(chatId, message);

    // Get previous messages for context
    const previousMessages = await this.messageRepository.find({
      where: { chatId },
      order: { createdAt: "DESC" },
      take: CONTEXT_MESSAGES_LIMIT,
    });

    // Generate AI response
    const requestMessages = previousMessages.reverse();
    const systemPrompt = user.defaultSystemPrompt || DEFAULT_PROMPT;

    const completeRequest = async (aiMessage: Message) => {
      ok(aiMessage);
      const savedMessage = await this.messageRepository.save(aiMessage);

      // Publish message to Queue
      await this.queueService.publishMessage(chatId, savedMessage);
    };

    const request = {
      messages: [],
      modelId: model.modelId,
      systemPrompt,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      topP: input.topP,
    };

    if (model.supportsStreaming) {
      const aiMessage = await this.messageRepository.save(
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

      const handleStreaming = async (token: string, completed?: boolean, error?: Error) => {
        if (completed) {
          if (error) {
            completeRequest({
              ...aiMessage,
              content: getErrorMessage(error),
              role: MessageRole.ERROR,
            }).catch(err => logger.error(err, "Error sending AI response"));
            return;
          }

          aiMessage.content = token;
          completeRequest(aiMessage).catch(err => {
            this.queueService.publishError(chatId, getErrorMessage(err));
            logger.error(err, "Error sending AI response");
          });

          // stream token
        } else {
          aiMessage.content += token;
          await this.queueService.publishMessage(chatId, aiMessage, true);
        }
      };

      this.aiService.streamCompletion(model.apiProvider, connection, request, requestMessages, handleStreaming);

      return message;
    }

    // sync call
    try {
      const aiResponse = await this.aiService.getCompletion(model.apiProvider, connection, request, requestMessages);
      let content = aiResponse.content;
      if (aiResponse.type === "image") {
        // Save base64 image to S3
        const fileName = await this.saveImageFromBase64(s3Service, aiResponse.content, {
          chatId: chat.id,
          messageId: message.id,
          isInput: false,
        });
        content = `![Generated Image](${s3Service.getFileUrl(fileName)})`;

        chat.files = [...(chat.files || []), fileName];
        await this.chatRepository.save(chat);
      }

      const aiMessage = await this.messageRepository.save(
        this.messageRepository.create({
          content,
          role: MessageRole.ASSISTANT,
          modelId: model.modelId, // real model used
          modelName: model.name,
          chatId,
          user,
          chat,
        })
      );

      await completeRequest(aiMessage);
    } catch (error: unknown) {
      logger.error(error, "Error generating AI response");

      logger.debug(`Publishing AI response event for chat ${chatId}`);
      const errorChatMessage = await this.messageRepository.save(
        this.messageRepository.create({
          content: getErrorMessage(error),
          role: MessageRole.ERROR,
          modelId: model.modelId, // real model used
          modelName: model.name,
          chatId,
          user,
        })
      );

      completeRequest(errorChatMessage).catch(err => {
        this.queueService.publishError(chatId, getErrorMessage(err));
        logger.error(err, "Error sending AI response");
      });
    }

    return message;
  }

  public async deleteMessage(
    connection: ConnectionParams,
    id: string,
    deleteFollowing: boolean = false
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
              createdAt: MoreThan(message.createdAt),
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
      let s3Service = new S3Service(connection);

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

    return result; // Return all deleted message IDs including the original
  }

  public async saveImageFromBase64(
    s3Service: S3Service,
    content: string,
    { chatId, messageId, isInput, index = 0 }: { chatId: string; messageId: string; isInput: boolean; index?: number }
  ): Promise<string> {
    // Parse extension from base64 content if possible, default to .png
    const matches = content.match(/^data:image\/(\w+);base64,/);
    const ext = matches ? `.${matches[1]}` : ".png";

    // Create key in format: <chat_id>-<message_id>-in-<index>.<ext> for user uploads
    // or <chat_id>-<message_id>-out-<index>.<ext> for generated files
    const fileType = isInput ? "in" : "out";
    const key = `${chatId}-${messageId}-${fileType}-${index}${ext}`;

    // Upload to S3
    await s3Service.uploadFile(content, key);

    // Return the file key
    return key;
  }
}
