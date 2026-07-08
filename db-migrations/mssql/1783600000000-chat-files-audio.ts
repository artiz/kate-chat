import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatFilesAudio1783600000000 implements MigrationInterface {
  name = "ChatFilesAudio1783600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_files" DROP CONSTRAINT "CHK_4d72304e88244f835bb27804b5_ENUM"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ADD CONSTRAINT "CHK_4d72304e88244f835bb27804b5_ENUM" CHECK(type IN ('image','video','audio','rag_document','inline_document'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "chat_files" SET "type" = 'image' WHERE "type" = 'audio'`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" DROP CONSTRAINT "CHK_4d72304e88244f835bb27804b5_ENUM"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ADD CONSTRAINT "CHK_4d72304e88244f835bb27804b5_ENUM" CHECK(type IN ('image','video','rag_document','inline_document'))`,
    );
  }
}
