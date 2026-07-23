//! Yandex Foundation Models provider, routed through Yandex's
//! OpenAI-compatible endpoint (`https://ai.api.cloud.yandex.net/v1`) via the
//! shared protocol client — real SSE streaming instead of the previous
//! word-by-word simulation over the legacy `foundationModels/v1/completion`
//! API. Mirrors the Node API's Yandex provider.

use async_trait::async_trait;
use chrono::DateTime;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

use crate::config::AppConfig;
use crate::services::ai::*;
use crate::services::openai_protocol::OpenAIProtocol;
use crate::utils::errors::AppError;

const YANDEX_OPENAI_API_URL: &str = "https://ai.api.cloud.yandex.net/v1";

pub struct YandexService {
    config: AppConfig,
}

impl YandexService {
    pub fn new(config: AppConfig) -> Self {
        Self { config }
    }

    fn get_api_key(&self) -> Result<&str, AppError> {
        self.config
            .yandex_api_key
            .as_deref()
            .ok_or_else(|| AppError::Auth("Yandex API key not configured".to_string()))
    }

    fn get_folder_id(&self) -> Result<&str, AppError> {
        self.config
            .yandex_folder_id
            .as_deref()
            .ok_or_else(|| AppError::Auth("Yandex folder ID not configured".to_string()))
    }

    fn protocol(&self) -> Result<OpenAIProtocol, AppError> {
        let api_key = self.get_api_key()?;
        // Node parity: API keys (AQVN…) authenticate with the `Api-Key`
        // scheme; only IAM tokens (t1…) use `Bearer`.
        let auth_header = if api_key.starts_with("t1") {
            format!("Bearer {}", api_key)
        } else {
            format!("Api-Key {}", api_key)
        };
        let base_url = self
            .config
            .yandex_openai_api_url
            .clone()
            .unwrap_or_else(|| YANDEX_OPENAI_API_URL.to_string());
        Ok(OpenAIProtocol::new(base_url, None, None, "Yandex").with_auth_header(auth_header))
    }

    /// Model ids are stored with a `{folder}` placeholder
    /// (`gpt://{folder}/yandexgpt/latest`) resolved with the configured
    /// folder at request time — same scheme as the Node API.
    fn resolve_model_uri(&self, model_id: &str) -> Result<String, AppError> {
        let folder_id = self.get_folder_id()?;
        if model_id.contains("{folder}") {
            return Ok(model_id.replace("{folder}", folder_id));
        }
        if model_id.starts_with("gpt://") {
            return Ok(model_id.to_string());
        }
        // bare model name (legacy rows) → full model URI
        Ok(format!("gpt://{}/{}/latest", folder_id, model_id))
    }

    fn resolve_request(
        &self,
        mut request: InvokeModelRequest,
    ) -> Result<InvokeModelRequest, AppError> {
        request.model_id = self.resolve_model_uri(&request.model_id)?;
        Ok(request)
    }
}

#[async_trait]
impl AIProviderService for YandexService {
    async fn invoke_model(&self, request: InvokeModelRequest) -> Result<ModelResponse, AppError> {
        let request = self.resolve_request(request)?;
        self.protocol()?.invoke(&request).await
    }

    async fn invoke_model_stream<F, C, E>(
        &self,
        request: InvokeModelRequest,
        callbacks: StreamCallbacks<F, C, E>,
    ) -> Result<Vec<ExecutedToolCall>, AppError>
    where
        F: Fn(String) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
        C: Fn(String) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
        E: Fn(AppError) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
    {
        let request = self.resolve_request(request)?;
        self.protocol()?.invoke_stream(&request, &callbacks).await
    }

    async fn get_models(&self) -> Result<HashMap<String, AIModelInfo>, AppError> {
        // Yandex has no public models-listing API — hardcoded, like the Node API.
        let mut models = HashMap::new();

        for (id, name, description) in [
            (
                "gpt://{folder}/yandexgpt/latest",
                "YandexGPT Pro",
                "Yandex Foundation Model for text generation",
            ),
            (
                "gpt://{folder}/yandexgpt-lite/latest",
                "YandexGPT Lite",
                "Lightweight Yandex Foundation Model",
            ),
            (
                "gpt://{folder}/llama/latest",
                "Llama 3.3 70B (Yandex)",
                "Llama 3.3 hosted by Yandex Foundation Models",
            ),
        ] {
            models.insert(
                id.to_string(),
                AIModelInfo {
                    api_provider: ApiProvider::YandexAi,
                    provider: Some("Yandex".to_string()),
                    name: name.to_string(),
                    description: description.to_string(),
                    type_: "chat".to_string(),
                    streaming: true,
                    image_input: false,
                    max_input_tokens: None,
                },
            );
        }

        Ok(models)
    }

    async fn get_info(&self, test_connection: bool) -> Result<ProviderInfo, AppError> {
        let mut details = HashMap::new();

        let is_connected =
            self.config.yandex_api_key.is_some() && self.config.yandex_folder_id.is_some();

        details.insert("configured".to_string(), is_connected.to_string());

        if let Some(folder_id) = &self.config.yandex_folder_id {
            details.insert("folder_id".to_string(), folder_id.clone());
        }

        if test_connection && is_connected {
            let test_request = InvokeModelRequest {
                model_id: "gpt://{folder}/yandexgpt-lite/latest".to_string(),
                messages: vec![ModelMessage::text(MessageRole::User, "Hello")],
                temperature: Some(0.1),
                max_tokens: Some(10),
                top_p: None,
                system_prompt: None,
                tools: None,
            };

            match self.invoke_model(test_request).await {
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
            id: "YANDEX_AI".to_string(),
            name: "Yandex AI".to_string(),
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
            error: Some("Cost information not available for Yandex AI".to_string()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn service() -> YandexService {
        let mut config = AppConfig::from_env();
        config.yandex_api_key = Some("key".to_string());
        config.yandex_folder_id = Some("b1folder".to_string());
        YandexService::new(config)
    }

    #[test]
    fn resolves_folder_placeholder() {
        assert_eq!(
            service()
                .resolve_model_uri("gpt://{folder}/yandexgpt/latest")
                .unwrap(),
            "gpt://b1folder/yandexgpt/latest"
        );
    }

    #[test]
    fn keeps_full_model_uri() {
        assert_eq!(
            service()
                .resolve_model_uri("gpt://other/yandexgpt/rc")
                .unwrap(),
            "gpt://other/yandexgpt/rc"
        );
    }

    #[test]
    fn expands_legacy_bare_model_names() {
        assert_eq!(
            service().resolve_model_uri("yandexgpt-lite").unwrap(),
            "gpt://b1folder/yandexgpt-lite/latest"
        );
    }
}
