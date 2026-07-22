//! RAG retrieval: embed the question, rank the chats' document chunks by
//! cosine similarity (embeddings are stored as JSON arrays for every
//! backend) and build the structured-answer prompt. Mirrors the Node
//! API's EmbeddingsService.findChunks + RAG_REQUEST.

use diesel::prelude::*;
use std::collections::HashMap;
use tracing::{debug, warn};

use crate::database::DbConnection;
use crate::models::document::{Document, DocumentChunk};
use crate::models::Model;
use crate::schema::{document_chunks, documents, models};
use crate::services::ai::{AIProviderService, AIService};
use crate::utils::errors::AppError;

pub const RAG_QUERY_CHUNKS_LIMIT: usize = 10;

/// A chunk selected for the RAG context.
#[derive(Debug, Clone)]
pub struct RankedChunk {
    pub id: String,
    pub document_id: String,
    pub document_name: Option<String>,
    pub page: i32,
    pub page_index: i64,
    pub content: String,
    pub relevance: f32,
}

pub struct RagPrompt {
    pub system_prompt: String,
    pub user_input: String,
}

/// Embed the query with each document's embeddings model and rank all
/// chunks of the given documents by cosine similarity.
pub async fn find_chunks(
    conn: &mut DbConnection,
    ai_service: &AIService,
    user_id: &str,
    document_ids: &[String],
    query: &str,
    limit: usize,
) -> Result<Vec<RankedChunk>, AppError> {
    let docs: Vec<Document> = documents::table
        .filter(documents::id.eq_any(document_ids))
        .filter(documents::owner_id.eq(user_id))
        .load(conn)
        .map_err(|e| AppError::Database(e.to_string()))?;
    if docs.is_empty() {
        return Ok(vec![]);
    }

    let doc_names: HashMap<String, String> = docs
        .iter()
        .map(|d| (d.id.clone(), d.file_name.clone()))
        .collect();
    let doc_models: HashMap<String, String> = docs
        .iter()
        .filter_map(|d| Some((d.id.clone(), d.embeddings_model_id.clone()?)))
        .collect();

    // Embed the query once per distinct embeddings model
    let mut query_embeddings: HashMap<String, Vec<f32>> = HashMap::new();
    for model_id in doc_models
        .values()
        .collect::<std::collections::HashSet<_>>()
    {
        let model: Option<Model> = models::table
            .filter(models::model_id.eq(model_id))
            .filter(models::user_id.eq(user_id))
            .first(conn)
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let Some(model) = model else {
            warn!("Embeddings model {} not found for RAG query", model_id);
            continue;
        };
        let provider = ai_service.get_provider_for_model(&model)?;
        let embedding = provider.get_embeddings(&model.model_id, query).await?;
        query_embeddings.insert(model_id.clone(), embedding);
    }
    if query_embeddings.is_empty() {
        return Err(AppError::Validation(
            "No valid embeddings models found for documents".to_string(),
        ));
    }

    let chunks: Vec<DocumentChunk> = document_chunks::table
        .filter(document_chunks::document_id.eq_any(document_ids))
        .filter(document_chunks::embedding.is_not_null())
        .load(conn)
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut ranked: Vec<RankedChunk> = chunks
        .into_iter()
        .filter_map(|chunk| {
            let model_id = doc_models.get(&chunk.document_id)?;
            let query_embedding = query_embeddings.get(model_id)?;
            let embedding: Vec<f32> = serde_json::from_str(chunk.embedding.as_deref()?).ok()?;
            let relevance = cosine_similarity(query_embedding, &embedding)?;
            Some(RankedChunk {
                id: chunk.id,
                document_name: doc_names.get(&chunk.document_id).cloned(),
                document_id: chunk.document_id,
                page: chunk.page,
                page_index: chunk.page_index,
                content: chunk.content,
                relevance,
            })
        })
        .collect();

    ranked.sort_by(|a, b| {
        b.relevance
            .partial_cmp(&a.relevance)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    ranked.truncate(limit);
    debug!(
        "RAG query ranked {} chunks (top relevance {:.3})",
        ranked.len(),
        ranked.first().map(|c| c.relevance).unwrap_or_default()
    );
    Ok(ranked)
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> Option<f32> {
    if a.len() != b.len() || a.is_empty() {
        return None;
    }
    let (mut dot, mut norm_a, mut norm_b) = (0f32, 0f32, 0f32);
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
        norm_a += x * x;
        norm_b += y * y;
    }
    let denominator = norm_a.sqrt() * norm_b.sqrt();
    (denominator > 0.0).then(|| dot / denominator)
}

/// Structured-answer schema embedded into the system prompt (Node's
/// RAG_RESPONSE_SCHEMA).
const RAG_RESPONSE_SCHEMA: &str = r#"{
  "name": "rag_response",
  "strict": true,
  "schema": {
    "type": "object",
    "properties": {
      "step_by_step_analysis": {
        "type": "string",
        "description": "Detailed step-by-step analysis of the answer with at least 5 steps and at least 150 words. Pay special attention to the wording of the question to avoid being tricked. Sometimes it seems that there is an answer in the context, but this is might be not the requested value, but only a similar one. If user asks for date and only a year information is available, provide the year in the final answer."
      },
      "reasoning_summary": {
        "type": "string",
        "description": "Concise summary of the step-by-step reasoning process. Around 50 words."
      },
      "final_answer": {
        "type": "string",
        "description": "Final answer. Answer without any extra information, words or comments. Return 'N/A' if information is not available in the context"
      },
      "relevant_chunks_ids": {
        "type": "array",
        "items": { "type": "string" },
        "description": "List of relevant chunks IDs containing information directly used to answer the question. This ID must be loaded from input chunk \"id\". At least one chunk should be included in the list."
      },
      "chunks_relevance": {
        "type": "array",
        "items": { "type": "number" },
        "description": "List of relevance scores for each chunk in the same order as the chunk IDs. Each score should be a number between 0 and 1."
      }
    },
    "additionalProperties": false,
    "required": ["final_answer", "relevant_chunks_ids"]
  }
}"#;

pub fn rag_request(chunks: &[RankedChunk], question: &str) -> RagPrompt {
    let context = chunks
        .iter()
        .map(|chunk| {
            format!(
                "#Chunk\nid: {}\ncontent:\n\"\"\"\n{}\n\"\"\"",
                chunk.id,
                chunk.content.replace('\r', "")
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n---\n\n");

    let system_prompt = format!(
        "You are a RAG (Retrieval-Augmented Generation) answering system.\n\
        Your task is to answer the given question based only on information from the provided documents, \
        which is uploaded in the format of relevant pages extracted using RAG.\n\n\
        Before giving a final answer, carefully think out loud and step by step. \
        Pay special attention to the wording of the question.\n\
        - Keep in mind that the content containing the answer may be worded differently than the question.\n\
        - If it is a date, it should be in ISO Format \"yyyy-MM-dd\" (e.g., 2020-01-01).\n\
        - If the question asks for a specific detail (e.g., date, full name, exact term), ensure your answer matches that detail precisely.\n\n\
        ---\n\n\
        Your answer should be in JSON and strictly follow this schema, filling in the fields in the order they are given:\n\
        ```\n{}\n```",
        RAG_RESPONSE_SCHEMA
    );

    let user_input = format!(
        "Here is the context:\n\"\"\"\n{}\n\"\"\"\n\n---\n\nHere is the question:\n\"\"\"\n{}\n\"\"\"",
        context, question
    );

    RagPrompt {
        system_prompt,
        user_input,
    }
}

/// Extract the JSON object from a model answer that may be wrapped in
/// markdown fences or prefixed with commentary.
pub fn extract_rag_json(content: &str) -> Option<serde_json::Value> {
    let start = content.find('{')?;
    let end = content.rfind('}')?;
    if end < start {
        return None;
    }
    let mut parsed: serde_json::Value = serde_json::from_str(&content[start..=end]).ok()?;

    // Some models return the schema structure with embedded `value` fields
    // instead of a flat object — flatten that format (Node parity)
    if let Some(props) = parsed
        .get("schema")
        .and_then(|s| s.get("properties"))
        .and_then(|p| p.as_object())
    {
        let flattened: serde_json::Map<String, serde_json::Value> = props
            .iter()
            .filter_map(|(k, v)| Some((k.clone(), v.get("value")?.clone())))
            .collect();
        parsed = serde_json::Value::Object(flattened);
    }
    Some(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cosine_ranks_identical_highest() {
        assert!(cosine_similarity(&[1.0, 0.0], &[1.0, 0.0]).unwrap() > 0.99);
        assert!(cosine_similarity(&[1.0, 0.0], &[0.0, 1.0]).unwrap().abs() < 0.01);
        assert!(cosine_similarity(&[1.0], &[1.0, 2.0]).is_none());
    }

    #[test]
    fn extracts_fenced_rag_json() {
        let raw =
            "Sure!\n```json\n{\"final_answer\": \"42\", \"reasoning_summary\": \"math\"}\n```";
        let parsed = extract_rag_json(raw).unwrap();
        assert_eq!(parsed["final_answer"], "42");
    }

    #[test]
    fn flattens_schema_value_format() {
        let raw = r#"{"schema": {"properties": {"final_answer": {"value": "yes"}}}}"#;
        let parsed = extract_rag_json(raw).unwrap();
        assert_eq!(parsed["final_answer"], "yes");
    }
}
