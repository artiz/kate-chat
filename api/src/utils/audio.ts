import { S3Service } from "@/services/data";

/**
 * Wrap raw PCM16 (mono, little-endian) chunks into a WAV data URL.
 * Streaming audio-output chat models emit base64 pcm16 deltas (24kHz).
 */
export function pcm16ToWavDataUrl(base64Chunks: string[], sampleRate = 24000): string {
  const pcm = Buffer.concat(base64Chunks.map(chunk => Buffer.from(chunk, "base64")));
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return `data:audio/wav;base64,${Buffer.concat([header, pcm]).toString("base64")}`;
}

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
