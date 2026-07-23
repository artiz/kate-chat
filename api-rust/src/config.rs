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
    pub github_oauth_organization: Option<String>,
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
    pub yandex_openai_api_url: Option<String>,
    pub yandex_search_api_key: Option<String>,
    pub yandex_search_api_url: Option<String>,

    // SQS (RAG documents pipeline: parse commands out, index commands in)
    pub sqs_endpoint: Option<String>,
    pub sqs_region: Option<String>,
    pub sqs_access_key_id: Option<String>,
    pub sqs_secret_access_key: Option<String>,
    pub sqs_documents_queue: Option<String>,
    pub sqs_index_documents_queue: Option<String>,

    // Redis (live document-processor status stream)
    pub redis_url: Option<String>,
    pub document_status_channel: String,

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
            yandex_openai_api_url: env::var("YANDEX_OPENAI_API_URL").ok(),
            yandex_search_api_key: env::var("YANDEX_SEARCH_API_KEY")
                .or_else(|_| env::var("YANDEX_FM_API_KEY"))
                .ok(),
            yandex_search_api_url: env::var("YANDEX_SEARCH_API_URL").ok(),

            // SQS
            sqs_endpoint: env::var("SQS_ENDPOINT").ok(),
            sqs_region: env::var("SQS_REGION").ok(),
            sqs_access_key_id: env::var("SQS_ACCESS_KEY_ID").ok(),
            sqs_secret_access_key: env::var("SQS_SECRET_ACCESS_KEY").ok(),
            sqs_documents_queue: env::var("SQS_DOCUMENTS_QUEUE").ok(),
            sqs_index_documents_queue: env::var("SQS_INDEX_DOCUMENTS_QUEUE").ok(),

            // Redis: siblings (Node API, document-processor) default to
            // localhost; empty REDIS_URL disables the status subscriber
            redis_url: env::var("REDIS_URL")
                .ok()
                .or_else(|| Some("redis://localhost:6379".to_string()))
                .filter(|s| !s.is_empty()),
            document_status_channel: env::var("DOCUMENT_STATUS_CHANNEL")
                .unwrap_or_else(|_| "document:status".to_string()),

            // OAuth
            google_client_id: env::var("GOOGLE_OAUTH_CLIENT_ID").ok(),
            google_client_secret: env::var("GOOGLE_OAUTH_CLIENT_SECRET").ok(),
            github_client_id: env::var("GITHUB_OAUTH_CLIENT_ID").ok(),
            github_client_secret: env::var("GITHUB_OAUTH_CLIENT_SECRET").ok(),
            github_oauth_organization: env::var("GITHUB_OAUTH_ORGANIZATION")
                .ok()
                .or(env::var("GITHUB_OAUTH_ORG").ok()),
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
            "AWS_BEDROCK".to_string(),
            "OPEN_AI".to_string(),
            "YANDEX_AI".to_string(),
            "CUSTOM_REST_API".to_string(),
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

    /// RAG is supported when files storage and both document queues are
    /// configured (the document-processor talks to the same queues).
    pub fn rag_supported(&self) -> bool {
        self.s3_bucket.is_some()
            && self.sqs_documents_queue.is_some()
            && self.sqs_index_documents_queue.is_some()
    }

    /// Effective config for a user: profile-settings credentials take
    /// precedence over environment values (the Node API's
    /// loadConnectionParams — `user.settings.X || globalConfig.X`).
    pub fn with_user_settings(
        &self,
        settings: Option<&crate::models::JsonUserSettings>,
    ) -> AppConfig {
        let mut config = self.clone();
        let Some(settings) = settings else {
            return config;
        };

        fn merge(target: &mut Option<String>, value: &Option<String>) {
            if let Some(value) = value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
                *target = Some(value.to_string());
            }
        }

        merge(&mut config.openai_api_key, &settings.openai_api_key);

        merge(&mut config.yandex_api_key, &settings.yandex_fm_api_key);
        merge(
            &mut config.yandex_folder_id,
            &settings.yandex_fm_api_folder_id,
        );

        merge(&mut config.aws_bedrock_region, &settings.aws_bedrock_region);
        merge(
            &mut config.aws_bedrock_profile_name,
            &settings.aws_bedrock_profile,
        );
        merge(
            &mut config.aws_bedrock_access_key_id,
            &settings.aws_bedrock_access_key_id,
        );
        merge(
            &mut config.aws_bedrock_secret_access_key,
            &settings.aws_bedrock_secret_access_key,
        );

        merge(&mut config.s3_endpoint, &settings.s3_endpoint);
        merge(&mut config.s3_region, &settings.s3_region);
        merge(&mut config.s3_access_key_id, &settings.s3_access_key_id);
        merge(
            &mut config.s3_secret_access_key,
            &settings.s3_secret_access_key,
        );
        merge(&mut config.s3_bucket, &settings.s3_files_bucket_name);

        config
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::JsonUserSettings;

    #[test]
    fn user_settings_override_env_credentials() {
        let mut config = AppConfig::from_env();
        config.openai_api_key = Some("env-key".to_string());
        config.yandex_api_key = Some("env-yandex".to_string());
        config.s3_bucket = Some("env-bucket".to_string());

        let settings = JsonUserSettings {
            openai_api_key: Some("user-key".to_string()),
            yandex_fm_api_key: Some("  ".to_string()), // blank → keep env
            s3_files_bucket_name: Some("user-bucket".to_string()),
            ..JsonUserSettings::default()
        };

        let merged = config.with_user_settings(Some(&settings));
        assert_eq!(merged.openai_api_key.as_deref(), Some("user-key"));
        assert_eq!(merged.yandex_api_key.as_deref(), Some("env-yandex"));
        assert_eq!(merged.s3_bucket.as_deref(), Some("user-bucket"));

        // no settings → unchanged
        let unchanged = config.with_user_settings(None);
        assert_eq!(unchanged.openai_api_key.as_deref(), Some("env-key"));
    }
}
