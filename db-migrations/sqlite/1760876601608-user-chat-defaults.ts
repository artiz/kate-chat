import { MigrationInterface, QueryRunner } from "typeorm";

export class Xxx1760876601608 implements MigrationInterface {
  name = "Xxx1760876601608";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_af99afb7cf88ce20aff6977e68"`);
    await queryRunner.query(`DROP INDEX "IDX_5372672fbfd1677205e0ce3ece"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_users" ("id" varchar PRIMARY KEY NOT NULL, "email" varchar NOT NULL, "password" varchar, "firstName" varchar NOT NULL, "lastName" varchar NOT NULL, "role" varchar NOT NULL DEFAULT ('user'), "defaultModelId" varchar, "defaultSystemPrompt" varchar, "avatarUrl" varchar, "googleId" varchar, "githubId" varchar, "authProvider" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "modelsCount" integer, "settings" json, "documentsEmbeddingsModelId" varchar, "documentSummarizationModelId" varchar, "chatsCount" integer, "defaultTemperature" float DEFAULT (0.7), "defaultMaxTokens" integer DEFAULT (2048), "defaultTopP" float DEFAULT (0.9), "defaultImagesCount" integer DEFAULT (1), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_users"("id", "email", "password", "firstName", "lastName", "role", "defaultModelId", "defaultSystemPrompt", "avatarUrl", "googleId", "githubId", "authProvider", "createdAt", "updatedAt", "modelsCount", "settings", "documentsEmbeddingsModelId", "documentSummarizationModelId", "chatsCount", "defaultTemperature", "defaultMaxTokens", "defaultTopP", "defaultImagesCount") SELECT "id", "email", "password", "firstName", "lastName", "role", "defaultModelId", "defaultSystemPrompt", "avatarUrl", "googleId", "githubId", "authProvider", "createdAt", "updatedAt", "modelsCount", "settings", "documentsEmbeddingsModelId", "documentSummarizationModelId", "chatsCount", "defaultTemperature", "defaultMaxTokens", "defaultTopP", "defaultImagesCount" FROM "users"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`ALTER TABLE "temporary_users" RENAME TO "users"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_af99afb7cf88ce20aff6977e68" ON "users" ("lastName") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5372672fbfd1677205e0ce3ece" ON "users" ("firstName") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_5372672fbfd1677205e0ce3ece"`);
    await queryRunner.query(`DROP INDEX "IDX_af99afb7cf88ce20aff6977e68"`);
    await queryRunner.query(`ALTER TABLE "users" RENAME TO "temporary_users"`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" varchar PRIMARY KEY NOT NULL, "email" varchar NOT NULL, "password" varchar, "firstName" varchar NOT NULL, "lastName" varchar NOT NULL, "role" varchar NOT NULL DEFAULT ('user'), "defaultModelId" varchar, "defaultSystemPrompt" varchar, "avatarUrl" varchar, "googleId" varchar, "githubId" varchar, "authProvider" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "modelsCount" integer, "settings" json, "documentsEmbeddingsModelId" varchar, "documentSummarizationModelId" varchar, "chatsCount" integer, "defaultTemperature" integer DEFAULT (0.7), "defaultMaxTokens" integer DEFAULT (2048), "defaultTopP" integer DEFAULT (0.9), "defaultImagesCount" integer DEFAULT (1), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"))`,
    );
    await queryRunner.query(
      `INSERT INTO "users"("id", "email", "password", "firstName", "lastName", "role", "defaultModelId", "defaultSystemPrompt", "avatarUrl", "googleId", "githubId", "authProvider", "createdAt", "updatedAt", "modelsCount", "settings", "documentsEmbeddingsModelId", "documentSummarizationModelId", "chatsCount", "defaultTemperature", "defaultMaxTokens", "defaultTopP", "defaultImagesCount") SELECT "id", "email", "password", "firstName", "lastName", "role", "defaultModelId", "defaultSystemPrompt", "avatarUrl", "googleId", "githubId", "authProvider", "createdAt", "updatedAt", "modelsCount", "settings", "documentsEmbeddingsModelId", "documentSummarizationModelId", "chatsCount", "defaultTemperature", "defaultMaxTokens", "defaultTopP", "defaultImagesCount" FROM "temporary_users"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_users"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_5372672fbfd1677205e0ce3ece" ON "users" ("firstName") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_af99afb7cf88ce20aff6977e68" ON "users" ("lastName") `,
    );
  }
}
