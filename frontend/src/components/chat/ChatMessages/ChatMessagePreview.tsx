import React, { useMemo } from "react";
import { Paper, Text, Stack, Group, Avatar, Loader, Box, ScrollArea } from "@mantine/core";
import { IconRobot, IconUser } from "@tabler/icons-react";
import { Message, MessageRole } from "@/store/slices/chatSlice";

import classes from "./ChatMessages.module.scss";

export const ChatMessagePreview: React.FC<{ html?: string[]; text?: string }> = ({ html, text }) => {
  return (
    <ScrollArea type="hover" offsetScrollbars className={[classes.message, classes.preview].join(" ")}>
      {text ? (
        <>
          {html ? (
            html.map((part, index) => <Text size="sm" key={index} dangerouslySetInnerHTML={{ __html: part }} />)
          ) : (
            <Text size="sm">{text}</Text>
          )}
        </>
      ) : (
        "..."
      )}
    </ScrollArea>
  );
};
