import React, { Fragment } from "react";
import { Text, Box, Group, Anchor } from "@mantine/core";
import { Message } from "@/types/graphql";
import { IconWorldSearch } from "@tabler/icons-react";
import { TFunction, t as globalT } from "i18next";

const WEB_SEARCH_TOOL_NAME = "internal-web_search";

/** Web Search Details - Display web search tool results */
export const WebSearchCall = (message: Message, t: TFunction = globalT): React.ReactNode => {
  if (!message || !message.metadata) return null;

  const tools = message.metadata.tools || [];
  if (!tools.length) return null;

  const searchResults = tools.filter(tool => tool.name === WEB_SEARCH_TOOL_NAME);
  if (!searchResults.length) return null;

  const detailsNodes: React.ReactNode[] = [];

  for (const result of searchResults) {
    const content = result.content?.trim();
    if (!content) continue;

    // Parse individual search results from the formatted content
    const entries = parseWebSearchResults(content);

    const cmp = (
      <Fragment key={`web-search-${result.callId || detailsNodes.length}`}>
        <Group justify="flex-start" align="center" gap="xs" className="message-details-header">
          <IconWorldSearch size={16} className="message-details-icon" />
          <Text fw={600} size="sm">
            {t("messageDetails.webSearch")}
          </Text>
        </Group>

        <div className="message-details-content">
          {entries.length > 0 ? (
            <ol>
              {entries.map((entry, idx) => (
                <li key={idx}>
                  {entry.url ? (
                    <Anchor href={entry.url} target="_blank" rel="noopener noreferrer" size="xs">
                      {entry.title || entry.url}
                    </Anchor>
                  ) : (
                    <Text size="xs">{entry.title || `#${idx + 1}`}</Text>
                  )}
                  {entry.summary && (
                    <Text size="xs" c="dimmed" mt={2}>
                      {entry.summary}
                    </Text>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <Box fz="12">
              <pre>{content}</pre>
            </Box>
          )}
        </div>
      </Fragment>
    );

    detailsNodes.push(cmp);
  }

  return detailsNodes.length ? detailsNodes : null;
};

interface WebSearchEntry {
  title?: string;
  url?: string;
  domain?: string;
  summary?: string;
}

/** Parse structured web search results from the tool output */
function parseWebSearchResults(content: string): WebSearchEntry[] {
  const entries: WebSearchEntry[] = [];
  const blocks = content.split(/---|\n### Result/);

  for (const block of blocks) {
    const titleMatch = block.match(/title:\s*(.+)/);
    const urlMatch = block.match(/url:\s*(.+)/);
    const domainMatch = block.match(/domain:\s*(.+)/);
    const summaryMatch = block.match(/summary:\s*(.+)/);

    if (titleMatch || urlMatch) {
      entries.push({
        title: titleMatch?.[1]?.trim(),
        url: urlMatch?.[1]?.trim(),
        domain: domainMatch?.[1]?.trim(),
        summary: summaryMatch?.[1]?.trim() !== "N/A" ? summaryMatch?.[1]?.trim() : undefined,
      });
    }
  }

  return entries;
}
