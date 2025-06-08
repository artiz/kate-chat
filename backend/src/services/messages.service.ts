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
import { OUTPUT_FOLDER } from "@/config/application";
import { notEmpty, ok } from "@/utils/assert";
import { getErrorMessage } from "@/utils/errors";
import { DEFAULT_PROMPT } from "@/config/ai";
import { createLogger } from "@/utils/logger";
import { getRepository } from "@/config/database";
import { IncomingMessage } from "http";
import { QueueService } from "./queue.service";

const logger = createLogger(__filename);

// TODO: move to statics in MessagesService
// one staticGraphQL PubSub instance for subscriptions
const pubSub = new PubSub();
const clients: WeakMap<WebSocket, string> = new WeakMap<WebSocket, string>();

export class MessagesService {
  private queueService: QueueService;
  private messageRepository: Repository<Message>;
  private chatRepository: Repository<Chat>;
  private modelRepository: Repository<Model>;

  private aiService: AIService;

  constructor() {
    this.queueService = new QueueService(pubSub);
    this.aiService = new AIService();
    this.messageRepository = getRepository(Message);
    this.chatRepository = getRepository(Chat);
    this.modelRepository = getRepository(Model);
  }

  public connectClient(socket: WebSocket, request: IncomingMessage, chatId: string) {
    const clientIp = request.headers["x-forwarded-for"] || request.socket.remoteAddress;
    logger.info({ chatId, clientIp }, "Client connected");

    clients.set(socket, chatId);
    setTimeout(() => {
      pubSub.publish(NEW_MESSAGE, { chatId, data: { type: MessageType.SYSTEM } });
    }, 300);

    this.queueService.connectClient(socket, chatId);
  }

  public disconnectClient(socket: WebSocket) {
    const chatId = clients.get(socket);
    clients.delete(socket);
    this.queueService.disconnectClient(socket, chatId);
  }

  public publishGraphQL(routingKey: string, payload: unknown) {
    pubSub.publish(routingKey, payload);
  }

  public subscribeGraphQL(routingKey: string, dynamicId: unknown): AsyncIterable<unknown> {
    return {
      [Symbol.asyncIterator]: () => pubSub.asyncIterator(routingKey),
    };
  }

  public async createMessage(input: CreateMessageInput, user: User): Promise<Message> {
    const { chatId, modelId, images, role = MessageRole.USER } = input;
    let { content = "" } = input;

    if (!chatId) throw new Error("Chat ID is required");
    if (!modelId) throw new Error("Model ID is required");

    const chat = await this.chatRepository.findOne({
      where: { id: chatId },
    });
    if (!chat) throw new Error("Chat not found");

    // Verify the model exists
    const model = await this.modelRepository.findOne({
      where: { modelId },
    });
    if (!model) throw new Error("Model not found");

    // Create and save user message
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

      const date = new Date().toISOString().substring(0, 10);
      for (const image of images) {
        const imageId = randomUUID().toString();
        const ext = path.extname(image.fileName) || ".png"; // Default to .png if no extension
        const imageFile = await this.saveImageFromBase64(image.bytesBase64, `${date}-${imageId}${ext}`);

        jsonContent.push({
          content: image.bytesBase64,
          contentType: "image",
          fileName: imageFile,
          mimeType: image.mimeType,
        });

        // For display purposes, append image markdown to the content
        content += `${content ? "\n\n" : ""}![Uploaded Image](/output/${imageFile})`;
      }

      chat.files = [...(chat.files || []), ...images.map(img => img.fileName)];
      await this.chatRepository.save(chat);
    }

    let messageData = this.messageRepository.create({
      content,
      jsonContent,
      role,
      modelId: model.modelId, // real model used
      modelName: model.name,
      chatId,
      user,
      chat,
    });

    const message = await this.messageRepository.save(messageData);

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
      // TODO: make this configurable
      // Limit to last 100 messages for context
      take: 100,
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

      this.aiService.streamCompletion(model.apiProvider, request, requestMessages, handleStreaming);

      return message;
    }

    // sync call
    try {
      const aiResponse = await this.aiService.getCompletion(model.apiProvider, request, requestMessages);
      let content = aiResponse.content;
      if (aiResponse.type === "image") {
        // Save base64 image to output folder
        const fileName = await this.saveImageFromBase64(aiResponse.content, `${message.id}-res.png`);
        content = `![Generated Image](/output/${fileName})`;

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

  public async deleteMessage(id: string, deleteFollowing: boolean = false): Promise<string[]> {
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
              ? await this.messageRepository.findOne({
                  where: {
                    chatId,
                    createdAt: MoreThan(message.createdAt),
                    role: In([MessageRole.ASSISTANT, MessageRole.ERROR]),
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
      // Remove the files from the chat.files array
      if (chat.files?.length) {
        chat.files = chat.files.filter(file => !deletedImageFiles.includes(file));
        await this.chatRepository.save(chat);
      }

      // Delete the files from disk
      await Promise.all(
        deletedImageFiles.map(async fileName => {
          try {
            const filePath = path.join(OUTPUT_FOLDER, fileName);
            if (fs.existsSync(filePath)) {
              await fs.promises.unlink(filePath);
            }
          } catch (error) {
            logger.error(`Failed to delete file ${fileName}: ${error}`);
          }
        })
      );
    }

    return result; // Return all deleted message IDs including the original
  }

  public async saveImageFromBase64(content: string, filename: string): Promise<string> {
    if (!fs.existsSync(OUTPUT_FOLDER)) {
      fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
    }

    // Generate filename with messageId prefix
    const filepath = path.join(OUTPUT_FOLDER, filename);

    // Remove data URL prefix if present (e.g., "data:image/png;base64,")
    const base64Data = content.replace(/^data:image\/[a-z]+;base64,/, "");

    // Save base64 image to file
    await fs.promises.writeFile(filepath, base64Data, "base64");
    return filename;
  }
}
