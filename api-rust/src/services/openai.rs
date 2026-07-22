//! OpenAI provider — a thin wrapper over the shared OpenAI protocol client
//! (`openai_protocol.rs`), plus OpenAI-specific model listing/classification.

use async_trait::async_trait;
use chrono::DateTime;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

use crate::config::AppConfig;
use crate::services::ai::*;
use crate::services::openai_protocol::OpenAIProtocol;
use crate::utils::errors::AppError;

const OPENAI_API_URL: &str = "https://api.openai.com/v1";

/// Model-id prefixes for images-generation models (mirrors the Node API's
/// `OPENAI_MODELS_IMAGES_GENERATION`).
const IMAGES_GENERATION_PREFIXES: &[&str] = &["dall-e", "chatgpt-image", "gpt-image"];
/// Chat-model prefixes that accept image input.
const IMAGE_INPUT_PREFIXES: &[&str] = &["gpt-4o", "gpt-4.1", "gpt-4-turbo", "gpt-5", "o3", "o4"];

pub struct OpenAIService {
    config: AppConfig,
}

impl OpenAIService {
    pub fn new(config: AppConfig) -> Self {
        Self { config }
    }

    fn protocol(&self) -> Result<OpenAIProtocol, AppError> {
        let api_key = self
            .config
            .openai_api_key
            .clone()
            .ok_or_else(|| AppError::Auth("OpenAI API key not configured".to_string()))?;
        Ok(OpenAIProtocol::new(
            OPENAI_API_URL,
            Some(api_key),
            None,
            "OpenAI",
        ))
    }

    pub fn classify_model(model_id: &str) -> Option<(&'static str, bool, bool)> {
        // → (type, streaming, image_input)
        if IMAGES_GENERATION_PREFIXES
            .iter()
            .any(|p| model_id.starts_with(p))
        {
            return Some(("image_generation", false, false));
        }
        if model_id.starts_with("text-embedding") {
            return Some(("embedding", false, false));
        }
        if model_id.contains("gpt") || model_id.starts_with("o1") || model_id.starts_with("o3") {
            // exclude non-chat specializations kept out of the chat list
            for skip in [
                "instruct",
                "realtime",
                "audio",
                "tts",
                "transcribe",
                "search",
            ] {
                if model_id.contains(skip) {
                    return None;
                }
            }
            let image_input = IMAGE_INPUT_PREFIXES.iter().any(|p| model_id.starts_with(p))
                || model_id.contains("vision");
            return Some(("chat", true, image_input));
        }
        None
    }
}

#[async_trait]
impl AIProviderService for OpenAIService {
    async fn invoke_model(&self, request: InvokeModelRequest) -> Result<ModelResponse, AppError> {
        self.protocol()?.invoke(&request).await
    }

    async fn invoke_model_stream<F, C, E>(
        &self,
        request: InvokeModelRequest,
        callbacks: StreamCallbacks<F, C, E>,
    ) -> Result<(), AppError>
    where
        F: Fn(String) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
        C: Fn(String) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
        E: Fn(AppError) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
    {
        self.protocol()?.invoke_stream(&request, &callbacks).await
    }

    async fn get_models(&self) -> Result<HashMap<String, AIModelInfo>, AppError> {
        let protocol = self.protocol()?;
        let ids = match protocol.list_model_ids().await {
            Ok(ids) => ids,
            Err(_) => return Ok(HashMap::new()),
        };

        let mut models = HashMap::new();
        for id in ids {
            if let Some((type_, streaming, image_input)) = Self::classify_model(&id) {
                models.insert(
                    id.clone(),
                    AIModelInfo {
                        api_provider: ApiProvider::OpenAi,
                        provider: Some("OpenAI".to_string()),
                        name: id.clone(),
                        description: format!("OpenAI {}", id),
                        type_: type_.to_string(),
                        streaming,
                        image_input,
                    },
                );
            }
        }

        Ok(models)
    }

    async fn get_info(&self, test_connection: bool) -> Result<ProviderInfo, AppError> {
        let mut details = HashMap::new();
        let is_connected = self.config.openai_api_key.is_some();

        details.insert("configured".to_string(), is_connected.to_string());

        if test_connection && is_connected {
            match self.get_models().await {
                Ok(_) => {
                    details.insert("connection_test".to_string(), "success".to_string());
                }
                Err(e) => {
                    details.insert("connection_test".to_string(), "failed".to_string());
                    details.insert("error".to_string(), e.to_string());
                }
            }
        }

        Ok(ProviderInfo {
            id: "OPEN_AI".to_string(),
            name: "OpenAI".to_string(),
            is_connected,
            costs_info_available: false,
            details,
        })
    }

    async fn get_costs(
        &self,
        start_time: i64,
        end_time: Option<i64>,
    ) -> Result<UsageCostInfo, AppError> {
        Ok(UsageCostInfo {
            start: DateTime::from_timestamp(start_time, 0).unwrap_or_default(),
            end: end_time.and_then(|t| DateTime::from_timestamp(t, 0)),
            costs: vec![],
            error: Some("Cost information not available for OpenAI".to_string()),
        })
    }

    async fn generate_images(
        &self,
        request: GenerateImagesRequest,
    ) -> Result<Vec<GeneratedImage>, AppError> {
        self.protocol()?
            .generate_images(&request.model_id, &request.prompt, request.count)
            .await
    }

    async fn get_embeddings(&self, model_id: &str, input: &str) -> Result<Vec<f32>, AppError> {
        let (embedding, _) = self.protocol()?.get_embeddings(model_id, input).await?;
        Ok(embedding)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_image_generation_models() {
        assert_eq!(
            OpenAIService::classify_model("dall-e-3"),
            Some(("image_generation", false, false))
        );
        assert_eq!(
            OpenAIService::classify_model("gpt-image-1"),
            Some(("image_generation", false, false))
        );
    }

    #[test]
    fn classifies_embeddings_models() {
        assert_eq!(
            OpenAIService::classify_model("text-embedding-3-small"),
            Some(("embedding", false, false))
        );
    }

    #[test]
    fn classifies_chat_models_with_image_input() {
        assert_eq!(
            OpenAIService::classify_model("gpt-4o"),
            Some(("chat", true, true))
        );
        assert_eq!(
            OpenAIService::classify_model("gpt-3.5-turbo"),
            Some(("chat", true, false))
        );
    }

    #[test]
    fn skips_non_chat_specializations() {
        assert_eq!(
            OpenAIService::classify_model("gpt-4o-realtime-preview"),
            None
        );
        assert_eq!(OpenAIService::classify_model("gpt-4o-audio-preview"), None);
        assert_eq!(OpenAIService::classify_model("whisper-1"), None);
        assert_eq!(OpenAIService::classify_model("tts-1"), None);
    }
}
