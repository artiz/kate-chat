import { Resolver, Query, Mutation, Arg, Ctx, Subscription, Root, ID, FieldResolver } from "type-graphql";
import { Repository, IsNull, In } from "typeorm";
import { Message, ChatFile } from "@/entities";
import {
  CreateMessageInput,
  GetMessagesInput,
  GetImagesInput,
  StopMessageGenerationInput,
  MessageContext,
} from "@/types/graphql/inputs";
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
  StopMessageGenerationResponse,
} from "@/types/graphql/responses";
import { createLogger } from "@/utils/logger";
import { BaseResolver } from "./base.resolver";
import { MessageRole, MessageType } from "@/types/api";
import { ok, notEmpty } from "@/utils/assert";
import { ChatsService } from "@/services/chats.service";
import { isAdmin } from "@/utils/jwt";
import { ChatFileType } from "@/entities/ChatFile";
import { globalConfig } from "@/global-config";

const logger = createLogger(__filename);

@Resolver(Message)
export class MessageResolver extends BaseResolver {
  private messageRepository: Repository<Message>;
  private chatFileRepository: Repository<ChatFile>;
  private chatsService: ChatsService;

  constructor() {
    super(); // Call the constructor of BaseResolver to initialize userRepository
    this.messageRepository = getRepository(Message);
    this.chatFileRepository = getRepository(ChatFile);
    this.chatsService = new ChatsService();
  }

  @Mutation(() => ChatFile)
  async reloadChatFileMetadata(@Arg("id") id: string, @Ctx() context: GraphQLContext): Promise<ChatFile> {
    const token = await this.validateContextToken(context);
    const user = await this.userRepository.findOne({ where: { id: token.userId } });
    if (!user) throw new Error("User not found");

    if (!context.messagesService) {
      throw new Error("Messages service not initialized");
    }

    return context.messagesService.reloadChatFileMetadata(id, user);
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
    const { offset: skip = 0, limit: take = 100 } = input;

    // Get all images for the user from ChatFile
    const files = await this.chatFileRepository
      .createQueryBuilder("chatFile")
      .innerJoinAndSelect("chatFile.chat", "chat")
      .leftJoinAndSelect("chatFile.message", "message")
      .where("chat.userId = :userId", { userId: token.userId })
      .andWhere("chatFile.type = :type", { type: ChatFileType.IMAGE })
      .orderBy("chatFile.createdAt", "DESC")
      .skip(skip)
      .take(take + 1)
      .getMany();

    const nextPage = files.length > take ? skip + take : undefined;
    const items = nextPage ? files.slice(0, -1) : files;

    // Create GqlImage objects from ChatFile
    const images: GqlImage[] = items.map(file => ({
      id: file.id,
      fileName: file.fileName || "",
      fileUrl: `/files/${file.fileName}`,
      mime: file.mime || "image/png", // ChatFile doesn't store mimeType explicitly, assume image
      predominantColor: file.predominantColor,
      role: file.message?.role || MessageRole.USER,
      createdAt: file.createdAt,
      message: file.message,
      chat: file.chat,
    }));

    return {
      images,
      nextPage,
    };
  }

  @Mutation(() => Message)
  async createMessage(@Arg("input") input: CreateMessageInput, @Ctx() context: GraphQLContext): Promise<Message> {
    const messageService = this.getMessagesService(context);
    const user = await this.validateContextUser(context);

    return await messageService.createMessage({ ...input }, this.loadConnectionParams(context, user), user);
  }

  @Subscription(() => GqlMessage, {
    topics: globalConfig.redis.channelChatMessage,
    filter: ({ payload, args }) => {
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
    @Arg("messageContext", { nullable: true }) messageContext: MessageContext,
    @Ctx() context: GraphQLContext
  ): Promise<SwitchModelResponse> {
    try {
      const user = await this.validateContextUser(context);
      const messageService = this.getMessagesService(context);
      const message = await messageService.switchMessageModel(
        messageId,
        modelId,
        this.loadConnectionParams(context, user),
        user,
        messageContext
      );
      return { message };
    } catch (error) {
      logger.error(error, "Error switching model");
      return { error: `Failed to switch model: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  @Mutation(() => CallOtherResponse)
  async callOther(
    @Arg("messageId", () => ID) messageId: string,
    @Arg("modelId") modelId: string,
    @Arg("messageContext", { nullable: true }) messageContext: MessageContext,
    @Ctx() context: GraphQLContext
  ): Promise<CallOtherResponse> {
    try {
      const user = await this.validateContextUser(context);
      const messageService = this.getMessagesService(context);

      const message = await messageService.callOtherModel(
        messageId,
        modelId,
        this.loadConnectionParams(context, user),
        user,
        messageContext
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
    @Arg("messageContext", { nullable: true }) messageContext: MessageContext,
    @Ctx() context: GraphQLContext
  ): Promise<EditMessageResponse> {
    try {
      const user = await this.validateContextUser(context);
      const messageService = this.getMessagesService(context);
      const message = await messageService.editMessage(
        messageId,
        content,
        this.loadConnectionParams(context, user),
        user,
        messageContext
      );
      return { message };
    } catch (error) {
      logger.error(error, "Error editing message");
      return { error: `Failed to edit message: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  @Mutation(() => StopMessageGenerationResponse)
  async stopMessageGeneration(
    @Arg("input") input: StopMessageGenerationInput,
    @Ctx() context: GraphQLContext
  ): Promise<StopMessageGenerationResponse> {
    try {
      const user = await this.validateContextUser(context);
      const messageService = this.getMessagesService(context);

      await messageService.stopMessageGeneration(
        input.requestId,
        input.messageId,
        this.loadConnectionParams(context, user),
        user
      );

      return { ...input };
    } catch (error) {
      logger.error(error, "Error stopping message generation");
      return {
        ...input,
        error: `Failed to stop message generation: ${error instanceof Error ? error.message : String(error)}`,
      };
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
