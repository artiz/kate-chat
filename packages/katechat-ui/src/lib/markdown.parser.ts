import hljs from "highlight.js";
import { Marked, Renderer } from "marked";
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
renderer.link = ({ href, title, text }) => {
  // Sanitize URL to prevent XSS attacks
  const url = sanitizeUrl(href);
  return `<a target="_blank" rel="noopener noreferrer" href="${url}" title="${escapeHtml(title) || ""}">${escapeHtml(text)}</a>`;
};

export function normalizeMatJax(input: string): string {
  return input
    ? input
        .replace(/\\\(([\s\S]+?)\\\)/g, (_, expr) => `$${expr}$`)
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
    return [markedSimple.parse(content, { renderer }) as string];
  }

  content = normalizeMatJax(content);

  // process complex code blocks, tables as one block
  if (content.match(/(```)|(\|---)/)) {
    return [marked.parse(content, { renderer }) as string];
  }

  // split large texts
  const parts = content
    .split(/(\r)?\n(\r)?\n/g)
    .filter(s => Boolean(s))
    .map(s => s + "\n\n");

  return parts.map(part => marked.parse(part, { renderer }) as string);
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
