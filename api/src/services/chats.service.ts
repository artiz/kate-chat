import { Brackets, ILike, ObjectLiteral, Repository } from "typeorm";

import { Chat, Message } from "@/entities";
import { getRepository } from "@/config/database";
import { GetChatsInput } from "@/types/graphql/inputs";
import { GqlChatsList } from "@/types/graphql/responses";
import { TokenPayload } from "@/utils/jwt";
import { MessageRole } from "@/types/ai.types";

export class ChatsService {
  private chatRepository: Repository<Chat>;

  constructor() {
    this.chatRepository = getRepository(Chat);
  }

  public async getChat(chatId: string, userId?: string): Promise<Chat | null> {
    const where: ObjectLiteral = { id: chatId };
    if (userId) {
      where.user = { id: userId };
    }

    return await this.chatRepository
      .createQueryBuilder("chat")
      .addSelect(sq => {
        return sq.select("COUNT(*)").from(Message, "m").where("m.chatId = chat.id");
      }, "chat_messagesCount")
      .leftJoinAndSelect("chat.user", "user")
      .leftJoinAndSelect("chat.chatDocuments", "chatDocuments")
      .leftJoinAndSelect("chatDocuments.document", "document")
      .where(where)
      .getOne();
  }

  public async getChats(input: GetChatsInput, user: TokenPayload): Promise<GqlChatsList> {
    const { from = 0, limit = 20, searchTerm, pinned } = input;

    const total = await this.chatRepository.countBy({
      user: { id: user.userId },
    });

    let query = this.chatRepository.createQueryBuilder("chat").where({ userId: user.userId });

    if (searchTerm) {
      query = query.andWhere([{ title: ILike(`%${searchTerm}%`) }, { description: ILike(`%${searchTerm}%`) }]);
    }
    if (pinned !== undefined) {
      query = query.andWhere({ isPinned: pinned });
    }

    const chats = await query
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
      .skip(pinned ? 0 : from)
      .take(pinned ? 300 : limit)
      .orderBy("chat.updatedAt", "DESC")
      .getMany();

    return {
      chats,
      total,
      next: from + chats.length < total ? from + chats.length : undefined,
    };
  }
}
