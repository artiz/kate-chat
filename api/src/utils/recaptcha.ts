import { fetch } from "undici";
import { globalConfig } from "@/global-config";
import { logger } from "./logger";

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const RECAPTCHA_SCORE_THRESHOLD = 0.5;

interface RecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
}

/**
 * Verify a Google reCAPTCHA v3 token
 *
 * @param token The reCAPTCHA token from the client
 * @param expectedAction The expected action name (e.g., 'register', 'login')
 * @returns True if verification is successful, false otherwise
 */
export const verifyRecaptchaToken = async (token: string, expectedAction: string): Promise<boolean> => {
  if (!token) {
    logger.warn("Missing reCAPTCHA token");
    return false;
  }

  if (!globalConfig.runtime.recaptchaSecretKey) {
    logger.warn("reCAPTCHA secret key not configured, skipping verification");
    return true; // Skip verification in development mode
  }

  try {
    // Send verification request to Google
    const params = new URLSearchParams({
      secret: globalConfig.runtime.recaptchaSecretKey,
      response: token,
    });
    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
    }).then(res => res.json() as Promise<RecaptchaResponse>);

    const { success, score, action, "error-codes": errorCodes } = response;
    if (!success) {
      logger.warn({ errorCodes }, "reCAPTCHA verification failed");
      return false;
    }

    // Check if the score meets our threshold
    if (score && score < RECAPTCHA_SCORE_THRESHOLD) {
      logger.warn({ score }, "reCAPTCHA score below threshold");
      return false;
    }

    // Verify that the action matches what we expect
    if (expectedAction && action !== expectedAction) {
      logger.warn({ action, expectedAction }, "reCAPTCHA action mismatch");
      return false;
    }

    logger.debug({ score, action }, "reCAPTCHA verification successful");
    return true;
  } catch (error) {
    logger.error(error, "reCAPTCHA verification request failed");
    return false;
  }
};
