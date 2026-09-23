import { MigrationInterface, QueryRunner } from "typeorm";

const CHECK = "CHK_4d72304e88244f835bb27804b5_ENUM";

/** Files a skill's program produced in the user's browser and attached to the answer. */
export class ChatFilesGenerated1790100000000 implements MigrationInterface {
  name = "ChatFilesGenerated1790100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_files" DROP CONSTRAINT "${CHECK}"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ADD CONSTRAINT "${CHECK}" CHECK(type IN ('image','video','audio','rag_document','inline_document','generated'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "chat_files" WHERE "type" = 'generated'`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" DROP CONSTRAINT "${CHECK}"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ADD CONSTRAINT "${CHECK}" CHECK(type IN ('image','video','audio','rag_document','inline_document'))`,
    );
  }
}
