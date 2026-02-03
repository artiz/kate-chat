import { MigrationInterface, QueryRunner } from "typeorm";

export class ModelCustomSettings1769980352730 implements MigrationInterface {
  name = "ModelCustomSettings1769980352730";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "models" ADD "customSettings" ntext`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "customSettings"`,
    );
  }
}
