import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The generated version of this migration also dropped the three full-text indexes and recreated
 * them in down(). They are created by Search1772800000000, which sorts after this one, so on a
 * fresh database the drops ran before anything had created them and migrations stopped with
 * ER_CANT_DROP_FIELD_OR_KEY. The generator emitted them because the database it read had the
 * indexes already. A database that has run this migration is unaffected either way: the drops
 * were followed by the search migration putting the indexes back.
 */
export class McpAccess1772793209485 implements MigrationInterface {
  name = "McpAccess1772793209485";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` ADD \`access\` varchar(255) NULL DEFAULT 'PRIVATE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`mcp_servers\` DROP COLUMN \`access\``,
    );
  }
}
