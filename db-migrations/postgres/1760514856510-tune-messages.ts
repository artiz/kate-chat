import { MigrationInterface, QueryRunner } from "typeorm";

export class TuneMessages1760514856510 implements MigrationInterface {
  name = "TuneMessages1760514856510";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "messages" ALTER COLUMN "modelId" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "messages" ALTER COLUMN "modelId" SET NOT NULL`,
    );
  }
}
