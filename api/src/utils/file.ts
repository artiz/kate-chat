import path from "path";

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
