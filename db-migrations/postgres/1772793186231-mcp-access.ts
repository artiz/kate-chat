import { MigrationInterface, QueryRunner } from "typeorm";

export class McpAccess1772793186231 implements MigrationInterface {
  name = "McpAccess1772793186231";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" ADD "access" character varying DEFAULT 'PRIVATE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mcp_servers" DROP COLUMN "access"`);
  }
}
