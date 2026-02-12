import { MigrationInterface, QueryRunner } from "typeorm";

export class McpServerAuth1770898965760 implements MigrationInterface {
  name = "McpServerAuth1770898965760";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" DROP CONSTRAINT "FK_mcp_servers_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" ALTER COLUMN "authType" SET DEFAULT 'NONE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" ADD CONSTRAINT "FK_23850a3c7767d2f4ffaea8fd02b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" DROP CONSTRAINT "FK_23850a3c7767d2f4ffaea8fd02b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" ALTER COLUMN "authType" SET DEFAULT 'none'`,
    );
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" ADD CONSTRAINT "FK_mcp_servers_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
