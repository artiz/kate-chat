import React, { useState, useMemo, useEffect } from "react";
import { Text, Grid, Card, Group, Badge, Stack, Button, Switch, Select, Paper, Tooltip } from "@mantine/core";
import {
  IconBrandOpenai,
  IconRocket,
  IconBook2,
  IconBrandAws,
  IconMessagePlus,
  IconTestPipe,
} from "@tabler/icons-react";
import { Model } from "@/store/slices/modelSlice";
import { useAppSelector } from "@/store";
import { ProviderIcon } from "../icons/ProviderIcon";
import { ModelInfo } from "./ModelInfo";
import { formatTokensLimit } from "@/lib";

// Helper function to get provider icon
const getProviderIcon = (provider: string | null) => {
  switch (provider?.toLowerCase()) {
    case "open_ai":
      return <IconBrandOpenai size={24} />;
    case "anthropic":
      return <IconBook2 size={24} />;
    case "aws":
    case "amazon":
      return <IconBrandAws size={24} />;
    default:
      return <IconRocket size={24} />;
  }
};

interface ModelsListProps {
  models: Model[];
  onCreateChat: (model: Model) => void;
  onToggleModelStatus: (model: Model, isActive: boolean) => void;
  onOpenTestModal: (model: Model) => void;
  creatingChat: boolean;
}

export const ModelsList: React.FC<ModelsListProps> = ({
  models,
  onCreateChat,
  onToggleModelStatus,
  onOpenTestModal,
  creatingChat,
}) => {
  const user = useAppSelector(state => state.user.currentUser);
  const { providers } = useAppSelector(state => state.models);

  // Filtering state
  const [providerFilter, setProviderFilter] = useState<string>();
  const [apiProviderFilter, setApiProviderFilter] = useState<string>();
  const [activeFilter, setActiveFilter] = useState<string>();

  // Get unique providers and API providers for filters
  const uniqueProviders = useMemo(() => {
    const prvdrs = [...new Set(models.map(model => model.provider))].filter(Boolean);
    return prvdrs.map(provider => ({ value: provider || "", label: provider || "Unknown" }));
  }, [models]);

  const apiProviders = useMemo(() => {
    return (
      providers?.map(provider => ({
        value: provider.id,
        label: provider.name || "Unknown",
      })) || []
    );
  }, [providers]);

  // Filtered models based on selections
  const filteredModels = useMemo(() => {
    return models.filter(model => {
      // Filter by provider dropdown if selected
      if (providerFilter && model.provider?.toLowerCase() !== providerFilter.toLowerCase()) {
        return false;
      }

      // Filter by API provider if selected
      if (apiProviderFilter && model.apiProvider !== apiProviderFilter) {
        return false;
      }

      // Filter by active state if selected
      if (activeFilter === "active" && !model.isActive) {
        return false;
      }
      if (activeFilter === "inactive" && model.isActive) {
        return false;
      }

      return true;
    });
  }, [models, providerFilter, apiProviderFilter, activeFilter]);

  return (
    <>
      {/* Model Filtering Controls */}
      <Paper withBorder p="md" mb="xl" radius="md">
        <Stack>
          <Group justify="space-between">
            <Text fw={700} size="lg">
              Models
            </Text>
            <Group>
              <Select
                placeholder="API Provider"
                clearable
                data={apiProviders}
                value={apiProviderFilter || null}
                onChange={v => setApiProviderFilter(v || undefined)}
                size="sm"
              />
              <Select
                placeholder="Provider"
                clearable
                data={uniqueProviders}
                value={providerFilter || null}
                onChange={v => setProviderFilter(v || undefined)}
                size="sm"
              />
              <Select
                placeholder="Status"
                clearable
                data={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                value={activeFilter || null}
                onChange={v => setActiveFilter(v || undefined)}
                size="sm"
              />
            </Group>
          </Group>
        </Stack>
      </Paper>

      <Grid>
        {filteredModels.map(model => (
          <Grid.Col key={model.id} span={{ base: 12, sm: 6, lg: 4 }}>
            <Card withBorder padding="md" radius="md">
              <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                  <Group align="center" gap="xs" wrap="nowrap">
                    <ProviderIcon apiProvider={model.apiProvider} provider={model.provider} />
                    <Text fw={500} truncate c={model.modelId === user?.defaultModelId ? "green" : undefined}>
                      {model.name}
                    </Text>
                    {model.modelId === user?.defaultModelId && (
                      <Badge color="green" variant="light" size="xs">
                        Default
                      </Badge>
                    )}
                  </Group>
                  <Group>
                    {model?.maxInputTokens && (
                      <Tooltip label={`Maximum input tokens limit: ${model.maxInputTokens.toLocaleString()}`} withArrow>
                        <Text size="xs">&lt;&lt;{formatTokensLimit(model.maxInputTokens)}</Text>
                      </Tooltip>
                    )}
                  </Group>
                </Group>

                <Group justify="space-between">
                  <Group gap="sm">
                    <Text size="xs" c="dimmed">
                      {model.provider}
                    </Text>
                    <Text size="xs" c="brand.5">
                      {model.apiProvider}
                    </Text>
                  </Group>
                  <Group>
                    <Switch
                      checked={model.isActive}
                      onChange={event => onToggleModelStatus(model, event.currentTarget.checked)}
                      label="Active"
                      size="md"
                    />
                  </Group>
                </Group>

                <Group wrap="nowrap" gap="xs" align="center" justify="space-between">
                  <Text size="sm" truncate>
                    {model.modelId}
                  </Text>
                  <ModelInfo model={model} size="16" />
                </Group>

                <Group grow>
                  <Button
                    leftSection={<IconMessagePlus size={16} />}
                    onClick={() => onCreateChat(model)}
                    loading={creatingChat}
                    disabled={!model.isActive}
                  >
                    Start Chat
                  </Button>
                  <Button
                    leftSection={<IconTestPipe size={16} />}
                    variant="light"
                    onClick={() => onOpenTestModal(model)}
                    disabled={!model.isActive}
                  >
                    Test Request
                  </Button>
                </Group>
              </Stack>
            </Card>
          </Grid.Col>
        ))}

        {filteredModels.length === 0 && (
          <Grid.Col span={12}>
            {models.length === 0 ? (
              <Text ta="center" c="dimmed">
                No AI models available. Please contact your administrator.
              </Text>
            ) : (
              <Text ta="center" c="dimmed">
                No models match your filter criteria. Try adjusting your filters.
              </Text>
            )}
          </Grid.Col>
        )}
      </Grid>
    </>
  );
};
