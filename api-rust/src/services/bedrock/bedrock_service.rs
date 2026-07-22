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

/// Curated Bedrock model list shared with the Node API (single source of
/// truth): per-model region availability, max input tokens and
/// `modelIdOverride` — the inference-profile ids (`us.…`/`eu.…`) required by
/// newer models that reject on-demand invocation of the bare model id.
/// `api-rust/config/data/…` is a git symlink to
/// `api/src/config/data/bedrock-models-config.json`; build.rs materializes
/// it into OUT_DIR (with a fallback for checkouts without symlink support).
const BEDROCK_MODELS_CONFIG: &str =
    include_str!(concat!(env!("OUT_DIR"), "/bedrock-models-config.json"));

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BedrockModelConfig {
    pub model_id: String,
    #[serde(default)]
    pub model_id_override: Option<HashMap<String, String>>,
    #[serde(default)]
    pub regions: Vec<String>,
    #[serde(default)]
    pub max_input_tokens: Option<i32>,
    #[serde(default)]
    pub supports_temperature: Option<bool>,
}

pub(crate) fn bedrock_model_configs() -> &'static HashMap<String, BedrockModelConfig> {
    static CONFIGS: std::sync::OnceLock<HashMap<String, BedrockModelConfig>> =
        std::sync::OnceLock::new();
    CONFIGS.get_or_init(|| {
        serde_json::from_str::<Vec<BedrockModelConfig>>(BEDROCK_MODELS_CONFIG)
            .expect("invalid bedrock-models-config.json")
            .into_iter()
            .map(|c| (c.model_id.clone(), c))
            .collect()
    })
}

/// Effective model id for a region: the inference-profile override for the
/// region's geo prefix ("us", "eu", …) when configured, else the bare id.
pub(crate) fn resolve_bedrock_model_id(config: &BedrockModelConfig, region: &str) -> String {
    let geo = region.split('-').next().unwrap_or_default();
    config
        .model_id_override
        .as_ref()
        .and_then(|map| map.get(geo))
        .cloned()
        .unwrap_or_else(|| config.model_id.clone())
}

/// Whether a model accepts the `temperature`/`top_p` sampling params.
/// Newer Anthropic models (Opus 4.7/4.8, Sonnet 5, Fable 5) reject them
/// ("`temperature` is deprecated for this model") — flagged with
/// `supportsTemperature: false` in the shared config and matched by
/// substring, since the invocation id carries a geo prefix (`eu.`/`us.`).
pub(crate) fn bedrock_supports_temperature(model_id: &str) -> bool {
    !bedrock_model_configs().values().any(|config| {
        config.supports_temperature == Some(false) && model_id.contains(&config.model_id)
    })
}

