import i18n from "@/i18n";

/**
 * Maps known server error messages to localized translation keys.
 * Falls back to the original message if no mapping is found.
 */
const SERVER_ERROR_MAP: Record<string, string> = {
  Unauthorized: "errors.unauthorized",
  Forbidden: "errors.forbidden",
  "Unknown error": "errors.unknownError",
  "Internal server error": "errors.internalServerError",
  "Internal Server Error": "errors.internalServerError",
  "Bad request": "errors.badRequest",
  "Bad Request": "errors.badRequest",
  "Not found": "errors.notFound",
  "Not Found": "errors.notFound",
  "Service unavailable": "errors.serviceUnavailable",
  "Service Unavailable": "errors.serviceUnavailable",
  "Too many requests": "errors.tooManyRequests",
  "Too Many Requests": "errors.tooManyRequests",
  Conflict: "errors.conflict",
  "Validation error": "errors.validationError",
  "Validation Error": "errors.validationError",
};

export function mapServerError(message: string): string {
  const key = SERVER_ERROR_MAP[message];
  if (key) {
    return i18n.t(key);
  }

  // Try partial matching for common patterns
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("unauthorized") || lowerMessage.includes("unauthenticated")) {
    return i18n.t("errors.unauthorized");
  }
  if (lowerMessage.includes("forbidden") || lowerMessage.includes("access denied")) {
    return i18n.t("errors.forbidden");
  }
  if (lowerMessage.includes("not found")) {
    return i18n.t("errors.notFound");
  }
  if (lowerMessage.includes("too many requests") || lowerMessage.includes("rate limit")) {
    return i18n.t("errors.tooManyRequests");
  }
  if (lowerMessage.includes("service unavailable")) {
    return i18n.t("errors.serviceUnavailable");
  }

  return message;
}
