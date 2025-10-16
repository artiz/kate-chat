import { ActionIcon, Tooltip } from "@mantine/core";
import { IconCopy, IconCopyCheck } from "@tabler/icons-react";
import React from "react";

export const CopyMessageButton = ({
  messageId,
  messageIndex,
  linkedMessageIndex,
}: {
  messageId: string;
  messageIndex: number;
  linkedMessageIndex?: number;
}) => (
  <>
    <Tooltip label="Copy message" position="top" withArrow>
      <ActionIcon
        className="copy-message-btn"
        data-message-id={messageId}
        data-message-index={messageIndex}
        data-message-linked-index={linkedMessageIndex}
        size="sm"
        color="gray"
        variant="transparent"
      >
        <IconCopy />
      </ActionIcon>
    </Tooltip>
    <ActionIcon disabled size="sm" className="check-icon">
      <IconCopyCheck />
    </ActionIcon>
  </>
);
