import { Brackets, In, IsNull, MoreThanOrEqual, Not, ObjectLiteral, Repository } from "typeorm";

import { Chat, Message } from "@/entities";
import { createLogger } from "@/utils/logger";
import { getRepository } from "@/config/database";

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
}
