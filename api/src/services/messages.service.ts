import { In, IsNull, MoreThanOrEqual, Not, Repository } from "typeorm";
import type { WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Message } from "../entities/Message";
import { ChatFile, ChatFileType } from "../entities/ChatFile";
import { AIService } from "./ai/ai.service";
import { getImageFeatures, saveImageFromBase64 as saveImageFromBase64Util } from "@/utils/image";
import { Chat, DocumentChunk, MCPServer, Model, User } from "@/entities";
import { CreateMessageInput, ImageInput, MessageContext } from "@/types/graphql/inputs";
import {
  ChatResponseStatus,
  CompleteChatRequest,
  CreateMessageRequest,
  MessageMetadata,
  ModelMessageContent,
  ModelMessageContentImage,
  ModelResponse,
} from "@/types/ai.types";
import { MessageRole, MessageType, ModelFeature, ModelType, ResponseStatus, ToolType } from "@/types/api";
import { notEmpty, ok } from "@/utils/assert";
import { getErrorMessage } from "@/utils/errors";
import { createLogger } from "@/utils/logger";
import { isAdmin } from "@/utils/jwt";
import { getRepository } from "@/config/database";
import { formatDateCeil, formatDateFloor } from "@/utils/db";

import { COMMAND_CONTINUE_REQUEST, SubscriptionsService } from "./messaging";
import type { RequestQueuePayload, RequestsSqsService } from "./messaging/requests-sqs.service";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { S3Service } from "./data";
import { DeleteMessageResponse } from "@/types/graphql/responses";
import { EmbeddingsService } from "./ai/embeddings.service";
import { DEFAULT_CHAT_PROMPT, PROMPT_CHAT_TITLE, RAG_REQUEST, RagResponse } from "@/config/ai/prompts";
import { APPLICATION_FEATURE, globalConfig } from "@/global-config";
import { ChatSettings } from "@/entities/Chat";
import { IMAGE_GENERATION_PLACEHOLDER } from "@/config/ai/templates";
import { pick } from "lodash";
import { QueueLockService } from "./common/queue-lock.service";

const aiConfig = globalConfig.ai;

const logger = createLogger(__filename);

const MIN_STREAMING_UPDATE_MS = 30; // Minimum interval between streaming updates

export class MessagesService {
  private static clients: WeakMap<WebSocket, string> = new WeakMap<WebSocket, string>();

  private messageRepository: Repository<Message>;
  private chatRepository: Repository<Chat>;
  private chatFileRepository: Repository<ChatFile>;
  private modelRepository: Repository<Model>;
  private mcpServerRepository: Repository<MCPServer>;

  private subscriptionsService: SubscriptionsService;
  private aiService: AIService;
  private embeddingsService: EmbeddingsService;
  private requestsSqsService: RequestsSqsService;
  private cancelledMessages: Set<string> = new Set<string>();
  private requestsLock: QueueLockService<string, string>;

  constructor(subscriptionsService: SubscriptionsService, requestsSqsService: RequestsSqsService) {
    this.subscriptionsService = subscriptionsService;
    this.requestsSqsService = requestsSqsService;
    this.aiService = new AIService();
    this.embeddingsService = new EmbeddingsService();
    this.messageRepository = getRepository(Message);
    this.chatRepository = getRepository(Chat);
    this.chatFileRepository = getRepository(ChatFile);
    this.modelRepository = getRepository(Model);
    this.mcpServerRepository = getRepository(MCPServer);
    this.requestsLock = new QueueLockService<string, string>("requests", globalConfig.sqs.requestsQueueExpirationMs); // slightly longer than SQS delay

    subscriptionsService.on(globalConfig.redis.channelChatMessage, this.handleMessageEvent.bind(this));
    requestsSqsService.subscribe(COMMAND_CONTINUE_REQUEST, this.handleQueuedRequestMessage.bind(this));
  }

