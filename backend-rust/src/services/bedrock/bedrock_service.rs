use async_trait::async_trait;
use aws_config::{BehaviorVersion, Region};
use aws_sdk_bedrock::{types::ModelModality, Client as BedrockClient};
use aws_sdk_bedrockruntime::{primitives::Blob, Client as BedrockRuntimeClient};
use chrono::DateTime;
use log::error;
use serde_json::Value;
use std::collections::HashMap;
use std::error::Error;
use std::future::Future;
use std::pin::Pin;

use crate::config::AppConfig;
use crate::services::ai::*;
use crate::services::bedrock::providers::{
    ai21::AI21Provider, amazon::AmazonProvider, anthropic::AnthropicProvider,
    cohere::CohereProvider, meta::MetaProvider, mistral::MistralProvider,
};
use crate::utils::errors::AppError;

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

        if let Some(region) = &self.config.aws_bedrock_region {
            config_builder = config_builder
                .region(Region::new(region.clone()))
                .profile_name(&self.config.aws_bedrock_profile_name);
        }

        if let (Some(access_key), Some(secret_key)) = (
            &self.config.aws_bedrock_access_key_id,
            &self.config.aws_bedrock_secret_access_key,
        ) {
            let credentials = aws_sdk_bedrockruntime::config::Credentials::new(
                access_key,
                secret_key,
                None,
                None,
                "kate-chat",
            );
            config_builder = config_builder.credentials_provider(credentials);
        }

        Ok(config_builder.load().await)
    }

    fn get_model_provider(&self, model_id: &str) -> String {
        if model_id.starts_with("us.") || model_id.starts_with("eu.") || model_id.starts_with("ap.")
        {
            model_id.split('.').nth(1).unwrap_or("unknown").to_string()
        } else {
            model_id.split('.').next().unwrap_or("unknown").to_string()
        }
    }
}

#[async_trait]
impl AIProviderService for BedrockService {
    async fn invoke_model(&self, request: InvokeModelRequest) -> Result<ModelResponse, AppError> {
        let mut service = self.clone();
        let client = service.get_runtime_client().await?;

        let provider = self.get_model_provider(&request.model_id);

        let body = match provider.as_str() {
            "anthropic" => AnthropicProvider::format_request(&request)?,
            "amazon" => AmazonProvider::format_request(&request)?,
            "ai21" => AI21Provider::format_request(&request)?,
            "cohere" => CohereProvider::format_request(&request)?,
            "meta" => MetaProvider::format_request(&request)?,
            "mistral" => MistralProvider::format_request(&request)?,
            _ => {
                return Err(AppError::Validation(format!(
                    "Unsupported provider: {}",
                    provider
                )))
            }
        };

        let body_bytes = serde_json::to_vec(&body).map_err(|e| {
            error!(
                "Failed to serialize Bedrock request for model {}: {:?}",
                request.model_id, e
            );
            AppError::Internal(format!("Failed to serialize request: {}", e))
        })?;

        let response = client
            .invoke_model()
            .model_id(&request.model_id)
            .body(Blob::new(body_bytes))
            .send()
            .await
            .map_err(|e| {
                error!(
                    "Bedrock invoke failed for model {}: {:?}",
                    request.model_id, e
                );
                AppError::Aws(format!(
                    "Bedrock invoke failed: {}",
                    e.source().unwrap_or(&e).to_string()
                ))
            })?;

        let response_body = response.body().as_ref();
        let response_json: Value = serde_json::from_slice(response_body).map_err(|e| {
            error!(
                "Failed to parse Bedrock response for model {}: {:?}. Response body: {:?}",
                request.model_id,
                e,
                String::from_utf8_lossy(response_body)
            );
            AppError::Internal(format!("Failed to parse response: {}", e))
        })?;

        match provider.as_str() {
            "anthropic" => {
                AnthropicProvider::parse_model_response(response_json, &request.model_id)
            }
            "amazon" => AmazonProvider::parse_model_response(response_json, &request.model_id),
            "ai21" => AI21Provider::parse_model_response(response_json, &request.model_id),
            "cohere" => CohereProvider::parse_model_response(response_json, &request.model_id),
            "meta" => MetaProvider::parse_model_response(response_json, &request.model_id),
            "mistral" => MistralProvider::parse_model_response(response_json, &request.model_id),
            _ => Err(AppError::Validation(format!(
                "Unsupported provider: {}",
                provider
            ))),
        }
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
        // TODO: implement real streaming
        match self.invoke_model(request).await {
            Ok(response) => {
                // Simulate streaming by sending chunks
                let words: Vec<&str> = response.content.split_whitespace().collect();
                for word in words {
                    (callbacks.on_token)(format!("{} ", word)).await;
                    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
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
        let mut service = self.clone();
        let client = service.get_bedrock_client().await?;

        let response = client.list_foundation_models().send().await.map_err(|e| {
            error!("Failed to list Bedrock models: {:?}", e);
            AppError::Aws(format!("Failed to list models: {}", e))
        })?;

        let mut models = HashMap::new();

        for model in response.model_summaries() {
            if let (model_id, Some(model_name), Some(provider_name)) =
                (model.model_id(), model.model_name(), model.provider_name())
            {
                let supports_streaming = model.response_streaming_supported().unwrap_or(false);

                let supports_text_in = model
                    .input_modalities()
                    .iter()
                    .any(|mod_type| *mod_type == ModelModality::Text);
                let supports_image_in = model
                    .input_modalities()
                    .iter()
                    .any(|mod_type| *mod_type == ModelModality::Image);
                let supports_text_out = model
                    .output_modalities()
                    .iter()
                    .any(|mod_type| *mod_type == ModelModality::Text);
                let supports_image_out = model
                    .output_modalities()
                    .iter()
                    .any(|mod_type| *mod_type == ModelModality::Image);

                models.insert(
                    model_id.to_string(),
                    AIModelInfo {
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
                    },
                );
            }
        }

        Ok(models)
    }

    async fn get_info(&self, test_connection: bool) -> Result<ProviderInfo, AppError> {
        let mut details = HashMap::new();
        details.insert("configured".to_string(), "true".to_string());

        if let Some(region) = &self.config.aws_bedrock_region {
            details.insert("region".to_string(), region.clone());
        }

        let is_connected =
            self.config.aws_bedrock_access_key_id.is_some() || std::env::var("AWS_PROFILE").is_ok();

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

    async fn get_costs(
        &self,
        start_time: i64,
        end_time: Option<i64>,
    ) -> Result<UsageCostInfo, AppError> {
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
