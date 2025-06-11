import { Resolver, Query, Mutation, Arg, Ctx, Subscription, Root, ID } from "type-graphql";
import { Repository } from "typeorm";
import { Message, MessageType } from "@/entities/Message";
import { Chat } from "@/entities";
import { CreateMessageInput, GetMessagesInput } from "@/types/graphql/inputs";
import { getRepository } from "@/config/database";
import { GraphQLContext } from "@/middleware/auth.middleware";
import { GqlMessage, GqlMessagesList } from "@/types/graphql/responses";
import { createLogger } from "@/utils/logger";
import { MessagesService } from "@/services/messages.service";
import { BaseResolver } from "./base.resolver";

// Topics for PubSub
export const NEW_MESSAGE = "NEW_MESSAGE";

const logger = createLogger(__filename);

@Resolver(Message)
export class MessageResolver extends BaseResolver {
  private messageRepository: Repository<Message>;
  private chatRepository: Repository<Chat>;
  private messageService: MessagesService;

  constructor() {
    super(); // Call the constructor of BaseResolver to initialize userRepository
    this.messageRepository = getRepository(Message);
    this.chatRepository = getRepository(Chat);
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
}
