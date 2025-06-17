use async_trait::async_trait;
use aws_config::{BehaviorVersion, Region};
use aws_sdk_bedrockruntime::{Client as BedrockRuntimeClient, primitives::Blob};
use aws_sdk_bedrock::{Client as BedrockClient, types::ModelModality};
use serde_json::Value;
use std::collections::HashMap;
use chrono::{DateTime};

use crate::config::AppConfig;
use crate::services::ai::*;
use crate::utils::errors::AppError;
// TODO: Uncomment the following imports and use providers
// use crate::services::bedrock::providers::{
//     anthropic::AnthropicProvider,
//     amazon::AmazonProvider,
//     ai21::AI21Provider,
//     cohere::CohereProvider,
//     meta::MetaProvider,
//     mistral::MistralProvider,
// };

#[allow(dead_code)]
pub struct BedrockService {
    config: AppConfig,
    runtime_client: Option<BedrockRuntimeClient>,
    bedrock_client: Option<BedrockClient>,
}

impl BedrockService {
    pub fn new(config: AppConfig) -> Self {
        Self {
            config,
            runtime_client: None,
            bedrock_client: None,
        }
    }

    async fn get_runtime_client(&mut self) -> Result<&BedrockRuntimeClient, AppError> {
        if self.runtime_client.is_none() {
            let aws_config = self.build_aws_config().await?;
            self.runtime_client = Some(BedrockRuntimeClient::new(&aws_config));
        }
        Ok(self.runtime_client.as_ref().unwrap())
    }

    async fn get_bedrock_client(&mut self) -> Result<&BedrockClient, AppError> {
        if self.bedrock_client.is_none() {
            let aws_config = self.build_aws_config().await?;
            self.bedrock_client = Some(BedrockClient::new(&aws_config));
        }
        Ok(self.bedrock_client.as_ref().unwrap())
    }

    async fn build_aws_config(&self) -> Result<aws_config::SdkConfig, AppError> {
        let mut config_builder = aws_config::defaults(BehaviorVersion::v2025_01_17());

        if let Some(region) = &self.config.aws_region {
            config_builder = config_builder.region(Region::new(region.clone()));
        }

        if let (Some(access_key), Some(secret_key)) = 
            (&self.config.aws_access_key_id, &self.config.aws_secret_access_key) {
            let credentials = aws_sdk_bedrockruntime::config::Credentials::new(
                access_key,
                secret_key,
                None,
                None,
                "kate-chat"
            );
            config_builder = config_builder.credentials_provider(credentials);
        }

        Ok(config_builder.load().await)
    }

    fn get_model_provider(&self, model_id: &str) -> String {
        if model_id.starts_with("us.") || model_id.starts_with("eu.") || model_id.starts_with("ap.") {
            model_id.split('.').nth(1).unwrap_or("unknown").to_string()
        } else {
            model_id.split('.').next().unwrap_or("unknown").to_string()
        }
    }

    fn format_anthropic_request(&self, request: &InvokeModelRequest) -> Result<Value, AppError> {
        let mut messages = Vec::new();
        let mut system_message = request.system_prompt.clone();

        for msg in &request.messages {
            let role = match msg.role {
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::System => {
                    system_message = Some(msg.content.clone());
                    continue;
                }
            };

            messages.push(serde_json::json!({
                "role": role,
                "content": msg.content
            }));
        }

        let mut body = serde_json::json!({
            "messages": messages,
            "max_tokens": request.max_tokens.unwrap_or(4096),
            "anthropic_version": "bedrock-2023-05-31"
        });

        if let Some(temp) = request.temperature {
            body["temperature"] = temp.into();
        }

        if let Some(top_p) = request.top_p {
            body["top_p"] = top_p.into();
        }

        if let Some(system) = system_message {
            body["system"] = system.into();
        }

        Ok(body)
    }

    fn format_amazon_request(&self, request: &InvokeModelRequest) -> Result<Value, AppError> {
        let mut input_text = String::new();

        if let Some(system) = &request.system_prompt {
            input_text.push_str(&format!("System: {}\n\n", system));
        }

        for msg in &request.messages {
            match msg.role {
                MessageRole::User => input_text.push_str(&format!("Human: {}\n\n", msg.content)),
                MessageRole::Assistant => input_text.push_str(&format!("Assistant: {}\n\n", msg.content)),
                MessageRole::System => input_text.push_str(&format!("System: {}\n\n", msg.content)),
            }
        }

        input_text.push_str("Assistant:");

        let body = serde_json::json!({
            "inputText": input_text,
            "textGenerationConfig": {
                "maxTokenCount": request.max_tokens.unwrap_or(4096),
                "temperature": request.temperature.unwrap_or(0.7),
                "topP": request.top_p.unwrap_or(0.9)
            }
        });

        Ok(body)
    }

