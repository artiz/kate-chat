import React from "react";
import { Text } from "@mantine/core";
import { IconFileUpload } from "@tabler/icons-react";

import classes from "./DropFilesOverlay.module.scss";
import { useTranslation } from "react-i18next";

interface IProps {
  visible: boolean;
  message?: string;
  onDragOver: (ev: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (ev: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (ev: React.DragEvent<HTMLDivElement>) => void;
}

export const DropFilesOverlay: React.FC<IProps> = ({ visible, message, onDragOver, onDragLeave, onDrop }) => {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <div className={classes.overlay} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <div className={classes.content}>
        <IconFileUpload size={48} color="var(--mantine-color-blue-4)" />
        <Text size="lg" fw={500} c="blue.4">
          {message || t("Drop files here to upload")}
        </Text>
      </div>
    </div>
  );
};
