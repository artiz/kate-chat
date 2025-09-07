import { MigrationInterface, QueryRunner } from "typeorm";

export class Rag1756982436191 implements MigrationInterface {
  name = "Rag1756982436191";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chat_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "chatId" uuid NOT NULL, "documentId" uuid NOT NULL, CONSTRAINT "PK_550821f5913a29966af161565ce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0bf6b1e9f455bba598d4c73076" ON "chat_documents" ("chatId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fee8b0b8a78f1daa22e05ea268" ON "chat_documents" ("documentId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fileName" character varying(4000) NOT NULL, "mime" character varying, "fileSize" bigint NOT NULL DEFAULT '0', "sha256checksum" character varying NOT NULL, "s3key" character varying(4000), "ownerId" uuid NOT NULL, "embeddingsModelId" character varying, "summaryModelId" character varying, "summary" text, "pagesCount" integer NOT NULL DEFAULT '0', "status" character varying NOT NULL DEFAULT 'upload', "statusInfo" text, "statusProgress" double precision NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_95e8f97e178311e7eb65e63289" ON "documents" ("fileName") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_edef2e837ed65c05e116250a21" ON "documents" ("sha256checksum") `,
    );
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await queryRunner.query(
      `CREATE TABLE "document_chunks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "documentId" uuid NOT NULL, "modelId" character varying NOT NULL, "page" integer NOT NULL DEFAULT '0', "pageIndex" bigint NOT NULL DEFAULT '0', "content" text NOT NULL, "embedding" vector(3072), CONSTRAINT "PK_7f9060084e9b872dbb567193978" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eaf9afaf30fb7e2ac25989db51" ON "document_chunks" ("documentId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsEmbeddingsOut"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsImageOut"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsImageIn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsEmbeddingsIn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsTextOut"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsTextIn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsStreaming"`,
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
    await queryRunner.query(
      `ALTER TABLE "users" ADD "documentsEmbeddingsModelId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "documentSummarizationModelId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ALTER COLUMN "description" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ALTER COLUMN "description" DROP DEFAULT`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5372672fbfd1677205e0ce3ece" ON "users" ("firstName") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_af99afb7cf88ce20aff6977e68" ON "users" ("lastName") `,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_documents" ADD CONSTRAINT "FK_0bf6b1e9f455bba598d4c73076b" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_documents" ADD CONSTRAINT "FK_fee8b0b8a78f1daa22e05ea2682" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_4106f2a9b30c9ff2f717894a970" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_chunks" ADD CONSTRAINT "FK_eaf9afaf30fb7e2ac25989db51b" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document_chunks" DROP CONSTRAINT "FK_eaf9afaf30fb7e2ac25989db51b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_4106f2a9b30c9ff2f717894a970"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_documents" DROP CONSTRAINT "FK_fee8b0b8a78f1daa22e05ea2682"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_documents" DROP CONSTRAINT "FK_0bf6b1e9f455bba598d4c73076b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_af99afb7cf88ce20aff6977e68"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5372672fbfd1677205e0ce3ece"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ALTER COLUMN "description" SET DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ALTER COLUMN "description" SET NOT NULL`,
    );
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
      `ALTER TABLE "models" ADD "supportsStreaming" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsTextIn" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsTextOut" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsEmbeddingsIn" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsImageIn" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsImageOut" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsEmbeddingsOut" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_eaf9afaf30fb7e2ac25989db51"`,
    );
    await queryRunner.query(`DROP TABLE "document_chunks"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_edef2e837ed65c05e116250a21"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_95e8f97e178311e7eb65e63289"`,
    );
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fee8b0b8a78f1daa22e05ea268"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0bf6b1e9f455bba598d4c73076"`,
    );
    await queryRunner.query(`DROP TABLE "chat_documents"`);
  }
}