    fn parse_anthropic_response(&self, response: Value, model_id: &str) -> Result<ModelResponse, AppError> {
        let content = response
            .get("content")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|item| item.get("text"))
            .and_then(|text| text.as_str())
            .unwrap_or("")
            .to_string();

        let usage = response.get("usage").map(|u| Usage {
            input_tokens: u.get("input_tokens").and_then(|t| t.as_i64()).map(|t| t as i32),
            output_tokens: u.get("output_tokens").and_then(|t| t.as_i64()).map(|t| t as i32),
            total_tokens: None,
        });

        Ok(ModelResponse {
            content,
            model_id: model_id.to_string(),
            usage,
            finish_reason: response.get("stop_reason").and_then(|r| r.as_str()).map(|s| s.to_string()),
        })
    }

    fn parse_amazon_response(&self, response: Value, model_id: &str) -> Result<ModelResponse, AppError> {
        let content = response
            .get("results")
            .and_then(|r| r.as_array())
            .and_then(|arr| arr.first())
            .and_then(|item| item.get("outputText"))
            .and_then(|text| text.as_str())
            .unwrap_or("")
            .to_string();

        Ok(ModelResponse {
            content,
            model_id: model_id.to_string(),
            usage: None,
            finish_reason: None,
        })
    }

    fn format_ai21_request(&self, request: &InvokeModelRequest) -> Result<Value, AppError> {
        let messages = request.messages.iter().map(|msg| {
            serde_json::json!({
                "role": match msg.role {
                    MessageRole::User => "user",
                    MessageRole::Assistant => "assistant",
                    MessageRole::System => "system",
                },
                "text": msg.content
            })
        }).collect::<Vec<_>>();

        let body = serde_json::json!({
            "messages": messages,
            "maxTokens": request.max_tokens.unwrap_or(4096),
            "temperature": request.temperature.unwrap_or(0.7),
            "topP": request.top_p.unwrap_or(0.9),
            "system": request.system_prompt
        });

        Ok(body)
    }

    fn parse_ai21_response(&self, response: Value, model_id: &str) -> Result<ModelResponse, AppError> {
        let content = response
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("message"))
            .and_then(|msg| msg.get("content"))
            .and_then(|text| text.as_str())
            .unwrap_or("")
            .to_string();

        let usage = response.get("usage").map(|u| Usage {
            input_tokens: u.get("promptTokens").and_then(|t| t.as_i64()).map(|t| t as i32),
            output_tokens: u.get("completionTokens").and_then(|t| t.as_i64()).map(|t| t as i32),
            total_tokens: u.get("totalTokens").and_then(|t| t.as_i64()).map(|t| t as i32),
        });

        Ok(ModelResponse {
            content,
            model_id: model_id.to_string(),
            usage,
            finish_reason: response
                .get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|choice| choice.get("finishReason"))
                .and_then(|r| r.as_str())
                .map(|s| s.to_string()),
        })
    }

    fn format_cohere_request(&self, request: &InvokeModelRequest) -> Result<Value, AppError> {
        let mut chat_history = Vec::new();
        let mut current_message = String::new();

        for (i, msg) in request.messages.iter().enumerate() {
            if i == request.messages.len() - 1 && msg.role == MessageRole::User {
                current_message = msg.content.clone();
            } else {
                let role = match msg.role {
                    MessageRole::Assistant => "CHATBOT",
                    MessageRole::System => "SYSTEM",
                    _ => "USER",
                };
                chat_history.push(serde_json::json!({
                    "role": role,
                    "content": msg.content
                }));
            }
        }

        let body = serde_json::json!({
            "message": current_message,
            "chatHistory": chat_history,
            "maxTokens": request.max_tokens.unwrap_or(4096),
            "temperature": request.temperature.unwrap_or(0.7),
            "p": request.top_p.unwrap_or(0.9),
            "preamble": request.system_prompt
        });

        Ok(body)
    }

    fn parse_cohere_response(&self, response: Value, model_id: &str) -> Result<ModelResponse, AppError> {
        let content = response
            .get("text")
            .and_then(|text| text.as_str())
            .unwrap_or("")
            .to_string();

        let usage = response.get("usage").map(|u| Usage {
            input_tokens: u.get("inputTokens").and_then(|t| t.as_i64()).map(|t| t as i32),
            output_tokens: u.get("outputTokens").and_then(|t| t.as_i64()).map(|t| t as i32),
            total_tokens: None,
        });

        Ok(ModelResponse {
            content,
            model_id: model_id.to_string(),
            usage,
            finish_reason: response.get("finishReason").and_then(|r| r.as_str()).map(|s| s.to_string()),
        })
    }

    fn format_meta_request(&self, request: &InvokeModelRequest) -> Result<Value, AppError> {
        let mut prompt = String::new();

        if let Some(system) = &request.system_prompt {
            prompt.push_str(&format!("<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{}<|eot_id|>", system));
        } else {
            prompt.push_str("<|begin_of_text|>");
        }

        for msg in &request.messages {
            let role = match msg.role {
                MessageRole::Assistant => "assistant",
                MessageRole::System => "system",
                _ => "user",
            };
            prompt.push_str(&format!(
                "<|start_header_id|>{}<|end_header_id|>\n\n{}<|eot_id|>",
                role, msg.content
            ));
        }

        prompt.push_str("<|start_header_id|>assistant<|end_header_id|>\n\n");

        let body = serde_json::json!({
            "prompt": prompt,
            "max_gen_len": request.max_tokens.unwrap_or(4096),
            "temperature": request.temperature.unwrap_or(0.7),
            "top_p": request.top_p.unwrap_or(0.9)
        });

        Ok(body)
    }

    fn parse_meta_response(&self, response: Value, model_id: &str) -> Result<ModelResponse, AppError> {
        let content = response
            .get("generation")
            .and_then(|text| text.as_str())
            .unwrap_or("")
            .to_string();

        Ok(ModelResponse {
            content,
            model_id: model_id.to_string(),
            usage: Some(Usage {
                input_tokens: response.get("prompt_token_count").and_then(|t| t.as_i64()).map(|t| t as i32),
                output_tokens: response.get("generation_token_count").and_then(|t| t.as_i64()).map(|t| t as i32),
                total_tokens: None,
            }),
            finish_reason: response.get("stop_reason").and_then(|r| r.as_str()).map(|s| s.to_string()),
        })
    }

    fn format_mistral_request(&self, request: &InvokeModelRequest) -> Result<Value, AppError> {
        let messages = request.messages.iter().map(|msg| {
            serde_json::json!({
                "role": match msg.role {
                    MessageRole::Assistant => "assistant",
                    MessageRole::System => "system",
                    _ => "user",
                },
                "content": msg.content
            })
        }).collect::<Vec<_>>();

        let body = serde_json::json!({
            "messages": messages,
            "max_tokens": request.max_tokens.unwrap_or(4096),
            "temperature": request.temperature.unwrap_or(0.7),
            "top_p": request.top_p.unwrap_or(0.9)
        });

        Ok(body)
    }

    fn parse_mistral_response(&self, response: Value, model_id: &str) -> Result<ModelResponse, AppError> {
        let content = response
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("message"))
            .and_then(|msg| msg.get("content"))
            .and_then(|text| text.as_str())
            .unwrap_or("")
            .to_string();

        let usage = response.get("usage").map(|u| Usage {
            input_tokens: u.get("prompt_tokens").and_then(|t| t.as_i64()).map(|t| t as i32),
            output_tokens: u.get("completion_tokens").and_then(|t| t.as_i64()).map(|t| t as i32),
            total_tokens: u.get("total_tokens").and_then(|t| t.as_i64()).map(|t| t as i32),
        });

        Ok(ModelResponse {
            content,
            model_id: model_id.to_string(),
            usage,
            finish_reason: response
                .get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|choice| choice.get("finish_reason"))
                .and_then(|r| r.as_str())
                .map(|s| s.to_string()),
        })
    }
}

