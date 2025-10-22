import { MigrationInterface, QueryRunner } from "typeorm";

export class Vec1761117200442 implements MigrationInterface {
  name = "Vec1761117200442";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`defaultTemperature\` \`defaultTemperature\` float NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`defaultTopP\` \`defaultTopP\` float NULL DEFAULT '1'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`defaultTopP\` \`defaultTopP\` float NULL DEFAULT '0.9'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`defaultTemperature\` \`defaultTemperature\` float NULL DEFAULT '0.7'`,
    );
  }
}
