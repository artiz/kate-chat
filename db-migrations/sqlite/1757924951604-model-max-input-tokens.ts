import { MigrationInterface, QueryRunner } from "typeorm";

export class ModelMaxInputTokens1757924951604 implements MigrationInterface {
  name = "ModelMaxInputTokens1757924951604";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "type" varchar NOT NULL DEFAULT ('chat'), "streaming" boolean NOT NULL DEFAULT (0), "imageInput" boolean NOT NULL DEFAULT (0), "maxInputTokens" integer, CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_models"("id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput") SELECT "id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput" FROM "models"`,
    );
    await queryRunner.query(`DROP TABLE "models"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_models" RENAME TO "models"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "models" RENAME TO "temporary_models"`,
    );
    await queryRunner.query(
      `CREATE TABLE "models" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "modelId" varchar NOT NULL, "description" varchar, "userId" varchar, "provider" varchar, "apiProvider" varchar NOT NULL DEFAULT ('aws_bedrock'), "isActive" boolean NOT NULL DEFAULT (1), "isCustom" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "type" varchar NOT NULL DEFAULT ('chat'), "streaming" boolean NOT NULL DEFAULT (0), "imageInput" boolean NOT NULL DEFAULT (0), CONSTRAINT "FK_bd0eee09c3dde57cc3b9ac1512a" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "models"("id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput") SELECT "id", "name", "modelId", "description", "userId", "provider", "apiProvider", "isActive", "isCustom", "createdAt", "updatedAt", "type", "streaming", "imageInput" FROM "temporary_models"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_models"`);
  }
}
