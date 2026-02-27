import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Title,
  Slider,
  Text,
  NumberInput,
  Stack,
  Group,
  Tooltip,
  ActionIcon,
  Box,
  Textarea,
  Button,
  Divider,
  Flex,
  Grid,
  Switch,
} from "@mantine/core";
import {
  IconInfoCircle,
  IconPhoto,
  IconPhotoScan,
  IconPhotoStar,
  IconRectangle,
  IconRectangleVertical,
  IconSquare,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  ChatSettings,
  ImageQuality,
  ImageOrientation,
  Model,
  ModelFeature,
  ChatTool,
  ToolType,
  ToolType,
} from "@/types/graphql";

import classes from "./ChatSettingsForm.module.scss";
import { useAppSelector } from "@/store";
import { ModelType } from "@katechat/ui";

export const DEFAULT_CHAT_SETTINGS = {
  temperature: 0.7,
  maxTokens: 2048,
  topP: 0.9,
  imagesCount: 1,
  imageQuality: "medium" as const,
  imageOrientation: "square" as const,
  systemPrompt: "You are a helpful, respectful and honest assistant.",
  thinkingBudget: 3000,
};

interface ChatSettingsComponentProps extends ChatSettings {
  model?: Model;
  chatTools?: ChatTool[];
  onSettingsChange: (settings: ChatSettings) => void;
}

