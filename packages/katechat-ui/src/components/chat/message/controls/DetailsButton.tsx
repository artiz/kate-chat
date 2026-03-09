import { ActionIcon, Tooltip } from "@mantine/core";
import { IconCopy, IconCopyCheck, IconInfoSquare, IconInfoSquareFilled } from "@tabler/icons-react";
import React from "react";
import { useTranslation } from "react-i18next";

export const DetailsButton = ({
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
      <Tooltip label={t("Details")} position="top" withArrow>
        <ActionIcon
          className="message-details-btn"
          data-message-id={messageId}
          data-message-index={messageIndex}
          data-message-linked-index={linkedMessageIndex}
          size="sm"
          variant="transparent"
          color="gray"
        >
          <IconInfoSquare className="icon-collapsed" />
          <IconInfoSquareFilled className="icon-expanded" />
        </ActionIcon>
      </Tooltip>
    </>
  );
};
