import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatIsPinned1762702965013 implements MigrationInterface {
  name = "ChatIsPinned1762702965013";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chats" ADD "isPinned" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "isPinned"`);
  }
}
