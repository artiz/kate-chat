import { MigrationInterface, QueryRunner } from "typeorm";

export class MCPServers1770198259005 implements MigrationInterface {
  name = "MCPServers1770198259005";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS \`mcp_servers\` (
        \`id\` varchar(36) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`url\` varchar(1024) NOT NULL,
        \`description\` varchar(1024) NULL,
        \`authType\` varchar(50) NOT NULL DEFAULT 'none',
        \`authConfig\` json NULL,
        \`isActive\` tinyint(1) NOT NULL DEFAULT 1,
        \`userId\` varchar(36) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_mcp_servers_user\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`mcp_servers\``);
  }
}
