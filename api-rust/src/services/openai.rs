//! OpenAI provider — a thin wrapper over the shared OpenAI protocol client
//! (`openai_protocol.rs`), plus OpenAI-specific model listing/classification.

use async_trait::async_trait;
use chrono::DateTime;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

use crate::config::AppConfig;
use crate::services::ai::*;
use crate::services::openai_protocol::OpenAIProtocol;
use crate::utils::errors::AppError;

const OPENAI_API_URL: &str = "https://api.openai.com/v1";

/// Model-id prefixes for images-generation models (mirrors the Node API's
/// `OPENAI_MODELS_IMAGES_GENERATION`).
const IMAGES_GENERATION_PREFIXES: &[&str] = &["dall-e", "chatgpt-image", "gpt-image"];
/// Chat-model prefixes that accept image input.
const IMAGE_INPUT_PREFIXES: &[&str] = &["gpt-4o", "gpt-4.1", "gpt-4-turbo", "gpt-5", "o3", "o4"];
/// Chat models that accept voice recordings as input and reply with speech
/// (Node's `OPENAI_MODELS_AUDIO_INPUT`). Prefix-matched.
pub const OPENAI_MODELS_AUDIO_INPUT: &[&str] = &["gpt-4o-audio", "gpt-4o-mini-audio", "gpt-audio"];
/// Chat-model prefixes that support reasoning ("thinking") effort
/// (Node's `OPENAI_MODELS_SUPPORT_REASONING`).
const OPENAI_MODELS_SUPPORT_REASONING: &[&str] = &["gpt-5", "o1", "o3", "o4"];

/// True when `model_id` is an audio-input (speech in/out) chat model.
pub fn is_audio_input_model(model_id: &str) -> bool {
    OPENAI_MODELS_AUDIO_INPUT
        .iter()
        .any(|p| model_id.starts_with(p))
}

pub struct OpenAIService {
    config: AppConfig,
}

impl OpenAIService {
    pub fn new(config: AppConfig) -> Self {
        Self { config }
    }

    fn protocol(&self) -> Result<OpenAIProtocol, AppError> {
        let api_key = self
            .config
            .openai_api_key
            .clone()
            .ok_or_else(|| AppError::Auth("OpenAI API key not configured".to_string()))?;
        Ok(OpenAIProtocol::new(
            OPENAI_API_URL,
            Some(api_key),
            None,
            "OpenAI",
        ))
    }

    pub fn classify_model(model_id: &str) -> Option<(&'static str, bool, bool)> {
        // → (type, streaming, image_input)
        if IMAGES_GENERATION_PREFIXES
            .iter()
            .any(|p| model_id.starts_with(p))
        {
            return Some(("image_generation", false, false));
        }
        if model_id.starts_with("text-embedding") {
            return Some(("embedding", false, false));
        }
        // Realtime voice models (gpt-4o-realtime, gpt-realtime, …) are a
        // distinct model type (Node's ModelType.REALTIME) — they back the
        // voice-to-voice sessions, not the chat list.
        if model_id.contains("-realtime") {
            return Some(("realtime", false, false));
        }
        // Audio-input chat models (gpt-4o-audio, gpt-audio, …) reply with
        // speech; they are chat models even though the id contains "audio".
        if is_audio_input_model(model_id) {
            return Some(("chat", true, false));
        }
        if model_id.contains("gpt") || model_id.starts_with("o1") || model_id.starts_with("o3") {
            // exclude non-chat specializations kept out of the chat list
            for skip in ["instruct", "audio", "tts", "transcribe", "search"] {
                if model_id.contains(skip) {
                    return None;
                }
            }
            let image_input = IMAGE_INPUT_PREFIXES.iter().any(|p| model_id.starts_with(p))
                || model_id.contains("vision");
            return Some(("chat", true, image_input));
        }
        None
    }

    /// Capability flags surfaced to the client (Node's `ModelFeature`),
    /// mirroring `openai.provider.ts`:
    /// - REQUEST_CANCELLATION + CACHE_RETENTION for Responses-API models
    /// - REASONING for gpt-5 / o-series
    /// - AUDIO_INPUT + AUDIO_OUTPUT for audio-input models
    /// - FILES_INPUT for chat models on the Responses API or with image input
    /// - TEMPERATURE always
    fn model_features(model_id: &str, type_: &str, image_input: bool) -> Vec<String> {
        let responses = crate::services::openai_responses::uses_responses_api(model_id)
            && !is_audio_input_model(model_id);
        let mut features: Vec<String> = Vec::new();
        if responses {
            features.push("REQUEST_CANCELLATION".to_string());
            features.push("CACHE_RETENTION".to_string());
        }
        if OPENAI_MODELS_SUPPORT_REASONING
            .iter()
            .any(|p| model_id.starts_with(p))
        {
            features.push("REASONING".to_string());
        }
        if is_audio_input_model(model_id) {
            features.push("AUDIO_INPUT".to_string());
            features.push("AUDIO_OUTPUT".to_string());
        }
        // PDF input: input_file blocks on the Responses API, file blocks on
        // vision-capable Completions models.
        if type_ == "chat" && (responses || image_input) {
            features.push("FILES_INPUT".to_string());
        }
        features.push("TEMPERATURE".to_string());
        features
    }
}

