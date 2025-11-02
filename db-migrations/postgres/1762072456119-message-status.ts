import { MigrationInterface, QueryRunner } from "typeorm";

export class MessageStatus1762072456119 implements MigrationInterface {
  name = "MessageStatus1762072456119";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "messages" ADD "status" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD "statusInfo" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "statusInfo"`);
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "status"`);
  }
}
