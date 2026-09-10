import { parseWebSearchResults, splitHighlighted } from "../components/chat/message-details-plugins/WebSearch";

describe("splitHighlighted", () => {
  it("separates the backticked search terms from the surrounding text", () => {
    expect(splitHighlighted("Рост `цен` на `бензин` в России")).toEqual([
      { text: "Рост ", highlighted: false },
      { text: "цен", highlighted: true },
      { text: " на ", highlighted: false },
      { text: "бензин", highlighted: true },
      { text: " в России", highlighted: false },
    ]);
  });

  it("returns plain text untouched", () => {
    expect(splitHighlighted("no markers here")).toEqual([{ text: "no markers here", highlighted: false }]);
  });
});

/** Mirrors WEB_SEARCH_TOOL_RESULT in api/src/config/ai/prompts.ts */
const toolResult = (
  results: Array<{ title: string; url: string; domain: string; summary?: string; content?: string }>
) =>
  `
    # Web search results
    Please use this information to assist with your answer.
    Always include a reference to the source of the information in your answer, using the valid markdown format [page title](url).

    ${results
      .map(
        r => `
    ### Result
    title: ${r.title}
    url: ${r.url}
    domain: ${r.domain}
    summary: ${r.summary || "N/A"}
    content:
    """
    ${r.content || "N/A"}
    """`
      )
      .join("\n\n---\n\n")}
  `;

describe("parseWebSearchResults", () => {
  it("extracts the snippet handed to the model", () => {
    const entries = parseWebSearchResults(
      toolResult([
        {
          title: "Погода в Милане",
          url: "https://example.ru/milan",
          domain: "example.ru",
          summary: "Прогноз на сегодня",
          content: "Днём до +31°C, ветер юго-восточный 3 м/с.\nНочью около +21°C.",
        },
      ])
    );

    expect(entries).toEqual([
      {
        title: "Погода в Милане",
        url: "https://example.ru/milan",
        domain: "example.ru",
        summary: "Прогноз на сегодня",
        content: "Днём до +31°C, ветер юго-восточный 3 м/с.\nНочью около +21°C.",
      },
    ]);
  });

  it("keeps one entry per result even when a snippet contains a markdown rule", () => {
    const entries = parseWebSearchResults(
      toolResult([
        {
          title: "First",
          url: "https://a.example",
          domain: "a.example",
          content: "Intro\n---\nDetails after the rule",
        },
        { title: "Second", url: "https://b.example", domain: "b.example", content: "Plain" },
      ])
    );

    expect(entries.map(e => e.title)).toEqual(["First", "Second"]);
    expect(entries[0].content).toBe("Intro\n---\nDetails after the rule");
  });

  it("leaves summary and content undefined when the tool had none", () => {
    const entries = parseWebSearchResults(
      toolResult([{ title: "Bare", url: "https://c.example", domain: "c.example" }])
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toBeUndefined();
    expect(entries[0].content).toBeUndefined();
  });

  it("returns nothing for an unstructured tool message", () => {
    expect(parseWebSearchResults('No results found for query: "x"')).toEqual([]);
  });
});
