import nodemailer from "nodemailer";
import { globalConfig } from "@/global-config";
import { logger } from "@/utils/logger";

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const smtp = globalConfig.smtp;
  if (!smtp.enabled) {
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port || 587,
    secure: smtp.secure || false,
    auth: smtp.user && smtp.password ? { user: smtp.user, pass: smtp.password } : undefined,
  });

  // TODO: Add email templates and support for multiple languages
  await transporter.sendMail({
    from: smtp.from,
    to,
    subject: "Reset your password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Reset your password</h2>
        <p>Click the link below to reset your password. The link is valid for <strong>15 minutes</strong>.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#228be6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            Reset Password
          </a>
        </p>
        <p style="color:#888;font-size:13px">If you did not request a password reset, ignore this email.</p>
        <p style="color:#888;font-size:13px">Link: ${resetUrl}</p>
      </div>
    `,
  });
}
