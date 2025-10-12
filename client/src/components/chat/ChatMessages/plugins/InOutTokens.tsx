import React from "react";
import { Tooltip, Text } from "@mantine/core";
import { Message } from "@/types/graphql";
import { PluginProps } from "@katechat/ui";

/** Show input/output tokens if available in message metadata */
export const InOutTokens = ({ message }: PluginProps<Message>) => {
  const { metadata } = message;
  return metadata?.usage && (metadata.usage.inputTokens || metadata.usage.outputTokens) ? (
    <Tooltip
      label={`Input tokens: ${metadata.usage.inputTokens || "N/A"}, Output tokens: ${metadata.usage.outputTokens || "N/A"}`}
      position="top"
      withArrow
    >
      <Text size="xs" c="dimmed" style={{ marginLeft: "auto", cursor: "help" }}>
        IN: {metadata.usage.inputTokens || "N/A"}, OUT: {metadata.usage.outputTokens || "N/A"}
      </Text>
    </Tooltip>
  ) : null;
};
