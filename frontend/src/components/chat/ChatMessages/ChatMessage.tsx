import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Paper, Text, Group, Avatar, ActionIcon, Tooltip, Menu } from "@mantine/core";
import { Carousel } from "@mantine/carousel";
import { IconCopy, IconCopyCheck, IconRobot, IconUser, IconTrash, IconRefresh, IconUsers } from "@tabler/icons-react";
import { Message, MessageRole } from "@/store/slices/chatSlice";

import classes from "./ChatMessage.module.scss";
import { debounce } from "lodash";
import { useAppSelector } from "@/store";
import { ProviderIcon } from "@/components/icons/ProviderIcon";

interface ChatMessageProps {
  message: Message;
  index: number;
  disabled?: boolean;
}

// TODO: split that into smaller components
export const ChatMessage = (props: ChatMessageProps) => {
  const { message, index, disabled = false } = props;
  const {
    role,
    id,
    modelName,
    modelId,
    content,
    html,
    createdAt,
    user,
    streaming = false,
    metadata,
    linkedMessages,
  } = message;
  const { models: allModels } = useAppSelector(state => state.models);
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

  const actions = useMemo(() => {
    return (
      <>
        <Tooltip label="Copy message" position="top" withArrow>
          <ActionIcon
            className="copy-message-btn"
            data-message-id={id}
            data-message-index={index}
            size="sm"
            color="gray"
            variant="transparent"
            disabled={disableActions}
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
            color="red.4"
            variant="transparent"
            disabled={disableActions}
          >
            <IconTrash />
          </ActionIcon>
        </Tooltip>

        {(role === MessageRole.ASSISTANT || role === MessageRole.ERROR) && (
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <ActionIcon size="sm" color="gray" variant="transparent" disabled={disableActions}>
                <Tooltip label={`Switch model: ${modelName}`} position="top" withArrow>
                  <IconRefresh />
                </Tooltip>
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown className={classes.switchModelDropdown}>
              {allModels
                .filter(m => m.modelId != modelId)
                .map(model => (
                  <Menu.Item
                    key={model.id}
                    data-message-id={id}
                    data-model-id={model.modelId}
                    className="switch-model-btn"
                    leftSection={<ProviderIcon apiProvider={model.apiProvider} provider={model.provider} />}
                  >
                    {model.name}
                  </Menu.Item>
                ))}

              {/* <Menu.Divider /> */}
            </Menu.Dropdown>
          </Menu>
        )}

        {/* Call Others button - only show on parent Assistant messages */}
        {role === MessageRole.ASSISTANT && !message.linkedToMessageId && (
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <ActionIcon size="sm" color="gray" variant="transparent" disabled={disableActions}>
                <Tooltip label="Call other model" position="top" withArrow>
                  <IconUsers />
                </Tooltip>
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown className={classes.switchModelDropdown}>
              {allModels
                .filter(m => m.modelId != modelId)
                .map(model => (
                  <Menu.Item
                    key={model.id}
                    data-message-id={id}
                    data-model-id={model.modelId}
                    className="call-other-btn"
                    leftSection={<ProviderIcon apiProvider={model.apiProvider} provider={model.provider} />}
                  >
                    {model.name}
                  </Menu.Item>
                ))}
            </Menu.Dropdown>
          </Menu>
        )}

        {/* Token usage display */}
        {metadata?.usage && (metadata.usage.inputTokens || metadata.usage.outputTokens) && (
          <Tooltip
            label={`Input tokens: ${metadata.usage.inputTokens || "N/A"}, Output tokens: ${metadata.usage.outputTokens || "N/A"}`}
            position="top"
            withArrow
          >
            <Text size="xs" c="dimmed" style={{ marginLeft: "auto", cursor: "help" }}>
              IN: {metadata.usage.inputTokens || "N/A"}, OUT: {metadata.usage.outputTokens || "N/A"}
            </Text>
          </Tooltip>
        )}
      </>
    );
  }, [id, index, role, modelName, modelId, disableActions, metadata]);

  const cmp = useMemo(() => {
    const isUserMessage = role === MessageRole.USER;
    const username = isUserMessage
      ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "You"
      : modelName || "AI";

    const timestamp = new Date(createdAt).toLocaleString();

    return (
      <div className={classes.messageContainer}>
        <div className={classes.main}>
          <Group align="center">
            <Avatar radius="xl" size="md">
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
          <div
            className={`${classes.message} ${classes[role] || ""} ${streaming ? classes.streaming : ""}`}
            ref={componentRef}
          >
            {html ? (
              html.map((part, index) => (
                <div className={classes.htmlBlock} key={index} dangerouslySetInnerHTML={{ __html: part }} />
              ))
            ) : (
              <div className={classes.htmlBlock}>{content}</div>
            )}
            <div className={classes.messageFooter}>{actions}</div>
          </div>
        </div>

        {linkedMessages && linkedMessages.length > 0 && (
          <div className={classes.linked}>
            <Carousel withIndicators emblaOptions={{ align: "center", loop: true }} slideGap="0">
              {linkedMessages.map((linkedMsg, linkedIndex) => (
                <Carousel.Slide key={linkedMsg.id}>
                  <Group align="center">
                    <Avatar radius="xl" size="md">
                      <IconRobot />
                    </Avatar>
                    <Group gap="xs">
                      <Text size="xs" fw={500} c="teal">
                        {linkedMsg.modelName}
                      </Text>
                      {linkedMsg.metadata?.usage && (
                        <Text size="xs" c="dimmed">
                          OUT: {linkedMsg.metadata.usage.outputTokens || "N/A"}
                        </Text>
                      )}
                    </Group>
                  </Group>

                  <div className={classes.message}>
                    {linkedMsg.html ? (
                      linkedMsg.html.map((part, index) => (
                        <div key={index} dangerouslySetInnerHTML={{ __html: part }} />
                      ))
                    ) : (
                      <div>{linkedMsg.content}</div>
                    )}

                    <div className={classes.messageFooter}>
                      <Tooltip label="Copy message" position="top" withArrow>
                        <ActionIcon
                          className="copy-message-btn"
                          data-message-id={linkedMsg.id}
                          data-message-index={index}
                          data-message-linked-index={linkedIndex}
                          size="sm"
                          color="gray"
                          variant="transparent"
                          disabled={disableActions}
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
                          data-message-id={linkedMsg.id}
                          data-message-is-linked="true"
                          size="sm"
                          color="red.4"
                          variant="transparent"
                          disabled={disableActions}
                        >
                          <IconTrash />
                        </ActionIcon>
                      </Tooltip>
                    </div>
                  </div>
                </Carousel.Slide>
              ))}
            </Carousel>
          </div>
        )}
      </div>
    );
  }, [role, id, user, modelName, content, html, createdAt, streaming, actions, linkedMessages]);

  return cmp;
};
ChatMessage.displayName = "ChatMessage";
