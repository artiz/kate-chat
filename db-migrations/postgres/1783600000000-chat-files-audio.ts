import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatFilesAudio1783600000000 implements MigrationInterface {
  name = "ChatFilesAudio1783600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."chat_files_type_enum" RENAME TO "chat_files_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."chat_files_type_enum" AS ENUM('image', 'video', 'audio', 'rag_document', 'inline_document')`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ALTER COLUMN "type" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ALTER COLUMN "type" TYPE "public"."chat_files_type_enum" USING "type"::"text"::"public"."chat_files_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ALTER COLUMN "type" SET DEFAULT 'image'`,
    );
    await queryRunner.query(`DROP TYPE "public"."chat_files_type_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "chat_files" SET "type" = 'image' WHERE "type" = 'audio'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."chat_files_type_enum_old" AS ENUM('image', 'video', 'rag_document', 'inline_document')`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ALTER COLUMN "type" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ALTER COLUMN "type" TYPE "public"."chat_files_type_enum_old" USING "type"::"text"::"public"."chat_files_type_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ALTER COLUMN "type" SET DEFAULT 'image'`,
    );
    await queryRunner.query(`DROP TYPE "public"."chat_files_type_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."chat_files_type_enum_old" RENAME TO "chat_files_type_enum"`,
    );
  }
}
