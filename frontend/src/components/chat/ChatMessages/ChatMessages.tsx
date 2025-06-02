import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Paper, Text, Stack, Group, Avatar, Loader, Box, ActionIcon, Tooltip } from "@mantine/core";
import { IconCopy, IconCopyCheck, IconRobot, IconUser } from "@tabler/icons-react";
import { Message, MessageRole } from "@/store/slices/chatSlice";

import classes from "./ChatMessages.module.scss";
import { ok } from "@/utils/assert";
import { debounce } from "lodash";

interface ChatMessagesProps {
  messages: Message[];
  sending: boolean;
  selectedModelName?: string;
}

interface ChatMessageProps {
  message: Message;
  index: number;
}

const ChatMessage = (props: ChatMessageProps) => {
  const { message, index } = props;
  const { role, id, modelName, content, html, createdAt, user } = message;
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
    if (componentRef.current && role !== MessageRole.USER) {
      const observer = new MutationObserver(processCodeElements);
      observer.observe(componentRef.current, { childList: true, subtree: true });
      processCodeElements(); // Initial call to inject code elements

      return () => observer.disconnect();
    }
  }, [role]);

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
          </div>
        </Paper>
      </>
    );
  }, [role, id, user, modelName, content, html, createdAt]);

  return cmp;
};

export const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, sending, selectedModelName }) => {
  const componentRef = useRef<HTMLDivElement>(null);

  // common messages interaction logic
  const handleMessageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!e.target) return;
      const classesToFind = ["code-copy-btn", "code-header", "code-toggle-all", "copy-message-btn", "message-image"];

      let el: HTMLElement = e.target as HTMLElement;
      let process = true;
      while (el && process) {
        for (const cls of classesToFind) {
          if (el.classList.contains(cls)) {
            process = false;
            break;
          }
        }
        if (process) {
          el = el.parentElement as HTMLElement;
        }
      }

      if (!el) {
        return;
      }

      const target = el as HTMLElement;
      const toggleCodeBlock = (header: HTMLElement) => {
        const codeBlock = header?.nextElementSibling as HTMLElement;
        if (codeBlock.classList.contains("collapsed")) {
          header.classList.remove("collapsed");
          codeBlock && codeBlock.classList.remove("collapsed");
        } else {
          header.classList.add("collapsed");
          codeBlock && codeBlock.classList.add("collapsed");
        }
      };

      // copy code block
      if (target.classList.contains("code-copy-btn")) {
        const data = target.parentElement?.nextElementSibling?.querySelector(".code-data") as HTMLElement;
        if (data) {
          const code = decodeURIComponent(data.dataset.code || "").trim();
          navigator.clipboard.writeText(code);
        }

        const copyIcon = target.querySelector(".copy-icon") as HTMLElement;
        const checkIcon = target.querySelector(".check-icon") as HTMLElement;
        if (copyIcon && checkIcon) {
          copyIcon.style.display = "none";
          checkIcon.style.display = "block";
          setTimeout(() => {
            copyIcon.style.display = "block";
            checkIcon.style.display = "none";
          }, 2000);
        }
      }
      // code toggle btn
      else if (target.classList.contains("code-header")) {
        toggleCodeBlock(target);
      }
      // all code blocks toggle
      else if (target.classList.contains("code-toggle-all")) {
        componentRef.current?.querySelectorAll(".code-header").forEach(header => {
          toggleCodeBlock(header as HTMLElement);
        });
      }
      // copy message
      else if (target.classList.contains("copy-message-btn")) {
        if (target.dataset["messageId"]) {
          const index = target.dataset["messageIndex"];
          const msg = messages[Number(index)];
          ok(msg, "Message should exist to copy");
          const content = (msg.content || "").trim();
          navigator.clipboard.writeText(content);

          const checkIcon = target.parentElement?.querySelector(".check-icon") as HTMLElement;
          if (checkIcon) {
            target.style.display = "none";
            checkIcon.style.display = "inline-block";
            setTimeout(() => {
              target.style.display = "inline-block";
              checkIcon.style.display = "none";
            }, 2000);
          }
        }
      }
      // code toggle btn
      else if (target.classList.contains("message-image")) {
        // TODO: Implement image popup logic
        // openImagePopup((target as HTMLImageElement).src);
        target.parentElement?.classList.toggle("closed");
      }
    },
    [messages]
  );

  return (
    <Stack gap="md" ref={componentRef} onClick={handleMessageClick}>
      {messages.map((msg, index) => (
        <Group key={msg.id} align="flex-start" gap="xs">
          <ChatMessage message={msg} index={index} />
        </Group>
      ))}

      {sending && (
        <Group align="flex-start" gap="xs">
          <Avatar color="gray" radius="xl">
            <IconRobot />
          </Avatar>
          <Box>
            <Text size="sm" fw={500}>
              {selectedModelName || "AI"}
            </Text>
            <Paper p="sm" bg="gray.0" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Text size="sm" c="dimmed">
                Generating response
              </Text>
              <Loader size="xs" />
            </Paper>
          </Box>
        </Group>
      )}
    </Stack>
  );
};
