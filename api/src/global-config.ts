import fs from "fs";
import path from "path";
import { config as loadEnv } from "dotenv";

// must be in sync with packages/katechat-ui/src/core/ai.ts
export enum ApiProvider {
  AWS_BEDROCK = "AWS_BEDROCK",
  OPEN_AI = "OPEN_AI",
  YANDEX_FM = "YANDEX_FM",
  CUSTOM_REST_API = "CUSTOM_REST_API",
}

export type AvailableProvider = `${ApiProvider}`;
const DEFAULT_PROVIDERS: AvailableProvider[] = [
  ApiProvider.AWS_BEDROCK,
  ApiProvider.OPEN_AI,
  ApiProvider.YANDEX_FM,
  ApiProvider.CUSTOM_REST_API,
];

export interface InitialCustomModel {
  name: string;
  modelId: string;
  description?: string;
  apiProvider?: AvailableProvider;
  protocol?: string;
  type?: "CHAT" | "EMBEDDING";
  baseUrl?: string;
  apiKeyEnv?: string;
}

export interface InitialMCPServer {
  name: string;
  url: string;
  description?: string;
  authType?: string;
  authConfig?: Record<string, unknown>;
  transportType?: string;
  tokenEnv?: string;
}

export interface GlobalConfigShape {
  demo: {
    enabled: boolean;
    maxChatMessages: number;
    maxChats: number;
    maxImages: number;
  };
  providers: {
    enabled: AvailableProvider[] | ["*"];
  };
  features: {
    imagesGeneration: boolean;
    rag: boolean;
    mcp: boolean;
  };
  ai: {
    defaultTemperature: number;
    defaultMaxTokens: number;
    defaultTopP: number;
    contextMessagesLimit: number;
    embeddingsDimensions?: number;
    charactersPerToken: number;
    maxContextTokens: number;
    summarizingOutputTokens: number;
    summarizingTemperature: number;
    ragQueryChunksLimit: number;
    ragLoadFullPages: boolean;
  };
  admin: {
    defaultEmails: string[];
  };
  app: {
    userAgent: string;
    maxInputJson: string;
    queueMessageExpirationSec: number;
    allowedOrigins: string;
    redisUrl?: string;
  };
  runtime: {
    port: number;
    nodeEnv: string;
    logLevel: string;
    callbackUrlBase: string;
    frontendUrl: string;
    jwtSecret: string;
    jwtExpiration?: string;
    sessionSecret: string;
    recaptchaSecretKey: string;
  };
  oauth: {
    googleClientId?: string;
    googleClientSecret?: string;
    githubClientId?: string;
    githubClientSecret?: string;
    microsoftClientId?: string;
    microsoftClientSecret?: string;
    microsoftTenantId?: string;
  };
  db: {
    type: string;
    url?: string;
    host?: string;
    username?: string;
    password?: string;
    name?: string;
    ssl?: boolean;
    migrationsPath?: string;
    logging?: boolean;
  };
  s3: {
    endpoint?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucketName?: string;
    profile?: string;
  };
  bedrock: {
    endpoint?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
  openai: {
    apiKey?: string;
    adminApiKey?: string;
    apiUrl?: string;
  };
  yandex: {
    apiKey?: string;
    apiFolder?: string;
  };
  sqs: {
    endpoint?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    documentsQueue?: string;
    indexDocumentsQueue?: string;
  };
  initial?: {
    models?: InitialCustomModel[];
    mcpServers?: InitialMCPServer[];
  };
}

function mergeDeep<T>(target: T, source: Partial<T>): T {
  if (!source) return target;
  const output: any = Array.isArray(target)
    ? [...(Array.isArray(source) ? (source as any[]) : (target as any[]))]
    : { ...target };
  Object.entries(source as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined) return;
    const targetValue = (output as any)[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      (output as any)[key] = mergeDeep(targetValue, value as any);
    } else {
      (output as any)[key] = value;
    }
  });
  return output as T;
}

export class GlobalConfig {
  private static instance: GlobalConfig;
  private readonly cfg: GlobalConfigShape;

  private constructor() {
    loadEnv();

    const defaults = this.buildDefaults();
    const customization = this.loadCustomization();
    this.cfg = mergeDeep(defaults, customization);
  }

  static getInstance(): GlobalConfig {
    if (!this.instance) {
      this.instance = new GlobalConfig();
    }
    return this.instance;
  }

  static get config(): GlobalConfigShape {
    return this.getInstance().cfg;
  }

  get config(): GlobalConfigShape {
    return this.cfg;
  }

