import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatModelTools1759411121845 implements MigrationInterface {
  name = "ChatModelTools1759411121845";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "type" varchar NOT NULL DEFAULT ('chat'), "streaming" boolean NOT NULL DEFAULT (0), "imageInput" boolean NOT NULL DEFAULT (0), "maxInputTokens" integer, "tools" json, CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_models"("id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput", "maxInputTokens") SELECT "id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput", "maxInputTokens" FROM "models"`,
    );
    await queryRunner.query(`DROP TABLE "models"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_models" RENAME TO "models"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "files" json, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "temperature" float, "maxTokens" integer, "topP" float, "imagesCount" integer, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, "tools" json, CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_chats"("id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId") SELECT "id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId" FROM "chats"`,
    );
    await queryRunner.query(`DROP TABLE "chats"`);
    await queryRunner.query(`ALTER TABLE "temporary_chats" RENAME TO "chats"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chats" RENAME TO "temporary_chats"`);
    await queryRunner.query(
      `CREATE TABLE "chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "files" json, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "temperature" float, "maxTokens" integer, "topP" float, "imagesCount" integer, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "chats"("id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId") SELECT "id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId" FROM "temporary_chats"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_chats"`);
    await queryRunner.query(
      `ALTER TABLE "models" RENAME TO "temporary_models"`,
    );
    await queryRunner.query(
      `CREATE TABLE "models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "type" varchar NOT NULL DEFAULT ('chat'), "streaming" boolean NOT NULL DEFAULT (0), "imageInput" boolean NOT NULL DEFAULT (0), "maxInputTokens" integer, CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "models"("id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput", "maxInputTokens") SELECT "id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput", "maxInputTokens" FROM "temporary_models"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_models"`);
  }
}
