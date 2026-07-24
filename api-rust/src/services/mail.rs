//! SMTP mailer for password-reset emails (Node's mail.service).

use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

use crate::config::AppConfig;
use crate::utils::errors::AppError;

pub fn smtp_enabled(config: &AppConfig) -> bool {
    config.smtp_host.is_some()
}

pub async fn send_password_reset_email(
    config: &AppConfig,
    to: &str,
    reset_url: &str,
) -> Result<(), AppError> {
    let Some(host) = config.smtp_host.as_deref() else {
        return Ok(()); // no-op when SMTP is not configured (Node parity)
    };

    let html = format!(
        "<div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;\">\
         <h2>Reset your password</h2>\
         <p>You requested a password reset for your KateChat account.</p>\
         <p>Click the button below to set a new password. This link is valid for 15 minutes.</p>\
         <p><a href=\"{url}\" style=\"display:inline-block;padding:10px 20px;background:#228be6;\
         color:#fff;text-decoration:none;border-radius:4px;\">Reset password</a></p>\
         <p>If the button does not work, copy this link into your browser:<br/>{url}</p>\
         <p>If you did not request a reset, you can safely ignore this email.</p>\
         </div>",
        url = reset_url
    );

    let email = Message::builder()
        .from(
            config
                .smtp_from
                .parse()
                .map_err(|e| AppError::Internal(format!("Invalid SMTP_FROM: {}", e)))?,
        )
        .to(to
            .parse()
            .map_err(|e| AppError::Validation(format!("Invalid recipient: {}", e)))?)
        .subject("Reset your password")
        .header(ContentType::TEXT_HTML)
        .body(html)
        .map_err(|e| AppError::Internal(format!("Failed to build email: {}", e)))?;

    // SMTP_SECURE=true → implicit TLS (465); otherwise STARTTLS when the
    // server offers it (587), like nodemailer's default behavior
    let mut builder = if config.smtp_secure {
        AsyncSmtpTransport::<Tokio1Executor>::relay(host)
            .map_err(|e| AppError::Internal(format!("SMTP relay: {}", e)))?
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)
            .map_err(|e| AppError::Internal(format!("SMTP relay: {}", e)))?
    }
    .port(config.smtp_port);

    if let (Some(user), Some(password)) = (&config.smtp_user, &config.smtp_password) {
        builder = builder.credentials(Credentials::new(user.clone(), password.clone()));
    }

    builder
        .build()
        .send(email)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to send email: {}", e)))?;
    Ok(())
}

/// Verify a Google reCAPTCHA token (Node's verifyRecaptchaToken).
pub async fn verify_recaptcha(secret: &str, token: &str) -> Result<bool, AppError> {
    let response = reqwest::Client::new()
        .post("https://www.google.com/recaptcha/api/siteverify")
        .form(&[("secret", secret), ("response", token)])
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("reCAPTCHA request failed: {}", e)))?;
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("reCAPTCHA response: {}", e)))?;
    Ok(body
        .get("success")
        .and_then(|s| s.as_bool())
        .unwrap_or(false))
}
