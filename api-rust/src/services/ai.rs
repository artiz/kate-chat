use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;
use std::future::Future;
use std::pin::Pin;
use tracing::{debug, error, info, instrument};

use crate::config::AppConfig;
use crate::models::Model;
use crate::services::bedrock::BedrockService;
use crate::services::custom::CustomService;
use crate::services::openai::OpenAIService;
use crate::services::yandex::YandexService;
use crate::utils::errors::AppError;
// Logging macros imported at crate level

#[derive(Debug, Clone, Serialize, Deserialize, Copy, PartialEq, Eq)]
pub enum ApiProvider {
    #[serde(rename = "AWS_BEDROCK")]
    AwsBedrock,
    #[serde(rename = "OPEN_AI")]
    OpenAi,
    #[serde(rename = "YANDEX_AI")]
    YandexAi,
    #[serde(rename = "CUSTOM_REST_API")]
    CustomRestApi,
}

impl ApiProvider {
    fn as_str(&self) -> &'static str {
        match self {
            ApiProvider::AwsBedrock => "AWS_BEDROCK",
            ApiProvider::OpenAi => "OPEN_AI",
            ApiProvider::YandexAi => "YANDEX_AI",
            ApiProvider::CustomRestApi => "CUSTOM_REST_API",
        }
    }
}

impl TryFrom<&str> for ApiProvider {
    type Error = AppError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "AWS_BEDROCK" => Ok(ApiProvider::AwsBedrock),
            "OPEN_AI" => Ok(ApiProvider::OpenAi),
            "YANDEX_AI" => Ok(ApiProvider::YandexAi),
            "CUSTOM_REST_API" => Ok(ApiProvider::CustomRestApi),
            other => Err(AppError::BadRequest(format!(
                "Unsupported API provider: {}",
                other
            ))),
        }
    }
}

impl From<String> for ApiProvider {
    fn from(value: String) -> Self {
        ApiProvider::try_from(value.as_str()).unwrap_or(ApiProvider::CustomRestApi)
    }
}

