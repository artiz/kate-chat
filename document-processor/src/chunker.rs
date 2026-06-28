//! Text cleaning + chunking for RAG indexing.
//!
//! Reproduces the behavior of the Python `text_splitter.py`: split page text at
//! sentence boundaries, then merge greedily to a token budget (default 300
//! tokens, measured with the `o200k_base` / gpt-4o encoding). Built on the
//! `chunk` crate (`split` + token-aware `merge_splits`).

use std::collections::HashMap;
use std::sync::OnceLock;

use chunk::{chunk as byte_chunk, merge_splits, split};
use regex::{Captures, Regex};
use tiktoken_rs::{o200k_base, CoreBPE};

use crate::model::Chunk;

fn bpe() -> &'static CoreBPE {
    static BPE: OnceLock<CoreBPE> = OnceLock::new();
    BPE.get_or_init(|| o200k_base().expect("load o200k_base encoding"))
}

/// Token count under the gpt-4o (`o200k_base`) encoding.
pub fn count_tokens(text: &str) -> usize {
    bpe().encode_ordinary(text).len()
}

/// Split one page's text into chunks for the `*.chunked.json` artifact.
///
/// `id` is the chunk's index within the page; `type` is always `"content"`
/// (tables are embedded as Markdown inside the page text, matching the Python
/// pipeline's effective behavior).
pub fn chunk_page(text: &str, page: u32, target_tokens: usize) -> Vec<Chunk> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let target_tokens = target_tokens.max(1);

    // 1) Sentence/line segments (the delimiter stays with the preceding text).
    let segments: Vec<String> = split(trimmed.as_bytes())
        .delimiters(b"\n.!?")
        .include_prev()
        .collect_slices()
        .into_iter()
        .map(|b| String::from_utf8_lossy(b).into_owned())
        .collect();

    // 2) Pre-split any single segment that already exceeds the target (long
    //    table rows, code lines) into ~target-sized windows at soft boundaries.
    let target_bytes = (target_tokens * 4).max(64);
    let mut pieces: Vec<String> = Vec::new();
    for seg in segments {
        if seg.trim().is_empty() {
            continue;
        }
        if count_tokens(&seg) > target_tokens {
            for window in byte_chunk(seg.as_bytes())
                .size(target_bytes)
                .delimiters(b"\n .,;|")
            {
                let piece = String::from_utf8_lossy(window).into_owned();
                if !piece.trim().is_empty() {
                    pieces.push(piece);
                }
            }
        } else {
            pieces.push(seg);
        }
    }
    if pieces.is_empty() {
        return Vec::new();
    }

    // 3) Token-aware merge up to the target chunk size.
    let refs: Vec<&str> = pieces.iter().map(|s| s.as_str()).collect();
    let counts: Vec<usize> = refs.iter().map(|s| count_tokens(s)).collect();
    let merged = merge_splits(&refs, &counts, target_tokens);

    // 4) Materialize chunks.
    merged
        .merged
        .into_iter()
        .zip(merged.token_counts)
        .map(|(text, tokens)| (text.trim().to_string(), tokens))
        .filter(|(text, _)| !text.is_empty())
        .enumerate()
        .map(|(id, (text, length_tokens))| Chunk {
            page,
            id,
            length_tokens,
            text,
            kind: "content".to_string(),
        })
        .collect()
}

/// Glyph-command → literal mapping, ported from the Python cleaner. These are
/// artifacts some PDF text layers emit (e.g. `/two.tnum` → `2`).
fn command_mapping() -> &'static HashMap<&'static str, &'static str> {
    static MAP: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();
    MAP.get_or_init(|| {
        HashMap::from([
            ("zero", "0"),
            ("one", "1"),
            ("two", "2"),
            ("three", "3"),
            ("four", "4"),
            ("five", "5"),
            ("six", "6"),
            ("seven", "7"),
            ("eight", "8"),
            ("nine", "9"),
            ("period", "."),
            ("comma", ","),
            ("colon", ":"),
            ("hyphen", "-"),
            ("percent", "%"),
            ("dollar", "$"),
            ("space", " "),
            ("plus", "+"),
            ("minus", "-"),
            ("slash", "/"),
            ("asterisk", "*"),
            ("lparen", "("),
            ("rparen", ")"),
            ("parenright", ")"),
            ("parenleft", "("),
            ("wedge.1_E", ""),
        ])
    })
}

/// Clean PDF/OCR glyph artifacts from extracted text (port of the Python
/// `_clean_text`). Harmless on already-clean Markdown.
pub fn clean_text(text: &str) -> String {
    static SLASH_CMD: OnceLock<Regex> = OnceLock::new();
    static GLYPH: OnceLock<Regex> = OnceLock::new();
    static CAP: OnceLock<Regex> = OnceLock::new();

    let mapping = command_mapping();
    let commands = mapping.keys().copied().collect::<Vec<_>>().join("|");
    // `regex` has no look-around; the suffix alternation is explicit, like Python.
    let slash = SLASH_CMD.get_or_init(|| {
        Regex::new(&format!(
            r"/({commands})(\.pl\.tnum|\.tnum\.pl|\.pl|\.tnum|\.case|\.sups)"
        ))
        .expect("slash-command regex")
    });
    let glyph = GLYPH.get_or_init(|| Regex::new(r"glyph<[^>]*>").expect("glyph regex"));
    let cap = CAP.get_or_init(|| Regex::new(r"/([A-Z])\.cap").expect("cap regex"));

    let step1 = slash.replace_all(text, |caps: &Captures| {
        mapping
            .get(&caps[1])
            .copied()
            .map(|s| s.to_string())
            .unwrap_or_else(|| caps[0].to_string())
    });
    let step2 = glyph.replace_all(&step1, "");
    let step3 = cap.replace_all(&step2, "$1");
    step3.into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_tokens() {
        assert!(count_tokens("hello world") >= 2);
        assert_eq!(count_tokens(""), 0);
    }

    #[test]
    fn empty_text_yields_no_chunks() {
        assert!(chunk_page("   \n  ", 1, 300).is_empty());
    }

    #[test]
    fn small_text_is_one_content_chunk() {
        let chunks = chunk_page("Hello world. This is a short test.", 7, 300);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].id, 0);
        assert_eq!(chunks[0].page, 7);
        assert_eq!(chunks[0].kind, "content");
        assert!(chunks[0].text.contains("Hello world"));
        assert!(chunks[0].length_tokens > 0);
    }

    #[test]
    fn long_text_splits_into_multiple_chunks_with_sequential_ids() {
        // ~50 sentences; with a tiny target this must produce several chunks.
        let sentence = "The quick brown fox jumps over the lazy dog. ";
        let text = sentence.repeat(50);
        let chunks = chunk_page(&text, 1, 20);
        assert!(chunks.len() > 1);
        for (i, c) in chunks.iter().enumerate() {
            assert_eq!(c.id, i);
            assert_eq!(c.kind, "content");
        }
    }

    #[test]
    fn cleans_glyph_artifacts() {
        assert_eq!(clean_text("page glyph<c=1> end"), "page  end");
        assert_eq!(clean_text("value /two.tnum here"), "value 2 here");
        assert_eq!(clean_text("/A.cap pple"), "A pple");
    }
}
