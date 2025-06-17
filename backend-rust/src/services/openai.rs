use async_trait::async_trait;
use reqwest::Client;
use serde_json::{json, Value};
use std::collections::HashMap;
use chrono::{DateTime};

use crate::config::AppConfig;
use crate::services::ai::*;
use crate::utils::errors::AppError;

#[allow(dead_code)]
pub struct OpenAIService {
    config: AppConfig,
    client: Client,
}

impl OpenAIService {
    pub fn new(config: AppConfig) -> Self {
        Self {
            config,
            client: Client::new(),
        }
    }

    fn get_api_key(&self) -> Result<&str, AppError> {
        self.config.openai_api_key.as_deref()
            .ok_or_else(|| AppError::Auth("OpenAI API key not configured".to_string()))
    }
}

#[async_trait]
impl AIProviderService for OpenAIService {
    async fn invoke_model(&self, request: InvokeModelRequest) -> Result<ModelResponse, AppError> {
        let api_key = self.get_api_key()?;
        
        let mut messages = Vec::new();
        
        if let Some(system_prompt) = &request.system_prompt {
            messages.push(json!({
                "role": "system",
                "content": system_prompt
            }));
        }

        for msg in &request.messages {
            let role = match msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::System => "system",
            };

            messages.push(json!({
                "role": role,
                "content": msg.content
            }));
        }

        let body = json!({
            "model": request.model_id,
            "messages": messages,
            "max_tokens": request.max_tokens.unwrap_or(4096),
            "temperature": request.temperature.unwrap_or(0.7),
            "top_p": request.top_p.unwrap_or(1.0)
        });

        let response = self.client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!("OpenAI API error: {}", error_text)));
        }

        let response_json: Value = response.json().await
            .map_err(|e| AppError::Internal(format!("Failed to parse OpenAI response: {}", e)))?;

        let content = response_json
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("message"))
            .and_then(|msg| msg.get("content"))
            .and_then(|content| content.as_str())
            .unwrap_or("")
            .to_string();

        let usage = response_json.get("usage").map(|u| Usage {
            input_tokens: u.get("prompt_tokens").and_then(|t| t.as_i64()).map(|t| t as i32),
            output_tokens: u.get("completion_tokens").and_then(|t| t.as_i64()).map(|t| t as i32),
            total_tokens: u.get("total_tokens").and_then(|t| t.as_i64()).map(|t| t as i32),
        });

        let finish_reason = response_json
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("finish_reason"))
            .and_then(|reason| reason.as_str())
            .map(|s| s.to_string());

        Ok(ModelResponse {
            content,
            model_id: request.model_id,
            usage,
            finish_reason,
        })
    }

    async fn invoke_model_stream<F, C, E>(
        &self,
        request: InvokeModelRequest,
        callbacks: StreamCallbacks<F, C, E>,
    ) -> Result<(), AppError>
    where
        F: Fn(String) + Send + Sync,
        C: Fn(String) + Send + Sync,
        E: Fn(AppError) + Send + Sync,
    {
        // TODO: Implement actual streaming for OpenAI
        // For now, simulate streaming
        match self.invoke_model(request).await {
            Ok(response) => {
                let words: Vec<&str> = response.content.split_whitespace().collect();
                for word in words {
                    (callbacks.on_token)(format!("{} ", word));
                    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                }
                (callbacks.on_complete)(response.content);
                Ok(())
            }
            Err(e) => {
                (callbacks.on_error)(e.clone());
                Err(e)
            }
        }
    }

    async fn get_models(&self) -> Result<HashMap<String, AIModelInfo>, AppError> {
        let api_key = self.get_api_key()?;
        
        let response = self.client
            .get("https://api.openai.com/v1/models")
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
            .map_err(|e| AppError::Http(e.to_string()))?;

        if !response.status().is_success() {
            return Ok(HashMap::new());
        }

        let response_json: Value = response.json().await
            .map_err(|e| AppError::Internal(format!("Failed to parse OpenAI models response: {}", e)))?;

        let mut models = HashMap::new();

        if let Some(data) = response_json.get("data").and_then(|d| d.as_array()) {
            for model in data {
                if let Some(id) = model.get("id").and_then(|id| id.as_str()) {
                    // Only include chat models
                    if id.contains("gpt") {
                        models.insert(id.to_string(), AIModelInfo {
                            api_provider: ApiProvider::OpenAi,
                            provider: Some("OpenAI".to_string()),
                            name: id.to_string(),
                            description: format!("OpenAI {}", id),
                            supports_streaming: true,
                            supports_text_in: true,
                            supports_text_out: true,
                            supports_image_in: id.contains("vision") || id.contains("4o"),
                            supports_image_out: false,
                            supports_embeddings_in: false,
                            supports_embeddings_out: false,
                        });
                    }
                }
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
            id: "open_ai".to_string(),
            name: "OpenAI".to_string(),
            is_connected,
            costs_info_available: false,
            details,
        })
    }

    async fn get_costs(&self, start_time: i64, end_time: Option<i64>) -> Result<UsageCostInfo, AppError> {
        Ok(UsageCostInfo {
            start: DateTime::from_timestamp(start_time, 0).unwrap_or_default(),
            end: end_time.and_then(|t| DateTime::from_timestamp(t, 0)),
            costs: vec![],
            error: Some("Cost information not available for OpenAI".to_string()),
        })
    }
}
