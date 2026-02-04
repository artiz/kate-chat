import { MigrationInterface, QueryRunner } from "typeorm";

export class McpServers1770198259005 implements MigrationInterface {
  name = "McpServers1770198259005";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "mcp_servers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "url" character varying NOT NULL,
        "description" character varying,
        "authType" character varying NOT NULL DEFAULT 'none',
        "authConfig" json,
        "isActive" boolean NOT NULL DEFAULT true,
        "userId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mcp_servers" PRIMARY KEY ("id")
      )`
    );

    await queryRunner.query(
      `ALTER TABLE "mcp_servers" ADD CONSTRAINT "FK_mcp_servers_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mcp_servers" DROP CONSTRAINT IF EXISTS "FK_mcp_servers_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mcp_servers"`);
  }
}