/// Drop sampling params for models that reject them (mirrors the Node
/// provider's formatConverseParams gate).
fn sanitize_sampling_params(mut request: InvokeModelRequest) -> InvokeModelRequest {
    if !bedrock_supports_temperature(&request.model_id) {
        request.temperature = None;
        request.top_p = None;
    }
    request
}

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

    /// Collect Anthropic streaming events that describe tool_use blocks:
    /// content_block_start carries id/name, input_json_delta events carry
    /// the argument JSON in fragments, message_delta carries stop_reason.
    fn collect_anthropic_tool_chunks(
        chunk_data: &Value,
        tool_blocks: &mut HashMap<u64, (String, String, String)>,
        stop_reason: &mut Option<String>,
    ) {
        let index = chunk_data
            .get("index")
            .and_then(|i| i.as_u64())
            .unwrap_or(0);
        match chunk_data.get("type").and_then(|t| t.as_str()) {
            Some("content_block_start") => {
                let Some(block) = chunk_data.get("content_block") else {
                    return;
                };
                if block.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                    let id = block
                        .get("id")
                        .and_then(|id| id.as_str())
                        .unwrap_or("unknown_id")
                        .to_string();
                    let name = block
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or_default()
                        .to_string();
                    tool_blocks.insert(index, (id, name, String::new()));
                }
            }
            Some("content_block_delta") => {
                let Some(delta) = chunk_data.get("delta") else {
                    return;
                };
                if delta.get("type").and_then(|t| t.as_str()) == Some("input_json_delta") {
                    if let (Some(fragment), Some(entry)) = (
                        delta.get("partial_json").and_then(|p| p.as_str()),
                        tool_blocks.get_mut(&index),
                    ) {
                        entry.2.push_str(fragment);
                    }
                }
            }
            Some("message_delta") => {
                if let Some(reason) = chunk_data
                    .get("delta")
                    .and_then(|d| d.get("stop_reason"))
                    .and_then(|r| r.as_str())
                {
                    *stop_reason = Some(reason.to_string());
                }
            }
            _ => {}
        }
    }

    /// Execute the tool calls of an Anthropic tool_use turn and extend the
    /// session: the assistant turn replays its raw content blocks, each
    /// result becomes a Tool-role message (a tool_result block on the next
    /// format pass).
    async fn run_anthropic_tool_calls(
        session: &mut InvokeModelRequest,
        executed: &mut Vec<ExecutedToolCall>,
        assistant_content: Value,
        calls: Vec<ToolCallRequest>,
    ) {
        session.messages.push(ModelMessage {
            role: MessageRole::Assistant,
            content: String::new(),
            timestamp: None,
            tool_calls: Some(assistant_content),
            tool_call_id: None,
        });

        let tools = session.tools.clone().unwrap_or_default();
        for call in calls {
            let (message, record) = crate::services::tools::execute_tool_call(&tools, &call).await;
            executed.push(record);
            session.messages.push(message);
        }
    }
}

