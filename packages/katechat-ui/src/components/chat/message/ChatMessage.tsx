import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Text, Group, Avatar, Switch, Loader, Button, Collapse, Box, ActionIcon, Tooltip } from "@mantine/core";
import { Carousel } from "@mantine/carousel";
import { IconInfoSquare, IconInfoSquareFilled, IconRobot, IconUser } from "@tabler/icons-react";
import { MessageRole, Model, Message, CodePlugin } from "@/core";
import { ProviderIcon, LinkedChatMessage, MessageStatus } from "@/components";
import { debounce } from "lodash";
import { CopyMessageButton } from "./controls/CopyMessageButton";

import "./ChatMessage.scss";
import carouselClasses from "./ChatMessage.Carousel.module.scss";

interface ChatMessageProps {
  message: Message;
  index: number;
  disabled?: boolean;
  pluginsLoader?: (message: Message) => React.ReactNode;
  messageDetailsLoader?: (message: Message) => React.ReactNode;
  models?: Model[];
  codePlugins?: Record<string, CodePlugin>;
}

export const ChatMessage = (props: ChatMessageProps) => {
  const { message, index, disabled = false, pluginsLoader, messageDetailsLoader, models, codePlugins } = props;

  const {
    role,
    id,
    modelName,
    modelId,
    content,
    html,
    updatedAt,
    user,
    streaming = false,
    linkedMessages,
    status,
    statusInfo,
  } = message;

  const componentRef = useRef<HTMLDivElement>(null);
  const disableActions = useMemo(() => disabled || streaming, [disabled, streaming]);
  const [showMainMessage, setShowMainMessage] = React.useState(true);
  const [showDetails, setShowDetails] = React.useState(false);

  const timestamp = new Date(updatedAt).toLocaleString();
  const isUserMessage = role === MessageRole.USER;
  const username = isUserMessage
    ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "You"
    : modelName || "AI";

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
            <EXECUTE_BTN>
            <div type="button" class="action-btn mantine-focus-auto mantine-active code-copy-btn">
                <div class="copy-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
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
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
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
          const lang = data?.getAttribute("data-lang") || "plaintext";
          const block = document.createElement("div");
          const header = document.createElement("div");
          block.className = "code-block";
          header.className = "code-header";

          const plugin = codePlugins?.[lang];
          const executeBtn = plugin
            ? `<div type="button" class="action-btn mantine-focus-auto mantine-active code-run-btn" data-lang="${lang}">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none" class="icon icon-tabler icons-tabler-filled icon-tabler-player-play">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" />
                </svg>
                <span>${plugin.label}</span>
              </div>`
            : "";

          header.innerHTML = codeHeaderTemplate.replaceAll("<LANG>", lang).replace("<EXECUTE_BTN>", executeBtn);

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

  const toggleDetails = () => setShowDetails(s => !s);

  const details = useMemo(() => {
    return messageDetailsLoader ? messageDetailsLoader(message) : null;
  }, [messageDetailsLoader, message]);

  const mainMessage = useMemo(() => {
    const plugins = pluginsLoader ? pluginsLoader(message) : null;
    const model = models?.find(m => m.modelId === message?.modelId);

    return (
      <>
        <Group align="center">
          <Avatar color="gray" radius="xl" size="md" src={isUserMessage ? message?.user?.avatarUrl : undefined}>
            {isUserMessage ? (
              <IconUser />
            ) : model ? (
              <ProviderIcon apiProvider={model.apiProvider} provider={model.provider} />
            ) : (
              <IconRobot />
            )}
          </Avatar>
          <Group gap="xs">
            <Text size="sm" fw={500} c={isUserMessage ? "blue" : "teal"}>
              {username}
            </Text>
            <Text size="xs" c="dimmed">
              {timestamp}
            </Text>
            {status && <MessageStatus status={status} />}
            {statusInfo && (
              <Text size="xs" c="dimmed">
                {statusInfo}
              </Text>
            )}
          </Group>
        </Group>
        <div className="katechat-message-content">
          {streaming && !content && <Loader size="md" mb="md" />}

          {html ? (
            html.map((part, index) => <div key={index} dangerouslySetInnerHTML={{ __html: part }} />)
          ) : (
            <div>{content}</div>
          )}

          <div className="katechat-message-footer">
            <CopyMessageButton messageId={id} messageIndex={index} />

            {details && (
              <Tooltip label="Details" position="top" withArrow>
                <ActionIcon
                  className="edit-message-btn"
                  data-message-id={id}
                  size="sm"
                  variant="subtle"
                  color="gray"
                  disabled={disabled}
                  onClick={toggleDetails}
                >
                  {showDetails ? <IconInfoSquareFilled /> : <IconInfoSquare />}
                </ActionIcon>
              </Tooltip>
            )}

            {plugins}
          </div>
          <Collapse in={showDetails}>
            <div className="katechat-message-content-details">{details}</div>
          </Collapse>
        </div>
      </>
    );
  }, [
    role,
    username,
    timestamp,
    content,
    html,
    id,
    modelName,
    modelId,
    models,
    index,
    disableActions,
    details,
    showDetails,
    streaming,
  ]);

  const linkedMessagesCmp = useMemo(() => {
    if (!linkedMessages || linkedMessages.length === 0) return null;

    return (
      <Carousel
        withIndicators={linkedMessages.length > 1}
        emblaOptions={{ align: "center", loop: true }}
        slideGap="0"
        withControls={linkedMessages.length > 1}
        initialSlide={linkedMessages.findIndex(m => m.streaming)}
        classNames={carouselClasses}
      >
        {linkedMessages.map((linkedMsg, linkedIndex) => (
          <LinkedChatMessage
            key={linkedMsg.id}
            message={linkedMsg}
            parentIndex={index}
            index={linkedIndex}
            models={models}
            plugins={pluginsLoader?.(linkedMsg)}
          />
        ))}
      </Carousel>
    );
  }, [linkedMessages, models, pluginsLoader, index]);

  if (!linkedMessagesCmp) {
    return (
      <div className={["katechat-message", `katechat-message__${role || ""}`].join(" ")} ref={componentRef}>
        <div className="katechat-message-main">{mainMessage}</div>
      </div>
    );
  }

  return (
    <div className={["katechat-message", `katechat-message__${role || ""}`].join(" ")} ref={componentRef}>
      <div className="katechat-message-linked-toggle">
        <Switch
          checked={showMainMessage}
          onChange={event => setShowMainMessage(event.currentTarget.checked)}
          label={showMainMessage ? "Main" : "Others"}
          size="sm"
        />
      </div>
      <div className={["katechat-message-main", showMainMessage ? "" : "hidden"].join(" ")}>{mainMessage}</div>
      <div className={["katechat-message-linked", showMainMessage ? "hidden" : ""].join(" ")}>{linkedMessagesCmp}</div>
    </div>
  );
};
ChatMessage.displayName = "ChatMessage";
