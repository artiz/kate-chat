import React, { useCallback, useRef, useState } from "react";
import { Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { notEmpty, ok } from "@/lib/assert";
import { useTranslation } from "react-i18next";
import { Message, Model, PluginProps, CodePlugin } from "@/core";
import { ChatMessage } from "./message/ChatMessage";
import { ImagePopup } from "../modal/ImagePopup";
import { getProgrammingLanguageExt } from "@/lib";

const tableToCSV = (table: HTMLTableElement): string => {
  const rows = [
    ...Array.from(table.tHead?.querySelectorAll("tr") ?? []),
    ...Array.from(table.tBodies[0]?.querySelectorAll("tr") ?? []),
  ];
  return rows
    .map(row =>
      Array.from(row.querySelectorAll("th, td"))
        .map(cell => `"${(cell.textContent || "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
};

interface ChatMessagesProps {
  messages: Message[];
  onMessageDeleted?: (args: { messagesToDelete?: Message[]; deleteAfter?: Message }) => void;
  onAddMessage?: (message: Message) => void;
  plugins?: React.FC<PluginProps<Message>>[];
  detailsPlugins?: ((message: Message) => React.ReactNode)[];
  codePlugins?: Record<string, CodePlugin>;
  models: Model[];
}

export const ChatMessagesList = React.memo<ChatMessagesProps>(
  ({ messages, onMessageDeleted, onAddMessage, plugins = [], detailsPlugins = [], codePlugins, models = [] }) => {
    const { t } = useTranslation();
    const componentRef = useRef<HTMLDivElement>(null);

    const [imageToShow, setImageToShow] = useState<string | undefined>();
    const [imageFileName, setImageFileName] = useState<string | undefined>();
    const [updatedMessages, setUpdatedMessages] = useState<Set<string>>(new Set());

    const addEditedMessage = useCallback(
      (messageId: string) => setUpdatedMessages(prev => new Set(prev).add(messageId)),
      []
    );

    const clearEditedMessage = useCallback((messageId: string) => {
      setUpdatedMessages(prev => {
        const set = new Set(prev);
        set.delete(messageId);
        return set;
      });
    }, []);

    const resetSelectedImage = () => {
      setImageToShow(undefined);
      setImageFileName(undefined);
    };

    // common messages interaction logic
    const handleMessageClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!e.target) return;

        // common clicks logic to simplify code in ChatMessage component
        const classesToFind = [
          "code-run-btn",
          "code-copy-btn",
          "code-download-btn",
          "code-toggle-all",
          "copy-message-btn",
          "code-header",
          "message-image",
          "table-sort-btn",
          "table-copy-csv-btn",
          "table-download-csv-btn",
        ];

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
          const codeBlock = header?.parentElement as HTMLElement;
          if (codeBlock.classList.contains("collapsed")) {
            header.classList.remove("collapsed");
            codeBlock && codeBlock.classList.remove("collapsed");
          } else {
            header.classList.add("collapsed");
            codeBlock && codeBlock.classList.add("collapsed");
          }
        };

        // execute code block
        if (target.classList.contains("code-run-btn") || target.classList.contains("code-download-btn")) {
          const lang = target.dataset["lang"];
          const run = target.classList.contains("code-run-btn");

          const codeBlock = target.closest(".code-header")?.parentElement;
          const codeDataEl = codeBlock?.querySelector(".code-data") as HTMLElement;

          if (codeDataEl) {
            const code = decodeURIComponent(codeDataEl.dataset.code || "").trim();

            if (!code) {
              return notifications.show({
                title: t("Error"),
                message: t("Code block is empty"),
                color: "red",
              });
            }

            if (run) {
              if (!lang) {
                return notifications.show({
                  title: t("Error"),
                  message: t("Language is not specified for this code block"),
                  color: "red",
                });
              }

              const messageEl = target.closest('[id^="message-"]') as HTMLElement | null;
              const parentMessageId = messageEl?.id.replace("message-", "");
              const parentMsg = parentMessageId ? messages.find(m => m.id === parentMessageId) : undefined;

              // Check if inside a linked message (carousel)
              const linkedEl = target.closest("[data-linked-message-id]") as HTMLElement | null;
              const linkedMessageId = linkedEl?.dataset["linkedMessageId"];
              const msg = linkedMessageId ? parentMsg?.linkedMessages?.find(m => m.id === linkedMessageId) : parentMsg;

              // Count code blocks within the same message container
              const containerEl = linkedEl ?? messageEl;
              const allCodeBlocks = containerEl?.querySelectorAll(".code-block");
              const thisCodeBlock = target.closest(".code-block");
              const blockIndex =
                allCodeBlocks && thisCodeBlock ? Array.from(allCodeBlocks).indexOf(thisCodeBlock as Element) : 0;

              const context = msg ? { messageId: msg.id, blockIndex, messageContent: msg.content } : undefined;
              codePlugins?.[lang]?.execute(code, lang, context);
            } else {
              const fileName = `code.${getProgrammingLanguageExt(lang || "txt")}`;
              const blob = new Blob([code], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = fileName;
              a.click();
              URL.revokeObjectURL(url);
            }
          }
        }
        // copy code block
        else if (target.classList.contains("code-copy-btn")) {
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
            const messageId = target.dataset["messageId"];

            let msg: Message | undefined =
              index != undefined ? messages[Number(index)] : messages.find(m => m.id === messageId);
            if (linkedIndex != undefined) {
              msg = msg?.linkedMessages?.[Number(linkedIndex)];
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
                    title: t("Error"),
                    message: err.message || t("Failed to copy message"),
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
        // sort table by column
        else if (target.classList.contains("table-sort-btn")) {
          const colIndex = parseInt(target.dataset["colIndex"] || "0");
          const table = target.closest("table") as HTMLTableElement | null;
          if (!table) return;
          const tbody = table.querySelector("tbody");
          if (!tbody) return;

          const currentDir = target.dataset["sortDir"];
          const newDir = currentDir === "asc" ? "desc" : "asc";

          table.querySelectorAll("th.table-sort-btn").forEach(th => {
            delete (th as HTMLElement).dataset["sortDir"];
            th.classList.remove("sort-asc", "sort-desc");
          });

          target.dataset["sortDir"] = newDir;
          target.classList.add(newDir === "asc" ? "sort-asc" : "sort-desc");

          const rows = Array.from(tbody.querySelectorAll("tr"));
          rows.sort((a, b) => {
            const aText = a.querySelectorAll("td")[colIndex]?.textContent || "";
            const bText = b.querySelectorAll("td")[colIndex]?.textContent || "";
            const aNum = parseFloat(aText);
            const bNum = parseFloat(bText);
            if (!isNaN(aNum) && !isNaN(bNum)) return newDir === "asc" ? aNum - bNum : bNum - aNum;
            return newDir === "asc" ? aText.localeCompare(bText) : bText.localeCompare(aText);
          });
          rows.forEach(row => tbody.appendChild(row));
        }
        // copy table as CSV
        else if (target.classList.contains("table-copy-csv-btn")) {
          const table = target.closest(".message-table") as HTMLTableElement | null;
          if (!table) return;

          navigator.clipboard.writeText(tableToCSV(table));

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
        // download table as CSV
        else if (target.classList.contains("table-download-csv-btn")) {
          const table = target.closest(".message-table") as HTMLTableElement | null;
          if (!table) return;

          const blob = new Blob([tableToCSV(table)], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "table.csv";
          a.click();
          URL.revokeObjectURL(url);
        }
      },
      [messages, codePlugins]
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
        const details = detailsPlugins.map(plugin => plugin(msg)).filter(notEmpty);
        return details.length ? details : null;
      },
      [detailsPlugins]
    );

    return (
      <>
        <Stack gap="sm" ref={componentRef} onClick={handleMessageClick}>
          {messages.map((msg, index) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              index={index}
              disabled={updatedMessages.has(msg.id)}
              pluginsLoader={pluginsLoader}
              messageDetailsLoader={messageDetailsLoader}
              models={models}
              codePlugins={codePlugins}
            />
          ))}
        </Stack>

        <ImagePopup fileName={imageFileName ?? ""} fileUrl={imageToShow ?? ""} onClose={resetSelectedImage} />
      </>
    );
  }
);
