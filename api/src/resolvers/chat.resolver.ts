import { Resolver, Query, Mutation, Arg, Ctx, ID, Root, FieldResolver } from "type-graphql";
import { ILike, In, Repository } from "typeorm";
import { CreateChatInput, UpdateChatInput, GetChatsInput } from "../types/graphql/inputs";
import { getRepository } from "../config/database";
import { GraphQLContext } from ".";
import { AddDocumentsToChatResponse, GqlChatsList, RemoveDocumentsFromChatResponse } from "../types/graphql/responses";
import { Message, Document, Chat, ChatDocument } from "@/entities";
import { BaseResolver } from "./base.resolver";
import { MessageRole } from "@/types/ai.types";
import { ChatsService } from "@/services/chats.service";
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, DEFAULT_TOP_P } from "@/config/ai/common";
import { DEFAULT_CHAT_PROMPT } from "@/config/ai/prompts";

@Resolver(Chat)
export class ChatResolver extends BaseResolver {
  private chatRepository: Repository<Chat>;
  private chatDocumentRepo: Repository<ChatDocument>;
  private chatService: ChatsService;

  constructor() {
    super();
    this.chatRepository = getRepository(Chat);
    this.chatDocumentRepo = getRepository(ChatDocument);
    this.chatService = new ChatsService();
  }

  @Query(() => GqlChatsList)
  async getChats(
    @Arg("input", { nullable: true }) input: GetChatsInput = {},
    @Ctx() context: GraphQLContext
  ): Promise<GqlChatsList> {
    const user = await this.validateContextToken(context);
    const { from = 0, limit = 20, searchTerm } = input;

    let query = {
      user: {
        id: user.userId,
      },
    } as any;

    if (searchTerm) {
      query = query.where([{ title: ILike(`%${searchTerm}%`) }, { description: ILike(`%${searchTerm}%`) }]);
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
          .where("m.chatId = chat.id and m.role = :role and m.linkedToMessageId IS NULL", {
            role: MessageRole.ASSISTANT,
          })
          .orderBy("m.createdAt", "DESC")
          .limit(1);
      }, "chat_lastBotMessage")
      .addSelect(sq => {
        return sq
          .select("m.id")
          .from(Message, "m")
          .where("m.chatId = chat.id and m.role = :role and m.linkedToMessageId IS NULL", {
            role: MessageRole.ASSISTANT,
          })
          .orderBy("m.createdAt", "DESC")
          .limit(1);
      }, "chat_lastBotMessageId")
      .leftJoinAndSelect("chat.user", "user")
      .where(query)
      .skip(from)
      .take(limit)
      .orderBy("chat.updatedAt", "DESC")
      .getMany();

    return {
      chats,
      total,
      next: from + chats.length < total ? from + chats.length : undefined,
    };
  }

  @Query(() => Chat, { nullable: true })
  async chatById(@Arg("id", () => ID) id: string, @Ctx() context: GraphQLContext): Promise<Chat | null> {
    const user = await this.validateContextToken(context);

    return this.chatService.getChat(id, user.userId);
  }

  @Query(() => Chat, { nullable: true })
  async findPristineChat(@Ctx() context: GraphQLContext): Promise<Chat | null> {
    const user = await this.validateContextToken(context);

    return await this.chatRepository
      .createQueryBuilder("chat")
      .leftJoinAndSelect("chat.user", "user")
      .where({
        user: {
          id: user.userId,
        },
        isPristine: true,
      })
      .orderBy("chat.updatedAt", "DESC")
      .getOne();
  }

  @Mutation(() => Chat)
  async createChat(@Arg("input") input: CreateChatInput, @Ctx() context: GraphQLContext): Promise<Chat> {
    const user = await this.validateContextUser(context);
    const chat = this.chatRepository.create({
      ...input,
      title: input.title || "",
      user,
      systemPrompt: user.defaultSystemPrompt || DEFAULT_CHAT_PROMPT,
      temperature: user.defaultTemperature ?? DEFAULT_TEMPERATURE,
      maxTokens: user.defaultMaxTokens ?? DEFAULT_MAX_TOKENS,
      topP: user.defaultTopP ?? DEFAULT_TOP_P,
      imagesCount: user.defaultImagesCount ?? 1,
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

    Object.assign(chat, {
      ...input,
      isPristine: false,
    });
    return await this.chatRepository.save(chat);
  }

  @Mutation(() => Boolean)
  async deleteChat(@Arg("id", () => ID) id: string, @Ctx() context: GraphQLContext): Promise<boolean> {
    const user = await this.validateContextUser(context);
    const messageService = this.getMessagesService(context);

    const chat = await this.chatRepository.findOne({
      where: {
        id,
      },
    });

    if (!chat) throw new Error("Chat not found");
    if (chat.files?.length) {
      messageService.removeFiles(chat.files, user);
    }

    await this.chatRepository.delete({ id });
    return true;
  }

  @Mutation(() => AddDocumentsToChatResponse)
  async addDocumentsToChat(
    @Arg("documentIds", () => [ID]) documentIds: string[],
    @Arg("chatId", () => ID) chatId: string,
    @Ctx() context: GraphQLContext
  ): Promise<AddDocumentsToChatResponse> {
    const user = await this.validateContextToken(context);

    const alreadyAdded = await this.chatDocumentRepo.find({
      where: [{ documentId: In(documentIds), chatId }],
    });

    const idsToAdd = documentIds.filter(id => !alreadyAdded.find(ad => ad.documentId === id && ad.chatId === chatId));

    if (idsToAdd.length === 0) {
      return { error: "No new documents to add" };
    }

    const docs = this.chatDocumentRepo.create(idsToAdd.map(documentId => ({ chatId, documentId })));
    await this.chatDocumentRepo.save(docs);

    const chat = await this.chatService.getChat(chatId, user.userId);
    if (chat) {
      chat.isPristine = false;
      await this.chatRepository.save(chat);
    }
    return chat ? { chat } : { error: "Chat not found" };
  }

  @Mutation(() => RemoveDocumentsFromChatResponse)
  async removeDocumentsFromChat(
    @Arg("documentIds", () => [ID]) documentIds: string[],
    @Arg("chatId", () => ID) chatId: string,
    @Ctx() context: GraphQLContext
  ): Promise<RemoveDocumentsFromChatResponse> {
    const user = await this.validateContextToken(context);
    const mappings = await this.chatDocumentRepo.find({
      where: [{ documentId: In(documentIds), chatId }],
    });

    if (mappings.length === 0) {
      return { error: "No documents to remove" };
    }

    await this.chatDocumentRepo.delete(mappings);
    const chat = await this.chatService.getChat(chatId, user.userId);
    return chat ? { chat } : { error: "Chat not found" };
  }
}
