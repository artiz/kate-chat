import { MigrationInterface, QueryRunner } from "typeorm";

export class Search1772800000000 implements MigrationInterface {
  name = "Search1772800000000";
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE FULLTEXT CATALOG katechat_fts AS DEFAULT`);

    const chatsPk = await queryRunner.query(
      `SELECT i.name as pkName FROM sys.indexes i JOIN sys.objects o ON i.object_id = o.object_id WHERE o.name = 'chats' AND i.is_primary_key = 1`,
    );
    await queryRunner.query(
      `CREATE FULLTEXT INDEX ON chats(title) KEY INDEX [${chatsPk[0].pkName}] ON katechat_fts`,
    );

    const messagesPk = await queryRunner.query(
      `SELECT i.name as pkName FROM sys.indexes i JOIN sys.objects o ON i.object_id = o.object_id WHERE o.name = 'messages' AND i.is_primary_key = 1`,
    );
    await queryRunner.query(
      `CREATE FULLTEXT INDEX ON messages(content) KEY INDEX [${messagesPk[0].pkName}] ON katechat_fts`,
    );

    const documentsPk = await queryRunner.query(
      `SELECT i.name as pkName FROM sys.indexes i JOIN sys.objects o ON i.object_id = o.object_id WHERE o.name = 'documents' AND i.is_primary_key = 1`,
    );
    await queryRunner.query(
      `CREATE FULLTEXT INDEX ON documents(fileName, summary) KEY INDEX [${documentsPk[0].pkName}] ON katechat_fts`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Use connection.query() to bypass the active transaction that undoLastMigration
    // wraps around down() regardless of transaction = false (TypeORM bug).
    // DROP FULLTEXT statements cannot run inside a user transaction on MSSQL.
    const query = (sql: string) => queryRunner.connection.query(sql);
    await query(`DROP FULLTEXT INDEX ON documents`);
    await query(`DROP FULLTEXT INDEX ON messages`);
    await query(`DROP FULLTEXT INDEX ON chats`);
    await query(`DROP FULLTEXT CATALOG katechat_fts`);
  }
}