export function ChatSettingsForm({
  temperature = DEFAULT_CHAT_SETTINGS.temperature,
  maxTokens = DEFAULT_CHAT_SETTINGS.maxTokens,
  topP = DEFAULT_CHAT_SETTINGS.topP,
  imagesCount = DEFAULT_CHAT_SETTINGS.imagesCount,
  imageQuality = DEFAULT_CHAT_SETTINGS.imageQuality,
  imageOrientation = DEFAULT_CHAT_SETTINGS.imageOrientation,
  systemPrompt = DEFAULT_CHAT_SETTINGS.systemPrompt,
  thinking = false,
  thinkingBudget = DEFAULT_CHAT_SETTINGS.thinkingBudget,
  model,
  chatTools = [],
  onSettingsChange,
}: ChatSettingsComponentProps) {
  const { t } = useTranslation();
  const { appConfig } = useAppSelector(state => state.user);

  const [tempValue, setTempValue] = useState<number>(temperature);
  const [tokensValue, setTokensValue] = useState<number>(maxTokens);
  const [topPValue, setTopPValue] = useState<number>(topP);
  const [imagesCountValue, setImagesCountValue] = useState<number>(imagesCount);
  const [imageQualityValue, setImageQualityValue] = useState<ImageQuality>(imageQuality);
  const [imageOrientationValue, setImageOrientationValue] = useState<ImageOrientation>(imageOrientation);
  const [systemPromptValue, setSystemPromptValue] = useState<string>(systemPrompt);
  const [thinkingValue, setThinkingValue] = useState<boolean>(thinking);
  const [thinkingBudgetValue, setThinkingBudgetValue] = useState<number>(thinkingBudget);

  // Update local state when props change (e.g. when chat is switched)
  useEffect(() => {
    setTempValue(temperature);
    setTokensValue(maxTokens || DEFAULT_CHAT_SETTINGS.maxTokens);
    setTopPValue(topP);
    setImagesCountValue(imagesCount);
    setImageQualityValue(imageQuality);
    setImageOrientationValue(imageOrientation);
    setSystemPromptValue(systemPrompt);
    setThinkingValue(thinking);
    setThinkingBudgetValue(thinkingBudget || DEFAULT_CHAT_SETTINGS.thinkingBudget);
  }, [
    temperature,
    maxTokens,
    topP,
    imagesCount,
    imageQuality,
    imageOrientation,
    systemPrompt,
    thinking,
    thinkingBudget,
  ]);

  const handleSettingsChange = useCallback(
    (settings: ChatSettings) => {
      onSettingsChange({
        temperature,
        maxTokens,
        topP,
        imagesCount,
        imageQuality,
        imageOrientation,
        systemPrompt,
        thinking,
        thinkingBudget,
        ...settings,
      });
    },
    [temperature, maxTokens, topP, imagesCount, imageQuality, imageOrientation, systemPrompt, thinking, thinkingBudget]
  );

  const handleTemperatureChange = (value: number) => {
    setTempValue(value);
    handleSettingsChange({ temperature: value });
  };

  const handleMaxTokensChange = (value: number | string) => {
    let numValue = typeof value === "string" ? parseInt(value, 10) : value;
    if (isNaN(numValue) || numValue < 1) {
      numValue = 1; // Ensure minimum value is 1
    }
    setTokensValue(numValue);
    handleSettingsChange({ maxTokens: numValue });
  };

  const handleImagesCountChange = (value: number | string) => {
    let numValue = typeof value === "string" ? parseInt(value, 10) : value;
    if (isNaN(numValue) || numValue < 1) {
      numValue = 1;
    } else if (numValue > 10) {
      numValue = 10;
    }
    setImagesCountValue(numValue);
    handleSettingsChange({ imagesCount: numValue });
  };

  const handleTopPChange = (value: number) => {
    setTopPValue(value);
    handleSettingsChange({ topP: value });
  };

  const handleSystemPromptChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSystemPromptValue(event.currentTarget.value);
  };

  function handlePromptSave(): void {
    handleSettingsChange({ systemPrompt: systemPromptValue });
  }

  const handleThinkingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.currentTarget.checked;
    setThinkingValue(checked);
    handleSettingsChange({ thinking: checked });
  };

  const handleThinkingBudgetChange = (value: number | string) => {
    let numValue = typeof value === "string" ? parseInt(value, 10) : value;
    setThinkingBudgetValue(numValue);
    handleSettingsChange({ thinkingBudget: numValue });
  };

  const handleImageQualityChange = useCallback(
    (value: ImageQuality) => {
      setImageQualityValue(value);
      handleSettingsChange({ imageQuality: value });
    },
    [handleSettingsChange]
  );

  const handleImageOrientationChange = useCallback(
    (value: ImageOrientation) => {
      setImageOrientationValue(value);
      handleSettingsChange({ imageOrientation: value });
    },
    [handleSettingsChange]
  );

  const isImageGeneration = useMemo(
    () =>
      model?.type === ModelType.IMAGE_GENERATION || chatTools?.some(tool => tool.type === ToolType.IMAGE_GENERATION),
    [model?.type, chatTools]
  );
  const isReasoning = useMemo(() => model?.features?.includes(ModelFeature.REASONING), [model?.features]);

  return (
    <Box className={classes.settingsPanel}>
      <Stack gap="md">
        <div>
          <Group mb="md" justify="space-between">
            <Text size="sm" fw={500}>
              {t("chat.systemPrompt")}{" "}
              <Tooltip label={t("chat.systemPromptTooltip")}>
                <ActionIcon size="xs" variant="subtle">
                  <IconInfoCircle size={14} />
                </ActionIcon>
              </Tooltip>
            </Text>
            {systemPrompt !== systemPromptValue ? (
              <Button size="xs" mt={5} onClick={handlePromptSave}>
                {t("common.save")}
              </Button>
            ) : null}
          </Group>
          <Textarea
            placeholder={t("chat.enterSystemPrompt")}
            value={systemPromptValue || ""}
            autosize
            rows={4}
            maxRows={10}
            onChange={handleSystemPromptChange}
            disabled={isImageGeneration}
          />
        </div>

        <Grid gutter="lg">
          <Box m="md" miw="140px">
            <Group p="apart" mb="md">
              <Text size="sm">{t("chat.temperature")}</Text>
              <Group gap={5}>
                <Text size="sm" c="dimmed">
                  {tempValue?.toFixed(2)}
                </Text>
                <Tooltip label={t("chat.temperatureTooltip")} maw="50vw" multiline>
                  <ActionIcon size="xs" variant="subtle">
                    <IconInfoCircle size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
            <Slider
              value={tempValue}
              onChange={handleTemperatureChange}
              min={0}
              max={1}
              step={0.01}
              label={null}
              disabled={thinkingValue || isImageGeneration}
              marks={[
                { value: 0, label: "0" },
                { value: 0.5, label: "0.5" },
                { value: 1, label: "1" },
              ]}
            />
          </Box>

          <Box m="md" miw="140px">
            <Group p="apart" mb="md">
              <Text size="sm">{t("chat.topP")}</Text>
              <Group gap={5}>
                <Text size="sm" c="dimmed">
                  {topPValue?.toFixed(2)}
                </Text>
                <Tooltip label={t("chat.topPTooltip")} maw="50vw" multiline>
                  <ActionIcon size="xs" variant="subtle">
                    <IconInfoCircle size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
            <Slider
              value={topPValue}
              onChange={handleTopPChange}
              min={0}
              max={1}
              step={0.01}
              label={null}
              marks={[
                { value: 0, label: "0" },
                { value: 0.5, label: "0.5" },
                { value: 1, label: "1" },
              ]}
              disabled={thinkingValue || isImageGeneration}
            />
          </Box>

          {isImageGeneration && (
            <Box m="md" miw="140px">
              <Group p="apart" mb="md">
                <Text size="sm">{t("chat.imagesCount")}</Text>
                <Group gap={5}>
                  <Text size="sm" c="dimmed">
                    {imagesCountValue}
                  </Text>
                  <Tooltip label={t("chat.imagesCountTooltip")} maw="50vw" multiline>
                    <ActionIcon size="xs" variant="subtle">
                      <IconInfoCircle size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
              <Slider
                value={imagesCountValue}
                onChange={handleImagesCountChange}
                min={1}
                max={10}
                step={1}
                label={null}
                marks={[
                  { value: 1, label: "1" },
                  { value: 5, label: "5" },
                  { value: 10, label: "10" },
                ]}
              />
            </Box>
          )}

          {isImageGeneration && (
            <Box m="md" miw="140px" aria-label={t("chat.imageQuality")}>
              <Group p="apart" mb="md">
                <Text size="sm">{t("chat.imageQuality")}</Text>
                <Group gap={5}>
                  <Tooltip label={t("chat.imageQualityTooltip")} maw="50vw" multiline>
                    <ActionIcon size="xs" variant="subtle">
                      <IconInfoCircle size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              <ActionIcon.Group>
                <Tooltip label={t("chatSettings.imageQuality.low")}>
                  <ActionIcon
                    variant={imageQualityValue === "low" ? "filled" : "default"}
                    size="lg"
                    onClick={() => handleImageQualityChange("low")}
                  >
                    <IconPhotoScan size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("chatSettings.imageQuality.medium")}>
                  <ActionIcon
                    variant={imageQualityValue === "medium" ? "filled" : "default"}
                    size="lg"
                    onClick={() => handleImageQualityChange("medium")}
                  >
                    <IconPhoto size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("chatSettings.imageQuality.high")}>
                  <ActionIcon
                    variant={imageQualityValue === "high" ? "filled" : "default"}
                    size="lg"
                    onClick={() => handleImageQualityChange("high")}
                  >
                    <IconPhotoStar size={14} />
                  </ActionIcon>
                </Tooltip>
              </ActionIcon.Group>
            </Box>
          )}

          {isImageGeneration && (
            <Box m="md" miw="140px" aria-label={t("chat.imageOrientation")}>
              <Group p="apart" mb="md">
                <Text size="sm">{t("chat.imageOrientation")}</Text>
                <Group gap={5}>
                  <Tooltip label={t("chat.imageOrientationTooltip")} maw="50vw" multiline>
                    <ActionIcon size="xs" variant="subtle">
                      <IconInfoCircle size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              <ActionIcon.Group>
                <Tooltip label={t("chatSettings.imageOrientation.landscape")}>
                  <ActionIcon
                    variant={imageOrientationValue === "landscape" ? "filled" : "default"}
                    size="lg"
                    onClick={() => handleImageOrientationChange("landscape")}
                  >
                    <IconRectangle size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("chatSettings.imageOrientation.portrait")}>
                  <ActionIcon
                    variant={imageOrientationValue === "portrait" ? "filled" : "default"}
                    size="lg"
                    onClick={() => handleImageOrientationChange("portrait")}
                  >
                    <IconRectangleVertical size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("chatSettings.imageOrientation.square")}>
                  <ActionIcon
                    variant={imageOrientationValue === "square" ? "filled" : "default"}
                    size="lg"
                    onClick={() => handleImageOrientationChange("square")}
                  >
                    <IconSquare size={14} />
                  </ActionIcon>
                </Tooltip>
              </ActionIcon.Group>
            </Box>
          )}

          {!isImageGeneration && (
            <Box m="md" miw="140px">
              <Group p="apart" mb="md">
                <Text size="sm">{t("chat.maxTokens")}</Text>
                <Tooltip label={t("chat.maxTokensTooltip")} multiline>
                  <ActionIcon size="xs" variant="subtle">
                    <IconInfoCircle size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <NumberInput
                value={tokensValue}
                onChange={handleMaxTokensChange}
                min={1}
                max={2_000_000}
                clampBehavior="blur"
                step={100}
                size="xs"
              />
            </Box>
          )}

          {isReasoning && (
            <>
              <Box m="md" miw="140px">
                <Group p="apart" mb="md">
                  <Text size="sm">{t("chat.thinking")}</Text>
                  <Tooltip label={t("chat.thinkingTooltip")} maw="50vw" multiline>
                    <ActionIcon size="xs" variant="subtle">
                      <IconInfoCircle size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                <Switch
                  label={t("chat.thinkingEnabled")}
                  checked={thinkingValue}
                  onChange={handleThinkingChange}
                  mb="xs"
                />
              </Box>
              <Box m="md" miw="140px">
                <Group p="apart" mb="md">
                  <Text size="sm">{t("chat.thinkingBudget")}</Text>
                </Group>

                <NumberInput
                  disabled={!thinkingValue}
                  value={thinkingBudgetValue}
                  onChange={handleThinkingBudgetChange}
                  min={appConfig?.reasoningMinTokenBudget || 1024}
                  max={appConfig?.reasoningMaxTokenBudget || 50_000}
                  clampBehavior="blur"
                  step={200}
                  size="xs"
                />
              </Box>
            </>
          )}
        </Grid>
      </Stack>
    </Box>
  );
}
