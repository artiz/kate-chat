import { S3Service } from "@/services/data";

const AUDIO_MIME_EXTENSIONS: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
};

/** Save base64 audio (optionally a data: URL) to file storage, mirrors saveImageFromBase64 */
export async function saveAudioFromBase64(
  s3Service: S3Service,
  content: string,
  { chatId, messageId, id }: { chatId: string; messageId: string; id: string }
): Promise<{ fileName: string; contentType: string; buffer: Buffer }> {
  const matches = content.match(/^data:(audio\/[\w.+-]+);base64,/);
  const contentType = matches ? matches[1] : "audio/mpeg";
  const ext = AUDIO_MIME_EXTENSIONS[contentType] || "mp3";
  const fileName = `${chatId}/${messageId}/${id}.${ext}`;

  const base64Data = content.replace(/^data:audio\/[\w.+-]+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  await s3Service.uploadFile(buffer, fileName, contentType);

  return { fileName, contentType, buffer };
}
