import React, { useCallback, useEffect, useState } from "react";
import { ActionIcon, Badge, Indicator, Text, Tooltip } from "@mantine/core";
import { IconMessageCircle, IconMessageCircleFilled, IconMessageCircleX } from "@tabler/icons-react";
import { EditMessageResponse, Message } from "@/types/graphql";
import { MessageRole, PluginProps, assert } from "@katechat/ui";
import { useTranslation } from "react-i18next";
import { useMutation } from "@apollo/client";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { EDIT_MESSAGE_MUTATION } from "@/store/services/graphql.queries";

import classes from "./Plugins.module.scss";
import { useDispatch } from "react-redux";
import { setContextMessages } from "@/store/slices/chatSlice";
import { useAppSelector } from "@/store";
import { useChatPluginsContext } from "../ChatPluginsContext";

/** Toggle context messages highlighting */
export const ContextMessages = ({
  message,
  isLast,
  messagesCount,
  onAddMessage,
  onMessageDeleted,
  onAction,
  onActionEnd,
}: PluginProps<Message>) => {
  const { t } = useTranslation();
  const { id: messageId, role, chatId, metadata } = message;
  let contextMessages = (metadata?.contextMessages as string[]) || null;
  const { appConfig: { contextMessagesLimit = 50 } = {} } = useAppSelector(state => state.user);
  const dispatch = useDispatch();
  const ref = React.useRef<HTMLButtonElement>(null);
  const messageContext = useChatPluginsContext();

  const [editMessage] = useMutation<EditMessageResponse>(EDIT_MESSAGE_MUTATION, {
    onCompleted: res => {
      onActionEnd?.(messageId);

      if (res.editMessage.error) {
        return notifications.show({
          title: t("common.error"),
          message: res.editMessage.error,
          color: "red",
        });
      }

      assert.ok(res.editMessage.message, "Edit Message response should contain a message");
      const resMessage = res.editMessage.message;

      onMessageDeleted?.({ deleteAfter: resMessage, isEdit: true });
      onAddMessage?.(resMessage);
    },
    onError: error => {
      onActionEnd?.(messageId);

      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.failedToEditMessage"),
        color: "red",
      });
    },
  });

  const handleToggle = useCallback(() => {
    if (!ref.current) return;
    const active = ref.current.classList.contains("active");
    const otherBtns = document.querySelectorAll(`.${classes.contextMessagesBtn}.active`);
    Array.from(otherBtns).forEach(btn => btn.classList.remove("active"));
    if (active) {
      ref.current.classList.remove("active");
    } else {
      ref.current.classList.add("active");
    }

    const selectedMessages = document.querySelectorAll(".context-message");
    Array.from(selectedMessages).forEach(msg => msg.classList.remove("context-message"));

    dispatch(
      setContextMessages({ chatId, ids: contextMessages || undefined, before: contextMessages ? undefined : messageId })
    );

    if (!contextMessages) {
      const msgIds = Array.from(document.querySelectorAll(".katechat-message"))
        .map(el => (el as HTMLElement)?.dataset?.["messageId"])
        .filter(assert.notEmpty);
      contextMessages = msgIds.slice(
        0,
        msgIds.findLastIndex(id => id === messageId)
      );
    }

    // Toggle context-message class on all context messages
    contextMessages.forEach(contextMessageId => {
      const element = document.getElementById(`message-${contextMessageId}`);
      if (!element) return;
      if (!active) {
        element.classList.add("context-message");
      } else {
        element.classList.remove("context-message");
      }
    });
  }, [contextMessages]);

  const handleResetContext = useCallback(() => {
    modals.openConfirmModal({
      title: t("chat.resetContextLimit"),
      children: <Text size="sm">{t("chat.resetContextLimitMessage")}</Text>,
      labels: { confirm: t("common.confirm"), cancel: t("common.cancel") },
      confirmProps: { color: "blue" },
      onConfirm: () => {
        onAction?.(messageId);
        editMessage({
          variables: {
            messageId,
            content: "",
            messageContext: {
              ...messageContext,
              resetContextLimit: true,
            },
          },
        });
      },
    });
  }, [message, messageContext, editMessage, onAction, messageId]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      const selectedMessages = document.querySelectorAll(".context-message");
      Array.from(selectedMessages).forEach(msg => msg.classList.remove("context-message"));
    };
  }, [contextMessages]);

  if (
    !contextMessages ||
    contextMessages.length >= Math.min(messagesCount - 1, contextMessagesLimit) ||
    role !== MessageRole.ASSISTANT
  )
    return null;

  return (
    <>
      <Tooltip label={t("chat.contextMessages")} position="top" withArrow>
        <ActionIcon
          ref={ref}
          className={classes.contextMessagesBtn}
          data-message-id={messageId}
          size="sm"
          variant="transparent"
          color="gray"
          onClick={handleToggle}
        >
          <IconMessageCircleFilled size={20} className="icon-active" />
          <IconMessageCircle size={20} className="icon-inactive" />
        </ActionIcon>
      </Tooltip>
      {contextMessages && (
        <Badge variant="subtle" size="xs" color="gray" p="0">
          {contextMessages?.length}
        </Badge>
      )}

      {contextMessages && isLast && (
        <Tooltip label={t("chat.resetContextLimit")} position="top" withArrow>
          <ActionIcon size="sm" variant="transparent" color="gray" onClick={handleResetContext}>
            <IconMessageCircleX size={20} />
          </ActionIcon>
        </Tooltip>
      )}
    </>
  );
};
