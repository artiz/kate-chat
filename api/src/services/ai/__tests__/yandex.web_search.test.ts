import { ConnectionParams } from "../../../middleware/auth.middleware";

jest.mock("undici", () => ({
  fetch: jest.fn(),
  Agent: jest.fn().mockImplementation(() => ({})),
}));

const yandexConfig = {
  searchApiUrl: "https://searchapi.api.cloud.yandex.net/v2/web/search",
  searchSmartSnippets: false,
};

jest.mock("../../../global-config", () => ({
  globalConfig: {
    yandex: yandexConfig,
    app: { userAgent: "KateChat/test" },
    runtime: { nodeEnv: "test", logLevel: "silent" },
  },
}));

import { fetch } from "undici";
import { YandexWebSearch } from "../tools/yandex.web_search";

const mockFetch = fetch as unknown as jest.Mock;

const connection: ConnectionParams = {
  yandexSearchApiKey: "test-key",
  yandexSearchApiFolder: "test-folder",
} as ConnectionParams;

const encode = (payload: string) => Buffer.from(payload, "utf-8").toString("base64");

const XML_RESPONSE = `<?xml version="1.0" encoding="utf-8"?>
<yandexsearch version="1.0">
  <response>
    <results>
      <grouping>
        <group>
          <doc>
            <title>Machine learning</title>
            <url>https://example.com/ml</url>
            <domain>example.com</domain>
            <passages><passage>An introduction to ML</passage></passages>
          </doc>
        </group>
      </grouping>
    </results>
  </response>
</yandexsearch>`;

const SNIPPETS_RESPONSE = JSON.stringify({
  docs: [
    {
      Num: 1,
      DocumentTitle: "Машинное обучение",
      FullUrl: "https://example.ru/ml",
      Description: "Краткое описание документа",
      info_context: "Подготовленный фрагмент документа с цитатами по запросу.",
    },
    {
      Num: 2,
      DocumentTitle: "Нейросети",
      FullUrl: "https://another.example.ru/nn",
      Description: "Второй документ",
      info_context: "Второй фрагмент.",
    },
  ],
});

/** Reads the JSON body of the search call (the first fetch of a run). */
const searchCallBody = () => JSON.parse(mockFetch.mock.calls[0][1].body);
const searchCallHeaders = () => mockFetch.mock.calls[0][1].headers;

const mockSearchResponse = (rawData: string) =>
  mockFetch.mockResolvedValueOnce({ json: async () => ({ rawData: encode(rawData) }) });

describe("YandexWebSearch", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    yandexConfig.searchSmartSnippets = false;
  });

  describe("without smart snippets", () => {
    it("queries the international index and parses the XML payload", async () => {
      mockSearchResponse(XML_RESPONSE);

      const results = await YandexWebSearch.search({ query: "machine learning" }, connection);

      const body = searchCallBody();
      expect(body.query.searchType).toBe("SEARCH_TYPE_COM");
      expect(body.l10n).toBe("LOCALIZATION_EN");
      expect(searchCallHeaders()["x-genesis-info-context"]).toBeUndefined();

      expect(results).toEqual([
        {
          title: "Machine learning",
          url: "https://example.com/ml",
          domain: "example.com",
          summary: "An introduction to ML",
        },
      ]);
    });

    it("downloads the pages when loadContent is requested", async () => {
      mockSearchResponse(XML_RESPONSE);
      mockFetch.mockResolvedValueOnce({ text: async () => "<html><body>Page body</body></html>" });

      const results = await YandexWebSearch.search({ query: "machine learning", loadContent: true }, connection);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][0]).toBe("https://example.com/ml");
      expect(results[0].content).toContain("Page body");
    });
  });

  describe("with smart snippets", () => {
    beforeEach(() => {
      yandexConfig.searchSmartSnippets = true;
    });

    it("asks for snippets on the Russian index and maps the JSON payload", async () => {
      mockSearchResponse(SNIPPETS_RESPONSE);

      const results = await YandexWebSearch.search({ query: "машинное обучение" }, connection);

      const body = searchCallBody();
      expect(body.query.searchType).toBe("SEARCH_TYPE_RU");
      expect(body.l10n).toBe("LOCALIZATION_RU");
      expect(searchCallHeaders()["x-genesis-info-context"]).toBe("on");

      expect(results[0]).toEqual({
        title: "Машинное обучение",
        url: "https://example.ru/ml",
        // derived from the URL: the JSON documents carry no domain field
        domain: "example.ru",
        summary: "Краткое описание документа",
        content: "Подготовленный фрагмент документа с цитатами по запросу.",
      });
    });

    it("skips the page downloads because the snippet is already the content", async () => {
      mockSearchResponse(SNIPPETS_RESPONSE);

      const results = await YandexWebSearch.search({ query: "машинное обучение", loadContent: true }, connection);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(2);
      expect(results.every(r => r.content)).toBe(true);
    });

    it("honours the requested limit", async () => {
      mockSearchResponse(SNIPPETS_RESPONSE);

      const results = await YandexWebSearch.search({ query: "машинное обучение", limit: 1 }, connection);

      expect(results).toHaveLength(1);
    });

    it("returns no results instead of throwing on a malformed payload", async () => {
      mockSearchResponse("not json at all");

      await expect(YandexWebSearch.search({ query: "машинное обучение" }, connection)).resolves.toEqual([]);
    });

    it("still downloads the page when a document came back without a snippet", async () => {
      mockSearchResponse(
        JSON.stringify({ docs: [{ DocumentTitle: "Без сниппета", FullUrl: "https://example.ru/x" }] })
      );
      mockFetch.mockResolvedValueOnce({ text: async () => "<html><body>Fallback body</body></html>" });

      const results = await YandexWebSearch.search({ query: "машинное обучение", loadContent: true }, connection);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(results[0].content).toContain("Fallback body");
    });

    it("keeps the availability probe off the billable path", async () => {
      mockSearchResponse(XML_RESPONSE);

      await expect(YandexWebSearch.isAvailable(connection)).resolves.toBe(true);

      expect(searchCallBody().query.searchType).toBe("SEARCH_TYPE_COM");
      expect(searchCallHeaders()["x-genesis-info-context"]).toBeUndefined();
    });
  });
});
