import { WEB_SEARCH_TEST_QUERY } from "@/config/ai/prompts";
import { YANDEX_SEARCH_API_URL } from "@/config/ai/yandex";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { createLogger } from "@/utils/logger";
import axios, { isAxiosError } from "axios";
import { Agent } from "undici";
import { SearchRequest, SearchResult, SearchSortMode, stripHtml } from "./web_search";
import { XMLParser } from "fast-xml-parser";

const logger = createLogger(__filename);

const fetchOptions: Record<string, any> = {
  dispatcher: new Agent({
    keepAliveTimeout: 30_000,
    connections: 100, // pool
  }),
};

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

    let rawData = "";
    try {
      const response = await axios.post<{ rawData: string }>(YANDEX_SEARCH_API_URL, data, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Api-Key ${connection.YANDEX_SEARCH_API_KEY}`,
        },
        fetchOptions,
      });
      rawData = response.data.rawData;
    } catch (error) {
      if (isAxiosError(error)) {
        const axiosError = error;
        logger.error(
          { status: axiosError.response?.status, data: axiosError.response?.data },
          "Yandex Search API error"
        );
      }
      throw error;
    }

    if (!rawData) {
      return [];
    }

    const xml = Buffer.from(rawData, "base64").toString("utf-8");

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
            const pageResponse = await axios.get(result.url, {
              responseType: "text",
              timeout: 10000, // 10 seconds timeout
            });
            result.content = stripHtml(pageResponse.data);
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
