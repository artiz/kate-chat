//! pdfium-based PDF utilities: page count + splitting into part PDFs.
//!
//! pdfium (the same fast C library the ML pipeline already uses) replaces lopdf,
//! which deep-clones the whole document per part and froze on large PDFs. All
//! pdfium access is serialized process-wide by pdfium-render's `thread_safe`
//! feature, so these are safe to call from blocking worker threads.
//!
//! These functions are blocking; run them on `tokio::task::spawn_blocking`.

use pdfium_render::prelude::*;

/// Bind to pdfium from a directory (or direct file) path.
fn try_bind(path: &str) -> Option<Pdfium> {
    let name = Pdfium::pdfium_platform_library_name_at_path(&path);
    if let Ok(bindings) = Pdfium::bind_to_library(&name) {
        return Some(Pdfium::new(bindings));
    }
    Pdfium::bind_to_library(path).ok().map(Pdfium::new)
}

/// Bind pdfium with the same search order as docling-pdf:
/// `PDFIUM_DYNAMIC_LIB_PATH` first, then the `.pdfium/lib` layout produced by
/// docling.rs's `download_dependencies.sh` — relative to the current directory,
/// next to the executable, or one level above it — and finally the system
/// library. Keeping the orders identical means the splitter never fails on a
/// setup where the conversion pipeline itself would work.
fn pdfium() -> Result<Pdfium, String> {
    if let Ok(path) = std::env::var("PDFIUM_DYNAMIC_LIB_PATH") {
        if let Some(pdfium) = try_bind(&path) {
            return Ok(pdfium);
        }
    }

    let rel = std::path::Path::new(".pdfium/lib");
    if rel.exists() {
        if let Some(pdfium) = try_bind(".pdfium/lib") {
            return Ok(pdfium);
        }
    }
    if let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.canonicalize().ok())
        .and_then(|p| p.parent().map(std::path::Path::to_path_buf))
    {
        for base in [Some(exe_dir.as_path()), exe_dir.parent()]
            .into_iter()
            .flatten()
        {
            let dir = base.join(".pdfium/lib");
            if dir.exists() {
                if let Some(pdfium) = try_bind(&dir.to_string_lossy()) {
                    return Ok(pdfium);
                }
            }
        }
    }

    Pdfium::bind_to_system_library()
        .map(Pdfium::new)
        .map_err(|e| format!("pdfium bind: {e}"))
}

/// Split an already-loaded document into parts of at most `group_size` pages each
/// (document order), returning each as standalone PDF bytes.
fn split_loaded(
    pdfium: &Pdfium,
    source: &PdfDocument,
    group_size: u16,
) -> Result<Vec<Vec<u8>>, String> {
    let total = source.pages().len();
    if total == 0 {
        return Ok(Vec::new());
    }
    let group_size = group_size.max(1);

    let mut parts = Vec::with_capacity((total as usize).div_ceil(group_size as usize));
    let mut start: u16 = 0;
    while start < total {
        let end = start.saturating_add(group_size - 1).min(total - 1); // inclusive
        let mut part = pdfium
            .create_new_pdf()
            .map_err(|e| format!("pdfium create: {e}"))?;
        part.pages_mut()
            .copy_page_range_from_document(source, start..=end, 0)
            .map_err(|e| format!("pdfium copy {start}..={end}: {e}"))?;
        parts.push(
            part.save_to_bytes()
                .map_err(|e| format!("pdfium save: {e}"))?,
        );
        start = end + 1;
    }
    Ok(parts)
}

/// Inspect a PDF for batching in a single load: returns the page count and, when
/// it exceeds `threshold`, the document split into `threshold`-page parts
/// (otherwise an empty parts vec — the caller parses it as one document).
pub fn inspect_for_batching(
    bytes: &[u8],
    threshold: usize,
) -> Result<(usize, Vec<Vec<u8>>), String> {
    let pdfium = pdfium()?;
    let source = pdfium
        .load_pdf_from_byte_slice(bytes, None)
        .map_err(|e| format!("pdfium load: {e}"))?;
    let count = source.pages().len() as usize;
    if count <= threshold {
        return Ok((count, Vec::new()));
    }
    let group_size = threshold.clamp(1, u16::MAX as usize) as u16;
    let parts = split_loaded(&pdfium, &source, group_size)?;
    Ok((count, parts))
}
