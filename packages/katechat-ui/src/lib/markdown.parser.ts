import hljs from "highlight.js";
import { Marked, Renderer, Tokens } from "marked";
import { markedHighlight } from "marked-highlight";
import markedKatex from "marked-katex-extension";

import { Message, MessageRole } from "@/core/message";

// Template to store original (unformatted) code to copy it
const CodeDataTemplate = `<div class="code-header"><span class="title"><span class="header-toggle"></span><span class="language"><LANG></span></span></div><span class="code-data" data-code="<CODE>" data-lang="<LANG>"></span>`;

const marked = new Marked(
  // code highlighting
  markedHighlight({
    emptyLangClass: "hljs plaintext",
    langPrefix: "hljs ",
    highlight(code: string, lang: string) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      const formattedCode: string = hljs.highlight(code?.trim(), { language }).value;

      if (lang) {
        return (
          CodeDataTemplate.replaceAll("<LANG>", language).replaceAll("<CODE>", encodeURIComponent(code)) +
          formattedCode?.trim()
        );
      }

      return formattedCode;
    },
  }),

  // MatJAX formulas processing
  // example prompt with Claude V3 Haiku: "show me some example math equations like pythagoras, also add some example of an addition of 2 matrixes"
  // example prompt with Claude V3 Haiku: "show a proof of x is smaller y"
  markedKatex({
    displayMode: false,
    throwOnError: false,
    output: "html",
  }),
  { silent: true, gfm: true, breaks: true }
);

const markedSimple = new Marked(
  markedHighlight({
    emptyLangClass: "hljs plaintext",
    langPrefix: "hljs ",
    highlight(code: string, lang: string) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code?.trim(), { language }).value;
    },
  }),
  { silent: true, breaks: true, gfm: true }
);

const renderer = new Renderer();
renderer.html = ({ text }: { text: string }) => {
  if (["<br>", "<br/>", "<br />", "<p>"].includes(text.trim())) {
    return text;
  }
  return escapeHtml(text);
};
const AUDIO_LINK_RE = /\.(wav|mp3|ogg|m4a|flac|webm)(\?.*)?$/i;

renderer.link = ({ href, title, text }) => {
  // Sanitize URL to prevent XSS attacks
  const url = sanitizeUrl(href);

  // links to audio files (voice messages, spoken responses) render as players
  if (url && AUDIO_LINK_RE.test(url)) {
    return `<span class="audio-message"><audio controls preload="metadata" src="${url}"></audio><a target="_blank" rel="noopener noreferrer" href="${url}">${escapeHtml(text)}</a></span>`;
  }

  return `<a target="_blank" rel="noopener noreferrer" href="${url}" title="${escapeHtml(title) || ""}">${escapeHtml(text)}</a>`;
};
renderer.table = (token: Tokens.Table): string => {
  const header = token.header
    .map((cell, i) => {
      const align = token.align[i];
      return `<th class="table-sort-btn" ${align ? ` align="${align}"` : ""}>${renderer.parser.parseInline(cell.tokens)}</th>`;
    })
    .join("");

  const body = token.rows
    .map(
      row =>
        `<tr>${row
          .map((cell, i) => {
            const align = token.align[i];
            return `<td${align ? ` align="${align}"` : ""}>${renderer.parser.parseInline(cell.tokens)}</td>`;
          })
          .join("")}</tr>`
    )
    .join("");

  const colCount = token.header.length;
  return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody><tfoot><tr class="table-controls-row"><td class="table-controls" colspan="${colCount}">&nbsp;</td></tr></tfoot></table>`;
};

// LRU cache of parsed segments. During streaming the full message content is
// re-parsed on every update; all segments except the growing tail are stable,
// so caching them turns each tick from O(full message) into O(tail segment).
const PARSE_CACHE_LIMIT = 1024;
const parseCache = new Map<string, string>();

function parseWithCache(segment: string, engine: Marked, keyPrefix: string): string {
  const key = keyPrefix + segment;
  const cached = parseCache.get(key);
  if (cached !== undefined) {
    // refresh LRU position so stable segments stay hot
    parseCache.delete(key);
    parseCache.set(key, cached);
    return cached;
  }

  const html = engine.parse(segment, { renderer }) as string;
  if (parseCache.size >= PARSE_CACHE_LIMIT) {
    const oldest = parseCache.keys().next().value;
    if (oldest !== undefined) parseCache.delete(oldest);
  }
  parseCache.set(key, html);
  return html;
}

const FENCE_OPEN_RE = /^(`{3,}|~{3,})/;
const FENCE_CLOSE_RE = /^(`{3,}|~{3,})\s*$/;

/**
 * Split markdown into top-level segments: fenced code blocks opened at column 0
 * become standalone segments, plain text between them stays together. Blank
 * lines inside fences never split. An unterminated fence (streaming) runs to
 * the end and forms the trailing segment.
 */
function splitMarkdownSegments(content: string): string[] {
  const lines = content.split("\n");
  const segments: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    if (current.length) {
      segments.push(current.join("\n"));
      current = [];
    }
  };

  for (const line of lines) {
    if (fence) {
      current.push(line);
      const close = line.match(FENCE_CLOSE_RE);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) {
        fence = null;
        flush();
      }
      continue;
    }

    const open = line.match(FENCE_OPEN_RE);
    if (open) {
      flush();
      fence = open[1];
    }
    current.push(line);
  }
  flush();

  return segments;
}

// Segments that must be parsed as one block: fenced code, tables and indented
// fences (code nested in lists) — splitting them on blank lines would break
// their structure.
function isAtomicSegment(segment: string): boolean {
  return FENCE_OPEN_RE.test(segment) || segment.includes("|---") || /^\s+(`{3,}|~{3,})/m.test(segment);
}

