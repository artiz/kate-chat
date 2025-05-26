import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Title,
  Text,
  Grid,
  Card,
  Group,
  Badge,
  Stack,
  Loader,
  Button,
  Switch,
  Modal,
  TextInput,
  Textarea,
  Code,
  Alert,
  Tabs,
  Select,
  Table,
  Paper,
  Divider,
} from "@mantine/core";
import {
  IconBrandOpenai,
  IconRocket,
  IconBook2,
  IconBrandAws,
  IconMessage,
  IconMessagePlus,
  IconRefresh,
  IconTestPipe,
  IconAlertCircle,
  IconFilter,
  IconServer,
} from "@tabler/icons-react";
import { useAppSelector, useAppDispatch } from "../store";
import { useMutation } from "@apollo/client";
import {
  Model,
  ProviderInfo,
  setModels,
  setProviders,
  setModelsAndProviders,
  updateModel,
} from "../store/slices/modelSlice";
import {
  CREATE_CHAT_MUTATION,
  RELOAD_MODELS_MUTATION,
  UPDATE_MODEL_STATUS_MUTATION,
  TEST_MODEL_MUTATION,
} from "../store/services/graphql";
import { notifications } from "@mantine/notifications";
import { Message } from "@/store/slices/chatSlice";

// Helper function to get provider icon
const getProviderIcon = (provider: string | null) => {
  switch (provider?.toLowerCase()) {
    case "openai":
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

const Models: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { models, providers, loading, error } = useAppSelector(state => state.models);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testText, setTestText] = useState("2+2=");
  const [testResult, setTestResult] = useState<Message>();
  const [testError, setTestError] = useState("");
  const [currentTestingModel, setCurrentTestingModel] = useState<Model | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  // Filtering state
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [apiProviderFilter, setApiProviderFilter] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  // Get unique providers and API providers for filters
  const uniqueProviders = useMemo(() => {
    const providers = [...new Set(models.map(model => model.provider))].filter(Boolean);
    return providers.map(provider => ({ value: provider || "", label: provider || "Unknown" }));
  }, [models]);

  const uniqueApiProviders = useMemo(() => {
    const apiProviders = [...new Set(models.map(model => model.apiProvider))];
    return apiProviders.map(apiProvider => ({
      value: apiProvider,
      label: apiProvider === "bedrock" ? "AWS Bedrock" : "OpenAI",
    }));
  }, [models]);

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

  // Reload models mutation
  const [reloadModels, { loading: reloading }] = useMutation(RELOAD_MODELS_MUTATION, {
    onCompleted: data => {
      if (data?.reloadModels?.models) {
        dispatch(
          setModelsAndProviders({
            models: data.reloadModels.models,
            providers: data.reloadModels.providers || [],
          })
        );
        notifications.show({
          title: "Success",
          message: "Models refreshed successfully",
          color: "green",
        });
      } else if (data?.reloadModels?.error) {
        notifications.show({
          title: "Error",
          message: data?.reloadModels?.error,
          color: "red",
        });
      }
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to refresh models",
        color: "red",
      });
    },
  });

  // Create chat mutation
  const [createChat, { loading: creatingChat }] = useMutation(CREATE_CHAT_MUTATION, {
    onCompleted: data => {
      navigate(`/chat/${data.createChat.id}`);
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to create chat",
        color: "red",
      });
    },
  });

  // Update model status mutation
  const [updateModelStatus] = useMutation(UPDATE_MODEL_STATUS_MUTATION, {
    onCompleted: data => {
      if (data?.updateModelStatus) {
        dispatch(updateModel(data.updateModelStatus));
        notifications.show({
          title: "Success",
          message: `${data.updateModelStatus.name} is now ${data.updateModelStatus.isActive ? "active" : "inactive"}`,
          color: "green",
        });
      }
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to update model status",
        color: "red",
      });
    },
  });

  // Test model mutation
  const [testModel] = useMutation(TEST_MODEL_MUTATION, {
    onCompleted: data => {
      setTestResult(data.testModel);
      setTestLoading(false);
    },
    onError: error => {
      setTestError(error.message);
      setTestLoading(false);
    },
  });

  // Handle creating a new chat with the selected model
  const handleCreateChat = (model: Model) => {
    createChat({
      variables: {
        input: {
          title: `Chat with ${model.name}`,
          modelId: model.modelId,
        },
      },
    });
  };

  // Handle reloading models
  const handleReloadModels = () => {
    reloadModels();
  };

  // Handle toggle model active status
  const handleToggleModelStatus = (model: Model, isActive: boolean) => {
    updateModelStatus({
      variables: {
        input: {
          modelId: model.id,
          isActive,
        },
      },
    });
  };

  // Handle opening test modal
  const handleOpenTestModal = (model: Model) => {
    setCurrentTestingModel(model);
    setTestText("2+2=");
    setTestResult(undefined);
    setTestError("");
    setTestModalOpen(true);
  };

  // Handle closing test modal
  const handleCloseTestModal = () => {
    setCurrentTestingModel(null);
    setTestModalOpen(false);
    setTestResult(undefined);
    setTestError("");
  };

  // Handle test model
  const handleTestModel = () => {
    if (!currentTestingModel) return;

    setTestLoading(true);
    setTestResult(undefined);
    setTestError("");

    testModel({
      variables: {
        input: {
          modelId: currentTestingModel.id,
          text: testText,
        },
      },
    });
  };

  // Handle disabling model after test error
  const handleDisableModel = () => {
    if (!currentTestingModel) return;

    updateModelStatus({
      variables: {
        input: {
          modelId: currentTestingModel.id,
          isActive: false,
        },
      },
    });

    handleCloseTestModal();
  };

  if (loading || reloading) {
    return (
      <Container size="lg" py="xl">
        <Stack align="center" gap="md">
          <Loader size="xl" />
          <Text>{reloading ? "Reloading models..." : "Loading models..."}</Text>
        </Stack>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="lg" py="xl">
        <Title order={2} c="red">
          Error Loading Models
        </Title>
        <Text mt="md">{error}</Text>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="xl">
        <Title order={2}>Available AI Models</Title>
        <Button leftSection={<IconRefresh size={16} />} onClick={handleReloadModels} variant="light">
          Reload
        </Button>
      </Group>

      {/* Provider Information Cards */}
      <Stack gap="md" mb="xl">
        <Text fw={700} size="lg">
          API Connections
        </Text>
        <Grid>
          {providers.map(provider => (
            <Grid.Col key={provider.name} span={{ base: 12, md: 6 }}>
              <Card withBorder padding="md" radius="md">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Group>
                      {provider.name === "OpenAI" ? (
                        <IconBrandOpenai size={24} />
                      ) : provider.name === "AWS Bedrock" ? (
                        <IconBrandAws size={24} />
                      ) : (
                        <IconServer size={24} />
                      )}
                      <Text fw={500}>{provider.name}</Text>
                    </Group>
                    <Badge color={provider.isConnected ? "green" : "red"}>
                      {provider.isConnected ? "Connected" : "Disconnected"}
                    </Badge>
                  </Group>

                  <Divider />

                  <Table withRowBorders={false} withColumnBorders={false}>
                    <Table.Tbody>
                      {provider.details.map(detail => (
                        <Table.Tr key={detail.key}>
                          <Table.Td style={{ width: "40%" }}>
                            <Text fw={500} size="sm">
                              {detail.key}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">
                              {typeof detail.value === "boolean" ? (detail.value ? "Yes" : "No") : detail.value}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>

                  {provider.name === "AWS Bedrock" && !provider.isConnected && (
                    <Alert color="yellow" title="AWS Bedrock Configuration">
                      <Text size="sm">
                        AWS Bedrock requires AWS credentials. Set the following environment variables:
                      </Text>
                      <Code block mt="xs">
                        AWS_ACCESS_KEY_ID=your_access_key AWS_SECRET_ACCESS_KEY=your_secret_key AWS_REGION=us-west-2
                      </Code>
                    </Alert>
                  )}

                  {provider.name === "OpenAI" && !provider.isConnected && (
                    <Alert color="yellow" title="OpenAI Configuration">
                      <Text size="sm">OpenAI requires an API key. Set the following environment variable:</Text>
                      <Code block mt="xs">
                        OPENAI_API_KEY=your_openai_key OPENAI_API_ADMIN_KEY=your_openai_admin_key
                      </Code>
                    </Alert>
                  )}
                </Stack>
              </Card>
            </Grid.Col>
          ))}
        </Grid>
      </Stack>

      {/* Model Filtering Controls */}
      <Paper withBorder p="md" mb="xl" radius="md">
        <Stack>
          <Group justify="space-between">
            <Text fw={700} size="lg">
              Models
            </Text>
            <Group>
              <Select
                icon={<IconFilter size={16} />}
                placeholder="API Provider"
                clearable
                data={uniqueApiProviders}
                value={apiProviderFilter}
                onChange={setApiProviderFilter}
                size="sm"
              />
              <Select
                icon={<IconFilter size={16} />}
                placeholder="Provider"
                clearable
                data={uniqueProviders}
                value={providerFilter}
                onChange={setProviderFilter}
                size="sm"
              />
              <Select
                icon={<IconFilter size={16} />}
                placeholder="Status"
                clearable
                data={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                value={activeFilter}
                onChange={setActiveFilter}
                size="sm"
              />
            </Group>
          </Group>
        </Stack>
      </Paper>

      <Grid>
        {filteredModels.map(model => (
          <Grid.Col key={model.id} span={{ base: 12, sm: 6, lg: 4 }}>
            <Card withBorder padding="lg" radius="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Group>
                    {getProviderIcon(model.provider)}
                    <Text fw={500}>{model.name}</Text>
                  </Group>
                  <Group>
                    <Switch
                      checked={model.isActive}
                      onChange={event => handleToggleModelStatus(model, event.currentTarget.checked)}
                      label="Active"
                      size="md"
                    />
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

                  {model.isDefault && (
                    <Badge color="green" variant="light">
                      Default
                    </Badge>
                  )}
                </Group>

                <Group>
                  <Text size="sm">{model.modelId}</Text>
                </Group>

                <Group grow>
                  <Button
                    leftSection={<IconMessagePlus size={16} />}
                    onClick={() => handleCreateChat(model)}
                    loading={creatingChat}
                    disabled={!model.isActive}
                  >
                    Start Chat
                  </Button>
                  <Button
                    leftSection={<IconTestPipe size={16} />}
                    variant="light"
                    onClick={() => handleOpenTestModal(model)}
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

      {/* Test Request Modal */}
      <Modal
        opened={testModalOpen}
        onClose={handleCloseTestModal}
        title={`Test ${currentTestingModel?.name || "Model"}`}
        size="lg"
      >
        <Stack gap="md">
          <TextInput
            label="Test prompt"
            value={testText}
            onChange={e => setTestText(e.target.value)}
            placeholder="Enter text to test the model"
          />

          <Button onClick={handleTestModel} loading={testLoading} disabled={!testText.trim()} fullWidth>
            Run Test
          </Button>

          {testResult && (
            <Stack>
              <Text fw={500}>Model Response:</Text>
              <Card withBorder p="md" radius="md">
                <Text>{testResult?.content}</Text>
              </Card>
            </Stack>
          )}

          {testError && (
            <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
              {testError}
              <Group mt="md">
                <Button color="red" onClick={handleDisableModel}>
                  Disable Model
                </Button>
              </Group>
            </Alert>
          )}
        </Stack>
      </Modal>
    </Container>
  );
};

export default Models;
