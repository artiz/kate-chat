import { MigrationInterface, QueryRunner } from "typeorm";

export class DocumentMetadata1772219920648 implements MigrationInterface {
  name = "DocumentMetadata1772219920648";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_edef2e837ed65c05e116250a21"`);
    await queryRunner.query(`DROP INDEX "IDX_95e8f97e178311e7eb65e63289"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_documents" ("id" varchar PRIMARY KEY NOT NULL, "fileName" varchar(4000) NOT NULL, "mime" varchar, "fileSize" bigint NOT NULL DEFAULT (0), "sha256checksum" varchar NOT NULL, "s3key" varchar(4000), "ownerId" varchar NOT NULL, "embeddingsModelId" varchar, "summaryModelId" varchar, "summary" text, "pagesCount" integer NOT NULL DEFAULT (0), "status" varchar NOT NULL DEFAULT ('upload'), "statusInfo" text, "statusProgress" float NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "metadata" json, CONSTRAINT "FK_4106f2a9b30c9ff2f717894a970" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_documents"("id", "fileName", "mime", "fileSize", "sha256checksum", "s3key", "ownerId", "embeddingsModelId", "summaryModelId", "summary", "pagesCount", "status", "statusInfo", "statusProgress", "createdAt", "updatedAt") SELECT "id", "fileName", "mime", "fileSize", "sha256checksum", "s3key", "ownerId", "embeddingsModelId", "summaryModelId", "summary", "pagesCount", "status", "statusInfo", "statusProgress", "createdAt", "updatedAt" FROM "documents"`,
    );
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_documents" RENAME TO "documents"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_edef2e837ed65c05e116250a21" ON "documents" ("sha256checksum") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_95e8f97e178311e7eb65e63289" ON "documents" ("fileName") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_95e8f97e178311e7eb65e63289"`);
    await queryRunner.query(`DROP INDEX "IDX_edef2e837ed65c05e116250a21"`);
    await queryRunner.query(
      `ALTER TABLE "documents" RENAME TO "temporary_documents"`,
    );
    await queryRunner.query(
      `CREATE TABLE "documents" ("id" varchar PRIMARY KEY NOT NULL, "fileName" varchar(4000) NOT NULL, "mime" varchar, "fileSize" bigint NOT NULL DEFAULT (0), "sha256checksum" varchar NOT NULL, "s3key" varchar(4000), "ownerId" varchar NOT NULL, "embeddingsModelId" varchar, "summaryModelId" varchar, "summary" text, "pagesCount" integer NOT NULL DEFAULT (0), "status" varchar NOT NULL DEFAULT ('upload'), "statusInfo" text, "statusProgress" float NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_4106f2a9b30c9ff2f717894a970" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "documents"("id", "fileName", "mime", "fileSize", "sha256checksum", "s3key", "ownerId", "embeddingsModelId", "summaryModelId", "summary", "pagesCount", "status", "statusInfo", "statusProgress", "createdAt", "updatedAt") SELECT "id", "fileName", "mime", "fileSize", "sha256checksum", "s3key", "ownerId", "embeddingsModelId", "summaryModelId", "summary", "pagesCount", "status", "statusInfo", "statusProgress", "createdAt", "updatedAt" FROM "temporary_documents"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_documents"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_95e8f97e178311e7eb65e63289" ON "documents" ("fileName") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_edef2e837ed65c05e116250a21" ON "documents" ("sha256checksum") `,
    );
  }
}
