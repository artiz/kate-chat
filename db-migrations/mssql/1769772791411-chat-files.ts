import { MigrationInterface, QueryRunner } from "typeorm";
import { randomUUID } from "crypto";

export class ChatFiles1769772791411 implements MigrationInterface {
  name = "ChatFiles1769772791411";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chat_files" ("id" uniqueidentifier NOT NULL CONSTRAINT "DF_ccac170cfa6fc37488e93e5787a" DEFAULT NEWSEQUENTIALID(), "chatId" uniqueidentifier NOT NULL, "messageId" uniqueidentifier, "type" nvarchar(255) CONSTRAINT CHK_4d72304e88244f835bb27804b5_ENUM CHECK(type IN ('image','video','rag_document','inline_document')) NOT NULL CONSTRAINT "DF_0e39298db243403610f1087c90c" DEFAULT 'image', "fileName" nvarchar(255), "mime" nvarchar(255), "uploadFile" nvarchar(255), "predominantColor" nvarchar(255), "exif" ntext, "createdAt" datetime2 NOT NULL CONSTRAINT "DF_d735c1949ab9cf28c3dabe74403" DEFAULT getdate(), "updatedAt" datetime2 NOT NULL CONSTRAINT "DF_5efbc7576e32bea2b2ca8cc5aaa" DEFAULT getdate(), CONSTRAINT "PK_ccac170cfa6fc37488e93e5787a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ADD CONSTRAINT "FK_01fa2aca8a161c864dd05d9d387" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" ADD CONSTRAINT "FK_ea9c9ae1f173ad90c9a4d15d2a7" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    // Migrate data
    await migrateChatFiles(queryRunner);
    // Drop initial column
    await queryRunner.query(`ALTER TABLE "chats" DROP COLUMN "files"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_files" DROP CONSTRAINT "FK_ea9c9ae1f173ad90c9a4d15d2a7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_files" DROP CONSTRAINT "FK_01fa2aca8a161c864dd05d9d387"`,
    );
    await queryRunner.query(`ALTER TABLE "chats" ADD "files" ntext`);
    await queryRunner.query(`DROP TABLE "chat_files"`);
  }
}

// Migrate chat files from messages.jsonContent to chat_files table
async function migrateChatFiles(queryRunner: QueryRunner) {
  let messages: any[] = [];
  try {
    messages = await queryRunner.query(
      `SELECT id, "chatId", "jsonContent", "createdAt" FROM messages WHERE "jsonContent" IS NOT NULL`,
    );
  } catch (e) {
    // try lowercase just in case
    try {
      messages = await queryRunner.query(
        `SELECT id, chat_id as "chatId", json_content as "jsonContent", created_at as "createdAt" FROM messages WHERE json_content IS NOT NULL`,
      );
    } catch (e2) {
      console.error("Could not query messages table", e);
      return;
    }
  }

  for (const message of messages) {
    let contentItems: any[] = [];
    try {
      if (typeof message.jsonContent === "string") {
        contentItems = JSON.parse(message.jsonContent);
      } else if (Array.isArray(message.jsonContent)) {
        contentItems = message.jsonContent;
      }
    } catch (e) {
      console.warn(
        `Failed to parse jsonContent for message ${message.id}: ${e}`,
      );
      continue;
    }

    if (
      !contentItems ||
      !Array.isArray(contentItems) ||
      contentItems.length === 0
    )
      continue;

    for (const item of contentItems) {
      if (item.contentType === "image" && item.fileName) {
        if (!message.chatId || !message.id) {
          continue;
        }

        const id = randomUUID();
        // We assume date is already good or Date object
        const createdAt = new Date(message.createdAt).toISOString();

        const safeFileName = item.fileName.replace(/'/g, "''");

        await queryRunner.query(
          `INSERT INTO chat_files (id, "chatId", "messageId", type, "fileName", "createdAt", "updatedAt") VALUES ('${id}', '${message.chatId}', '${message.id}', 'image', '${safeFileName}', '${createdAt}', '${createdAt}')`,
        );
      }
    }
  }
}