  public connectClient(socket: WebSocket, request: IncomingMessage, chatId: string) {
    const clientIp = request.headers["x-forwarded-for"] || request.socket.remoteAddress;
    logger.trace({ chatId, clientIp }, "Client connected");

    MessagesService.clients.set(socket, chatId);
    setTimeout(() => {
      SubscriptionsService.pubSub.publish(globalConfig.redis.channelChatMessage, {
        chatId,
        data: { type: MessageType.SYSTEM },
      });
    }, 300);
  }

  public async reloadChatFileMetadata(chatFileId: string, user: User): Promise<ChatFile> {
    const chatFile = await this.chatFileRepository.findOne({
      where: { id: chatFileId },
      relations: ["chat", "chat.user"],
    });

    if (!chatFile || !chatFile.fileName) throw new Error("ChatFile not found");
    if (chatFile.chat.user?.id !== user.id && !isAdmin(user.toToken())) throw new Error("Access denied");

    const s3Service = new S3Service(user.toToken());
    const buffer = await s3Service.getFileContent(chatFile.fileName);
    const features = await getImageFeatures(buffer);

    chatFile.predominantColor = features.predominantColor;
    chatFile.exif = features.exif;

    return this.chatFileRepository.save(chatFile);
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

  protected async handleQueuedRequestMessage(
    payload: RequestQueuePayload,
    user: User,
    cleanupMessage: () => Promise<void>,
    expired?: boolean
  ) {
    const { input, modelId, message, connection, requestId, lastSequenceNumber } = payload;
    if (!requestId) {
      logger.error(`Missing requestId in Requests SQS message payload, messageId: ${message.id}`);
      return;
    }

    const chat = await this.chatRepository.findOne({ where: { id: message.chatId, user: { id: user.id } } });
    if (!chat) {
      logger.warn(`Chat not found for Requests SQS message, chatId: ${message.chatId}`);
      return;
    }

    const assistantMessage = await this.messageRepository.findOne({ where: { id: message.id } });
    if (!assistantMessage) {
      logger.warn(`Message not found for Requests SQS message, messageId: ${message.id}`);
      return;
    }

    if (
      assistantMessage.status &&
      [ResponseStatus.COMPLETED, ResponseStatus.CANCELLED, ResponseStatus.ERROR].includes(assistantMessage.status)
    ) {
      await cleanupMessage();
      return;
    }

    if (expired) {
      assistantMessage.status = ResponseStatus.ERROR;
      assistantMessage.statusInfo = "Request expired";
      assistantMessage.content = "Request expired before processing";
      return void (await this.saveAndPublish(chat, assistantMessage));
    }

    const lock = await this.requestsLock.checkLock(requestId);
    if (lock) {
      return;
    }

    logger.debug({ requestId, messageId: message.id }, "Processing delayed request");

    const model = await this.modelRepository.findOne({
      where: {
        modelId,
        user: { id: user.id }, // Ensure the model belongs to the user
      },
    });
    this.checkModelFeatures(model, user);

    const request: CreateMessageRequest = this.formatMessageRequest(modelId, input.content, chat, user, {
      mcpTokens: input.mcpTokens,
    });
    // very important to avoid inifinite loops in case of continue_request
    request.requestId = requestId;
    request.lastSequenceNumber = lastSequenceNumber;

    // run in background without awaiting to allow faster processing of next messages in the queue
    this.requestsLock
      .putLock(requestId, process.pid.toString())
      .then(() => this.getContextMessages(chat.id, assistantMessage))
      .then(messages =>
        this.publishAssistantMessage(request, connection, user, model, chat, messages, assistantMessage, requestId)
      )
      .then(cleanupMessage)
      .catch(error => {
        logger.error(
          {
            error,
            stack: error.stack,
            messageId: message.id,
            requestId,
            ...pick(input, ["modelId", "settings"]),
          },
          `Error processing Requests SQS message for requestId ${requestId}`
        );
      })
      .then(() => this.requestsLock.releaseLock(requestId));
  }

  public async createMessage(input: CreateMessageInput, connection: ConnectionParams, user: User): Promise<Message> {
    const { chatId, documentIds } = input;
    if (!chatId) throw new Error("Chat ID is required");
    const chat = await this.chatRepository.findOne({
      where: { id: chatId },
    });
    if (!chat) throw new Error("Chat not found");

    const modelId = chat.modelId || user.settings?.defaultModelId;
    if (!modelId) throw new Error("Model must be defined for the chat or user");

    await this.checkMessagesLimit(chatId, user);

    const model = await this.modelRepository.findOne({
      where: {
        modelId,
        user: { id: user.id }, // Ensure the model belongs to the user
      },
    });
    this.checkModelFeatures(model, user);

    const request: CreateMessageRequest = this.formatMessageRequest(modelId, input.content, chat, user, {
      mcpTokens: input.mcpTokens,
    });

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
      if (!user.isFeatureEnabled(APPLICATION_FEATURE.RAG)) {
        throw new Error("RAG module is not enabled");
      }

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
    user: User,
    messageContext?: MessageContext
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
    this.checkModelFeatures(model, user);

    const chatId = chat.id;
    const contextMessages = await this.getContextMessages(chatId, originalMessage);
    const files = await this.chatFileRepository.find({ where: { messageId: originalMessage.id } });
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

    const request: CreateMessageRequest = this.formatMessageRequest(model.modelId, "", chat, user, messageContext);

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
    user: User,
    messageContext?: MessageContext
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

    ok(originalMessage.createdAt);

    // Delete all messages after this one in the chat
    let query = this.messageRepository
      .createQueryBuilder("message")
      .where("message.chatId = :chatId", { chatId })
      .andWhere("message.id <> :id", { id: originalMessage.id })
      .andWhere("message.createdAt >= :createdAt", { createdAt: formatDateFloor(originalMessage.createdAt) })
      .orderBy("message.createdAt", "ASC");

    const messagesToDelete = await query.getMany();

    let assistantMessage: Message | undefined = messagesToDelete.find(m => m.role === MessageRole.ASSISTANT);
    const { documentIds } = (assistantMessage ? assistantMessage.metadata : originalMessage.metadata) || {};

    // Remove any files from following messages before deleting them
    const deletedFiles: ChatFile[] = [];
    if (messagesToDelete.length > 0) {
      const msgIds = messagesToDelete.map(m => m.id);
      const files = await this.chatFileRepository.find({ where: { messageId: In(msgIds) } });
      deletedFiles.push(...files);

      await this.messageRepository.remove(
        messagesToDelete.filter(m => !assistantMessage || m.id !== assistantMessage.id)
      );
    }

    // Remove image files if any
    if (deletedFiles.length > 0) {
      await this.removeFiles(deletedFiles, user, chat);
    }

    // Update the original message with new content
    originalMessage.content = newContent.trim();
    originalMessage.jsonContent = undefined; // Clear jsonContent to regenerate it
    originalMessage = await this.messageRepository.save(originalMessage);

    // Find the model for the chat
    const model = await this.modelRepository.findOne({
      where: {
        modelId: chat.modelId || user.settings?.defaultModelId,
        user: { id: user.id },
      },
    });

    this.checkModelFeatures(model, user);

    // Get context messages (up to the edited message, excluding it)
    const contextMessages = await this.getContextMessages(chatId, originalMessage);

    // Create new assistant message
    if (assistantMessage) {
      assistantMessage.status = undefined;
      assistantMessage.statusInfo = undefined;

      // leave previosly generated content
      if (model.type !== ModelType.IMAGE_GENERATION) {
        assistantMessage.content = "";
      } else {
        assistantMessage.status = ResponseStatus.CONTENT_GENERATION;
      }

      assistantMessage.jsonContent = undefined;
      assistantMessage.metadata = undefined;
    } else {
      assistantMessage = await this.messageRepository.save(
        this.messageRepository.create({
          content: "",
          role: MessageRole.ASSISTANT,
          modelId: model.modelId,
          modelName: model.name,
          chatId,
          chat,
        })
      );
    }

    await this.subscriptionsService.publishChatMessage(chat, assistantMessage, true);

    await this.messageRepository.save(assistantMessage).catch(err => {
      this.subscriptionsService.publishChatError(chat.id, getErrorMessage(err));
      throw err;
    });

    const request: CreateMessageRequest = this.formatMessageRequest(
      model.modelId,
      originalMessage.content,
      chat,
      user,
      messageContext
    );

    // Add the edited user message to context
    contextMessages.push(originalMessage);

    if (documentIds && documentIds.length > 0) {
      await this.publishRagMessage(
        {
          ...request,
          content: originalMessage.content,
          documentIds,
          modelId: originalMessage.modelId || model.modelId,
        },
        connection,
        model,
        chat,
        originalMessage,
        assistantMessage
      );
    } else {
      // Re/generate assistant response
      await this.publishAssistantMessage(request, connection, user, model, chat, contextMessages, assistantMessage);
    }

    return originalMessage;
  }

  public async callOtherModel(
    messageId: string,
    modelId: string,
    connection: ConnectionParams,
    user: User,
    messageContext?: MessageContext
  ): Promise<Message> {
    // Find the original message
    const originalMessage = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ["chat", "chat.user", "user"],
    });

