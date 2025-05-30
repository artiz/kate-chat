import * as fs from "fs";
import * as path from "path";

import { Resolver, Query, Mutation, Arg, Ctx, Subscription, Root } from "type-graphql";
import { PubSubEngine } from "graphql-subscriptions";
import { Repository } from "typeorm";
import { Message, MessageRole, MessageType } from "@/entities/Message";
import { Chat } from "@/entities/Chat";
import { CreateMessageInput, GetMessagesInput } from "@/types/graphql/inputs";
import { Model } from "@/entities/Model";
import { getRepository } from "@/config/database";
import { AIService } from "@/services/ai.service";
import { GraphQLContext } from "@/middleware/authMiddleware";
import { User } from "@/entities/User";
import { getErrorMessage } from "@/utils/errors";
import { GqlMessage, GqlMessagesList } from "@/types/graphql/responses";
import { ok } from "assert";
import { createLogger } from "@/utils/logger";
import { DEFAULT_PROMPT } from "@/config/ai";

// Topics for PubSub
export const NEW_MESSAGE = "NEW_MESSAGE";
const OUTPUT_FOLDER = process.env.OUTPUT_FOLDER || path.join(__dirname, "../../output");

const logger = createLogger(__filename);

@Resolver(Message)
export class MessageResolver {
  private messageRepository: Repository<Message>;
  private chatRepository: Repository<Chat>;
  private userRepository: Repository<User>;
  private modelRepository: Repository<Model>;
  private aiService: AIService;

  constructor() {
    this.messageRepository = getRepository(Message);
    this.chatRepository = getRepository(Chat);
    this.modelRepository = getRepository(Model);
    this.userRepository = getRepository(User);
    this.aiService = new AIService();
  }

  @Query(() => GqlMessagesList)
  async getChatMessages(
    @Arg("input") input: GetMessagesInput,
    @Ctx() context: GraphQLContext
  ): Promise<GqlMessagesList> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");

    const { chatId, offset: skip = 0, limit: take = 20 } = input;

    // Verify the chat belongs to the user
    const chat = await this.chatRepository.findOne({
      where: {
        id: chatId,
        isActive: true,
      },
    });

    if (!chat) throw new Error("Chat not found");

    // Get messages for the chat
    const where = { chatId };
    const messages = await this.messageRepository.find({
      where,
      skip,
      take,
      order: { createdAt: "ASC" },
      relations: ["user"],
    });

    const total = await this.messageRepository.count({
      where,
    });

