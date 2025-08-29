import { BOOLEAN_FALSE, BOOLEAN_TRUE, TIMESTAMP, ID, ID_REF } from "./common";
import { MigrationInterface, QueryRunner } from "typeorm";

export class Init_1754294400000 implements MigrationInterface {
  name = "Init_1754294400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "users" (
            ${ID},
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
            "createdAt" ${TIMESTAMP},
            "updatedAt" ${TIMESTAMP},
            "modelsCount" integer,
            "settings" json,
            CONSTRAINT "UQ_users_email" UNIQUE ("email"))`);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_firstName" ON "users" ("firstName") `,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_lastName" ON "users" ("lastName") `,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "models" (
            ${ID},
            "name" varchar NOT NULL,
            "modelId" varchar NOT NULL,
            "description" varchar NOT NULL,
            "userId" ${ID_REF},
            "provider" varchar,
            "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'),
            "supportsStreaming" boolean NOT NULL DEFAULT ${BOOLEAN_TRUE},
            "supportsTextIn" boolean NOT NULL DEFAULT ${BOOLEAN_TRUE},
            "supportsTextOut" boolean NOT NULL DEFAULT ${BOOLEAN_TRUE},
            "supportsEmbeddingsIn" boolean NOT NULL DEFAULT ${BOOLEAN_FALSE},
            "supportsImageIn" boolean NOT NULL DEFAULT ${BOOLEAN_FALSE},
            "supportsImageOut" boolean NOT NULL DEFAULT ${BOOLEAN_FALSE},
            "supportsEmbeddingsOut" boolean NOT NULL DEFAULT ${BOOLEAN_FALSE},
            "isActive" boolean NOT NULL DEFAULT ${BOOLEAN_TRUE},
            "isCustom" boolean NOT NULL DEFAULT ${BOOLEAN_FALSE},
            "createdAt" ${TIMESTAMP},
            "updatedAt" ${TIMESTAMP},
            CONSTRAINT "FK_model_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "chats" (
            ${ID},
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
            "isPristine" boolean NOT NULL DEFAULT ${BOOLEAN_FALSE},
            "createdAt" ${TIMESTAMP},
            "updatedAt" ${TIMESTAMP},
            "userId" ${ID_REF},
            CONSTRAINT "FK_chat_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "messages" (
            ${ID},
            "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'),
            "content" varchar NOT NULL,
            "jsonContent" json,
            "metadata" json,
            "modelId" varchar NOT NULL,
            "modelName" varchar,
            "chatId" ${ID_REF},
            "userId" ${ID_REF},
            "linkedToMessageId" ${ID_REF},
            "createdAt" ${TIMESTAMP},
            "updatedAt" ${TIMESTAMP},
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
