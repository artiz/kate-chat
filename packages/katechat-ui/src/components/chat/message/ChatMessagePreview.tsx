import React from "react";
import { ScrollArea } from "@mantine/core";

import "./ChatMessage.scss";

export const ChatMessagePreview: React.FC<{ html?: string[]; text?: string }> = ({ html, text }) => {
  return (
    <ScrollArea
      type="hover"
      offsetScrollbars
      className={["katechat-message-content", "katechat-message-preview"].join(" ")}
    >
      {text ? (
        <>
          {html ? (
            html.map((part, index) => <div key={index} dangerouslySetInnerHTML={{ __html: part }} />)
          ) : (
            <div>{text}</div>
          )}
        </>
      ) : (
        "..."
      )}
    </ScrollArea>
  );
};
