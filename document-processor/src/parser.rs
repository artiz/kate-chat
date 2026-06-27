//! Document parsing via the `fleischwolf` converter (the Rust port of docling).
//!
//! PDFs are split into single-page documents (`lopdf`) and converted page by page
//! through one reused `fleischwolf-pdf` [`Pipeline`] (a single layout-model load),
//! which gives real per-page Markdown and an accurate page count. Everything else
//! is converted in one pass as a single logical page.
//!
//! `parse` is CPU-bound and blocking (the PDF path runs pdfium + ONNX layout/OCR
//! models), so callers must run it on a blocking thread
//! (`tokio::task::spawn_blocking`).

use std::path::Path;

use fleischwolf::{DocumentConverter, InputFormat, SourceDocument};
use fleischwolf_pdf::Pipeline;
use lopdf::Document as PdfDocument;

use crate::model::ParsedPage;

/// The result of parsing one document: its pages (Markdown) and page count.
pub struct ParseOutput {
    pub pages: Vec<ParsedPage>,
    pub pages_count: u32,
}

/// Convert raw document bytes into per-page Markdown.
pub fn parse(name: &str, mime: Option<&str>, bytes: Vec<u8>) -> Result<ParseOutput, String> {
    let format = detect_format(name, mime)
        .ok_or_else(|| format!("unsupported document type (name='{name}', mime={mime:?})"))?;

    let pages = if format == InputFormat::Pdf {
        parse_pdf(name, &bytes)?
    } else {
        let source = SourceDocument::from_bytes(name, format, bytes);
        let document = DocumentConverter::new()
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

/// Convert a PDF page by page when it can be split; otherwise fall back to a
/// single whole-document pass (one logical page).
fn parse_pdf(name: &str, bytes: &[u8]) -> Result<Vec<ParsedPage>, String> {
    if let Some(pages) = try_parse_pdf_per_page(name, bytes) {
        return Ok(pages);
    }

    // Fallback: parse the whole document as a single page (e.g. lopdf could not
    // split it, or it has a single page).
    let document = fleischwolf_pdf::convert(bytes, None, name).map_err(|e| e.to_string())?;
    Ok(vec![ParsedPage {
        page: 1,
        text: document.export_to_markdown(),
    }])
}

/// Best-effort page-by-page PDF conversion. Returns `None` (so the caller falls
/// back to a single pass) when the PDF cannot be split or any page fails.
fn try_parse_pdf_per_page(name: &str, bytes: &[u8]) -> Option<Vec<ParsedPage>> {
    let page_pdfs = split_pdf_parts(bytes, 1).ok()?;
    if page_pdfs.len() <= 1 {
        return None;
    }

    // One pipeline → the layout model loads once and is reused across pages.
    let mut pipeline = Pipeline::new().ok()?;
    let mut pages = Vec::with_capacity(page_pdfs.len());
    for (index, page_bytes) in page_pdfs.iter().enumerate() {
        let document = pipeline.convert(page_bytes, None, name).ok()?;
        pages.push(ParsedPage {
            page: (index + 1) as u32,
            text: document.export_to_markdown(),
        });
    }
    Some(pages)
}

/// Number of pages in a PDF, or `None` if it can't be read.
pub fn pdf_page_count(bytes: &[u8]) -> Option<usize> {
    PdfDocument::load_mem(bytes)
        .ok()
        .map(|d| d.get_pages().len())
}

/// True if the document resolves to PDF (by MIME or filename).
pub fn is_pdf(name: &str, mime: Option<&str>) -> bool {
    detect_format(name, mime) == Some(InputFormat::Pdf)
}

/// Split a PDF into parts of at most `group_size` pages each, in document order
/// (`group_size = 1` → one PDF per page). Returns an empty vec for an empty PDF.
pub fn split_pdf_parts(bytes: &[u8], group_size: usize) -> Result<Vec<Vec<u8>>, lopdf::Error> {
    use std::collections::HashSet;

    let document = PdfDocument::load_mem(bytes)?;
    let page_numbers: Vec<u32> = document.get_pages().keys().copied().collect();
    if page_numbers.is_empty() {
        return Ok(Vec::new());
    }
    let group_size = group_size.max(1);

    let mut result = Vec::with_capacity(page_numbers.len().div_ceil(group_size));
    for group in page_numbers.chunks(group_size) {
        let keep: HashSet<u32> = group.iter().copied().collect();
        let mut part = document.clone();
        let to_delete: Vec<u32> = page_numbers
            .iter()
            .copied()
            .filter(|p| !keep.contains(p))
            .collect();
        part.delete_pages(&to_delete);
        let mut buffer = Vec::new();
        part.save_to(&mut buffer)?;
        result.push(buffer);
    }
    Ok(result)
}

/// Resolve the `fleischwolf` input format from MIME type (preferred) or, failing
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
}
