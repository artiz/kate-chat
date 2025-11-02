import { MigrationInterface, QueryRunner } from "typeorm";

export class MessageStatus1762072467615 implements MigrationInterface {
  name = "MessageStatus1762072467615";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "messages" ADD "status" nvarchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD "statusInfo" nvarchar(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "statusInfo"`);
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "status"`);
  }
}
