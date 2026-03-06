import { MigrationInterface, QueryRunner } from "typeorm";

export class McpAccess1772793209485 implements MigrationInterface {
  name = "McpAccess1772793209485";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`documents_search_fts\` ON \`documents\``,
    );
    await queryRunner.query(
      `DROP INDEX \`messages_content_fts\` ON \`messages\``,
    );
    await queryRunner.query(`DROP INDEX \`chats_title_fts\` ON \`chats\``);
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` ADD \`access\` varchar(255) NULL DEFAULT 'PRIVATE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` DROP COLUMN \`access\``,
    );
    await queryRunner.query(
      `CREATE FULLTEXT INDEX \`chats_title_fts\` ON \`chats\` (\`title\`)`,
    );
    await queryRunner.query(
      `CREATE FULLTEXT INDEX \`messages_content_fts\` ON \`messages\` (\`content\`)`,
    );
    await queryRunner.query(
      `CREATE FULLTEXT INDEX \`documents_search_fts\` ON \`documents\` (\`fileName\`, \`summary\`)`,
    );
  }
}