#[async_trait]
impl AIProviderService for BedrockService {
    async fn invoke_model(&self, request: InvokeModelRequest) -> Result<ModelResponse, AppError> {
        let mut service = self.clone();
        let client = service.get_runtime_client().await?;

        let mut session = sanitize_sampling_params(request);
        let provider = self.get_model_provider(&session.model_id);

        for _cycle in 0..TOOL_CYCLES_LIMIT {
            let body = self.format_request_for_provider(&provider, &session)?;

            let body_bytes = serde_json::to_vec(&body).map_err(|e| {
                error!(
                    "Failed to serialize Bedrock request for model {}: {:?}",
                    session.model_id, e
                );
                AppError::Internal(format!("Failed to serialize request: {}", e))
            })?;

            let response = client
                .invoke_model()
                .model_id(&session.model_id)
                .body(Blob::new(body_bytes))
                .send()
                .await
                .map_err(|e| {
                    error!(
                        "Bedrock invoke failed for model {}: {:?}",
                        session.model_id, e
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
                    session.model_id,
                    e,
                    String::from_utf8_lossy(response_body)
                );
                AppError::Internal(format!("Failed to parse response: {}", e))
            })?;

            let parsed = self.parse_response_for_provider(
                &provider,
                response_json.clone(),
                &session.model_id,
            )?;

            // Anthropic tool_use turn: execute the tools and re-invoke
            if !parsed.tool_calls.is_empty() {
                let assistant_content = response_json
                    .get("content")
                    .cloned()
                    .unwrap_or_else(|| Value::Array(vec![]));
                let mut executed = Vec::new();
                Self::run_anthropic_tool_calls(
                    &mut session,
                    &mut executed,
                    assistant_content,
                    parsed.tool_calls,
                )
                .await;
                continue;
            }

            return Ok(parsed);
        }

        Err(AppError::Internal(
            "Bedrock: tool call cycles limit exceeded".to_string(),
        ))
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
        let mut service = self.clone();
        let client = service.get_runtime_client().await?;

        let request = sanitize_sampling_params(request);
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
                    Ok(Vec::new())
                }
                Err(e) => {
                    (callbacks.on_error)(e.clone()).await;
                    Err(e)
                }
            }
        } else {
            debug!("Starting real streaming for model: {}", request.model_id);

            let mut session = request;
            let mut executed: Vec<ExecutedToolCall> = Vec::new();
            let mut full_response = String::new();

            for _cycle in 0..TOOL_CYCLES_LIMIT {
                let body = self.format_request_for_provider(&provider, &session)?;

                let body_bytes = serde_json::to_vec(&body).map_err(|e| {
                    error!(
                        "Failed to serialize Bedrock streaming request for model {}: {:?}",
                        session.model_id, e
                    );
                    AppError::Internal(format!("Failed to serialize request: {}", e))
                })?;

                let response = client
                    .invoke_model_with_response_stream()
                    .model_id(&session.model_id)
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
                            session.model_id, detail
                        );
                        AppError::Aws(format!(
                            "Bedrock streaming error for model '{}': {}",
                            session.model_id, detail
                        ))
                    })?;

                // Anthropic tool_use blocks streamed this cycle, keyed by
                // content block index: (id, name, accumulated input JSON)
                let mut tool_blocks: HashMap<u64, (String, String, String)> = HashMap::new();
                let mut stop_reason: Option<String> = None;

                let mut stream = response.body;
                loop {
                    match stream.recv().await {
                        Ok(Some(event)) => {
                            if event.is_chunk() {
                                let chunk = event.as_chunk().unwrap();

                                debug!("Received chunk: {:?}", chunk);
                                if let Some(bytes) = chunk.bytes() {
                                    match std::str::from_utf8(bytes.as_ref()) {
                                        Ok(chunk_str) => {
                                            match serde_json::from_str::<Value>(chunk_str) {
                                                Ok(chunk_data) => {
                                                    if provider == "anthropic" {
                                                        Self::collect_anthropic_tool_chunks(
                                                            &chunk_data,
                                                            &mut tool_blocks,
                                                            &mut stop_reason,
                                                        );
                                                    }

                                                    let token = match provider.as_str() {
                                                        "anthropic" => {
                                                            AnthropicProvider::parse_response_chunk(
                                                                &chunk_data,
                                                            )
                                                        }
                                                        "amazon" => {
                                                            AmazonProvider::parse_response_chunk(
                                                                &chunk_data,
                                                            )
                                                        }
                                                        "mistral" => {
                                                            MistralProvider::parse_response_chunk(
                                                                &chunk_data,
                                                            )
                                                        }
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
                                            }
                                        }
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

                // The cycle repeats ONLY to continue after tool calls; a
                // stream that simply ends is a completed response.
                if stop_reason.as_deref() != Some("tool_use") || tool_blocks.is_empty() {
                    (callbacks.on_complete)(full_response).await;
                    return Ok(executed);
                }

                let mut ordered: Vec<(&u64, &(String, String, String))> =
                    tool_blocks.iter().collect();
                ordered.sort_by_key(|(index, _)| **index);

                let mut assistant_content: Vec<Value> = Vec::new();
                let mut calls: Vec<ToolCallRequest> = Vec::new();
                for (_, (id, name, input_json)) in ordered {
                    let arguments: Value =
                        serde_json::from_str(input_json).unwrap_or_else(|_| serde_json::json!({}));
                    let block = serde_json::json!({
                        "type": "tool_use",
                        "id": id,
                        "name": name,
                        "input": arguments,
                    });
                    assistant_content.push(block.clone());
                    calls.push(ToolCallRequest {
                        id: id.clone(),
                        name: name.clone(),
                        arguments,
                        raw: block,
                    });
                }

                Self::run_anthropic_tool_calls(
                    &mut session,
                    &mut executed,
                    Value::Array(assistant_content),
                    calls,
                )
                .await;
            }

            let error = AppError::Internal("Bedrock: tool call cycles limit exceeded".to_string());
            (callbacks.on_error)(error.clone()).await;
            Err(error)
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

        let region = self
            .config
            .aws_bedrock_region
            .clone()
            .unwrap_or_else(|| "eu-central-1".to_string());
        let configs = bedrock_model_configs();

        for model in response.model_summaries() {
            if let (model_id, Some(model_name), Some(provider_name)) =
                (model.model_id(), model.model_name(), model.provider_name())
            {
                // Only models from the curated config, available in the
                // configured region (mirrors the Node provider — this also
                // drops rerank and other unusable models).
                let Some(model_config) = configs.get(model_id) else {
                    continue;
                };
                if !model_config.regions.iter().any(|r| r == &region) {
                    continue;
                }

                // Newer models require an inference-profile id (us./eu. …) —
                // the bare model id is rejected for on-demand invocation.
                let effective_model_id = resolve_bedrock_model_id(model_config, &region);

                // Classify by output modality, mirroring the Node provider:
                // IMAGE → image_generation, EMBEDDING → embedding, else chat.
                let type_ = if model.output_modalities().contains(&ModelModality::Image) {
                    "image_generation"
                } else if model
                    .output_modalities()
                    .contains(&ModelModality::Embedding)
                {
                    "embedding"
                } else {
                    "chat"
                };

                let supports_streaming =
                    type_ == "chat" && model.response_streaming_supported().unwrap_or(false);

                let supports_image_in = model.input_modalities().contains(&ModelModality::Image);

                models.insert(
                    effective_model_id,
                    AIModelInfo {
                        api_provider: ApiProvider::AwsBedrock,
                        provider: Some(provider_name.to_string()),
                        name: model_name.to_string(),
                        description: format!("{} by {}", model_name, provider_name),
                        type_: type_.to_string(),
                        streaming: supports_streaming,
                        image_input: supports_image_in,
                        max_input_tokens: model_config.max_input_tokens,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_shared_models_config() {
        let configs = bedrock_model_configs();
        assert!(configs.len() > 40, "expected the full curated list");
        assert!(configs.contains_key("anthropic.claude-3-haiku-20240307-v1:0"));
    }

    #[test]
    fn no_temperature_models_drop_sampling_params() {
        // flagged with supportsTemperature: false in the shared config
        assert!(!bedrock_supports_temperature(
            "eu.anthropic.claude-opus-4-8-v1:0"
        ));
        assert!(bedrock_supports_temperature(
            "eu.anthropic.claude-haiku-4-5-20251001-v1:0"
        ));
        assert!(bedrock_supports_temperature(
            "anthropic.claude-3-haiku-20240307-v1:0"
        ));

        let request = InvokeModelRequest {
            model_id: "us.anthropic.claude-opus-4-8-v1:0".to_string(),
            messages: vec![],
            temperature: Some(0.5),
            max_tokens: Some(256),
            top_p: Some(0.9),
            system_prompt: None,
            tools: None,
        };
        let sanitized = sanitize_sampling_params(request);
        assert_eq!(sanitized.temperature, None);
        assert_eq!(sanitized.top_p, None);
        assert_eq!(sanitized.max_tokens, Some(256));
    }

    #[test]
    fn resolves_inference_profile_override_by_region() {
        let configs = bedrock_model_configs();
        let sonnet = configs
            .get("anthropic.claude-sonnet-4-20250514-v1:0")
            .expect("claude sonnet 4 in config");
        assert_eq!(
            resolve_bedrock_model_id(sonnet, "eu-central-1"),
            "eu.anthropic.claude-sonnet-4-20250514-v1:0"
        );
        assert_eq!(
            resolve_bedrock_model_id(sonnet, "us-east-1"),
            "us.anthropic.claude-sonnet-4-20250514-v1:0"
        );

        // model without override keeps its bare id
        let haiku3 = configs
            .get("anthropic.claude-3-haiku-20240307-v1:0")
            .expect("claude 3 haiku in config");
        assert_eq!(
            resolve_bedrock_model_id(haiku3, "eu-central-1"),
            "anthropic.claude-3-haiku-20240307-v1:0"
        );
    }
}
