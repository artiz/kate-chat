import { MigrationInterface, QueryRunner } from "typeorm";

export class Rag1756983607880 implements MigrationInterface {
  name = "Rag1756983607880";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" varchar NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar NOT NULL, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
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
    await queryRunner.query(
      `CREATE TABLE "chat_documents" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar NOT NULL, "documentId" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0bf6b1e9f455bba598d4c73076" ON "chat_documents" ("chatId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fee8b0b8a78f1daa22e05ea268" ON "chat_documents" ("documentId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "documents" ("id" varchar PRIMARY KEY NOT NULL, "fileName" varchar(4000) NOT NULL, "mime" varchar, "fileSize" bigint NOT NULL DEFAULT (0), "sha256checksum" varchar NOT NULL, "s3key" varchar(4000), "ownerId" varchar NOT NULL, "embeddingsModelId" varchar, "summaryModelId" varchar, "summary" text, "pagesCount" integer NOT NULL DEFAULT (0), "status" varchar NOT NULL DEFAULT ('upload'), "statusInfo" text, "statusProgress" float NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_95e8f97e178311e7eb65e63289" ON "documents" ("fileName") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_edef2e837ed65c05e116250a21" ON "documents" ("sha256checksum") `,
    );
    await queryRunner.query(
      `CREATE TABLE "document_chunks" ("id" varchar PRIMARY KEY NOT NULL, "documentId" varchar NOT NULL, "modelId" varchar NOT NULL, "page" integer NOT NULL DEFAULT (0), "pageIndex" bigint NOT NULL DEFAULT (0), "content" text NOT NULL, "embedding" text)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eaf9afaf30fb7e2ac25989db51" ON "document_chunks" ("documentId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar NOT NULL, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_models"("id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt") SELECT "id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt" FROM "models"`,
    );
    await queryRunner.query(`DROP TABLE "models"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_models" RENAME TO "models"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar NOT NULL, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "type" varchar NOT NULL DEFAULT ('chat'), "streaming" boolean NOT NULL DEFAULT (0), "imageInput" boolean NOT NULL DEFAULT (0), CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_models"("id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt") SELECT "id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt" FROM "models"`,
    );
    await queryRunner.query(`DROP TABLE "models"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_models" RENAME TO "models"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_users" ("id" varchar PRIMARY KEY NOT NULL, "email" varchar NOT NULL, "password" varchar, "firstName" varchar NOT NULL, "lastName" varchar NOT NULL, "role" varchar NOT NULL DEFAULT ('user'), "defaultModelId" varchar, "defaultSystemPrompt" varchar, "avatarUrl" varchar, "googleId" varchar, "githubId" varchar, "authProvider" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "modelsCount" integer, "settings" json, "documentsEmbeddingsModelId" varchar, "documentSummarizationModelId" varchar, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_users"("id", "email", "password", "firstName", "lastName", "role", "defaultModelId", "defaultSystemPrompt", "avatarUrl", "googleId", "githubId", "authProvider", "createdAt", "updatedAt", "modelsCount", "settings") SELECT "id", "email", "password", "firstName", "lastName", "role", "defaultModelId", "defaultSystemPrompt", "avatarUrl", "googleId", "githubId", "authProvider", "createdAt", "updatedAt", "modelsCount", "settings" FROM "users"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`ALTER TABLE "temporary_users" RENAME TO "users"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar, "files" json, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "temperature" float, "maxTokens" integer, "topP" float, "imagesCount" integer, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_chats"("id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId") SELECT "id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId" FROM "chats"`,
    );
    await queryRunner.query(`DROP TABLE "chats"`);
    await queryRunner.query(`ALTER TABLE "temporary_chats" RENAME TO "chats"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_5372672fbfd1677205e0ce3ece" ON "users" ("firstName") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_af99afb7cf88ce20aff6977e68" ON "users" ("lastName") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_0bf6b1e9f455bba598d4c73076"`);
    await queryRunner.query(`DROP INDEX "IDX_fee8b0b8a78f1daa22e05ea268"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_chat_documents" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar NOT NULL, "documentId" varchar NOT NULL, CONSTRAINT "FK_0bf6b1e9f455bba598d4c73076b" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_fee8b0b8a78f1daa22e05ea2682" FOREIGN KEY ("documentId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_chat_documents"("id", "chatId", "documentId") SELECT "id", "chatId", "documentId" FROM "chat_documents"`,
    );
    await queryRunner.query(`DROP TABLE "chat_documents"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_chat_documents" RENAME TO "chat_documents"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0bf6b1e9f455bba598d4c73076" ON "chat_documents" ("chatId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fee8b0b8a78f1daa22e05ea268" ON "chat_documents" ("documentId") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_95e8f97e178311e7eb65e63289"`);
    await queryRunner.query(`DROP INDEX "IDX_edef2e837ed65c05e116250a21"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_documents" ("id" varchar PRIMARY KEY NOT NULL, "fileName" varchar(4000) NOT NULL, "mime" varchar, "fileSize" bigint NOT NULL DEFAULT (0), "sha256checksum" varchar NOT NULL, "s3key" varchar(4000), "ownerId" varchar NOT NULL, "embeddingsModelId" varchar, "summaryModelId" varchar, "summary" text, "pagesCount" integer NOT NULL DEFAULT (0), "status" varchar NOT NULL DEFAULT ('upload'), "statusInfo" text, "statusProgress" float NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_4106f2a9b30c9ff2f717894a970" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_documents"("id", "fileName", "mime", "fileSize", "sha256checksum", "s3key", "ownerId", "embeddingsModelId", "summaryModelId", "summary", "pagesCount", "status", "statusInfo", "statusProgress", "createdAt", "updatedAt") SELECT "id", "fileName", "mime", "fileSize", "sha256checksum", "s3key", "ownerId", "embeddingsModelId", "summaryModelId", "summary", "pagesCount", "status", "statusInfo", "statusProgress", "createdAt", "updatedAt" FROM "documents"`,
    );
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_documents" RENAME TO "documents"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_95e8f97e178311e7eb65e63289" ON "documents" ("fileName") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_edef2e837ed65c05e116250a21" ON "documents" ("sha256checksum") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" varchar NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar NOT NULL, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_4838cd4fc48a6ff2d4aa01aa646" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_messages"("id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt") SELECT "id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt" FROM "messages"`,
    );
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_messages" RENAME TO "messages"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_eaf9afaf30fb7e2ac25989db51"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_document_chunks" ("id" varchar PRIMARY KEY NOT NULL, "documentId" varchar NOT NULL, "modelId" varchar NOT NULL, "page" integer NOT NULL DEFAULT (0), "pageIndex" bigint NOT NULL DEFAULT (0), "content" text NOT NULL, "embedding" text, CONSTRAINT "FK_eaf9afaf30fb7e2ac25989db51b" FOREIGN KEY ("documentId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_document_chunks"("id", "documentId", "modelId", "page", "pageIndex", "content", "embedding") SELECT "id", "documentId", "modelId", "page", "pageIndex", "content", "embedding" FROM "document_chunks"`,
    );
    await queryRunner.query(`DROP TABLE "document_chunks"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_document_chunks" RENAME TO "document_chunks"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eaf9afaf30fb7e2ac25989db51" ON "document_chunks" ("documentId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_eaf9afaf30fb7e2ac25989db51"`);
    await queryRunner.query(
      `ALTER TABLE "document_chunks" RENAME TO "temporary_document_chunks"`,
    );
    await queryRunner.query(
      `CREATE TABLE "document_chunks" ("id" varchar PRIMARY KEY NOT NULL, "documentId" varchar NOT NULL, "modelId" varchar NOT NULL, "page" integer NOT NULL DEFAULT (0), "pageIndex" bigint NOT NULL DEFAULT (0), "content" text NOT NULL, "embedding" text)`,
    );
    await queryRunner.query(
      `INSERT INTO "document_chunks"("id", "documentId", "modelId", "page", "pageIndex", "content", "embedding") SELECT "id", "documentId", "modelId", "page", "pageIndex", "content", "embedding" FROM "temporary_document_chunks"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_document_chunks"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_eaf9afaf30fb7e2ac25989db51" ON "document_chunks" ("documentId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" RENAME TO "temporary_messages"`,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" varchar NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar NOT NULL, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "messages"("id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt") SELECT "id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt" FROM "temporary_messages"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_messages"`);
    await queryRunner.query(`DROP INDEX "IDX_edef2e837ed65c05e116250a21"`);
    await queryRunner.query(`DROP INDEX "IDX_95e8f97e178311e7eb65e63289"`);
    await queryRunner.query(
      `ALTER TABLE "documents" RENAME TO "temporary_documents"`,
    );
    await queryRunner.query(
      `CREATE TABLE "documents" ("id" varchar PRIMARY KEY NOT NULL, "fileName" varchar(4000) NOT NULL, "mime" varchar, "fileSize" bigint NOT NULL DEFAULT (0), "sha256checksum" varchar NOT NULL, "s3key" varchar(4000), "ownerId" varchar NOT NULL, "embeddingsModelId" varchar, "summaryModelId" varchar, "summary" text, "pagesCount" integer NOT NULL DEFAULT (0), "status" varchar NOT NULL DEFAULT ('upload'), "statusInfo" text, "statusProgress" float NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "documents"("id", "fileName", "mime", "fileSize", "sha256checksum", "s3key", "ownerId", "embeddingsModelId", "summaryModelId", "summary", "pagesCount", "status", "statusInfo", "statusProgress", "createdAt", "updatedAt") SELECT "id", "fileName", "mime", "fileSize", "sha256checksum", "s3key", "ownerId", "embeddingsModelId", "summaryModelId", "summary", "pagesCount", "status", "statusInfo", "statusProgress", "createdAt", "updatedAt" FROM "temporary_documents"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_documents"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_edef2e837ed65c05e116250a21" ON "documents" ("sha256checksum") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_95e8f97e178311e7eb65e63289" ON "documents" ("fileName") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_fee8b0b8a78f1daa22e05ea268"`);
    await queryRunner.query(`DROP INDEX "IDX_0bf6b1e9f455bba598d4c73076"`);
    await queryRunner.query(
      `ALTER TABLE "chat_documents" RENAME TO "temporary_chat_documents"`,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_documents" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar NOT NULL, "documentId" varchar NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "chat_documents"("id", "chatId", "documentId") SELECT "id", "chatId", "documentId" FROM "temporary_chat_documents"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_chat_documents"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_fee8b0b8a78f1daa22e05ea268" ON "chat_documents" ("documentId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0bf6b1e9f455bba598d4c73076" ON "chat_documents" ("chatId") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_af99afb7cf88ce20aff6977e68"`);
    await queryRunner.query(`DROP INDEX "IDX_5372672fbfd1677205e0ce3ece"`);
    await queryRunner.query(`ALTER TABLE "chats" RENAME TO "temporary_chats"`);
    await queryRunner.query(
      `CREATE TABLE "chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar NOT NULL DEFAULT (''), "files" json, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "temperature" float, "maxTokens" integer, "topP" float, "imagesCount" integer, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "chats"("id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId") SELECT "id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId" FROM "temporary_chats"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_chats"`);
    await queryRunner.query(`ALTER TABLE "users" RENAME TO "temporary_users"`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" varchar PRIMARY KEY NOT NULL, "email" varchar NOT NULL, "password" varchar, "firstName" varchar NOT NULL, "lastName" varchar NOT NULL, "role" varchar NOT NULL DEFAULT ('user'), "defaultModelId" varchar, "defaultSystemPrompt" varchar, "avatarUrl" varchar, "googleId" varchar, "githubId" varchar, "authProvider" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "modelsCount" integer, "settings" json, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"))`,
    );
    await queryRunner.query(
      `INSERT INTO "users"("id", "email", "password", "firstName", "lastName", "role", "defaultModelId", "defaultSystemPrompt", "avatarUrl", "googleId", "githubId", "authProvider", "createdAt", "updatedAt", "modelsCount", "settings") SELECT "id", "email", "password", "firstName", "lastName", "role", "defaultModelId", "defaultSystemPrompt", "avatarUrl", "googleId", "githubId", "authProvider", "createdAt", "updatedAt", "modelsCount", "settings" FROM "temporary_users"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_users"`);
    await queryRunner.query(
      `ALTER TABLE "models" RENAME TO "temporary_models"`,
    );
    await queryRunner.query(
      `CREATE TABLE "models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar NOT NULL, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "models"("id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt") SELECT "id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt" FROM "temporary_models"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_models"`);
    await queryRunner.query(
      `ALTER TABLE "models" RENAME TO "temporary_models"`,
    );
    await queryRunner.query(
      `CREATE TABLE "models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar NOT NULL, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "supportsStreaming" boolean NOT NULL DEFAULT (0), "supportsTextIn" boolean NOT NULL DEFAULT (1), "supportsTextOut" boolean NOT NULL DEFAULT (1), "supportsEmbeddingsIn" boolean NOT NULL DEFAULT (0), "supportsImageIn" boolean NOT NULL DEFAULT (0), "supportsImageOut" boolean NOT NULL DEFAULT (0), "supportsEmbeddingsOut" boolean NOT NULL DEFAULT (0), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "models"("id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt") SELECT "id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt" FROM "temporary_models"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_models"`);
    await queryRunner.query(`DROP INDEX "IDX_eaf9afaf30fb7e2ac25989db51"`);
    await queryRunner.query(`DROP TABLE "document_chunks"`);
    await queryRunner.query(`DROP INDEX "IDX_edef2e837ed65c05e116250a21"`);
    await queryRunner.query(`DROP INDEX "IDX_95e8f97e178311e7eb65e63289"`);
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(`DROP INDEX "IDX_fee8b0b8a78f1daa22e05ea268"`);
    await queryRunner.query(`DROP INDEX "IDX_0bf6b1e9f455bba598d4c73076"`);
    await queryRunner.query(`DROP TABLE "chat_documents"`);
    await queryRunner.query(`ALTER TABLE "chats" RENAME TO "temporary_chats"`);
    await queryRunner.query(
      `CREATE TABLE "chats" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "description" varchar NOT NULL DEFAULT (''), "files" json, "lastBotMessage" varchar, "lastBotMessageId" varchar, "messagesCount" integer, "modelId" varchar, "temperature" float, "maxTokens" integer, "topP" float, "imagesCount" integer, "isPristine" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" varchar, CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "chats"("id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId") SELECT "id", "title", "description", "files", "lastBotMessage", "lastBotMessageId", "messagesCount", "modelId", "temperature", "maxTokens", "topP", "imagesCount", "isPristine", "createdAt", "updatedAt", "userId" FROM "temporary_chats"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_chats"`);
    await queryRunner.query(
      `ALTER TABLE "messages" RENAME TO "temporary_messages"`,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" varchar PRIMARY KEY NOT NULL, "role" varchar CHECK( "role" IN ('user','assistant','error','system') ) NOT NULL DEFAULT ('user'), "content" varchar NOT NULL, "jsonContent" json, "metadata" json, "modelId" varchar NOT NULL, "modelName" varchar, "chatId" varchar, "userId" varchar, "linkedToMessageId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_4838cd4fc48a6ff2d4aa01aa646" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "messages"("id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt") SELECT "id", "role", "content", "jsonContent", "metadata", "modelId", "modelName", "chatId", "userId", "linkedToMessageId", "createdAt", "updatedAt" FROM "temporary_messages"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_messages"`);
  }
}
