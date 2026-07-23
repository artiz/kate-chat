//! Shared OpenAI-compatible protocol client: chat completions (with SSE
//! streaming), embeddings and images generations against any base URL that
//! speaks the OpenAI REST surface. The OpenAI, Yandex (OpenAI-compatible
//! endpoint) and custom REST model providers are all thin wrappers around
//! this client — mirroring the Node API's `protocols/openai.*` layering.

use futures_util::StreamExt;
use reqwest::Client;
use serde_json::{json, Value};
use std::future::Future;
use std::pin::Pin;
use tracing::{debug, warn};

use crate::services::ai::{
    ExecutedToolCall, GeneratedImage, InvokeModelRequest, MessageRole, ModelMessage, ModelResponse,
    StreamCallbacks, ToolCallRequest, Usage, TOOL_CYCLES_LIMIT,
};
use crate::services::tools::execute_tool_call;
use crate::utils::errors::AppError;

pub struct OpenAIProtocol {
    client: Client,
    /// e.g. `https://api.openai.com/v1`, `https://ai.api.cloud.yandex.net/v1`
    /// or a custom model's endpoint. Stored without a trailing slash.
    base_url: String,
    /// Full `Authorization` header value (`Bearer <key>` by default;
    /// providers with their own scheme override it, e.g. Yandex `Api-Key …`).
    auth_header: Option<String>,
    /// When set, replaces the requested model id in every call (custom models
    /// store the provider-side model name separately from the KateChat id).
    model_override: Option<String>,
    /// Human-readable provider label used in error messages.
    label: String,
}

impl OpenAIProtocol {
    pub fn new(
        base_url: impl Into<String>,
        api_key: Option<String>,
        model_override: Option<String>,
        label: impl Into<String>,
    ) -> Self {
        let mut base_url = base_url.into();
        while base_url.ends_with('/') {
            base_url.pop();
        }
        Self {
            client: Client::new(),
            base_url,
            auth_header: api_key.map(|key| format!("Bearer {}", key)),
            model_override,
            label: label.into(),
        }
    }

    /// Replace the `Authorization` header value entirely (provider-specific
    /// auth schemes).
    pub fn with_auth_header(mut self, value: impl Into<String>) -> Self {
        self.auth_header = Some(value.into());
        self
    }

