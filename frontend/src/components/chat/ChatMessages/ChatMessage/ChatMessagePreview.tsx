import React from "react";
import { ScrollArea } from "@mantine/core";

import classes from "../ChatMessage.module.scss";

export const ChatMessagePreview: React.FC<{ html?: string[]; text?: string }> = ({ html, text }) => {
  return (
    <ScrollArea type="hover" offsetScrollbars className={[classes.message, classes.preview].join(" ")}>
      {text ? (
        <>
          {html ? (
            html.map((part, index) => (
              <div className={classes.htmlBlock} key={index} dangerouslySetInnerHTML={{ __html: part }} />
            ))
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
