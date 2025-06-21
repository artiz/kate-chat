use crate::models::message::{Message, MessageRole};
use crate::services::ai::{InvokeModelRequest, MessageRole as AIMessageRole, ModelResponse, Usage};
use crate::utils::errors::AppError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize)]
pub struct MetaRequestMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct MetaRequest {
    pub prompt: String,
    #[serde(rename = "max_gen_len")]
    pub max_gen_len: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(rename = "top_p", skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
}

#[derive(Debug, Deserialize)]
pub struct MetaUsage {
    #[serde(rename = "prompt_tokens")]
    pub prompt_tokens: Option<u32>,
    #[serde(rename = "completion_tokens")]
    pub completion_tokens: Option<u32>,
    #[serde(rename = "total_tokens")]
    pub total_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct MetaResponse {
    pub generation: String,
    #[serde(rename = "prompt_token_count")]
    pub prompt_token_count: Option<u32>,
    #[serde(rename = "generation_token_count")]
    pub generation_token_count: Option<u32>,
    #[serde(rename = "stop_reason")]
    pub stop_reason: Option<String>,
}

pub struct MetaProvider;

impl MetaProvider {
    pub fn format_messages_to_prompt(
        messages: &[Message],
        system_prompt: Option<String>,
    ) -> String {
        let mut prompt = String::new();

        // Add system prompt if provided
        if let Some(system) = system_prompt {
            prompt.push_str(&format!(
                "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{}<|eot_id|>",
                system
            ));
        } else {
            prompt.push_str("<|begin_of_text|>");
        }

        for msg in messages {
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

            prompt.push_str(&format!(
                "<|start_header_id|>{}<|end_header_id|>\n\n{}<|eot_id|>",
                role, content
            ));
        }

        // Add assistant header for response
        prompt.push_str("<|start_header_id|>assistant<|end_header_id|>\n\n");
        prompt
    }

    pub fn create_request_body(
        prompt: String,
        max_tokens: u32,
        temperature: Option<f32>,
        top_p: Option<f32>,
    ) -> MetaRequest {
        MetaRequest {
            prompt,
            max_gen_len: max_tokens,
            temperature,
            top_p,
        }
    }

    pub fn parse_response(response: MetaResponse) -> Result<String, String> {
        Ok(response.generation)
    }

    pub fn format_request(request: &InvokeModelRequest) -> Result<Value, AppError> {
        let mut prompt = String::new();

        if let Some(system) = &request.system_prompt {
            prompt.push_str(&format!(
                "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{}<|eot_id|>",
                system
            ));
        } else {
            prompt.push_str("<|begin_of_text|>");
        }

        for msg in &request.messages {
            let role = match msg.role {
                AIMessageRole::Assistant => "assistant",
                AIMessageRole::System => "system",
                _ => "user",
            };
            prompt.push_str(&format!(
                "<|start_header_id|>{}<|end_header_id|>\n\n{}<|eot_id|>",
                role, msg.content
            ));
        }

        prompt.push_str("<|start_header_id|>assistant<|end_header_id|>\n\n");

        let body = serde_json::json!({
            "prompt": prompt,
            "max_gen_len": request.max_tokens.unwrap_or(4096),
            "temperature": request.temperature.unwrap_or(0.7),
            "top_p": request.top_p.unwrap_or(0.9)
        });

        Ok(body)
    }

    pub fn parse_model_response(
        response: Value,
        model_id: &str,
    ) -> Result<ModelResponse, AppError> {
        let content = response
            .get("generation")
            .and_then(|text| text.as_str())
            .unwrap_or("")
            .to_string();

        Ok(ModelResponse {
            content,
            model_id: model_id.to_string(),
            usage: Some(Usage {
                input_tokens: response
                    .get("prompt_token_count")
                    .and_then(|t| t.as_i64())
                    .map(|t| t as i32),
                output_tokens: response
                    .get("generation_token_count")
                    .and_then(|t| t.as_i64())
                    .map(|t| t as i32),
                total_tokens: None,
            }),
            finish_reason: response
                .get("stop_reason")
                .and_then(|r| r.as_str())
                .map(|s| s.to_string()),
        })
    }
}
