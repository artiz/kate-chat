import React, { useState, useMemo, useEffect } from "react";
import { Text, Grid, Card, Group, Badge, Stack, Button, Switch, Select, Paper, Tooltip } from "@mantine/core";
import {
  IconPhotoAi,
  IconTextScan2,
  IconArrowBigRightLinesFilled,
  IconMatrix,
  IconWorldSearch,
  IconCloudCode,
} from "@tabler/icons-react";
import { Model, ModelType, ToolType } from "@/store/slices/modelSlice";

interface IProps {
  model: Model;
  size?: string | number;
  showTools?: boolean;
}

export const ModelInfo: React.FC<IProps> = ({ model, size = 24, showTools = false }) => {
  const tools = new Set(model.tools || []);
  return (
    <Group gap="xs" wrap="nowrap" align="center">
      <Tooltip label="Text input">
        <IconTextScan2 size={size} />
      </Tooltip>

      {model.imageInput && (
        <Tooltip label="Images input">
          <IconPhotoAi size={size} />
        </Tooltip>
      )}

      <IconArrowBigRightLinesFilled size={size} color="teal" />

      {model.type === ModelType.CHAT && (
        <Tooltip label="Text generation">
          <IconTextScan2 size={size} />
        </Tooltip>
      )}
      {model.type === ModelType.EMBEDDING && (
        <Tooltip label="Embeddings generation">
          <IconMatrix size={size} />
        </Tooltip>
      )}
      {model.type === ModelType.IMAGE_GENERATION && (
        <Tooltip label="Images generation">
          <IconPhotoAi size={size} />
        </Tooltip>
      )}

      {showTools && tools.size > 0 && (
        <>
          |
          {tools.has(ToolType.WEB_SEARCH) && (
            <Tooltip label="Web search">
              <IconWorldSearch size={size} />
            </Tooltip>
          )}
          {tools.has(ToolType.CODE_INTERPRETER) && (
            <Tooltip label="Code interpreter">
              <IconCloudCode size={size} />
            </Tooltip>
          )}
        </>
      )}
    </Group>
  );
};
