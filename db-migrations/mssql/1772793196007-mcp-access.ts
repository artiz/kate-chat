import { MigrationInterface, QueryRunner } from "typeorm";

export class McpAccess1772793196007 implements MigrationInterface {
  name = "McpAccess1772793196007";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" ADD "access" nvarchar(255) CONSTRAINT "DF_fa95efb893ea995de02ad346a25" DEFAULT 'PRIVATE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" DROP CONSTRAINT "DF_fa95efb893ea995de02ad346a25"`,
    );
    await queryRunner.query(`ALTER TABLE "mcp_servers" DROP COLUMN "access"`);
  }
}
