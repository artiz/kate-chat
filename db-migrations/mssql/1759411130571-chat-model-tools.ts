import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatModelTools1759411130571 implements MigrationInterface {
  name = "ChatModelTools1759411130571";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "models" ADD "tools" ntext`);
    await queryRunner.query(`ALTER TABLE "chats" ADD "tools" ntext`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "tools"`);
    await queryRunner.query(`ALTER TABLE "models" DROP COLUMN "tools"`);
  }
}
