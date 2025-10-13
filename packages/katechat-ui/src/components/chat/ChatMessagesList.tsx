import React, { useCallback, useRef, useState } from "react";
import { Stack, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { notEmpty, ok } from "@/lib/assert";
import { ImageModal } from "@/components/modal/ImagePopup";
import { Message, Model, PluginProps } from "@/core";
import { ChatMessage } from "./message/ChatMessage";

interface ChatMessagesProps {
  messages: Message[];
  onMessageDeleted?: (args: { messagesToDelete?: Message[]; deleteAfter?: Message }) => void;
  onAddMessage?: (message: Message) => void;
  plugins?: React.FC<PluginProps<Message>>[];
  detailsPlugins?: ((message: Message) => React.ReactNode)[];
  models: Model[];
}

export const ChatMessagesList: React.FC<ChatMessagesProps> = ({
  messages,
  onMessageDeleted,
  onAddMessage,
  plugins = [],
  detailsPlugins = [],
  models = [],
}) => {
  const componentRef = useRef<HTMLDivElement>(null);

  const [imageToShow, setImageToShow] = useState<string | undefined>();
  const [imageFileName, setImageFileName] = useState<string | undefined>();
  const [updatedMessages, setUpdatedMessages] = useState<Set<string>>(new Set());

  const addEditedMessage = (messageId: string) => setUpdatedMessages(prev => new Set(prev).add(messageId));

  const clearEditedMessage = (messageId: string) => {
    setUpdatedMessages(prev => {
      const set = new Set(prev);
      set.delete(messageId);
      return set;
    });
  };

  const resetSelectedImage = () => {
    setImageToShow(undefined);
    setImageFileName(undefined);
  };

  // common messages interaction logic
  const handleMessageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!e.target) return;

      // common clicks logic to simplify code in ChatMessage component
      const classesToFind = ["code-copy-btn", "code-toggle-all", "copy-message-btn", "code-header", "message-image"];

      let el: HTMLElement = e.target as HTMLElement;
      for (const cls of classesToFind) {
        const trg = el.closest(`.${cls}`);
        if (trg) {
          el = trg as HTMLElement;
          break;
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
        const data = target.parentElement?.parentElement?.nextElementSibling?.querySelector(
          ".code-data"
        ) as HTMLElement;
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
          const linkedIndex = target.dataset["messageLinkedIndex"];

          let msg: Message | undefined = messages[Number(index)];
          if (linkedIndex != undefined) {
            msg = msg.linkedMessages?.[Number(linkedIndex)];
          }
          ok(msg, "Message should exist to copy");
          const content = (msg.content || "").trim();
          const html = msg.html || [];

          if (html.length && html[0]) {
            const blobHTML = new Blob([html.join("<br/>")], { type: "text/html" });
            const blobPlain = new Blob([content], { type: "text/plain" });
            navigator.clipboard
              .write([new ClipboardItem({ [blobHTML.type]: blobHTML, [blobPlain.type]: blobPlain })])
              .catch(err =>
                notifications.show({
                  title: "Error",
                  message: err.message || "Failed to copy message",
                  color: "red",
                })
              );
          } else {
            navigator.clipboard.writeText(content);
          }

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
        const fileName = target.dataset["fileName"];
        const imageUrl = (target as HTMLImageElement).src;

        setImageToShow(imageUrl);
        setImageFileName(fileName);
      }
    },
    [messages]
  );

  const pluginsLoader = useCallback(
    (msg: Message) => {
      return (
        <>
          {plugins.map((PluginComponent, idx) => (
            <PluginComponent
              key={idx}
              message={msg}
              onAddMessage={onAddMessage}
              onAction={addEditedMessage}
              onActionEnd={clearEditedMessage}
              onMessageDeleted={onMessageDeleted}
              disabled={updatedMessages.has(msg.id)}
            />
          ))}
        </>
      );
    },
    [plugins, onAddMessage, onMessageDeleted, updatedMessages, addEditedMessage, clearEditedMessage]
  );

  const messageDetailsLoader = useCallback(
    (msg: Message) => {
      const details = detailsPlugins.map((plugin, idx) => plugin(msg)).filter(notEmpty);
      return details.length ? details : null;
    },
    [plugins, detailsPlugins]
  );

  return (
    <>
      <Stack gap="xs" ref={componentRef} onClick={handleMessageClick}>
        {messages.map((msg, index) => (
          <Group key={msg.id} align="flex-start" gap="xs">
            <ChatMessage
              message={msg}
              index={index}
              disabled={updatedMessages.has(msg.id)}
              pluginsLoader={pluginsLoader}
              messageDetailsLoader={messageDetailsLoader}
              models={models}
            />
          </Group>
        ))}
      </Stack>

      <ImageModal fileName={imageFileName ?? ""} fileUrl={imageToShow ?? ""} onClose={resetSelectedImage} />
    </>
  );
};
