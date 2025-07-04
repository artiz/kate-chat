import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Text, Group, Avatar, ActionIcon, Tooltip, Menu } from "@mantine/core";
import { Carousel } from "@mantine/carousel";
import { IconRobot, IconUser } from "@tabler/icons-react";
import { Message, MessageRole } from "@/store/slices/chatSlice";

import classes from "./ChatMessage.module.scss";
import { debounce } from "lodash";
import { LinkedChatMessage } from "./ChatMessage/LinkedChatMessage";
import { ChatMessageActions } from "./ChatMessage/ChatMessageActions";

interface ChatMessageProps {
  message: Message;
  index: number;
  disabled?: boolean;
}

export const ChatMessage = (props: ChatMessageProps) => {
  const { message, index, disabled = false } = props;
  const {
    role,
    id,
    modelName,
    modelId,
    metadata,
    linkedToMessageId,
    content,
    html,
    createdAt,
    user,
    streaming = false,
    linkedMessages,
  } = message;

  const componentRef = useRef<HTMLDivElement>(null);
  const disableActions = useMemo(() => disabled || streaming, [disabled, streaming]);

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

                <div class="code-header-actions">
                    <div type="button" class="action-btn mantine-focus-auto mantine-active code-copy-btn">
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
                        <span>Copy</span>
                    </div>
                </div>
        `;

  const processCodeElements = useCallback(
    debounce(() => {
      if (!componentRef.current) return;

      componentRef.current.querySelectorAll("pre").forEach(pre => {
        if (pre.querySelector(".code-data") && !pre?.parentElement?.classList?.contains("code-block")) {
          const data = pre.querySelector(".code-data");
          const block = document.createElement("div");
          const header = document.createElement("div");
          block.className = "code-block";
          header.className = "code-header";
          header.innerHTML = codeHeaderTemplate.replaceAll("<LANG>", data?.getAttribute("data-lang") || "plaintext");

          pre.parentNode?.insertBefore(header, pre);
          pre.parentNode?.insertBefore(block, pre);
          block.appendChild(pre);
        }
      });

      componentRef.current.querySelectorAll("img").forEach(img => {
        if (!img?.classList?.contains("message-image")) {
          img.classList.add("message-image");
          const fileName = img.src.split("/").pop() || "";
          img.setAttribute("data-file-name", fileName);
        }
      });
    }, 250),
    []
  );

  useEffect(() => {
    if (streaming) return;

    if (componentRef.current) {
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
      <div className={classes.messageContainer} ref={componentRef}>
        <div className={classes.main}>
          <Group align="center">
            <Avatar color="gray" radius="xl" size="md" src={isUserMessage ? message?.user?.avatarUrl : undefined}>
              {isUserMessage ? <IconUser /> : <IconRobot />}
            </Avatar>
            <Group gap="xs">
              <Text size="sm" fw={500} c={isUserMessage ? "blue" : "teal"}>
                {username}
              </Text>
              <Text size="xs" c="dimmed">
                {timestamp}
              </Text>
            </Group>
          </Group>
          <div className={`${classes.message} ${classes[role] || ""} ${streaming ? classes.streaming : ""}`}>
            {html ? (
              html.map((part, index) => (
                <div className={classes.htmlBlock} key={index} dangerouslySetInnerHTML={{ __html: part }} />
              ))
            ) : (
              <div className={classes.htmlBlock}>{content}</div>
            )}
            <div className={classes.messageFooter}>
              <ChatMessageActions
                id={id}
                role={role}
                modelName={modelName}
                modelId={modelId}
                metadata={metadata}
                linkedToMessageId={linkedToMessageId}
                index={index}
                disableActions={disableActions}
              />
            </div>
          </div>
        </div>

        {linkedMessages && linkedMessages.length > 0 && (
          <div className={classes.linked}>
            <Carousel
              withIndicators={linkedMessages.length > 1}
              emblaOptions={{ align: "center", loop: true }}
              slideGap="0"
              withControls={linkedMessages.length > 1}
              initialSlide={linkedMessages.findIndex(m => m.streaming)}
            >
              {linkedMessages.map((linkedMsg, linkedIndex) => (
                <LinkedChatMessage
                  key={linkedMsg.id}
                  message={linkedMsg}
                  parentIndex={index}
                  index={linkedIndex}
                  disableActions={disableActions}
                />
              ))}
            </Carousel>
          </div>
        )}
      </div>
    );
  }, [role, id, user, modelName, modelId, metadata, content, html, createdAt, streaming, linkedMessages]);

  return cmp;
};
ChatMessage.displayName = "ChatMessage";
