import { Agent, fetch } from "undici";
import { WEB_SEARCH_TEST_QUERY } from "@/config/ai/prompts";
import { ConnectionParams } from "@/middleware/auth.middleware";
import { createLogger } from "@/utils/logger";
import { SearchRequest, SearchResult, SearchSortMode } from "./web_search";
import { XMLParser } from "fast-xml-parser";
import { decodeHtmlEntities, stripHtml } from "@/utils/format";
import { globalConfig } from "@/global-config";

const logger = createLogger(__filename);

export const WEB_SEARCH_TOOL_NAME = "internal_web_search";

export interface SearchOptions {
  /** Overrides the `YANDEX_SEARCH_SMART_SNIPPETS` setting and the language check for a single request. */
  smartSnippets?: boolean;
}

/**
 * Smart snippets are served for the Russian index only (SEARCH_TYPE_RU), which is a worse result
 * set for everyone else, and they are billed on top of the search. So even with
 * `YANDEX_SEARCH_SMART_SNIPPETS` on, they are ordered only for users whose UI language is Russian.
 */
const SMART_SNIPPETS_LANGUAGE = "ru";

export const smartSnippetsSupported = (language?: string): boolean =>
  (language || "").trim().toLowerCase().split(/[-_]/)[0] === SMART_SNIPPETS_LANGUAGE;

/**
 * Document as returned by Search API when smart snippets are requested. The docs list
 * `Num`, `DocumentTitle`, `FullUrl`, `Description` and `info_context` as flat fields; live, only
 * `FullUrl` and `info_context` (the excerpt with citations prepared for the query, ~500 tokens)
 * sit at the top level, next to `full_text` (the whole page text), while `DocumentTitle`,
 * `Description`, `ForcedShortUrl` (the display domain) and `Num` are nested under `rich_data`.
 * Both layouts are read, case-insensitively, see field().
 */
type SmartSnippetDoc = Record<string, unknown>;

const asRecord = (value: unknown): SmartSnippetDoc =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as SmartSnippetDoc) : {};

