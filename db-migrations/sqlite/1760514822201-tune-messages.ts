import { MigrationInterface, QueryRunner } from "typeorm";

export class TuneMessages1760514822201 implements MigrationInterface {
  name = "TuneMessages1760514822201";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" text NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar NOT NULL, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_4838cd4fc48a6ff2d4aa01aa646" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_messages"("id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt") SELECT "id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt" FROM "messages"`,
    );
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_messages" RENAME TO "messages"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" text NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_4838cd4fc48a6ff2d4aa01aa646" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
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
      `CREATE TABLE "messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" text NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar NOT NULL, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_4838cd4fc48a6ff2d4aa01aa646" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "messages"("id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt") SELECT "id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt" FROM "temporary_messages"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_messages"`);
    await queryRunner.query(
      `ALTER TABLE "messages" RENAME TO "temporary_messages"`,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" text NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar NOT NULL, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_4838cd4fc48a6ff2d4aa01aa646" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "messages"("id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt") SELECT "id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt" FROM "temporary_messages"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_messages"`);
  }
}