    return {
      messages,
      total,
      hasMore: skip + messages.length < total,
      chat, // Include the chat details in the response
    };
  }

  @Query(() => Message, { nullable: true })
  async getMessageById(@Arg("id") id: string, @Ctx() context: GraphQLContext): Promise<Message | null> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");

    const message = await this.messageRepository.findOne({
      where: {
        id,
      },
      relations: ["chat"],
    });

    if (!message) return null;

    // Verify the message belongs to an active chat
    if (!message.chat?.isActive) return null;

    return message;
  }

  @Mutation(() => Message)
  async createMessage(@Arg("input") input: CreateMessageInput, @Ctx() context: GraphQLContext): Promise<Message> {
    if (!context.user) throw new Error("Authentication required");
    const user = await this.userRepository.findOne({
      where: { id: context.user.userId },
    });
    if (!user) throw new Error("User not found");

    const { chatId, content, role = MessageRole.USER } = input;
    let { modelId } = input;

    // Verify the chat belongs to the user
    const chat = await this.chatRepository.findOne({
      where: {
        id: chatId,
        isActive: true,
      },
    });

    if (!chat) throw new Error("Chat not found");

    if (!modelId) {
      throw new Error("ModelId is required");
    }

    // Verify the model exists
    const model = await this.modelRepository.findOne({
      where: {
        modelId,
      },
    });
    if (!model) throw new Error("Model not found");

    // Create and save user message
    let messageData = this.messageRepository.create({
      content,
      // jsonContent, // TODO: use to save images
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

    const { pubSub } = context;

    // Publish the new message event if pubSub is available
    if (pubSub) {
      logger.debug(`Publishing user message event for chat ${chatId}`);
      await pubSub.publish(NEW_MESSAGE, {
        chatId,
        data: { message },
      });
    }

    // Get previous messages for context (limited to 20 for performance)
    const previousMessages = await this.messageRepository.find({
      where: { chatId },
      order: { createdAt: "DESC" },
      take: 100,
    });

    // Generate AI response
    const requestMessages = previousMessages.reverse();
    const systemPrompt = user.defaultSystemPrompt || DEFAULT_PROMPT;

    const completeRequest = async (aiMessage: Message) => {
      ok(aiMessage);
      const savedMessage = await this.messageRepository.save(aiMessage);

      // Publish the new message event for the AI response if pubSub is available
      if (pubSub) {
        await pubSub.publish(NEW_MESSAGE, {
          chatId,
          data: { message: savedMessage },
        });
      }
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
            const errorMessage = getErrorMessage(error);

            if (pubSub) {
              await pubSub.publish(NEW_MESSAGE, {
                chatId,
                data: { error: errorMessage },
              });
            }

            aiMessage.role = MessageRole.ERROR;
            aiMessage.content = errorMessage;
            completeRequest(aiMessage).catch(err => {
              logger.error(err, "Error sending AI response");
            });

            return logger.error(error, "Error generating AI response");
          }

          aiMessage.content = token;
          completeRequest(aiMessage).catch(err => {
            logger.error(error, "Error sending AI response");
          });

          // stream token
        } else {
          aiMessage.content += token;
          if (pubSub) {
            await pubSub.publish(NEW_MESSAGE, {
              chatId,
              data: { message: aiMessage },
            });
          }
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
        const fileName = await saveImageFromBase64(aiResponse.content, message.id);
        content = `![Generated Image](/output/${fileName})`;
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

      if (pubSub) {
        logger.debug(`Publishing AI response event for chat ${chatId}`);
        await pubSub.publish(NEW_MESSAGE, {
          chatId,
          data: { error: getErrorMessage(error) },
        });
      }

      throw new Error(`Failed to generate AI response: ${getErrorMessage(error)}`);
    }

    return message;
  }

  @Subscription(() => GqlMessage, {
    topics: NEW_MESSAGE,
    filter: ({ payload, args }) => {
      logger.trace(`Filtering message for chat ${args.chatId}, payload chat: ${payload.chatId}`);
      return payload.chatId === args.chatId;
    },
  })
  newMessage(@Root() payload: { data: GqlMessage; chatId: string }, @Arg("chatId") chatId: string): GqlMessage {
    const { message, error, type = MessageType.MESSAGE } = payload.data;

    logger.trace(
      {
        type,
        messageId: message?.id,
        role: message?.role,
        error,
      },
      `Publishing message to chat ${chatId} subscribers`
    );

    return {
      message,
      error,
      type,
    };
  }

  @Mutation(() => Boolean)
  async deleteMessage(@Arg("id") id: string, @Ctx() context: GraphQLContext): Promise<boolean> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");

    const message = await this.messageRepository.findOne({
      where: {
        id,
      },
    });

    if (!message) throw new Error("Message not found");

    await this.messageRepository.remove(message);
    return true;
  }
}

async function saveImageFromBase64(content: string, messageId: string, ndx = 0): Promise<string> {
  if (!fs.existsSync(OUTPUT_FOLDER)) {
    fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
  }

  // Generate filename with messageId prefix
  const filename = `${messageId}-${ndx}.png`;
  const filepath = path.join(OUTPUT_FOLDER, filename);

  // Remove data URL prefix if present (e.g., "data:image/png;base64,")
  const base64Data = content.replace(/^data:image\/[a-z]+;base64,/, "");

  // Save base64 image to file
  await fs.promises.writeFile(filepath, base64Data, "base64");
  return filename;
}
