use async_trait::async_trait;
use aws_config::{BehaviorVersion, Region};
use aws_sdk_bedrock::{types::ModelModality, Client as BedrockClient};
use aws_sdk_bedrockruntime::operation::invoke_model_with_response_stream::InvokeModelWithResponseStreamError;
use aws_sdk_bedrockruntime::{primitives::Blob, Client as BedrockRuntimeClient};
use aws_smithy_runtime_api::client::result::SdkError;
use chrono::{DateTime, Utc};
use log::error;
use serde_json::Value;
use std::collections::HashMap;
use std::error::Error;
use std::future::Future;
use std::pin::Pin;
use tracing::{debug, warn};

use crate::config::AppConfig;
use crate::services::ai::*;
use crate::services::bedrock::providers::{
    ai21::AI21Provider, amazon::AmazonProvider, anthropic::AnthropicProvider,
    cohere::CohereProvider, meta::MetaProvider, mistral::MistralProvider,
};
use crate::utils::errors::AppError;

pub struct BedrockService {
    config: AppConfig,
    runtime_client: Option<BedrockRuntimeClient>,
    bedrock_client: Option<BedrockClient>,
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

impl From<SdkError<InvokeModelWithResponseStreamError, aws_smithy_runtime_api::http::Response>>
    for AppError
{
    fn from(
        res: SdkError<InvokeModelWithResponseStreamError, aws_smithy_runtime_api::http::Response>,
    ) -> Self {
        AppError::Http(res.to_string())
    }
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
        Ok(self
            .runtime_client
            .as_ref()
            .expect("Runtime client should be initialized"))
    }

    async fn get_bedrock_client(&mut self) -> Result<&BedrockClient, AppError> {
        if self.bedrock_client.is_none() {
            let aws_config = self.build_aws_config().await?;
            self.bedrock_client = Some(BedrockClient::new(&aws_config));
        }
        Ok(self
            .bedrock_client
            .as_ref()
            .expect("Bedrock client should be initialized"))
    }

