import { PubSub } from "graphql-subscriptions";
import { In, IsNull, MoreThanOrEqual, Not, Repository } from "typeorm";
import type { WebSocket } from "ws";

import { Message } from "../entities/Message";
import { AIService } from "./ai/ai.service";
import { Chat, DocumentChunk, Model, User } from "@/entities";
import { CreateMessageInput, ImageInput } from "@/types/graphql/inputs";
import {
  ChatResponseStatus,
  CompleteChatRequest,
  MessageMetadata,
  MessageRole,
  MessageType,
  ModelMessageContent,
  ModelMessageContentImage,
  ModelResponse,
  ModelType,
  ResponseStatus,
} from "@/types/ai.types";
import { notEmpty, ok } from "@/utils/assert";
import { getErrorMessage } from "@/utils/errors";
import { createLogger } from "@/utils/logger";
import { formatDateCeil, formatDateFloor, getRepository } from "@/config/database";
import { IncomingMessage } from "http";
import { CHAT_MESSAGES_CHANNEL, NEW_MESSAGE, SubscriptionsService } from "./messaging";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { S3Service } from "./data";
import { DeleteMessageResponse } from "@/types/graphql/responses";
import { EmbeddingsService } from "./ai/embeddings.service";
import { DEFAULT_CHAT_PROMPT, PROMPT_CHAT_TITLE, RAG_REQUEST, RagResponse } from "@/config/ai/prompts";
import {
  CONTEXT_MESSAGES_LIMIT,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  DEFAULT_TOP_P,
  RAG_LOAD_FULL_PAGES,
  RAG_QUERY_CHUNKS_LIMIT,
} from "@/config/ai/common";

const logger = createLogger(__filename);

const MIN_STREAMING_UPDATE_MS = 30; // Minimum interval between streaming updates

export interface CreateMessageRequest {
  chatId: string;
  modelId: string;
  content: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  imagesCount: number;
  systemPrompt?: string;
  images?: ImageInput[];
  documentIds?: string[];
}

export class MessagesService {
  private static clients: WeakMap<WebSocket, string> = new WeakMap<WebSocket, string>();

  private messageRepository: Repository<Message>;
  private chatRepository: Repository<Chat>;
  private modelRepository: Repository<Model>;

  private subscriptionsService: SubscriptionsService;
  private aiService: AIService;
  private embeddingsService: EmbeddingsService;
  private cancelledMessages: Set<string> = new Set<string>();

  constructor(subscriptionsService: SubscriptionsService) {
    this.subscriptionsService = subscriptionsService;
    this.aiService = new AIService();
    this.embeddingsService = new EmbeddingsService();
    this.messageRepository = getRepository(Message);
    this.chatRepository = getRepository(Chat);
    this.modelRepository = getRepository(Model);

    subscriptionsService.on(CHAT_MESSAGES_CHANNEL, this.handleMessageEvent.bind(this));
  }

  public connectClient(socket: WebSocket, request: IncomingMessage, chatId: string) {
    const clientIp = request.headers["x-forwarded-for"] || request.socket.remoteAddress;
    logger.trace({ chatId, clientIp }, "Client connected");

    MessagesService.clients.set(socket, chatId);
    setTimeout(() => {
      SubscriptionsService.pubSub.publish(NEW_MESSAGE, { chatId, data: { type: MessageType.SYSTEM } });
    }, 300);
  }

  public disconnectClient(socket: WebSocket) {
    const chatId = MessagesService.clients.get(socket);
    if (chatId) {
      MessagesService.clients.delete(socket);
    }
  }

  public publishGraphQL(routingKey: string, payload: unknown) {
    SubscriptionsService.pubSub.publish(routingKey, payload);
  }

  public subscribeGraphQL(routingKey: string, dynamicId: unknown): AsyncIterable<unknown> {
    return {
      [Symbol.asyncIterator]: () => SubscriptionsService.pubSub.asyncIterator(routingKey),
    };
  }

  protected async handleMessageEvent(data: { message: Message; streaming: boolean }) {
    const { message } = data;

    if (message?.status === ResponseStatus.CANCELLED) {
      this.cancelledMessages.add(message.id);
    }
  }

