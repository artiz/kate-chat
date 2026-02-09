export function stripHtml(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/<script.*?>.*?<\/script>/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[\t\n]+/g, "\n")
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
