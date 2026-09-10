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
            <title>Machine <hlword>learning</hlword> guide</title>
            <url>https://example.com/ml</url>
            <domain>example.com</domain>
            <passages><passage>An <hlword>intro</hlword> to ML</passage></passages>
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
      expect(body.responseFormat).toBe("FORMAT_XML");
      expect(body.metadata).toBeUndefined();
      expect(searchCallHeaders()["x-genesis-info-context"]).toBeUndefined();

      expect(results).toEqual([
        {
          title: "Machine `learning` guide",
          url: "https://example.com/ml",
          domain: "example.com",
          summary: "An `intro` to ML",
        },
      ]);
    });

    it("keeps the text around <hlword> intact in multi-passage summaries", async () => {
      mockSearchResponse(`<?xml version="1.0" encoding="utf-8"?>
<yandexsearch version="1.0"><response><results><grouping><group><doc>
  <title>Rust <hlword>ownership</hlword></title>
  <url>https://example.com/rust</url>
  <domain>example.com</domain>
  <passages>
    <passage>The <hlword>borrow</hlword> checker explained</passage>
    <passage>Lifetimes and <hlword>moves</hlword></passage>
  </passages>
</doc></group></grouping></results></response></yandexsearch>`);

      const results = await YandexWebSearch.search({ query: "rust ownership" }, connection);

      expect(results[0].title).toBe("Rust `ownership`");
      expect(results[0].summary).toBe("The `borrow` checker explained Lifetimes and `moves`");
    });

    it("decodes XML entities without treating escaped markup as tags", async () => {
      mockSearchResponse(`<?xml version="1.0" encoding="utf-8"?>
<yandexsearch version="1.0"><response><results><grouping><group><doc>
  <title>Tom &amp; Jerry</title>
  <url>https://example.com/tj</url>
  <domain>example.com</domain>
  <passages><passage>Use &lt;hlword&gt; to <hlword>highlight</hlword> &amp; nothing else</passage></passages>
</doc></group></grouping></results></response></yandexsearch>`);

      const results = await YandexWebSearch.search({ query: "tom and jerry" }, connection);

      expect(results[0].title).toBe("Tom & Jerry");
      expect(results[0].summary).toBe("Use <hlword> to `highlight` & nothing else");
    });

    it("decodes numeric entities once, leaving escaped ones literal", async () => {
      mockSearchResponse(`<?xml version="1.0" encoding="utf-8"?>
<yandexsearch version="1.0"><response><results><grouping><group><doc>
  <title>Caf&#233; &#x2014; &amp;#39; stays</title>
  <url>https://example.com/cafe</url>
  <domain>example.com</domain>
  <passages><passage>Plain</passage></passages>
</doc></group></grouping></results></response></yandexsearch>`);

      const results = await YandexWebSearch.search({ query: "cafe" }, connection);

      expect(results[0].title).toBe("Café — &#39; stays");
    });

    it("returns no results without throwing when the API reports an error inside the XML", async () => {
      mockSearchResponse(`<?xml version="1.0" encoding="utf-8"?>
<yandexsearch version="1.0"><response>
  <error code="55">Вы исчерпали дневной лимит запросов</error>
</response></yandexsearch>`);

      await expect(YandexWebSearch.search({ query: "масло", loadContent: true }, connection)).resolves.toEqual([]);
      // no page downloads were attempted on an error payload
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns no results without throwing on a response without rawData", async () => {
      mockFetch.mockResolvedValueOnce({ json: async () => ({ message: "quota exceeded" }) });

      await expect(YandexWebSearch.search({ query: "масло" }, connection)).resolves.toEqual([]);
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
      // the flag travels both as a header and as a search flag in the body
      expect(searchCallHeaders()["x-genesis-info-context"]).toBe("on");
      expect(body.metadata).toEqual({ fields: { "x-genesis-info-context": "on" } });

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

    it("does not fall back to a page download for a document without a snippet", async () => {
      mockSearchResponse(
        JSON.stringify({
          docs: [{ DocumentTitle: "Без сниппета", FullUrl: "https://example.ru/x", Description: "Описание" }],
        })
      );

      const results = await YandexWebSearch.search({ query: "машинное обучение", loadContent: true }, connection);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(results[0].content).toBeUndefined();
      // the document is still usable: Description carries over as the summary
      expect(results[0].summary).toBe("Описание");
    });

    it("leaves the response format to the API instead of pinning XML", async () => {
      mockSearchResponse(SNIPPETS_RESPONSE);

      await YandexWebSearch.search({ query: "машинное обучение" }, connection);

      expect(searchCallBody().responseFormat).toBeUndefined();
    });

    it("degrades to the XML parser and page downloads when the API ignores the header", async () => {
      // seen live: the header was sent, the payload still came back as XML
      mockSearchResponse(XML_RESPONSE);
      mockFetch.mockResolvedValueOnce({ text: async () => "<html><body>Page body</body></html>" });

      const results = await YandexWebSearch.search({ query: "machine learning", loadContent: true }, connection);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Machine `learning` guide");
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(results[0].content).toContain("Page body");
    });

    it("keeps the availability probe off the billable path", async () => {
      mockSearchResponse(XML_RESPONSE);

      await expect(YandexWebSearch.isAvailable(connection)).resolves.toBe(true);

      expect(searchCallBody().query.searchType).toBe("SEARCH_TYPE_COM");
      expect(searchCallBody().metadata).toBeUndefined();
      expect(searchCallHeaders()["x-genesis-info-context"]).toBeUndefined();
    });
  });
});
