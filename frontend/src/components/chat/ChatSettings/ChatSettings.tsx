import React, { useState, useEffect } from "react";
import { Paper, Title, Slider, Text, NumberInput, Stack, Group, Tooltip, ActionIcon } from "@mantine/core";
import { IconInfoCircle, IconRefresh } from "@tabler/icons-react";
import classes from "./ChatSettings.module.scss";

interface ChatSettingsProps {
  className?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  onSettingsChange: (settings: { temperature?: number; maxTokens?: number; topP?: number }) => void;
  resetToDefaults: () => void;
}

export function ChatSettings({
  temperature = 0.7,
  maxTokens = 2048,
  topP = 0.9,
  className = "",
  onSettingsChange,
  resetToDefaults,
}: ChatSettingsProps) {
  const [tempValue, setTempValue] = useState<number>(temperature);
  const [tokensValue, setTokensValue] = useState<number>(maxTokens);
  const [topPValue, setTopPValue] = useState<number>(topP);

  // Update local state when props change (e.g. when chat is switched)
  useEffect(() => {
    setTempValue(temperature);
    setTokensValue(maxTokens);
    setTopPValue(topP);
  }, [temperature, maxTokens, topP]);

  const handleTemperatureChange = (value: number) => {
    setTempValue(value);
    onSettingsChange({ temperature: value, maxTokens: tokensValue, topP: topPValue });
  };

  const handleMaxTokensChange = (value: number | string) => {
    const numValue = typeof value === "string" ? parseInt(value, 10) : value;
    setTokensValue(numValue);
    onSettingsChange({ temperature: tempValue, maxTokens: numValue, topP: topPValue });
  };

  const handleTopPChange = (value: number) => {
    setTopPValue(value);
    onSettingsChange({ temperature: tempValue, maxTokens: tokensValue, topP: value });
  };

  const handleReset = () => {
    resetToDefaults();
  };

  return (
    <Paper withBorder className={`${classes.settingsPanel} ${className}`}>
      <Group p="apart" mb="md">
        <Title order={4}>Chat Settings</Title>
        <Tooltip label="Reset to defaults">
          <ActionIcon onClick={handleReset}>
            <IconRefresh size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Stack gap="md">
        <div className={classes.settingItem}>
          <Group p="apart" mb={5}>
            <Text size="sm" fw={500}>
              Temperature
            </Text>
            <Group gap={5}>
              <Text size="sm" c="dimmed">
                {tempValue?.toFixed(2)}
              </Text>
              <Tooltip label="Controls randomness: lower values make responses more focused and deterministic, higher values make responses more creative and varied.">
                <ActionIcon size="xs" variant="subtle">
                  <IconInfoCircle size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
          <Slider
            value={tempValue || 0.7}
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
        </div>

        <div className={classes.settingItem}>
          <Group p="apart" mb={5}>
            <Text size="sm" fw={500}>
              Max Tokens
            </Text>
            <Tooltip label="Maximum number of tokens to generate. A token is about 4 characters or 0.75 words.">
              <ActionIcon size="xs" variant="subtle">
                <IconInfoCircle size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <NumberInput value={tokensValue} onChange={handleMaxTokensChange} min={1} max={32000} step={100} size="sm" />
        </div>

        <div className={classes.settingItem}>
          <Group p="apart" mb={5}>
            <Text size="sm" fw={500}>
              Top P
            </Text>
            <Group gap={5}>
              <Text size="sm" c="dimmed">
                {topPValue?.toFixed(2)}
              </Text>
              <Tooltip label="Controls diversity: lower values filter out unlikely options, higher values preserve more possibilities.">
                <ActionIcon size="xs" variant="subtle">
                  <IconInfoCircle size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
          <Slider
            value={topPValue || 0.9}
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
        </div>
      </Stack>
    </Paper>
  );
}
