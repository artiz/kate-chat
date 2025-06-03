import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Paper, Text, Group, Avatar, ActionIcon, Tooltip } from "@mantine/core";
import { IconCopy, IconCopyCheck, IconRobot, IconUser, IconTrash } from "@tabler/icons-react";
import { Message, MessageRole } from "@/store/slices/chatSlice";

import classes from "./ChatMessage.module.scss";
import { debounce } from "lodash";

interface ChatMessageProps {
  message: Message;
  index: number;
}

export const ChatMessage = (props: ChatMessageProps) => {
  const { message, index } = props;
  const { role, id, modelName, content, html, createdAt, user, streaming = false } = message;
  const componentRef = useRef<HTMLDivElement>(null);

  const codeHeaderTemplate = `
                <span class="title">
                    <span class="header-toggle">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                            class="icon icon-tabler icons-tabler-outline icon-tabler-chevron-right">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                            <path d="M9 6l6 6l-6 6" />
                        </svg>
                    </span>
                    <span class="language"><LANG></span>
                </span>

                <button tabindex="0" type="button" class="action-btn mantine-focus-auto mantine-active code-copy-btn">
                    <div class="copy-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                            class="icon icon-tabler icons-tabler-outline icon-tabler-copy">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                            <path
                                d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z" />
                            <path
                                d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
                        </svg>

                    </div>
                    <div class="check-icon" style="display: none;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                            class="icon icon-tabler icons-tabler-outline icon-tabler-copy-check">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                            <path stroke="none" d="M0 0h24v24H0z" />
                            <path
                                d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z" />
                            <path d="M4.012 16.737a2 2 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
                            <path d="M11 14l2 2l4 -4" />
                        </svg>

                    </div>
                    <span>Copy code</span>
                </button>
        `;

  const processCodeElements = useCallback(
    debounce(() => {
      if (!componentRef.current) return;
      componentRef.current.querySelectorAll("pre").forEach(pre => {
        if (pre.querySelector(".code-data") && !pre?.previousElementSibling?.classList?.contains("code-header")) {
          const data = pre.querySelector(".code-data");
          const header = document.createElement("div");
          header.className = "code-header";
          header.innerHTML = codeHeaderTemplate.replaceAll("<LANG>", data?.getAttribute("data-lang") || "plaintext");
          pre.parentNode?.insertBefore(header, pre);
        }
      });
    }, 250),
    []
  );

  useEffect(() => {
    if (streaming) return;

    if (componentRef.current && role !== MessageRole.USER) {
      const observer = new MutationObserver(processCodeElements);
      observer.observe(componentRef.current, { childList: true, subtree: true });
      processCodeElements(); // Initial call to inject code elements

      return () => observer.disconnect();
    }
  }, [role, streaming]);

  const cmp = useMemo(() => {
    const isUserMessage = role === MessageRole.USER;
    const username = isUserMessage
      ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "You"
      : modelName || "AI";

    const timestamp = new Date(createdAt).toLocaleString();

    return (
      <>
        <Group align="center">
          <Avatar radius="xl" size="md">
            {isUserMessage ? <IconUser /> : <IconRobot />}
          </Avatar>
          <Group gap="xs">
            <Text size="sm" fw={500} c={isUserMessage ? "blue" : "dark"}>
              {username}
            </Text>
            <Text size="xs" c="dimmed">
              {timestamp}
            </Text>
          </Group>
        </Group>
        <Paper className={`${classes.message} ${classes[role] || ""}`} ref={componentRef} p="sm">
          {html ? (
            html.map((part, index) => <Text key={index} dangerouslySetInnerHTML={{ __html: part }} />)
          ) : (
            <Text>{content}</Text>
          )}

          <div className={classes.messageFooter}>
            <Tooltip label="Copy message" position="top" withArrow>
              <ActionIcon
                className="copy-message-btn"
                data-message-id={id}
                data-message-index={index}
                size="sm"
                color="gray"
                variant="transparent"
              >
                <IconCopy />
              </ActionIcon>
            </Tooltip>
            <ActionIcon disabled size="sm" className="check-icon">
              <IconCopyCheck />
            </ActionIcon>
            <Tooltip label="Delete message" position="top" withArrow>
              <ActionIcon
                className="delete-message-btn"
                data-message-id={id}
                size="sm"
                color="red"
                variant="transparent"
              >
                <IconTrash />
              </ActionIcon>
            </Tooltip>
          </div>
        </Paper>
      </>
    );
  }, [role, id, user, modelName, content, html, createdAt]);

  return cmp;
};
ChatMessage.displayName = "ChatMessage";