    pub fn effective_model_id(&self, requested: &str) -> String {
        self.model_override
            .clone()
            .unwrap_or_else(|| requested.to_string())
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    fn post(&self, path: &str) -> reqwest::RequestBuilder {
        let mut builder = self
            .client
            .post(self.url(path))
            .header("Content-Type", "application/json");
        if let Some(auth) = &self.auth_header {
            builder = builder.header("Authorization", auth);
        }
        builder
    }

    fn get(&self, path: &str) -> reqwest::RequestBuilder {
        let mut builder = self.client.get(self.url(path));
        if let Some(auth) = &self.auth_header {
            builder = builder.header("Authorization", auth);
        }
        builder
    }

    /// Extract the API error message from an OpenAI-style error payload.
    fn api_error(&self, status: reqwest::StatusCode, body: &str) -> AppError {
        let message = serde_json::from_str::<Value>(body)
            .ok()
            .and_then(|v| {
                v.get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| body.to_string());
        AppError::Http(format!(
            "{} API error ({}): {}",
            self.label, status, message
        ))
    }

    pub fn build_completion_body(&self, request: &InvokeModelRequest, stream: bool) -> Value {
        let model_id = self.effective_model_id(&request.model_id);
        let mut messages = Vec::new();

        if let Some(system_prompt) = &request.system_prompt {
            messages.push(json!({ "role": "system", "content": system_prompt }));
        }

        for msg in &request.messages {
            match msg.role {
                // A tool result turn replays the id the model assigned to
                // the call.
                MessageRole::Tool => {
                    messages.push(json!({
                        "role": "tool",
                        "tool_call_id": msg.tool_call_id.clone().unwrap_or_default(),
                        "content": msg.content,
                    }));
                }
                // An assistant turn that requested tools replays the raw
                // tool_calls payload verbatim.
                MessageRole::Assistant if msg.tool_calls.is_some() => {
                    let mut entry = json!({
                        "role": "assistant",
                        "tool_calls": msg.tool_calls.clone(),
                    });
                    if !msg.content.is_empty() {
                        entry["content"] = json!(msg.content);
                    }
                    messages.push(entry);
                }
                _ => {
                    let role = match msg.role {
                        MessageRole::Assistant => "assistant",
                        MessageRole::System => "system",
                        _ => "user",
                    };
                    messages.push(json!({ "role": role, "content": msg.content }));
                }
            }
        }

        // OpenAI reasoning models reject sampling params and renamed the
        // token cap to max_completion_tokens (the Node API handles this in
        // its per-provider params processor).
        let reasoning_model = ["o1", "o3", "o4", "gpt-5"]
            .iter()
            .any(|p| model_id.starts_with(p));

        let mut body = json!({ "model": model_id, "messages": messages });

        if stream {
            body["stream"] = json!(true);
        }
        if let Some(max_tokens) = request.max_tokens {
            if reasoning_model {
                body["max_completion_tokens"] = json!(max_tokens);
            } else {
                body["max_tokens"] = json!(max_tokens);
            }
        }
        if !reasoning_model {
            if let Some(temperature) = request.temperature {
                body["temperature"] = json!(temperature);
            }
            if let Some(top_p) = request.top_p {
                body["top_p"] = json!(top_p);
            }
        }

        if let Some(tools) = request.tools.as_deref().filter(|t| !t.is_empty()) {
            body["tools"] = json!(tools
                .iter()
                .map(|tool| {
                    json!({
                        "type": "function",
                        "function": {
                            "name": tool.spec.name,
                            "description": tool.spec.description,
                            "parameters": tool.spec.input_schema,
                        },
                    })
                })
                .collect::<Vec<_>>());
        }

        body
    }

    /// Parse raw `tool_calls` entries (message or accumulated stream deltas)
    /// into tool call requests. Malformed argument JSON degrades to `{}` —
    /// the tool itself reports the missing arguments back to the model.
    fn parse_tool_calls(entries: &[Value]) -> Vec<ToolCallRequest> {
        entries
            .iter()
            .filter_map(|entry| {
                let function = entry.get("function")?;
                let name = function.get("name")?.as_str()?.to_string();
                let id = entry
                    .get("id")
                    .and_then(|id| id.as_str())
                    .unwrap_or("unknown_id")
                    .to_string();
                let arguments = function
                    .get("arguments")
                    .and_then(|a| a.as_str())
                    .filter(|a| !a.trim().is_empty())
                    .and_then(|a| serde_json::from_str(a).ok())
                    .unwrap_or_else(|| json!({}));
                Some(ToolCallRequest {
                    id,
                    name,
                    arguments,
                    raw: entry.clone(),
                })
            })
            .collect()
    }

    /// Execute the requested tool calls and extend the session with the
    /// assistant tool_calls turn plus one Tool-role result turn per call.
    async fn run_tool_calls(
        session: &mut InvokeModelRequest,
        executed: &mut Vec<ExecutedToolCall>,
        raw_calls: Vec<Value>,
    ) {
        let calls = Self::parse_tool_calls(&raw_calls);
        session.messages.push(ModelMessage {
            role: MessageRole::Assistant,
            content: String::new(),
            timestamp: None,
            tool_calls: Some(Value::Array(raw_calls)),
            tool_call_id: None,
        });

        let tools = session.tools.clone().unwrap_or_default();
        for call in calls {
            let (message, record) = execute_tool_call(&tools, &call).await;
            executed.push(record);
            session.messages.push(message);
        }
    }

    fn parse_usage(usage: &Value) -> Usage {
        Usage {
            input_tokens: usage
                .get("prompt_tokens")
                .and_then(|t| t.as_i64())
                .map(|t| t as i32),
            output_tokens: usage
                .get("completion_tokens")
                .and_then(|t| t.as_i64())
                .map(|t| t as i32),
            total_tokens: usage
                .get("total_tokens")
                .and_then(|t| t.as_i64())
                .map(|t| t as i32),
        }
    }

    /// POST /chat/completions (non-streaming). Repeats the session cycle
    /// while the model keeps requesting tool calls.
    pub async fn invoke(&self, request: &InvokeModelRequest) -> Result<ModelResponse, AppError> {
        let mut session = request.clone();
        let mut executed: Vec<ExecutedToolCall> = Vec::new();

        for _cycle in 0..TOOL_CYCLES_LIMIT {
            let body = self.build_completion_body(&session, false);
            debug!("{}: chat completion for {}", self.label, body["model"]);

            let response = self
                .post("/chat/completions")
                .json(&body)
                .send()
                .await
                .map_err(|e| AppError::Http(e.to_string()))?;

            if !response.status().is_success() {
                let status = response.status();
                let error_text = response.text().await.unwrap_or_default();
                return Err(self.api_error(status, &error_text));
            }

            let response_json: Value = response.json().await.map_err(|e| {
                AppError::Internal(format!("Failed to parse {} response: {}", self.label, e))
            })?;

            let first_choice = response_json
                .get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first());

            let message = first_choice.and_then(|choice| choice.get("message"));
            let raw_calls = message
                .and_then(|msg| msg.get("tool_calls"))
                .and_then(|calls| calls.as_array())
                .cloned()
                .unwrap_or_default();

            if !raw_calls.is_empty() {
                Self::run_tool_calls(&mut session, &mut executed, raw_calls).await;
                continue;
            }

            let content = message
                .and_then(|msg| msg.get("content"))
                .and_then(|content| content.as_str())
                .unwrap_or("")
                .to_string();

            let finish_reason = first_choice
                .and_then(|choice| choice.get("finish_reason"))
                .and_then(|reason| reason.as_str())
                .map(|s| s.to_string());

            return Ok(ModelResponse {
                content,
                model_id: request.model_id.clone(),
                usage: response_json.get("usage").map(Self::parse_usage),
                finish_reason,
                tool_calls: Vec::new(),
            });
        }

        Err(AppError::Internal(format!(
            "{}: tool call cycles limit exceeded",
            self.label
        )))
    }

    /// POST /chat/completions with `stream: true`, decoding the SSE stream.
    ///
    /// Lines are re-assembled across chunk boundaries before JSON parsing —
    /// a delta may be split between two network reads. When the model
    /// finishes a cycle with tool calls, they are executed and the session
    /// re-invoked (Node's streamChatCompletionLegacy loop).
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
        let mut session = request.clone();
        let mut executed: Vec<ExecutedToolCall> = Vec::new();
        let mut full_response = String::new();

        for _cycle in 0..TOOL_CYCLES_LIMIT {
            let body = self.build_completion_body(&session, true);
            debug!(
                "{}: streaming chat completion for {}",
                self.label, body["model"]
            );

            let response = self
                .post("/chat/completions")
                .json(&body)
                .send()
                .await
                .map_err(|e| AppError::Http(e.to_string()))?;

            if !response.status().is_success() {
                let status = response.status();
                let error_text = response.text().await.unwrap_or_default();
                let app_error = self.api_error(status, &error_text);
                (callbacks.on_error)(app_error.clone()).await;
                return Err(app_error);
            }

            let mut stream = response.bytes_stream();
            let mut line_buffer = String::new();
            // tool_call deltas accumulated by entry index across the stream
            let mut streamed_tool_calls: Vec<Value> = Vec::new();
            let mut tools_requested = false;

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

                // Process complete lines only; keep the trailing partial line.
                while let Some(newline_pos) = line_buffer.find('\n') {
                    let line: String = line_buffer.drain(..=newline_pos).collect();
                    let line = line.trim();

                    if line.is_empty() || line.starts_with(':') {
                        continue;
                    }
                    let data = line.strip_prefix("data: ").unwrap_or(line);
                    if data == "[DONE]" {
                        break 'outer;
                    }

                    let json_data = match serde_json::from_str::<Value>(data) {
                        Ok(json_data) => json_data,
                        Err(e) => {
                            warn!(
                                "{}: failed to parse stream data: {} — {}",
                                self.label, data, e
                            );
                            continue;
                        }
                    };

                    let choice = json_data
                        .get("choices")
                        .and_then(|c| c.as_array())
                        .and_then(|arr| arr.first());
                    let delta = choice.and_then(|choice| choice.get("delta"));

                    if let Some(calls) = delta
                        .and_then(|delta| delta.get("tool_calls"))
                        .and_then(|calls| calls.as_array())
                    {
                        Self::merge_tool_call_deltas(&mut streamed_tool_calls, calls);
                    } else if let Some(token) = delta
                        .and_then(|delta| delta.get("content"))
                        .and_then(|content| content.as_str())
                    {
                        if !token.is_empty() {
                            full_response.push_str(token);
                            (callbacks.on_token)(token.to_string()).await;
                        }
                    }

                    let finish_reason = choice
                        .and_then(|choice| choice.get("finish_reason"))
                        .and_then(|reason| reason.as_str());
                    if finish_reason == Some("tool_calls") && !streamed_tool_calls.is_empty() {
                        tools_requested = true;
                        break 'outer;
                    }
                }
            }

            // The cycle repeats ONLY to continue after tool calls; a stream
            // that simply ends is a completed response.
            if !tools_requested {
                (callbacks.on_complete)(full_response).await;
                return Ok(executed);
            }

            Self::run_tool_calls(&mut session, &mut executed, streamed_tool_calls).await;
        }