export function normalizeMatJax(input: string): string {
  return input
    ? input
        .replace(/\\\(([\s\S]+?)\\\)/g, (_, expr) => `$${expr}$`)
        // Inline math: ($ ... $) → $ ... $
        .replace(/\(\$\s*([\s\S]+?)\s*\$\)/g, (_, expr) => `$${expr}$`)
        // Block math: \[ ... \] → $$ ... $$ (on newlines for KaTeX block mode)
        .replace(/\\\[([\s\S]+?)\\\]/g, (_, expr) => `\n$$${expr}$$\n`)
        .replace(/\$\$\n([\s\S]+?)\n\$\$\n/g, (_, expr) => `\n$$${expr}$$`)
    : "";
}

/**
 * Parse markdown to html blocks
 * @param content Raw markdown
 * @returns Array for formatted HTML blocks to be rendered
 */
export function parseMarkdown(content?: string | null, simple = false): string[] {
  if (!content) return [];

  if (simple) {
    return [parseWithCache(content, markedSimple, "s:")];
  }

  content = normalizeMatJax(content);

  const parts: string[] = [];
  for (const segment of splitMarkdownSegments(content)) {
    // process complex code blocks, tables as one block
    if (isAtomicSegment(segment)) {
      parts.push(parseWithCache(segment.endsWith("\n") ? segment : segment + "\n", marked, "m:"));
      continue;
    }

    // split large texts so every stable paragraph hits the parse cache
    for (const part of segment.split(/\r?\n\r?\n/g)) {
      if (part) {
        parts.push(parseWithCache(part + "\n\n", marked, "m:"));
      }
    }
  }

  return parts;
}

export function parseChatMessages(messages: Message[] = []): Message[] {
  const parsedMessages: Message[] = Array<Message>(messages.length);
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const html =
      message.role === MessageRole.ASSISTANT || message.role === MessageRole.USER
        ? parseMarkdown(message.content)
        : [escapeHtml(message.content) || ""];

    let linkedMessages = message.linkedMessages;
    if (linkedMessages) {
      const linkedMessagesParsed = Array<Message>(linkedMessages.length);
      for (let ndx = 0; ndx < linkedMessages.length; ndx++) {
        const linkedMessage = linkedMessages[ndx];
        if (linkedMessage.role === MessageRole.ASSISTANT || linkedMessage.role === MessageRole.USER) {
          linkedMessagesParsed[ndx] = {
            ...linkedMessage,
            html: parseMarkdown(linkedMessage.content),
          };
        } else {
          linkedMessagesParsed[ndx] = {
            ...linkedMessage,
            html: [escapeHtml(linkedMessage.content) || ""],
          };
        }
      }

      linkedMessages = linkedMessagesParsed;
    }

    parsedMessages[i] = {
      ...message,
      linkedMessages,
      html,
    };
  }

  return parsedMessages;
}

const ESCAPE_HTML_ENTITIES: { [key: string]: string } = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

export function escapeHtml(text?: string | null): string {
  if (!text) return "";
  return text.replace(/[&<>"']/g, match => ESCAPE_HTML_ENTITIES[match] || match);
}

/**
 * Sanitize URL to prevent XSS attacks
 * Only allows http, https, and mailto protocols
 */
function sanitizeUrl(url?: string | null): string {
  if (!url) return "";

  // Remove any whitespace and decode basic URL encoding for protocol detection
  const trimmedUrl = url.trim();
  const decodedUrl = decodeURIComponent(trimmedUrl).toLowerCase();

  const allowedProtocols = /^(https?:\/\/|mailto:)/i;
  if (allowedProtocols.test(trimmedUrl)) {
    return escapeHtml(trimmedUrl);
  }

  // If it starts with //, assume https
  if (trimmedUrl.startsWith("//")) {
    return escapeHtml(`https:${trimmedUrl}`);
  }

  const dangerousProtocols = /^(javascript|data|vbscript|file|ftp):/i;
  if (dangerousProtocols.test(decodedUrl)) {
    return "";
  }
  if (decodedUrl.includes("javascript:") || decodedUrl.includes("data:") || decodedUrl.includes("vbscript:")) {
    return "";
  }

  // If it looks like a relative path or doesn't have a protocol, allow it
  if (trimmedUrl.startsWith("/") || !trimmedUrl.includes("://")) {
    return escapeHtml(trimmedUrl);
  }

  // Block any other unknown protocols
  return "";
}
