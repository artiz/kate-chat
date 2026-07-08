import { MigrationInterface, QueryRunner } from "typeorm";

const NEW_CHECK = `'image','video','audio','rag_document','inline_document'`;
const OLD_CHECK = `'image','video','rag_document','inline_document'`;

const rebuildChatFiles = async (
  queryRunner: QueryRunner,
  typeCheck: string,
): Promise<void> => {
  await queryRunner.query(
    `CREATE TABLE "temporary_chat_files" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar NOT NULL, "messageId" varchar, "type" varchar CHECK( "type" IN (${typeCheck}) ) NOT NULL DEFAULT ('image'), "fileName" varchar, "mime" varchar, "uploadFile" varchar, "predominantColor" varchar, "exif" json, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_01fa2aca8a161c864dd05d9d387" FOREIGN KEY ("chatId") REFERENCES "chats" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_ea9c9ae1f173ad90c9a4d15d2a7" FOREIGN KEY ("messageId") REFERENCES "messages" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
  );
  await queryRunner.query(
    `INSERT INTO "temporary_chat_files"("id", "chatId", "messageId", "type", "fileName", "mime", "uploadFile", "predominantColor", "exif", "createdAt", "updatedAt") SELECT "id", "chatId", "messageId", "type", "fileName", "mime", "uploadFile", "predominantColor", "exif", "createdAt", "updatedAt" FROM "chat_files"`,
  );
  await queryRunner.query(`DROP TABLE "chat_files"`);
  await queryRunner.query(
    `ALTER TABLE "temporary_chat_files" RENAME TO "chat_files"`,
  );
};

export class ChatFilesAudio1783600000000 implements MigrationInterface {
  name = "ChatFilesAudio1783600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await rebuildChatFiles(queryRunner, NEW_CHECK);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "chat_files" SET "type" = 'image' WHERE "type" = 'audio'`,
    );
    await rebuildChatFiles(queryRunner, OLD_CHECK);
  }
}
