import { MigrationInterface, QueryRunner } from "typeorm";

export class McpServerAuth1770898960163 implements MigrationInterface {
  name = "McpServerAuth1770898960163";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_mcp_servers" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "url" varchar NOT NULL, "description" varchar, "transportType" varchar NOT NULL DEFAULT ('STREAMABLE_HTTP'), "authType" varchar NOT NULL DEFAULT ('NONE'), "authConfig" json, "tools" json, "isActive" boolean NOT NULL DEFAULT (1), "userId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_mcp_servers"("id", "name", "url", "description", "transportType", "authType", "authConfig", "tools", "isActive", "userId", "createdAt", "updatedAt") SELECT "id", "name", "url", "description", "transportType", "authType", "authConfig", "tools", "isActive", "userId", "createdAt", "updatedAt" FROM "mcp_servers"`,
    );
    await queryRunner.query(`DROP TABLE "mcp_servers"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_mcp_servers" RENAME TO "mcp_servers"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_mcp_servers" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "url" varchar NOT NULL, "description" varchar, "transportType" varchar NOT NULL DEFAULT ('STREAMABLE_HTTP'), "authType" varchar NOT NULL DEFAULT ('NONE'), "authConfig" json, "tools" json, "isActive" boolean NOT NULL DEFAULT (1), "userId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_23850a3c7767d2f4ffaea8fd02b" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_mcp_servers"("id", "name", "url", "description", "transportType", "authType", "authConfig", "tools", "isActive", "userId", "createdAt", "updatedAt") SELECT "id", "name", "url", "description", "transportType", "authType", "authConfig", "tools", "isActive", "userId", "createdAt", "updatedAt" FROM "mcp_servers"`,
    );
    await queryRunner.query(`DROP TABLE "mcp_servers"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_mcp_servers" RENAME TO "mcp_servers"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" RENAME TO "temporary_mcp_servers"`,
    );
    await queryRunner.query(
      `CREATE TABLE "mcp_servers" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "url" varchar NOT NULL, "description" varchar, "transportType" varchar NOT NULL DEFAULT ('STREAMABLE_HTTP'), "authType" varchar NOT NULL DEFAULT ('NONE'), "authConfig" json, "tools" json, "isActive" boolean NOT NULL DEFAULT (1), "userId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `INSERT INTO "mcp_servers"("id", "name", "url", "description", "transportType", "authType", "authConfig", "tools", "isActive", "userId", "createdAt", "updatedAt") SELECT "id", "name", "url", "description", "transportType", "authType", "authConfig", "tools", "isActive", "userId", "createdAt", "updatedAt" FROM "temporary_mcp_servers"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_mcp_servers"`);
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" RENAME TO "temporary_mcp_servers"`,
    );
    await queryRunner.query(
      `CREATE TABLE "mcp_servers" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "url" varchar NOT NULL, "description" varchar, "transportType" varchar NOT NULL DEFAULT ('STREAMABLE_HTTP'), "authType" varchar NOT NULL DEFAULT ('NONE'), "authConfig" json, "tools" json, "isActive" boolean NOT NULL DEFAULT (1), "userId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_mcp_servers_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "mcp_servers"("id", "name", "url", "description", "transportType", "authType", "authConfig", "tools", "isActive", "userId", "createdAt", "updatedAt") SELECT "id", "name", "url", "description", "transportType", "authType", "authConfig", "tools", "isActive", "userId", "createdAt", "updatedAt" FROM "temporary_mcp_servers"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_mcp_servers"`);
  }
}
