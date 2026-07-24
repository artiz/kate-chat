//! OpenAI Responses API protocol (`POST /responses`) — Node's
//! OpenAIResponsesProtocol. Used for OpenAI models that support the
//! Responses API (gpt-5 / gpt-4.1 / gpt-4o / o-series) and for custom
//! models configured with `protocol: OPENAI_RESPONSES`.
//!
//! Tool calling runs through `previous_response_id` + `function_call_output`
//! items rather than replayed chat history; local tools (web search, MCP)
//! are exposed as `function` tools like the chat-completions path.

use futures_util::StreamExt;
use serde_json::{json, Value};
use std::future::Future;
use std::pin::Pin;
use tracing::{debug, warn};

use crate::services::ai::{
    ExecutedToolCall, InvokeModelRequest, MessageRole, ModelResponse, StreamCallbacks,
    ToolCallRequest, Usage, TOOL_CYCLES_LIMIT,
};
use crate::services::openai_protocol::OpenAIProtocol;
use crate::services::tools::execute_tool_call;
use crate::utils::errors::AppError;

/// Models served through the Responses API (Node's
/// OPENAI_MODELS_SUPPORT_RESPONSES_API, prefix-matched).
pub const RESPONSES_MODEL_PREFIXES: &[&str] =
    &["gpt-5", "gpt-4.1", "gpt-4o", "o1", "o3", "o4-mini"];

/// Reasoning models reject sampling params (Node deletes temperature).
const NO_SAMPLING_PREFIXES: &[&str] = &["o1", "o3", "o4", "gpt-4o", "gpt-5"];

pub fn uses_responses_api(model_id: &str) -> bool {
    RESPONSES_MODEL_PREFIXES.iter().any(|p| {
        model_id == *p || model_id.starts_with(&format!("{}-", p)) || model_id.starts_with(*p)
    })
}

pub struct OpenAIResponsesProtocol {
    inner: OpenAIProtocol,
}

impl OpenAIResponsesProtocol {
    pub fn new(inner: OpenAIProtocol) -> Self {
        Self { inner }
    }

    /// Build the `POST /responses` body from an invoke request.
    pub fn build_responses_body(&self, request: &InvokeModelRequest, stream: bool) -> Value {
        let model = self.inner.effective_model_id(&request.model_id);

        let input: Vec<Value> = request
            .messages
            .iter()
            .filter(|m| !matches!(m.role, MessageRole::Tool))
            .map(|m| {
                let role = match m.role {
                    MessageRole::User => "user",
                    MessageRole::Assistant => "assistant",
                    MessageRole::System => "developer",
                    MessageRole::Tool => unreachable!(),
                };
                json!({ "role": role, "content": m.content })
            })
            .collect();

        let mut body = json!({ "model": model, "input": input });
        if stream {
            body["stream"] = json!(true);
        }
        if let Some(prompt) = request.system_prompt.as_deref().filter(|p| !p.is_empty()) {
            body["instructions"] = json!(prompt);
        }
        if let Some(max_tokens) = request.max_tokens {
            body["max_output_tokens"] = json!(max_tokens.max(16));
        }
        let no_sampling = NO_SAMPLING_PREFIXES.iter().any(|p| model.starts_with(p));
        if !no_sampling {
            if let Some(temperature) = request.temperature {
                body["temperature"] = json!(temperature);
            }
        }
        if model.starts_with("gpt-5") {
            body["reasoning"] = json!({ "effort": "minimal" });
        }
        if let Some(tools) = request.tools.as_deref().filter(|t| !t.is_empty()) {
            body["tools"] = Value::Array(
                tools
                    .iter()
                    .map(|tool| {
                        json!({
                            "type": "function",
                            "name": tool.spec.name,
                            "description": tool.spec.description,
                            "parameters": tool.spec.input_schema,
                            "strict": false,
                        })
                    })
                    .collect(),
            );
        }
        body
    }

