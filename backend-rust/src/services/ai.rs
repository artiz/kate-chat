use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

use crate::config::AppConfig;
use crate::services::bedrock::BedrockService;
use crate::services::openai::OpenAIService;
use crate::services::yandex::YandexService;
use crate::utils::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, Copy)]
pub enum ApiProvider {
    #[serde(rename = "AWS_BEDROCK")]
    AwsBedrock,
    #[serde(rename = "OPEN_AI")]
    OpenAi,
    #[serde(rename = "YANDEX_FM")]
    YandexFm,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIModelInfo {
    pub api_provider: ApiProvider,
    pub provider: Option<String>,
    pub name: String,
    pub description: String,
    pub supports_streaming: bool,
    pub supports_text_in: bool,
    pub supports_text_out: bool,
    pub supports_image_in: bool,
    pub supports_image_out: bool,
    pub supports_embeddings_in: bool,
    pub supports_embeddings_out: bool,
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
    F: Fn(String) + Send + Sync,
    C: Fn(String) + Send + Sync,
    E: Fn(AppError) + Send + Sync,
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
        callbacks: StreamCallbacks<F, C, E>
    ) -> Result<(), AppError>
    where
        F: Fn(String) + Send + Sync,
        C: Fn(String) + Send + Sync,
        E: Fn(AppError) + Send + Sync;
    
    async fn get_models(&self) -> Result<HashMap<String, AIModelInfo>, AppError>;
    async fn get_info(&self, test_connection: bool) -> Result<ProviderInfo, AppError>;
    async fn get_costs(&self, start_time: i64, end_time: Option<i64>) -> Result<UsageCostInfo, AppError>;
}

#[allow(dead_code)]
pub enum AIProviderWrapper {
    Bedrock(BedrockService),
    OpenAi(OpenAIService),
    Yandex(YandexService),
}

#[async_trait]
impl AIProviderService for AIProviderWrapper {
    async fn invoke_model(&self, request: InvokeModelRequest) -> Result<ModelResponse, AppError> {
        match self {
            AIProviderWrapper::Bedrock(service) => service.invoke_model(request).await,
            AIProviderWrapper::OpenAi(service) => service.invoke_model(request).await,
            AIProviderWrapper::Yandex(service) => service.invoke_model(request).await,
        }
    }
    
    async fn invoke_model_stream<F, C, E>(
        &self, 
        request: InvokeModelRequest,
        callbacks: StreamCallbacks<F, C, E>
    ) -> Result<(), AppError>
    where
        F: Fn(String) + Send + Sync,
        C: Fn(String) + Send + Sync,
        E: Fn(AppError) + Send + Sync,
    {
        match self {
            AIProviderWrapper::Bedrock(service) => service.invoke_model_stream(request, callbacks).await,
            AIProviderWrapper::OpenAi(service) => service.invoke_model_stream(request, callbacks).await,
            AIProviderWrapper::Yandex(service) => service.invoke_model_stream(request, callbacks).await,
        }
    }
    
    async fn get_models(&self) -> Result<HashMap<String, AIModelInfo>, AppError> {
        match self {
            AIProviderWrapper::Bedrock(service) => service.get_models().await,
            AIProviderWrapper::OpenAi(service) => service.get_models().await,
            AIProviderWrapper::Yandex(service) => service.get_models().await,
        }
    }
    
    async fn get_info(&self, test_connection: bool) -> Result<ProviderInfo, AppError> {
        match self {
            AIProviderWrapper::Bedrock(service) => service.get_info(test_connection).await,
            AIProviderWrapper::OpenAi(service) => service.get_info(test_connection).await,
            AIProviderWrapper::Yandex(service) => service.get_info(test_connection).await,
        }
    }
    
    async fn get_costs(&self, start_time: i64, end_time: Option<i64>) -> Result<UsageCostInfo, AppError> {
        match self {
            AIProviderWrapper::Bedrock(service) => service.get_costs(start_time, end_time).await,
            AIProviderWrapper::OpenAi(service) => service.get_costs(start_time, end_time).await,
            AIProviderWrapper::Yandex(service) => service.get_costs(start_time, end_time).await,
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
        match api_provider {
            ApiProvider::AwsBedrock => {
                Ok(AIProviderWrapper::Bedrock(BedrockService::new(self.config.clone())))
            }
            ApiProvider::OpenAi => {
                Ok(AIProviderWrapper::OpenAi(OpenAIService::new(self.config.clone())))
            }
            ApiProvider::YandexFm => {
                Ok(AIProviderWrapper::Yandex(YandexService::new(self.config.clone())))
            }
        }
    }

    pub async fn invoke_model(
        &self,
        api_provider: ApiProvider,
        request: InvokeModelRequest,
    ) -> Result<ModelResponse, AppError> {
        let provider = self.get_provider(api_provider)?;
        provider.invoke_model(request).await
    }

    pub async fn invoke_model_stream<F, C, E>(
        &self,
        api_provider: ApiProvider,
        request: InvokeModelRequest,
        callbacks: StreamCallbacks<F, C, E>,
    ) -> Result<(), AppError>
    where
        F: Fn(String) + Send + Sync,
        C: Fn(String) + Send + Sync,
        E: Fn(AppError) + Send + Sync,
    {
        let provider = self.get_provider(api_provider)?;
        provider.invoke_model_stream(request, callbacks).await
    }

    pub async fn get_all_models(&self) -> Result<HashMap<String, AIModelInfo>, AppError> {
        let mut all_models = HashMap::new();
        
        // Get models from all enabled providers
        let providers = vec![ApiProvider::AwsBedrock, ApiProvider::OpenAi, ApiProvider::YandexFm];
        
        for provider_type in providers {
            if let Ok(provider) = self.get_provider(provider_type) {
                if let Ok(models) = provider.get_models().await {
                    all_models.extend(models);
                }
            }
        }
        
        Ok(all_models)
    }

    pub async fn get_provider_info(&self, test_connection: bool) -> Result<Vec<ProviderInfo>, AppError> {
        let mut providers = Vec::new();
        let provider_types = vec![ApiProvider::AwsBedrock, ApiProvider::OpenAi, ApiProvider::YandexFm];
        
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
        
        Ok(providers)
    }

    fn get_provider_name(&self, provider: &ApiProvider) -> String {
        match provider {
            ApiProvider::AwsBedrock => "AWS Bedrock".to_string(),
            ApiProvider::OpenAi => "OpenAI".to_string(),
            ApiProvider::YandexFm => "Yandex Foundation Models".to_string(),
        }
    }
}