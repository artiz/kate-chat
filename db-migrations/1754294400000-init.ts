import { MigrationInterface, QueryRunner } from "typeorm";

export class Init_1754294400000 implements MigrationInterface {
  name = "Init_1754294400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "users" (
            "id" varchar PRIMARY KEY NOT NULL,
            "email" varchar NOT NULL,
            "password" varchar,
            "firstName" varchar NOT NULL,
            "lastName" varchar NOT NULL,
            "role" varchar NOT NULL DEFAULT ('user'),
            "defaultModelId" varchar,
            "defaultSystemPrompt" varchar,
            "avatarUrl" varchar,
            "googleId" varchar,
            "githubId" varchar,
            "authProvider" varchar,
            "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
            "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
            "modelsCount" integer,
            "settings" json,
            CONSTRAINT "UQ_users_email" UNIQUE ("email"))`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "models" (
            "id" varchar PRIMARY KEY NOT NULL,
            "name" varchar NOT NULL,
            "modelId" varchar NOT NULL,
            "description" varchar NOT NULL,
            "userId" varchar,
            "provider" varchar,
            "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'),
            "supportsStreaming" boolean NOT NULL DEFAULT (0),
            "supportsTextIn" boolean NOT NULL DEFAULT (1),
            "supportsTextOut" boolean NOT NULL DEFAULT (1),
            "supportsEmbeddingsIn" boolean NOT NULL DEFAULT (0),
            "supportsImageIn" boolean NOT NULL DEFAULT (0),
            "supportsImageOut" boolean NOT NULL DEFAULT (0),
            "supportsEmbeddingsOut" boolean NOT NULL DEFAULT (0),
            "isActive" boolean NOT NULL DEFAULT (1),
            "isCustom" boolean NOT NULL DEFAULT (0),
            "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
            "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
            CONSTRAINT "FK_model_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "chats" (
            "id" varchar PRIMARY KEY NOT NULL,
            "title" varchar NOT NULL,
            "description" varchar NOT NULL DEFAULT (''),
            "files" json,
            "lastBotMessage" varchar,
            "lastBotMessageId" varchar,
            "messagesCount" integer,
            "modelId" varchar,
            "temperature" float,
            "maxTokens" integer,
            "topP" float,
            "imagesCount" integer,
            "isPristine" boolean NOT NULL DEFAULT (0),
            "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
            "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
            "userId" varchar,
            CONSTRAINT "FK_chat_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "messages" (
            "id" varchar PRIMARY KEY NOT NULL,
            "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'),
            "content" varchar NOT NULL,
            "jsonContent" json,
            "metadata" json,
            "modelId" varchar NOT NULL,
            "modelName" varchar,
            "chatId" varchar,
            "userId" varchar,
            "linkedToMessageId" varchar,
            "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
            "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
            CONSTRAINT "FK_messages_chat" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
            CONSTRAINT "FK_message_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
            CONSTRAINT "FK_linked_message" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP TABLE "chats"`);
    await queryRunner.query(`DROP TABLE "models"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
