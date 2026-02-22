import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatFolders1771698932987 implements MigrationInterface {
  name = "ChatFolders1771698932987";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chat_folders" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "color" varchar, "userId" varchar, "parentId" varchar, "topParentId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, "tools" json, "isPinned" boolean NOT NULL DEFAULT (0), "settings" json, "folderId" varchar, CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_chats"("id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned", "settings") SELECT "id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned", "settings" FROM "chats"`,
    );
    await queryRunner.query(`DROP TABLE "chats"`);
    await queryRunner.query(`ALTER TABLE "temporary_chats" RENAME TO "chats"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_chat_folders" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "color" varchar, "userId" varchar, "parentId" varchar, "topParentId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_2e74a71e829fccfe8815b0da096" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_d78d2413c650c47cd66b96f31ab" FOREIGN KEY ("parentId") REFERENCES "chat_folders" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_8a35f825adc044c040a6bcfe66a" FOREIGN KEY ("topParentId") REFERENCES "chat_folders" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_chat_folders"("id", "name", "color", "userId", "parentId", "topParentId", "createdAt", "updatedAt") SELECT "id", "name", "color", "userId", "parentId", "topParentId", "createdAt", "updatedAt" FROM "chat_folders"`,
    );
    await queryRunner.query(`DROP TABLE "chat_folders"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_chat_folders" RENAME TO "chat_folders"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, "tools" json, "isPinned" boolean NOT NULL DEFAULT (0), "settings" json, "folderId" varchar, CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_55a7e34e790cd3b0cb7df871855" FOREIGN KEY ("folderId") REFERENCES "chat_folders" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_chats"("id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned", "settings", "folderId") SELECT "id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned", "settings", "folderId" FROM "chats"`,
    );
    await queryRunner.query(`DROP TABLE "chats"`);
    await queryRunner.query(`ALTER TABLE "temporary_chats" RENAME TO "chats"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chats" RENAME TO "temporary_chats"`);
    await queryRunner.query(
      `CREATE TABLE "chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, "tools" json, "isPinned" boolean NOT NULL DEFAULT (0), "settings" json, "folderId" varchar, CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "chats"("id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned", "settings", "folderId") SELECT "id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned", "settings", "folderId" FROM "temporary_chats"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_chats"`);
    await queryRunner.query(
      `ALTER TABLE "chat_folders" RENAME TO "temporary_chat_folders"`,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_folders" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "color" varchar, "userId" varchar, "parentId" varchar, "topParentId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "chat_folders"("id", "name", "color", "userId", "parentId", "topParentId", "createdAt", "updatedAt") SELECT "id", "name", "color", "userId", "parentId", "topParentId", "createdAt", "updatedAt" FROM "temporary_chat_folders"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_chat_folders"`);
    await queryRunner.query(`ALTER TABLE "chats" RENAME TO "temporary_chats"`);
    await queryRunner.query(
      `CREATE TABLE "chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, "tools" json, "isPinned" boolean NOT NULL DEFAULT (0), "settings" json, CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "chats"("id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned", "settings") SELECT "id", "title", "description", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "isPristine", "createdAt", "updatedAt", "userId", "tools", "isPinned", "settings" FROM "temporary_chats"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_chats"`);
    await queryRunner.query(`DROP TABLE "chat_folders"`);
  }
}
