import { MigrationInterface, QueryRunner } from "typeorm";

export class MCPServers1770198259005 implements MigrationInterface {
  name = "MCPServers1770198259005";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "mcp_servers" (
        "id" varchar PRIMARY KEY NOT NULL,
        "name" varchar NOT NULL,
        "url" varchar NOT NULL,
        "description" varchar,
        "transportType" varchar NOT NULL DEFAULT ('STREAMABLE_HTTP'),
        "authType" varchar NOT NULL DEFAULT ('NONE'),
        "authConfig" json,
        "tools" json,
        "isActive" boolean NOT NULL DEFAULT (1),
        "userId" varchar,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_mcp_servers_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mcp_servers"`);
  }
}
