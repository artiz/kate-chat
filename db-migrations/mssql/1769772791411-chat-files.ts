import { MigrationInterface, QueryRunner } from "typeorm";
import { migrateChatFiles } from "../common/migrate-chat-files";

export class ChatFiles1769772791411 implements MigrationInterface {
  name = "ChatFiles1769772791411";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chat_files" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_ccac170cfa6fc37488e93e5787a" DEFAULT NEWSEQUENTIALID(), "chatId" uniqueidentifier NOT NULL, "messageId" uniqueidentifier, "type" nvarchar(255) CONSTRAINT CHK_4d72304e88244f835bb27804b5_ENUM CHECK(type IN ('image','video','rag_document','inline_document')) NOT NULL CONSTRAINT "DF_0e39298db243403610f1087c90c" DEFAULT 'image', "fileName" nvarchar(255), "mime" nvarchar(255), "uploadFile" nvarchar(255), "predominantColor" nvarchar(255), "exif" ntext, "createdAt" datetime2 NOT NULL CONSTRAINT "DF_d735c1949ab9cf28c3dabe74403" DEFAULT getdate(), "updatedAt" datetime2 NOT NULL CONSTRAINT "DF_5efbc7576e32bea2b2ca8cc5aaa" DEFAULT getdate(), CONSTRAINT "PK_ccac170cfa6fc37488e93e5787a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ADD CONSTRAINT "FK_01fa2aca8a161c864dd05d9d387" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ADD CONSTRAINT "FK_ea9c9ae1f173ad90c9a4d15d2a7" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    // Migrate data
    await migrateChatFiles(queryRunner);
    // Drop initial column
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "files"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_files" DROP CONSTRAINT "FK_ea9c9ae1f173ad90c9a4d15d2a7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" DROP CONSTRAINT "FK_01fa2aca8a161c864dd05d9d387"`,
    );
    await queryRunner.query(`ALTER TABLE "chats" ADD "files" ntext`);
    await queryRunner.query(`DROP TABLE "chat_files"`);
  }
}
