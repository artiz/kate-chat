import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatFiles1769772775572 implements MigrationInterface {
  name = "ChatFiles1769772775572";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chat_files" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar NOT NULL, "messageId" varchar, "type" varchar CHECK( "type" IN ('image','video','rag_document','inline_document') ) NOT NULL DEFAULT ('image'), "fileName" varchar, "mime" varchar, "uploadFile" varchar, "predominantColor" varchar, "exif" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "temperature" float, "maxTokens" integer, "topP" float, "imagesCount" integer, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, "tools" json, "systemPrompt" varchar, "isPinned" boolean NOT NULL DEFAULT (0), CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_chats"("id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId", "tools", "systemPrompt", "isPinned") SELECT "id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId", "tools", "systemPrompt", "isPinned" FROM "chats"`,
    );
    await queryRunner.query(`DROP TABLE "chats"`);
    await queryRunner.query(`ALTER TABLE "temporary_chats" RENAME TO "chats"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_chat_files" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar NOT NULL, "messageId" varchar, "type" varchar CHECK( "type" IN ('image','video','rag_document','inline_document') ) NOT NULL DEFAULT ('image'), "fileName" varchar, "mime" varchar, "uploadFile" varchar, "predominantColor" varchar, "exif" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_01fa2aca8a161c864dd05d9d387" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_ea9c9ae1f173ad90c9a4d15d2a7" FOREIGN KEY ("messageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_chat_files"("id", "chatId", "messageId", "type", "fileName", "mime", "uploadFile", "predominantColor", "exif", "createdAt", "updatedAt") SELECT "id", "chatId", "messageId", "type", "fileName", "mime", "uploadFile", "predominantColor", "exif", "createdAt", "updatedAt" FROM "chat_files"`,
    );
    await queryRunner.query(`DROP TABLE "chat_files"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_chat_files" RENAME TO "chat_files"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chats" RENAME TO "temporary_chats"`);
    await queryRunner.query(
      `CREATE TABLE "chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "files" json, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "temperature" float, "maxTokens" integer, "topP" float, "imagesCount" integer, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, "tools" json, "systemPrompt" varchar, "isPinned" boolean NOT NULL DEFAULT (0), CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "chats"("id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId", "tools", "systemPrompt", "isPinned") SELECT "id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId", "tools", "systemPrompt", "isPinned" FROM "temporary_chats"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_chats"`);
    await queryRunner.query(`DROP TABLE "chat_files"`);
  }
}
