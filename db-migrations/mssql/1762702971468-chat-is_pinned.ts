import { MigrationInterface, QueryRunner } from "typeorm";

export class ChatIsPinned1762702971468 implements MigrationInterface {
  name = "ChatIsPinned1762702971468";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chats" ADD "isPinned" bit NOT NULL CONSTRAINT "DF_36b2c377fb1b97df6b98347e67f" DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chats" DROP CONSTRAINT "DF_36b2c377fb1b97df6b98347e67f"`,
    );
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "isPinned"`);
  }
}
