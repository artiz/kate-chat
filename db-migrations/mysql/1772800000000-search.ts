import { MigrationInterface, QueryRunner } from "typeorm";

export class Search1772800000000 implements MigrationInterface {
  name = "Search1772800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`chats\` ADD FULLTEXT INDEX \`chats_title_fts\` (\`title\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` ADD FULLTEXT INDEX \`messages_content_fts\` (\`content\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`documents\` ADD FULLTEXT INDEX \`documents_search_fts\` (\`fileName\`, \`summary\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`documents\` DROP INDEX \`documents_search_fts\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` DROP INDEX \`messages_content_fts\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`chats\` DROP INDEX \`chats_title_fts\``,
    );
  }
}
