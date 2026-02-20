import { MigrationInterface, QueryRunner } from "typeorm";

export class OptimizeChatSettings1771494097001 implements MigrationInterface {
  name = "OptimizeChatSettings1771494097001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, "tools" json, "isPinned" boolean NOT NULL DEFAULT (0), CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_chats"("id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned") SELECT "id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned" FROM "chats"`,
    );
    await queryRunner.query(`DROP TABLE "chats"`);
    await queryRunner.query(`ALTER TABLE "temporary_chats" RENAME TO "chats"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, "tools" json, "isPinned" boolean NOT NULL DEFAULT (0), "settings" json, CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_chats"("id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned") SELECT "id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned" FROM "chats"`,
    );
    await queryRunner.query(`DROP TABLE "chats"`);
    await queryRunner.query(`ALTER TABLE "temporary_chats" RENAME TO "chats"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chats" RENAME TO "temporary_chats"`);
    await queryRunner.query(
      `CREATE TABLE "chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, "tools" json, "isPinned" boolean NOT NULL DEFAULT (0), CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "chats"("id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned") SELECT "id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned" FROM "temporary_chats"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_chats"`);
    await queryRunner.query(`ALTER TABLE "chats" RENAME TO "temporary_chats"`);
    await queryRunner.query(
      `CREATE TABLE "chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "temperature" float, "maxTokens" integer, "topP" float, "imagesCount" integer, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, "tools" json, "systemPrompt" varchar, "isPinned" boolean NOT NULL DEFAULT (0), CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "chats"("id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned") SELECT "id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned" FROM "temporary_chats"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_chats"`);
  }
}
