import { MigrationInterface, QueryRunner } from "typeorm";

export class Rag1756981891461 implements MigrationInterface {
  name = "Rag1756981891461";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "messages" DROP CONSTRAINT "FK_1ba536732f253c712a73a53ea71"`,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_documents" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_550821f5913a29966af161565ce" DEFAULT NEWSEQUENTIALID(), "chatId" uniqueidentifier NOT NULL, "documentId" uniqueidentifier NOT NULL, CONSTRAINT "PK_550821f5913a29966af161565ce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0bf6b1e9f455bba598d4c73076" ON "chat_documents" ("chatId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fee8b0b8a78f1daa22e05ea268" ON "chat_documents" ("documentId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "documents" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_ac51aa5181ee2036f5ca482857c" DEFAULT NEWSEQUENTIALID(), "fileName" nvarchar(4000) NOT NULL, "mime" nvarchar(255), "fileSize" bigint NOT NULL CONSTRAINT "DF_046f2c6cf1ba44f64f5665bda29" DEFAULT 0, "sha256checksum" nvarchar(255) NOT NULL, "s3key" nvarchar(4000), "ownerId" uniqueidentifier NOT NULL, "embeddingsModelId" nvarchar(255), "summaryModelId" nvarchar(255), "summary" text, "pagesCount" int NOT NULL CONSTRAINT "DF_3fe457a4054350b1525006d9efd" DEFAULT 0, "status" nvarchar(255) NOT NULL CONSTRAINT "DF_709389d904fa03bdf5ec84998da" DEFAULT 'upload', "statusInfo" text, "statusProgress" float NOT NULL, "createdAt" datetime2 NOT NULL CONSTRAINT "DF_f8cc10f6d16ee343bbf23b829ed" DEFAULT getdate(), "updatedAt" datetime2 NOT NULL CONSTRAINT "DF_3ae92d698be07180310a1c91510" DEFAULT getdate(), CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_95e8f97e178311e7eb65e63289" ON "documents" ("fileName") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_edef2e837ed65c05e116250a21" ON "documents" ("sha256checksum") `,
    );
    await queryRunner.query(
      `CREATE TABLE "document_chunks" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_7f9060084e9b872dbb567193978" DEFAULT NEWSEQUENTIALID(), "documentId" uniqueidentifier NOT NULL, "modelId" nvarchar(255) NOT NULL, "page" int NOT NULL CONSTRAINT "DF_1b739ba09cc850515b3f10c6e14" DEFAULT 0, "pageIndex" bigint NOT NULL CONSTRAINT "DF_46e3a3c69e0530d1bf153c47334" DEFAULT 0, "content" text NOT NULL, "embedding" vector(1998), CONSTRAINT "PK_7f9060084e9b872dbb567193978" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eaf9afaf30fb7e2ac25989db51" ON "document_chunks" ("documentId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP CONSTRAINT "DF_78560f72d2d6c2837dfc88bc06c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsEmbeddingsOut"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP CONSTRAINT "DF_6443725656366617d0fb104d424"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsImageOut"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP CONSTRAINT "DF_5d1866196b3ba768680f5367e08"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsImageIn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP CONSTRAINT "DF_056fd112d98f67c8b5b097926cf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsEmbeddingsIn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP CONSTRAINT "DF_3b116cd9b215008563fcc47e8c0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsTextOut"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP CONSTRAINT "DF_d3d6facc2a5d04b3b9529fc338c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsTextIn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP CONSTRAINT "DF_7a72a8448920cff446e5a375459"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "supportsStreaming"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "type" nvarchar(255) NOT NULL CONSTRAINT "DF_8df74483aed9bb6dcc8ff2a886d" DEFAULT 'chat'`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "streaming" bit NOT NULL CONSTRAINT "DF_c292104615b610a60bf4771e5d6" DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "imageInput" bit NOT NULL CONSTRAINT "DF_e28a6a39cdfdee52aca15d48bb1" DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "documentsEmbeddingsModelId" nvarchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "documentSummarizationModelId" nvarchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ALTER COLUMN "description" nvarchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" DROP CONSTRAINT "DF_460ad39b7ce9368acc2f898a4b3"`,
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
      `ALTER TABLE "messages" ADD CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
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
      `ALTER TABLE "messages" DROP CONSTRAINT "FK_1ba536732f253c712a73a53ea71"`,
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
      `DROP INDEX "IDX_af99afb7cf88ce20aff6977e68" ON "users"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_5372672fbfd1677205e0ce3ece" ON "users"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ADD CONSTRAINT "DF_460ad39b7ce9368acc2f898a4b3" DEFAULT '' FOR "description"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ALTER COLUMN "description" nvarchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "documentSummarizationModelId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "documentsEmbeddingsModelId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP CONSTRAINT "DF_e28a6a39cdfdee52aca15d48bb1"`,
    );
    await queryRunner.query(`ALTER TABLE "models" DROP COLUMN "imageInput"`);
    await queryRunner.query(
      `ALTER TABLE "models" DROP CONSTRAINT "DF_c292104615b610a60bf4771e5d6"`,
    );
    await queryRunner.query(`ALTER TABLE "models" DROP COLUMN "streaming"`);
    await queryRunner.query(
      `ALTER TABLE "models" DROP CONSTRAINT "DF_8df74483aed9bb6dcc8ff2a886d"`,
    );

    await queryRunner.query(`ALTER TABLE "models" DROP COLUMN "type"`);
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsStreaming" bit NOT NULL CONSTRAINT "DF_7a72a8448920cff446e5a375459" DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsTextIn" bit NOT NULL CONSTRAINT "DF_d3d6facc2a5d04b3b9529fc338c" DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsTextOut" bit NOT NULL CONSTRAINT "DF_3b116cd9b215008563fcc47e8c0" DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsEmbeddingsIn" bit NOT NULL CONSTRAINT "DF_056fd112d98f67c8b5b097926cf" DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsImageIn" bit NOT NULL CONSTRAINT "DF_5d1866196b3ba768680f5367e08" DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsImageOut" bit NOT NULL CONSTRAINT "DF_6443725656366617d0fb104d424" DEFAULT 0 `,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ADD "supportsEmbeddingsOut" bit NOT NULL  CONSTRAINT "DF_78560f72d2d6c2837dfc88bc06c" DEFAULT 0 `,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_eaf9afaf30fb7e2ac25989db51" ON "document_chunks"`,
    );
    await queryRunner.query(`DROP TABLE "document_chunks"`);
    await queryRunner.query(
      `DROP INDEX "IDX_edef2e837ed65c05e116250a21" ON "documents"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_95e8f97e178311e7eb65e63289" ON "documents"`,
    );
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(
      `DROP INDEX "IDX_fee8b0b8a78f1daa22e05ea268" ON "chat_documents"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_0bf6b1e9f455bba598d4c73076" ON "chat_documents"`,
    );
    await queryRunner.query(`DROP TABLE "chat_documents"`);
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "FK_1ba536732f253c712a73a53ea71" FOREIGN KEY ("linkedToMessageId") REFERENCES "messages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
