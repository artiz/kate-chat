use crate::models::message::{Message, MessageRole};
use crate::services::ai::{
    InvokeModelRequest, MessageRole as AIMessageRole, ModelResponse, ToolCallRequest, Usage,
};
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

    pub fn parse_response_chunk(chunk_data: &Value) -> Option<String> {
        // For Anthropic models, extract token from content_block_delta
        if chunk_data.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
            if let Some(delta) = chunk_data.get("delta") {
                if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                    return Some(text.to_string());
                }
            }
        }
        None
    }

    pub fn format_request(request: &InvokeModelRequest) -> Result<Value, AppError> {
        let mut messages: Vec<Value> = Vec::new();
        let mut system_message = request.system_prompt.clone();

        for msg in &request.messages {
            match msg.role {
                AIMessageRole::System => {
                    system_message = Some(msg.content.clone());
                }
                // Tool results become tool_result blocks; consecutive
                // results merge into the single user turn Anthropic requires
                // after an assistant tool_use turn.
                AIMessageRole::Tool => {
                    let block = serde_json::json!({
                        "type": "tool_result",
                        "tool_use_id": msg.tool_call_id.clone().unwrap_or_default(),
                        "content": msg.content,
                    });
                    if let Some(last) = messages.last_mut() {
                        let is_tool_result_turn =
                            last["role"] == "user" && last["content"][0]["type"] == "tool_result";
                        if is_tool_result_turn {
                            if let Some(content) = last["content"].as_array_mut() {
                                content.push(block);
                                continue;
                            }
                        }
                    }
                    messages.push(serde_json::json!({ "role": "user", "content": [block] }));
                }
                // An assistant turn that requested tools replays its raw
                // content blocks (text + tool_use) verbatim.
                AIMessageRole::Assistant if msg.tool_calls.is_some() => {
                    messages.push(serde_json::json!({
                        "role": "assistant",
                        "content": msg.tool_calls.clone(),
                    }));
                }
                AIMessageRole::Assistant => {
                    messages.push(serde_json::json!({
                        "role": "assistant",
                        "content": msg.content,
                    }));
                }
                AIMessageRole::User => {
                    messages.push(serde_json::json!({
                        "role": "user",
                        "content": msg.content,
                    }));
                }
            }
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

        if let Some(tools) = request.tools.as_deref().filter(|t| !t.is_empty()) {
            body["tools"] = serde_json::json!(tools
                .iter()
                .map(|tool| {
                    serde_json::json!({
                        "name": tool.spec.name,
                        "description": tool.spec.description,
                        "input_schema": tool.spec.input_schema,
                    })
                })
                .collect::<Vec<_>>());
        }

        Ok(body)
    }

    pub fn parse_model_response(
        response: Value,
        model_id: &str,
    ) -> Result<ModelResponse, AppError> {
        let blocks = response
            .get("content")
            .and_then(|c| c.as_array())
            .cloned()
            .unwrap_or_default();

        let content = blocks
            .iter()
            .filter_map(|block| block.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("");

        let tool_calls = blocks
            .iter()
            .filter(|block| block.get("type").and_then(|t| t.as_str()) == Some("tool_use"))
            .map(|block| ToolCallRequest {
                id: block
                    .get("id")
                    .and_then(|id| id.as_str())
                    .unwrap_or("unknown_id")
                    .to_string(),
                name: block
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or_default()
                    .to_string(),
                arguments: block
                    .get("input")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({})),
                raw: block.clone(),
            })
            .collect();

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
            tool_calls,
            usage,
            finish_reason: response
                .get("stop_reason")
                .and_then(|r| r.as_str())
                .map(|s| s.to_string()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::ai::{ExecutableTool, ModelMessage, ToolBackend, ToolSpec};

    fn request_with_tools() -> InvokeModelRequest {
        InvokeModelRequest {
            model_id: "anthropic.claude-3-haiku-20240307-v1:0".to_string(),
            messages: vec![
                ModelMessage::text(AIMessageRole::User, "find rust news"),
                ModelMessage {
                    role: AIMessageRole::Assistant,
                    content: String::new(),
                    timestamp: None,
                    tool_calls: Some(json!([{ "type": "tool_use", "id": "t1",
                        "name": "internal_web_search", "input": {"query": "rust"} }])),
                    tool_call_id: None,
                },
                ModelMessage {
                    role: AIMessageRole::Tool,
                    content: "results".to_string(),
                    timestamp: None,
                    tool_calls: None,
                    tool_call_id: Some("t1".to_string()),
                },
            ],
            temperature: None,
            max_tokens: Some(512),
            top_p: None,
            system_prompt: None,
            tools: Some(vec![ExecutableTool {
                spec: ToolSpec {
                    name: "internal_web_search".to_string(),
                    description: "Search the web".to_string(),
                    input_schema: json!({"type": "object"}),
                },
                backend: ToolBackend::WebSearch {
                    api_key: "k".to_string(),
                    folder_id: "f".to_string(),
                    api_url: None,
                },
            }]),
        }
    }

    #[test]
    fn formats_tool_turns_and_tools() {
        let body = AnthropicProvider::format_request(&request_with_tools()).unwrap();
        assert_eq!(body["tools"][0]["name"], "internal_web_search");
        // assistant tool_use replay
        assert_eq!(body["messages"][1]["content"][0]["type"], "tool_use");
        // tool result becomes a user turn with a tool_result block
        assert_eq!(body["messages"][2]["role"], "user");
        assert_eq!(body["messages"][2]["content"][0]["type"], "tool_result");
        assert_eq!(body["messages"][2]["content"][0]["tool_use_id"], "t1");
    }

    #[test]
    fn parses_tool_use_response() {
        let response = json!({
            "content": [
                { "type": "text", "text": "Let me search." },
                { "type": "tool_use", "id": "t2", "name": "internal_web_search",
                  "input": { "query": "rust" } },
            ],
            "stop_reason": "tool_use",
        });
        let parsed = AnthropicProvider::parse_model_response(response, "model").unwrap();
        assert_eq!(parsed.content, "Let me search.");
        assert_eq!(parsed.tool_calls.len(), 1);
        assert_eq!(parsed.tool_calls[0].id, "t2");
        assert_eq!(parsed.tool_calls[0].arguments["query"], "rust");
        assert_eq!(parsed.finish_reason.as_deref(), Some("tool_use"));
    }
}
