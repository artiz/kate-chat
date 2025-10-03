import hljs from "highlight.js";
import { Marked, Renderer } from "marked";
import { markedHighlight } from "marked-highlight";
import markedKatex from "marked-katex-extension";
import { Message } from "@/types/graphql";
import { MessageRole } from "@/types/ai";

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
  { silent: false, breaks: true, gfm: true }
);

const renderer = new Renderer();
renderer.html = ({ text }: { text: string }) => {
  return escapeHtml(text);
};
renderer.link = ({ href, title, text }) =>
  `<a target="_blank" rel="noopener noreferrer" href="${href}" title="${title || ""}">${text}</a>`;

/**
 * Parse markdown to html blocks
 * @param content Raw markdown
 * @returns Array for formatted HTML blocks to be rendered
 */

export function parseMarkdown(content?: string | null): string[] {
  if (!content) return [];

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
};

export function escapeHtml(text?: string | null): string {
  if (!text) return "";
  return text.replace(/[&<>]/g, match => ESCAPE_HTML_ENTITIES[match] || match);
}
