import React, { useState } from "react";
import { Alert, Button, Code, Group, Stack, Text } from "@mantine/core";
import { IconCheck, IconShieldExclamation, IconX } from "@tabler/icons-react";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { MessageRole, PluginProps, ResponseStatus } from "@katechat/ui";
import { Message, ToolApproval } from "@/types/graphql";
import { ANSWER_TOOL_APPROVAL_MUTATION } from "@/store/services/graphql.queries";

const ARGS_LENGTH = 2000;

interface ToolApprovalsProps extends PluginProps<Message> {
  /** Show what waits without the buttons, e.g. in a chat the viewer cannot write to */
  readOnly?: boolean;
}

const formatArgs = (args?: string): string => {
  if (!args) return "";
  try {
    const text = JSON.stringify(JSON.parse(args), null, 2);
    return text === "{}" ? "" : text.slice(0, ARGS_LENGTH);
  } catch {
    return args.slice(0, ARGS_LENGTH);
  }
};

/**
 * Tool calls of MCP servers that ask first: while the answer runs, each waiting call shows what it
 * would do, with Approve and Deny; calls the user denied, or left unanswered, stay listed.
 */
export const ToolApprovals = ({ message, readOnly }: ToolApprovalsProps) => {
  const { t } = useTranslation();
  // the answer the user just gave, until the message itself says so
  const [answered, setAnswered] = useState<Record<string, boolean>>({});

  const [answerApproval] = useMutation(ANSWER_TOOL_APPROVAL_MUTATION);

  const approvals = message.metadata?.toolApprovals || [];
  if (message.role !== MessageRole.ASSISTANT || !approvals.length) return null;

  const running = message.streaming || message.status === ResponseStatus.TOOL_APPROVAL;
  const pending = running ? approvals.filter(approval => approval.status === "pending") : [];
  const refused = approvals.filter(
    approval =>
      approval.status === "denied" || approval.status === "expired" || (!running && approval.status === "pending")
  );
  if (!pending.length && !refused.length) return null;

  const answer = (approval: ToolApproval, approved: boolean) => {
    setAnswered(state => ({ ...state, [approval.callId]: approved }));
    answerApproval({ variables: { messageId: message.id, callId: approval.callId, approved } }).catch(error => {
      notifications.show({ title: t("common.error"), message: error.message, color: "red" });
      setAnswered(({ [approval.callId]: _, ...state }) => state);
    });
  };

  return (
    <Stack gap="xs" mt="sm">
      {pending.map(approval => {
        const args = formatArgs(approval.args);
        const given = answered[approval.callId];
        return (
          <Alert
            key={approval.callId}
            color="orange"
            variant="light"
            icon={<IconShieldExclamation size={18} />}
            title={t("toolApproval.title", { server: approval.serverName, tool: approval.toolName })}
          >
            <Stack gap="xs">
              <Text size="sm">{t("toolApproval.description")}</Text>
              {args && (
                <Code block fz="xs">
                  {args}
                </Code>
              )}
              {!readOnly && (
                <Group gap="xs">
                  <Button
                    size="xs"
                    color="green"
                    leftSection={<IconCheck size={14} />}
                    loading={given === true}
                    disabled={given !== undefined}
                    onClick={() => answer(approval, true)}
                  >
                    {t("toolApproval.approve")}
                  </Button>
                  <Button
                    size="xs"
                    color="red"
                    variant="light"
                    leftSection={<IconX size={14} />}
                    loading={given === false}
                    disabled={given !== undefined}
                    onClick={() => answer(approval, false)}
                  >
                    {t("toolApproval.deny")}
                  </Button>
                </Group>
              )}
            </Stack>
          </Alert>
        );
      })}

      {refused.map(approval => (
        <Text key={approval.callId} size="xs" c="dimmed">
          {t(approval.status === "denied" ? "toolApproval.denied" : "toolApproval.expired", {
            server: approval.serverName,
            tool: approval.toolName,
          })}
        </Text>
      ))}
    </Stack>
  );
};
