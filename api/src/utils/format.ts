const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Decodes the basic named entities and numeric references in a single pass, so `&amp;#39;` stays literal. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(?:(amp|lt|gt|quot|apos|nbsp)|#(\d+)|#x([\da-f]+));/gi, (entity, named, dec, hex) => {
    if (named) return HTML_ENTITIES[`&${named.toLowerCase()};`] ?? entity;
    const code = dec ? Number(dec) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

/** Elements whose content is never page text: code, styling, embedded documents and page chrome. */
const NON_TEXT_ELEMENTS = [
  "head",
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
];

/**
 * Turns an HTML page into readable text: keeps the `<article>`/`<main>` body when the page marks one up,
 * drops scripts, styles and page chrome (including multi-line ones — a `.` never matched those before),
 * turns tags into whitespace so adjacent blocks do not run into one word, and decodes entities.
 */
export function stripHtml(html?: string | null): string {
  if (!html) return "";

  let text = html.replace(/<!--[\s\S]*?-->/g, " ");

  const main = text.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i);
  if (main) {
    text = main[2];
  }

  for (const tag of NON_TEXT_ELEMENTS) {
    text = text.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), " ");
  }

  return decodeHtmlEntities(
    text
      .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6]|tr|section|article|blockquote|pre|dd|dt)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\u00a0\r]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

const ESCAPE_HTML_ENTITIES: { [key: string]: string } = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

export function escapeHtml(text?: unknown): string {
  if (!text) return "";
  return String(text).replace(/[&<>"']/g, match => ESCAPE_HTML_ENTITIES[match] || match);
}

/**
 * Removes unpaired Unicode surrogate characters from a string.
 *
 * Unpaired surrogates (high surrogates 0xD800-0xDBFF without matching low surrogates 0xDC00-0xDFFF,
 * or vice versa) cause JSON serialization errors in many API providers.
 *
 * Valid emoji and other characters outside the Basic Multilingual Plane use properly paired
 * surrogates and will NOT be affected by this function.
 *
 * @param text - The text to sanitize
 * @returns The sanitized text with unpaired surrogates removed
 *
 * @example
 * // Valid emoji (properly paired surrogates) are preserved
 * sanitizeSurrogates("Hello 🙈 World") // => "Hello 🙈 World"
 *
 * // Unpaired high surrogate is removed
 * const unpaired = String.fromCharCode(0xD83D); // high surrogate without low
 * sanitizeSurrogates(`Text ${unpaired} here`) // => "Text  here"
 */
export function sanitizeSurrogates(text: string): string {
  // Replace unpaired high surrogates (0xD800-0xDBFF not followed by low surrogate)
  // Replace unpaired low surrogates (0xDC00-0xDFFF not preceded by high surrogate)
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

/**
 * Simple hash function for cache keys (not cryptographic)
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * REplace all but the first 3 and last 2 characters of a secret with asterisks for safe display.
 * @param secret
 * @returns
 */
export function obfuscateSecret(secret?: string): string | undefined {
  if (!secret) {
    return undefined;
  }

  if (secret.length <= 8) {
    return "********";
  }
  return `${secret.substring(0, 3)}...${secret.substring(secret.length - 2)}`;
}
