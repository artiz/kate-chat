export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGES = 5; // Maximum number of images allowed in a single message
export const RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";

export const APP_API_URL = process.env.APP_API_URL || "http://localhost:4000";
export const APP_WS_URL = process.env.APP_WS_URL || APP_API_URL;
