import { Resolver, Query, Mutation, Arg, Ctx, Subscription, Root, ID, FieldResolver } from "type-graphql";
import { Repository, IsNull, In } from "typeorm";
import { Chat, Message, Document } from "@/entities";
import { CreateMessageInput, GetMessagesInput, GetImagesInput, CallOtherInput } from "@/types/graphql/inputs";
import { getRepository } from "@/config/database";
import { GraphQLContext } from ".";
import {
  GqlMessage,
  GqlMessagesList,
  SwitchModelResponse,
  EditMessageResponse,
  GqlImagesList,
  GqlImage,
  CallOtherResponse,
  DeleteMessageResponse,
} from "@/types/graphql/responses";
import { createLogger } from "@/utils/logger";
import { BaseResolver } from "./base.resolver";
import { MessageType } from "@/types/ai.types";
import { notEmpty } from "@/utils/assert";
import { ok } from "assert";
import { S3Service } from "@/services/data";
import { ChatsService } from "@/services/chats.service";
import { isAdmin } from "@/utils/jwt";
import { NEW_MESSAGE } from "@/services/messaging";

const logger = createLogger(__filename);

@Resolver(Message)
export class MessageResolver extends BaseResolver {
  private messageRepository: Repository<Message>;
  private chatsService: ChatsService;

  constructor() {
    super(); // Call the constructor of BaseResolver to initialize userRepository
    this.messageRepository = getRepository(Message);
    this.chatsService = new ChatsService();
  }

  @Query(() => GqlMessagesList)
  async getChatMessages(
    @Arg("input") input: GetMessagesInput,
    @Ctx() context: GraphQLContext
  ): Promise<GqlMessagesList> {
    const token = await this.validateContextToken(context);
    const { chatId, offset: skip = 0, limit: take = 20 } = input;

    const chat = await this.chatsService.getChat(chatId, isAdmin(token) ? undefined : token.userId);

    if (!chat) {
      return {
        error: "Chat not found",
        messages: [],
      };
    }

    // Get messages for the chat (excluding linked messages)
    const where = { chatId, linkedToMessageId: IsNull() };
    const messages = await this.messageRepository
      .find({
        where,
        skip,
        take,
        order: { createdAt: "DESC", role: "ASC" },
        relations: ["user"],
      })
      .then(messages => messages.reverse());

    // load linked messages
    const ids = messages.map(m => m.id).filter(notEmpty);
    const linkedMessages = (
      await this.messageRepository.find({
        where: { linkedToMessageId: In(ids) },
        order: { linkedToMessageId: "ASC", createdAt: "DESC", role: "ASC" },
        relations: ["user"],
      })
    ).reduce(
      (acc, msg) => {
        ok(msg.linkedToMessageId);
        acc[msg.linkedToMessageId] = acc[msg.linkedToMessageId] || [];
        acc[msg.linkedToMessageId].push(msg);
        return acc;
      },
      {} as Record<string, Message[]>
    );
    messages.forEach(m => (m.linkedMessages = linkedMessages[m.id]));

    const total = await this.messageRepository.count({ where });

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
      where: { id },
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
    const messageService = this.getMessagesService(context);
    const user = await this.validateContextUser(context);
    return await messageService.createMessage(input, this.loadConnectionParams(context, user), user);
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

  @Mutation(() => DeleteMessageResponse)
  async deleteMessage(
    @Arg("id", () => ID) id: string,
    @Arg("deleteFollowing", { nullable: true }) deleteFollowing: boolean = false,
    @Ctx() context: GraphQLContext
  ): Promise<DeleteMessageResponse> {
    const user = await this.validateContextUser(context);
    const messageService = this.getMessagesService(context);
    return await messageService.deleteMessage(this.loadConnectionParams(context, user), id, deleteFollowing, user);
  }

  @Mutation(() => SwitchModelResponse)
  async switchModel(
    @Arg("messageId", () => ID) messageId: string,
    @Arg("modelId") modelId: string,
    @Ctx() context: GraphQLContext
  ): Promise<SwitchModelResponse> {
    try {
      const user = await this.validateContextUser(context);
      const messageService = this.getMessagesService(context);
      const message = await messageService.switchMessageModel(
        messageId,
        modelId,
        this.loadConnectionParams(context, user),
        user
      );
      return { message };
    } catch (error) {
      logger.error(error, "Error switching model");
      return { error: `Failed to switch model: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  @Mutation(() => CallOtherResponse)
  async callOther(@Arg("input") input: CallOtherInput, @Ctx() context: GraphQLContext): Promise<CallOtherResponse> {
    try {
      const user = await this.validateContextUser(context);
      const messageService = this.getMessagesService(context);
      const message = await messageService.callOtherModel(
        input.messageId,
        input.modelId,
        this.loadConnectionParams(context, user),
        user
      );

      return { message };
    } catch (error) {
      logger.error(error, "Error calling other models");
      return { error: `Failed to call other models: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  @Mutation(() => EditMessageResponse)
  async editMessage(
    @Arg("messageId", () => ID) messageId: string,
    @Arg("content") content: string,
    @Ctx() context: GraphQLContext
  ): Promise<EditMessageResponse> {
    try {
      const user = await this.validateContextUser(context);
      const messageService = this.getMessagesService(context);
      const message = await messageService.editMessage(
        messageId,
        content,
        this.loadConnectionParams(context, user),
        user
      );
      return { message };
    } catch (error) {
      logger.error(error, "Error editing message");
      return { error: `Failed to edit message: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  // @FieldResolver(() => [Message])
  // async linkedMessages(@Root() message: Message): Promise<Message[]> {
  //   if (!message.id) return [];

  //   return await this.messageRepository.find({
  //     where: { linkedToMessageId: message.id },
  //     order: { createdAt: "ASC" },
  //     relations: ["user"],
  //   });
  // }
}
