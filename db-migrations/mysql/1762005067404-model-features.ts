import { MigrationInterface, QueryRunner } from "typeorm";

export class ModelFeatures1762005067404 implements MigrationInterface {
  name = "ModelFeatures1762005067404";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`models\` ADD \`features\` json NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`models\` DROP COLUMN \`features\``);
  }
}
