import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMicrosoftId1761569116703 implements MigrationInterface {
  name = "AddMicrosoftId1761569116703";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "microsoftId" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "microsoftId"`);
  }
}
