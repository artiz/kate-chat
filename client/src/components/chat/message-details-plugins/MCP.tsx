import React, { Fragment } from "react";
import { Text, Box, Group, Code } from "@mantine/core";
import { Message } from "@/types/graphql";
import { IconPlugConnected } from "@tabler/icons-react";
import i18n from "@/i18n";

/** MCP Details - Display MCP tool call results */
export const MCPCall = (message: Message): React.ReactNode => {
  if (!message || !message.metadata) return null;

  const tools = message.metadata.tools || [];
  const toolCalls = message.metadata.toolCalls || [];
  if (!tools.length && !toolCalls.length) return null;

  // MCP tool calls have type "mcp" or names starting with "M_"
  const mcpToolCalls = toolCalls.filter(call => call.type === "mcp" || call.name?.startsWith("M_"));
  const mcpCallIds = new Set(mcpToolCalls.map(c => c.callId));
  const mcpToolNames = new Set(mcpToolCalls.map(c => c.name));

  // Match tool results: by callId first, then by name pattern
  const mcpResults = tools.filter(
    tool =>
      (tool.callId && mcpCallIds.has(tool.callId)) ||
      (!tool.callId && tool.name?.startsWith("M_")) ||
      (tool.name && mcpToolNames.has(tool.name))
  );

  if (!mcpToolCalls.length && !mcpResults.length) return null;

  const detailsNodes: React.ReactNode[] = [];

  // Build a map of callId -> result for matching
  const resultByCallId = new Map(mcpResults.filter(r => r.callId).map(r => [r.callId, r]));
  const resultByName = new Map(mcpResults.map(r => [r.name, r]));

  // Show MCP tool calls with their results
  if (mcpToolCalls.length) {
    const cmp = (
      <Fragment key="mcp-calls">
        <Group justify="flex-start" align="center" gap="xs" className="message-details-header">
          <IconPlugConnected size={16} className="message-details-icon" />
          <Text fw={600} size="sm">
            {i18n.t("messageDetails.mcpToolCalls")}
          </Text>
        </Group>

        {mcpToolCalls.map((call, idx) => {
          const result = resultByCallId.get(call.callId) || resultByName.get(call.name);
          // Extract the original tool name from the description (format: "originalName: description")
          const displayName = extractToolName(call.name);

          return (
            <div key={call.callId || idx} className="message-details-content">
              <Text size="xs" fw={500}>
                {displayName}
              </Text>
              {call.args && (
                <Box fz="12" mt={4}>
                  <Text size="xs" c="dimmed">
                    {i18n.t("messageDetails.arguments")}
                  </Text>
                  <Code block fz="11">
                    {formatArgs(call.args)}
                  </Code>
                </Box>
              )}
              {call.error && (
                <Text size="xs" c="red" mt={4}>
                  Error: {call.error}
                </Text>
              )}
              {result?.content && (
                <Box fz="12" mt={4}>
                  <Text size="xs" c="dimmed">
                    {i18n.t("messageDetails.result")}
                  </Text>
                  <Box fz="12">
                    <pre>{truncateContent(result.content)}</pre>
                  </Box>
                </Box>
              )}
            </div>
          );
        })}
      </Fragment>
    );

    detailsNodes.push(cmp);
  }

  // Show any MCP results that weren't matched to tool calls
  const unmatchedResults = mcpResults.filter(r => !mcpToolCalls.some(c => c.callId === r.callId || c.name === r.name));

  if (unmatchedResults.length) {
    const cmp = (
      <Fragment key="mcp-results">
        <Group justify="flex-start" align="center" gap="xs" mt="lg" className="message-details-header">
          <IconPlugConnected size={16} className="message-details-icon" />
          <Text fw={600} size="sm">
            {i18n.t("messageDetails.mcpResults")}
          </Text>
        </Group>

        {unmatchedResults.map((result, idx) => (
          <div key={result.callId || idx} className="message-details-content">
            <Text size="xs" fw={500}>
              {extractToolName(result.name)}
            </Text>
            {result.content && (
              <Box fz="12" mt={4}>
                <pre>{truncateContent(result.content)}</pre>
              </Box>
            )}
          </div>
        ))}
      </Fragment>
    );

    detailsNodes.push(cmp);
  }

  return detailsNodes.length ? detailsNodes : null;
};

const MAX_CONTENT_LENGTH = 4096; // Limit content length for display

function truncateContent(content: string): string {
  let formattedContent: string;
  try {
    formattedContent = JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    formattedContent = content;
  }

  if (formattedContent.length <= MAX_CONTENT_LENGTH) return formattedContent;
  return formattedContent.substring(0, MAX_CONTENT_LENGTH) + "\n... (truncated)";
}

function formatArgs(args: string): string {
  try {
    return JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    return args;
  }
}

/** Extract original tool name - MCP tools use encoded names like M_<serverId>_<index> */
function extractToolName(name: string): string {
  return name || "MCP Tool";
}
