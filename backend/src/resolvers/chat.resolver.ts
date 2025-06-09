import fs from "fs";
import { Resolver, Query, Mutation, Arg, Ctx, ID } from "type-graphql";
import { Repository } from "typeorm";
import { Chat } from "../entities/Chat";
import { CreateChatInput, UpdateChatInput, GetChatsInput } from "../types/graphql/inputs";
import { getRepository } from "../config/database";
import { GraphQLContext } from "../middleware/auth.middleware";
import { User } from "../entities/User";
import { GqlChatsList } from "../types/graphql/responses";
import { AIService } from "../services/ai.service";
import { Message, MessageRole } from "@/entities/Message";
import { MessageEvent } from "http";
import { OUTPUT_FOLDER } from "@/config/application";
import path from "path";
import { ok } from "assert";
import { BaseResolver } from "./base.resolver";

@Resolver(Chat)
export class ChatResolver extends BaseResolver {
  private chatRepository: Repository<Chat>;

  constructor() {
    super();
    this.chatRepository = getRepository(Chat);
  }

  @Query(() => GqlChatsList)
  async getChats(
    @Arg("input", { nullable: true }) input: GetChatsInput = {},
    @Ctx() context: GraphQLContext
  ): Promise<GqlChatsList> {
    const user = await this.validateContextToken(context);
    const { offset = 0, limit = 20, searchTerm } = input;

    let query = {
      user: {
        id: user.userId,
      },
    } as any;

    if (searchTerm) {
      query = {
        ...query,
        $or: [{ title: { $regex: searchTerm, $options: "i" } }, { description: { $regex: searchTerm, $options: "i" } }],
      };
    }

    const total = await this.chatRepository.count({ where: query });
    const chats = await this.chatRepository
      .createQueryBuilder("chat")
      .addSelect(sq => {
        return sq.select("COUNT(*)").from(Message, "m").where("m.chatId = chat.id");
      }, "chat_messagesCount")
      .addSelect(sq => {
        return sq
          .select("m.content")
          .from(Message, "m")
          .where("m.chatId = chat.id and m.role = :role", { role: MessageRole.ASSISTANT })
          .orderBy("createdAt", "DESC")
          .limit(1);
      }, "chat_lastBotMessage")
      .addSelect(sq => {
        return sq
          .select("m.id")
          .from(Message, "m")
          .where("m.chatId = chat.id and m.role = :role", { role: MessageRole.ASSISTANT })
          .orderBy("createdAt", "DESC")
          .limit(1);
      }, "chat_lastBotMessageId")
      .leftJoinAndSelect("chat.user", "user")
      .where(query)
      .skip(offset)
      .take(limit)
      .orderBy("chat.createdAt", "DESC")
      .getMany();

    return {
      chats,
      total,
      hasMore: offset + chats.length < total,
    };
  }

  @Query(() => Chat, { nullable: true })
  async getChatById(@Arg("id", () => ID) id: string, @Ctx() context: GraphQLContext): Promise<Chat | null> {
    const user = await this.validateContextToken(context);

    const chat = await this.chatRepository.findOne({
      where: { id, user: { id: user.userId } },
      relations: ["user"],
    });

    if (!chat) return null;
    return chat;
  }

  @Mutation(() => Chat)
  async createChat(@Arg("input") input: CreateChatInput, @Ctx() context: GraphQLContext): Promise<Chat> {
    const user = await this.validateContextUser(context);
    const chat = this.chatRepository.create({
      ...input,
      user,
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
    await this.validateContextToken(context);

    const chat = await this.chatRepository.findOne({
      where: { id },
    });

    if (!chat) throw new Error("Chat not found");

    Object.assign(chat, input);
    return await this.chatRepository.save(chat);
  }

  @Mutation(() => Boolean)
  async deleteChat(@Arg("id", () => ID) id: string, @Ctx() context: GraphQLContext): Promise<boolean> {
    await this.validateContextToken(context);

    const chat = await this.chatRepository.findOne({
      where: {
        id,
      },
    });

    if (!chat) throw new Error("Chat not found");

    if (chat.files?.length) {
      const queue = [...chat.files];
      await Promise.all(
        Array.from({ length: 5 }, async () => {
          while (queue.length) {
            const fileName = queue.pop();
            ok(fileName);
            await fs.promises.unlink(path.join(OUTPUT_FOLDER, fileName));
          }
        })
      );
    }

    await this.chatRepository.delete({ id });
    return true;
  }
}
