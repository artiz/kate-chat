import { Resolver, Query, Mutation, Arg, Ctx, ID } from "type-graphql";
import { Repository } from "typeorm";
import { Chat } from "../entities/Chat";
import { CreateChatInput, UpdateChatInput, GetChatsInput } from "../types/graphql/inputs";
import { ObjectId } from "mongodb";
import { getRepository } from "../config/database";
import { GraphQLContext } from "../middleware/authMiddleware";

@Resolver(Chat)
export class ChatResolver {
  private chatRepository: Repository<Chat>;

  constructor() {
    this.chatRepository = getRepository(Chat);
  }

  @Query(() => [Chat])
  async getChats(
    @Arg("input", { nullable: true }) input: GetChatsInput = {},
    @Ctx() context: GraphQLContext
  ): Promise<Chat[]> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");

    const { skip = 0, take = 20, searchTerm } = input;
    
    let query = { 
      user: user,
      isActive: true
    } as any;

    if (searchTerm) {
      query = {
        ...query,
        $or: [
          { title: { $regex: searchTerm, $options: "i" } },
          { description: { $regex: searchTerm, $options: "i" } },
        ],
      };
    }

    const chats = await this.chatRepository.find({
      where: query,
      skip,
      take,
      order: { createdAt: "DESC" },
    });

    return chats;
  }

  @Query(() => Chat, { nullable: true })
  async getChatById(
    @Arg("id", () => ID) id: string,
    @Ctx() context: GraphQLContext
  ): Promise<Chat | null> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");

    const chat = await this.chatRepository.findOne({
      where: {
        id,
        isActive: true,
      },
    });

    if (!chat) return null;
    return chat;
  }

  @Mutation(() => Chat)
  async createChat(
    @Arg("input") input: CreateChatInput,
    @Ctx() context: GraphQLContext
  ): Promise<Chat> {
    const { user } = context;
    if (!user) throw new Error("Authentication required");

    const chat = this.chatRepository.create({
      ...input,
      user,
      isActive: true,
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
  async deleteChat(
    @Arg("id", () => ID) id: string,
    @Ctx() context: GraphQLContext
  ): Promise<boolean> {
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
