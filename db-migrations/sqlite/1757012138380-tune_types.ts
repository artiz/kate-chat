import { MigrationInterface, QueryRunner } from "typeorm";

export class TuneTypes1757012138380 implements MigrationInterface {
  name = "TuneTypes1757012138380";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar NOT NULL, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "type" varchar NOT NULL DEFAULT ('chat'), "streaming" boolean NOT NULL DEFAULT (0), "imageInput" boolean NOT NULL DEFAULT (0), CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_models"("id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput") SELECT "id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput" FROM "models"`,
    );
    await queryRunner.query(`DROP TABLE "models"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_models" RENAME TO "models"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" varchar NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar NOT NULL, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_4838cd4fc48a6ff2d4aa01aa646" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_messages"("id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt") SELECT "id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt" FROM "messages"`,
    );
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_messages" RENAME TO "messages"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "type" varchar NOT NULL DEFAULT ('chat'), "streaming" boolean NOT NULL DEFAULT (0), "imageInput" boolean NOT NULL DEFAULT (0), CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_models"("id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput") SELECT "id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput" FROM "models"`,
    );
    await queryRunner.query(`DROP TABLE "models"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_models" RENAME TO "models"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" text NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar NOT NULL, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_4838cd4fc48a6ff2d4aa01aa646" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_messages"("id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt") SELECT "id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt" FROM "messages"`,
    );
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_messages" RENAME TO "messages"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "messages" RENAME TO "temporary_messages"`,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" varchar NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar NOT NULL, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_4838cd4fc48a6ff2d4aa01aa646" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "messages"("id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt") SELECT "id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt" FROM "temporary_messages"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_messages"`);
    await queryRunner.query(
      `ALTER TABLE "models" RENAME TO "temporary_models"`,
    );
    await queryRunner.query(
      `CREATE TABLE "models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar NOT NULL, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "type" varchar NOT NULL DEFAULT ('chat'), "streaming" boolean NOT NULL DEFAULT (0), "imageInput" boolean NOT NULL DEFAULT (0), CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "models"("id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput") SELECT "id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput" FROM "temporary_models"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_models"`);
    await queryRunner.query(
      `ALTER TABLE "messages" RENAME TO "temporary_messages"`,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" varchar NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar NOT NULL, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_4838cd4fc48a6ff2d4aa01aa646" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "messages"("id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt") SELECT "id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt" FROM "temporary_messages"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_messages"`);
    await queryRunner.query(
      `ALTER TABLE "models" RENAME TO "temporary_models"`,
    );
    await queryRunner.query(
      `CREATE TABLE "models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar NOT NULL, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "type" varchar NOT NULL DEFAULT ('chat'), "streaming" boolean NOT NULL DEFAULT (0), "imageInput" boolean NOT NULL DEFAULT (0), CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "models"("id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput") SELECT "id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput" FROM "temporary_models"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_models"`);
  }
}
