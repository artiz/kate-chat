//! Web search tool backed by the Yandex Search API v2 (Node parity:
//! yandex.web_search.ts + openai.tools.ts CustomWebSearchTool). The API
//! returns base64-encoded XML; results are extracted with lightweight tag
//! scanning (url/title/passages).

use base64::Engine;
use serde::Serialize;
use serde_json::json;

use crate::config::AppConfig;
use crate::services::ai::{ExecutableTool, ToolBackend, ToolSpec};
use crate::utils::errors::AppError;

pub const WEB_SEARCH_TOOL_NAME: &str = "internal_web_search";
const DEFAULT_SEARCH_API_URL: &str = "https://searchapi.api.cloud.yandex.net/v2/web/search";
pub const DEFAULT_RESULTS_LIMIT: usize = 5;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub domain: String,
    pub summary: Option<String>,
}

pub fn web_search_available(config: &AppConfig) -> bool {
    config.yandex_search_api_key.is_some() && config.yandex_folder_id.is_some()
}

/// The web search tool for a chat session, when the config has Yandex
/// Search credentials (Node's CustomWebSearchTool).
pub fn web_search_tool(config: &AppConfig) -> Option<ExecutableTool> {
    let api_key = config.yandex_search_api_key.clone()?;
    let folder_id = config.yandex_folder_id.clone()?;
    Some(ExecutableTool {
        spec: ToolSpec {
            name: WEB_SEARCH_TOOL_NAME.to_string(),
            description: "Search the web for relevant information".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Search query" },
                    "limit": {
                        "type": "number",
                        "description": "Maximum number of search results to return"
                    },
                },
                "required": ["query"],
            }),
        },
        backend: ToolBackend::WebSearch {
            api_key,
            folder_id,
            api_url: config.yandex_search_api_url.clone(),
        },
    })
}

pub async fn search(
    api_key: &str,
    folder_id: &str,
    api_url: Option<&str>,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchResult>, AppError> {
    let url = api_url.unwrap_or(DEFAULT_SEARCH_API_URL);

    let body = json!({
        "query": { "searchType": "SEARCH_TYPE_COM", "queryText": query },
        "folderId": folder_id,
        "maxPassages": 5,
        "docsInGroup": 3,
        "l10n": "LOCALIZATION_EN",
        "responseFormat": "FORMAT_XML",
    });

    let response = reqwest::Client::new()
        .post(url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Api-Key {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Http(format!("Web search request failed: {}", e)))?;

    let payload: serde_json::Value = response
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Web search response parse failed: {}", e)))?;

    let Some(raw) = payload.get("rawData").and_then(|v| v.as_str()) else {
        let message = payload
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("no rawData in response");
        return Err(AppError::Http(format!("Web search API error: {}", message)));
    };

    let xml = base64::engine::general_purpose::STANDARD
        .decode(raw)
        .ok()
        .and_then(|b| String::from_utf8(b).ok())
        .ok_or_else(|| AppError::Internal("Invalid web search rawData".to_string()))?;

    Ok(extract_results(&xml, limit))
}

/// Format results as the tool output the model consumes (Node's
/// WEB_SEARCH_TOOL_RESULT template).
pub fn results_to_tool_content(results: &[SearchResult]) -> String {
    let context = results
        .iter()
        .map(|result| {
            format!(
                "### Result\ntitle: {}\nurl: {}\ndomain: {}\nsummary: {}",
                result.title,
                result.url,
                result.domain,
                result.summary.as_deref().unwrap_or("N/A"),
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n---\n\n");

    format!(
        "# Web search results\nPlease use this information to assist with your answer.\n\
         Always include a reference to the source of the information in your answer, \
         using the valid markdown format [page title](url).\n\n{}",
        context
    )
}

fn extract_results(xml: &str, limit: usize) -> Vec<SearchResult> {
    let mut results = Vec::new();
    // Each result doc looks like <doc …>…<url>…</url>…<title>…</title>…
    // <passages>…</passages>…</doc>; hlword markup is stripped.
    for doc in xml.split("<doc").skip(1) {
        let doc = doc.split("</doc>").next().unwrap_or("");
        let Some(url) = tag_text(doc, "url") else {
            continue;
        };
        let title = tag_text(doc, "title").unwrap_or_else(|| url.clone());
        let domain = tag_text(doc, "domain")
            .unwrap_or_else(|| url.split('/').nth(2).unwrap_or_default().to_string());
        let passages: Vec<String> = doc
            .split("<passage>")
            .skip(1)
            .filter_map(|p| p.split("</passage>").next())
            .map(strip_tags)
            .filter(|p| !p.is_empty())
            .collect();

        results.push(SearchResult {
            title: strip_tags(&title),
            url,
            domain,
            summary: (!passages.is_empty()).then(|| passages.join(" ")),
        });
        if results.len() >= limit {
            break;
        }
    }
    results
}

fn tag_text(source: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = source.find(&open)? + open.len();
    let end = source[start..].find(&close)? + start;
    Some(source[start..end].trim().to_string())
}

fn strip_tags(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_tag = false;
    for ch in text.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_docs_from_yandex_xml() {
        let xml = r#"<response><results><grouping><group>
            <doc id="1"><url>https://example.com/a</url><domain>example.com</domain>
              <title>Hello <hlword>world</hlword></title>
              <passages><passage>First <hlword>match</hlword>.</passage><passage>Second.</passage></passages>
            </doc></group><group>
            <doc id="2"><url>https://other.io/b</url><title>Other</title></doc>
            </group></grouping></results></response>"#;
        let results = extract_results(xml, 10);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].title, "Hello world");
        assert_eq!(results[0].domain, "example.com");
        assert_eq!(results[0].summary.as_deref(), Some("First match. Second."));
        assert_eq!(results[1].domain, "other.io");
        assert_eq!(results[1].summary, None);
    }

    #[test]
    fn tool_content_includes_sources() {
        let results = vec![SearchResult {
            title: "T".into(),
            url: "https://x".into(),
            domain: "x".into(),
            summary: None,
        }];
        let content = results_to_tool_content(&results);
        assert!(content.contains("url: https://x"));
        assert!(content.contains("summary: N/A"));
    }
}
