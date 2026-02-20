import { MigrationInterface, QueryRunner } from "typeorm";

export class OptimizeUserSettings1771592123427 implements MigrationInterface {
  name = "OptimizeUserSettings1771592123427";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "defaultModelId"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "defaultSystemPrompt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "documentsEmbeddingsModelId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "documentSummarizationModelId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "defaultTemperature"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "defaultMaxTokens"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "defaultTopP"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "defaultImagesCount"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultImagesCount" integer DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultTopP" double precision DEFAULT '0.9'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultMaxTokens" integer DEFAULT '2048'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultTemperature" double precision DEFAULT '0.7'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "documentSummarizationModelId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "documentsEmbeddingsModelId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultSystemPrompt" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultModelId" character varying`,
    );
  }
}
