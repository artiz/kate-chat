export enum SearchSortMode {
  RELEVANCE,
  TIME,
}

export interface SearchRequest {
  query: string;
  /** Maximum number of search results to return. Default is 3, maximum is 10. */
  limit?: number;
  sortMode?: SearchSortMode;
  sites?: string[];
  /** ID of the search country or region that impacts the document ranking rules. */
  region?: string;
  /** Whether to load full content of the page. Default is false. */
  loadContent?: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  domain: string;
  summary?: string;
  content?: string;
}

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
