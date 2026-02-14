import { ActionIcon, Tooltip } from "@mantine/core";
import { IconCopy, IconCopyCheck } from "@tabler/icons-react";
import React from "react";
import { useTranslation } from "react-i18next";

export const CopyMessageButton = ({
  messageId,
  messageIndex,
  linkedMessageIndex,
}: {
  messageId: string;
  messageIndex: number;
  linkedMessageIndex?: number;
}) => {
  const { t } = useTranslation();

  return (
    <>
      <Tooltip label={t("Copy message")} position="top" withArrow>
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
};
