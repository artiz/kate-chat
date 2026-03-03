import { MigrationInterface, QueryRunner } from "typeorm";

export class Search1772800000000 implements MigrationInterface {
  name = "Search1772800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- chats FTS5 ---
    await queryRunner.query(
      `CREATE VIRTUAL TABLE IF NOT EXISTS "chats_fts" USING fts5(chat_id UNINDEXED, title, tokenize="unicode61")`,
    );
    await queryRunner.query(
      `INSERT OR IGNORE INTO "chats_fts"(chat_id, title) SELECT id, title FROM "chats"`,
    );
    await queryRunner.query(`
      CREATE TRIGGER IF NOT EXISTS "chats_fts_insert" AFTER INSERT ON "chats" BEGIN
        INSERT INTO "chats_fts"(chat_id, title) VALUES (NEW.id, NEW.title);
      END
    `);
    await queryRunner.query(`
      CREATE TRIGGER IF NOT EXISTS "chats_fts_update" AFTER UPDATE OF title ON "chats" BEGIN
        DELETE FROM "chats_fts" WHERE chat_id = OLD.id;
        INSERT INTO "chats_fts"(chat_id, title) VALUES (NEW.id, NEW.title);
      END
    `);
    await queryRunner.query(`
      CREATE TRIGGER IF NOT EXISTS "chats_fts_delete" AFTER DELETE ON "chats" BEGIN
        DELETE FROM "chats_fts" WHERE chat_id = OLD.id;
      END
    `);

    // --- messages FTS5 ---
    await queryRunner.query(
      `CREATE VIRTUAL TABLE IF NOT EXISTS "messages_fts" USING fts5(message_id UNINDEXED, content, tokenize="unicode61")`,
    );
    await queryRunner.query(
      `INSERT OR IGNORE INTO "messages_fts"(message_id, content) SELECT id, content FROM "messages"`,
    );
    await queryRunner.query(`
      CREATE TRIGGER IF NOT EXISTS "messages_fts_insert" AFTER INSERT ON "messages" BEGIN
        INSERT INTO "messages_fts"(message_id, content) VALUES (NEW.id, NEW.content);
      END
    `);
    await queryRunner.query(`
      CREATE TRIGGER IF NOT EXISTS "messages_fts_update" AFTER UPDATE OF content ON "messages" BEGIN
        DELETE FROM "messages_fts" WHERE message_id = OLD.id;
        INSERT INTO "messages_fts"(message_id, content) VALUES (NEW.id, NEW.content);
      END
    `);
    await queryRunner.query(`
      CREATE TRIGGER IF NOT EXISTS "messages_fts_delete" AFTER DELETE ON "messages" BEGIN
        DELETE FROM "messages_fts" WHERE message_id = OLD.id;
      END
    `);

    // --- documents FTS5 ---
    await queryRunner.query(
      `CREATE VIRTUAL TABLE IF NOT EXISTS "documents_fts" USING fts5(document_id UNINDEXED, file_name, summary, tokenize="unicode61")`,
    );
    await queryRunner.query(
      `INSERT OR IGNORE INTO "documents_fts"(document_id, file_name, summary) SELECT id, "fileName", COALESCE(summary, '') FROM "documents"`,
    );
    await queryRunner.query(`
      CREATE TRIGGER IF NOT EXISTS "documents_fts_insert" AFTER INSERT ON "documents" BEGIN
        INSERT INTO "documents_fts"(document_id, file_name, summary) VALUES (NEW.id, NEW."fileName", COALESCE(NEW.summary, ''));
      END
    `);
    await queryRunner.query(`
      CREATE TRIGGER IF NOT EXISTS "documents_fts_update" AFTER UPDATE OF "fileName", summary ON "documents" BEGIN
        DELETE FROM "documents_fts" WHERE document_id = OLD.id;
        INSERT INTO "documents_fts"(document_id, file_name, summary) VALUES (NEW.id, NEW."fileName", COALESCE(NEW.summary, ''));
      END
    `);
    await queryRunner.query(`
      CREATE TRIGGER IF NOT EXISTS "documents_fts_delete" AFTER DELETE ON "documents" BEGIN
        DELETE FROM "documents_fts" WHERE document_id = OLD.id;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "documents_fts_delete"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "documents_fts_update"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "documents_fts_insert"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "documents_fts"`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS "messages_fts_delete"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "messages_fts_update"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "messages_fts_insert"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messages_fts"`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS "chats_fts_delete"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "chats_fts_update"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "chats_fts_insert"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chats_fts"`);
  }
}
