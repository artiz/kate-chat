import { MigrationInterface, QueryRunner } from "typeorm";

export class OptimizeUserSettings1771592135743 implements MigrationInterface {
  name = "OptimizeUserSettings1771592135743";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`defaultImagesCount\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`defaultMaxTokens\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`defaultModelId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`defaultSystemPrompt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`defaultTemperature\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`defaultTopP\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`documentsEmbeddingsModelId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`documentSummarizationModelId\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`documentSummarizationModelId\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`documentsEmbeddingsModelId\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`defaultTopP\` float NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`defaultTemperature\` float NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`defaultSystemPrompt\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`defaultModelId\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`defaultMaxTokens\` int NULL DEFAULT '2048'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`defaultImagesCount\` int NULL DEFAULT '1'`,
    );
  }
}
