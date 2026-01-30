import { migrateChatFiles } from "../common/migrate-chat-files";
import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatFiles1769772783985 implements MigrationInterface {
  name = "ChatFiles1769772783985";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."chat_files_type_enum" AS ENUM('image', 'video', 'rag_document', 'inline_document')`,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_files" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "chatId" uuid NOT NULL, "messageId" uuid, "type" "public"."chat_files_type_enum" NOT NULL DEFAULT 'image', "fileName" character varying, "mime" character varying, "uploadFile" character varying, "predominantColor" character varying, "exif" json, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ccac170cfa6fc37488e93e5787a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ADD CONSTRAINT "FK_01fa2aca8a161c864dd05d9d387" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ADD CONSTRAINT "FK_ea9c9ae1f173ad90c9a4d15d2a7" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
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
    await queryRunner.query(`ALTER TABLE "chats" ADD "files" json`);
    await queryRunner.query(`DROP TABLE "chat_files"`);
    await queryRunner.query(`DROP TYPE "public"."chat_files_type_enum"`);
  }
}
