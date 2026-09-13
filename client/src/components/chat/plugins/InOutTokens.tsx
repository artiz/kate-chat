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

  if (metadata?.usage && (metadata.usage.inputTokens || metadata.usage.outputTokens)) {
    const { inputTokens, outputTokens } = metadata.usage;
    // the output count equals the limit when the answer was cut off: make that visible
    const cutOff = metadata.stopReason === "max_tokens";
    const label = t("chat.inputOutputTokens", {
      input: inputTokens?.toString() || na,
      output: outputTokens?.toString() || na,
    });

    return (
      <Tooltip label={cutOff ? `${label}. ${t("chat.outputLimitReachedNoCount")}` : label} position="top" withArrow>
        <Text size="xs" c="dimmed" style={{ marginLeft: "auto", cursor: "help" }}>
          {inputTokens || na} {inputTokens && outputTokens ? ">" : ""}{" "}
          {cutOff ? (
            <Text span inherit fw={600} c="yellow">
              {outputTokens || na}
            </Text>
          ) : (
            outputTokens || na
          )}
        </Text>
      </Tooltip>
    );
  }

  if (metadata?.tokensCount) {
    return (
      <Tooltip
        label={t("chat.tokensCount", {
          count: metadata?.tokensCount,
        })}
        position="top"
        withArrow
      >
        <Text size="xs" c="dimmed" style={{ marginLeft: "auto", cursor: "help" }}>
          {metadata.tokensCount}
        </Text>
      </Tooltip>
    );
  }

  return null;
};
