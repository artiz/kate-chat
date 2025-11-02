import { MigrationInterface, QueryRunner } from "typeorm";

export class ModelFeatures1762005053803 implements MigrationInterface {
  name = "ModelFeatures1762005053803";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "models" ADD "features" json`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "models" DROP COLUMN "features"`);
  }
}
