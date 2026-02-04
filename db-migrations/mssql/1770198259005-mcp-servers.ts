import { MigrationInterface, QueryRunner } from "typeorm";

export class MCPServers1770198259005 implements MigrationInterface {
  name = "MCPServers1770198259005";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mcp_servers" (
        "id" uniqueidentifier NOT NULL CONSTRAINT "DF_mcp_servers_id" DEFAULT NEWSEQUENTIALID(),
        "name" nvarchar(255) NOT NULL,
        "url" nvarchar(1024) NOT NULL,
        "description" nvarchar(1024),
        "authType" nvarchar(50) NOT NULL CONSTRAINT "DF_mcp_servers_authType" DEFAULT 'none',
        "authConfig" ntext,
        "isActive" bit NOT NULL CONSTRAINT "DF_mcp_servers_isActive" DEFAULT 1,
        "userId" uniqueidentifier,
        "createdAt" datetime2 NOT NULL CONSTRAINT "DF_mcp_servers_createdAt" DEFAULT GETDATE(),
        "updatedAt" datetime2 NOT NULL CONSTRAINT "DF_mcp_servers_updatedAt" DEFAULT GETDATE(),
        CONSTRAINT "PK_mcp_servers" PRIMARY KEY ("id")
      )`
    );

    await queryRunner.query(
      `ALTER TABLE "mcp_servers" ADD CONSTRAINT "FK_mcp_servers_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mcp_servers" DROP CONSTRAINT "FK_mcp_servers_user"`);
    await queryRunner.query(`DROP TABLE "mcp_servers"`);
  }
}
