import React, { useState, useMemo, useEffect } from "react";
import { Text, Grid, Card, Group, Badge, Stack, Button, Switch, Select, Paper, Tooltip } from "@mantine/core";
import {
  IconSend,
  IconX,
  IconRobot,
  IconEdit,
  IconCheck,
  IconPhotoAi,
  IconTextScan2,
  IconSettings,
  IconCircleChevronDown,
  IconArrowBigRightLinesFilled,
  IconMatrix,
} from "@tabler/icons-react";
import { Model, ModelType } from "@/store/slices/modelSlice";

interface IProps {
  model: Model;
  size?: string | number;
}

export const ModelInfo: React.FC<IProps> = ({ model, size = 24 }) => {
  return (
    <Group>
      <Tooltip label="Text input">
        <IconTextScan2 size={size} color="gray" />
      </Tooltip>

      {model.imageInput && (
        <Tooltip label="Images input">
          <IconPhotoAi size={size} color="gray" />
        </Tooltip>
      )}

      <IconArrowBigRightLinesFilled size={size} color="gray" />

      {model.type === ModelType.CHAT && (
        <Tooltip label="Text generation">
          <IconTextScan2 size={size} color="teal" />
        </Tooltip>
      )}
      {model.type === ModelType.EMBEDDING && (
        <Tooltip label="Embeddings generation">
          <IconMatrix size={size} color="teal" />
        </Tooltip>
      )}
      {model.type === ModelType.IMAGE_GENERATION && (
        <Tooltip label="Images generation">
          <IconPhotoAi size={size} color="teal" />
        </Tooltip>
      )}
    </Group>
  );
};
