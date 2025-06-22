use crate::models::message::{Message, MessageRole};
use crate::services::ai::{InvokeModelRequest, MessageRole as AIMessageRole, ModelResponse, Usage};
use crate::utils::errors::AppError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize)]
pub struct MistralRequestMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct MistralRequest {
    pub messages: Vec<MistralRequestMessage>,
    #[serde(rename = "max_tokens")]
    pub max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(rename = "top_p", skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(rename = "stop", skip_serializing_if = "Option::is_none")]
    pub stop: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct MistralUsage {
    #[serde(rename = "prompt_tokens")]
    pub prompt_tokens: Option<i32>,
    #[serde(rename = "completion_tokens")]
    pub completion_tokens: Option<i32>,
    #[serde(rename = "total_tokens")]
    pub total_tokens: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct MistralChoice {
    pub message: MistralResponseMessage,
    #[serde(rename = "finish_reason")]
    pub finish_reason: Option<String>,
    pub index: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct MistralResponseMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct MistralResponse {
    pub id: String,
    pub object: String,
    pub created: Option<u64>,
    pub model: String,
    pub choices: Vec<MistralChoice>,
    pub usage: Option<MistralUsage>,
}

pub struct MistralProvider;

impl MistralProvider {
    pub fn format_messages(messages: &[Message]) -> Vec<MistralRequestMessage> {
        messages
            .iter()
            .map(|msg| {
                let role = match msg.get_role() {
                    MessageRole::Assistant => "assistant",
                    MessageRole::System => "system",
                    _ => "user",
                };

                // Extract text content from structured format if needed
                let content =
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(msg.get_body()) {
                        if parsed.is_array() {
                            // Extract text content from structured format
                            parsed
                                .as_array()
                                .unwrap_or(&vec![])
                                .iter()
                                .filter_map(|part| {
                                    if let Some(obj) = part.as_object() {
                                        if let Some(content_type) =
                                            obj.get("contentType").and_then(|v| v.as_str())
                                        {
                                            if content_type == "text" {
                                                return obj.get("content").and_then(|v| v.as_str());
                                            }
                                        }
                                    }
                                    None
                                })
                                .collect::<Vec<&str>>()
                                .join(" ")
                        } else {
                            msg.get_body().to_string()
                        }
                    } else {
                        msg.get_body().to_string()
                    };

                MistralRequestMessage {
                    role: role.to_string(),
                    content,
                }
            })
            .collect()
    }

    pub fn create_request_body(
        messages: Vec<MistralRequestMessage>,
        max_tokens: u32,
        temperature: Option<f32>,
        top_p: Option<f32>,
    ) -> MistralRequest {
        MistralRequest {
            messages,
            max_tokens,
            temperature,
            top_p,
            stop: None,
        }
    }

    pub fn format_request(request: &InvokeModelRequest) -> Result<Value, AppError> {
        let messages = request
            .messages
            .iter()
            .map(|msg| {
                serde_json::json!({
                    "role": match msg.role {
                        AIMessageRole::Assistant => "assistant",
                        AIMessageRole::System => "system",
                        _ => "user",
                    },
                    "content": msg.content
                })
            })
            .collect::<Vec<_>>();

        let body = serde_json::json!({
            "messages": messages,
            "max_tokens": request.max_tokens.unwrap_or(4096),
            "temperature": request.temperature.unwrap_or(0.7),
            "top_p": request.top_p.unwrap_or(0.9)
        });

        Ok(body)
    }

    pub fn parse_response_chunk(chunk_data: &Value) -> Option<String> {
        // For Mistral models, extract token from outputs[0].text
        if let Some(outputs) = chunk_data.get("outputs") {
            if let Some(output_array) = outputs.as_array() {
                if let Some(first_output) = output_array.first() {
                    if let Some(text) = first_output.get("text").and_then(|t| t.as_str()) {
                        return Some(text.to_string());
                    }
                }
            }
        }
        None
    }

    pub fn parse_model_response(
        response: Value,
        model_id: &str,
    ) -> Result<ModelResponse, AppError> {
        let mistral_response: MistralResponse = serde_json::from_value(response)
            .map_err(|e| AppError::Json(format!("Failed to parse Mistral response: {}", e)))?;

        let choice = mistral_response.choices.first();

        let content = choice
            .and_then(|choice| Some(choice.message.content.as_str()))
            .unwrap_or("")
            .to_string();

        let usage = mistral_response.usage.map(|u| Usage {
            input_tokens: u.prompt_tokens,
            output_tokens: u.completion_tokens,
            total_tokens: u.total_tokens,
        });

        Ok(ModelResponse {
            content,
            model_id: model_id.to_string(),
            usage,
            finish_reason: choice
                .and_then(|c| c.finish_reason.clone())
                .map(|s| s.to_string()),
        })
    }
}
