import { MigrationInterface, QueryRunner } from "typeorm";

/** MCP servers whose tool calls wait for the user to approve them in the chat. */
export class McpRequireApproval1790200000000 implements MigrationInterface {
  name = "McpRequireApproval1790200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" ADD "requireApproval" bit NOT NULL CONSTRAINT "DF_8187219f31a41ad4e197d041543" DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" DROP CONSTRAINT "DF_8187219f31a41ad4e197d041543"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" DROP COLUMN "requireApproval"`,
    );
  }
}
