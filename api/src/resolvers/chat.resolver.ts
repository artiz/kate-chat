import { Resolver, Query, Mutation, Arg, Ctx, ID } from "type-graphql";
import { In, Repository } from "typeorm";
import { CreateChatInput, UpdateChatInput, GetChatsInput } from "../types/graphql/inputs";
import { getRepository } from "../config/database";
import { GraphQLContext } from ".";
import { AddDocumentsToChatResponse, GqlChatsList, RemoveDocumentsFromChatResponse } from "../types/graphql/responses";
import { Chat, ChatDocument } from "@/entities";
import { BaseResolver } from "./base.resolver";
import { ChatsService } from "@/services/chats.service";
import { globalConfig } from "@/global-config";
import { DEFAULT_CHAT_PROMPT } from "@/config/ai/prompts";

const aiConfig = globalConfig.ai;

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
    return this.chatService.getChats(input, user);
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

    const limit = user.isAdmin() ? -1 : globalConfig.limits.maxChats;
    if (limit > -1) {
      const chatsCount = await this.chatRepository.count({
        where: { user: { id: user.id } },
      });
      if (chatsCount >= limit) {
        throw new Error(`Chat limit of ${limit} reached. Please delete some chats before creating new ones.`);
      }
    }

    const chat = this.chatRepository.create({
      ...input,
      title: input.title || "",
      user,
      systemPrompt: user.defaultSystemPrompt || DEFAULT_CHAT_PROMPT,
      temperature: user.defaultTemperature ?? aiConfig.defaultTemperature,
      maxTokens: user.defaultMaxTokens ?? aiConfig.defaultMaxTokens,
      topP: user.defaultTopP ?? aiConfig.defaultTopP,
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
      relations: ["files"],
    });

    if (!chat) throw new Error("Chat not found");
    if (chat.files?.length) {
      await messageService.removeFiles(chat.files, user);
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