  private buildDefaults(): GlobalConfigShape {
    const adminEmails = process.env.DEFAULT_ADMIN_EMAILS?.split(",").map(email => email.trim()).filter(Boolean) || [];
    const dbType =
      process.env.DB_TYPE === "sqlite" || process.env.DB_TYPE === "better-sqlite3" || !process.env.DB_TYPE
        ? "sqlite"
        : process.env.DB_TYPE;

    return {
      demo: {
        enabled: ["1", "true", "y", "yes"].includes((process.env.DEMO_MODE || "false").toLowerCase()),
        maxChatMessages: +(process.env.DEMO_MAX_CHAT_MESSAGES || 20),
        maxChats: +(process.env.DEMO_MAX_CHATS || 10),
        maxImages: +(process.env.DEMO_MAX_IMAGES || 5),
      },
      providers: {
        enabled:
          process.env.ENABLED_API_PROVIDERS === "*"
            ? ["*"]
            : (process.env.ENABLED_API_PROVIDERS || DEFAULT_PROVIDERS.join(","))
                .split(",")
                .map(p => p.trim().toUpperCase()) as AvailableProvider[],
      },
      features: {
        imagesGeneration: true,
        rag: true,
        mcp: true,
      },
      ai: {
        defaultTemperature: 0.7,
        defaultMaxTokens: 2048,
        defaultTopP: 0.9,
        contextMessagesLimit: 100,
        embeddingsDimensions: dbType === "mssql" ? 1998 : 3072,
        charactersPerToken: 3.5,
        maxContextTokens: 8 * 1024,
        summarizingOutputTokens: 2000,
        summarizingTemperature: 0.25,
        ragQueryChunksLimit: process.env.RAG_QUERY_CHUNKS_LIMIT ? parseInt(process.env.RAG_QUERY_CHUNKS_LIMIT, 10) : 10,
        ragLoadFullPages: ["1", "true", "y", "yes"].includes((process.env.RAG_LOAD_FULL_PAGES || "yes").toLowerCase()),
      },
      admin: {
        defaultEmails: adminEmails,
      },
      app: {
        userAgent: process.env.APP_USER_AGENT || "KateChat/1.0 (+https://katechat.tech/)",
        maxInputJson: process.env.MAX_INPUT_JSON || "50mb",
        queueMessageExpirationSec: +(process.env.QUEUE_MESSAGE_EXPIRATION_SEC || 300),
        allowedOrigins: process.env.ALLOWED_ORIGINS || "",
        redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
      },
      runtime: {
        port: +(process.env.PORT || 4000),
        nodeEnv: process.env.NODE_ENV || "development",
        logLevel: process.env.LOG_LEVEL || "info",
        callbackUrlBase: process.env.CALLBACK_URL_BASE || "http://localhost:4000",
        frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
        jwtSecret: process.env.JWT_SECRET || "katechat-secret",
        jwtExpiration: process.env.JWT_EXPIRATION,
        sessionSecret: process.env.SESSION_SECRET || "katechat-secret",
        recaptchaSecretKey: process.env.RECAPTCHA_SECRET_KEY || "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe",
      },
      oauth: {
        googleClientId: process.env.GOOGLE_CLIENT_ID || "",
        googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        githubClientId: process.env.GITHUB_CLIENT_ID || "",
        githubClientSecret: process.env.GITHUB_CLIENT_SECRET || "",
        microsoftClientId: process.env.MICROSOFT_CLIENT_ID || "",
        microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
        microsoftTenantId: process.env.MICROSOFT_TENANT_ID || "common",
      },
      db: {
        type: dbType,
        url: process.env.DB_URL,
        host: process.env.DB_HOST,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        name: process.env.DB_NAME || "katechat.sqlite",
        ssl: ["1", "true", "y", "yes"].includes(process.env.DB_SSL?.toLowerCase() || ""),
        migrationsPath: process.env.DB_MIGRATIONS_PATH,
        logging: !!process.env.DB_LOGGING,
      },
      s3: {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION,
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        bucketName: process.env.S3_FILES_BUCKET_NAME,
        profile: process.env.S3_AWS_PROFILE,
      },
      bedrock: {
        endpoint: process.env.AWS_BEDROCK_ENDPOINT,
        region: process.env.AWS_BEDROCK_REGION,
        accessKeyId: process.env.AWS_BEDROCK_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_BEDROCK_SECRET_ACCESS_KEY,
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        adminApiKey: process.env.OPENAI_API_ADMIN_KEY,
        apiUrl: process.env.OPENAI_API_URL,
      },
      yandex: {
        apiKey: process.env.YANDEX_FM_API_KEY,
        apiFolder: process.env.YANDEX_FM_API_FOLDER,
      },
      sqs: {
        endpoint: process.env.SQS_ENDPOINT,
        region: process.env.SQS_REGION,
        accessKeyId: process.env.SQS_ACCESS_KEY_ID,
        secretAccessKey: process.env.SQS_SECRET_ACCESS_KEY,
        documentsQueue: process.env.SQS_DOCUMENTS_QUEUE,
        indexDocumentsQueue: process.env.SQS_INDEX_DOCUMENTS_QUEUE,
      },
      initial: {
        models: [],
        mcpServers: [],
      },
    };
  }

  private loadCustomization(): Partial<GlobalConfigShape> {
    const locations = [
      path.resolve(process.cwd(), "customization.json"),
      path.resolve(process.cwd(), "..", "customization.json"),
    ];

    for (const location of locations) {
      if (fs.existsSync(location)) {
        try {
          const raw = fs.readFileSync(location, "utf-8");
          return JSON.parse(raw);
        } catch (error) {
          console.warn(`Failed to load customization from ${location}:`, error);
        }
      }
    }

    return {};
  }
}

export const globalConfig = GlobalConfig.getInstance();
