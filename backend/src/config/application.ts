import path from "path";

export const MAX_INPUT_JSON = process.env.MAX_INPUT_JSON || "5mb";

export const OUTPUT_FOLDER = process.env.OUTPUT_FOLDER || path.join(__dirname, "../../output");

export const QUEUE_MESSAGE_EXPIRATION_SEC = +(process.env.QUEUE_MESSAGE_EXPIRATION_SEC || 300);

// Google reCAPTCHA configuration
export const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe"; // Test secret key for development
export const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
export const RECAPTCHA_SCORE_THRESHOLD = 0.5; // Scores range from 0.0 to 1.0, with 1.0 being the most trustworthy
