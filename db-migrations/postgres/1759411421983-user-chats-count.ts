import { MigrationInterface, QueryRunner } from "typeorm";

export class UserChatsCount1759411421983 implements MigrationInterface {
  name = "UserChatsCount1759411421983";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "chatsCount" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "chatsCount"`);
  }
}
