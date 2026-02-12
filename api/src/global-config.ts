import fs from "fs";
import path from "path";
import { config as loadEnv } from "dotenv";
import { DEFAULT_CHAT_PROMPT } from "./config/ai/prompts";
import { ApiProvider } from "./types/api";
import { DB_TYPE } from "./config/env";

const DEFAULT_PROVIDERS: ApiProvider[] = [
  ApiProvider.AWS_BEDROCK,
  ApiProvider.OPEN_AI,
  ApiProvider.YANDEX_FM,
  ApiProvider.CUSTOM_REST_API,
];

export interface InitialCustomModel {
  name: string;
  modelId: string;
  modelName: string;
  description?: string;
  apiProvider?: ApiProvider;
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
  app: {
    userAgent: string;
    maxInputJson: string;
    allowedOrigins: string[];
    defaultAdminEmails: string[];
  };
  runtime: {
    port: number;
    nodeEnv: string;
    logLevel: string;
    callbackUrlBase: string;
    frontendUrl: string;
    jwtSecret: string;
    jwtExpirationSec: number;
    sessionSecret: string;
    recaptchaSecretKey: string;
  };
  demo: {
    enabled: boolean;
    maxChatMessages: number;
    maxChats: number;
    maxImages: number;
    maxVideos: number;
  };
  features: {
    imagesGeneration: boolean;
    videoGeneration: boolean;
    rag: boolean;
    mcp: boolean;
  };
  ai: {
    enabledProviders: ApiProvider[];
    defaultSystemPrompt: string;
    defaultTemperature: number;
    defaultMaxTokens: number;
    defaultTopP: number;
    contextMessagesLimit: number;
    charactersPerToken: number;
    maxContextTokens: number;
    summarizingOutputTokens: number;
    summarizingTemperature: number;
    ragQueryChunksLimit: number;
    ragLoadFullPages: boolean;
  };
  oauth: {
    google: {
      enabled: boolean;
      clientId: string;
      clientSecret: string;
    };
    github: {
      enabled: boolean;
      clientId: string;
      clientSecret: string;
    };

    microsoft: {
      enabled: boolean;
      clientId: string;
      clientSecret: string;
      tenantId: string;
    };
  };
  db: {
    type: string;
    url?: string;
    host?: string;
    username?: string;
    password?: string;
    name?: string;
    ssl?: boolean;
    migrationsPath: string;
    logging: boolean;
  };
  redis: {
    url?: string;
    chatMessageExpirationSec: number;
    channelChatMessage: string;
    channelChatError: string;
    channelDocumentStatus: string;
  };
  s3: {
    endpoint?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    filesBucketName?: string;
    profile?: string;
  };
  bedrock: {
    endpoint?: string;
    profile?: string;
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
    fmApiUrl: string;
    fmOpenApiUrl: string;
    fmApiKey?: string;
    fmApiFolder?: string;
    searchApiUrl: string;
    searchApiKey?: string;
    searchApiFolder?: string;
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
    const demo = ["1", "true", "y", "yes"].includes((process.env.DEMO_MODE || "").toLowerCase());

    return {
      runtime: {
        port: +(process.env.PORT || 4000) | 0,
        nodeEnv: process.env.NODE_ENV || "development",
        logLevel: process.env.LOG_LEVEL || "info",
        callbackUrlBase: process.env.CALLBACK_URL_BASE || "http://localhost:4000",
        frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
        jwtSecret: process.env.JWT_SECRET || "katechat-secret",
        jwtExpirationSec: +(process.env.JWT_EXPIRATION_SEC || 7200) | 0,
        sessionSecret: process.env.SESSION_SECRET || "katechat-secret",
        recaptchaSecretKey: process.env.RECAPTCHA_SECRET_KEY || "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe",
      },
      app: {
        defaultAdminEmails:
          process.env.DEFAULT_ADMIN_EMAILS?.split(",")
            .map(email => email.trim())
            .filter(Boolean) || [],
        userAgent: process.env.APP_USER_AGENT || "KateChat/1.0 (+https://katechat.tech/)",
        maxInputJson: process.env.MAX_INPUT_JSON || "50mb",
        allowedOrigins: (process.env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()),
      },
      demo: {
        enabled: demo,
        maxChatMessages: +(process.env.DEMO_MAX_CHAT_MESSAGES || 25) | 0,
        maxChats: +(process.env.DEMO_MAX_CHATS || 10) | 0,
        maxImages: +(process.env.DEMO_MAX_IMAGES || 5) | 0,
        maxVideos: +(process.env.DEMO_MAX_VIDEOS || 2) | 0,
      },
      features: {
        imagesGeneration: demo ? !!process.env.FEATURE_ENABLE_IMAGE_GEN || false : true,
        videoGeneration: demo ? !!process.env.FEATURE_ENABLE_VIDEO_GEN || false : true,
        rag: true,
        mcp: true,
      },
      ai: {
        enabledProviders:
          process.env.ENABLED_API_PROVIDERS === "*"
            ? DEFAULT_PROVIDERS
            : ((process.env.ENABLED_API_PROVIDERS || DEFAULT_PROVIDERS.join(","))
                .split(",")
                .map(p => p.trim().toUpperCase()) as ApiProvider[]),
        defaultSystemPrompt: DEFAULT_CHAT_PROMPT,
        defaultTemperature: 0.7,
        defaultMaxTokens: 2048,
        defaultTopP: 0.9,
        contextMessagesLimit: +(process.env.AI_CONTEXT_MESSAGES_LIMIT || 100) | 0,
        charactersPerToken: 3.5,
        maxContextTokens: +(process.env.AI_MAX_CONTEXT_TOKENS || 8192) | 0,
        summarizingOutputTokens: +(process.env.AI_SUMMARIZING_OUTPUT_TOKENS || 2000) | 0,
        summarizingTemperature: +(process.env.AI_SUMMARIZING_TEMPERATURE || 0.25),
        ragQueryChunksLimit: +(process.env.RAG_QUERY_CHUNKS_LIMIT || 10) | 0,
        ragLoadFullPages: ["1", "true", "y", "yes"].includes((process.env.RAG_LOAD_FULL_PAGES || "yes").toLowerCase()),
      },
      oauth: {
        google: {
          enabled: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
          clientId: process.env.GOOGLE_CLIENT_ID || "",
          clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        },
        github: {
          enabled: !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET,
          clientId: process.env.GITHUB_CLIENT_ID || "",
          clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
        },
        microsoft: {
          enabled: !!process.env.MICROSOFT_CLIENT_ID && !!process.env.MICROSOFT_CLIENT_SECRET,
          clientId: process.env.MICROSOFT_CLIENT_ID || "",
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
          tenantId: process.env.MICROSOFT_TENANT_ID || "common",
        },
      },
      db: {
        type: DB_TYPE,
        url: process.env.DB_URL,
        host: process.env.DB_HOST,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        name: process.env.DB_NAME || "katechat.sqlite",
        ssl: ["1", "true", "y", "yes"].includes(process.env.DB_SSL?.toLowerCase() || ""),
        migrationsPath: process.env.DB_MIGRATIONS_PATH || path.join(__dirname, `../../db-migrations/${DB_TYPE}/*-*.ts`),
        logging: !!process.env.DB_LOGGING,
      },
      redis: {
        url: process.env.REDIS_URL || "redis://localhost:6379",
        chatMessageExpirationSec: +(process.env.REDIS_CHAT_MESSAGE_EXPIRATION_SEC || 300) | 0,
        channelChatMessage: process.env.CHAT_MESSAGES_CHANNEL || "chat:messages",
        channelChatError: process.env.CHAT_ERRORS_CHANNEL || "chat:errors",
        channelDocumentStatus: process.env.DOCUMENT_STATUS_CHANNEL || "document:status",
      },
      s3: {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION,
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        filesBucketName: process.env.S3_FILES_BUCKET_NAME,
        profile: process.env.S3_AWS_PROFILE,
      },
      bedrock: {
        endpoint: process.env.AWS_BEDROCK_ENDPOINT,
        profile: process.env.AWS_BEDROCK_PROFILE,
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
        fmApiUrl: process.env.YANDEX_FM_API_URL || "https://llm.api.cloud.yandex.net",
        fmOpenApiUrl: process.env.YANDEX_FM_OPENAI_API_URL || "https://llm.api.cloud.yandex.net/v1",
        fmApiKey: process.env.YANDEX_FM_API_KEY,
        fmApiFolder: process.env.YANDEX_FM_API_FOLDER,
        searchApiUrl: process.env.YANDEX_SEARCH_API_URL || "https://searchapi.api.cloud.yandex.net/v2/web/search",
        searchApiKey: process.env.YANDEX_SEARCH_API_KEY || process.env.YANDEX_FM_API_KEY,
        searchApiFolder: process.env.YANDEX_SEARCH_API_FOLDER || process.env.YANDEX_FM_API_FOLDER,
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

export const globalConfig = GlobalConfig.config;

export const getFrontendOrigin = (): string => {
  try {
    const url = new URL(globalConfig.runtime.frontendUrl);
    return url.origin;
  } catch {
    return globalConfig.runtime.frontendUrl;
  }
};
