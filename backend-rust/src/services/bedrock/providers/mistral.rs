use serde::{Deserialize, Serialize};
use crate::models::message::{Message, MessageRole};

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
    pub prompt_tokens: Option<u32>,
    #[serde(rename = "completion_tokens")]
    pub completion_tokens: Option<u32>,
    #[serde(rename = "total_tokens")]
    pub total_tokens: Option<u32>,
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
        messages.iter().map(|msg| {
            let role = match msg.get_role() {
                MessageRole::Assistant => "assistant",
                MessageRole::System => "system",
                _ => "user",
            };

            // Extract text content from structured format if needed
            let content = if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(msg.get_body()) {
                if parsed.is_array() {
                    // Extract text content from structured format
                    parsed.as_array()
                        .unwrap_or(&vec![])
                        .iter()
                        .filter_map(|part| {
                            if let Some(obj) = part.as_object() {
                                if let Some(content_type) = obj.get("contentType").and_then(|v| v.as_str()) {
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
        }).collect()
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

    pub fn parse_response(response: MistralResponse) -> Result<String, String> {
        if let Some(choice) = response.choices.first() {
            Ok(choice.message.content.clone())
        } else {
            Err("No choices found in Mistral response".to_string())
        }
    }
}
