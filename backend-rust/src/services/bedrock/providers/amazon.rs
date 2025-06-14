use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::models::message::{Message, MessageRole};

#[derive(Debug, Serialize)]
pub struct AmazonRequestMessage {
    pub role: String,
    pub content: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct AmazonInferenceConfig {
    #[serde(rename = "maxTokens")]
    pub max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(rename = "topP", skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(rename = "stopSequences")]
    pub stop_sequences: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct AmazonSystemMessage {
    pub text: String,
}

#[derive(Debug, Serialize)]
pub struct AmazonNovaRequest {
    pub messages: Vec<AmazonRequestMessage>,
    #[serde(rename = "inferenceConfig")]
    pub inference_config: AmazonInferenceConfig,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<Vec<AmazonSystemMessage>>,
}

#[derive(Debug, Serialize)]
pub struct AmazonTitanTextGenerationConfig {
    #[serde(rename = "maxTokenCount")]
    pub max_token_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(rename = "topP", skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(rename = "stopSequences")]
    pub stop_sequences: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct AmazonTitanRequest {
    #[serde(rename = "inputText")]
    pub input_text: String,
    #[serde(rename = "textGenerationConfig")]
    pub text_generation_config: AmazonTitanTextGenerationConfig,
}

#[derive(Debug, Deserialize)]
pub struct AmazonNovaUsage {
    #[serde(rename = "inputTokens")]
    pub input_tokens: Option<u32>,
    #[serde(rename = "outputTokens")]
    pub output_tokens: Option<u32>,
    #[serde(rename = "totalTokens")]
    pub total_tokens: Option<u32>,
    #[serde(rename = "cacheReadInputTokenCount")]
    pub cache_read_input_token_count: Option<u32>,
    #[serde(rename = "cacheWriteInputTokenCount")]
    pub cache_write_input_token_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct AmazonNovaMessage {
    pub content: Vec<AmazonNovaContentPart>,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct AmazonNovaContentPart {
    pub text: String,
}

#[derive(Debug, Deserialize)]
pub struct AmazonNovaOutput {
    pub message: AmazonNovaMessage,
}

#[derive(Debug, Deserialize)]
pub struct AmazonNovaResponse {
    pub output: AmazonNovaOutput,
    #[serde(rename = "stopReason")]
    pub stop_reason: Option<String>,
    pub usage: Option<AmazonNovaUsage>,
}

#[derive(Debug, Deserialize)]
pub struct AmazonTitanResult {
    #[serde(rename = "outputText")]
    pub output_text: String,
}

#[derive(Debug, Deserialize)]
pub struct AmazonTitanResponse {
    pub results: Vec<AmazonTitanResult>,
    #[serde(rename = "stopReason")]
    pub stop_reason: Option<String>,
}

pub struct AmazonProvider;

impl AmazonProvider {
    pub fn is_titan_model(model_id: &str) -> bool {
        model_id.starts_with("amazon.titan")
    }

    pub fn format_messages_for_nova(messages: &[Message]) -> Vec<AmazonRequestMessage> {
        messages.iter().map(|msg| {
            let role = match msg.get_role() {
                MessageRole::Assistant => "assistant",
                _ => "user",
            };

            let content = if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(msg.get_body()) {
                if parsed.is_array() {
                    // Handle structured content with images/video/text
                    parsed.as_array()
                        .unwrap_or(&vec![])
                        .iter()
                        .filter_map(|part| {
                            if let Some(obj) = part.as_object() {
                                if let Some(content_type) = obj.get("contentType").and_then(|v| v.as_str()) {
                                    match content_type {
                                        "image" | "video" => {
                                            if let Some(content) = obj.get("content").and_then(|v| v.as_str()) {
                                                // Parse data URL format: data:image/type;base64,data or data:video/type;base64,data
                                                if let Some(captures) = regex::Regex::new(r"^data:(image|video)/([^;]+);base64,(.*)$")
                                                    .unwrap()
                                                    .captures(content) {
                                                    let media_format = captures.get(1).unwrap().as_str();
                                                    let media_type = captures.get(2).unwrap().as_str();
                                                    let base64_data = captures.get(3).unwrap().as_str();
                                                    
                                                    if media_format == "image" {
                                                        return Some(json!({
                                                            "image": {
                                                                "format": media_type,
                                                                "source": {
                                                                    "bytes": base64_data
                                                                }
                                                            }
                                                        }));
                                                    } else if media_format == "video" {
                                                        return Some(json!({
                                                            "video": {
                                                                "format": media_type,
                                                                "source": {
                                                                    "bytes": base64_data
                                                                }
                                                            }
                                                        }));
                                                    }
                                                }
                                            }
                                        },
                                        "text" => {
                                            if let Some(content) = obj.get("content").and_then(|v| v.as_str()) {
                                                return Some(json!({
                                                    "text": content
                                                }));
                                            }
                                        },
                                        _ => {}
                                    }
                                }
                            }
                            None
                        })
                        .collect()
                } else {
                    vec![json!({"text": msg.get_body()})]
                }
            } else {
                vec![json!({"text": msg.get_body()})]
            };

            AmazonRequestMessage {
                role: role.to_string(),
                content,
            }
        }).collect()
    }

    pub fn format_messages_for_titan(messages: &[Message]) -> String {
        let mut prompt = String::new();

        for msg in messages {
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

            match msg.get_role() {
                MessageRole::User => prompt.push_str(&format!("Human: {}\n", content)),
                MessageRole::Assistant => prompt.push_str(&format!("Assistant: {}\n", content)),
                MessageRole::System => {
                    // Prepend system message
                    prompt = format!("System: {}\n{}", content, prompt);
                }
            }
        }

        // Add the final assistant prompt
        prompt.push_str("Assistant:");
        prompt
    }

    pub fn create_nova_request_body(
        messages: Vec<AmazonRequestMessage>,
        system_prompt: Option<String>,
        max_tokens: u32,
        temperature: Option<f32>,
        top_p: Option<f32>,
    ) -> AmazonNovaRequest {
        let system = system_prompt.map(|prompt| vec![AmazonSystemMessage { text: prompt }]);

        AmazonNovaRequest {
            messages,
            inference_config: AmazonInferenceConfig {
                max_tokens,
                temperature,
                top_p,
                stop_sequences: vec![],
            },
            system,
        }
    }

    pub fn create_titan_request_body(
        input_text: String,
        max_tokens: u32,
        temperature: Option<f32>,
        top_p: Option<f32>,
    ) -> AmazonTitanRequest {
        AmazonTitanRequest {
            input_text,
            text_generation_config: AmazonTitanTextGenerationConfig {
                max_token_count: max_tokens,
                temperature,
                top_p,
                stop_sequences: vec![],
            },
        }
    }

    pub fn parse_nova_response(response: AmazonNovaResponse) -> Result<String, String> {
        let content = response.output.message.content
            .iter()
            .map(|part| part.text.as_str())
            .collect::<Vec<&str>>()
            .join("");
        
        if content.is_empty() {
            Err("No text content found in Nova response".to_string())
        } else {
            Ok(content)
        }
    }

    pub fn parse_titan_response(response: AmazonTitanResponse) -> Result<String, String> {
        if let Some(result) = response.results.first() {
            Ok(result.output_text.clone())
        } else {
            Err("No results found in Titan response".to_string())
        }
    }
}
