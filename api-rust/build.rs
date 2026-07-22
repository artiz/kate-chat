use std::env;
use std::fs;
use std::path::{Path, PathBuf};

/// Materialize the shared Bedrock models config into OUT_DIR.
///
/// `config/data/bedrock-models-config.json` is a git symlink to the Node
/// API's `api/src/config/data/bedrock-models-config.json` (single source of
/// truth). On checkouts without symlink support (Windows with
/// `core.symlinks=false`) git stores the link target as a plain text file —
/// in that case, or if the link is missing entirely, fall back to resolving
/// the target manually.
fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let link = manifest_dir.join("config/data/bedrock-models-config.json");
    let fallback = manifest_dir.join("../api/src/config/data/bedrock-models-config.json");

    println!("cargo:rerun-if-changed={}", link.display());
    println!("cargo:rerun-if-changed={}", fallback.display());

    let content = read_config(&link)
        .or_else(|| read_config(&fallback))
        .expect(
            "bedrock-models-config.json not found via api-rust/config/data or api/src/config/data",
        );

    let out =
        PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR")).join("bedrock-models-config.json");
    fs::write(&out, content).expect("failed to write bedrock-models-config.json to OUT_DIR");
}

fn read_config(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    let trimmed = content.trim_start();
    if trimmed.starts_with('[') || trimmed.starts_with('{') {
        return Some(content);
    }
    // Symlink checked out as plain text (Windows): the file body is the
    // link target, relative to the link's directory.
    let target = path.parent()?.join(content.trim());
    let resolved = fs::read_to_string(target).ok()?;
    resolved.trim_start().starts_with('[').then_some(resolved)
}
