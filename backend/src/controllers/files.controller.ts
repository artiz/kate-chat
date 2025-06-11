import { Router, Request, Response } from "express";
import { Readable } from "stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createLogger } from "@/utils/logger";
import { authMiddleware } from "@/middleware/auth.middleware";
import { S3Service } from "@/services/s3.service";
import { ok } from "assert";

const logger = createLogger(__filename);
const router = Router();

// Get file from S3
router.get("/:fileKey", authMiddleware, async (req: Request, res: Response) => {
  try {
    ok(req.connectionParams);

    const fileKey = req.params.fileKey;

    // Create S3 service with connection params from request
    const s3Service = new S3Service(req.connectionParams);

    logger.debug({ fileKey }, "Fetching file from S3");

    // Use the internal S3 client of S3Service class
    // This is a bit of a hack but avoids duplicating S3 client code
    const s3Client = s3Service.client;
    const bucketName = s3Service.bucket;

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
    });

    const s3Object = await s3Client.send(command);

    // Set appropriate headers
    if (s3Object.ContentType) {
      res.setHeader("Content-Type", s3Object.ContentType);
    }

    // Set cache control headers
    res.setHeader("Cache-Control", "max-age=31536000"); // 1 year

    // Stream the file to the response
    if (s3Object.Body instanceof Readable) {
      s3Object.Body.pipe(res);
    } else {
      const buffer = await s3Object?.Body?.transformToByteArray();
      res.send(buffer);
    }
  } catch (error) {
    logger.error(error, `Error fetching ${req.params.fileKey} from S3`);
    logger.debug(req.connectionParams, "connection");

    if ((error as any).name === "NoSuchKey") {
      res.status(404).send("File not found");
      return;
    }

    res.status(500).send("Error fetching file");
  }
});

export default router;
