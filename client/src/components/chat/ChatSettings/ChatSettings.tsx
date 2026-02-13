import React, { useState, useEffect } from "react";
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
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import classes from "./ChatSettings.module.scss";

export const DEFAULT_CHAT_SETTINGS = {
  temperature: 0.7,
  maxTokens: 2048,
  topP: 0.9,
  imagesCount: 1,
  systemPrompt: "You are a helpful, respectful and honest assistant.",
};

export interface ChatSettingsProps {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  imagesCount?: number;
  systemPrompt?: string;
}

interface ChatSettingsComponentProps extends ChatSettingsProps {
  onSettingsChange: (settings: ChatSettingsProps) => void;
}

export function ChatSettings({
  temperature = DEFAULT_CHAT_SETTINGS.temperature,
  maxTokens = DEFAULT_CHAT_SETTINGS.maxTokens,
  topP = DEFAULT_CHAT_SETTINGS.topP,
  imagesCount = DEFAULT_CHAT_SETTINGS.imagesCount,
  systemPrompt = DEFAULT_CHAT_SETTINGS.systemPrompt,
  onSettingsChange,
}: ChatSettingsComponentProps) {
  const { t } = useTranslation();
  const [tempValue, setTempValue] = useState<number>(temperature);
  const [tokensValue, setTokensValue] = useState<number>(maxTokens);
  const [topPValue, setTopPValue] = useState<number>(topP);
  const [imagesCountValue, setImagesCountValue] = useState<number>(1);
  const [systemPromptValue, setSystemPromptValue] = useState<string>(systemPrompt);

  // Update local state when props change (e.g. when chat is switched)
  useEffect(() => {
    setTempValue(temperature);
    setTokensValue(maxTokens);
    setTopPValue(topP);
    setImagesCountValue(imagesCount);
    setSystemPromptValue(systemPrompt);
  }, [temperature, maxTokens, topP, imagesCount, systemPrompt]);

  const handleSettingsChange = (settings: ChatSettingsProps) => {
    onSettingsChange({
      temperature: tempValue,
      maxTokens: tokensValue,
      topP: topPValue,
      imagesCount: imagesCountValue,
      systemPrompt: systemPromptValue,
      ...settings,
    });
  };

  const handleTemperatureChange = (value: number) => {
    setTempValue(value);
    handleSettingsChange({ temperature: value });
  };

  const handleMaxTokensChange = (value: number | string) => {
    let numValue = typeof value === "string" ? parseInt(value, 10) : value;
    if (isNaN(numValue) || numValue < 1) {
      numValue = 1; // Ensure minimum value is 1
    }
    if (numValue > 1_000_000) {
      numValue = 1_000_000;
    }
    setTokensValue(numValue);
    handleSettingsChange({ maxTokens: numValue });
  };

  const handleImagesCountChange = (value: number | string) => {
    let numValue = typeof value === "string" ? parseInt(value, 10) : value;
    if (isNaN(numValue) || numValue < 1) {
      numValue = 1; // Ensure minimum value is 1
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
                <Tooltip label={t("chat.temperatureTooltip")}>
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
                <Tooltip label={t("chat.topPTooltip")}>
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
            />
          </Box>

          <Box m="md" miw="140px">
            <Group p="apart" mb="md">
              <Text size="sm">{t("chat.imagesCount")}</Text>
              <Group gap={5}>
                <Text size="sm" c="dimmed">
                  {imagesCountValue}
                </Text>
                <Tooltip label={t("chat.imagesCountTooltip")}>
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

          <Box m="md" miw="140px">
            <Group p="apart" mb="md">
              <Text size="sm">{t("chat.maxTokens")}</Text>
              <Tooltip label={t("chat.maxTokensTooltip")}>
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
              step={100}
              size="xs"
            />
          </Box>
        </Grid>
      </Stack>
    </Box>
  );
}
