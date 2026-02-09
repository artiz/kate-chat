export const MAX_UPLOAD_FILE_SIZE = 64 * 1024 * 1024; // 64 MB
export const MAX_IMAGES = 5; // Maximum number of images allowed in a single message

export const CHAT_PAGE_SIZE = 20; // Number of chats to fetch per page

export const RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";

export const APP_API_URL = (process.env.APP_API_URL || "http://localhost:4000").replace(/\/+$/, ""); // Ensure it does not end with a single slash
export const APP_WS_URL = (process.env.APP_WS_URL || APP_API_URL).replace(/\/+$/, ""); // Ensure it does not end with a single slash

export const SUPPORTED_UPLOAD_FORMATS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/msword", // .doc
  "application/vnd.ms-excel", // .xls
  "application/vnd.ms-powerpoint", // .ppt
  "text/csv",
  "text/html",
  "text/plain",
];
