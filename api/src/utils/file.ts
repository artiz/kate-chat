import path from "path";
import type { S3Service } from "@/services/data/s3.service";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  // code files
  ".json": "application/json",
  ".xml": "application/xml",
  ".js": "application/javascript",
  ".ts": "application/typescript",
  ".html": "text/html",
  ".css": "text/css",
  ".py": "text/x-python",
  ".java": "text/x-java-source",
  ".c": "text/x-c",
  ".cpp": "text/x-c++",
  ".cs": "text/x-csharp",
  ".go": "text/x-go",
  ".rb": "text/x-ruby",
  ".php": "application/x-php",
  // text files
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".log": "text/plain",
};

export function getFileContentType(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

/** MIME → extension for inline chat-context files stored on S3. */
export const FILE_MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/html": "html",
  "application/json": "json",
  "application/xml": "xml",
  "text/xml": "xml",
  "application/x-yaml": "yaml",
  "text/yaml": "yaml",
};

/**
 * Textual files are inlined into the prompt as plain text parts, so they work
 * with any model; binary documents (PDF) need native file support
 * (OpenAI input_file/file blocks, Bedrock Converse document blocks).
 */
export function isTextualMime(mime?: string): boolean {
  if (!mime) return false;
  const m = mime.split(";")[0].trim().toLowerCase();
  return m.startsWith("text/") || ["application/json", "application/xml", "application/x-yaml"].includes(m);
}

/**
 * Bedrock Converse document block format; textual types Converse has no
 * dedicated format for are sent as `txt`.
 */
export function converseDocumentFormat(mime?: string): "pdf" | "csv" | "html" | "txt" | "md" {
  const m = (mime || "").split(";")[0].trim().toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (m === "text/csv" || m === "application/csv") return "csv";
  if (m === "text/html") return "html";
  if (m === "text/markdown" || m === "text/x-markdown") return "md";
  return "txt";
}

/**
 * Save an inline chat-context file (a base64 data URL) to S3.
 * Mirrors saveAudioFromBase64/saveImageFromBase64.
 */
export async function saveFileFromBase64(
  s3Service: S3Service,
  content: string,
  { chatId, messageId, id }: { chatId: string; messageId: string; id: string }
): Promise<{ fileName: string; contentType: string; buffer: Buffer }> {
  const matches = content.match(/^data:([\w.+-]+\/[\w.+-]+);base64,/);
  const contentType = matches ? matches[1] : "application/octet-stream";
  const ext = FILE_MIME_EXTENSIONS[contentType] || "bin";
  const fileName = `${chatId}/${messageId}/${id}.${ext}`;

  const base64Data = content.replace(/^data:[\w.+-]+\/[\w.+-]+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  await s3Service.uploadFile(buffer, fileName, contentType);

  return { fileName, contentType, buffer };
}

/**
 * Bedrock Converse document names allow only alphanumerics, whitespace,
 * hyphens, parentheses and brackets; other providers are lax but a clean
 * name never hurts. The extension is dropped — the format is passed apart.
 */
export function sanitizeDocumentName(name?: string, fallback = "document"): string {
  const cleaned = (name || "")
    .replace(/\.\w+$/, "")
    .replace(/[^\w\s\-()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}
