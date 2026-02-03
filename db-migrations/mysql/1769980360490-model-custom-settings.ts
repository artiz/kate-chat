import { MigrationInterface, QueryRunner } from "typeorm";

export class ModelCustomSettings1769980360490 implements MigrationInterface {
  name = "ModelCustomSettings1769980360490";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`models\` ADD \`customSettings\` json NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`models\` DROP COLUMN \`customSettings\``,
    );
  }
}
