import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMicrosoftId1761569123713 implements MigrationInterface {
  name = "AddMicrosoftId1761569123713";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`microsoftId\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`microsoftId\``,
    );
  }
}
