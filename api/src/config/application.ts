import { globalConfig } from "@/global-config";

const cfg = globalConfig.values;
const env = cfg.env;

export const MAX_INPUT_JSON = cfg.app.maxInputJson;
export const DEMO_MODE = cfg.demo.enabled;
export const DEMO_MAX_CHAT_MESSAGES = cfg.demo.maxChatMessages;
export const DEMO_MAX_CHATS = cfg.demo.maxChats;
export const DEMO_MAX_IMAGES = cfg.demo.maxImages;

// Services configuration
export const APP_USER_AGENT = cfg.app.userAgent;

// Admin configuration
export const DEFAULT_ADMIN_EMAILS = cfg.admin.defaultEmails;

// Google reCAPTCHA configuration
export const RECAPTCHA_SECRET_KEY = env.recaptchaSecretKey; // Test secret key for development
export const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
export const RECAPTCHA_SCORE_THRESHOLD = 0.5; // Scores range from 0.0 to 1.0, with 1.0 being the most trustworthy

// OAuth configuration
export const GOOGLE_CLIENT_ID = env.oauth.googleClientId || "";
export const GOOGLE_CLIENT_SECRET = env.oauth.googleClientSecret || "";
export const GITHUB_CLIENT_ID = env.oauth.githubClientId || "";
export const GITHUB_CLIENT_SECRET = env.oauth.githubClientSecret || "";
export const MICROSOFT_CLIENT_ID = env.oauth.microsoftClientId || "";
export const MICROSOFT_CLIENT_SECRET = env.oauth.microsoftClientSecret || "";
export const MICROSOFT_TENANT_ID = env.oauth.microsoftTenantId || "common";
export const CALLBACK_URL_BASE = env.callbackUrlBase;
export const FRONTEND_URL = env.frontendUrl;

// Queue configuration
export const QUEUE_MESSAGE_EXPIRATION_SEC = cfg.app.queueMessageExpirationSec;
export const REDIS_URL = env.redisUrl || "redis://localhost:6379";

export const SQS_ENDPOINT = env.sqs.endpoint;
export const SQS_REGION = env.sqs.region;
export const SQS_ACCESS_KEY_ID = env.sqs.accessKeyId;
export const SQS_SECRET_ACCESS_KEY = env.sqs.secretAccessKey;
export const SQS_DOCUMENTS_QUEUE = env.sqs.documentsQueue;
export const SQS_INDEX_DOCUMENTS_QUEUE = env.sqs.indexDocumentsQueue;

// Get the frontend origin for secure postMessage
export const getFrontendOrigin = (): string => {
  try {
    const url = new URL(FRONTEND_URL);
    return url.origin;
  } catch {
    return FRONTEND_URL;
  }
};