        let error = AppError::Internal(format!("{}: tool call cycles limit exceeded", self.label));
        (callbacks.on_error)(error.clone()).await;
        Err(error)
    }

    /// Merge a chunk's `delta.tool_calls` entries into the accumulated list:
    /// the first delta for an index carries id/name, later deltas append
    /// argument fragments.
    fn merge_tool_call_deltas(accumulated: &mut Vec<Value>, deltas: &[Value]) {
        for delta in deltas {
            let index = delta.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
            if accumulated.len() <= index {
                accumulated.resize(index + 1, Value::Null);
            }
            if accumulated[index].is_null() {
                accumulated[index] = delta.clone();
                continue;
            }
            if let Some(fragment) = delta
                .get("function")
                .and_then(|f| f.get("arguments"))
                .and_then(|a| a.as_str())
            {
                let entry = &mut accumulated[index];
                if entry.get("function").is_none() {
                    entry["function"] = json!({});
                }
                let args = entry["function"]
                    .get("arguments")
                    .and_then(|a| a.as_str())
                    .unwrap_or("")
                    .to_string();
                entry["function"]["arguments"] = json!(format!("{}{}", args, fragment));
            }
        }
    }

    /// POST /images/generations. Returns decoded image bytes.
    pub async fn generate_images(
        &self,
        model_id: &str,
        prompt: &str,
        count: i32,
    ) -> Result<Vec<GeneratedImage>, AppError> {
        let model_id = self.effective_model_id(model_id);
        // dall-e-3 only accepts n=1
        let n = if model_id.starts_with("dall-e-3") {
            1
        } else {
            count.clamp(1, 10)
        };

        let mut body = json!({ "model": model_id, "prompt": prompt, "n": n });
        // gpt-image models always return base64 and reject response_format;
        // dall-e defaults to short-lived URLs so we must ask for base64.
        if model_id.starts_with("dall-e") {
            body["response_format"] = json!("b64_json");
        }

        debug!(
            "{}: generating {} image(s) with {}",
            self.label, n, model_id
        );

        let response = self
            .post("/images/generations")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(self.api_error(status, &error_text));
        }

        let response_json: Value = response.json().await.map_err(|e| {
            AppError::Internal(format!("Failed to parse {} response: {}", self.label, e))
        })?;

        let mut images = Vec::new();
        if let Some(data) = response_json.get("data").and_then(|d| d.as_array()) {
            for item in data {
                if let Some(b64) = item.get("b64_json").and_then(|b| b.as_str()) {
                    use base64::Engine;
                    let bytes = base64::engine::general_purpose::STANDARD
                        .decode(b64)
                        .map_err(|e| {
                            AppError::Internal(format!("Invalid base64 image payload: {}", e))
                        })?;
                    images.push(GeneratedImage {
                        bytes,
                        mime: "image/png".to_string(),
                    });
                }
            }
        }

        if images.is_empty() {
            return Err(AppError::Internal(format!(
                "{} returned no images",
                self.label
            )));
        }
        Ok(images)
    }

    /// POST /embeddings for a single input string.
    pub async fn get_embeddings(
        &self,
        model_id: &str,
        input: &str,
    ) -> Result<(Vec<f32>, Option<Usage>), AppError> {
        let body = json!({
            "model": self.effective_model_id(model_id),
            "input": input,
            "encoding_format": "float",
        });

        let response = self
            .post("/embeddings")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(self.api_error(status, &error_text));
        }

        let response_json: Value = response.json().await.map_err(|e| {
            AppError::Internal(format!("Failed to parse {} response: {}", self.label, e))
        })?;

        let embedding = response_json
            .get("data")
            .and_then(|d| d.as_array())
            .and_then(|arr| arr.first())
            .and_then(|item| item.get("embedding"))
            .and_then(|e| e.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_f64())
                    .map(|v| v as f32)
                    .collect::<Vec<f32>>()
            })
            .ok_or_else(|| AppError::Internal(format!("{} returned no embedding", self.label)))?;

        Ok((embedding, response_json.get("usage").map(Self::parse_usage)))
    }

    /// GET /models → list of model ids.
    pub async fn list_model_ids(&self) -> Result<Vec<String>, AppError> {
        let response = self
            .get("/models")
            .send()
            .await
            .map_err(|e| AppError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(self.api_error(status, &error_text));
        }

        let response_json: Value = response.json().await.map_err(|e| {
            AppError::Internal(format!(
                "Failed to parse {} models response: {}",
                self.label, e
            ))
        })?;

        Ok(response_json
            .get("data")
            .and_then(|d| d.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m.get("id").and_then(|id| id.as_str()))
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> InvokeModelRequest {
        InvokeModelRequest {
            model_id: "gpt-4o".to_string(),
            messages: vec![ModelMessage::text(MessageRole::User, "hi")],
            temperature: Some(0.5),
            max_tokens: Some(100),
            top_p: None,
            system_prompt: Some("be brief".to_string()),
            tools: None,
        }
    }

    #[test]
    fn builds_completion_body() {
        let protocol = OpenAIProtocol::new("https://api.openai.com/v1/", None, None, "OpenAI");
        let body = protocol.build_completion_body(&request(), false);
        assert_eq!(body["model"], "gpt-4o");
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][1]["role"], "user");
        assert_eq!(body["temperature"], 0.5);
        assert_eq!(body["max_tokens"], 100);
        assert!(body.get("stream").is_none());
    }

    #[test]
    fn streaming_body_sets_stream_flag() {
        let protocol = OpenAIProtocol::new("https://api.openai.com/v1", None, None, "OpenAI");
        let body = protocol.build_completion_body(&request(), true);
        assert_eq!(body["stream"], true);
    }

    #[test]
    fn model_override_wins() {
        let protocol = OpenAIProtocol::new(
            "http://localhost:11434/v1",
            None,
            Some("llama3".to_string()),
            "Custom",
        );
        assert_eq!(protocol.effective_model_id("my-model"), "llama3");
        let body = protocol.build_completion_body(&request(), false);
        assert_eq!(body["model"], "llama3");
    }

    #[test]
    fn reasoning_models_drop_sampling_params() {
        let protocol = OpenAIProtocol::new("https://api.openai.com/v1", None, None, "OpenAI");
        let mut req = request();
        req.model_id = "gpt-5-nano".to_string();
        let body = protocol.build_completion_body(&req, false);
        assert!(body.get("temperature").is_none());
        assert!(body.get("top_p").is_none());
        assert!(body.get("max_tokens").is_none());
        assert_eq!(body["max_completion_tokens"], 100);
    }

    #[test]
    fn tools_and_tool_turns_serialize_into_body() {
        use crate::services::ai::{ExecutableTool, ToolBackend, ToolSpec};

        let protocol = OpenAIProtocol::new("https://api.openai.com/v1", None, None, "OpenAI");
        let mut req = request();
        req.tools = Some(vec![ExecutableTool {
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
        }]);
        // assistant tool_calls turn + tool result turn
        req.messages.push(ModelMessage {
            role: MessageRole::Assistant,
            content: String::new(),
            timestamp: None,
            tool_calls: Some(json!([{"id": "c1", "type": "function",
                "function": {"name": "internal_web_search", "arguments": "{}"}}])),
            tool_call_id: None,
        });
        req.messages.push(ModelMessage {
            role: MessageRole::Tool,
            content: "results".to_string(),
            timestamp: None,
            tool_calls: None,
            tool_call_id: Some("c1".to_string()),
        });

        let body = protocol.build_completion_body(&req, false);
        assert_eq!(body["tools"][0]["function"]["name"], "internal_web_search");
        // system + user + assistant(tool_calls) + tool
        assert_eq!(body["messages"][2]["tool_calls"][0]["id"], "c1");
        assert_eq!(body["messages"][3]["role"], "tool");
        assert_eq!(body["messages"][3]["tool_call_id"], "c1");
    }

    #[test]
    fn merges_streamed_tool_call_deltas() {
        let mut accumulated: Vec<Value> = Vec::new();
        OpenAIProtocol::merge_tool_call_deltas(
            &mut accumulated,
            &[json!({"index": 0, "id": "c1",
                "function": {"name": "internal_web_search", "arguments": "{\"qu"}})],
        );
        OpenAIProtocol::merge_tool_call_deltas(
            &mut accumulated,
            &[json!({"index": 0, "function": {"arguments": "ery\": \"rust\"}"}})],
        );

        let calls = OpenAIProtocol::parse_tool_calls(&accumulated);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].id, "c1");
        assert_eq!(calls[0].name, "internal_web_search");
        assert_eq!(calls[0].arguments["query"], "rust");
    }

    #[test]
    fn malformed_tool_arguments_degrade_to_empty_object() {
        let entries = vec![json!({"id": "c2",
            "function": {"name": "t", "arguments": "{broken"}})];
        let calls = OpenAIProtocol::parse_tool_calls(&entries);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].arguments, json!({}));
    }

    #[test]
    fn trailing_slash_is_trimmed() {
        let protocol = OpenAIProtocol::new("http://host/v1///", None, None, "X");
        assert_eq!(
            protocol.url("/chat/completions"),
            "http://host/v1/chat/completions"
        );
    }
}
