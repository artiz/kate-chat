//! Document parsing via the `fleischwolf` converter (the Rust port of docling).
//!
//! `parse` is CPU-bound and blocking (the PDF path runs pdfium + ONNX layout/OCR
//! models), so callers must run it on a blocking thread
//! (`tokio::task::spawn_blocking`).

use std::path::Path;

use fleischwolf::{DocumentConverter, InputFormat, SourceDocument};

/// The artifacts produced from one document.
pub struct ParseOutput {
    /// Markdown rendering (`*.parsed.md`), used for summaries and chunking.
    pub markdown: String,
    /// docling-native `DoclingDocument` JSON (`*.parsed.json`), kept for parity
    /// and debugging (internal to the processor).
    pub docling_json: String,
}

/// Convert raw document bytes into Markdown + docling JSON.
pub fn parse(name: &str, mime: Option<&str>, bytes: Vec<u8>) -> Result<ParseOutput, String> {
    let format = detect_format(name, mime)
        .ok_or_else(|| format!("unsupported document type (name='{name}', mime={mime:?})"))?;

    let source = SourceDocument::from_bytes(name, format, bytes);
    let result = DocumentConverter::new()
        .convert(source)
        .map_err(|e| e.to_string())?;

    Ok(ParseOutput {
        markdown: result.document.export_to_markdown(),
        docling_json: result.document.export_to_json(),
    })
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
        assert!(out.markdown.contains("# Hi"));
        assert!(out.docling_json.contains("Hi"));
    }
}
