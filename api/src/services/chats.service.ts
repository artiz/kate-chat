import { In, IsNull, MoreThanOrEqual, Not, Repository } from "typeorm";

import { Chat, Message } from "@/entities";
import { createLogger } from "@/utils/logger";
import { getRepository } from "@/config/database";

export class ChatsService {
  private chatRepository: Repository<Chat>;

  constructor() {
    this.chatRepository = getRepository(Chat);
  }

  public async getChat(chatId: string, userId: string): Promise<Chat | null> {
    return await this.chatRepository
      .createQueryBuilder("chat")
      .addSelect(sq => {
        return sq.select("COUNT(*)").from(Message, "m").where("m.chatId = chat.id");
      }, "chat_messagesCount")
      .leftJoinAndSelect("chat.user", "user")
      .leftJoinAndSelect("chat.chatDocuments", "chatDocuments")
      .leftJoinAndSelect("chatDocuments.document", "document")

      .where({ id: chatId, user: { id: userId } })
      .getOne();
  }
}
