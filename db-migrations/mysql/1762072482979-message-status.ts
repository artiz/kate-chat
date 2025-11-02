import { MigrationInterface, QueryRunner } from "typeorm";

export class MessageStatus1762072482979 implements MigrationInterface {
  name = "MessageStatus1762072482979";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`messages\` ADD \`status\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` ADD \`statusInfo\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`messages\` DROP COLUMN \`statusInfo\``,
    );
    await queryRunner.query(`ALTER TABLE \`messages\` DROP COLUMN \`status\``);
  }
}
