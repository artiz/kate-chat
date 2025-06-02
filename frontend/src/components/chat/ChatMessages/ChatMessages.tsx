import React, { useCallback, useRef } from "react";
import { Paper, Text, Stack, Group, Avatar, Loader, Box } from "@mantine/core";
import { IconRobot } from "@tabler/icons-react";
import { Message } from "@/store/slices/chatSlice";

import { ok } from "@/utils/assert";
import { ChatMessage } from "./ChatMessage";

interface ChatMessagesProps {
  messages: Message[];
  sending: boolean;
  selectedModelName?: string;
}

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
