import React from "react";
import { Tooltip, Text } from "@mantine/core";
import { Message } from "@/types/graphql";
import { PluginProps } from "@katechat/ui";
import { useTranslation } from "react-i18next";

/** Show input/output tokens if available in message metadata */
export const InOutTokens = ({ message }: PluginProps<Message>) => {
  const { t } = useTranslation();
  const { metadata } = message;
  const na = t("chat.na");
  return metadata?.usage && (metadata.usage.inputTokens || metadata.usage.outputTokens) ? (
    <Tooltip
      label={`${t("chat.inputTokens", { count: String(metadata.usage.inputTokens || na) } as Record<string, unknown>)}, ${t("chat.outputTokens", { count: String(metadata.usage.outputTokens || na) } as Record<string, unknown>)}`}
      position="top"
      withArrow
    >
      <Text size="xs" c="dimmed" style={{ marginLeft: "auto", cursor: "help" }}>
        IN: {metadata.usage.inputTokens || na}, OUT: {metadata.usage.outputTokens || na}
      </Text>
    </Tooltip>
  ) : null;
};
