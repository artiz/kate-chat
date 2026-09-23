import { MigrationInterface, QueryRunner } from "typeorm";

/** Files a skill's program produced in the user's browser and attached to the answer. */
export class ChatFilesGenerated1790100000000 implements MigrationInterface {
  name = "ChatFilesGenerated1790100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`chat_files\` CHANGE \`type\` \`type\` enum ('image', 'video', 'audio', 'rag_document', 'inline_document', 'generated') NOT NULL DEFAULT 'image'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM \`chat_files\` WHERE \`type\` = 'generated'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_files\` CHANGE \`type\` \`type\` enum ('image', 'video', 'audio', 'rag_document', 'inline_document') NOT NULL DEFAULT 'image'`,
    );
  }
}
