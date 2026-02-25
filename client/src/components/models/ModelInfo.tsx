import React from "react";
import { Group, Tooltip } from "@mantine/core";
import {
  IconPhotoAi,
  IconTextScan2,
  IconArrowBigRightLinesFilled,
  IconMatrix,
  IconWorldSearch,
  IconCloudCode,
  IconPlugConnected,
  IconVideo,
  IconMicrophone,
  IconPhoto,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Model, ToolType } from "@/types/graphql";
import { ModelType } from "@katechat/ui";

interface IProps {
  model: Model;
  size?: string | number;
  showTools?: boolean;
}

export const ModelInfo: React.FC<IProps> = ({ model, size = 24, showTools = false }) => {
  const { t } = useTranslation();
  const tools = new Set(model.tools || []);
  return (
    <Group gap="xs" wrap="nowrap" align="center">
      <Tooltip label={t("models.textInput")}>
        <IconTextScan2 size={size} />
      </Tooltip>

      {model.imageInput && (
        <Tooltip label={t("models.imagesInput")}>
          <IconPhotoAi size={size} />
        </Tooltip>
      )}

      <IconArrowBigRightLinesFilled size={size} color="teal" />

      {model.type === ModelType.CHAT && (
        <Tooltip label={t("models.textGeneration")}>
          <IconTextScan2 size={size} />
        </Tooltip>
      )}
      {model.type === ModelType.EMBEDDING && (
        <Tooltip label={t("models.embeddingsGeneration")}>
          <IconMatrix size={size} />
        </Tooltip>
      )}
      {model.type === ModelType.IMAGE_GENERATION && (
        <Tooltip label={t("models.imagesGeneration")}>
          <IconPhotoAi size={size} />
        </Tooltip>
      )}
      {model.type === ModelType.VIDEO_GENERATION && (
        <Tooltip label={t("models.videoGeneration")}>
          <IconVideo size={size} />
        </Tooltip>
      )}
      {model.type === ModelType.REALTIME && (
        <Tooltip label={t("models.realtimeAudio")}>
          <IconMicrophone size={size} />
        </Tooltip>
      )}

      {showTools && tools.size > 0 && (
        <>
          |
          {tools.has(ToolType.WEB_SEARCH) && (
            <Tooltip label={t("chat.webSearch")}>
              <IconWorldSearch size={size} />
            </Tooltip>
          )}
          {tools.has(ToolType.CODE_INTERPRETER) && (
            <Tooltip label={t("chat.codeInterpreter")}>
              <IconCloudCode size={size} />
            </Tooltip>
          )}
          {tools.has(ToolType.MCP) && (
            <Tooltip label={t("chat.mcpTools")}>
              <IconPlugConnected size={size} />
            </Tooltip>
          )}
          {tools.has(ToolType.IMAGE_GENERATION) && (
            <Tooltip label={t("chat.imageGeneration")}>
              <IconPhoto size={size} />
            </Tooltip>
          )}
        </>
      )}
    </Group>
  );
};
