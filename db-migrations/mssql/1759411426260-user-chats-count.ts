import { MigrationInterface, QueryRunner } from "typeorm";

export class UserChatsCount1759411426260 implements MigrationInterface {
  name = "UserChatsCount1759411426260";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "chatsCount" int`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "chatsCount"`);
  }
}
