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

/// Reasoning token-budget bounds (Node's ai.reasoningMinTokenBudget /
/// reasoningMaxTokenBudget). The budget maps to an effort level.
const REASONING_MIN_TOKEN_BUDGET: i32 = 1024;
const REASONING_MAX_TOKEN_BUDGET: i32 = 16000;

/// Native web-search tool-call name in Responses output (Node's
/// NATIVE_WEB_SEARCH_TOOL_NAME).
pub const NATIVE_WEB_SEARCH_TOOL_NAME: &str = "web_search";

/// Clamp a reasoning effort to what the model accepts. "pro" reasoning
/// models (gpt-5-pro, gpt-5.5-pro, …) reject "minimal"/"low" — their
/// minimum is "medium" (they support medium/high/xhigh).
fn clamp_reasoning_effort<'a>(model: &str, effort: &'a str) -> &'a str {
    if model.contains("pro") && matches!(effort, "minimal" | "low") {
        "medium"
    } else {
        effort
    }
}

/// Build an ExecutedToolCall record from a native `web_search_call` output
/// item (Node records the query into metadata.toolCalls for display).
fn native_web_search_record(item: &Value) -> ExecutedToolCall {
    let action = item.get("action");
    let query = action
        .and_then(|a| a.get("queries"))
        .and_then(|q| q.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|q| q.as_str())
                .collect::<Vec<_>>()
                .join("\n\n")
        })
        .filter(|s| !s.is_empty())
        .or_else(|| {
            action
                .and_then(|a| a.get("query"))
                .and_then(|q| q.as_str())
                .map(String::from)
        })
        .unwrap_or_default();
    ExecutedToolCall {
        id: item
            .get("id")
            .and_then(|i| i.as_str())
            .unwrap_or_default()
            .to_string(),
        name: NATIVE_WEB_SEARCH_TOOL_NAME.to_string(),
        args_json: json!({ "query": query }).to_string(),
        content: String::new(),
    }
}

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
                // A turn carrying inline files serializes its content as an
                // items array: textual files as input_text, PDFs as
                // input_file (files are user-provided context).
                if !m.files.is_empty() {
                    let mut parts = Vec::new();
                    if !m.content.is_empty() {
                        parts.push(json!({ "type": "input_text", "text": m.content }));
                    }
                    for file in &m.files {
                        if let Some(text) = &file.text {
                            parts.push(json!({
                                "type": "input_text",
                                "text": format!("File \"{}\":\n\n{}", file.name, text),
                            }));
                        } else if let Some(base64) = &file.base64 {
                            parts.push(json!({
                                "type": "input_file",
                                "filename": file.name,
                                "file_data": format!("data:{};base64,{}", file.mime_type, base64),
                            }));
                        }
                    }
                    return json!({ "role": "user", "content": parts });
                }
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

        // Native provider tool blocks (web_search / code_interpreter) plus
        // any local function tools (MCP, etc.).
        let mut tools: Vec<Value> = Vec::new();
        let has_native_web_search = request.native_tools.iter().any(|t| t == "web_search");
        if has_native_web_search {
            tools.push(json!({ "type": "web_search", "search_context_size": "low" }));
        }
        if request.native_tools.iter().any(|t| t == "code_interpreter") {
            tools.push(json!({ "type": "code_interpreter", "container": { "type": "auto" } }));
        }
        if let Some(function_tools) = request.tools.as_deref() {
            for tool in function_tools {
                tools.push(json!({
                    "type": "function",
                    "name": tool.spec.name,
                    "description": tool.spec.description,
                    "parameters": tool.spec.input_schema,
                    "strict": false,
                }));
            }
        }
        if !tools.is_empty() {
            body["tools"] = Value::Array(tools);
        }

        // Reasoning ("thinking") effort mapped from the token budget
        // (Node's formatResponsesRequest).
        if request.thinking.unwrap_or(false) {
            let budget = request
                .thinking_budget
                .unwrap_or(REASONING_MIN_TOKEN_BUDGET)
                .max(0);
            let max_budget = REASONING_MAX_TOKEN_BUDGET as f64;
            let mut effort = if (budget as f64) < max_budget * 0.1 {
                "minimal"
            } else if (budget as f64) < max_budget * 0.25 {
                "low"
            } else if (budget as f64) < max_budget * 0.75 {
                "medium"
            } else {
                "high"
            };
            // gpt-5 with native web_search cannot use "minimal".
            if model.starts_with("gpt-5") && has_native_web_search && effort == "minimal" {
                effort = "medium";
            }
            body["reasoning"] =
                json!({ "effort": clamp_reasoning_effort(&model, effort), "summary": "auto" });
        } else if model.starts_with("gpt-5") {
            // Reasoning-cancellation default for the gpt-5 family (Node
            // parity): minimal where supported, clamped up for models that
            // reject it (e.g. gpt-5-pro / gpt-5.5-pro require medium+).
            body["reasoning"] = json!({ "effort": clamp_reasoning_effort(&model, "minimal") });
        }
        body
    }

    fn parse_output(response: &Value) -> (String, Vec<ToolCallRequest>, Vec<ExecutedToolCall>) {
        let mut content = String::new();
        let mut calls = Vec::new();
        let mut executed = Vec::new();
        for item in response
            .get("output")
            .and_then(|o| o.as_array())
            .map(|a| a.as_slice())
            .unwrap_or_default()
        {
            match item.get("type").and_then(|t| t.as_str()) {
                Some("web_search_call") => executed.push(native_web_search_record(item)),
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
        (content, calls, executed)
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

            let (content, calls, native_executed) = Self::parse_output(&payload);
            executed.extend(native_executed);
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
                    audios: vec![],
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
                            match item.get("type").and_then(|t| t.as_str()) {
                                Some("function_call") => {
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
                                // Native web_search executes server-side; record
                                // it for the assistant message's tool badges.
                                Some("web_search_call") => {
                                    executed.push(native_web_search_record(&item));
                                }
                                _ => {}
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
            native_tools: vec![],
            thinking: None,
            thinking_budget: None,
            voice: None,
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

        // "pro" reasoning models reject minimal — clamp up to medium.
        let pro = protocol.build_responses_body(&request("gpt-5.5-pro"), false);
        assert_eq!(pro["reasoning"]["effort"], "medium");
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
        let (content, calls, _executed) = OpenAIResponsesProtocol::parse_output(&payload);
        assert_eq!(content, "Hello");
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "web_search");
        assert_eq!(calls[0].arguments["query"], "rust");
    }

    #[test]
    fn serializes_native_tools_and_reasoning() {
        let protocol = OpenAIResponsesProtocol::new(OpenAIProtocol::new(
            "https://api.openai.com/v1",
            None,
            None,
            "OpenAI",
        ));
        let mut req = request("gpt-5");
        req.native_tools = vec!["web_search".to_string(), "code_interpreter".to_string()];
        req.thinking = Some(true);
        req.thinking_budget = Some(1000); // < 10% of max → would be minimal, bumped to medium
        let body = protocol.build_responses_body(&req, true);
        let tools = body["tools"].as_array().unwrap();
        assert_eq!(tools[0]["type"], "web_search");
        assert_eq!(tools[0]["search_context_size"], "low");
        assert_eq!(tools[1]["type"], "code_interpreter");
        assert_eq!(tools[1]["container"]["type"], "auto");
        // gpt-5 + web_search cannot use "minimal" → bumped to "medium"
        assert_eq!(body["reasoning"]["effort"], "medium");
        assert_eq!(body["reasoning"]["summary"], "auto");
    }

    #[test]
    fn inline_files_serialize_input_file_items() {
        let protocol = OpenAIResponsesProtocol::new(OpenAIProtocol::new(
            "https://api.openai.com/v1",
            None,
            None,
            "OpenAI",
        ));
        let mut req = request("gpt-4.1");
        req.messages = vec![crate::services::ai::ModelMessage {
            role: MessageRole::User,
            content: "read this".to_string(),
            timestamp: None,
            tool_calls: None,
            tool_call_id: None,
            audio: None,
            files: vec![crate::services::ai::ModelFile {
                s3_key: "c/m/doc.pdf".to_string(),
                name: "doc.pdf".to_string(),
                mime_type: "application/pdf".to_string(),
                text: None,
                base64: Some("QUJD".to_string()),
            }],
        }];
        let body = protocol.build_responses_body(&req, false);
        let content = &body["input"][0]["content"];
        assert_eq!(content[0]["type"], "input_text");
        assert_eq!(content[1]["type"], "input_file");
        assert_eq!(content[1]["filename"], "doc.pdf");
        assert_eq!(content[1]["file_data"], "data:application/pdf;base64,QUJD");
    }

    #[test]
    fn parses_native_web_search_call() {
        let payload = serde_json::json!({
            "output": [
                { "type": "web_search_call", "id": "ws_1",
                  "action": { "type": "search", "query": "rust async" } },
                { "type": "message", "content": [ { "type": "output_text", "text": "Done" } ] }
            ]
        });
        let (content, calls, executed) = OpenAIResponsesProtocol::parse_output(&payload);
        assert_eq!(content, "Done");
        assert!(calls.is_empty());
        assert_eq!(executed.len(), 1);
        assert_eq!(executed[0].name, "web_search");
        assert!(executed[0].args_json.contains("rust async"));
    }
}
