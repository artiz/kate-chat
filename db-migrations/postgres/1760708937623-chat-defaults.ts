import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatDefaults1760708937623 implements MigrationInterface {
  name = "ChatDefaults1760708937623";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultTemperature" double precision DEFAULT '0.7'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultMaxTokens" integer DEFAULT '2048'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultTopP" double precision DEFAULT '0.9'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultImagesCount" integer DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ADD "systemPrompt" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ALTER COLUMN "apiProvider" SET DEFAULT 'AWS_BEDROCK'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "models" ALTER COLUMN "apiProvider" SET DEFAULT 'aws_bedrock'`,
    );
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "systemPrompt"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "defaultImagesCount"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "defaultTopP"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "defaultMaxTokens"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "defaultTemperature"`,
    );
  }
}
