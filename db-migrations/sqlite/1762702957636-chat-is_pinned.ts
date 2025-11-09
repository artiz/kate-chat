import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatIsPinned1762702957636 implements MigrationInterface {
  name = "ChatIsPinned1762702957636";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "files" json, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "temperature" float, "maxTokens" integer, "topP" float, "imagesCount" integer, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, "tools" json, "systemPrompt" varchar, "isPinned" boolean NOT NULL DEFAULT (0), CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_chats"("id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId", "tools", "systemPrompt") SELECT "id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId", "tools", "systemPrompt" FROM "chats"`,
    );
    await queryRunner.query(`DROP TABLE "chats"`);
    await queryRunner.query(`ALTER TABLE "temporary_chats" RENAME TO "chats"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chats" RENAME TO "temporary_chats"`);
    await queryRunner.query(
      `CREATE TABLE "chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "files" json, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "temperature" float, "maxTokens" integer, "topP" float, "imagesCount" integer, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, "tools" json, "systemPrompt" varchar, CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "chats"("id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId", "tools", "systemPrompt") SELECT "id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId", "tools", "systemPrompt" FROM "temporary_chats"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_chats"`);
  }
}