    fn parse_output(response: &Value) -> (String, Vec<ToolCallRequest>) {
        let mut content = String::new();
        let mut calls = Vec::new();
        for item in response
            .get("output")
            .and_then(|o| o.as_array())
            .map(|a| a.as_slice())
            .unwrap_or_default()
        {
            match item.get("type").and_then(|t| t.as_str()) {
                Some("message") => {
                    for part in item
                        .get("content")
                        .and_then(|c| c.as_array())
                        .map(|a| a.as_slice())
                        .unwrap_or_default()
                    {
                        if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                            content.push_str(text);
                        } else if let Some(refusal) = part.get("refusal").and_then(|r| r.as_str()) {
                            content.push_str(refusal);
                        }
                    }
                }
                Some("function_call") => {
                    let arguments = item
                        .get("arguments")
                        .and_then(|a| a.as_str())
                        .and_then(|a| serde_json::from_str(a).ok())
                        .unwrap_or_else(|| json!({}));
                    calls.push(ToolCallRequest {
                        id: item
                            .get("call_id")
                            .and_then(|c| c.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        name: item
                            .get("name")
                            .and_then(|n| n.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        arguments,
                        raw: item.clone(),
                    });
                }
                _ => {}
            }
        }
        (content, calls)
    }

    fn parse_usage(response: &Value) -> Option<Usage> {
        response.get("usage").map(|usage| Usage {
            input_tokens: usage
                .get("input_tokens")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32),
            output_tokens: usage
                .get("output_tokens")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32),
            total_tokens: usage
                .get("total_tokens")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32),
        })
    }

    /// Execute requested function calls and build the continuation body
    /// (`previous_response_id` + `function_call_output` items).
    async fn continuation_body(
        &self,
        request: &InvokeModelRequest,
        previous_response_id: &str,
        calls: Vec<ToolCallRequest>,
        executed: &mut Vec<ExecutedToolCall>,
        stream: bool,
    ) -> Value {
        let tools = request.tools.clone().unwrap_or_default();
        let mut outputs = Vec::new();
        for call in calls {
            let call_id = call.id.clone();
            let (message, record) = execute_tool_call(&tools, &call).await;
            executed.push(record);
            outputs.push(json!({
                "type": "function_call_output",
                "call_id": call_id,
                "output": message.content,
            }));
        }
        let mut body = self.build_responses_body(request, stream);
        body["previous_response_id"] = json!(previous_response_id);
        body["input"] = Value::Array(outputs);
        body
    }

    pub async fn invoke(&self, request: &InvokeModelRequest) -> Result<ModelResponse, AppError> {
        let mut executed: Vec<ExecutedToolCall> = Vec::new();
        let mut body = self.build_responses_body(request, false);

        for _cycle in 0..TOOL_CYCLES_LIMIT {
            debug!("Responses API request for {}", body["model"]);
            let response = self
                .inner
                .post("/responses")
                .json(&body)
                .send()
                .await
                .map_err(|e| AppError::Http(e.to_string()))?;
            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                return Err(self.inner.api_error(status, &text));
            }
            let payload: Value = response
                .json()
                .await
                .map_err(|e| AppError::Http(e.to_string()))?;

            let (content, calls) = Self::parse_output(&payload);
            if calls.is_empty() {
                return Ok(ModelResponse {
                    content,
                    model_id: request.model_id.clone(),
                    usage: Self::parse_usage(&payload),
                    finish_reason: payload
                        .get("status")
                        .and_then(|s| s.as_str())
                        .map(String::from),
                    tool_calls: vec![],
                });
            }
            let response_id = payload
                .get("id")
                .and_then(|i| i.as_str())
                .unwrap_or_default()
                .to_string();
            body = self
                .continuation_body(request, &response_id, calls, &mut executed, false)
                .await;
        }
        Err(AppError::Internal(
            "Responses API tool call cycles limit exceeded".to_string(),
        ))
    }

    pub async fn invoke_stream<F, C, E>(
        &self,
        request: &InvokeModelRequest,
        callbacks: &StreamCallbacks<F, C, E>,
    ) -> Result<Vec<ExecutedToolCall>, AppError>
    where
        F: Fn(String) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
        C: Fn(String) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
        E: Fn(AppError) -> Pin<Box<dyn Future<Output = ()> + Send>> + Send + Sync,
    {
        let mut executed: Vec<ExecutedToolCall> = Vec::new();
        let mut full_response = String::new();
        let mut body = self.build_responses_body(request, true);

        for _cycle in 0..TOOL_CYCLES_LIMIT {
            debug!("Responses API stream for {}", body["model"]);
            let response = self
                .inner
                .post("/responses")
                .json(&body)
                .send()
                .await
                .map_err(|e| AppError::Http(e.to_string()))?;
            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                let error = self.inner.api_error(status, &text);
                (callbacks.on_error)(error.clone()).await;
                return Err(error);
            }

            let mut stream = response.bytes_stream();
            let mut line_buffer = String::new();
            let mut pending_calls: Vec<ToolCallRequest> = Vec::new();
            let mut response_id = String::new();
            let mut got_error: Option<AppError> = None;

            'outer: while let Some(chunk) = stream.next().await {
                let chunk = match chunk {
                    Ok(chunk) => chunk,
                    Err(e) => {
                        let error = AppError::Http(format!("Stream error: {}", e));
                        (callbacks.on_error)(error.clone()).await;
                        return Err(error);
                    }
                };
                line_buffer.push_str(&String::from_utf8_lossy(&chunk));

                while let Some(newline_pos) = line_buffer.find('\n') {
                    let line: String = line_buffer.drain(..=newline_pos).collect();
                    let line = line.trim();
                    if line.is_empty() || line.starts_with(':') || line.starts_with("event:") {
                        continue;
                    }
                    let Some(data) = line.strip_prefix("data: ").or(Some(line)) else {
                        continue;
                    };
                    if data == "[DONE]" {
                        break 'outer;
                    }
                    let event: Value = match serde_json::from_str(data) {
                        Ok(event) => event,
                        Err(e) => {
                            warn!("Responses stream: bad event: {} — {}", data, e);
                            continue;
                        }
                    };

                    match event.get("type").and_then(|t| t.as_str()) {
                        Some("response.created") | Some("response.queued") => {
                            if let Some(id) = event
                                .get("response")
                                .and_then(|r| r.get("id"))
                                .and_then(|i| i.as_str())
                            {
                                response_id = id.to_string();
                            }
                        }
                        Some("response.output_text.delta") => {
                            if let Some(delta) = event.get("delta").and_then(|d| d.as_str()) {
                                if !delta.is_empty() {
                                    full_response.push_str(delta);
                                    (callbacks.on_token)(delta.to_string()).await;
                                }
                            }
                        }
                        Some("response.output_item.done") => {
                            let item = event.get("item").cloned().unwrap_or_default();
                            if item.get("type").and_then(|t| t.as_str()) == Some("function_call") {
                                let arguments = item
                                    .get("arguments")
                                    .and_then(|a| a.as_str())
                                    .and_then(|a| serde_json::from_str(a).ok())
                                    .unwrap_or_else(|| json!({}));
                                pending_calls.push(ToolCallRequest {
                                    id: item
                                        .get("call_id")
                                        .and_then(|c| c.as_str())
                                        .unwrap_or_default()
                                        .to_string(),
                                    name: item
                                        .get("name")
                                        .and_then(|n| n.as_str())
                                        .unwrap_or_default()
                                        .to_string(),
                                    arguments,
                                    raw: item,
                                });
                            }
                        }
                        Some("response.completed") | Some("response.incomplete") => {
                            if let Some(id) = event
                                .get("response")
                                .and_then(|r| r.get("id"))
                                .and_then(|i| i.as_str())
                            {
                                response_id = id.to_string();
                            }
                            break 'outer;
                        }
                        Some("error") => {
                            let message = event
                                .get("message")
                                .and_then(|m| m.as_str())
                                .unwrap_or("Responses stream error")
                                .to_string();
                            got_error = Some(AppError::Internal(message));
                            break 'outer;
                        }
                        _ => {}
                    }
                }
            }

            if let Some(error) = got_error {
                (callbacks.on_error)(error.clone()).await;
                return Err(error);
            }
            if pending_calls.is_empty() {
                (callbacks.on_complete)(full_response).await;
                return Ok(executed);
            }
            body = self
                .continuation_body(request, &response_id, pending_calls, &mut executed, true)
                .await;
        }

        let error = AppError::Internal("Responses API tool call cycles limit exceeded".to_string());
        (callbacks.on_error)(error.clone()).await;
        Err(error)
    }

    /// Cancel an in-flight background response (`POST /responses/{id}/cancel`).
    pub async fn cancel(&self, response_id: &str) -> Result<(), AppError> {
        let response = self
            .inner
            .post(&format!("/responses/{}/cancel", response_id))
            .send()
            .await
            .map_err(|e| AppError::Http(e.to_string()))?;
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(self.inner.api_error(status, &text));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::ai::ModelMessage;

    fn request(model: &str) -> InvokeModelRequest {
        InvokeModelRequest {
            model_id: model.to_string(),
            messages: vec![ModelMessage::text(MessageRole::User, "hi")],
            temperature: Some(0.5),
            max_tokens: Some(100),
            top_p: None,
            system_prompt: Some("be brief".to_string()),
            tools: None,
        }
    }

    #[test]
    fn detects_responses_models() {
        for id in [
            "gpt-5",
            "gpt-5-mini",
            "gpt-4.1-nano",
            "gpt-4o",
            "o3-mini",
            "o4-mini",
        ] {
            assert!(uses_responses_api(id), "{}", id);
        }
        for id in ["gpt-3.5-turbo", "deepseek-chat", "llama3"] {
            assert!(!uses_responses_api(id), "{}", id);
        }
    }

    #[test]
    fn builds_responses_body() {
        let protocol = OpenAIResponsesProtocol::new(OpenAIProtocol::new(
            "https://api.openai.com/v1",
            None,
            None,
            "OpenAI",
        ));
        let body = protocol.build_responses_body(&request("gpt-4.1"), false);
        assert_eq!(body["model"], "gpt-4.1");
        assert_eq!(body["instructions"], "be brief");
        assert_eq!(body["max_output_tokens"], 100);
        assert_eq!(body["temperature"], 0.5);
        assert_eq!(body["input"][0]["role"], "user");
        assert!(body.get("stream").is_none());
    }

    #[test]
    fn reasoning_models_drop_sampling_and_get_effort() {
        let protocol = OpenAIResponsesProtocol::new(OpenAIProtocol::new(
            "https://api.openai.com/v1",
            None,
            None,
            "OpenAI",
        ));
        let body = protocol.build_responses_body(&request("gpt-5-mini"), true);
        assert!(body.get("temperature").is_none());
        assert_eq!(body["reasoning"]["effort"], "minimal");
        assert_eq!(body["stream"], true);
    }

    #[test]
    fn parses_output_items() {
        let payload = serde_json::json!({
            "output": [
                { "type": "message", "content": [ { "type": "output_text", "text": "Hello" } ] },
                { "type": "function_call", "call_id": "c1", "name": "web_search",
                  "arguments": "{\"query\":\"rust\"}" }
            ],
            "usage": { "input_tokens": 5, "output_tokens": 2, "total_tokens": 7 }
        });
        let (content, calls) = OpenAIResponsesProtocol::parse_output(&payload);
        assert_eq!(content, "Hello");
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "web_search");
        assert_eq!(calls[0].arguments["query"], "rust");
    }
}
