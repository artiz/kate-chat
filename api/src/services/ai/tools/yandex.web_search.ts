import { Agent, fetch } from "undici";
import { WEB_SEARCH_TEST_QUERY } from "@/config/ai/prompts";
import { YANDEX_SEARCH_API_URL } from "@/config/ai/yandex";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { createLogger } from "@/utils/logger";
import { SearchRequest, SearchResult, SearchSortMode } from "./web_search";
import { XMLParser } from "fast-xml-parser";
import { stripHtml } from "@/utils/format";

const logger = createLogger(__filename);

const dispatcher = new Agent({
  connectTimeout: 10_000,
  bodyTimeout: 10_000,
  keepAliveTimeout: 30_000,
  connections: 100, // pool
});

export class YandexWebSearch {
  public static async isAvailable(connection: ConnectionParams): Promise<boolean> {
    if (!connection.YANDEX_SEARCH_API_KEY || !connection.YANDEX_SEARCH_API_FOLDER) {
      return false;
    }

    try {
      const res = await this.search({ query: WEB_SEARCH_TEST_QUERY, limit: 1 }, connection);
      return res.length > 0;
    } catch (e) {
      return false;
    }
  }
  public static async search(request: SearchRequest, connection: ConnectionParams): Promise<SearchResult[]> {
    const data = {
      query: {
        searchType: "SEARCH_TYPE_COM",
        queryText: request.query,
      },
      folderId: connection.YANDEX_SEARCH_API_FOLDER,
      sortSpec:
        request.sortMode != null
          ? {
              sortMode: request.sortMode === SearchSortMode.RELEVANCE ? "SORT_MODE_BY_RELEVANCE" : "SORT_MODE_BY_TIME",
              sortOrder: "SORT_ORDER_ASC",
            }
          : undefined,
      maxPassages: 5,
      region: request.region,
      l10n: "LOCALIZATION_EN",
      responseFormat: "FORMAT_XML",
    };

    logger.trace(data, "Yandex Web Search request");

    const response = await fetch(YANDEX_SEARCH_API_URL, {
      method: "POST",
      dispatcher,
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${connection.YANDEX_SEARCH_API_KEY}`,
      },
    }).then(res => res.json() as Promise<{ rawData: string }>);

    if (!response.rawData) {
      return [];
    }

    const xml = Buffer.from(response.rawData, "base64").toString("utf-8");

    // Parse XML response using fast-xml-parser
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      parseTagValue: false,
      trimValues: true,
    });

    const parsed = parser.parse(xml);
    const results = this.extractSearchResults(parsed, request.limit || 3);

    if (request.loadContent) {
      // Load full content for each result
      await Promise.all(
        results.map(async result => {
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
