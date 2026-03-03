import { MigrationInterface, QueryRunner } from "typeorm";

export class Search1772800000000 implements MigrationInterface {
  name = "Search1772800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "chats_title_fts" ON "chats" USING GIN (to_tsvector('simple', "title"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "messages_content_fts" ON "messages" USING GIN (to_tsvector('simple', "content"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "documents_search_fts" ON "documents" USING GIN (to_tsvector('simple', "fileName" || ' ' || COALESCE("summary", '')))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."documents_search_fts"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."messages_content_fts"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."chats_title_fts"`);
  }
}