#[async_trait]
impl AIProviderService for OpenAIService {
    async fn invoke_model(&self, request: InvokeModelRequest) -> Result<ModelResponse, AppError> {
        if !is_audio_input_model(&request.model_id)
            && crate::services::openai_responses::uses_responses_api(&request.model_id)
        {
            return crate::services::openai_responses::OpenAIResponsesProtocol::new(
                self.protocol()?,
            )
            .invoke(&request)
            .await;
        }
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
        if !is_audio_input_model(&request.model_id)
            && crate::services::openai_responses::uses_responses_api(&request.model_id)
        {
            return crate::services::openai_responses::OpenAIResponsesProtocol::new(
                self.protocol()?,
            )
            .invoke_stream(&request, &callbacks)
            .await;
        }
        self.protocol()?.invoke_stream(&request, &callbacks).await
    }

    async fn get_models(&self) -> Result<HashMap<String, AIModelInfo>, AppError> {
        let protocol = self.protocol()?;
        let ids = match protocol.list_model_ids().await {
            Ok(ids) => ids,
            Err(_) => return Ok(HashMap::new()),
        };

        let mut models = HashMap::new();
        for id in ids {
            if let Some((type_, streaming, image_input)) = Self::classify_model(&id) {
                let features = Self::model_features(&id, type_, image_input);
                models.insert(
                    id.clone(),
                    AIModelInfo {
                        api_provider: ApiProvider::OpenAi,
                        provider: Some("OpenAI".to_string()),
                        name: id.clone(),
                        description: format!("OpenAI {}", id),
                        type_: type_.to_string(),
                        streaming,
                        image_input,
                        max_input_tokens: None,
                        features,
                    },
                );
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
            id: "OPEN_AI".to_string(),
            name: "OpenAI".to_string(),
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
            error: Some("Cost information not available for OpenAI".to_string()),
        })
    }

    async fn generate_images(
        &self,
        request: GenerateImagesRequest,
    ) -> Result<Vec<GeneratedImage>, AppError> {
        self.protocol()?
            .generate_images(&request.model_id, &request.prompt, request.count)
            .await
    }

    async fn get_embeddings(&self, model_id: &str, input: &str) -> Result<Vec<f32>, AppError> {
        let (embedding, _) = self.protocol()?.get_embeddings(model_id, input).await?;
        Ok(embedding)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_image_generation_models() {
        assert_eq!(
            OpenAIService::classify_model("dall-e-3"),
            Some(("image_generation", false, false))
        );
        assert_eq!(
            OpenAIService::classify_model("gpt-image-1"),
            Some(("image_generation", false, false))
        );
    }

    #[test]
    fn classifies_embeddings_models() {
        assert_eq!(
            OpenAIService::classify_model("text-embedding-3-small"),
            Some(("embedding", false, false))
        );
    }

    #[test]
    fn classifies_chat_models_with_image_input() {
        assert_eq!(
            OpenAIService::classify_model("gpt-4o"),
            Some(("chat", true, true))
        );
        assert_eq!(
            OpenAIService::classify_model("gpt-3.5-turbo"),
            Some(("chat", true, false))
        );
    }

    #[test]
    fn skips_non_chat_specializations() {
        assert_eq!(OpenAIService::classify_model("whisper-1"), None);
        assert_eq!(OpenAIService::classify_model("tts-1"), None);
    }

    #[test]
    fn realtime_models_are_realtime_type() {
        // Voice-to-voice models are listed as a distinct realtime type so
        // createRealtimeSession can find them (they survive reloadModels).
        assert_eq!(
            OpenAIService::classify_model("gpt-4o-realtime-preview"),
            Some(("realtime", false, false))
        );
        assert_eq!(
            OpenAIService::classify_model("gpt-realtime"),
            Some(("realtime", false, false))
        );
        assert_eq!(
            OpenAIService::classify_model("gpt-4o-mini-realtime-preview"),
            Some(("realtime", false, false))
        );
    }

    #[test]
    fn model_features_mirror_node() {
        // Responses-API reasoning model with image input: cancellation +
        // cache + reasoning + files + temperature.
        let f = OpenAIService::model_features("gpt-5.5-pro", "chat", true);
        assert!(f.contains(&"REQUEST_CANCELLATION".to_string()));
        assert!(f.contains(&"CACHE_RETENTION".to_string()));
        assert!(f.contains(&"REASONING".to_string()));
        assert!(f.contains(&"FILES_INPUT".to_string()));
        assert!(f.contains(&"TEMPERATURE".to_string()));
        assert!(!f.contains(&"AUDIO_INPUT".to_string()));

        // Audio-input model: audio in/out + temperature, but no files
        // (not a Responses model, no image input) and no reasoning.
        let a = OpenAIService::model_features("gpt-4o-audio-preview", "chat", false);
        assert!(a.contains(&"AUDIO_INPUT".to_string()));
        assert!(a.contains(&"AUDIO_OUTPUT".to_string()));
        assert!(a.contains(&"TEMPERATURE".to_string()));
        assert!(!a.contains(&"FILES_INPUT".to_string()));
        assert!(!a.contains(&"REASONING".to_string()));

        // Embedding model: just temperature (Node pushes it unconditionally).
        let e = OpenAIService::model_features("text-embedding-3-small", "embedding", false);
        assert!(!e.contains(&"FILES_INPUT".to_string()));
    }

    #[test]
    fn audio_input_models_are_chat() {
        // Audio-input models are chat models even though the id says "audio".
        assert_eq!(
            OpenAIService::classify_model("gpt-4o-audio-preview"),
            Some(("chat", true, false))
        );
        assert_eq!(
            OpenAIService::classify_model("gpt-audio"),
            Some(("chat", true, false))
        );
        assert!(is_audio_input_model("gpt-4o-mini-audio"));
        assert!(!is_audio_input_model("gpt-4o"));
    }
}
