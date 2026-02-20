import { MigrationInterface, QueryRunner } from "typeorm";

export class OptimizeUserSettings1771592129087 implements MigrationInterface {
  name = "OptimizeUserSettings1771592129087";

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
      `ALTER TABLE "users" DROP CONSTRAINT "DF_1473d06f34c65658e4bf67de754"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "defaultTemperature"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "DF_cd53606ab67d63687d4fcd0f1d6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "defaultMaxTokens"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "DF_a3c74d3b5a967bdebce568aada2"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "defaultTopP"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "DF_d8df67d90f7e60e6cbfb4a4c7a7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "defaultImagesCount"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "defaultImagesCount" int`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "DF_d8df67d90f7e60e6cbfb4a4c7a7" DEFAULT 1 FOR "defaultImagesCount"`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "defaultTopP" float`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "DF_a3c74d3b5a967bdebce568aada2" DEFAULT 0.9 FOR "defaultTopP"`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "defaultMaxTokens" int`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "DF_cd53606ab67d63687d4fcd0f1d6" DEFAULT 2048 FOR "defaultMaxTokens"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultTemperature" float`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "DF_1473d06f34c65658e4bf67de754" DEFAULT 0.7 FOR "defaultTemperature"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "documentSummarizationModelId" nvarchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "documentsEmbeddingsModelId" nvarchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultSystemPrompt" nvarchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultModelId" nvarchar(255)`,
    );
  }
}
