import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * created/updated columns move from datetime2 to datetimeoffset.
 *
 * datetime2 holds wall-clock time with no zone: `getdate()` writes the server's, while the driver
 * writes and reads the API process's (TypeORM pins tedious to useUTC: false), so the two shift
 * apart whenever their zones differ. datetimeoffset carries the offset with the value, and the
 * default becomes `sysutcdatetimeoffset()` so a row written by the database is UTC and says so.
 *
 * The existing rows convert as UTC, which is what wrote them on a server in UTC. Their default
 * constraints are looked up rather than named: the ones the init migration created are known, but
 * a database restored or patched by hand may carry others.
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

const dropDefault = (table: string, column: string) => `
  DECLARE @constraint sysname;
  SELECT @constraint = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
   WHERE dc.parent_object_id = OBJECT_ID('[${table}]') AND c.name = '${column}';
  IF @constraint IS NOT NULL
    EXEC('ALTER TABLE [${table}] DROP CONSTRAINT [' + @constraint + ']');
`;

export class TimestampsWithZone1790000000000 implements MigrationInterface {
  name = "TimestampsWithZone1790000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, columns] of TIMESTAMP_COLUMNS) {
      for (const column of columns) {
        await queryRunner.query(dropDefault(table, column));
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${column}" datetimeoffset NOT NULL`,
        );
        await queryRunner.query(
          `ALTER TABLE "${table}" ADD CONSTRAINT "DF_${table}_${column}_utc" DEFAULT sysutcdatetimeoffset() FOR "${column}"`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, columns] of TIMESTAMP_COLUMNS) {
      for (const column of columns) {
        await queryRunner.query(dropDefault(table, column));
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${column}" datetime2 NOT NULL`,
        );
        await queryRunner.query(
          `ALTER TABLE "${table}" ADD CONSTRAINT "DF_${table}_${column}" DEFAULT getdate() FOR "${column}"`,
        );
      }
    }
  }
}
