use async_trait::async_trait;
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

use crate::config::AppConfig;
use crate::services::ai::*;
use crate::utils::errors::AppError;

#[allow(dead_code)]
pub struct YandexService {
    config: AppConfig,
    client: Client,
}

impl YandexService {
    pub fn new(config: AppConfig) -> Self {
        Self {
            config,
            client: Client::new(),
        }
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
}

#[async_trait]
impl AIProviderService for YandexService {
    async fn invoke_model(&self, request: InvokeModelRequest) -> Result<ModelResponse, AppError> {
        let api_key = self.get_api_key()?;
        let folder_id = self.get_folder_id()?;

        let mut messages = Vec::new();

        for msg in &request.messages {
            let role = match msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::System => "system",
            };

            messages.push(json!({
                "role": role,
                "text": msg.content
            }));
        }

        let body = json!({
            "modelUri": format!("gpt://{}/{}", folder_id, request.model_id),
            "completionOptions": {
                "stream": false,
                "temperature": request.temperature.unwrap_or(0.7),
                "maxTokens": request.max_tokens.unwrap_or(4096)
            },
            "messages": messages
        });

        let response = self
            .client
            .post("https://llm.api.cloud.yandex.net/foundationModels/v1/completion")
            .header("Authorization", format!("Api-Key {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "Yandex API error: {}",
                error_text
            )));
        }

        let response_json: Value = response
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to parse Yandex response: {e}")))?;

        let content = response_json
            .get("result")
            .and_then(|r| r.get("alternatives"))
            .and_then(|a| a.as_array())
            .and_then(|arr| arr.first())
            .and_then(|alt| alt.get("message"))
            .and_then(|msg| msg.get("text"))
            .and_then(|text| text.as_str())
            .unwrap_or("")
            .to_string();

        let usage = response_json
            .get("result")
            .and_then(|r| r.get("usage"))
            .map(|u| Usage {
                input_tokens: u
                    .get("inputTextTokens")
                    .and_then(|t| t.as_i64())
                    .map(|t| t as i32),
                output_tokens: u
                    .get("completionTokens")
                    .and_then(|t| t.as_i64())
                    .map(|t| t as i32),
                total_tokens: u
                    .get("totalTokens")
                    .and_then(|t| t.as_i64())
                    .map(|t| t as i32),
            });

        Ok(ModelResponse {
            content,
            model_id: request.model_id,
            usage,
            finish_reason: None,
        })
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
        // IMPROVEMENT: Implement actual streaming for Yandex (still not supported by their API)
        // For now, simulate streaming
        match self.invoke_model(request).await {
            Ok(response) => {
                let words: Vec<&str> = response.content.split_whitespace().collect();
                for word in words {
                    (callbacks.on_token)(format!("{} ", word)).await;
                    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                }
                (callbacks.on_complete)(response.content).await;
                Ok(())
            }
            Err(e) => {
                (callbacks.on_error)(e.clone()).await;
                Err(e)
            }
        }
    }

    async fn get_models(&self) -> Result<HashMap<String, AIModelInfo>, AppError> {
        // Yandex Foundation Models - hardcoded list since they don't have a models API
        let mut models = HashMap::new();

        // YandexGPT models
        models.insert(
            "yandexgpt".to_string(),
            AIModelInfo {
                api_provider: ApiProvider::YandexFm,
                provider: Some("Yandex".to_string()),
                name: "YandexGPT".to_string(),
                description: "Yandex Foundation Model for text generation".to_string(),
                supports_streaming: true,
                supports_text_in: true,
                supports_text_out: true,
                supports_image_in: false,
                supports_image_out: false,
                supports_embeddings_in: false,
                supports_embeddings_out: false,
            },
        );

        models.insert(
            "yandexgpt-lite".to_string(),
            AIModelInfo {
                api_provider: ApiProvider::YandexFm,
                provider: Some("Yandex".to_string()),
                name: "YandexGPT Lite".to_string(),
                description: "Lightweight Yandex Foundation Model".to_string(),
                supports_streaming: true,
                supports_text_in: true,
                supports_text_out: true,
                supports_image_in: false,
                supports_image_out: false,
                supports_embeddings_in: false,
                supports_embeddings_out: false,
            },
        );

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
            // Test with a simple request
            let test_request = InvokeModelRequest {
                model_id: "yandexgpt-lite".to_string(),
                messages: vec![ModelMessage {
                    role: MessageRole::User,
                    content: "Hello".to_string(),
                    timestamp: Some(Utc::now()),
                }],
                temperature: Some(0.1),
                max_tokens: Some(10),
                top_p: None,
                system_prompt: None,
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
            id: "yandex_fm".to_string(),
            name: "Yandex Foundation Models".to_string(),
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
            error: Some("Cost information not available for Yandex FM".to_string()),
        })
    }
}
