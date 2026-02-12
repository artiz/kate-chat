import { MigrationInterface, QueryRunner } from "typeorm";

export class McpServerAuth1770898976986 implements MigrationInterface {
  name = "McpServerAuth1770898976986";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` DROP FOREIGN KEY \`FK_mcp_servers_user\``,
    );
    await queryRunner.query(`ALTER TABLE \`mcp_servers\` DROP COLUMN \`url\``);
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` ADD \`url\` varchar(255) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` DROP COLUMN \`description\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` ADD \`description\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` DROP COLUMN \`transportType\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` ADD \`transportType\` varchar(255) NOT NULL DEFAULT 'STREAMABLE_HTTP'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` DROP COLUMN \`authType\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` ADD \`authType\` varchar(255) NOT NULL DEFAULT 'NONE'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` DROP COLUMN \`userId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` ADD \`userId\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` ADD CONSTRAINT \`FK_23850a3c7767d2f4ffaea8fd02b\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` DROP FOREIGN KEY \`FK_23850a3c7767d2f4ffaea8fd02b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` DROP COLUMN \`userId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` ADD \`userId\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` DROP COLUMN \`authType\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` ADD \`authType\` varchar(50) NOT NULL DEFAULT 'none'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` DROP COLUMN \`transportType\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` ADD \`transportType\` varchar(50) NOT NULL DEFAULT '_utf8mb4\'STREAMABLE_HTTP\''`,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` DROP COLUMN \`description\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` ADD \`description\` varchar(1024) NULL`,
    );
    await queryRunner.query(`ALTER TABLE \`mcp_servers\` DROP COLUMN \`url\``);
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` ADD \`url\` varchar(1024) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` ADD CONSTRAINT \`FK_mcp_servers_user\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
