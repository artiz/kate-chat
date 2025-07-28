use crate::models::message::{Message, MessageRole};
use crate::services::ai::{InvokeModelRequest, MessageRole as AIMessageRole, ModelResponse, Usage};
use crate::utils::errors::AppError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize)]
pub struct CohereRequestMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct CohereRequest {
    pub message: String,
    #[serde(rename = "chatHistory")]
    pub chat_history: Vec<CohereRequestMessage>,
    #[serde(rename = "maxTokens")]
    pub max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(rename = "p", skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preamble: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CohereUsage {
    #[serde(rename = "inputTokens")]
    pub input_tokens: Option<u32>,
    #[serde(rename = "outputTokens")]
    pub output_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct CohereResponse {
    pub text: String,
    #[serde(rename = "generationId")]
    pub generation_id: String,
    #[serde(rename = "finishReason")]
    pub finish_reason: Option<String>,
    pub usage: Option<CohereUsage>,
}

pub struct CohereProvider;

impl CohereProvider {
    pub fn format_messages(messages: &[Message]) -> (Vec<CohereRequestMessage>, String) {
        let mut chat_history = Vec::new();
        let mut current_message = String::new();

        for (i, msg) in messages.iter().enumerate() {
            let role = match msg.get_role() {
                MessageRole::Assistant => "CHATBOT",
                MessageRole::System => "SYSTEM",
                _ => "USER",
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

            // The last message becomes the current message, others go to history
            if i == messages.len() - 1 && msg.get_role() == MessageRole::User {
                current_message = content;
            } else {
                chat_history.push(CohereRequestMessage {
                    role: role.to_string(),
                    content,
                });
            }
        }

        (chat_history, current_message)
    }

    pub fn create_request_body(
        chat_history: Vec<CohereRequestMessage>,
        message: String,
        system_prompt: Option<String>,
        max_tokens: u32,
        temperature: Option<f32>,
        top_p: Option<f32>,
    ) -> CohereRequest {
        CohereRequest {
            message,
            chat_history,
            max_tokens,
            temperature,
            top_p,
            preamble: system_prompt,
        }
    }

    pub fn parse_response(response: CohereResponse) -> Result<String, String> {
        Ok(response.text)
    }

    pub fn parse_response_chunk(_chunk_data: &Value) -> Option<String> {
        // Cohere models don't support streaming
        None
    }

    pub fn format_request(request: &InvokeModelRequest) -> Result<Value, AppError> {
        let mut chat_history = Vec::new();
        let mut current_message = String::new();

        for (i, msg) in request.messages.iter().enumerate() {
            if i == request.messages.len() - 1 && msg.role == AIMessageRole::User {
                current_message = msg.content.clone();
            } else {
                let role = match msg.role {
                    AIMessageRole::Assistant => "CHATBOT",
                    AIMessageRole::System => "SYSTEM",
                    _ => "USER",
                };
                chat_history.push(serde_json::json!({
                    "role": role,
                    "content": msg.content
                }));
            }
        }

        let body = serde_json::json!({
            "message": current_message,
            "chatHistory": chat_history,
            "maxTokens": request.max_tokens.unwrap_or(4096),
            "temperature": request.temperature.unwrap_or(0.7),
            "p": request.top_p.unwrap_or(0.9),
            "preamble": request.system_prompt
        });

        Ok(body)
    }

    pub fn parse_model_response(
        response: Value,
        model_id: &str,
    ) -> Result<ModelResponse, AppError> {
        let content = response
            .get("text")
            .and_then(|text| text.as_str())
            .unwrap_or("")
            .to_string();

        let usage = response.get("usage").map(|u| Usage {
            input_tokens: u
                .get("inputTokens")
                .and_then(|t| t.as_i64())
                .map(|t| t as i32),
            output_tokens: u
                .get("outputTokens")
                .and_then(|t| t.as_i64())
                .map(|t| t as i32),
            total_tokens: None,
        });

        Ok(ModelResponse {
            content,
            model_id: model_id.to_string(),
            usage,
            finish_reason: response
                .get("finishReason")
                .and_then(|r| r.as_str())
                .map(|s| s.to_string()),
        })
    }
}
