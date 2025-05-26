import { Resolver, Query, Mutation, Arg, Ctx, ID } from "type-graphql";
import { Repository } from "typeorm";
import { Chat } from "../entities/Chat";
import { CreateChatInput, UpdateChatInput, GetChatsInput } from "../types/graphql/inputs";
import { getRepository } from "../config/database";
import { GraphQLContext } from "../middleware/authMiddleware";
import { User } from "../entities/User";
import { GqlChatsList } from "../types/graphql/responses";
import { AIService } from "../services/ai.service";

@Resolver(Chat)
export class ChatResolver {
  private chatRepository: Repository<Chat>;
  private userRepository: Repository<User>;

  constructor() {
    this.chatRepository = getRepository(Chat);
    this.userRepository = getRepository(User);
  }

  @Query(() => GqlChatsList)
  async getChats(
    @Arg("input", { nullable: true }) input: GetChatsInput = {},
    @Ctx() context: GraphQLContext
  ): Promise<GqlChatsList> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");
    const { offset = 0, limit = 20, searchTerm } = input;

    let query = {
      user: {
        id: user.userId,
      },
      isActive: true,
    } as any;

    if (searchTerm) {
      query = {
        ...query,
        $or: [{ title: { $regex: searchTerm, $options: "i" } }, { description: { $regex: searchTerm, $options: "i" } }],
      };
    }

    const total = await this.chatRepository.count({ where: query });

    const chats = await this.chatRepository.find({
      where: query,
      skip: offset,
      take: limit,
      order: { createdAt: "DESC" },
      relations: ["user"],
    });

    return {
      chats,
      total,
      hasMore: offset + chats.length < total,
    };
  }

  @Query(() => Chat, { nullable: true })
  async getChatById(@Arg("id", () => ID) id: string, @Ctx() context: GraphQLContext): Promise<Chat | null> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");

    const chat = await this.chatRepository.findOne({
      where: {
        id,
        isActive: true,
      },
      relations: ["user"],
    });

    if (!chat) return null;
    return chat;
  }

  @Mutation(() => Chat)
  async createChat(@Arg("input") input: CreateChatInput, @Ctx() context: GraphQLContext): Promise<Chat> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");
    const dbUser = await this.userRepository.findOne({
      where: { id: user.userId },
    });
    if (!dbUser) throw new Error("User not found");

    const chat = this.chatRepository.create({
      ...input,
      user: dbUser,
      isActive: true,
      isPristine: true,
    });

    return await this.chatRepository.save(chat);
  }

  @Mutation(() => Chat)
  async updateChat(
    @Arg("id", () => ID) id: string,
    @Arg("input") input: UpdateChatInput,
    @Ctx() context: GraphQLContext
  ): Promise<Chat> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");

    const chat = await this.chatRepository.findOne({
      where: {
        id,
        isActive: true,
      },
    });

    if (!chat) throw new Error("Chat not found");

    Object.assign(chat, input);
    return await this.chatRepository.save(chat);
  }

  @Mutation(() => Boolean)
  async deleteChat(@Arg("id", () => ID) id: string, @Ctx() context: GraphQLContext): Promise<boolean> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");

    const chat = await this.chatRepository.findOne({
      where: {
        id,
        isActive: true,
      },
    });

    if (!chat) throw new Error("Chat not found");

    chat.isActive = false;
    await this.chatRepository.save(chat);
    return true;
  }
}
