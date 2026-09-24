import { getAuthToken } from "@/store/slices/authSlice";
import { APP_API_URL } from "@/lib/config";
import { ChatFile } from "./sandbox";

// a "/files/..." path inside a string literal; generated files may have spaces in their names
const QUOTED_FILES_PATH = /["'`](\/files\/[^"'`\n]+)["'`]/g;
const READABLE_EXTENSIONS = /\.(png|jpe?g|gif|webp|pdf|docx|xlsx|pptx|csv|txt|md|json)$/i;
const MAX_CHAT_FILES = 20;
const MAX_CHAT_FILES_BYTES = 30 * 1024 * 1024;

/**
 * The files of this chat a program refers to. The prompt lists them as "/files/<chatId>/..."; only
 * paths in this chat count, and the server checks access again when they are fetched.
 */
export function findChatFilePaths(code: string, chatId: string): string[] {
  const paths = new Set<string>();
  for (const [, path] of code.matchAll(QUOTED_FILES_PATH)) {
    if (path.startsWith(`/files/${chatId}/`) && !path.includes("..") && READABLE_EXTENSIONS.test(path)) {
      paths.add(path);
    }
    if (paths.size >= MAX_CHAT_FILES) break;
  }
  return [...paths];
}

/**
 * Downloads the chat files a program uses, to hand them to the sandbox, which cannot reach this
 * app. A file that fails to download is left out: the program then fails to open it, by name.
 */
export async function loadChatFiles(code: string, chatId: string): Promise<ChatFile[]> {
  const token = getAuthToken();
  const files: ChatFile[] = [];
  let total = 0;
  for (const path of findChatFilePaths(code, chatId)) {
    try {
      const response = await fetch(`${APP_API_URL}${encodeURI(path)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if ((total += bytes.length) > MAX_CHAT_FILES_BYTES) break;
      files.push({ path, mime: response.headers.get("content-type") || "application/octet-stream", bytes });
    } catch {
      // left out, see above
    }
  }
  return files;
}