  public async createMessage(input: CreateMessageInput, connection: ConnectionParams, user: User): Promise<Message> {
    const { chatId, documentIds } = input;
    if (!chatId) throw new Error("Chat ID is required");
    const chat = await this.chatRepository.findOne({
      where: { id: chatId },
    });
    if (!chat) throw new Error("Chat not found");

    const modelId = chat.modelId || user.defaultModelId;
    if (!modelId) throw new Error("Model must be defined for the chat or user");

    const request: CreateMessageRequest = this.formatMessageRequest(modelId, input.content, chat, user);
    const model = await this.modelRepository.findOne({
      where: {
        modelId,
        user: { id: user.id }, // Ensure the model belongs to the user
      },
    });
    if (!model) throw new Error("Model not found");

    let assistantMessage = this.messageRepository.create({
      content: "",
      role: MessageRole.ASSISTANT,
      modelId: model.modelId, // real model used
      modelName: model.name,
      chatId,
      user,
      chat,
    });

    if (documentIds && documentIds.length > 0) {
      const userMessage = await this.publishUserMessage(input, user, chat, model, { documentIds });

      const ragMessage = await this.messageRepository.save(assistantMessage);
      await this.publishRagMessage(
        {
          ...request,
          documentIds,
        },
        connection,
        model,
        chat,
        userMessage,
        ragMessage
      );

      return userMessage;
    }

    // Save user message
    const userMessage = await this.publishUserMessage(input, user, chat, model);
    // Get previous messages for context
    const inputMessages = await this.getContextMessages(chatId, userMessage);
    inputMessages.push(userMessage);

    // Generate AI response
    assistantMessage = await this.messageRepository.save(assistantMessage);
    await this.publishAssistantMessage(request, connection, user, model, chat, inputMessages, assistantMessage);
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
      originalMessage.jsonContent
        ?.filter(part => part.contentType === "image")
        ?.map(part => (part.contentType === "image" ? part.fileName : undefined))
        ?.filter(notEmpty) || [];

    await this.removeFiles(files, user, chat);

    const userMessage = contextMessages.findLast(msg => msg.role === MessageRole.USER);
    const { documentIds } = (userMessage ? userMessage.metadata : originalMessage.metadata) || {};

    // reset original message to be re-processed
    originalMessage.role = MessageRole.ASSISTANT;
    originalMessage.content = ""; // Clear content to indicate it's being regenerated
    originalMessage.jsonContent = undefined;
    originalMessage.modelId = model.modelId; // Update to the new model
    originalMessage.modelName = model.name; // Update model name
    originalMessage.metadata = {};
    originalMessage = await this.messageRepository.save(originalMessage);

    // Publish message to Queue
    await this.subscriptionsService.publishChatMessage(chat, originalMessage, true);

    const request: CreateMessageRequest = this.formatMessageRequest(model.modelId, "", chat, user);

    if (documentIds && documentIds.length > 0) {
      if (!userMessage) throw new Error("Original user message not found in context");
      await this.publishRagMessage(
        {
          ...request,
          content: userMessage.content,
          documentIds,
          modelId: userMessage.modelId || model.modelId,
        },
        connection,
        model,
        chat,
        userMessage,
        originalMessage
      );
      return originalMessage;
    }

    // Call publishAssistantMessage to generate new response
    await this.publishAssistantMessage(request, connection, user, model, chat, contextMessages, originalMessage);

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
    ok(originalMessage.createdAt);
    const messagesToDelete = await this.messageRepository.findBy({
      chatId,
      createdAt: MoreThanOrEqual(formatDateFloor(originalMessage.createdAt)),
      id: Not(originalMessage.id),
    });

    // Remove any files from following messages before deleting them
    const deletedImageFiles: string[] = [];
    for (const msg of messagesToDelete) {
      if (!msg.jsonContent) continue;

      for (const content of msg.jsonContent) {
        if (content.contentType === "image" && content.fileName) {
          deletedImageFiles.push(content.fileName);
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
        this.subscriptionsService.publishChatError(chat.id, getErrorMessage(err));
        throw err;
      });

    const request: CreateMessageRequest = this.formatMessageRequest(model.modelId, originalMessage.content, chat, user);

    // Add the edited user message to context
    contextMessages.push(originalMessage);

    // Generate new assistant response
    await this.publishAssistantMessage(request, connection, user, model, chat, contextMessages, assistantMessage);

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
    const contextMessages = await this.getContextMessages(chatId, originalMessage);

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
        this.subscriptionsService.publishChatError(chat.id, getErrorMessage(err));
        throw err;
      });

    const request: CreateMessageRequest = this.formatMessageRequest(model.modelId, originalMessage.content, chat, user);

