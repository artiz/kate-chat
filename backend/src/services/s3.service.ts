import * as path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, S3ClientConfig } from "@aws-sdk/client-s3";
import { createLogger } from "@/utils/logger";
import { ConnectionParams } from "@/middleware/auth.middleware";

const logger = createLogger(__filename);

export class S3Service {
  private s3client: S3Client;
  private bucketName: string;

  constructor(connection: ConnectionParams) {
    if (!connection.S3_FILES_BUCKET_NAME) {
      throw new Error("S3_FILES_BUCKET_NAME must be provided in connection parameters");
    }

    this.bucketName = connection.S3_FILES_BUCKET_NAME;
    const endpoint = connection.S3_ENDPOINT;
    const region = connection.S3_REGION;
    const accessKeyId = connection.S3_ACCESS_KEY_ID;
    const secretAccessKey = connection.S3_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be provided in connection parameters");
    }

    const clientOptions: S3ClientConfig = {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      requestHandler: {
        socketTimeout: 1 * 60 * 1000, // ms
      },
    };

    if (endpoint) {
      clientOptions.endpoint = endpoint;
      // For LocalStack and other S3-compatible services
      clientOptions.forcePathStyle = true;
    }

    this.s3client = new S3Client(clientOptions);
    logger.info({ bucket: this.bucketName }, "S3 client initialized");
  }

  get client(): S3Client {
    return this.s3client;
  }

  get bucket(): string {
    return this.bucketName;
  }

  /**
   * Upload a file to S3
   * @param content Base64 content of the file
   * @param key Key under which to store the file in S3
   * @param contentType MIME type of the file (optional)
   */
  public async uploadFile(content: string, key: string, contentType?: string): Promise<string> {
    try {
      // Remove data URL prefix if present (e.g., "data:image/png;base64,")
      const base64Data = content.replace(/^data:image\/[a-z]+;base64,/, "");

      const params = {
        Bucket: this.bucketName,
        Key: key,
        Body: Buffer.from(base64Data, "base64"),
        ContentType: contentType || "image/png",
      };

      logger.debug({ key }, "Uploading file to S3");
      await this.s3client.send(new PutObjectCommand(params));
      return key;
    } catch (error) {
      logger.error(error, "Failed to upload file to S3");
      throw error;
    }
  }

  /**
   * Delete a file from S3
   * @param key S3 key of the file to delete
   */
  public async deleteFile(key: string): Promise<void> {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
      };

      logger.debug({ key }, "Deleting file from S3");
      await this.s3client.send(new DeleteObjectCommand(params));
    } catch (error) {
      logger.error(error, "Failed to delete file from S3");
      throw error;
    }
  }

  /**
   * Check if file exists in S3
   * @param key S3 key to check
   */
  public async fileExists(key: string): Promise<boolean> {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
      };

      await this.s3client.send(new GetObjectCommand(params));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate full URL for S3 object
   * @param key S3 key of the file
   * @returns URL to access the file
   */
  public getFileUrl(key: string): string {
    return `/files/${key}`;
  }
}
