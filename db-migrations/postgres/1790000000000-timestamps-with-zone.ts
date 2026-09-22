import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * created/updated columns move from TIMESTAMP to TIMESTAMPTZ.
 *
 * A naive TIMESTAMP holds wall-clock time with no zone attached: `now()` writes the database's,
 * the driver writes and reads the API process's, and when the two differ every stored date comes
 * back shifted. TIMESTAMPTZ stores the instant, so neither side's zone can change what it means.
 *
 * The existing rows are read as UTC, which is what wrote them: `now()` on a database in UTC, as
 * compose and the task definition run it. A database kept in another zone would need its own
 * offset in place of 'UTC' here.
 */
const TIMESTAMP_COLUMNS: Array<[table: string, columns: string[]]> = [
  ["models", ["createdAt", "updatedAt"]],
  ["users", ["createdAt", "updatedAt"]],
  ["messages", ["createdAt", "updatedAt"]],
  ["chats", ["createdAt", "updatedAt"]],
  ["documents", ["createdAt", "updatedAt"]],
  ["mcp_servers", ["createdAt", "updatedAt"]],
  ["chat_files", ["createdAt", "updatedAt"]],
  ["chat_folders", ["createdAt", "updatedAt"]],
];

export class TimestampsWithZone1790000000000 implements MigrationInterface {
  name = "TimestampsWithZone1790000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, columns] of TIMESTAMP_COLUMNS) {
      for (const column of columns) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE TIMESTAMPTZ USING "${column}" AT TIME ZONE 'UTC'`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, columns] of TIMESTAMP_COLUMNS) {
      for (const column of columns) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE TIMESTAMP USING "${column}" AT TIME ZONE 'UTC'`,
        );
      }
    }
  }
}
