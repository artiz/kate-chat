import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatModelTools1759411126173 implements MigrationInterface {
  name = "ChatModelTools1759411126173";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "models" ADD "tools" json`);
    await queryRunner.query(`ALTER TABLE "chats" ADD "tools" json`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "tools"`);
    await queryRunner.query(`ALTER TABLE "models" DROP COLUMN "tools"`);
  }
}
