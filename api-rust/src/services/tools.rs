//! In-chat tool execution: dispatches model-requested tool calls to the
//! web search / MCP backends. Failures never abort the chat session — the
//! error text is returned as the tool result so the model can recover
//! (Node parity: openai.tools.ts).

use tracing::{debug, warn};

use crate::services::ai::{
    ExecutableTool, ExecutedToolCall, MessageRole, ModelMessage, ToolBackend, ToolCallRequest,
};
use crate::services::mcp::McpClient;
use crate::services::web_search;
use crate::utils::errors::AppError;

/// Execute a single tool call, producing the Tool-role message replayed to
/// the model and the metadata record for the assistant message.
pub async fn execute_tool_call(
    tools: &[ExecutableTool],
    call: &ToolCallRequest,
) -> (ModelMessage, ExecutedToolCall) {
    let content = match tools.iter().find(|t| t.spec.name == call.name) {
        None => format!("Error: Unsupported function tool: {}", call.name),
        Some(tool) => match run_tool(tool, call).await {
            Ok(content) => content,
            Err(e) => {
                warn!("Tool {} failed: {}", call.name, e);
                format!("Error calling tool {}: {}", call.name, e)
            }
        },
    };

    let executed = ExecutedToolCall {
        id: call.id.clone(),
        name: call.name.clone(),
        args_json: call.arguments.to_string(),
        content: content.clone(),
    };
    let message = ModelMessage {
        role: MessageRole::Tool,
        content,
        timestamp: None,
        tool_calls: None,
        tool_call_id: Some(call.id.clone()),
    };
    (message, executed)
}

async fn run_tool(tool: &ExecutableTool, call: &ToolCallRequest) -> Result<String, AppError> {
    match &tool.backend {
        ToolBackend::WebSearch {
            api_key,
            folder_id,
            api_url,
        } => {
            let Some(query) = call.arguments.get("query").and_then(|q| q.as_str()) else {
                return Ok("Error: Invalid 'query' argument for web search tool.".to_string());
            };
            let limit = call
                .arguments
                .get("limit")
                .and_then(|l| l.as_u64())
                .map(|l| l as usize)
                .unwrap_or(web_search::DEFAULT_RESULTS_LIMIT);

            debug!("Web search tool call: {} (limit {})", query, limit);
            let results =
                web_search::search(api_key, folder_id, api_url.as_deref(), query, limit).await?;
            if results.is_empty() {
                return Ok(format!("No results found for query: \"{}\"", query));
            }
            Ok(web_search::results_to_tool_content(&results))
        }
        ToolBackend::Mcp {
            server,
            tool_name,
            auth_token,
        } => {
            debug!("MCP tool call: {} on {}", tool_name, server.name);
            let mut client = McpClient::for_server(server, auth_token.as_deref());
            client.call_tool(tool_name, call.arguments.clone()).await
        }
    }
}
