import { getAuthToken } from "@/store/slices/authSlice";
import { APP_API_URL } from "@/lib/config";
import { ChatImage } from "./sandbox";

const CHAT_IMAGE_PATH = /\/files\/([\w-]+\/[\w-]+\/[\w.-]+\.(?:png|jpe?g|gif|webp))/gi;
const MAX_CHAT_IMAGES = 20;
const MAX_CHAT_IMAGES_BYTES = 30 * 1024 * 1024;

/**
 * The images of this chat a program refers to. The prompt lists them as "/files/<chatId>/..."; only
 * paths in this chat count, and the server checks access again when they are fetched.
 */
export function findChatImagePaths(code: string, chatId: string): string[] {
  const paths = new Set<string>();
  for (const [path, key] of code.matchAll(CHAT_IMAGE_PATH)) {
    if (key.startsWith(`${chatId}/`)) paths.add(path);
    if (paths.size >= MAX_CHAT_IMAGES) break;
  }
  return [...paths];
}

/**
 * Downloads the chat images a program uses, to hand them to the sandbox, which cannot reach this
 * app. An image that fails to download is left out: the program's images.load then says which one.
 */
export async function loadChatImages(code: string, chatId: string): Promise<ChatImage[]> {
  const token = getAuthToken();
  const images: ChatImage[] = [];
  let total = 0;
  for (const path of findChatImagePaths(code, chatId)) {
    try {
      const response = await fetch(`${APP_API_URL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if ((total += bytes.length) > MAX_CHAT_IMAGES_BYTES) break;
      images.push({ path, mime: response.headers.get("content-type") || "image/png", bytes });
    } catch {
      // left out, see above
    }
  }
  return images;
}
