import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatIsPinned1762702979295 implements MigrationInterface {
  name = "ChatIsPinned1762702979295";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`chats\` ADD \`isPinned\` tinyint NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`chats\` DROP COLUMN \`isPinned\``);
  }
}
