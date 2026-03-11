# Generate random password for RDS
resource "random_password" "db_password" {
  length  = 32
  special = true

  lifecycle {
    ignore_changes = [
      length,
      special,
    ]
  }
}

# Store database password in AWS Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${var.project_name}-${var.environment}-db-password"
  description             = "Database password for KateChat"
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = {
    Name = "${var.project_name}-${var.environment}-db-password"
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result

  lifecycle {
    ignore_changes = [
      secret_string,
    ]
  }
}


resource "aws_secretsmanager_secret" "recaptcha_secret_key" {
  name                    = "${var.project_name}-${var.environment}-recaptcha-secret-key"
  description             = "RECAPTCHA_SECRET_KEY"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret" "google_client_id" {
  name                    = "${var.project_name}-${var.environment}-google-client-id"
  description             = "Google OAuth Client ID"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret" "google_client_secret" {
  name                    = "${var.project_name}-${var.environment}-google-client-secret"
  description             = "Google OAuth Client Secret"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret" "github_client_id" {
  name                    = "${var.project_name}-${var.environment}-github-client-id"
  description             = "Github OAuth Client ID"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret" "github_client_secret" {
  name                    = "${var.project_name}-${var.environment}-github-client-secret"
  description             = "Github OAuth Client Secret"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}


resource "aws_secretsmanager_secret" "microsoft_client_id" {
  name                    = "${var.project_name}-${var.environment}-microsoft-entra-client-id"
  description             = "Microsoft Entra ID OAuth Client ID"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret" "microsoft_client_secret" {
  name                    = "${var.project_name}-${var.environment}-microsoft-entra-client-secret"
  description             = "Microsoft Entra ID OAuth Client Secret"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret" "yandex_fm_api_key" {
  name                    = "${var.project_name}-${var.environment}-yandex-fm-api-key"
  description             = "Yandex Foundational Models API Key"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret" "yandex_fm_api_folder" {
  name                    = "${var.project_name}-${var.environment}-yandex-fm-api-folder"
  description             = "Yandex Foundational Models API Folder"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret" "openai_api_key" {
  name                    = "${var.project_name}-${var.environment}-openai-api-key"
  description             = "OpenAI API Key"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}


# ─────────────────────────────────────────────────────────────
# SES — domain identity, DKIM, IAM SMTP user, secrets
# ─────────────────────────────────────────────────────────────

resource "aws_ses_domain_identity" "main" {
  domain = var.domain_name
}

resource "aws_ses_domain_identity_verification" "main" {
  domain     = aws_ses_domain_identity.main.id
  depends_on = [aws_route53_record.ses_verification]
}

resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}

# Route53: SES domain verification TXT
resource "aws_route53_record" "ses_verification" {
  zone_id = var.aws_route53_record_zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  ttl     = 300
  records = [aws_ses_domain_identity.main.verification_token]
}

# Route53: SES DKIM CNAME records (3 total)
resource "aws_route53_record" "ses_dkim" {
  count   = 3
  zone_id = var.aws_route53_record_zone_id
  name    = "${aws_ses_domain_dkim.main.dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = ["${aws_ses_domain_dkim.main.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# MAIL FROM — sets bounce return-path to mail.katechat.tech
resource "aws_ses_domain_mail_from" "main" {
  domain           = aws_ses_domain_identity.main.domain
  mail_from_domain = "mail.${var.domain_name}"
}

resource "aws_route53_record" "ses_mail_from_mx" {
  zone_id = var.aws_route53_record_zone_id
  name    = "mail.${var.domain_name}"
  type    = "MX"
  ttl     = 300
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

resource "aws_route53_record" "ses_mail_from_spf" {
  zone_id = var.aws_route53_record_zone_id
  name    = "mail.${var.domain_name}"
  type    = "TXT"
  ttl     = 300
  records = ["v=spf1 include:amazonses.com ~all"]
}

# IAM user dedicated to SES SMTP
resource "aws_iam_user" "ses_smtp" {
  name = "${var.project_name}-${var.environment}-ses-smtp"
  tags = {
    Name = "${var.project_name}-${var.environment}-ses-smtp"
  }
}

resource "aws_iam_user_policy" "ses_smtp_send" {
  name = "${var.project_name}-${var.environment}-ses-smtp-send"
  user = aws_iam_user.ses_smtp.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ses:SendRawEmail"
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_access_key" "ses_smtp" {
  user = aws_iam_user.ses_smtp.name

  lifecycle {
    ignore_changes = [user]
  }
}

# Store SMTP username (IAM Access Key ID)
resource "aws_secretsmanager_secret" "smtp_user" {
  name                    = "${var.project_name}-${var.environment}-smtp-user"
  description             = "SES SMTP username (IAM Access Key ID)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "smtp_user" {
  secret_id     = aws_secretsmanager_secret.smtp_user.id
  secret_string = aws_iam_access_key.ses_smtp.id
}

# Store SMTP password (SES-derived v4 signing password — not the raw secret key)
resource "aws_secretsmanager_secret" "smtp_password" {
  name                    = "${var.project_name}-${var.environment}-smtp-password"
  description             = "SES SMTP password (v4 derived from IAM secret key)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "smtp_password" {
  secret_id     = aws_secretsmanager_secret.smtp_password.id
  secret_string = aws_iam_access_key.ses_smtp.ses_smtp_password_v4
}
