//! Custom REST API provider: user-defined models speaking the OpenAI
//! chat-completions protocol against an arbitrary endpoint (Ollama, DeepSeek,
//! vLLM, …). Endpoint, API key and the provider-side model name live in the
//! model row's `custom_settings` JSON — mirroring the Node API's
//! `CustomRestApiProvider`.

use async_trait::async_trait;
use chrono::DateTime;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

use crate::models::model::{CustomModelSettings, Model};
use crate::services::ai::*;
use crate::services::openai_protocol::OpenAIProtocol;
use crate::utils::errors::AppError;

/// Custom model protocols (subset of the Node API's `CustomModelProtocol`;
/// the Responses API and Bedrock-custom variants are not ported yet).
pub const PROTOCOL_OPENAI_CHAT_COMPLETIONS: &str = "OPENAI_CHAT_COMPLETIONS";

pub struct CustomService {
    protocol: OpenAIProtocol,
}

impl CustomService {
    pub fn for_model(model: &Model) -> Result<Self, AppError> {
        let settings: CustomModelSettings = model
            .custom_settings
            .as_ref()
            .and_then(|s| serde_json::from_str(s).ok())
            .ok_or_else(|| {
                AppError::BadRequest(format!(
                    "Custom model {} has no custom settings",
                    model.model_id
                ))
            })?;
        Self::from_settings(&settings)
    }

    pub fn from_settings(settings: &CustomModelSettings) -> Result<Self, AppError> {
        let endpoint = settings
            .endpoint
            .clone()
            .filter(|e| !e.is_empty())
            .ok_or_else(|| {
                AppError::BadRequest("Endpoint URL is required for a custom model".to_string())
            })?;

        if let Some(protocol) = settings.protocol.as_deref() {
            if protocol != PROTOCOL_OPENAI_CHAT_COMPLETIONS {
                return Err(AppError::BadRequest(format!(
                    "Unsupported custom model protocol: {} (only {} is supported)",
                    protocol, PROTOCOL_OPENAI_CHAT_COMPLETIONS
                )));
            }
        }

        Ok(Self {
            protocol: OpenAIProtocol::new(
                endpoint,
                settings.api_key.clone().filter(|k| !k.is_empty()),
                settings.model_name.clone().filter(|m| !m.is_empty()),
                "Custom model",
            ),
        })
    }
}

#[async_trait]
impl AIProviderService for CustomService {
    async fn invoke_model(&self, request: InvokeModelRequest) -> Result<ModelResponse, AppError> {
        self.protocol.invoke(&request).await
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
        self.protocol.invoke_stream(&request, &callbacks).await
    }

    // Custom models are user-created DB rows — nothing to fetch dynamically.
    async fn get_models(&self) -> Result<HashMap<String, AIModelInfo>, AppError> {
        Ok(HashMap::new())
    }

    async fn get_info(&self, _test_connection: bool) -> Result<ProviderInfo, AppError> {
        Ok(ProviderInfo {
            id: "CUSTOM_REST_API".to_string(),
            name: "Custom REST API".to_string(),
            is_connected: true,
            costs_info_available: false,
            details: HashMap::new(),
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
            error: Some("Cost information is not available for custom REST API".to_string()),
        })
    }

    async fn generate_images(
        &self,
        request: GenerateImagesRequest,
    ) -> Result<Vec<GeneratedImage>, AppError> {
        self.protocol
            .generate_images(&request.model_id, &request.prompt, request.count)
            .await
    }

    async fn get_embeddings(&self, model_id: &str, input: &str) -> Result<Vec<f32>, AppError> {
        let (embedding, _) = self.protocol.get_embeddings(model_id, input).await?;
        Ok(embedding)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(endpoint: Option<&str>, protocol: Option<&str>) -> CustomModelSettings {
        CustomModelSettings {
            endpoint: endpoint.map(|s| s.to_string()),
            api_key: Some("sk-test".to_string()),
            model_name: Some("llama3".to_string()),
            protocol: protocol.map(|s| s.to_string()),
        }
    }

    #[test]
    fn requires_endpoint() {
        assert!(CustomService::from_settings(&settings(None, None)).is_err());
        assert!(CustomService::from_settings(&settings(Some(""), None)).is_err());
    }

    #[test]
    fn accepts_chat_completions_protocol() {
        let s = settings(
            Some("http://localhost:11434/v1"),
            Some(PROTOCOL_OPENAI_CHAT_COMPLETIONS),
        );
        assert!(CustomService::from_settings(&s).is_ok());
    }

    #[test]
    fn rejects_unknown_protocol() {
        let s = settings(Some("http://localhost:11434/v1"), Some("OPENAI_RESPONSES"));
        assert!(CustomService::from_settings(&s).is_err());
    }
}
