import path from "path";
import { Repository } from "typeorm";
import { getRepository } from "@/config/database";
import { ChatFile, Message } from "@/entities";
import { ChatFileType } from "@/entities/ChatFile";
import { MessageRole } from "@/types/api";
import { GeneratedFile } from "@/types/ai.types";
import { S3Service } from "@/services/data/s3.service";
import { getFileContentType } from "@/utils/file";
import { TokenPayload } from "@/utils/jwt";
import { createLogger } from "@/utils/logger";

const logger = createLogger(__filename);

/**
 * Files arrive from the user's browser, where a skill's program wrote them, and are served back
 * from /files on the API's origin with a type taken from the name. Only document, data and image
 * formats are taken: an .html or .svg would run script on that origin when opened.
 */
export const GENERATED_FILE_EXTENSIONS = [
  "pptx",
  "xlsx",
  "docx",
  "pdf",
  "csv",
  "txt",
  "md",
  "json",
  "png",
  "jpg",
  "jpeg",
  "zip",
];
export const MAX_GENERATED_FILE_SIZE = 25 * 1024 * 1024;

export class GeneratedFileError extends Error {}

/** A plain file name with an allowed extension, safe to use in an S3 key and a download header. */
export function normalizeGeneratedFileName(name: string): string {
  const base = path.basename(String(name || "").replace(/\\/g, "/")).trim();
  const cleaned = base
    .replace(/[^\p{L}\p{N}._ ()-]/gu, "_")
    .replace(/\s+/g, " ")
    .slice(-120);
  const ext = path.extname(cleaned).slice(1).toLowerCase();
  if (!cleaned || cleaned.startsWith(".") || !GENERATED_FILE_EXTENSIONS.includes(ext)) {
    throw new GeneratedFileError(
      `"${name}" is not an allowed file name; use one of: ${GENERATED_FILE_EXTENSIONS.map(e => `.${e}`).join(", ")}`
    );
  }
  return cleaned;
}

export function decodeGeneratedFile(bytesBase64: string): Buffer {
  const data = String(bytesBase64 || "").replace(/^data:[^;,]*;base64,/, "");
  // base64 is 4 characters per 3 bytes: refuse before decoding anything larger than the limit
  if (data.length > Math.ceil(MAX_GENERATED_FILE_SIZE / 3) * 4 + 4) {
    throw new GeneratedFileError(`The file is larger than ${MAX_GENERATED_FILE_SIZE / 1024 / 1024} MB`);
  }
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length) throw new GeneratedFileError("The file is empty");
  return buffer;
}

export class GeneratedFilesService {
  private messageRepository: Repository<Message>;
  private chatFileRepository: Repository<ChatFile>;

  constructor() {
    this.messageRepository = getRepository(Message);
    this.chatFileRepository = getRepository(ChatFile);
  }

  /**
   * Stores a file for an answer of the caller's own chat. Running the same block again replaces the
   * file of that name, so a corrected program does not leave the broken result behind.
   */
  async save(token: TokenPayload, messageId: string, name: string, bytesBase64: string): Promise<Message> {
    const fileName = normalizeGeneratedFileName(name);
    const buffer = decodeGeneratedFile(bytesBase64);

    const message = await this.messageRepository.findOne({ where: { id: messageId }, relations: { chat: true } });
    if (!message || message.chat?.userId !== token.userId) throw new GeneratedFileError("Message not found");
    if (message.role !== MessageRole.ASSISTANT) {
      throw new GeneratedFileError("Files can only be attached to an assistant answer");
    }

    const s3Service = new S3Service(token);
    const mime = getFileContentType(fileName);
    const key = `${message.chatId}/${message.id}/generated/${Date.now()}-${fileName.replace(/ /g, "_")}`;
    await s3Service.uploadFile(buffer, key, mime);

    const previous = await this.chatFileRepository.findOne({
      where: { messageId: message.id, type: ChatFileType.GENERATED, uploadFile: fileName },
    });
    if (previous?.fileName) {
      await s3Service
        .deleteFile(previous.fileName)
        .catch(error => logger.warn(error, "Old generated file not deleted"));
    }
    await this.chatFileRepository.save({
      ...(previous ? { id: previous.id } : {}),
      chatId: message.chatId,
      messageId: message.id,
      type: ChatFileType.GENERATED,
      uploadFile: fileName,
      mime,
      fileName: key,
    });

    const entry: GeneratedFile = { name: fileName, fileName: key, mime, size: buffer.length };
    const others = (message.metadata?.generatedFiles || []).filter(file => file.name !== fileName);
    message.metadata = { ...message.metadata, generatedFiles: [...others, entry] };
    return this.messageRepository.save(message);
  }
}
