import { MigrationInterface, QueryRunner } from "typeorm";

export class TuneTypes1757012213090 implements MigrationInterface {
  name = "TuneTypes1757012213090";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "models" ALTER COLUMN "description" DROP NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "content"`);
    await queryRunner.query(
      `ALTER TABLE "messages" ADD "content" text NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "content"`);
    await queryRunner.query(
      `ALTER TABLE "messages" ADD "content" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "models" ALTER COLUMN "description" SET NOT NULL`,
    );
  }
}