impl fmt::Display for ApiProvider {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MessageRole {
    #[serde(rename = "user")]
    User,
    #[serde(rename = "assistant")]
    Assistant,
    #[serde(rename = "system")]
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelMessage {
    pub role: MessageRole,
    pub content: String,
    pub timestamp: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvokeModelRequest {
    pub model_id: String,
    pub messages: Vec<ModelMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub top_p: Option<f32>,
    pub system_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelResponse {
    pub content: String,
    pub model_id: String,
    pub usage: Option<Usage>,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub total_tokens: Option<i32>,
}

/// A generated image as raw bytes + mime type, produced by an
/// images-generation model (`/images/generations` on OpenAI-compatible APIs).
#[derive(Debug, Clone)]
pub struct GeneratedImage {
    pub bytes: Vec<u8>,
    pub mime: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateImagesRequest {
    pub model_id: String,
    pub prompt: String,
    pub count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIModelInfo {
    pub api_provider: ApiProvider,
    pub provider: Option<String>,
    pub name: String,
    pub description: String,
    pub type_: String,
    pub streaming: bool,
    pub image_input: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub is_connected: bool,
    pub costs_info_available: bool,
    pub details: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageCostInfo {
    pub start: DateTime<Utc>,
    pub end: Option<DateTime<Utc>>,
    pub costs: Vec<ServiceCostInfo>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceCostInfo {
    pub name: String,
    pub r#type: String,
    pub amounts: Vec<Amount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Amount {
    pub amount: f64,
    pub currency: String,
}

#[allow(dead_code)]
pub struct StreamCallbacks<F, C, E>
where
    F: Fn(String) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
    C: Fn(String) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
    E: Fn(AppError) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
{
    pub on_token: F,
    pub on_complete: C,
    pub on_error: E,
}

#[async_trait]
#[allow(dead_code)]
pub trait AIProviderService: Send + Sync {
    async fn invoke_model(&self, request: InvokeModelRequest) -> Result<ModelResponse, AppError>;

    async fn invoke_model_stream<F, C, E>(
        &self,
        request: InvokeModelRequest,
        callbacks: StreamCallbacks<F, C, E>,
    ) -> Result<(), AppError>
    where
        F: Fn(String) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
        C: Fn(String) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
        E: Fn(AppError) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync;

    async fn get_models(&self) -> Result<HashMap<String, AIModelInfo>, AppError>;
    async fn get_info(&self, test_connection: bool) -> Result<ProviderInfo, AppError>;
    async fn get_costs(
        &self,
        start_time: i64,
        end_time: Option<i64>,
    ) -> Result<UsageCostInfo, AppError>;

    /// Generate images with an images-generation model. Providers without
    /// image support keep the default unsupported error.
    async fn generate_images(
        &self,
        _request: GenerateImagesRequest,
    ) -> Result<Vec<GeneratedImage>, AppError> {
        Err(AppError::BadRequest(
            "Images generation is not supported by this provider".to_string(),
        ))
    }

    /// Embed a single input string. Providers without embeddings support
    /// keep the default unsupported error.
    async fn get_embeddings(&self, _model_id: &str, _input: &str) -> Result<Vec<f32>, AppError> {
        Err(AppError::BadRequest(
            "Embeddings are not supported by this provider".to_string(),
        ))
    }
}

#[allow(dead_code)]
pub enum AIProviderWrapper {
    Bedrock(BedrockService),
    OpenAi(OpenAIService),
    Yandex(YandexService),
    Custom(CustomService),
}

#[async_trait]
impl AIProviderService for AIProviderWrapper {
    async fn invoke_model(&self, request: InvokeModelRequest) -> Result<ModelResponse, AppError> {
        match self {
            AIProviderWrapper::Bedrock(service) => service.invoke_model(request).await,
            AIProviderWrapper::OpenAi(service) => service.invoke_model(request).await,
            AIProviderWrapper::Yandex(service) => service.invoke_model(request).await,
            AIProviderWrapper::Custom(service) => service.invoke_model(request).await,
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
        match self {
            AIProviderWrapper::Bedrock(service) => {
                service.invoke_model_stream(request, callbacks).await
            }
            AIProviderWrapper::OpenAi(service) => {
                service.invoke_model_stream(request, callbacks).await
            }
            AIProviderWrapper::Yandex(service) => {
                service.invoke_model_stream(request, callbacks).await
            }
            AIProviderWrapper::Custom(service) => {
                service.invoke_model_stream(request, callbacks).await
            }
        }
    }

    async fn get_models(&self) -> Result<HashMap<String, AIModelInfo>, AppError> {
        match self {
            AIProviderWrapper::Bedrock(service) => service.get_models().await,
            AIProviderWrapper::OpenAi(service) => service.get_models().await,
            AIProviderWrapper::Yandex(service) => service.get_models().await,
            AIProviderWrapper::Custom(service) => service.get_models().await,
        }
    }

    async fn get_info(&self, test_connection: bool) -> Result<ProviderInfo, AppError> {
        match self {
            AIProviderWrapper::Bedrock(service) => service.get_info(test_connection).await,
            AIProviderWrapper::OpenAi(service) => service.get_info(test_connection).await,
            AIProviderWrapper::Yandex(service) => service.get_info(test_connection).await,
            AIProviderWrapper::Custom(service) => service.get_info(test_connection).await,
        }
    }

    async fn get_costs(
        &self,
        start_time: i64,
        end_time: Option<i64>,
    ) -> Result<UsageCostInfo, AppError> {
        match self {
            AIProviderWrapper::Bedrock(service) => service.get_costs(start_time, end_time).await,
            AIProviderWrapper::OpenAi(service) => service.get_costs(start_time, end_time).await,
            AIProviderWrapper::Yandex(service) => service.get_costs(start_time, end_time).await,
            AIProviderWrapper::Custom(service) => service.get_costs(start_time, end_time).await,
        }
    }

    async fn generate_images(
        &self,
        request: GenerateImagesRequest,
    ) -> Result<Vec<GeneratedImage>, AppError> {
        match self {
            AIProviderWrapper::Bedrock(service) => service.generate_images(request).await,
            AIProviderWrapper::OpenAi(service) => service.generate_images(request).await,
            AIProviderWrapper::Yandex(service) => service.generate_images(request).await,
            AIProviderWrapper::Custom(service) => service.generate_images(request).await,
        }
    }

    async fn get_embeddings(&self, model_id: &str, input: &str) -> Result<Vec<f32>, AppError> {
        match self {
            AIProviderWrapper::Bedrock(service) => service.get_embeddings(model_id, input).await,
            AIProviderWrapper::OpenAi(service) => service.get_embeddings(model_id, input).await,
            AIProviderWrapper::Yandex(service) => service.get_embeddings(model_id, input).await,
            AIProviderWrapper::Custom(service) => service.get_embeddings(model_id, input).await,
        }
    }
}

#[allow(dead_code)]
pub struct AIService {
    config: AppConfig,
}

impl AIService {
    pub fn new(config: AppConfig) -> Self {
        Self { config }
    }

    pub fn get_provider(&self, api_provider: ApiProvider) -> Result<AIProviderWrapper, AppError> {
        let provider_str = api_provider.as_str();

        if !self.config.is_provider_enabled(provider_str) {
            return Err(AppError::BadRequest(format!(
                "API provider {} is not enabled",
                provider_str
            )));
        }

        match api_provider {
            ApiProvider::AwsBedrock => Ok(AIProviderWrapper::Bedrock(BedrockService::new(
                self.config.clone(),
            ))),
            ApiProvider::OpenAi => Ok(AIProviderWrapper::OpenAi(OpenAIService::new(
                self.config.clone(),
            ))),
            ApiProvider::YandexAi => Ok(AIProviderWrapper::Yandex(YandexService::new(
                self.config.clone(),
            ))),
            ApiProvider::CustomRestApi => Err(AppError::BadRequest(
                "Custom REST API provider requires model settings — use get_provider_for_model"
                    .to_string(),
            )),
        }
    }

    /// Resolve the provider for a specific model row. Custom REST models
    /// carry their endpoint/key/protocol in `custom_settings`; everything
    /// else routes by `api_provider` alone.
    pub fn get_provider_for_model(&self, model: &Model) -> Result<AIProviderWrapper, AppError> {
        let api_provider = ApiProvider::try_from(model.api_provider.as_str())?;
        if api_provider == ApiProvider::CustomRestApi {
            if !self.config.is_provider_enabled("CUSTOM_REST_API") {
                return Err(AppError::BadRequest(
                    "API provider CUSTOM_REST_API is not enabled".to_string(),
                ));
            }
            return Ok(AIProviderWrapper::Custom(CustomService::for_model(model)?));
        }
        self.get_provider(api_provider)
    }

    #[instrument(skip(self))]
    pub async fn get_all_models(&self) -> Result<HashMap<String, AIModelInfo>, AppError> {
        let mut all_models = HashMap::new();

        // Get models from all enabled providers
        let providers = self.get_enabled_providers();
        info!("Fetching models from {} enabled providers", providers.len());

        for provider_type in providers {
            debug!("Fetching models from provider: {:?}", provider_type);

            match self.get_provider(provider_type) {
                Ok(provider) => match provider.get_models().await {
                    Ok(models) => {
                        let model_count = models.len();
                        debug!(
                            "Retrieved {} models from provider {:?}",
                            model_count, provider_type
                        );
                        all_models.extend(models);
                    }
                    Err(e) => {
                        error!(
                            "Failed to get models from provider {:?}: {}",
                            provider_type, e
                        );
                    }
                },
                Err(e) => {
                    error!("Failed to create provider {:?}: {}", provider_type, e);
                }
            }
        }

        info!("Total models retrieved: {}", all_models.len());
        Ok(all_models)
    }

    pub async fn get_provider_info(
        &self,
        test_connection: bool,
    ) -> Result<Vec<ProviderInfo>, AppError> {
        let mut providers = Vec::new();
        let provider_types = self.get_enabled_providers();

        for provider_type in provider_types {
            if let Ok(provider) = self.get_provider(provider_type) {
                match provider.get_info(test_connection).await {
                    Ok(info) => providers.push(info),
                    Err(e) => {
                        log::error!("Error getting provider info: {}", e);
                        // Add error info for this provider
                        providers.push(ProviderInfo {
                            id: format!("{:?}", provider_type),
                            name: self.get_provider_name(&provider_type),
                            is_connected: false,
                            costs_info_available: false,
                            details: {
                                let mut map = HashMap::new();
                                map.insert("error".to_string(), e.to_string());
                                map
                            },
                        });
                    }
                }
            }
        }

        // Custom REST API has no global connection — it is configured per
        // model, so when enabled it is always reported as connected.
        if self.config.is_provider_enabled("CUSTOM_REST_API") {
            providers.push(ProviderInfo {
                id: "CUSTOM_REST_API".to_string(),
                name: "Custom REST API".to_string(),
                is_connected: true,
                costs_info_available: false,
                details: HashMap::new(),
            });
        }

        Ok(providers)
    }

    fn get_enabled_providers(&self) -> Vec<ApiProvider> {
        let mut providers = Vec::new();

        if self.config.is_provider_enabled("AWS_BEDROCK") {
            providers.push(ApiProvider::AwsBedrock);
        }
        if self.config.is_provider_enabled("OPEN_AI") {
            providers.push(ApiProvider::OpenAi);
        }
        if self.config.is_provider_enabled("YANDEX_AI") {
            providers.push(ApiProvider::YandexAi);
        }

        providers
    }

    fn get_provider_name(&self, provider: &ApiProvider) -> String {
        match provider {
            ApiProvider::AwsBedrock => "AWS Bedrock".to_string(),
            ApiProvider::OpenAi => "OpenAI".to_string(),
            ApiProvider::YandexAi => "Yandex AI".to_string(),
            ApiProvider::CustomRestApi => "Custom REST API".to_string(),
        }
    }

    pub async fn get_costs(
        &self,
        api_provider: ApiProvider,
        start_time: i64,
        end_time: Option<i64>,
    ) -> Result<UsageCostInfo, AppError> {
        self.get_provider(api_provider)?
            .get_costs(start_time, end_time)
            .await
    }
}
