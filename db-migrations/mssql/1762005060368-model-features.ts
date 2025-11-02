import { MigrationInterface, QueryRunner } from "typeorm";

export class ModelFeatures1762005060368 implements MigrationInterface {
  name = "ModelFeatures1762005060368";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "models" ADD "features" ntext`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "models" DROP COLUMN "features"`);
  }
}
