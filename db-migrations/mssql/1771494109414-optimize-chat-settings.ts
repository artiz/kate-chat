import { MigrationInterface, QueryRunner } from "typeorm";

export class OptimizeChatSettings1771494109414 implements MigrationInterface {
  name = "OptimizeChatSettings1771494109414";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "temperature"`);
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "maxTokens"`);
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "topP"`);
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "imagesCount"`);
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "systemPrompt"`);
    await queryRunner.query(`ALTER TABLE "chats" ADD "settings" ntext`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "settings"`);
    await queryRunner.query(
      `ALTER TABLE "chats" ADD "systemPrompt" nvarchar(255)`,
    );
    await queryRunner.query(`ALTER TABLE "chats" ADD "imagesCount" int`);
    await queryRunner.query(`ALTER TABLE "chats" ADD "topP" float`);
    await queryRunner.query(`ALTER TABLE "chats" ADD "maxTokens" int`);
    await queryRunner.query(`ALTER TABLE "chats" ADD "temperature" float`);
  }
}
