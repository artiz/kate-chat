import { Message, MessageRole } from "@/store/slices/chatSlice";
import hljs from "highlight.js";
import { Marked, Renderer } from "marked";
import { markedHighlight } from "marked-highlight";
import markedKatex from "marked-katex-extension";

const CodeHeaderTemplate = `
    <span class="code-data" data-code="<CODE>" data-lang="<LANG>" ></span>
`;

const marked = new Marked(
    markedHighlight({
        emptyLangClass: "hljs plaintext",
        langPrefix: "hljs ",
        highlight(code: string, lang: string) {
            const language = hljs.getLanguage(lang) ? lang : "plaintext";
            const formattedCode: string = hljs.highlight(code?.trim(), { language }).value;

            if (lang) {
                return (
                    CodeHeaderTemplate.replaceAll("<LANG>", language).replaceAll("<CODE>", encodeURIComponent(code)) +
                    formattedCode?.trim()
                );
            }

            return formattedCode;
        },
    }),

    // MatJAX formulas examples
    // example prompt with Claude V3 Haiku: "show me some example math equations like pythagoras, also add some example of an addition of 2 matrixes"
    // example prompt with Claude V3 Haiku: "show a proof of x is smaller y"
    markedKatex({
        displayMode: false,
        throwOnError: false,
        output: "html",
    }),
    { async: true, silent: true, breaks: true },
);

const markedHtmlEscaper = new Renderer();

markedHtmlEscaper.html = ({ text }: { text: string }) => {
    return escapeHtml(text);
};

export async function parseMessageHtml(content?: string | null): Promise<string[]> {
    if (!content) return [];

    // code blocks, tables
    if (content.match(/```/) || content.match(/\|-----/)) {
        return [await marked.parse(content, { async: true, renderer: markedHtmlEscaper })];
    }

    // large texts
    const parts = content
        .split(/(\r)?\n(\r)?\n/g)
        .filter((s) => Boolean(s))
        .map((s) => s + "\n\n");

    return await Promise.all(
        parts.map((part) => marked.parse(part, { async: true, renderer: markedHtmlEscaper }) as Promise<string>),
    );
}

export async function parseMessages(messages: Message[] = []): Promise<Message[]> {
    const parsedMessages: Message[] = Array<Message>(messages.length);
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const html =
            message.role === MessageRole.ASSISTANT
                ? await parseMessageHtml(message.content)
                : [escapeHtml(message.content) || ""];
        parsedMessages[i] = {
            ...message,
            html,
        };
    }

    return parsedMessages;
}

export function escapeHtml(text?: string | null): string {
    if (!text) return "";

    const htmlEntities: { [key: string]: string } = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
    };

    return text.replace(/[&<>]/g, (match) => htmlEntities[match] || match);
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
