use crate::models::message::{Message, MessageRole};
use crate::services::ai::{InvokeModelRequest, MessageRole as AIMessageRole, ModelResponse, Usage};
use crate::utils::errors::AppError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Serialize)]
pub struct AnthropicRequestMessage {
    pub role: String,
    pub content: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct AnthropicRequest {
    pub anthropic_version: String,
    pub max_tokens: u32,
    pub messages: Vec<AnthropicRequestMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
}

#[derive(Debug, Deserialize)]
pub struct AnthropicContentBlock {
    #[serde(rename = "type")]
    pub content_type: String,
    pub text: Option<String>,
    pub image: Option<serde_json::Value>,
    pub id: Option<String>,
    pub name: Option<String>,
    pub input: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AnthropicUsage {
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct AnthropicResponse {
    pub id: String,
    pub model: String,
    pub role: String,
    pub content: Vec<AnthropicContentBlock>,
    pub stop_reason: Option<String>,
    pub stop_sequence: Option<String>,
    pub usage: Option<AnthropicUsage>,
}

pub struct AnthropicProvider;

impl AnthropicProvider {
    pub fn format_messages(messages: &[Message]) -> Vec<AnthropicRequestMessage> {
        messages
            .iter()
            .map(|msg| {
                let role = match msg.get_role() {
                    MessageRole::Assistant => "assistant",
                    _ => "user",
                };

                // Handle both string and structured content
                let content =
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(msg.get_body()) {
                        if parsed.is_array() {
                            // Handle structured content with images/text
                            let content_parts: Vec<serde_json::Value> = parsed
                                .as_array()
                                .unwrap_or(&vec![])
                                .iter()
                                .filter_map(|part| {
                                    if let Some(obj) = part.as_object() {
                                        if let Some(content_type) =
                                            obj.get("contentType").and_then(|v| v.as_str())
                                        {
                                            match content_type {
                                                "image" => {
                                                    if let Some(content) =
                                                        obj.get("content").and_then(|v| v.as_str())
                                                    {
                                                        // Parse data URL format: data:image/type;base64,data
                                                        if let Some(captures) = regex::Regex::new(
                                                            r"^data:(image/[^;]+);base64,(.*)$",
                                                        )
                                                        .unwrap()
                                                        .captures(content)
                                                        {
                                                            let media_type =
                                                                captures.get(1).unwrap().as_str();
                                                            let base64_data =
                                                                captures.get(2).unwrap().as_str();

                                                            return Some(json!({
                                                                "type": "image",
                                                                "source": {
                                                                    "type": "base64",
                                                                    "media_type": media_type,
                                                                    "data": base64_data
                                                                }
                                                            }));
                                                        }
                                                    }
                                                }
                                                "text" => {
                                                    if let Some(content) =
                                                        obj.get("content").and_then(|v| v.as_str())
                                                    {
                                                        return Some(json!({
                                                            "type": "text",
                                                            "text": content
                                                        }));
                                                    }
                                                }
                                                _ => {}
                                            }
                                        }
                                    }
                                    None
                                })
                                .collect();

                            json!(content_parts)
                        } else {
                            json!(msg.get_body())
                        }
                    } else {
                        json!(msg.get_body())
                    };

                AnthropicRequestMessage {
                    role: role.to_string(),
                    content,
                }
            })
            .collect()
    }

    pub fn create_request_body(
        messages: Vec<AnthropicRequestMessage>,
        system_prompt: Option<String>,
        max_tokens: u32,
        temperature: Option<f32>,
    ) -> AnthropicRequest {
        AnthropicRequest {
            anthropic_version: "bedrock-2023-05-31".to_string(),
            max_tokens,
            messages,
            system: system_prompt,
            temperature,
        }
    }

    pub fn parse_response(response: AnthropicResponse) -> Result<String, String> {
        if let Some(content_block) = response.content.first() {
            content_block
                .text
                .clone()
                .ok_or_else(|| "No text content found".to_string())
        } else {
            Err("No content blocks found".to_string())
        }
    }

    pub fn format_request(request: &InvokeModelRequest) -> Result<Value, AppError> {
        let mut messages = Vec::new();
        let mut system_message = request.system_prompt.clone();

        for msg in &request.messages {
            let role = match msg.role {
                AIMessageRole::User => "user",
                AIMessageRole::Assistant => "assistant",
                AIMessageRole::System => {
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

    pub fn parse_model_response(
        response: Value,
        model_id: &str,
    ) -> Result<ModelResponse, AppError> {
        let content = response
            .get("content")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|item| item.get("text"))
            .and_then(|text| text.as_str())
            .unwrap_or("")
            .to_string();

        let usage = response.get("usage").map(|u| Usage {
            input_tokens: u
                .get("input_tokens")
                .and_then(|t| t.as_i64())
                .map(|t| t as i32),
            output_tokens: u
                .get("output_tokens")
                .and_then(|t| t.as_i64())
                .map(|t| t as i32),
            total_tokens: None,
        });

        Ok(ModelResponse {
            content,
            model_id: model_id.to_string(),
            usage,
            finish_reason: response
                .get("stop_reason")
                .and_then(|r| r.as_str())
                .map(|s| s.to_string()),
        })
    }
}