    await this.publishAssistantMessage(request, connection, user, model, chat, contextMessages, linkedMessage);
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
    if (message.jsonContent) {
      for (const content of message.jsonContent) {
        if (content.contentType === "image" && content.fileName) {
          deletedImageFiles.push(content.fileName);
        }
      }
    }

    // If deleteFollowing is true, find and delete all messages after this one
    ok(message.createdAt);
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
        if (!msg.jsonContent) continue;
        for (const content of msg.jsonContent) {
          if (content.contentType === "image" && content.fileName) {
            deletedImageFiles.push(content.fileName);
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

    // Remove data URL prefix if present (e.g., "data:image/png;base64,")
    const base64Data = content.replace(/^data:image\/[a-z0-9]+;base64,/, "");
    // Upload to S3
    await s3Service.uploadFile(Buffer.from(base64Data, "base64"), fileName, contentType);

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
    metadata?: MessageMetadata
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
        metadata,
      })
      .catch(err => {
        this.subscriptionsService.publishChatError(chat.id, getErrorMessage(err));
        throw err;
      });

    let jsonContent: ModelMessageContent[] | undefined = undefined;

    // If there's an image, handle it
    if (images?.length) {
      const s3Service = new S3Service(user.toToken());
      jsonContent = [];

      if (content) {
        jsonContent.push({ content, contentType: "text" });
        content += "\n\n"; // Separate text and images
      }

      for (let index = 0; index < images.length; ++index) {
        const image = images[index];
        const { fileName } = await this.saveImageFromBase64(s3Service, image.bytesBase64, {
          chatId: chat.id,
          messageId: userMessage.id,
          index,
        });

        jsonContent.push({
          contentType: "image",
          fileName,
          mimeType: image.mimeType,
        });

        // For display purposes, append image markdown to the content
        content += ` ![Uploaded Image](${S3Service.getFileUrl(fileName)})`;
      }

      chat.files = [...(chat.files || []), ...images.map(img => img.fileName)];
      await this.chatRepository.save(chat);
    }

    // update message content
    userMessage.jsonContent = jsonContent;
    userMessage.content = content;
    userMessage = await this.messageRepository.save(userMessage).catch(err => {
      this.subscriptionsService.publishChatError(chat.id, getErrorMessage(err));
      throw err;
    });

    // Publish message to Queue
    await this.subscriptionsService.publishChatMessage(chat, userMessage);