#[async_trait]
impl AIProviderService for BedrockService {
    async fn invoke_model(&self, request: InvokeModelRequest) -> Result<ModelResponse, AppError> {
        let mut service = self.clone();
        let client = service.get_runtime_client().await?;
        
        let provider = self.get_model_provider(&request.model_id);
        
        let body = match provider.as_str() {
            "anthropic" => self.format_anthropic_request(&request)?,
            "amazon" => self.format_amazon_request(&request)?,
            "ai21" => self.format_ai21_request(&request)?,
            "cohere" => self.format_cohere_request(&request)?,
            "meta" => self.format_meta_request(&request)?,
            "mistral" => self.format_mistral_request(&request)?,
            _ => return Err(AppError::Validation(format!("Unsupported provider: {}", provider))),
        };

        let body_bytes = serde_json::to_vec(&body)
            .map_err(|e| AppError::Internal(format!("Failed to serialize request: {}", e)))?;

        let response = client
            .invoke_model()
            .model_id(&request.model_id)
            .body(Blob::new(body_bytes))
            .send()
            .await
            .map_err(|e| AppError::Aws(format!("Bedrock invoke failed: {}", e)))?;

        let response_body = response.body().as_ref();
        let response_json: Value = serde_json::from_slice(response_body)
            .map_err(|e| AppError::Internal(format!("Failed to parse response: {}", e)))?;

        match provider.as_str() {
            "anthropic" => self.parse_anthropic_response(response_json, &request.model_id),
            "amazon" => self.parse_amazon_response(response_json, &request.model_id),
            "ai21" => self.parse_ai21_response(response_json, &request.model_id),
            "cohere" => self.parse_cohere_response(response_json, &request.model_id),
            "meta" => self.parse_meta_response(response_json, &request.model_id),
            "mistral" => self.parse_mistral_response(response_json, &request.model_id),
            _ => Err(AppError::Validation(format!("Unsupported provider: {}", provider))),
        }
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
        // For now, simulate streaming by calling the regular invoke and chunking the response
        match self.invoke_model(request).await {
            Ok(response) => {
                // Simulate streaming by sending chunks
                let words: Vec<&str> = response.content.split_whitespace().collect();
                for word in words {
                    (callbacks.on_token)(format!("{} ", word));
                    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
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
        let mut service = self.clone();
        let client = service.get_bedrock_client().await?;
        
        let response = client
            .list_foundation_models()
            .send()
            .await
            .map_err(|e| AppError::Aws(format!("Failed to list models: {}", e)))?;

        let mut models = HashMap::new();

        for model in response.model_summaries() {
            if let (model_id, Some(model_name), Some(provider_name)) = 
                    (model.model_id(), model.model_name(), model.provider_name()) {
                    let supports_streaming = model.response_streaming_supported().unwrap_or(false);
                    

                    let supports_text_in = model.input_modalities()
                        .iter().any(|mod_type| *mod_type == ModelModality::Text);
                    let supports_image_in = model.input_modalities()
                        .iter().any(|mod_type| *mod_type == ModelModality::Image);
                    let supports_text_out = model.output_modalities()
                        .iter().any(|mod_type| *mod_type == ModelModality::Text);
                    let supports_image_out = model.output_modalities()
                        .iter().any(|mod_type| *mod_type == ModelModality::Image);

                    models.insert(model_id.to_string(), AIModelInfo {
                        api_provider: ApiProvider::AwsBedrock,
                        provider: Some(provider_name.to_string()),
                        name: model_name.to_string(),
                        description: format!("{} by {}", model_name, provider_name),
                        supports_streaming,
                        supports_text_in,
                        supports_text_out,
                        supports_image_in,
                        supports_image_out,
                        supports_embeddings_in: false,
                        supports_embeddings_out: false,
                    });
            }
        }

        Ok(models)
    }

    async fn get_info(&self, test_connection: bool) -> Result<ProviderInfo, AppError> {
        let mut details = HashMap::new();
        details.insert("configured".to_string(), "true".to_string());

        if let Some(region) = &self.config.aws_region {
            details.insert("region".to_string(), region.clone());
        }

        let is_connected = self.config.aws_access_key_id.is_some() || 
                          std::env::var("AWS_PROFILE").is_ok();

        if test_connection && is_connected {
            let mut service = self.clone();
            match service.get_bedrock_client().await {
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
            id: "aws_bedrock".to_string(),
            name: "AWS Bedrock".to_string(),
            is_connected,
            costs_info_available: is_connected,
            details,
        })
    }

    async fn get_costs(&self, start_time: i64, end_time: Option<i64>) -> Result<UsageCostInfo, AppError> {
        // TODO: Implement AWS Cost Explorer integration
        Ok(UsageCostInfo {
            start: DateTime::from_timestamp(start_time, 0).unwrap_or_default(),
            end: end_time.and_then(|t| DateTime::from_timestamp(t, 0)),
            costs: vec![],
            error: Some("Cost information not yet implemented".to_string()),
        })
    }
}

impl Clone for BedrockService {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            runtime_client: None,
            bedrock_client: None,
        }
    }
}
