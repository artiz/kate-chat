import { Resolver, Query, Mutation, Arg, Ctx, Subscription, Root, ID } from "type-graphql";
import { Repository } from "typeorm";
import { Message } from "@/entities/Message";
import { Chat, Model } from "@/entities";
import { CreateMessageInput, GetMessagesInput, SwitchModelInput, GetImagesInput } from "@/types/graphql/inputs";
import { getRepository } from "@/config/database";
import { GraphQLContext } from "@/middleware/auth.middleware";
import { GqlMessage, GqlMessagesList, SwitchModelResponse, GqlImagesList, GqlImage } from "@/types/graphql/responses";
import { createLogger } from "@/utils/logger";
import { MessagesService } from "@/services/messages.service";
import { BaseResolver } from "./base.resolver";
import { MessageType } from "@/types/ai.types";

// Topics for PubSub
export const NEW_MESSAGE = "NEW_MESSAGE";

const logger = createLogger(__filename);

@Resolver(Message)
export class MessageResolver extends BaseResolver {
  private messageRepository: Repository<Message>;
  private chatRepository: Repository<Chat>;
  private modelRepository: Repository<Model>;
  private messageService: MessagesService;

  constructor() {
    super(); // Call the constructor of BaseResolver to initialize userRepository
    this.messageRepository = getRepository(Message);
    this.chatRepository = getRepository(Chat);
    this.modelRepository = getRepository(Model);
    this.messageService = new MessagesService();
  }

  @Query(() => GqlMessagesList)
  async getChatMessages(
    @Arg("input") input: GetMessagesInput,
    @Ctx() context: GraphQLContext
  ): Promise<GqlMessagesList> {
    const token = await this.validateContextToken(context);
    const { chatId, offset: skip = 0, limit: take = 20 } = input;

    // Verify the chat belongs to the user
    const chat = await this.chatRepository
      .createQueryBuilder("chat")
      .addSelect(sq => {
        return sq.select("COUNT(*)").from(Message, "m").where("m.chatId = chat.id");
      }, "chat_messagesCount")
      .leftJoinAndSelect("chat.user", "user")
      .where({ id: chatId, user: { id: token.userId } })
      .getOne();

    if (!chat) throw new Error("Chat not found");

    // Get messages for the chat
    const where = { chatId };
    const messages = await this.messageRepository
      .find({
        where,
        skip,
        take,
        order: { createdAt: "DESC", role: "ASC" },
        relations: ["user"],
      })
      .then(messages => messages.reverse());

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
    await this.validateContextToken(context);

    const message = await this.messageRepository.findOne({
      where: {
        id,
      },
      relations: ["chat"],
    });

    if (!message) return null;

    // Verify the message belongs to an active chat
    if (!message.chat) return null;

    return message;
  }

  @Query(() => GqlImagesList)
  async getAllImages(@Arg("input") input: GetImagesInput, @Ctx() context: GraphQLContext): Promise<GqlImagesList> {
    const token = await this.validateContextToken(context);
    const { offset: skip = 0, limit: take = 50 } = input;

    // Get all messages with images for the user
    const messages = await this.messageRepository
      .createQueryBuilder("message")
      .leftJoinAndSelect("message.chat", "chat")
      .leftJoinAndSelect("message.user", "user")
      .where("chat.userId = :userId", { userId: token.userId })
      .andWhere("message.jsonContent IS NOT NULL")
      .orderBy("message.createdAt", "DESC")
      .skip(skip)
      .take(take)
      .getMany();

    // Extract images from jsonContent and create GqlImage objects
    const images: GqlImage[] = [];

    for (const message of messages) {
      if (message.jsonContent) {
        for (const content of message.jsonContent) {
          if (content.contentType === "image" && content.fileName) {
            images.push({
              id: `${message.id}-${content.fileName}`,
              fileName: content.fileName,
              fileUrl: `/files/${content.fileName}`,
              mimeType: content.mimeType || "image/jpeg",
              role: message.role,
              createdAt: message.createdAt,
              message: message,
              chat: message.chat!,
            });
          }
        }
      }
    }

    // Get total count
    const totalMessages = await this.messageRepository
      .createQueryBuilder("message")
      .leftJoin("message.chat", "chat")
      .where("chat.userId = :userId", { userId: token.userId })
      .andWhere("message.jsonContent IS NOT NULL")
      .getCount();

    const nextPage = skip + take;
    return {
      images,
      total: images.length,
      nextPage: nextPage < totalMessages ? nextPage : undefined,
    };
  }

  @Mutation(() => Message)
  async createMessage(@Arg("input") input: CreateMessageInput, @Ctx() context: GraphQLContext): Promise<Message> {
    const user = await this.validateContextUser(context);
    return await this.messageService.createMessage(input, context.connectionParams, user);
  }

  @Subscription(() => GqlMessage, {
    topics: NEW_MESSAGE,
    filter: ({ payload, args }) => {
      logger.trace(`Filtering message for chat ${args.chatId}, payload chat: ${payload.chatId}`);
      return payload.chatId === args.chatId;
    },
  })
  async newMessage(
    @Root() payload: { data: GqlMessage; chatId: string },
    @Arg("chatId") chatId: string,
    @Ctx() context: GraphQLContext
  ): Promise<GqlMessage> {
    await this.validateContextToken(context);

    const { message, type = MessageType.MESSAGE, error, ...rest } = payload.data;
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
      ...rest,
    };
  }

  @Mutation(() => [ID])
  async deleteMessage(
    @Arg("id", () => ID) id: string,
    @Arg("deleteFollowing", { nullable: true }) deleteFollowing: boolean = false,
    @Ctx() context: GraphQLContext
  ): Promise<string[]> {
    await this.validateContextToken(context);
    return await this.messageService.deleteMessage(context.connectionParams, id, deleteFollowing);
  }

  @Mutation(() => SwitchModelResponse)
  async switchModel(
    @Arg("messageId", () => ID) messageId: string,
    @Arg("modelId") modelId: string,
    @Ctx() context: GraphQLContext
  ): Promise<SwitchModelResponse> {
    try {
      const user = await this.validateContextUser(context);
      const message = await this.messageService.switchMessageModel(messageId, modelId, context.connectionParams, user);
      return { message };
    } catch (error) {
      logger.error(error, "Error switching model");
      return { error: `Failed to switch model: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