    return userMessage;
  }

  protected async publishAssistantMessage(
    input: CreateMessageRequest,
    connection: ConnectionParams,
    user: User,
    model: Model,
    chat: Chat,
    inputMessages: Message[],
    assistantMessage: Message
  ): Promise<void> {
    const systemPrompt = chat.systemPrompt || user.defaultSystemPrompt || DEFAULT_CHAT_PROMPT;
    const request: CompleteChatRequest = {
      ...input,
      modelType: model.type,
      apiProvider: model.apiProvider,
      systemPrompt,
      temperature: chat.temperature,
      maxTokens: chat.maxTokens,
      topP: chat.topP,
      imagesCount: chat.imagesCount,
      tools: chat.tools,
    };

    const s3Service = new S3Service(user.toToken());

    const completeRequest = async (message: Message): Promise<boolean> => {
      ok(message);
      if (!chat.title || chat.isPristine) {
        let titleModel: Model | null = model;
        if (titleModel.type !== ModelType.CHAT) {
          titleModel = await this.modelRepository.findOne({
            where: { user: { id: user.id }, modelId: user.defaultModelId, type: ModelType.CHAT },
          });
        }
        if (titleModel) {
          chat.title = await this.suggestChatTitle(titleModel, connection, input.content, message.content || "");
          chat.isPristine = false;
          await this.chatRepository.save(chat);
        }
      }
      const stopped = this.cancelledMessages.has(message.id);

      if (stopped) {
        message.status = ResponseStatus.CANCELLED;
        message.statusInfo = undefined;
      } else {
        message.status = undefined;
        message.statusInfo = undefined;
      }

      const savedMessage = await this.messageRepository.save(message);
      await this.subscriptionsService.publishChatMessage(chat, savedMessage);

      if (stopped) {
        this.cancelledMessages.delete(message.id);
      }

      return stopped;
    };

    const processResponse = async (message: Message, response: ModelResponse): Promise<void> => {
      if (response.type === "image") {
        if (!response.files) {
          throw new Error("No image files returned from AI provider");
        }

        const images: ModelMessageContentImage[] = [];

        for (const file of response.files) {
          // Save base64 images to S3
          const { fileName, contentType } = await this.saveImageFromBase64(s3Service, file, {
            chatId: chat.id,
            messageId: message.id,
            index: images.length,
          });

          images.push({
            contentType: "image",
            fileName,
            mimeType: contentType,
          });
        }

        message.jsonContent = images;
        message.content = images.map(img => `![Generated Image](${S3Service.getFileUrl(img.fileName)})`).join("   ");

        chat.files = [...(chat.files || []), ...images.map(img => img.fileName)];
      } else {
        message.content = response.content?.trim() || "_No response_";
      }
    };

    if (!model.streaming) {
      // sync call
      try {
        await this.subscriptionsService.publishChatMessage(chat, assistantMessage, true);
        const aiResponse = await this.aiService.completeChat(connection, request, inputMessages, s3Service);

        await processResponse(assistantMessage, aiResponse);
        await completeRequest(assistantMessage);
        await this.chatRepository.save(chat);
      } catch (error: unknown) {
        logger.error(error, "Error generating AI response");

        assistantMessage.content = getErrorMessage(error);
        assistantMessage.role = MessageRole.ERROR;

        await completeRequest(assistantMessage).catch(err => {
          this.subscriptionsService.publishChatError(chat.id, getErrorMessage(err));
          logger.error(err, "Error sending AI response");
        });
      }

      return;
    }

    let content = "";
    let lastPublish: number = 0;

    const handleStreaming = async (
      data: ModelResponse & { error?: Error; status?: ChatResponseStatus },
      completed?: boolean,
      forceFlush?: boolean
    ): Promise<boolean | undefined> => {
      const { content: token = "", error, metadata = {}, status } = data;
      const messageId = assistantMessage.id;

      if (completed) {
        if (error) {
          return completeRequest({
            ...assistantMessage,
            content: getErrorMessage(error),
            role: MessageRole.ERROR,
          } as Message);
        }

        await processResponse(assistantMessage, data);
        if (metadata) {
          if (!assistantMessage.metadata) {
            assistantMessage.metadata = metadata;
          } else {
            assistantMessage.metadata = { ...assistantMessage.metadata, ...metadata };
          }
        }

        return completeRequest(assistantMessage);
      }

      if (this.cancelledMessages.has(messageId)) {
        return true;
      }

      content += token;
      const now = new Date();

      if (forceFlush || now.getTime() - lastPublish > MIN_STREAMING_UPDATE_MS) {
        lastPublish = now.getTime();
        assistantMessage.content = content;
        assistantMessage.status = status?.status || ResponseStatus.STARTED;
        assistantMessage.statusInfo = this.getStatusInformation(status);
        assistantMessage.updatedAt = now;

        if (status?.tools || status?.toolCalls) {
          if (!assistantMessage.metadata) assistantMessage.metadata = {};

          if (status.tools) {
            const existingToolsIds = new Set(assistantMessage.metadata.tools?.map(tool => tool.callId) || []);
            assistantMessage.metadata.tools = [
              ...(assistantMessage.metadata.tools || []),
              ...status.tools.filter(tool => !existingToolsIds.has(tool.callId)),
            ];
          }

          if (status.toolCalls) {
            const existingCalls = new Set(assistantMessage.metadata.toolCalls?.map(call => call.name) || []);
            assistantMessage.metadata.toolCalls = [
              ...(assistantMessage.metadata.toolCalls || []),
              ...status.toolCalls.filter(call => !existingCalls.has(call.name)),
            ];
          }

          await this.messageRepository.save(assistantMessage);
        } else if (status?.status === ResponseStatus.STARTED && status.requestId) {
          if (!assistantMessage.metadata) assistantMessage.metadata = {};
          assistantMessage.metadata.requestId = status.requestId;
        }

        await this.subscriptionsService.publishChatMessage(chat, assistantMessage, true);
      }
    };

    this.aiService
      .streamChatCompletion(connection, request, inputMessages, handleStreaming, s3Service)
      .catch((error: unknown) => {
        logger.error(error, "Error streaming AI response");
        return completeRequest({
          ...assistantMessage,
          content: getErrorMessage(error),
          role: MessageRole.ERROR,
        } as Message).catch(err => logger.error(err, "Error sending AI response"));
      });
  }

  protected getStatusInformation(status: ChatResponseStatus | undefined): string | undefined {
    if (!status) return;

    switch (status.status) {
      case ResponseStatus.WEB_SEARCH:
      case ResponseStatus.TOOL_CALL:
      case ResponseStatus.OUTPUT_ITEM:
      case ResponseStatus.REASONING:
        return status.detail || (status.sequence_number == null ? "" : `Step #${status.sequence_number}`);
      default:
        return status.detail || undefined;
    }
  }

  protected async publishRagMessage(
    input: CreateMessageRequest,
    connection: ConnectionParams,
    model: Model,
    chat: Chat,
    inputMessage: Message,
    ragMessage: Message
  ): Promise<void> {
    let chunksLimit = RAG_QUERY_CHUNKS_LIMIT;
    let loadFullPage = RAG_LOAD_FULL_PAGES;
    let aiResponse: ModelResponse | undefined = undefined;
    let chunks: DocumentChunk[] = [];
    let ragRequest: string = "";

    ok(input.documentIds, "Document IDs are required for RAG messages");

    const completeRequest = async (message: Message) => {
      ok(message);
      try {
        if (!chat.title || chat.isPristine) {
          chat.title = await this.suggestChatTitle(model, connection, input.content, message.content || ragRequest);
          chat.isPristine = false;
          await this.chatRepository.save(chat);
        }

        const savedMessage = await this.messageRepository.save(message);
        await this.subscriptionsService.publishChatMessage(chat, savedMessage);
      } catch (err) {
        this.subscriptionsService.publishChatError(chat.id, getErrorMessage(err));
        logger.error(err, "Error sending RAG response");
      }
    };

    do {
      await this.subscriptionsService.publishChatMessage(
        chat,
        this.messageRepository.create({
          ...ragMessage,
          status: ResponseStatus.RAG_SEARCH,
        }),
        true
      );

      try {
        chunks = await this.embeddingsService.findChunks(input.documentIds, input.content, connection, {
          limit: chunksLimit,
          loadFullPage,
        });
        const { systemPrompt, userInput } = RAG_REQUEST({ chunks, question: input.content });
        ragRequest = userInput;

        logger.trace(
          {
            question: input.content,
            documents: input.documentIds,
            chunks: chunks.map(chunk => ({
              id: chunk.id,
              page: chunk.page,
              content: chunk.content,
            })),
          },
          "RAG request"
        );

        const request: CompleteChatRequest = {
          ...input,
          modelType: model.type,
          apiProvider: model.apiProvider,
          modelId: model.modelId,
          systemPrompt,
        };

        // always sync call
        aiResponse = await this.aiService.completeChat(connection, request, [
          this.messageRepository.create({
            ...inputMessage,
            jsonContent: undefined,
            content: userInput, // only user input without images and so on
          }),
        ]);

        break;
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        if (errorMessage.match(/429\s+request too large/gi) || errorMessage.match(/failed with status code 400/gi)) {
          logger.warn(errorMessage, "RAG request too large, reducing chunks limit");
          chunksLimit = Math.floor(chunksLimit / 2);
          loadFullPage = false;
        } else {
          logger.error(error, "Error processing RAG response");
          ragMessage.content = errorMessage;
          ragMessage.role = MessageRole.ERROR;
          return await completeRequest(ragMessage);
        }
      }
    } while (chunksLimit > 1);

    ok(aiResponse);

    const chunksMap = chunks.reduce(
      (acc, chunk) => {
        acc[chunk.id] = chunk;
        return acc;
      },
      {} as Record<string, DocumentChunk>
    );

    try {
      const content = aiResponse.content
        .trim()
        .replace(/^\s*```(json)?/, "")
        .replace(/^[^\{]+/, "")
        .replace(/```$/, "")
        .replace(/\n+/g, " ")
        .trim();

      logger.trace("RAG response raw: " + content);

      const ragResponse = content ? (JSON.parse(content) as RagResponse) : {};
      logger.debug(ragResponse, "RAG response");

      ragMessage.content = ragResponse.final_answer || "N/A";
      if (ragResponse.reasoning_summary) {
        ragMessage.content += `\n\n> ${ragResponse.reasoning_summary}`;
      }

      ragMessage.metadata = {
        ...aiResponse.metadata,
        documentIds: input.documentIds,
        analysis: ragResponse.step_by_step_analysis,
        relevantsChunks:
          ragResponse.relevant_chunks_ids
            ?.map((id, ndx) => {
              const inputChunk = chunksMap[id];
              if (!inputChunk) return null;

              return {
                id,
                relevance: ragResponse.chunks_relevance?.[ndx] || 0,
                documentId: inputChunk.id,
                documentName: inputChunk.documentName,
                page: inputChunk.page,
                pageIndex: inputChunk.pageIndex,
                content: inputChunk.content,
              };
            })
            ?.filter(notEmpty) || [],
      };

      await completeRequest(ragMessage);
      await this.chatRepository.save(chat);
    } catch (error: unknown) {
      logger.error(error, "Error processing RAG response");
      ragMessage.content = getErrorMessage(error);
      ragMessage.role = MessageRole.ERROR;
      await completeRequest(ragMessage);
    }
  }

  public suggestChatTitle = async (
    model: Model,
    connection: ConnectionParams,
    question: string,
    answer: string
  ): Promise<string> => {
    const res = await this.aiService.completeChat(
      connection,
      {
        modelId: model.modelId,
        modelType: model.type,
        apiProvider: model.apiProvider,
      },
      [
        this.messageRepository.create({
          id: "summary-system",
          role: MessageRole.USER,
          content: PROMPT_CHAT_TITLE({ question, answer }),
        }),
      ]
    );

    const title = res.content.trim().replace(/(^["'])|(["']$)/g, "");
    return title || question.substring(0, 25) + (question.length > 25 ? "..." : "") || "New Chat";
  };

  /**
   * Stop message generation by request ID and message ID.
   */
  async stopMessageGeneration(
    requestId: string,
    messageId: string,
    connection: ConnectionParams,
    user: User
  ): Promise<void> {
    logger.debug(
      `Stopping message generation for requestId: ${requestId}, messageId: ${messageId}, userId: ${user.id}`
    );

    // First verify that the message belongs to the user
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ["chat"],
    });
    if (!message) {
      throw new Error("Message not found");
    }
    if (!message.chat) {
      throw new Error("Message chat not found");
    }
    if (message.userId !== user.id) {
      throw new Error("Access denied: Message does not belong to the user");
    }

    const model = await this.modelRepository.findOne({ where: { modelId: message.modelId } });

    if (!model) {
      throw new Error("Model not found");
    }

    try {
      await this.aiService.stopRequest(model, connection, requestId);
      this.cancelledMessages.add(messageId);

      message.status = ResponseStatus.CANCELLED;
      await this.subscriptionsService.publishChatMessage(
        message.chat,
        await this.messageRepository.save(message),
        false
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(error, `Failed to stop message generation for requestId: ${requestId}`);
      throw new Error(`Failed to stop message generation: ${errorMessage}`);
    }
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
    await s3Service.deleteFiles(deletedImageFiles).catch(error => {
      logger.error(error, `Failed to delete files: ${deletedImageFiles.join(", ")}`);
    });
  }

  protected async getContextMessages(chatId: string, currentMessage?: Message) {
    // Get previous messages for context (up to the original message)
    let query = this.messageRepository
      .createQueryBuilder("message")
      .where("message.chatId = :chatId", { chatId })
      .andWhere("message.linkedToMessageId IS NULL");

    if (currentMessage) {
      ok(currentMessage.createdAt);
      query = query
        .andWhere("message.createdAt <= :createdAt", { createdAt: formatDateCeil(currentMessage.createdAt) })
        .andWhere("message.id <> :id", { id: currentMessage.id });
    }

    const messages = await query.orderBy("message.createdAt", "DESC").take(CONTEXT_MESSAGES_LIMIT).getMany();
    return messages.reverse();
  }

  protected formatMessageRequest(modelId: string, content: string, chat: Chat, user: User): CreateMessageRequest {
    const modelId_ = modelId || chat.modelId || user.defaultModelId;
    if (!modelId_) throw new Error("Model ID is required");

    const request: CreateMessageRequest = {
      chatId: chat.id,
      modelId: modelId_,
      content,
      temperature: chat.temperature ?? user.defaultTemperature ?? DEFAULT_TEMPERATURE,
      maxTokens: chat.maxTokens ?? user.defaultMaxTokens ?? DEFAULT_MAX_TOKENS,
      topP: chat.topP ?? user.defaultTopP ?? DEFAULT_TOP_P,
      imagesCount: chat.imagesCount ?? user.defaultImagesCount ?? 1,
      systemPrompt: chat.systemPrompt || user.defaultSystemPrompt || DEFAULT_CHAT_PROMPT,
    };

    return request;
  }
}