    if (!originalMessage) throw new Error("Message not found");
    if (!originalMessage.chat) throw new Error("Chat not found for this message");
    if (originalMessage.role === MessageRole.USER) throw new Error("User messages cannot be used for calling others");

    await this.checkMessagesLimit(originalMessage.chat.id, user);

    const chat = originalMessage.chat;
    const chatId = originalMessage.chatId || originalMessage.chat.id;

    // Get valid models for the user
    const model = await this.modelRepository.findOne({
      where: {
        modelId,
        user: { id: user.id }, // Ensure the model belongs to the user
      },
    });
    this.checkModelFeatures(model, user);

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

    const request: CreateMessageRequest = this.formatMessageRequest(
      model.modelId,
      originalMessage.content,
      chat,
      user,
      messageContext
    );

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

    // Process this message's images
    const originalFiles = await this.chatFileRepository.find({ where: { messageId: message.id } });
    const deletedFiles: ChatFile[] = originalFiles || [];

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
      const msgIds = messagesToDelete.map(m => m.id);
      const followingFiles = await this.chatFileRepository.find({ where: { messageId: In(msgIds) } });
      deletedFiles.push(...followingFiles);

      result.messages.push(...messagesToDelete.map(msg => ({ id: msg.id })));
      await this.messageRepository.remove(messagesToDelete);
    }

    // Delete the original message
    await this.messageRepository.remove(message);

    // Remove image files from disk and update chat.files
    if (deletedFiles.length > 0) {
      await this.removeFiles(deletedFiles, user, chat);
    }

    return result; // Return all deleted message IDs including the original
  }

  public saveImageFromBase64(
    s3Service: S3Service,
    content: string,
    opts: { chatId: string; messageId: string; id: string }
  ): Promise<{ fileName: string; contentType: string; buffer: Buffer }> {
    return saveImageFromBase64Util(s3Service, content, opts);
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
        const { fileName, buffer } = await this.saveImageFromBase64(s3Service, image.bytesBase64, {
          chatId: chat.id,
          messageId: userMessage.id,
          id: `${Date.now()}-${index}`,
        });

        const { predominantColor, exif } = await getImageFeatures(buffer);

        await this.chatFileRepository.save({
          chatId: chat.id,
          messageId: userMessage.id,
          type: ChatFileType.IMAGE,
          uploadFile: image.fileName,
          mime: image.mimeType,
          fileName,
          predominantColor,
          exif,
        });

        jsonContent.push({
          contentType: "image",
          fileName,
          mimeType: image.mimeType,
        });

        // For display purposes, append image markdown to the content
        content += ` ![Uploaded Image](${S3Service.getFileUrl(fileName)})`;
      }
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

  /** Save a message and notify the client. */
  protected async saveAndPublish(chat: Chat, message: Message, inProgress: boolean = false): Promise<Message> {
    const savedMessage = await this.messageRepository.save(message);
    await this.subscriptionsService.publishChatMessage(chat, savedMessage, inProgress);
    return savedMessage;
  }

  /** Update chat title from the first Q&A if not yet set. */
  protected async ensureChatTitle(
    chat: Chat,
    titleModel: Model,
    connection: ConnectionParams,
    question: string,
    answer: string
  ): Promise<void> {
    if (!chat.title || chat.isPristine) {
      chat.title = await this.suggestChatTitle(titleModel, connection, question, answer);
      chat.isPristine = false;
      await this.chatRepository.save(chat);
    }
  }

  /** Apply a ModelResponse to a message (saves images to S3 or sets text content). */
  protected async processModelResponse(
    message: Message,
    response: ModelResponse,
    s3Service: S3Service,
    chat: Chat
  ): Promise<void> {
    message.content = response.content?.trim() || "";

    if (response.images?.length) {
      const images: ModelMessageContentImage[] = [];

      for (const file of response.images) {
        const { fileName, contentType, buffer } = await saveImageFromBase64Util(s3Service, file, {
          chatId: chat.id,
          messageId: message.id,
          id: `${Date.now()}-${images.length}`,
        });

        const { predominantColor, exif } = await getImageFeatures(buffer);

        await this.chatFileRepository.save({
          chatId: chat.id,
          messageId: message.id,
          type: ChatFileType.IMAGE,
          fileName,
          predominantColor,
          exif,
        });

        images.push({ contentType: "image", fileName, mimeType: contentType });
      }

      if (!message.jsonContent) message.jsonContent = [];

      message.jsonContent.push(...images);
      message.content +=
        "\n\n" + images.map(img => `![Generated Image](${S3Service.getFileUrl(img.fileName)})`).join("   ");
    }

    if (!message.content) {
      message.content = "_No response_";
    }
  }

  private isLongRunningRequest(model: Model): boolean {
    return (
      model.type === ModelType.IMAGE_GENERATION ||
      model.type === ModelType.VIDEO_GENERATION ||
      Boolean(model.tools?.some(tool => tool === ToolType.MCP || tool === ToolType.IMAGE_GENERATION))
    );
  }

  protected async publishAssistantMessage(
    input: CreateMessageRequest,
    connection: ConnectionParams,
    user: User,
    model: Model,
    chat: Chat,
    inputMessages: Message[],
    assistantMessage: Message,
    requestId?: string
  ): Promise<void> {
    const chatSettings: ChatSettings = {
      temperature: user.settings?.defaultTemperature ?? aiConfig.defaultTemperature,
      maxTokens: user.settings?.defaultMaxTokens ?? aiConfig.defaultMaxTokens,
      topP: user.settings?.defaultTopP ?? aiConfig.defaultTopP,
      imagesCount: user.settings?.defaultImagesCount ?? 1,
      systemPrompt: user.settings?.defaultSystemPrompt || DEFAULT_CHAT_PROMPT,
      ...chat.settings,
    };

    if (!model?.features?.includes(ModelFeature.REASONING)) {
      chatSettings.thinking = undefined;
      chatSettings.thinkingBudget = undefined;
    }

    const request: CompleteChatRequest = {
      ...input,
      requestId,
      modelType: model.type,
      apiProvider: model.apiProvider,
      settings: chatSettings,
      tools: chat.tools,
      mcpTokens: input.mcpTokens,
    };

    const mcpTools = chat.tools
      ?.filter(tool => tool.type === ToolType.MCP)
      ?.map(tool => tool.id)
      ?.filter(notEmpty);
    if (mcpTools?.length) {
      request.mcpServers = await this.mcpServerRepository.find({
        where: {
          id: In(mcpTools),
          isActive: true,
          user: { id: user.id },
        },
      });
    }

    const s3Service = new S3Service(user.toToken());

    const completeRequest = async (message: Message, data?: ModelResponse): Promise<boolean> => {
      ok(message);
      logger.debug(
        {
          messageId: message.id,
          requestId: request.requestId,
          modelId: model.modelId,
          content: message.content,
        },
        "Complete assistant message"
      );

      const titleModel =
        model.type !== ModelType.CHAT
          ? await this.modelRepository.findOne({
              where: { user: { id: user.id }, modelId: user.settings?.defaultModelId, type: ModelType.CHAT },
            })
          : model;
      if (titleModel) {
        await this.ensureChatTitle(chat, titleModel, connection, input.content, message.content || "");
      }

      const stopped = this.cancelledMessages.has(message.id);

      if (stopped) {
        message.status = ResponseStatus.CANCELLED;
        message.statusInfo = "";
      } else if (message?.metadata?.requestId && !data?.completed) {
        // If the message has a requestId in metadata, it means it's waiting for a long-running request to be enqueued or completed
        message.status = ResponseStatus.CONTENT_GENERATION;
        message.statusInfo = "";
      } else {
        message.status = ResponseStatus.COMPLETED;
        message.statusInfo = "";
      }

      await this.saveAndPublish(chat, message, Boolean(message?.metadata?.requestId && !data?.completed));

      if (stopped) this.cancelledMessages.delete(message.id);
      return stopped;
    };

    // show progress immediately to avoid client timeouts and indicate that the request is being processed
    await this.subscriptionsService.publishChatMessage(chat, assistantMessage, true);

    if (!model.streaming) {
      // sync call
      try {
        const aiResponse = await this.aiService.completeChat(connection, request, inputMessages, s3Service, model);

        await this.processModelResponse(assistantMessage, aiResponse, s3Service, chat);
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
          logger.error(error, "Error in streaming AI response");

          return completeRequest(
            {
              ...assistantMessage,
              content: getErrorMessage(error),
              role: MessageRole.ERROR,
            },
            {
              ...data,
              completed: true,
            }
          );
        }

        if (metadata) {
          assistantMessage.metadata = assistantMessage.metadata
            ? { ...assistantMessage.metadata, ...metadata }
            : metadata;
        }

        if (this.requestsSqsService.isConfigured() && metadata.requestId && this.isLongRunningRequest(model)) {
          // For long-running image/video generation, enqueue via SQS
          await this.requestsSqsService.enqueueRequest(
            {
              input,
              modelId: model.modelId,
              message: assistantMessage,
              connection,
              userToken: user.toToken(),
              requestId: metadata.requestId,
            },
            request.requestId
              ? globalConfig.sqs.requestsRetrySubsequentDelayMs
              : globalConfig.sqs.requestsRetryInitialDelayMs
          );
        } else {
          await this.processModelResponse(assistantMessage, data, s3Service, chat);
        }

        return completeRequest(assistantMessage, data);
      }

      if (this.cancelledMessages.has(messageId)) {
        return true;
      }

      // image edit: keep placeholders until the final image arrives
      if (status?.status === ResponseStatus.CONTENT_GENERATION) {
        content = token || assistantMessage.content || IMAGE_GENERATION_PLACEHOLDER;
      } else {
        content += token;
      }

      const now = new Date();

      if (forceFlush || now.getTime() - lastPublish > MIN_STREAMING_UPDATE_MS) {
        if (status?.requestId) {
          await this.requestsLock.putLock(status.requestId, process.pid.toString());
        }

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
            const existingCalls = new Set(assistantMessage.metadata.toolCalls?.map(call => call.callId) || []);
            assistantMessage.metadata.toolCalls = [
              ...(assistantMessage.metadata.toolCalls || []),
              ...status.toolCalls.filter(call => !existingCalls.has(call.callId)),
            ];
          }

          await this.messageRepository.save(assistantMessage);
        } else if (status?.status === ResponseStatus.STARTED && status.requestId) {
          if (!assistantMessage.metadata) assistantMessage.metadata = {};

          assistantMessage.metadata.requestId = status.requestId;
          assistantMessage.metadata.lastSequenceNumber = status.sequenceNumber;
          logger.debug(
            {
              requestId: status.requestId,
              sequenceNumber: status.sequenceNumber,
              isLongRunning: this.isLongRunningRequest(model),
              queue: status.queue,
            },
            "Streaming request processing started"
          );

          await this.messageRepository.save(assistantMessage);

          if (status.queue && this.requestsSqsService.isConfigured() && this.isLongRunningRequest(model)) {
            // For long-running image/video generation, enqueue via SQS
            await this.requestsSqsService.enqueueRequest(
              {
                input,
                modelId: model.modelId,
                message: assistantMessage,
                connection,
                userToken: user.toToken(),
                requestId: status.requestId,
                lastSequenceNumber: status.sequenceNumber,
              },
              globalConfig.sqs.requestsQueueDelayMs // longer delay to avoid too many retries
            );
          }
        }

        await this.subscriptionsService.publishChatMessage(chat, assistantMessage, true);
      }
    };

    request.requestPolling = this.requestsSqsService.isConfigured();

    this.aiService
      .streamChatCompletion(connection, request, inputMessages, handleStreaming, s3Service, model)
      .catch((error: unknown) => {
        logger.error(error, "Error streaming AI response");
        const content = getErrorMessage(error);
        return completeRequest(
          {
            ...assistantMessage,
            content,
            role: MessageRole.ERROR,
          },
          {
            content,
            completed: true,
          }
        ).catch(err => logger.error(err, "Error sending AI response"));
      });
  }

  protected getStatusInformation(status: ChatResponseStatus | undefined): string | undefined {
    if (!status) return;

    switch (status.status) {
      case ResponseStatus.WEB_SEARCH:
      case ResponseStatus.TOOL_CALL:
      case ResponseStatus.OUTPUT_ITEM:
      case ResponseStatus.REASONING:
        return status.detail || (status.sequenceNumber == null ? "" : `Step #${status.sequenceNumber}`);
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
    let chunksLimit = aiConfig.ragQueryChunksLimit;
    let loadFullPage = aiConfig.ragLoadFullPages;
    let aiResponse: ModelResponse | undefined = undefined;
    let chunks: DocumentChunk[] = [];
    let ragRequest: string = "";

    ok(input.documentIds, "Document IDs are required for RAG messages");

    const completeRequest = async (message: Message) => {
      ok(message);
      try {
        await this.ensureChatTitle(chat, model, connection, input.content, message.content || ragRequest);
        await this.saveAndPublish(chat, message);
      } catch (err) {
        this.subscriptionsService.publishChatError(chat.id, getErrorMessage(err));
        logger.error(err, "Error sending RAG response");
      }
    };

    ragMessage.content = "";
    ragMessage.jsonContent = undefined;

    do {
      await this.subscriptionsService.publishChatMessage(
        chat,
        {
          ...ragMessage,
          status: ResponseStatus.RAG_SEARCH,
        },
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
          settings: input.settings || {},
        };

        ok(request.settings);

        // extend system prompt with RAG information
        request.settings.systemPrompt = systemPrompt;
        if (!model?.features?.includes(ModelFeature.REASONING)) {
          request.settings.thinking = undefined;
          request.settings.thinkingBudget = undefined;
        }

        // always sync call
        aiResponse = await this.aiService.completeChat(
          connection,
          request,
          [
            this.messageRepository.create({
              ...inputMessage,
              jsonContent: undefined,
              content: userInput, // only user input without images and so on
            }),
          ],
          undefined,
          model
        );

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
      const content = (aiResponse.content || "")
        .trim()
        .replace(/^\s*```(json)?/, "")
        .replace(/^[^\{]+/, "")
        .replace(/```$/, "")
        .replace(/\n+/g, " ")
        .trim();

      logger.trace("RAG response raw: " + content);

      let parsed = content ? (JSON.parse(content) as any) : {};
      // Some models (e.g. Yandex FM) return the schema structure with embedded `value` fields
      // instead of a flat object — detect and flatten that format
      if (parsed?.schema?.properties) {
        const props = parsed.schema.properties as Record<string, { value?: unknown }>;
        parsed = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.value]));
      }
      const ragResponse = parsed as RagResponse;
      logger.debug(ragResponse, "RAG response");

      ragMessage.content = ragResponse.final_answer || aiResponse.content || "N/A";
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
      logger.error({ error, response: aiResponse.content }, "Error processing RAG response");
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
    const defaultTitle = question.substring(0, 25) + (question.length > 25 ? "..." : "") || "New Chat";
    try {
      const res = await this.aiService.completeChat(
        connection,
        {
          modelId: model.modelId,
          modelType: model.type,
          apiProvider: model.apiProvider,
          settings: {
            temperature: aiConfig.summarizingTemperature,
            maxTokens: 10,
          },
        },
        [
          this.messageRepository.create({
            id: "summary-system",
            role: MessageRole.USER,
            content: PROMPT_CHAT_TITLE({ question, answer }),
          }),
        ],
        undefined,
        model
      );

      const title = res.content?.trim()?.replace(/(^["'])|(["']$)/g, "");
      return title || defaultTitle;
    } catch (error: unknown) {
      logger.error(error, "Error suggesting chat title");
      return defaultTitle;
    }
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

  public async removeFiles(files: ChatFile[], user: User, chat?: Chat): Promise<void> {
    if (!files || files.length === 0) return;

    let s3Service = new S3Service(user.toToken());

    // Delete from DB
    const ids = files.map(f => f.id);
    await this.chatFileRepository.delete(ids);

    // Delete the files from S3
    const fileNames = files.map(f => f.fileName).filter(notEmpty);
    if (fileNames.length > 0) {
      await s3Service.deleteFiles(fileNames).catch(error => {
        logger.error(error, `Failed to delete files: ${fileNames.join(", ")}`);
      });
    }
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

    const messages = await query.orderBy("message.createdAt", "DESC").take(aiConfig.contextMessagesLimit).getMany();
    return messages.reverse();
  }

  protected formatMessageRequest(
    modelId: string,
    content: string,
    chat: Chat,
    user: User,
    messageContext?: MessageContext
  ): CreateMessageRequest {
    const chatModelId = modelId || chat.modelId || user.settings?.defaultModelId;
    if (!chatModelId) throw new Error("Model ID is required");

    const chatSettings: ChatSettings = {
      temperature: user.settings?.defaultTemperature ?? aiConfig.defaultTemperature,
      maxTokens: user.settings?.defaultMaxTokens ?? aiConfig.defaultMaxTokens,
      topP: user.settings?.defaultTopP ?? aiConfig.defaultTopP,
      imagesCount: user.settings?.defaultImagesCount ?? 1,
      systemPrompt: user.settings?.defaultSystemPrompt || DEFAULT_CHAT_PROMPT,
      ...chat.settings,
    };

    const request: CreateMessageRequest = {
      chatId: chat.id,
      modelId: chatModelId,
      settings: chatSettings,
      content,
      mcpTokens: messageContext?.mcpTokens,
    };

    return request;
  }

  private checkModelFeatures(model: Model | null | undefined, user?: User): asserts model is Model {
    if (!model) throw new Error("Model not found or not accessible");

    if (model.type === ModelType.IMAGE_GENERATION && !user?.isFeatureEnabled(APPLICATION_FEATURE.IMAGE_GENERATION)) {
      throw new Error("Image generation is not enabled");
    }
    if (model.type === ModelType.VIDEO_GENERATION && !user?.isFeatureEnabled(APPLICATION_FEATURE.VIDEO_GENERATION)) {
      throw new Error("Video generation is not enabled");
    }
  }

  private async checkMessagesLimit(chatId: string, user: User): Promise<void> {
    const limit = user.isAdmin() ? -1 : globalConfig.limits.maxChatMessages;
    if (limit > -1) {
      const messagesCount = await this.messageRepository.count({
        where: { chat: { id: chatId }, user: { id: user.id } },
      });
      if (messagesCount >= limit) {
        throw new Error(
          `Chat messages limit of ${limit} reached. Please delete some messages before creating new ones.`
        );
      }
    }
  }
}
