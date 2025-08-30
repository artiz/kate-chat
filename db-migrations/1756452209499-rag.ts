import { MigrationInterface, QueryRunner } from "typeorm";
import { BOOLEAN_FALSE, BOOLEAN_TRUE, DB_TYPE, ID, TIMESTAMP } from "./common";

export class Rag1756452209499 implements MigrationInterface {
  name = "Rag1756452209499";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE 
            "documents" (
            ${ID}, 
            "fileName" character varying NOT NULL, 
            "mime" character varying, 
            "fileSize" bigint NOT NULL DEFAULT '0', 
            "sha256checksum" character varying NOT NULL, 
            "s3key" character varying, 
            "ownerId" uuid NOT NULL, 
            "embeddingsModelId" character varying, 
            "summaryModelId" character varying, 
            "summary" character varying, 
            "pagesCount" integer NOT NULL DEFAULT '0', 
            "status" character varying NOT NULL DEFAULT 'upload', 
            "statusInfo" character varying, 
            "statusProgress" double precision NOT NULL, 
            "createdAt" ${TIMESTAMP}, 
            "updatedAt" ${TIMESTAMP},
            CONSTRAINT "FK_documents_owner" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
    await queryRunner.query(
      `CREATE INDEX "IDX_95e8f97e178311e7eb65e63289" ON "documents" ("fileName") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_edef2e837ed65c05e116250a21" ON "documents" ("sha256checksum") `,
    );

    await queryRunner.query(`CREATE TABLE "chat_documents" (
            ${ID}, 
            "chatId" uuid NOT NULL, 
            "documentId" uuid NOT NULL,
            CONSTRAINT "FK_chat_documents_document" FOREIGN KEY ("documentId") REFERENCES "documents" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
            CONSTRAINT "FK_chat_documents_chat" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE NO ACTION)
            `);

    await queryRunner.query(
      `CREATE INDEX "IDX_0bf6b1e9f455bba598d4c73076" ON "chat_documents" ("chatId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fee8b0b8a78f1daa22e05ea268" ON "chat_documents" ("documentId") `,
    );

    // TODO: sqlite support requres typeorm support: https://github.com/typeorm/typeorm/issues/10658
    if (DB_TYPE === "postgres") {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
      await queryRunner.query(`CREATE TABLE "document_chunks" (
                ${ID},
                "documentId" uuid NOT NULL, 
                "page" integer NOT NULL DEFAULT (0),
                "pageIndex" bigint NOT NULL DEFAULT (0),
                "content" varchar NOT NULL,
                "embedding" vector(3072), 
                CONSTRAINT "FK_document_chunks_document" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION
                )`);
    } else if (DB_TYPE === "sqlite") {
      await queryRunner.query(`CREATE TABLE "document_chunks" (
                ${ID},
                "documentId" uuid NOT NULL, 
                "page" integer NOT NULL DEFAULT (0),
                "pageIndex" bigint NOT NULL DEFAULT (0),
                "content" varchar NOT NULL,
                "embedding" text, 
                CONSTRAINT "FK_document_chunks_document" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION
                )`);

      await queryRunner.query(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vss_document_chunks USING vec0(
          embedding float[3072]
      )`);
    } else {
      await queryRunner.query(`CREATE TABLE "document_chunks" (
                ${ID}, 
                "documentId" uuid NOT NULL, 
                "page" integer NOT NULL DEFAULT '0', 
                "pageIndex" bigint NOT NULL DEFAULT '0', 
                "content" character varying NOT NULL, 
                "embedding" text,
                CONSTRAINT "FK_document_chunks_document" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION
                )`);
    }
    await queryRunner.query(
      `CREATE INDEX "IDX_eaf9afaf30fb7e2ac25989db51" ON "document_chunks" ("documentId") `,
    );

    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsStreaming"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsTextIn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsTextOut"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsEmbeddingsIn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsImageIn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsImageOut"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsEmbeddingsOut"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "type" character varying NOT NULL DEFAULT 'chat'`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "streaming" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "imageInput" boolean NOT NULL DEFAULT false`,
    );
    if (DB_TYPE === "postgres") {
      await queryRunner.query(
        `ALTER TABLE "messages" ADD CONSTRAINT "messages_role_check" CHECK (((role)::text = ANY ((ARRAY['user'::character varying, 'assistant'::character varying, 'error'::character varying, 'system'::character varying])::text[])))`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "users" ADD "documentsEmbeddingsModelId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "documentSummarizationModelId" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "documentSummarizationModelId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "documentsEmbeddingsModelId"`,
    );

    await queryRunner.query(`ALTER TABLE "models" DROP COLUMN "imageInput"`);
    await queryRunner.query(`ALTER TABLE "models" DROP COLUMN "streaming"`);
    await queryRunner.query(`ALTER TABLE "models" DROP COLUMN "type"`);
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsEmbeddingsOut" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsImageOut" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsImageIn" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsEmbeddingsIn" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsTextOut" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsTextIn" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsStreaming" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_eaf9afaf30fb7e2ac25989db51"`,
    );
    await queryRunner.query(`DROP TABLE "document_chunks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vss_document_chunks"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_edef2e837ed65c05e116250a21"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_95e8f97e178311e7eb65e63289"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_fee8b0b8a78f1daa22e05ea268"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_0bf6b1e9f455bba598d4c73076"`,
    );
    await queryRunner.query(`DROP TABLE "chat_documents"`);
    await queryRunner.query(`DROP TABLE "documents"`);
    if (DB_TYPE === "postgres") {
      await queryRunner.query(
        `ALTER TABLE "messages" DROP CONSTRAINT "messages_role_check"`,
      );
    }
  }
}
