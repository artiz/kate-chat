//! Document parsing via the `docling` converter (docling.rs, the Rust port of
//! docling).
//!
//! PDFs are converted through one `docling-pdf` [`Pipeline`] in streaming
//! mode: the pipeline emits each page's finalized nodes in document order (for
//! documents with enough pages, inference fans out across its internal worker
//! pool), which gives real per-page Markdown and an accurate page count.
//! Everything else is converted in one pass as a single logical page.
//!
//! `parse` is CPU-bound and blocking (the PDF path runs pdfium + ONNX layout/OCR
//! models), so callers must run it on a blocking thread
//! (`tokio::task::spawn_blocking`).

use std::path::Path;

use docling::{
    DocumentConverter, ImageMode, InputFormat, MarkdownStreamer, Node, Pipeline, SourceDocument,
};

use crate::model::ParsedPage;

/// One streamed page batch: its typed nodes plus the hyperlinks recovered from
/// the same span (mirrors `docling-pdf`'s internal page output).
type PageBatch = (Vec<Node>, Vec<(String, String)>);

/// The result of parsing one document: its pages (Markdown) and page count.
pub struct ParseOutput {
    pub pages: Vec<ParsedPage>,
    pub pages_count: u32,
}

/// Convert raw document bytes into per-page Markdown.
pub fn parse(name: &str, mime: Option<&str>, bytes: Vec<u8>) -> Result<ParseOutput, String> {
    let format = detect_format(name, mime)
        .or_else(|| looks_like_pdf(&bytes).then_some(InputFormat::Pdf))
        .ok_or_else(|| format!("unsupported document type (name='{name}', mime={mime:?})"))?;

    let pages = if format == InputFormat::Pdf {
        parse_pdf(name, &bytes)?
    } else {
        let source = SourceDocument::from_bytes(name, format, bytes);
        // `strict` picks docling.rs's cleaner Markdown over Python docling's
        // legacy quirks (code-fence languages kept, no `\_` escaping, no
        // inline-run spacing artifacts) — better chunk text for embedding.
        let document = DocumentConverter::new()
            .strict(true)
            .convert(source)
            .map_err(|e| e.to_string())?
            .document;
        vec![ParsedPage {
            page: 1,
            text: document.export_to_markdown(),
        }]
    };

    let pages_count = pages.len() as u32;
    Ok(ParseOutput { pages, pages_count })
}

/// Convert a PDF to per-page Markdown through one streaming [`Pipeline`] pass:
/// pdfium renders pages on one thread while layout/OCR/TableFormer inference
/// fans out across the pipeline's worker pool (for documents with at least
/// `DOCLING_RS_PDF_PARALLEL_MIN` pages), and `emit` receives each page's
/// finalized nodes back in document order — one call per page, plus a final
/// flush of any block held back across the last page boundary. A block that
/// spans a page boundary (a paragraph or list continuing onto the next page)
/// is emitted whole with the page it finishes on.
fn parse_pdf(name: &str, bytes: &[u8]) -> Result<Vec<ParsedPage>, String> {
    let mut pipeline = Pipeline::new().map_err(|e| e.to_string())?;

    // One (nodes, links) batch per page, in document order.
    let mut batches: Vec<PageBatch> = Vec::new();
    pipeline
        .convert_streaming(bytes, None, name, |nodes, links| {
            batches.push((nodes, links));
            Ok(())
        })
        .map_err(|e| e.to_string())?;

    // The last batch is the assembler's final flush: whatever it still held
    // belongs to the last page.
    if batches.len() > 1 {
        let (tail_nodes, tail_links) = batches.pop().expect("len checked above");
        let (nodes, links) = batches.last_mut().expect("len checked above");
        nodes.extend(tail_nodes);
        links.extend(tail_links);
    }

    tracing::info!(pages = batches.len(), "parsed PDF");
    Ok(batches
        .into_iter()
        .enumerate()
        .map(|(index, (nodes, links))| {
            // A fresh streamer per page renders that page's finalized blocks
            // exactly like the buffered `export_to_markdown` while keeping the
            // pages independent. `strict` matches the declarative path above
            // (and additionally inlines the page's recovered hyperlinks).
            let mut streamer = MarkdownStreamer::new(true, ImageMode::Placeholder, false);
            let mut text = streamer.push(&nodes, &links);
            text.push_str(&streamer.finish());
            ParsedPage {
                page: (index + 1) as u32,
                text,
            }
        })
        .collect())
}

