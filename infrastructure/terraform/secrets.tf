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
