import { MigrationInterface, QueryRunner } from "typeorm";

export class OptimizeChatSettings1771494103425 implements MigrationInterface {
  name = "OptimizeChatSettings1771494103425";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "temperature"`);
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "maxTokens"`);
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "topP"`);
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "imagesCount"`);
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "systemPrompt"`);
    await queryRunner.query(`ALTER TABLE "chats" ADD "settings" json`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "settings"`);
    await queryRunner.query(
      `ALTER TABLE "chats" ADD "systemPrompt" character varying`,
    );
    await queryRunner.query(`ALTER TABLE "chats" ADD "imagesCount" integer`);
    await queryRunner.query(`ALTER TABLE "chats" ADD "topP" double precision`);
    await queryRunner.query(`ALTER TABLE "chats" ADD "maxTokens" integer`);
    await queryRunner.query(
      `ALTER TABLE "chats" ADD "temperature" double precision`,
    );
  }
}
