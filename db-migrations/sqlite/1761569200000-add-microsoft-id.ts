import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMicrosoftId1761569200000 implements MigrationInterface {
  name = "AddMicrosoftId1761569200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "microsoftId" varchar`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "microsoftId"`);
  }
}
