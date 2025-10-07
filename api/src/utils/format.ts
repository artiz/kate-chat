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
