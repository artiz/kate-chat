import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Text, Group, Avatar, Switch, Loader, Button, Collapse, Box, ActionIcon, Tooltip } from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconInfoSquare,
  IconInfoSquareFilled,
  IconRobot,
  IconUser,
} from "@tabler/icons-react";
import { MessageRole, Model, Message, CodePlugin, ResponseStatus } from "@/core";
import { ProviderIcon, LinkedChatMessage, MessageStatus } from "@/components";
import { debounce } from "lodash";
import { CopyMessageButton } from "./controls/CopyMessageButton";

import "./ChatMessage.scss";
import { useTranslation } from "react-i18next";
import { StreamingStatus } from "./StreamingStatus";

const ANIMATION_DURATION = 250; // Duration of the carousel animation in milliseconds

interface ChatMessageProps {
  message: Message;
  index: number;
  disabled?: boolean;
  pluginsLoader?: (message: Message) => React.ReactNode;
  messageDetailsLoader?: (message: Message) => React.ReactNode;
  models?: Model[];
  codePlugins?: Record<string, CodePlugin>;
}

export const ChatMessage = React.memo<ChatMessageProps>((props: ChatMessageProps) => {
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
  const { t, i18n } = useTranslation();

  const timestamp = new Date(updatedAt).toLocaleString();
  const isUserMessage = role === MessageRole.USER;
  const username = isUserMessage
    ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || t("You")
    : modelName || t("AI");

  const codeHeaderTemplate = `
        <span class="title">
            <span class="header-toggle">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                    class="icon icon-tabler icons-tabler-outline">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M9 6l6 6l-6 6" />
                </svg>
            </span>
            <span class="language"><LANG></span>
        </span>

        <div class="code-header-actions">
            <EXECUTE_BTN>

            <div type="button" class="action-btn mantine-focus-auto mantine-active code-download-btn" data-lang="<LANG>">
              <div class="download-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" 
                      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" 
                      class="icon icon-tabler icons-tabler-outline">
                      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" />
                      <path d="M12 4l0 12" />
                  </svg>
              </div>
              <span class="action-btn-label"><DOWNLOAD_TITLE></span>
            </div>

            <div type="button" class="action-btn mantine-focus-auto mantine-active code-copy-btn" data-lang="<LANG>">
                <div class="copy-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                        class="icon icon-tabler icons-tabler-outline">
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
                        class="icon icon-tabler icons-tabler-outline">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path stroke="none" d="M0 0h24v24H0z" />
                        <path
                            d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z" />
                        <path d="M4.012 16.737a2 2 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
                        <path d="M11 14l2 2l4 -4" />
                    </svg>
                </div>
                <span class="action-btn-label"><COPY_TITLE></span>
            </div>
      </div>
  `;

  const donwloadTitle = useMemo(() => t("Download"), [i18n.language]);
  const copyTitle = useMemo(() => t("Copy"), [i18n.language]);

  const processCodeElements = useCallback(
    debounce(() => {
      if (!componentRef.current) return;

      componentRef.current.querySelectorAll("pre").forEach(pre => {
        if (pre.querySelector(".code-data") && !pre?.parentElement?.classList?.contains("code-block")) {
          const header = pre.querySelector(".code-header") || document.createElement("div");
          const data = pre.querySelector(".code-data");
          const lang = data?.getAttribute("data-lang") || "plaintext";
          const block = document.createElement("div");

          block.className = "code-block";
          header.className = "code-header";

          const plugin = codePlugins?.[lang];
          const executeBtn = plugin
            ? `<div type="button" title="${plugin.label}" class="action-btn mantine-focus-auto mantine-active code-run-btn" data-lang="${lang}">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none" class="icon icon-tabler icons-tabler-filled icon-tabler-player-play">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" />
                </svg>
                <span class="action-btn-label">${plugin.label}</span>
              </div>`
            : "";

          header.innerHTML = codeHeaderTemplate
            .replaceAll("<LANG>", lang)
            .replace("<EXECUTE_BTN>", executeBtn)
            .replace("<DOWNLOAD_TITLE>", donwloadTitle)
            .replace("<COPY_TITLE>", copyTitle);

          block.appendChild(header);
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
    }, ANIMATION_DURATION + 10),
    [donwloadTitle, copyTitle, codePlugins]
  );

  useEffect(() => {
    if (streaming) return;

    if (componentRef.current) {
      const observer = new MutationObserver(processCodeElements);
      observer.observe(componentRef.current, { childList: true, subtree: true });
      processCodeElements(); // Initial call to inject code elements
      return () => observer.disconnect();
    }
  }, [role, streaming, processCodeElements]);

  const toggleDetails = () => setShowDetails(s => !s);

  const details = useMemo(() => {
    return messageDetailsLoader ? messageDetailsLoader(message) : null;
  }, [messageDetailsLoader, message]);

  const mainMessage = useMemo(() => {
    const plugins = pluginsLoader ? pluginsLoader(message) : null;
    const model = models?.find(m => m.modelId === message?.modelId);

    return (
      <>
        <Group align="center" pt="sm">
          <Avatar color="gray" radius="xl" size="md" src={isUserMessage ? message?.user?.avatarUrl : undefined}>
            {isUserMessage ? (
              <IconUser />
            ) : model ? (
              <ProviderIcon apiProvider={model.apiProvider} provider={model.provider} />
            ) : (
              <IconRobot />
            )}
          </Avatar>
          <Group gap="sm">
            <Text size="sm" fw={500} c={isUserMessage ? "blue" : "teal"}>
              {username}
            </Text>
            <Text size="sm" c="dimmed">
              {timestamp}
            </Text>
            {status && <MessageStatus status={status} />}
            {statusInfo && status !== ResponseStatus.REASONING && (
              <Text size="sm" c="dimmed">
                {statusInfo}
              </Text>
            )}
          </Group>
        </Group>
        <div className={["katechat-message-content", streaming ? "streaming" : ""].join(" ")}>
          <StreamingStatus status={status} content={content} statusInfo={statusInfo} streaming={streaming} />

          {html ? (
            html.map((part, index) => <div key={index} dangerouslySetInnerHTML={{ __html: part }} />)
          ) : (
            <div>{content}</div>
          )}

          <div className="katechat-message-footer">
            <CopyMessageButton messageId={id} messageIndex={index} />

            {details && (
              <Tooltip label={t("Details")} position="top" withArrow>
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
    i18n.language,
  ]);

  const [carouselIndex, setCarouselIndex] = React.useState(0);
  const [animationState, setAnimationState] = React.useState<
    "idle" | "exit-left" | "exit-right" | "enter-left" | "enter-right"
  >("idle");
  const [isAnimating, setIsAnimating] = React.useState(false);

  useEffect(() => {
    if (!linkedMessages || linkedMessages.length === 0) return;
    const streamingIdx = linkedMessages.findIndex(m => m.streaming);
    if (streamingIdx >= 0) {
      setCarouselIndex(streamingIdx);
    }
  }, [linkedMessages]);

  const linkedMessagesCmps = useMemo(() => {
    if (!linkedMessages || linkedMessages.length === 0) return [];

    return linkedMessages.map(lm => (
      <LinkedChatMessage
        key={lm.id}
        message={lm}
        parentIndex={index}
        index={carouselIndex}
        models={models}
        plugins={pluginsLoader?.(lm)}
      />
    ));
  }, [linkedMessages, models, index, i18n.language]);

  const linkedMessagesCarouselCmp = useMemo(() => {
    if (!linkedMessages || linkedMessages.length === 0) return null;

    const msgCount = linkedMessages.length;
    const handlePrev = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isAnimating) return;

      setIsAnimating(true);
      setAnimationState("exit-right");

      setTimeout(() => {
        setCarouselIndex(idx => (idx - 1 + msgCount) % msgCount);
        setAnimationState("enter-left");

        setTimeout(() => {
          setAnimationState("idle");
          setIsAnimating(false);
        }, ANIMATION_DURATION);
      }, ANIMATION_DURATION);
    };
    const handleNext = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isAnimating) return;

      setIsAnimating(true);
      setAnimationState("exit-left");

      setTimeout(() => {
        setCarouselIndex(idx => (idx + 1) % msgCount);
        setAnimationState("enter-right");

        setTimeout(() => {
          setAnimationState("idle");
          setIsAnimating(false);
        }, ANIMATION_DURATION);
      }, ANIMATION_DURATION);
    };

    const currentMsg = linkedMessagesCmps[carouselIndex];

    return (
      <div className="katechat-message-carousel">
        <div className="message-carousel-header">
          <div className="message-carousel-controls">
            {msgCount > 1 && (
              <>
                <ActionIcon onClick={handlePrev} aria-label="Previous" radius="xl" variant="light">
                  <IconChevronLeft />
                </ActionIcon>

                <ActionIcon onClick={handleNext} aria-label="Next" radius="xl" variant="light">
                  <IconChevronRight />
                </ActionIcon>
              </>
            )}
          </div>
        </div>
        <div className={`carousel-message-content animation-${animationState}`}>{currentMsg}</div>

        {/* Model icons below carousel */}
        {msgCount > 1 && (
          <Group className="carousel-model-icons">
            {linkedMessages.map((msg, idx) => {
              const model = models?.find(m => m.modelId === msg.modelId);
              const isSelected = idx === carouselIndex;
              return (
                <Tooltip key={msg.id} label={model?.name || t("AI")} position="top">
                  <Box key={msg.id} c={isSelected ? undefined : "dimmed"} onClick={() => setCarouselIndex(idx)}>
                    {model ? (
                      <ProviderIcon apiProvider={model.apiProvider} provider={model.provider} size={20} />
                    ) : (
                      <IconRobot size={20} />
                    )}
                  </Box>
                </Tooltip>
              );
            })}
          </Group>
        )}
      </div>
    );
  }, [linkedMessagesCmps, i18n.language, carouselIndex, animationState, isAnimating]);

  if (!linkedMessagesCarouselCmp) {
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
          label={showMainMessage ? t("Main") : t("Others")}
          size="sm"
        />
      </div>
      <div className={["katechat-message-main", showMainMessage ? "" : "hidden"].join(" ")}>{mainMessage}</div>
      <div className={["katechat-message-linked", showMainMessage ? "hidden" : ""].join(" ")}>
        {linkedMessagesCarouselCmp}
      </div>
    </div>
  );
});
ChatMessage.displayName = "ChatMessage";
