import React from "react";
import { Alert, Button, Group, Text } from "@mantine/core";
import { IconPlayerPlay, IconScissors, IconShieldExclamation } from "@tabler/icons-react";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { MessageRole, PluginProps, assert } from "@katechat/ui";
import { CreateMessageResponse, Message } from "@/types/graphql";
import { CREATE_MESSAGE } from "@/store/services/graphql.queries";
import { useChatPluginsContext } from "../ChatPluginsContext";

interface TruncatedResponseProps extends PluginProps<Message> {
  /** Hide the "Continue" action, e.g. in a chat the viewer cannot write to */
  readOnly?: boolean;
}

/**
 * Notice under an assistant answer the model did not finish: cut off by the output token limit
 * (with a one-click "Continue" for the last message) or withheld by the provider's content filter.
 */
export const TruncatedResponse = ({ message, isLast, disabled, readOnly, onAddMessage }: TruncatedResponseProps) => {
  const { t } = useTranslation();
  const { mcpTokens } = useChatPluginsContext();
  const { role, chatId, streaming, metadata } = message;
  const stopReason = metadata?.stopReason;

  const [createMessage, { loading }] = useMutation<CreateMessageResponse>(CREATE_MESSAGE, {
    onCompleted: data => {
      if (data.createMessage) {
        onAddMessage?.(data.createMessage);
      }
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.failedToSend"),
        color: "red",
      });
    },
  });

  if (role !== MessageRole.ASSISTANT || streaming) return null;
  if (stopReason !== "max_tokens" && stopReason !== "content_filter") return null;

  const cutOff = stopReason === "max_tokens";
  const outputTokens = metadata?.usage?.outputTokens;
  const canContinue = cutOff && isLast && !readOnly;

  const handleContinue = () => {
    assert.ok(chatId, "Chat id is required to continue the answer");
    createMessage({
      variables: {
        input: {
          chatId,
          content: t("chat.continuePrompt"),
          mcpTokens,
        },
      },
    });
  };

  return (
    <Alert
      variant="light"
      color={cutOff ? "yellow" : "red"}
      icon={cutOff ? <IconScissors size={18} /> : <IconShieldExclamation size={18} />}
      py="xs"
      className="truncated-response-notice"
    >
      <Group justify="space-between" align="center" gap="sm">
        <div>
          <Text size="sm" fw={500}>
            {cutOff
              ? outputTokens
                ? t("chat.outputLimitReached", { tokens: outputTokens })
                : t("chat.outputLimitReachedNoCount")
              : t("chat.contentFiltered")}
          </Text>
          {cutOff && (
            <Text size="xs" c="dimmed">
              {t("chat.raiseMaxTokensHint")}
            </Text>
          )}
        </div>
        {canContinue && (
          <Button
            size="xs"
            variant="light"
            color="yellow"
            leftSection={<IconPlayerPlay size={14} />}
            loading={loading}
            disabled={disabled}
            onClick={handleContinue}
            className="truncated-response-continue"
          >
            {t("chat.continueResponse")}
          </Button>
        )}
      </Group>
    </Alert>
  );
};