/// True if the bytes look like a PDF (magic header), regardless of name/MIME.
pub fn looks_like_pdf(bytes: &[u8]) -> bool {
    bytes.starts_with(b"%PDF")
}

/// True if the document resolves to PDF by MIME or filename (see also
/// [`looks_like_pdf`] for content sniffing).
pub fn is_pdf(name: &str, mime: Option<&str>) -> bool {
    detect_format(name, mime) == Some(InputFormat::Pdf)
}

/// Resolve the `docling` input format from MIME type (preferred) or, failing
/// that, the filename extension.
pub fn detect_format(name: &str, mime: Option<&str>) -> Option<InputFormat> {
    if let Some(raw) = mime {
        let m = raw
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        let by_mime = match m.as_str() {
            "application/pdf" => Some(InputFormat::Pdf),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => {
                Some(InputFormat::Docx)
            }
            "application/vnd.openxmlformats-officedocument.presentationml.presentation" => {
                Some(InputFormat::Pptx)
            }
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => {
                Some(InputFormat::Xlsx)
            }
            "application/vnd.oasis.opendocument.text" => Some(InputFormat::Odt),
            "application/vnd.oasis.opendocument.spreadsheet" => Some(InputFormat::Ods),
            "application/vnd.oasis.opendocument.presentation" => Some(InputFormat::Odp),
            "text/html" | "application/xhtml+xml" => Some(InputFormat::Html),
            "text/markdown" | "text/x-markdown" | "text/plain" => Some(InputFormat::Md),
            "text/csv" | "application/csv" => Some(InputFormat::Csv),
            "application/epub+zip" => Some(InputFormat::Epub),
            "message/rfc822" => Some(InputFormat::Email),
            "text/vtt" => Some(InputFormat::Vtt),
            "application/json" => Some(InputFormat::JsonDocling),
            "text/asciidoc" | "text/x-asciidoc" => Some(InputFormat::Asciidoc),
            "application/x-latex" | "text/x-latex" | "application/x-tex" => {
                Some(InputFormat::Latex)
            }
            other if other.starts_with("image/") => Some(InputFormat::Image),
            _ => None,
        };
        if by_mime.is_some() {
            return by_mime;
        }
    }

    let ext = Path::new(name).extension().and_then(|e| e.to_str())?;
    InputFormat::from_extension(ext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_by_mime() {
        assert_eq!(
            detect_format("x", Some("application/pdf")),
            Some(InputFormat::Pdf)
        );
        assert_eq!(
            detect_format("x", Some("image/png")),
            Some(InputFormat::Image)
        );
        assert_eq!(
            detect_format("x", Some("text/markdown; charset=utf-8")),
            Some(InputFormat::Md)
        );
    }

    #[test]
    fn detects_pdf_by_magic_bytes() {
        assert!(looks_like_pdf(b"%PDF-1.7\n..."));
        assert!(!looks_like_pdf(b"PK\x03\x04"));
        assert!(!looks_like_pdf(b""));
    }

    #[test]
    fn detect_falls_back_to_extension() {
        assert_eq!(detect_format("report.docx", None), Some(InputFormat::Docx));
        assert_eq!(
            detect_format("page.html", Some("application/octet-stream")),
            Some(InputFormat::Html)
        );
        assert_eq!(detect_format("mystery", None), None);
    }

    #[test]
    fn parses_markdown_end_to_end() {
        let out = parse("doc", Some("text/markdown"), b"# Hi\n\nWorld.\n".to_vec()).unwrap();
        assert_eq!(out.pages_count, 1);
        assert_eq!(out.pages.len(), 1);
        assert_eq!(out.pages[0].page, 1);
        assert!(out.pages[0].text.contains("# Hi"));
    }

    #[test]
    fn parses_html_end_to_end() {
        let html = b"<html><body>\
            <h1>Title</h1>\
            <p>Hello world.</p>\
            <ul><li>one</li><li>two</li></ul>\
            </body></html>"
            .to_vec();
        let out = parse("page.html", Some("text/html"), html).unwrap();
        assert_eq!(out.pages_count, 1);
        let text = &out.pages[0].text;
        assert!(text.contains("# Title"), "heading missing: {text}");
        assert!(text.contains("Hello world."), "paragraph missing: {text}");
        assert!(text.contains("- one"), "list item missing: {text}");
        assert!(text.contains("- two"), "list item missing: {text}");
    }

    #[test]
    fn parses_csv_as_markdown_table() {
        let csv = b"name,age\nalice,30\nbob,25\n".to_vec();
        let out = parse("data.csv", Some("text/csv"), csv).unwrap();
        assert_eq!(out.pages_count, 1);
        // Normalize the default GitHub-style column padding so the assertion
        // only pins cell content and order, not alignment widths.
        let text = out.pages[0].text.replace(' ', "");
        assert!(text.contains("|name|age|"), "header missing: {text}");
        assert!(text.contains("|alice|30|"), "row missing: {text}");
        assert!(text.contains("|bob|25|"), "row missing: {text}");
    }

    /// The `strict(true)` guarantees the chunker relies on (see `parse`): no
    /// legacy `\_` underscore escaping and code-fence languages preserved.
    #[test]
    fn strict_markdown_keeps_underscores_and_fence_language() {
        let md = "# T\n\nUse snake_case here.\n\n```rust\nfn main() {}\n```\n";
        let out = parse("doc.md", Some("text/markdown"), md.as_bytes().to_vec()).unwrap();
        let text = &out.pages[0].text;
        assert!(!text.contains("\\_"), "legacy underscore escaping: {text}");
        assert!(text.contains("snake_case"), "underscore word lost: {text}");
        assert!(text.contains("```rust"), "fence language lost: {text}");
    }

    /// Mirrors `parse_pdf`'s per-page rendering: a fresh strict streamer per
    /// page batch, hyperlinks from the same span inlined into the Markdown.
    /// Guards the streamer contract the PDF path depends on across
    /// `docling` upgrades without needing pdfium or the ONNX models.
    #[test]
    fn streamer_renders_page_batches_like_the_pdf_path() {
        let page1 = vec![
            Node::Heading {
                level: 1,
                text: "Intro".into(),
            },
            Node::Paragraph {
                text: "See the docs for details.".into(),
            },
        ];
        let links1 = vec![("docs".to_string(), "https://example.com".to_string())];
        let mut streamer = MarkdownStreamer::new(true, ImageMode::Placeholder, false);
        let mut text = streamer.push(&page1, &links1);
        text.push_str(&streamer.finish());
        assert!(text.contains("# Intro"), "heading missing: {text}");
        assert!(
            text.contains("[docs](https://example.com)"),
            "recovered hyperlink not inlined: {text}"
        );

        // A second page renders through its own streamer, independent of the
        // first (exactly how parse_pdf keeps pages separable).
        let page2 = vec![docling::Node::Table(docling::Table {
            rows: vec![vec!["h1".into(), "h2".into()], vec!["a".into(), "b".into()]],
            ..Default::default()
        })];
        let mut streamer = MarkdownStreamer::new(true, ImageMode::Placeholder, false);
        let mut text = streamer.push(&page2, &[]);
        text.push_str(&streamer.finish());
        let flat = text.replace(' ', "");
        assert!(flat.contains("|h1|h2|"), "table header missing: {text}");
        assert!(flat.contains("|a|b|"), "table row missing: {text}");
        assert!(!text.contains("# Intro"), "pages must be independent");
    }
}
