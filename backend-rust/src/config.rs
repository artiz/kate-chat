use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub database_url: String,
    pub jwt_secret: String,
    pub session_secret: String,
    pub port: u16,
    pub allowed_origins: Option<String>,
    pub default_admin_emails: Vec<String>,

    // AWS Configuration
    pub aws_bedrock_region: Option<String>,
    pub aws_bedrock_profile_name: Option<String>,
    pub aws_bedrock_access_key_id: Option<String>,
    pub aws_bedrock_secret_access_key: Option<String>,

    // OAuth Configuration
    pub google_client_id: Option<String>,
    pub google_client_secret: Option<String>,
    pub github_client_id: Option<String>,
    pub github_client_secret: Option<String>,
    pub callback_url_base: Option<String>,
    pub frontend_url: Option<String>,

    // S3 Configuration
    pub s3_bucket: Option<String>,
    pub s3_region: Option<String>,
    pub s3_endpoint: Option<String>,
    pub s3_access_key_id: Option<String>,
    pub s3_secret_access_key: Option<String>,

    // Application limits
    pub demo_max_chat_messages: Option<i32>,
    pub demo_max_chats: Option<i32>,
    pub demo_max_images: Option<i32>,

    // Demo mode
    pub demo_mode: bool,

    // OpenAI
    pub openai_api_key: Option<String>,

    // Yandex
    pub yandex_api_key: Option<String>,
    pub yandex_folder_id: Option<String>,

    // Enabled API providers
    pub enabled_api_providers: Vec<String>,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "sqlite://katechat.sqlite".to_string()),
            jwt_secret: env::var("JWT_SECRET")
                .unwrap_or_else(|_| "katechat-jwt-secret".to_string()),
            session_secret: env::var("SESSION_SECRET")
                .unwrap_or_else(|_| "katechat-secret".to_string()),
            port: env::var("PORT")
                .unwrap_or_else(|_| "4000".to_string())
                .parse()
                .unwrap_or(4000),
            allowed_origins: env::var("ALLOWED_ORIGINS").ok(),

            // AWS Bedrock
            aws_bedrock_region: env::var("AWS_BEDROCK_REGION").ok(),
            aws_bedrock_profile_name: env::var("AWS_BEDROCK_PROFILE").ok(),
            aws_bedrock_access_key_id: env::var("AWS_BEDROCK_ACCESS_KEY_ID").ok(),
            aws_bedrock_secret_access_key: env::var("AWS_BEDROCK_SECRET_ACCESS_KEY").ok(),

            // OpenAI
            openai_api_key: env::var("OPENAI_API_KEY").ok(),

            // Yandex
            yandex_api_key: env::var("YANDEX_FM_API_KEY").ok(),
            yandex_folder_id: env::var("YANDEX_FM_API_FOLDER").ok(),

            // OAuth
            google_client_id: env::var("GOOGLE_CLIENT_ID").ok(),
            google_client_secret: env::var("GOOGLE_CLIENT_SECRET").ok(),
            github_client_id: env::var("GITHUB_CLIENT_ID").ok(),
            github_client_secret: env::var("GITHUB_CLIENT_SECRET").ok(),
            callback_url_base: env::var("CALLBACK_URL_BASE").ok(),
            frontend_url: env::var("FRONTEND_URL").ok(),

            // S3
            s3_bucket: env::var("S3_FILES_BUCKET_NAME").ok(),
            s3_region: env::var("S3_REGION").ok(),
            s3_endpoint: env::var("S3_ENDPOINT").ok(),
            s3_access_key_id: env::var("S3_ACCESS_KEY_ID").ok(),
            s3_secret_access_key: env::var("S3_SECRET_ACCESS_KEY").ok(),

            // Demo mode
            demo_mode: env::var("DEMO_MODE").unwrap_or_else(|_| "false".to_string()) == "true",
            demo_max_chat_messages: env::var("DEMO_MAX_CHAT_MESSAGES")
                .ok()
                .and_then(|s| s.parse().ok()),
            demo_max_chats: env::var("DEMO_MAX_CHATS").ok().and_then(|s| s.parse().ok()),
            demo_max_images: env::var("DEMO_MAX_IMAGES")
                .ok()
                .and_then(|s| s.parse().ok()),

            // Enabled API providers
            enabled_api_providers: Self::parse_enabled_providers(),

            // Default admin emails
            default_admin_emails: match env::var("DEFAULT_ADMIN_EMAILS") {
                Ok(value) => value.split(',').map(|s| s.trim().to_string()).collect(),
                Err(_) => {
                    vec![]
                }
            },
        }
    }

    fn parse_enabled_providers() -> Vec<String> {
        let all_providers = vec![
            "aws_bedrock".to_string(),
            "open_ai".to_string(),
            "yandex_fm".to_string(),
        ];

        match env::var("ENABLED_API_PROVIDERS") {
            Ok(value) => {
                if value.trim() == "*" {
                    // If "*", return all providers
                    all_providers
                } else {
                    // Split by comma and filter valid providers
                    value
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty() && all_providers.contains(s))
                        .collect()
                }
            }
            Err(_) => {
                // If not set, return empty list (no providers enabled by default)
                vec![]
            }
        }
    }

    pub fn is_provider_enabled(&self, provider: &str) -> bool {
        self.enabled_api_providers.contains(&provider.to_string())
    }
}