    pub(crate) async fn build_aws_config(&self) -> Result<aws_config::SdkConfig, AppError> {
        let mut config_builder = aws_config::defaults(BehaviorVersion::v2025_01_17());
        let region = self
            .config
            .aws_bedrock_region
            .clone()
            .unwrap_or_else(|| "eu-central-1".to_string());

        if let Some(profile) = &self.config.aws_bedrock_profile_name {
            config_builder = config_builder
                .region(Region::new(region.clone()))
                .profile_name(profile.clone());
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
            config_builder = config_builder
                .region(Region::new(region.clone()))
                .credentials_provider(credentials);
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

    fn format_request_for_provider(
        &self,
        provider: &str,
        request: &InvokeModelRequest,
    ) -> Result<Value, AppError> {
        match provider {
            "anthropic" => AnthropicProvider::format_request(request),
            "amazon" => AmazonProvider::format_request(request),
            "ai21" => AI21Provider::format_request(request),
            "cohere" => CohereProvider::format_request(request),
            "meta" => MetaProvider::format_request(request),
            "mistral" => MistralProvider::format_request(request),
            _ => Err(AppError::Validation(format!(
                "Unsupported provider: {}",
                provider
            ))),
        }
    }

    fn parse_response_for_provider(
        &self,
        provider: &str,
        response_json: Value,
        model_id: &str,
    ) -> Result<ModelResponse, AppError> {
        match provider {
            "anthropic" => AnthropicProvider::parse_model_response(response_json, model_id),
            "amazon" => AmazonProvider::parse_model_response(response_json, model_id),
            "ai21" => AI21Provider::parse_model_response(response_json, model_id),
            "cohere" => CohereProvider::parse_model_response(response_json, model_id),
            "meta" => MetaProvider::parse_model_response(response_json, model_id),
            "mistral" => MistralProvider::parse_model_response(response_json, model_id),
            _ => Err(AppError::Validation(format!(
                "Unsupported provider: {}",
                provider
            ))),
        }
    }
}

#[async_trait]
impl AIProviderService for BedrockService {
    async fn invoke_model(&self, request: InvokeModelRequest) -> Result<ModelResponse, AppError> {
        let mut service = self.clone();
        let client = service.get_runtime_client().await?;

        let provider = self.get_model_provider(&request.model_id);
        let body = self.format_request_for_provider(&provider, &request)?;

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
                    e.source().unwrap_or(&e)
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

        self.parse_response_for_provider(&provider, response_json, &request.model_id)
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
        let mut service = self.clone();
        let client = service.get_runtime_client().await?;

        let provider = self.get_model_provider(&request.model_id);

        // Check if model supports streaming (Anthropic, Amazon, Mistral)
        let supports_streaming = matches!(provider.as_str(), "anthropic" | "amazon" | "mistral");

        if !supports_streaming {
            // For models that don't support streaming, simulate streaming
            debug!(
                "Model {} doesn't support streaming, simulating",
                request.model_id
            );
            match self.invoke_model(request).await {
                Ok(response) => {
                    // Simulate streaming by sending chunks of the response
                    let words: Vec<&str> = response.content.split_whitespace().collect();
                    for word in words {
                        (callbacks.on_token)(format!("{word} ")).await;
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
        } else {
            debug!("Starting real streaming for model: {}", request.model_id);

            let body = self.format_request_for_provider(&provider, &request)?;

            let body_bytes = serde_json::to_vec(&body).map_err(|e| {
                error!(
                    "Failed to serialize Bedrock streaming request for model {}: {:?}",
                    request.model_id, e
                );
                AppError::Internal(format!("Failed to serialize request: {}", e))
            })?;

            let response = client
                .invoke_model_with_response_stream()
                .model_id(&request.model_id)
                .body(Blob::new(body_bytes))
                .send()
                .await
                .map_err(|e| {
                    let detail = if let Some(source) = e.source() {
                        format!("{}: {}", e, source)
                    } else {
                        e.to_string()
                    };
                    error!(
                        "Bedrock streaming error for model {}: {}",
                        request.model_id, detail
                    );
                    AppError::Aws(format!(
                        "Bedrock streaming error for model '{}': {}",
                        request.model_id, detail
                    ))
                })?;

            let mut full_response = String::new();

            let mut stream = response.body;
            loop {
                match stream.recv().await {
                    Ok(Some(event)) => {
                        if event.is_chunk() {
                            let chunk = event.as_chunk().unwrap();

                            debug!("Received chunk: {:?}", chunk);
                            if let Some(bytes) = chunk.bytes() {
                                match std::str::from_utf8(bytes.as_ref()) {
                                    Ok(chunk_str) => match serde_json::from_str::<Value>(chunk_str)
                                    {
                                        Ok(chunk_data) => {
                                            let token = match provider.as_str() {
                                                "anthropic" => {
                                                    AnthropicProvider::parse_response_chunk(
                                                        &chunk_data,
                                                    )
                                                }
                                                "amazon" => AmazonProvider::parse_response_chunk(
                                                    &chunk_data,
                                                ),
                                                "mistral" => MistralProvider::parse_response_chunk(
                                                    &chunk_data,
                                                ),
                                                _ => None,
                                            };

                                            if let Some(token) = token {
                                                full_response.push_str(&token);
                                                (callbacks.on_token)(token).await;
                                            }
                                        }
                                        Err(e) => {
                                            warn!(
                                                "Failed to parse chunk JSON: {} - {}",
                                                chunk_str, e
                                            );
                                        }
                                    },
                                    Err(e) => {
                                        warn!("Failed to decode chunk bytes: {}", e);
                                    }
                                }
                            }
                        }
                    }
                    Ok(None) => {
                        // Stream ended
                        break;
                    }
                    Err(e) => {
                        let error = AppError::Aws(format!("Stream error: {}", e));
                        (callbacks.on_error)(error.clone()).await;
                        return Err(error);
                    }
                }
            }

            (callbacks.on_complete)(full_response).await;
            Ok(())
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

                let supports_image_in = model.input_modalities().contains(&ModelModality::Image);

                models.insert(
                    model_id.to_string(),
                    AIModelInfo {
                        api_provider: ApiProvider::AwsBedrock,
                        provider: Some(provider_name.to_string()),
                        name: model_name.to_string(),
                        description: format!("{} by {}", model_name, provider_name),
                        type_: "chat".to_string(),
                        streaming: supports_streaming,
                        image_input: supports_image_in,
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

        let is_connected = self.config.aws_bedrock_access_key_id.is_some()
            || self.config.aws_bedrock_profile_name.is_some();

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
            id: "AWS_BEDROCK".to_string(),
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
        let start_date = DateTime::from_timestamp(start_time, 0).unwrap_or_default();
        let end_date = end_time
            .and_then(|t| DateTime::from_timestamp(t, 0))
            .unwrap_or_else(Utc::now);

        let mut result = UsageCostInfo {
            start: start_date,
            end: Some(end_date),
            costs: vec![],
            error: None,
        };

        // Check if credentials are available
        if self.config.aws_bedrock_access_key_id.is_none()
            && self.config.aws_bedrock_profile_name.is_none()
        {
            result.error = Some("AWS credentials are not set. Set AWS_BEDROCK_ACCESS_KEY_ID and AWS_BEDROCK_SECRET_ACCESS_KEY or AWS_BEDROCK_PROFILE in config.".to_string());
            return Ok(result);
        }

        match self.fetch_cost_data(start_date, end_date).await {
            Ok(costs) => {
                result.costs = costs;
            }
            Err(e) => {
                error!("Error fetching AWS Bedrock usage information: {:?}", e);
                result.error = Some(e.to_string());
            }
        }

        Ok(result)
    }
}
