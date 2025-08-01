import { PubSub } from "graphql-subscriptions";
import { In, IsNull, MoreThanOrEqual, Not, Repository } from "typeorm";
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
import { formatDateFloor, getRepository } from "@/config/database";
import { IncomingMessage } from "http";
import { QueueService } from "./queue.service";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { S3Service } from "./s3.service";
import { DeleteMessageResponse } from "@/types/graphql/responses";

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
    logger.debug({ chatId, clientIp }, "Client connected");

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
    const { chatId, modelId } = input;
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
    const inputMessages = await this.getContextMessages(chatId);

    // Save user message
    const userMessage = await this.publishUserMessage(input, user, chat, model, connection);
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
    const chatId = chat.id;

    const contextMessages = await this.getContextMessages(chatId, originalMessage);
    const files =
      originalMessage?.jsonContent
        ?.filter(content => content.fileName)
        .map(content => content.fileName)
        .filter(notEmpty) || [];

    await this.removeFiles(files, user, chat);

    originalMessage.content = ""; // Clear content to indicate it's being regenerated
    originalMessage.modelId = model.modelId; // Update to the new model
    originalMessage.modelName = model.name; // Update model name
    originalMessage = await this.messageRepository.save(originalMessage);

    const input: CreateMessageInput = {
      chatId,
      content: "",
      modelId: model.modelId,
      temperature: chat.temperature,
      maxTokens: chat.maxTokens,
      topP: chat.topP,
    };

    // Call publishAssistantMessage to generate new response
    await this.publishAssistantMessage(input, connection, user, model, chat, contextMessages, originalMessage);

    return originalMessage;
  }

  public async editMessage(
    messageId: string,
    newContent: string,
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
    if (originalMessage.role !== MessageRole.USER) throw new Error("Only user messages can be edited");
    // Verify the message belongs to the current user's chat
    if (originalMessage.user?.id !== user.id) throw new Error("Unauthorized access to this message");
    const chat = originalMessage.chat;
    const chatId = chat.id;

    // Delete all messages after this one in the chat
    const messagesToDelete = await this.messageRepository.findBy({
      chatId,
      createdAt: MoreThanOrEqual(formatDateFloor(originalMessage.createdAt)),
      id: Not(originalMessage.id),
    });

    // Remove any files from following messages before deleting them
    const deletedImageFiles: string[] = [];
    for (const msg of messagesToDelete) {
      if (msg.jsonContent?.length) {
        for (const content of msg.jsonContent) {
          if (content.contentType === "image" && content.fileName) {
            deletedImageFiles.push(content.fileName);
          }
        }
      }
      await this.messageRepository.remove(msg);
    }

    // Remove image files if any
    if (deletedImageFiles.length > 0) {
      await this.removeFiles(deletedImageFiles, user, chat);
    }

    // Update the original message with new content
    originalMessage.content = newContent.trim();
    originalMessage.jsonContent = undefined; // Clear jsonContent to regenerate it
    originalMessage = await this.messageRepository.save(originalMessage);

    // Find the model for the chat
    const model = await this.modelRepository.findOne({
      where: {
        modelId: chat.modelId || user.defaultModelId,
        user: { id: user.id },
      },
    });

    if (!model) throw new Error("Model not found for this chat");

    // Get context messages (up to the edited message, excluding it)
    const contextMessages = await this.getContextMessages(chatId, originalMessage);

    // Create new assistant message
    const assistantMessage = await this.messageRepository
      .save({
        content: "",
        role: MessageRole.ASSISTANT,
        modelId: model.modelId,
        modelName: model.name,
        chatId,
        chat,
      })
      .catch(err => {
        this.queueService.publishError(chat.id, getErrorMessage(err));
        throw err;
      });

    const input: CreateMessageInput = {
      chatId,
      content: "",
      modelId: model.modelId,
      temperature: chat.temperature,
      maxTokens: chat.maxTokens,
      topP: chat.topP,
    };

    // Add the edited user message to context
    contextMessages.push(originalMessage);

    // Generate new assistant response
    await this.publishAssistantMessage(input, connection, user, model, chat, contextMessages, assistantMessage);

    return originalMessage;
  }

  public async callOtherModel(
    messageId: string,
    modelId: string,
    connection: ConnectionParams,
    user: User
  ): Promise<Message> {
    // Find the original message
    const originalMessage = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ["chat", "chat.user", "user"],
    });

    if (!originalMessage) throw new Error("Message not found");
    if (!originalMessage.chat) throw new Error("Chat not found for this message");
    if (originalMessage.role === MessageRole.USER) throw new Error("User messages cannot be used for calling others");

    const chat = originalMessage.chat;
    const chatId = originalMessage.chatId || originalMessage.chat.id;

    // Get valid models for the user
    const model = await this.modelRepository.findOne({
      where: {
        modelId,
        user: { id: user.id }, // Ensure the model belongs to the user
      },
    });
    if (!model) throw new Error("Model not found");

    // Get previous messages for context (up to the original message)
    const contextMessages = await this.messageRepository
      .createQueryBuilder("message")
      .where("message.chatId = :chatId", { chatId })
      .andWhere("message.createdAt <= :createdAt", { createdAt: formatDateFloor(originalMessage.createdAt) })
      .andWhere("message.id <> :id", { id: originalMessage.id })
      .andWhere("message.linkedToMessageId IS NULL") // Only include main messages, not linked ones
      .orderBy("message.createdAt", "ASC")
      .getMany();

    let linkedMessage = await this.messageRepository
      .save({
        content: "",
        role: MessageRole.ASSISTANT,
        modelId: model.modelId,
        modelName: model.name,
        chatId: chat.id,
        linkedToMessageId: originalMessage.id, // Link to the original message
        user,
        chat,
      })
      .catch(err => {
        this.queueService.publishError(chat.id, getErrorMessage(err));
        throw err;
      });

    const input: CreateMessageInput = {
      chatId,
      content: "",
      modelId: model.modelId,
      temperature: chat.temperature,
      maxTokens: chat.maxTokens,
      topP: chat.topP,
    };

    await this.publishAssistantMessage(input, connection, user, model, chat, contextMessages, linkedMessage);
    return linkedMessage;
  }

  /**
   * Delete message from chat
   * @param connection Connection parameters
   * @param id Message ID to delete
   * @param deleteFollowing Whether to delete following messages
   * @param user User requesting the deletion
   * @returns Array of deleted message IDs
   */
  public async deleteMessage(
    connection: ConnectionParams,
    id: string,
    deleteFollowing: boolean = false,
    user: User
  ): Promise<DeleteMessageResponse> {
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
              createdAt: MoreThanOrEqual(formatDateFloor(message.createdAt)),
              id: Not(id), // Exclude the original message itself
              linkedToMessageId: IsNull(), // Only main messages, not linked ones
            },
            order: { createdAt: "ASC" },
          })
        : [
            message.role === MessageRole.USER
              ? // If the message is from the user, find the one next system or error message
                await this.messageRepository.findOne({
                  where: {
                    chatId,
                    createdAt: MoreThanOrEqual(formatDateFloor(message.createdAt)),
                    role: In([MessageRole.SYSTEM, MessageRole.ERROR]),
                  },
                  order: { createdAt: "ASC" },
                })
              : null,
          ]
    ).filter(notEmpty);

    const result: DeleteMessageResponse = {
      messages: [
        {
          id: message.id,
          linkedToMessageId: message.linkedToMessageId,
        },
      ],
    }; // Start with the original message ID

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
          result.messages.push({ id: msg.id });
          await this.messageRepository.remove(msg);
        }
      }
    }

    // Delete the original message
    await this.messageRepository.remove(message);

    // Remove image files from disk and update chat.files
    if (deletedImageFiles.length > 0) {
      await this.removeFiles(deletedImageFiles, user, chat);
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
    const { images } = input;
    let { content = "" } = input;

    let userMessage = await this.messageRepository
      .save({
        content,
        role: MessageRole.USER,
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
    }

    chat.updatedAt = new Date();
    await this.chatRepository.save(chat);

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

    this.aiService
      .streamCompletion(model.apiProvider, connection, request, inputMessages, handleStreaming)
      .catch((error: unknown) => {
        logger.error(error, "Error streaming AI response");
        return completeRequest({
          ...assistantMessage,
          content: getErrorMessage(error),
          role: MessageRole.ERROR,
        }).catch(err => logger.error(err, "Error sending AI response"));
      });
  }

  public async removeFiles(deletedImageFiles: string[], user: User, chat?: Chat): Promise<void> {
    if (!deletedImageFiles || deletedImageFiles.length === 0) return;

    let s3Service = new S3Service(user.toToken());

    // Remove the files from the chat.files array
    if (chat?.files?.length) {
      chat.files = chat.files.filter(file => !deletedImageFiles.includes(file));
      await this.chatRepository.save(chat);
    }

    // Delete the files from S3
    // TODO: move this to background task
    const batches = deletedImageFiles.reduce(
      (acc: string[][], file: string) => {
        const batch = acc[acc.length - 1];
        if (batch.length < 5) {
          batch.push(file);
        } else {
          acc.push([file]);
        }

        return acc;
      },
      [[]]
    );

    const promises = batches.map(batch => {
      return Promise.allSettled(
        batch.map(file => {
          return s3Service.deleteFile(file).catch(error => {
            logger.error(`Failed to delete file ${file}: ${error}`);
          });
        })
      );
    });

    return Promise.all(promises).then(() => void 0);
  }

  protected async getContextMessages(chatId: string, currentMessage?: Message) {
    // Get previous messages for context (up to the original message)
    let query = this.messageRepository.createQueryBuilder("message").where("message.chatId = :chatId", { chatId });

    if (currentMessage) {
      query = query
        .andWhere("message.createdAt <= :createdAt", { createdAt: formatDateFloor(currentMessage.createdAt) })
        .andWhere("message.id <> :id", { id: currentMessage.id });
    }

    return await query.orderBy("message.createdAt", "DESC").take(CONTEXT_MESSAGES_LIMIT).getMany();
  }
}
