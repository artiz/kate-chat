use crate::models::message::{Message, MessageRole};
use crate::services::ai::{InvokeModelRequest, MessageRole as AIMessageRole, ModelResponse, Usage};
use crate::utils::errors::AppError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

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
        messages
            .iter()
            .map(|msg| {
                let role = match msg.get_role() {
                    MessageRole::Assistant => "assistant",
                    MessageRole::System => "system",
                    _ => "user",
                };

                // Extract text content from structured format if needed
                let text =
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

                AI21RequestMessage {
                    role: role.to_string(),
                    text,
                }
            })
            .collect()
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

    pub fn parse_response_chunk(_chunk_data: &Value) -> Option<String> {
        // AI21 models don't support streaming
        None
    }

    pub fn format_request(request: &InvokeModelRequest) -> Result<Value, AppError> {
        let messages = request
            .messages
            .iter()
            .map(|msg| {
                serde_json::json!({
                    "role": match msg.role {
                        AIMessageRole::User => "user",
                        AIMessageRole::Assistant => "assistant",
                        AIMessageRole::System => "system",
                    },
                    "text": msg.content
                })
            })
            .collect::<Vec<_>>();

        let body = serde_json::json!({
            "messages": messages,
            "maxTokens": request.max_tokens.unwrap_or(4096),
            "temperature": request.temperature.unwrap_or(0.7),
            "topP": request.top_p.unwrap_or(0.9),
            "system": request.system_prompt
        });

        Ok(body)
    }

    pub fn parse_model_response(
        response: Value,
        model_id: &str,
    ) -> Result<ModelResponse, AppError> {
        let content = response
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("message"))
            .and_then(|msg| msg.get("content"))
            .and_then(|text| text.as_str())
            .unwrap_or("")
            .to_string();

        let usage = response.get("usage").map(|u| Usage {
            input_tokens: u
                .get("promptTokens")
                .and_then(|t| t.as_i64())
                .map(|t| t as i32),
            output_tokens: u
                .get("completionTokens")
                .and_then(|t| t.as_i64())
                .map(|t| t as i32),
            total_tokens: u
                .get("totalTokens")
                .and_then(|t| t.as_i64())
                .map(|t| t as i32),
        });

        Ok(ModelResponse {
            content,
            model_id: model_id.to_string(),
            usage,
            finish_reason: response
                .get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|choice| choice.get("finishReason"))
                .and_then(|r| r.as_str())
                .map(|s| s.to_string()),
        })
    }
}
