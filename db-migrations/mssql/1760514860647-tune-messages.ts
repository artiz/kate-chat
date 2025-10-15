import { MigrationInterface, QueryRunner } from "typeorm";

export class TuneMessages1760514860647 implements MigrationInterface {
  name = "TuneMessages1760514860647";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "messages" ALTER COLUMN "modelId" nvarchar(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "messages" ALTER COLUMN "modelId" nvarchar(255) NOT NULL`,
    );
  }
}
