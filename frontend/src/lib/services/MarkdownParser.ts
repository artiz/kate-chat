import { Message, MessageRole } from "@/store/slices/chatSlice";
import hljs from "highlight.js";
import { Marked, Renderer } from "marked";
import { markedHighlight } from "marked-highlight";
import markedKatex from "marked-katex-extension";

// Template to store original (unformatted) code to copy it
const CodeDataTemplate = `<span class="code-data" data-code="<CODE>" data-lang="<LANG>"></span>`;

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
  { async: true, silent: true }
);

const customRenderer = new Renderer();
customRenderer.html = ({ text }: { text: string }) => {
  return escapeHtml(text);
};

/**
 * Parse markdown to html blocks
 * @param content Raw markdown
 * @returns Array for formatted HTML blocks to be rendered
 */

export async function parseMarkdown(content?: string | null): Promise<string[]> {
  if (!content) return [];

  // process complex code blocks, tables as one block
  if (content.match(/```/) || content.match(/\|-----/)) {
    return [await marked.parse(content, { async: true, renderer: customRenderer })];
  }

  // split large texts
  const parts = content
    .split(/(\r)?\n(\r)?\n/g)
    .filter(s => Boolean(s))
    .map(s => s + "\n\n");

  return await Promise.all(
    parts.map(part => marked.parse(part, { async: true, renderer: customRenderer }) as Promise<string>)
  );
}

export async function parseChatMessages(messages: Message[] = []): Promise<Message[]> {
  const parsedMessages: Message[] = Array<Message>(messages.length);
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const html =
      message.role === MessageRole.ASSISTANT || message.role === MessageRole.USER
        ? await parseMarkdown(message.content)
        : [escapeHtml(message.content) || ""];
    parsedMessages[i] = {
      ...message,
      html,
    };
  }

  return parsedMessages;
}

const ESCAPE_HTML_ENTITIES: { [key: string]: string } = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

export function escapeHtml(text?: string | null): string {
  if (!text) return "";
  return text.replace(/[&<>]/g, match => ESCAPE_HTML_ENTITIES[match] || match);
}

export function stripHtml(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/<scr.*?>.*?<\/script>/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
