import { Agent, fetch } from "undici";
import { WEB_SEARCH_TEST_QUERY } from "@/config/ai/prompts";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { createLogger } from "@/utils/logger";
import { SearchRequest, SearchResult, SearchSortMode } from "./web_search";
import { XMLParser } from "fast-xml-parser";
import { stripHtml } from "@/utils/format";
import { globalConfig } from "@/global-config";

const logger = createLogger(__filename);

export const WEB_SEARCH_TOOL_NAME = "internal_web_search";

export interface SearchOptions {
  /** Overrides the `YANDEX_SEARCH_SMART_SNIPPETS` setting for a single request. */
  smartSnippets?: boolean;
}

/** Document as returned by Search API when smart snippets are requested. */
interface SmartSnippetDoc {
  Num?: number;
  DocumentTitle?: string;
  FullUrl?: string;
  Description?: string;
  /** Excerpt with citations prepared for the search query, ~500 tokens. */
  info_context?: string;
}

const dispatcher = new Agent({
  connectTimeout: 10_000,
  bodyTimeout: 10_000,
  keepAliveTimeout: 30_000,
  connections: 100, // pool
});

export class YandexWebSearch {
  public static async isAvailable(connection: ConnectionParams): Promise<boolean> {
    if (!connection.yandexSearchApiKey || !connection.yandexSearchApiFolder) {
      return false;
    }

    try {
      // The probe runs on every models list build, so never let it order billable snippets
      const res = await this.search({ query: WEB_SEARCH_TEST_QUERY, limit: 1 }, connection, {
        smartSnippets: false,
      });
      return res.length > 0;
    } catch (e) {
      return false;
    }
  }
  public static async search(
    request: SearchRequest,
    connection: ConnectionParams,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const smartSnippets = options.smartSnippets ?? globalConfig.yandex.searchSmartSnippets;

    const data = {
      query: {
        // Smart snippets are only served for the Russian index
        searchType: smartSnippets ? "SEARCH_TYPE_RU" : "SEARCH_TYPE_COM",
        queryText: request.query,
      },
      folderId: connection.yandexSearchApiFolder,
      sortSpec:
        request.sortMode != null
          ? {
              sortMode: request.sortMode === SearchSortMode.RELEVANCE ? "SORT_MODE_BY_RELEVANCE" : "SORT_MODE_BY_TIME",
              sortOrder: "SORT_ORDER_ASC",
            }
          : undefined,
      maxPassages: 5,
      docsInGroup: 3,
      region: request.region,
      // LOCALIZATION_EN is only valid for the international search type
      l10n: smartSnippets ? "LOCALIZATION_RU" : "LOCALIZATION_EN",
      // Ignored when smart snippets are on: the API answers with JSON regardless
      responseFormat: "FORMAT_XML",
      userAgent: globalConfig.app.userAgent,
    };

    logger.trace({ ...data, smartSnippets }, "Yandex Web Search request");

    const response = await fetch(globalConfig.yandex.searchApiUrl, {
      method: "POST",
      dispatcher,
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${connection.yandexSearchApiKey}`,
        ...(smartSnippets ? { "x-genesis-info-context": "on" } : {}),
      },
    }).then(res => res.json() as Promise<{ rawData: string; code?: number; message?: string; details?: any[] }>);

    if (!response.rawData) {
      if (response.code) {
        logger.warn({ response }, "Yandex Web Search API error response");
      }

      return [];
    }

    const rawData = Buffer.from(response.rawData, "base64").toString("utf-8");
    const limit = request.limit || 3;
    const results = smartSnippets
      ? this.extractSmartSnippetResults(rawData, limit)
      : this.extractSearchResults(this.parseXml(rawData), limit);

    if (request.loadContent) {
      // Load full content for the results that did not come with a snippet already
      await Promise.all(
        results
          .filter(result => !result.content)
          .map(async result => {
            try {
              const pageResponse = await fetch(result.url, {
                method: "GET",
                dispatcher,
                headers: {
                  Accept: "text/html,application/xhtml+xml,application/xml",
                },
              });
              const content = await pageResponse.text();
              result.content = stripHtml(content);
            } catch (error) {
              logger.warn(error, `Failed to load content for URL: ${result.url}`);
            }
          })
      );
    }

    return results;
  }

  private static parseXml(xml: string): any {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      parseTagValue: false,
      trimValues: true,
    });

    return parser.parse(xml);
  }

  /**
   * Smart snippets replace the XML/HTML payload with JSON, so `rawData` carries
   * `{ docs: [...] }` and every document already holds a query-relevant excerpt.
   */
  private static extractSmartSnippetResults(rawData: string, limit: number = 3): SearchResult[] {
    let docs: SmartSnippetDoc[];

    try {
      docs = JSON.parse(rawData)?.docs;
    } catch (error) {
      logger.error(error, "Failed to parse Yandex Web Search smart snippets response");
      return [];
    }

    if (!Array.isArray(docs)) {
      logger.warn({ rawData: rawData.slice(0, 500) }, "Yandex Web Search smart snippets response has no docs");
      return [];
    }

    const results: SearchResult[] = [];

    for (const doc of docs) {
      const title = doc?.DocumentTitle;
      const url = doc?.FullUrl;
      if (!title || !url) {
        continue;
      }

      results.push({
        title,
        url,
        // JSON documents carry no domain field, unlike the XML ones
        domain: this.extractDomain(url),
        summary: doc.Description || "",
        content: doc.info_context || undefined,
      });

      if (results.length >= limit) {
        break;
      }
    }

    return results;
  }

  private static extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  private static extractSearchResults(parsed: any, limit: number = 3): SearchResult[] {
    const results: SearchResult[] = [];

    try {
      // Navigate to the grouping that contains docs
      const response = parsed?.yandexsearch?.response;
      if (!response) {
        return results;
      }

      const groupings = response.results?.grouping;
      if (!groupings) {
        return results;
      }

      // Handle both single grouping and array of groupings
      const groupingArray = Array.isArray(groupings) ? groupings : [groupings];

      for (const grouping of groupingArray) {
        const groups = grouping?.group;
        if (!groups) {
          continue;
        }

        // Handle both single group and array of groups
        const groupArray = Array.isArray(groups) ? groups : [groups];

        for (const group of groupArray) {
          const doc = group?.doc;
          if (!doc) {
            continue;
          }

          // Extract title and replace <hlword> with backticks
          let title = doc.title || "";
          title = this.processHlWord(title);

          // Extract URL
          const url = doc.url || "";

          // Extract domain
          const domain = doc.domain || "";

          // Extract summary from passages
          let summary = "";
          const passages = doc.passages?.passage;
          if (passages) {
            const passageArray = Array.isArray(passages) ? passages : [passages];
            const processedPassages = passageArray.map((p: any) => {
              const text = typeof p === "string" ? p : p["#text"] || "";
              return this.processHlWord(text);
            });
            summary = processedPassages.join(" ").trim();
          }

          if (title && url) {
            results.push({
              title,
              url,
              domain,
              summary,
            });

            if (results.length >= limit) {
              return results;
            }
          }
        }
      }
    } catch (error) {
      logger.error(error, "Failed to extract search results from parsed XML");
    }

    return results;
  }

  private static processHlWord(text: string | any): string {
    if (typeof text !== "string") {
      // If text is an object (parsed with nested structure), convert to string
      if (text && typeof text === "object") {
        return this.objectToString(text);
      }
      return "";
    }

    // Replace <hlword> tags with backticks for markdown format
    return text.replace(/<hlword[^>]*>(.*?)<\/hlword>/g, "`$1`");
  }

  private static objectToString(obj: any): string {
    if (typeof obj === "string") {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.objectToString(item)).join("");
    }

    if (obj && typeof obj === "object") {
      let result = "";

      // Handle mixed content (text nodes and hlword tags)
      if ("#text" in obj) {
        result += obj["#text"];
      }

      // Check for other properties that might represent tags
      for (const key in obj) {
        if (key !== "#text" && key !== "@_" && !key.startsWith("@_")) {
          if (key === "hlword") {
            const hlwordContent = this.objectToString(obj[key]);
            result += "`" + hlwordContent + "`";
          } else {
            result += this.objectToString(obj[key]);
          }
        }
      }

      return result;
    }

    return "";
  }
}
