import { Router, Request, Response } from "express";
import { IncomingForm, File as FormidableFile } from "formidable";
import path from "path";
import fs from "fs";
import { createLogger } from "@/utils/logger";
import { S3Service } from "@/services/data";

import { ok } from "@/utils/assert";
import { getRepository } from "@/config/database";
import { ChatDocument, Document, Chat } from "@/entities";
import { DocumentStatus } from "@/types/api";
import { TokenPayload } from "@/utils/jwt";
import { getFileContentType } from "@/utils/file";

const logger = createLogger(__filename);

export const router = Router();

// Serve static assets
router.get("/assets/:fileName", async (req: Request<{ fileName: string }>, res: Response) => {
  try {
    const { fileName } = req.params;
    const assetsPath = path.join(__dirname, "../assets", fileName);

    // Check if file exists
    if (!fs.existsSync(assetsPath)) {
      res.status(404).send("Asset not found");
      return;
    }

    // Set cache control headers
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // 1 year
    res.setHeader("Content-Type", getFileContentType(fileName));

    // Stream the file
    const fileStream = fs.createReadStream(assetsPath);
    fileStream.pipe(res);
  } catch (error) {
    logger.error(error, `Error serving asset: ${req.params.fileName}`);
    res.status(500).send("Error serving asset");
  }
});

router.post("/upload", async (req: Request<any, any, any, { chatId?: string }>, res: Response) => {
  const { chatId } = req.query;
  if (!req.tokenPayload) {
    return void res.status(401).json({ error: "Authentication failed" });
  }

  const user = req.tokenPayload as TokenPayload;
  const documents: Document[] = [];

  const s3Service = new S3Service(req.tokenPayload);
  const documentRepo = getRepository(Document);
  const chatDocumentRepo = getRepository(ChatDocument);
  const chatRepo = getRepository(Chat);
  const s3Client = await s3Service.getClient();

  if (!s3Client) {
    res.status(501).send("S3 client not configured");
    return;
  }

  const uploadDocument = async (file: FormidableFile, user: TokenPayload, chatId?: string): Promise<Document> => {
    const { hash, filepath, size: fileSize, originalFilename, newFilename, mimetype } = file;
    ok(hash, "File hash is required");

    const subService = req.subscriptionsService;
    ok(subService, "SubscriptionsService is required in request");
    const documentSqsService = req.documentSqsService;
    ok(documentSqsService, "SQSService is required in request");

    const existing = await documentRepo.findOne({
      where: {
        sha256checksum: hash,
        fileSize,
        ownerId: user.userId,
      },
    });

    if (existing) {
      if (chatId) {
        const chat = await chatRepo.findOne({ where: { id: chatId, user: { id: user.userId } } });
        if (!chat) {
          throw new Error(`Chat not found, id: ${chatId}`);
        }

        const record = { chatId, documentId: existing.id };
        const chatDoc = await chatDocumentRepo.findOne({
          where: record,
        });
        if (!chatDoc) {
          await chatDocumentRepo.save(chatDocumentRepo.create(record));
        }

        chat.isPristine = false;
        await chatRepo.save(chat);
      }

      // Send parse command if document is still in UPLOAD state
      if (
        [DocumentStatus.STORAGE_UPLOAD, DocumentStatus.PARSING, DocumentStatus.ERROR].includes(existing.status) &&
        existing.s3key
      ) {
        await documentSqsService.sendJsonMessage({
          command: "parse_document",
          documentId: existing.id,
          s3key: existing.s3key,
        });
      }

      return existing;
    }

    const mime = mimetype ? mimetype : undefined;

    let document = documentRepo.create({
      fileName: originalFilename || newFilename || hash,
      fileSize,
      mime,
      sha256checksum: hash,
      owner: { id: user.userId },
      s3key: "", // will be updated after upload
      status: DocumentStatus.UPLOAD,
      statusProgress: 1,
    });

    document = await documentRepo.save(document);
    subService.publishDocumentStatus(document);

    const s3key = `document/${user.userId}/${document.id}`;
    await s3Service.upload(filepath, s3key, mime);

    document.s3key = s3key;
    document.status = DocumentStatus.STORAGE_UPLOAD;
    document.statusProgress = 1; // Set progress to 100% after upload
    document = await documentRepo.save(document);

    if (chatId) {
      const chat = await chatRepo.findOne({ where: { id: chatId, user: { id: user.userId } } });
      if (!chat) {
        throw new Error(`Chat not found, id: ${chatId}`);
      }

      await chatDocumentRepo.save(
        chatDocumentRepo.create({
          chatId,
          documentId: document.id,
        })
      );

      chat.isPristine = false;
      await chatRepo.save(chat);
    }

    subService.publishDocumentStatus(document);

    // Send parse_document command for new document
    await documentSqsService.sendJsonMessage({
      command: "parse_document",
      documentId: document.id,
      s3key: document.s3key,
    });

    return document;
  };

  // parse multipart upload files
  const form = new IncomingForm({ hashAlgorithm: "sha256" });
  form.parse(req, async (err, fields, files) => {
    if (err) {
      logger.warn(err, "Error parsing multipart form");
      return void res.status(400).send("Error parsing form");
    }

    if (!files) {
      return void res.status(400).send("Empty files list");
    }

    for (const key in files) {
      const block = files[key];
      if (!block) continue;

      for (const file of block) {
        const document = await uploadDocument(file, user, chatId);
        documents.push(document);
      }
    }

    res.status(201).json(documents);
  });
});

// Get file from S3 (with local disk cache when configured)
router.get("/*fileKey", async (req: Request<any, any, any, { name?: string }>, res: Response) => {
  try {
    let fileKey = Array.isArray(req.params.fileKey) ? req.params.fileKey.join("/") : req.params.fileKey;
    const fileName = req.query.name;

    if (fileKey.endsWith("/")) {
      fileKey = fileKey.substring(0, fileKey.length - 1);
    }

    const s3Service = new S3Service(req.tokenPayload);

    logger.debug({ fileKey, ...req.tokenPayload }, "Fetching file from S3");

    const buffer = await s3Service.getFileContent(fileKey);

    const contentType = getFileContentType(fileName || fileKey);
    res.setHeader("Content-Type", contentType);
    if (fileName) {
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    }
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // 1 year

    res.send(buffer);
  } catch (error) {
    logger.error(error, `Error fetching ${req.params.fileKey} from S3`);

    if ((error as any).name === "NoSuchKey") {
      res.status(404).send("File not found");
      return;
    }

    res.status(500).send("Error fetching file");
  }
});
