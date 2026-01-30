import { QueryRunner } from "typeorm";
import { randomUUID } from "crypto";

export async function migrateChatFiles(queryRunner: QueryRunner) {
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
