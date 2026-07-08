export const getErrorMessage = (error: unknown, defaultMessage: string = "An unknown error occurred"): string => {
  if (error instanceof Error) {
    return error.message || "An unknown error occurred";
  }
  if (typeof error === "string" && error) {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    return JSON.stringify(error);
  }
  return defaultMessage;
};

/**
 * OAuth token endpoint error with the OAuth error code (e.g. "invalid_grant")
 * preserved so callers can distinguish "re-authorization required" from
 * transient failures.
 */
export class OAuthTokenError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: string
  ) {
    super(message);
    this.name = "OAuthTokenError";
  }
}
