import { MigrationInterface, QueryRunner } from "typeorm";

export class ModelMaxInputTokens1757924899607 implements MigrationInterface {
  name = "ModelMaxInputTokens1757924899607";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "models" ADD "maxInputTokens" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "models" DROP COLUMN "maxInputTokens"`,
    );
  }
}
