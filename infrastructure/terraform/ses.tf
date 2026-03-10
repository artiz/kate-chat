# ─── SES Domain Identity ──────────────────────────────────────────────────────

resource "aws_ses_domain_identity" "main" {
  domain = var.domain_name
}

resource "aws_route53_record" "ses_verification" {
  zone_id = var.aws_route53_record_zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.main.verification_token]
}

resource "aws_ses_domain_identity_verification" "main" {
  domain = aws_ses_domain_identity.main.id

  depends_on = [aws_route53_record.ses_verification]
}

# ─── DKIM ─────────────────────────────────────────────────────────────────────

resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}

resource "aws_route53_record" "ses_dkim" {
  count   = 3
  zone_id = var.aws_route53_record_zone_id
  name    = "${aws_ses_domain_dkim.main.dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.main.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# ─── MAIL FROM (bounce handling via mail.katechat.tech) ───────────────────────

resource "aws_ses_domain_mail_from" "main" {
  domain           = aws_ses_domain_identity.main.domain
  mail_from_domain = "mail.${var.domain_name}"
}

resource "aws_route53_record" "ses_mail_from_mx" {
  zone_id = var.aws_route53_record_zone_id
  name    = "mail.${var.domain_name}"
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

resource "aws_route53_record" "ses_mail_from_spf" {
  zone_id = var.aws_route53_record_zone_id
  name    = "mail.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

# ─── IAM user for SMTP sending ────────────────────────────────────────────────

resource "aws_iam_user" "ses_smtp" {
  name = "${var.project_name}-${var.environment}-ses-smtp"
  tags = {
    Name = "${var.project_name}-${var.environment}-ses-smtp"
  }
}

resource "aws_iam_user_policy" "ses_smtp" {
  name = "${var.project_name}-${var.environment}-ses-smtp-policy"
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

# ─── Secrets Manager ──────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "smtp_user" {
  name                    = "${var.project_name}-${var.environment}-smtp-user"
  description             = "SES SMTP username (IAM access key ID)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "smtp_user" {
  secret_id     = aws_secretsmanager_secret.smtp_user.id
  secret_string = aws_iam_access_key.ses_smtp.id
}

resource "aws_secretsmanager_secret" "smtp_password" {
  name                    = "${var.project_name}-${var.environment}-smtp-password"
  description             = "SES SMTP password (derived from IAM secret key via SigV4)"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

resource "aws_secretsmanager_secret_version" "smtp_password" {
  secret_id     = aws_secretsmanager_secret.smtp_password.id
  secret_string = aws_iam_access_key.ses_smtp.ses_smtp_password_v4
}
