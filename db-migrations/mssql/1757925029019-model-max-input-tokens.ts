import { MigrationInterface, QueryRunner } from "typeorm";

export class ModelMaxInputTokens1757925029019 implements MigrationInterface {
  name = "ModelMaxInputTokens1757925029019";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "models" ADD "maxInputTokens" int`);
    await queryRunner.query(
      `ALTER TABLE "models" ALTER COLUMN "description" nvarchar(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "models" ALTER COLUMN "description" nvarchar(255) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "maxInputTokens"`,
    );
  }
}
