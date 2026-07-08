import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatFilesAudio1783600000000 implements MigrationInterface {
  name = "ChatFilesAudio1783600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`chat_files\` CHANGE \`type\` \`type\` enum ('image', 'video', 'audio', 'rag_document', 'inline_document') NOT NULL DEFAULT 'image'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`chat_files\` SET \`type\` = 'image' WHERE \`type\` = 'audio'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_files\` CHANGE \`type\` \`type\` enum ('image', 'video', 'rag_document', 'inline_document') NOT NULL DEFAULT 'image'`,
    );
  }
}
