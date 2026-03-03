import { AppDataSource } from "@/config/database";
import { DB_TYPE } from "@/config/env";
import { SearchChatResult, SearchDocumentResult, SearchMessageResult, SearchResults } from "@/types/graphql/responses";

export class SearchService {
  async search(query: string, userId: string, limit = 10): Promise<SearchResults> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return { chatResults: [], messageResults: [], documentResults: [] };
    }

    const [chatResults, messageResults, documentResults] = await Promise.all([
      this.searchChats(trimmed, userId, limit),
      this.searchMessages(trimmed, userId, limit),
      this.searchDocuments(trimmed, userId, limit),
    ]);

    return { chatResults, messageResults, documentResults };
  }

  private snippet(text: string, maxLen = 200): string {
    if (!text) return "";
    return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
  }

  private async searchChats(query: string, userId: string, limit: number): Promise<SearchChatResult[]> {
    let rows: Array<{ chatId: string; title: string }>;

    switch (DB_TYPE) {
      case "postgres":
        rows = await AppDataSource.query(
          `SELECT id AS "chatId", title FROM chats WHERE "userId" = $1 AND to_tsvector('simple', title) @@ websearch_to_tsquery('simple', $2) ORDER BY "updatedAt" DESC LIMIT $3`,
          [userId, query, limit]
        );
        break;
      case "mysql":
        rows = await AppDataSource.query(
          `SELECT id AS chatId, title FROM chats WHERE userId = ? AND MATCH(title) AGAINST(? IN BOOLEAN MODE) LIMIT ?`,
          [userId, `${query}*`, limit]
        );
        break;
      case "mssql":
        rows = await AppDataSource.query(
          `SELECT TOP (${limit}) id AS chatId, title FROM chats WHERE userId = @0 AND CONTAINS(title, @1)`,
          [userId, `"${query.replace(/"/g, "")}"`]
        );
        break;
      default: // sqlite
        rows = await AppDataSource.query(
          `SELECT c.id AS chatId, c.title FROM chats c WHERE c.userId = ? AND c.id IN (SELECT chat_id FROM chats_fts WHERE chats_fts MATCH ? LIMIT ?)`,
          [userId, `"${query.replace(/"/g, "")}"*`, limit]
        );
    }

    return rows.map(r => ({ chatId: r.chatId, title: r.title }));
  }

  private async searchMessages(query: string, userId: string, limit: number): Promise<SearchMessageResult[]> {
    let rows: Array<{ messageId: string; chatId: string; chatTitle: string; content: string }>;

    switch (DB_TYPE) {
      case "postgres":
        rows = await AppDataSource.query(
          `SELECT m.id AS "messageId", m."chatId", c.title AS "chatTitle", m.content
           FROM messages m
           INNER JOIN chats c ON c.id = m."chatId"
           WHERE c."userId" = $1 AND to_tsvector('simple', m.content) @@ websearch_to_tsquery('simple', $2)
           ORDER BY m."createdAt" DESC LIMIT $3`,
          [userId, query, limit]
        );
        break;
      case "mysql":
        rows = await AppDataSource.query(
          `SELECT m.id AS messageId, m.chatId, c.title AS chatTitle, m.content
           FROM messages m
           INNER JOIN chats c ON c.id = m.chatId
           WHERE c.userId = ? AND MATCH(m.content) AGAINST(? IN BOOLEAN MODE)
           LIMIT ?`,
          [userId, `${query}*`, limit]
        );
        break;
      case "mssql":
        rows = await AppDataSource.query(
          `SELECT TOP (${limit}) m.id AS messageId, m.chatId, c.title AS chatTitle, m.content
           FROM messages m
           INNER JOIN chats c ON c.id = m.chatId
           WHERE c.userId = @0 AND CONTAINS(m.content, @1)`,
          [userId, `"${query.replace(/"/g, "")}"`]
        );
        break;
      default: // sqlite
        rows = await AppDataSource.query(
          `SELECT m.id AS messageId, m.chatId, c.title AS chatTitle, m.content
           FROM messages m
           INNER JOIN chats c ON c.id = m.chatId
           WHERE c.userId = ? AND m.id IN (SELECT message_id FROM messages_fts WHERE messages_fts MATCH ? LIMIT ?)`,
          [userId, `"${query.replace(/"/g, "")}"*`, limit]
        );
    }

    return rows.map(r => ({
      messageId: r.messageId,
      chatId: r.chatId,
      chatTitle: r.chatTitle,
      snippet: this.snippet(r.content),
    }));
  }

  private async searchDocuments(query: string, userId: string, limit: number): Promise<SearchDocumentResult[]> {
    let rows: Array<{ documentId: string; fileName: string; summary: string | null }>;

    switch (DB_TYPE) {
      case "postgres":
        rows = await AppDataSource.query(
          `SELECT id AS "documentId", "fileName", summary FROM documents
           WHERE "ownerId" = $1 AND to_tsvector('simple', "fileName" || ' ' || COALESCE(summary, '')) @@ websearch_to_tsquery('simple', $2)
           ORDER BY "createdAt" DESC LIMIT $3`,
          [userId, query, limit]
        );
        break;
      case "mysql":
        rows = await AppDataSource.query(
          `SELECT id AS documentId, fileName, summary FROM documents
           WHERE ownerId = ? AND MATCH(fileName, summary) AGAINST(? IN BOOLEAN MODE)
           LIMIT ?`,
          [userId, `${query}*`, limit]
        );
        break;
      case "mssql":
        rows = await AppDataSource.query(
          `SELECT TOP (${limit}) id AS documentId, fileName, summary FROM documents
           WHERE ownerId = @0 AND CONTAINS((fileName, summary), @1)`,
          [userId, `"${query.replace(/"/g, "")}"`]
        );
        break;
      default: // sqlite
        rows = await AppDataSource.query(
          `SELECT d.id AS documentId, d."fileName", d.summary FROM documents d
           WHERE d.ownerId = ? AND d.id IN (SELECT document_id FROM documents_fts WHERE documents_fts MATCH ? LIMIT ?)`,
          [userId, `"${query.replace(/"/g, "")}"*`, limit]
        );
    }

    return rows.map(r => ({
      documentId: r.documentId,
      fileName: r.fileName,
      snippet: r.summary ? this.snippet(r.summary) : undefined,
    }));
  }
}
