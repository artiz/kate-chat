import { Repository } from "typeorm";
import * as path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, S3ClientConfig } from "@aws-sdk/client-s3";
import { createLogger } from "@/utils/logger";
import { UserSettings } from "@/entities";
import { getRepository } from "@/config/database";
import { User } from "@/entities";
import { TokenPayload } from "@/utils/jwt";
import { ok } from "@/utils/assert";

const logger = createLogger(__filename);

const DEFAULT_REGION = "eu-central-1";

const ConnectionSettingsCache: Map<string, UserSettings> = new Map();

export class S3Service {
  private s3client: S3Client;
  private connecting: boolean = true;
  private bucketName: string;
  private userRepository: Repository<User>;

  constructor(token?: TokenPayload) {
    const envSettings: UserSettings = {
      s3FilesBucketName: process.env.S3_FILES_BUCKET_NAME,
      s3Endpoint: process.env.S3_ENDPOINT,
      s3Region: process.env.S3_REGION,
      s3AccessKeyId: process.env.S3_ACCESS_KEY_ID,
      s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      s3Profile: process.env.S3_AWS_PROFILE,
    };

    const init = (settings: UserSettings) => {
      ok(settings.s3FilesBucketName, "S3 bucket name is required");

      const clientOptions: S3ClientConfig = {
        region: settings.s3Region || DEFAULT_REGION,
        profile: settings.s3Profile || undefined,
        credentials:
          settings.s3AccessKeyId && settings.s3SecretAccessKey
            ? {
                accessKeyId: settings.s3AccessKeyId,
                secretAccessKey: settings.s3SecretAccessKey,
              }
            : undefined,
        requestHandler: {
          socketTimeout: 1 * 60 * 1000, // ms
        },
      };

      if (settings.s3Endpoint) {
        clientOptions.endpoint = settings.s3Endpoint;
        // For LocalStack and other S3-compatible services
        clientOptions.forcePathStyle = true;
      }

      this.bucketName = settings.s3FilesBucketName;
      this.s3client = new S3Client(clientOptions);
      this.connecting = false;
    };

    this.userRepository = getRepository(User);

    const credsSetup = (envSettings.s3AccessKeyId && envSettings.s3SecretAccessKey) || !!envSettings.s3Profile;

    if (!envSettings.s3FilesBucketName || !credsSetup) {
      if (token) {
        const cached = ConnectionSettingsCache.get(token.userId);
        if (cached) {
          logger.debug("Using cached S3 settings for user", token.userId);
          init(cached);
          return;
        }

        this.userRepository
          .findOne({
            where: { id: token.userId },
          })
          .then(user => {
            if (user && user.settings) {
              const settings: UserSettings = {
                ...envSettings,
                ...(user.settings || {}),
              };

              if (settings.s3FilesBucketName && settings.s3AccessKeyId && settings.s3SecretAccessKey) {
                init(settings);
                ConnectionSettingsCache.set(token.userId, settings);
              }
            }
          })
          .catch(error => {
            logger.error(error, "Failed to load user settings for S3 initialization");
          });
      } else {
        logger.debug(
          "S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY or S3_AWS_PROFILE are not provided in env/user setings parameters"
        );
      }
    } else {
      try {
        init(envSettings);
      } catch (error) {
        logger.error(error, "Failed to initialize S3 client with environment settings");
      }
    }
  }

  async getClient(): Promise<S3Client> {
    if (this.connecting) {
      // Wait until the client is initialized
      for (let ndx = 0; ndx < 10; ndx++) {
        if (!this.connecting) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 50 * ndx)); // Exponential backoff
      }
    }

    if (!this.s3client) {
      throw new Error("S3 client is not initialized");
    }

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
  public async uploadFile(content: Buffer, key: string, contentType?: string): Promise<string> {
    const client = await this.getClient();
    if (!client) {
      throw new Error("S3 client is not configured");
    }

    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Body: content,
        ContentType: contentType,
      };

      logger.debug({ key }, "Uploading file to S3");
      await client.send(new PutObjectCommand(params));
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
    const client = await this.getClient();
    if (!client) {
      throw new Error("S3 client is not configured");
    }

    const params = {
      Bucket: this.bucketName,
      Key: key,
    };

    logger.debug({ key }, "Deleting file from S3");
    await client.send(new DeleteObjectCommand(params));
  }

  /**
   * Check if file exists in S3
   * @param key S3 key to check
   */
  public async fileExists(key: string): Promise<boolean> {
    const client = await this.getClient();
    if (!client) {
      throw new Error("S3 client is not configured");
    }

    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
      };

      await client.send(new GetObjectCommand(params));
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
