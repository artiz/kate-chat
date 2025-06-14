use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub database_url: String,
    pub jwt_secret: String,
    pub session_secret: String,
    pub port: u16,
    pub cors_origin: Option<String>,
    
    // AWS Configuration
    pub aws_region: Option<String>,
    pub aws_access_key_id: Option<String>,
    pub aws_secret_access_key: Option<String>,
    
    // OAuth Configuration
    pub google_client_id: Option<String>,
    pub google_client_secret: Option<String>,
    pub github_client_id: Option<String>,
    pub github_client_secret: Option<String>,
    
    // S3 Configuration
    pub s3_bucket: Option<String>,
    pub s3_region: Option<String>,
    
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
            cors_origin: env::var("CORS_ORIGIN").ok(),
            
            // AWS
            aws_region: env::var("AWS_REGION").ok(),
            aws_access_key_id: env::var("AWS_ACCESS_KEY_ID").ok(),
            aws_secret_access_key: env::var("AWS_SECRET_ACCESS_KEY").ok(),

            // OpenAI
            openai_api_key: env::var("OPENAI_API_KEY").ok(),
            
            // Yandex
            yandex_api_key: env::var("YANDEX_API_KEY").ok(),
            yandex_folder_id: env::var("YANDEX_FOLDER_ID").ok(),
            
            // OAuth
            google_client_id: env::var("GOOGLE_CLIENT_ID").ok(),
            google_client_secret: env::var("GOOGLE_CLIENT_SECRET").ok(),
            github_client_id: env::var("GITHUB_CLIENT_ID").ok(),
            github_client_secret: env::var("GITHUB_CLIENT_SECRET").ok(),
            
            // S3
            s3_bucket: env::var("S3_BUCKET").ok(),
            s3_region: env::var("S3_REGION").ok(),
            
            // Demo mode
            demo_mode: env::var("DEMO_MODE").unwrap_or_else(|_| "false".to_string()) == "true",
            demo_max_chat_messages: env::var("DEMO_MAX_CHAT_MESSAGES").ok().and_then(|s| s.parse().ok()),
            demo_max_chats: env::var("DEMO_MAX_CHATS").ok().and_then(|s| s.parse().ok()),
            demo_max_images: env::var("DEMO_MAX_IMAGES").ok().and_then(|s| s.parse().ok()),
            
        }
    }
}