/** Reads the first non-empty string among the given field names, ignoring case. */
const field = (doc: SmartSnippetDoc, ...names: string[]): string | undefined => {
  const keys = new Map(Object.keys(doc).map(key => [key.toLowerCase(), key]));
  for (const name of names) {
    const key = keys.get(name.toLowerCase());
    const value = key === undefined ? undefined : doc[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

/** Asks Search API for smart snippets; sent as a header and as a search flag. */
const SMART_SNIPPETS_FLAG = { "x-genesis-info-context": "on" };

/** Nodes whose text Search API highlights with <hlword>, parsed as raw XML. */
const HIGHLIGHTED_NODES = ["*.title", "*.passage"];

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
    const smartSnippets =
      options.smartSnippets ??
      (globalConfig.yandex.searchSmartSnippets && smartSnippetsSupported(connection.userLanguage));

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
      // Smart snippets come back as JSON; pinning FORMAT_XML here has been observed to win
      // over the x-genesis-info-context header, so leave the format to the API in that mode
      responseFormat: smartSnippets ? undefined : "FORMAT_XML",
      userAgent: globalConfig.app.userAgent,
      // The docs ask for the flag "in the request metadata". For gRPC that is a header; the
      // REST body has a `metadata.fields` map of search flags and the API has been seen to
      // ignore the header alone, so the flag goes into both places.
      metadata: smartSnippets ? { fields: SMART_SNIPPETS_FLAG } : undefined,
    };

    logger.trace({ ...data, smartSnippets }, "Yandex Web Search request");

    const response = await fetch(globalConfig.yandex.searchApiUrl, {
      method: "POST",
      dispatcher,
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${connection.yandexSearchApiKey}`,
        ...(smartSnippets ? SMART_SNIPPETS_FLAG : {}),
      },
    }).then(res => res.json() as Promise<{ rawData: string; code?: number; message?: string; details?: any[] }>);

    if (!response.rawData) {
      logger.warn(
        { response, query: request.query, smartSnippets },
        response.code ? "Yandex Web Search API error response" : "Yandex Web Search API response without rawData"
      );
      return [];
    }

    const rawData = Buffer.from(response.rawData, "base64").toString("utf-8");
    const limit = request.limit || 3;

    // The API answers with plain XML when it does not honour the snippets header (the feature
    // not being enabled for the folder, for one), so pick the parser from the payload itself
    // and let such a search degrade to the regular one instead of coming back empty.
    const snippetsApplied = smartSnippets && rawData.trimStart().startsWith("{");
    if (smartSnippets && !snippetsApplied) {
      logger.warn(
        { payload: rawData.slice(0, 120) },
        "Yandex Web Search smart snippets were requested but the API answered with a non-JSON payload"
      );
    }

    const results = snippetsApplied
      ? this.extractSmartSnippetResults(rawData, limit)
      : this.extractSearchResults(this.parseXml(rawData), limit);

    // Smart snippets already carry a query-relevant excerpt. Downloading the page for the odd
    // document that came without one would reintroduce the latency and failure modes the mode
    // exists to avoid, and WEB_SEARCH_TOOL_RESULT keeps only the first
    // WEB_SEARCH_TOOL_MAX_CONTENT_LENGTH characters anyway — for a stripped page that is
    // usually navigation boilerplate. Such a document still carries its Description as summary.
    if (!results.length) {
      logger.info({ query: request.query, smartSnippets: snippetsApplied }, "Yandex Web Search returned no results");
    }

    if (request.loadContent && !snippetsApplied) {
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

  private static parseXml(xml: string): any {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      parseTagValue: false,
      trimValues: true,
      // Keep the highlighted nodes as raw XML: parsing them normally lifts <hlword> into a
      // sibling key and concatenates what is left, so "Machine <hlword>learning</hlword> guide"
      // collapses into "Machineguide". processHlWord() needs the tags in place instead.
      stopNodes: HIGHLIGHTED_NODES,
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
      if (!doc || typeof doc !== "object") {
        continue;
      }

      const rich = asRecord(doc.rich_data);
      const title = field(rich, "DocumentTitle", "title") ?? field(doc, "DocumentTitle", "title");
      const url = field(doc, "FullUrl", "url") ?? field(rich, "FullUrl", "url");
      if (!title || !url) {
        continue;
      }

      results.push({
        title,
        url,
        domain: field(rich, "ForcedShortUrl") ?? this.extractDomain(url),
        summary: field(rich, "Description", "summary") ?? field(doc, "Description", "summary") ?? "",
        // The snippet is what the mode is for; the page text stands in when a document has none
        content: field(doc, "info_context", "infoContext") ?? field(doc, "full_text"),
      });

      if (results.length >= limit) {
        break;
      }
    }

    if (docs.length && !results.length) {
      // The shape differs from the documented one: show what actually came back
      logger.warn(
        { keys: Object.keys(docs[0] ?? {}), sample: JSON.stringify(docs[0]).slice(0, 500) },
        "Yandex Web Search smart snippet documents did not map to results"
      );
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

      // Quota and limit problems arrive as HTTP 200 with <error code="..."> inside the response
      if (response.error) {
        const error = response.error;
        logger.warn(
          { code: error?.["@_code"], message: typeof error === "string" ? error : error?.["#text"] },
          "Yandex Web Search response carries an error"
        );
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
            const processedPassages = passageArray.map((p: any) => this.processHlWord(p));
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

  /**
   * Turns a raw highlighted node into markdown: <hlword> becomes backticks, anything else
   * the API wrapped the text in is dropped, and XML entities are decoded last so that an
   * escaped tag in the document text is never mistaken for markup.
   */
  private static processHlWord(text: unknown): string {
    const raw = typeof text === "string" ? text : ((text as any)?.["#text"] ?? "");
    if (typeof raw !== "string" || !raw) {
      return "";
    }

    return decodeHtmlEntities(raw.replace(/<hlword[^>]*>(.*?)<\/hlword>/g, "`$1`").replace(/<[^>]*>/g, "")).trim();
  }
}
