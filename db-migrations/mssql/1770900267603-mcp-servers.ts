import { MigrationInterface, QueryRunner } from "typeorm";

export class McpServers1770900267603 implements MigrationInterface {
  name = "McpServers1770900267603";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mcp_servers" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_c781b3dc7cb2a5d19460b71914d" DEFAULT NEWSEQUENTIALID(), "name" nvarchar(255) NOT NULL, "url" nvarchar(255) NOT NULL, "description" nvarchar(255), "transportType" nvarchar(255) NOT NULL CONSTRAINT "DF_04a426e550fc1b2f8a14834a919" DEFAULT 'STREAMABLE_HTTP', "authType" nvarchar(255) NOT NULL CONSTRAINT "DF_6decb50aac6999051c3e092e847" DEFAULT 'NONE', "authConfig" ntext, "tools" ntext, "isActive" bit NOT NULL CONSTRAINT "DF_8fd8078519ef77622602f49b4f8" DEFAULT 1, "userId" uniqueidentifier, "createdAt" datetime2 NOT NULL CONSTRAINT "DF_e2387442faa5ca67914e0c9b795" DEFAULT getdate(), "updatedAt" datetime2 NOT NULL CONSTRAINT "DF_9fb3499a8097fdcff9afd3fd5d2" DEFAULT getdate(), CONSTRAINT "PK_c781b3dc7cb2a5d19460b71914d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" ADD CONSTRAINT "FK_23850a3c7767d2f4ffaea8fd02b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mcp_servers" DROP CONSTRAINT "FK_23850a3c7767d2f4ffaea8fd02b"`,
    );
    await queryRunner.query(`DROP TABLE "mcp_servers"`);
  }
}
