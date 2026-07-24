//! Global search result types (Node's SearchResults shapes).

use async_graphql::SimpleObject;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "SearchChatResult")]
#[serde(rename_all = "camelCase")]
pub struct SearchChatResult {
    pub chat_id: async_graphql::ID,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "SearchMessageResult")]
#[serde(rename_all = "camelCase")]
pub struct SearchMessageResult {
    pub message_id: async_graphql::ID,
    pub chat_id: String,
    pub chat_title: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "SearchDocumentResult")]
#[serde(rename_all = "camelCase")]
pub struct SearchDocumentResult {
    pub document_id: async_graphql::ID,
    pub file_name: String,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "SearchResults")]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    pub chat_results: Vec<SearchChatResult>,
    pub message_results: Vec<SearchMessageResult>,
    pub document_results: Vec<SearchDocumentResult>,
}

#[derive(Debug, async_graphql::InputObject)]
#[graphql(name = "SearchInput")]
pub struct SearchInput {
    pub query: String,
    pub limit: Option<i32>,
}

/// Truncate a snippet to 200 chars (Node parity).
pub fn snippet(text: &str) -> String {
    const MAX: usize = 200;
    if text.chars().count() <= MAX {
        text.to_string()
    } else {
        let mut s: String = text.chars().take(MAX).collect();
        s.push('…');
        s
    }
}
