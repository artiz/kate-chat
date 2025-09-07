import { MigrationInterface, QueryRunner } from "typeorm";

export class Init_1754294400000 implements MigrationInterface {
  name = "Init_1754294400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar NOT NULL, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "supportsStreaming" boolean NOT NULL DEFAULT (0), "supportsTextIn" boolean NOT NULL DEFAULT (1), "supportsTextOut" boolean NOT NULL DEFAULT (1), "supportsEmbeddingsIn" boolean NOT NULL DEFAULT (0), "supportsImageIn" boolean NOT NULL DEFAULT (0), "supportsImageOut" boolean NOT NULL DEFAULT (0), "supportsEmbeddingsOut" boolean NOT NULL DEFAULT (0), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" varchar PRIMARY KEY NOT NULL, "email" varchar NOT NULL, "password" varchar, "firstName" varchar NOT NULL, "lastName" varchar NOT NULL, "role" varchar NOT NULL DEFAULT ('user'), "defaultModelId" varchar, "defaultSystemPrompt" varchar, "avatarUrl" varchar, "googleId" varchar, "githubId" varchar, "authProvider" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "modelsCount" integer, "settings" json, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" varchar NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar NOT NULL, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE TABLE "chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar NOT NULL DEFAULT (''), "files" json, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "temperature" float, "maxTokens" integer, "topP" float, "imagesCount" integer, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar)`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar NOT NULL, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "supportsStreaming" boolean NOT NULL DEFAULT (0), "supportsTextIn" boolean NOT NULL DEFAULT (1), "supportsTextOut" boolean NOT NULL DEFAULT (1), "supportsEmbeddingsIn" boolean NOT NULL DEFAULT (0), "supportsImageIn" boolean NOT NULL DEFAULT (0), "supportsImageOut" boolean NOT NULL DEFAULT (0), "supportsEmbeddingsOut" boolean NOT NULL DEFAULT (0), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_models"("id", "name", "modelId", "description", "userId", "provider", "apiProvider", "supportsStreaming", "supportsTextIn", "supportsTextOut", "supportsEmbeddingsIn", "supportsImageIn", "supportsImageOut", "supportsEmbeddingsOut", "isActive", "isCustom", "createdAt", "updatedAt") SELECT "id", "name", "modelId", "description", "userId", "provider", "apiProvider", "supportsStreaming", "supportsTextIn", "supportsTextOut", "supportsEmbeddingsIn", "supportsImageIn", "supportsImageOut", "supportsEmbeddingsOut", "isActive", "isCustom", "createdAt", "updatedAt" FROM "models"`,
    );
    await queryRunner.query(`DROP TABLE "models"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_models" RENAME TO "models"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" varchar NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar NOT NULL, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_4838cd4fc48a6ff2d4aa01aa646" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_messages"("id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt") SELECT "id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt" FROM "messages"`,
    );
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_messages" RENAME TO "messages"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar NOT NULL DEFAULT (''), "files" json, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "temperature" float, "maxTokens" integer, "topP" float, "imagesCount" integer, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
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
      `CREATE TABLE "chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar NOT NULL DEFAULT (''), "files" json, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "temperature" float, "maxTokens" integer, "topP" float, "imagesCount" integer, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar)`,
    );
    await queryRunner.query(
      `INSERT INTO "chats"("id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId") SELECT "id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId" FROM "temporary_chats"`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" RENAME TO "temporary_messages"`,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" varchar NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar NOT NULL, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "messages"("id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt") SELECT "id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt" FROM "temporary_messages"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" RENAME TO "temporary_models"`,
    );
    await queryRunner.query(
      `CREATE TABLE "models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar NOT NULL, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "supportsStreaming" boolean NOT NULL DEFAULT (0), "supportsTextIn" boolean NOT NULL DEFAULT (1), "supportsTextOut" boolean NOT NULL DEFAULT (1), "supportsEmbeddingsIn" boolean NOT NULL DEFAULT (0), "supportsImageIn" boolean NOT NULL DEFAULT (0), "supportsImageOut" boolean NOT NULL DEFAULT (0), "supportsEmbeddingsOut" boolean NOT NULL DEFAULT (0), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "models"("id", "name", "modelId", "description", "userId", "provider", "apiProvider", "supportsStreaming", "supportsTextIn", "supportsTextOut", "supportsEmbeddingsIn", "supportsImageIn", "supportsImageOut", "supportsEmbeddingsOut", "isActive", "isCustom", "createdAt", "updatedAt") SELECT "id", "name", "modelId", "description", "userId", "provider", "apiProvider", "supportsStreaming", "supportsTextIn", "supportsTextOut", "supportsEmbeddingsIn", "supportsImageIn", "supportsImageOut", "supportsEmbeddingsOut", "isActive", "isCustom", "createdAt", "updatedAt" FROM "temporary_models"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_messages"`);
    await queryRunner.query(`DROP TABLE "temporary_chats"`);
    await queryRunner.query(`DROP TABLE "temporary_models"`);
    await queryRunner.query(`DROP TABLE "chats"`);
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "models"`);
  }
}
