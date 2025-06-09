import { Resolver, Query, Mutation, Arg, Ctx, Subscription, Root, ID } from "type-graphql";
import { Repository } from "typeorm";
import { Message, MessageRole, MessageType } from "@/entities/Message";
import { Chat, Model, User } from "@/entities";
import { CreateMessageInput, GetMessagesInput } from "@/types/graphql/inputs";
import { getRepository } from "@/config/database";
import { AIService } from "@/services/ai.service";
import { GraphQLContext } from "@/middleware/auth.middleware";
import { GqlMessage, GqlMessagesList } from "@/types/graphql/responses";
import { createLogger } from "@/utils/logger";
import { MessagesService } from "@/services/messages.service";

// Topics for PubSub
export const NEW_MESSAGE = "NEW_MESSAGE";

const logger = createLogger(__filename);

@Resolver(Message)
export class MessageResolver {
  private messageRepository: Repository<Message>;
  private chatRepository: Repository<Chat>;
  private userRepository: Repository<User>;
  private messageService: MessagesService;

  constructor() {
    this.messageRepository = getRepository(Message);
    this.chatRepository = getRepository(Chat);
    this.userRepository = getRepository(User);
    this.messageService = new MessagesService();
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
      where: { id: chatId },
    });

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
    if (!message.chat) return null;

    return message;
  }

  @Mutation(() => Message)
  async createMessage(@Arg("input") input: CreateMessageInput, @Ctx() context: GraphQLContext): Promise<Message> {
    // TODO: create BaseResolver to handle common logic like authentication
    if (!context.user) throw new Error("Authentication required");
    const user = await this.userRepository.findOne({
      where: { id: context.user.userId },
    });
    if (!user) throw new Error("User not found");

    return await this.messageService.createMessage(input, context.connectionParams, user);
  }

  @Subscription(() => GqlMessage, {
    topics: NEW_MESSAGE,
    filter: ({ payload, args }) => {
      logger.trace(`Filtering message for chat ${args.chatId}, payload chat: ${payload.chatId}`);
      return payload.chatId === args.chatId;
    },
  })
  newMessage(@Root() payload: { data: GqlMessage; chatId: string }, @Arg("chatId") chatId: string): GqlMessage {
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
    const { user } = context;
    if (!user) throw new Error("Authentication required");

    return await this.messageService.deleteMessage(id, deleteFollowing);
  }
}
