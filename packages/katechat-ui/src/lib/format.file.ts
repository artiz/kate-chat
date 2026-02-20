/**
 * Formats a file size in bytes to a human-readable format
 * @param bytes - The file size in bytes
 * @returns A formatted string like "1.11 MB", "512 KB", etc.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const base = 1024;
  const decimals = 2;

  const i = Math.floor(Math.log(bytes) / Math.log(base));
  const size = bytes / Math.pow(base, i);

  return `${size.toFixed(decimals)} ${units[i]}`;
}

export function getProgrammingLanguageExt(language: string): string {
  const mapping: Record<string, string> = {
    python: "py",
    javascript: "js",
    typescript: "ts",
    java: "java",
    csharp: "cs",
    cpp: "cpp",
    c: "c",
    go: "go",
    rust: "rs",
    ruby: "rb",
    php: "php",
    swift: "swift",
    kotlin: "kt",
    scala: "scala",
    perl: "pl",
    r: "r",
    bash: "sh",
    shell: "sh",
    powershell: "ps1",
    sql: "sql",
    html: "html",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    yaml: "yaml",
    xml: "xml",
    markdown: "md",
    lua: "lua",
    haskell: "hs",
    erlang: "erl",
    elixir: "ex",
    clojure: "clj",
    dart: "dart",
    groovy: "groovy",
    objectivec: "m",
    fsharp: "fs",
    vbnet: "vb",
    coffeescript: "coffee",
    ocaml: "ml",
    makefile: "mk",
    dockerfile: "Dockerfile",
    toml: "toml",
    ini: "ini",
    graphql: "graphql",
    proto: "proto",
    tex: "tex",
    latex: "tex",
    plaintext: "txt",
    text: "txt",
  };

  return mapping[language.toLowerCase()] || language;
}
