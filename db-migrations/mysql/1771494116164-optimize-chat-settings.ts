import { MigrationInterface, QueryRunner } from "typeorm";

export class OptimizeChatSettings1771494116164 implements MigrationInterface {
  name = "OptimizeChatSettings1771494116164";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`chats\` DROP COLUMN \`imagesCount\``,
    );
    await queryRunner.query(`ALTER TABLE \`chats\` DROP COLUMN \`maxTokens\``);
    await queryRunner.query(
      `ALTER TABLE \`chats\` DROP COLUMN \`systemPrompt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`chats\` DROP COLUMN \`temperature\``,
    );
    await queryRunner.query(`ALTER TABLE \`chats\` DROP COLUMN \`topP\``);
    await queryRunner.query(`ALTER TABLE \`chats\` ADD \`settings\` json NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`chats\` DROP COLUMN \`settings\``);
    await queryRunner.query(`ALTER TABLE \`chats\` ADD \`topP\` float NULL`);
    await queryRunner.query(
      `ALTER TABLE \`chats\` ADD \`temperature\` float NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chats\` ADD \`systemPrompt\` varchar(255) NULL`,
    );
    await queryRunner.query(`ALTER TABLE \`chats\` ADD \`maxTokens\` int NULL`);
    await queryRunner.query(
      `ALTER TABLE \`chats\` ADD \`imagesCount\` int NULL`,
    );
  }
}
