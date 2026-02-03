import { MigrationInterface, QueryRunner } from "typeorm";

export class ModelCustomSettings1769980345082 implements MigrationInterface {
  name = "ModelCustomSettings1769980345082";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "models" ADD "customSettings" json`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "customSettings"`,
    );
  }
}
