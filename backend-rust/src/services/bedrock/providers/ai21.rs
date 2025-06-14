use serde::{Deserialize, Serialize};
use crate::models::message::{Message, MessageRole};

#[derive(Debug, Serialize)]
pub struct AI21RequestMessage {
    pub role: String,
    pub text: String,
}

#[derive(Debug, Serialize)]
pub struct AI21Request {
    pub messages: Vec<AI21RequestMessage>,
    #[serde(rename = "maxTokens")]
    pub max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(rename = "topP", skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AI21Usage {
    #[serde(rename = "promptTokens")]
    pub prompt_tokens: Option<u32>,
    #[serde(rename = "completionTokens")]
    pub completion_tokens: Option<u32>,
    #[serde(rename = "totalTokens")]
    pub total_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct AI21Choice {
    pub message: AI21ResponseMessage,
    #[serde(rename = "finishReason")]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AI21ResponseMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct AI21Response {
    pub id: String,
    pub choices: Vec<AI21Choice>,
    pub usage: Option<AI21Usage>,
}

pub struct AI21Provider;

impl AI21Provider {
    pub fn format_messages(messages: &[Message]) -> Vec<AI21RequestMessage> {
        messages.iter().map(|msg| {
            let role = match msg.get_role() {
                MessageRole::Assistant => "assistant",
                MessageRole::System => "system",
                _ => "user",
            };

            // Extract text content from structured format if needed
            let text = if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(msg.get_body()) {
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

            AI21RequestMessage {
                role: role.to_string(),
                text,
            }
        }).collect()
    }

    pub fn create_request_body(
        messages: Vec<AI21RequestMessage>,
        system_prompt: Option<String>,
        max_tokens: u32,
        temperature: Option<f32>,
        top_p: Option<f32>,
    ) -> AI21Request {
        AI21Request {
            messages,
            max_tokens,
            temperature,
            top_p,
            system: system_prompt,
        }
    }

    pub fn parse_response(response: AI21Response) -> Result<String, String> {
        if let Some(choice) = response.choices.first() {
            Ok(choice.message.content.clone())
        } else {
            Err("No choices found in AI21 response".to_string())
        }
    }
}
