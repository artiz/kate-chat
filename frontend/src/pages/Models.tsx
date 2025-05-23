import React, { useState } from "react";
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
} from "@tabler/icons-react";
import { useAppSelector, useAppDispatch } from "../store";
import { useMutation } from "@apollo/client";
import { Model, setSelectedModel, setModels, updateModel } from "../store/slices/modelSlice";
import {
  CREATE_CHAT_MUTATION,
  RELOAD_MODELS_MUTATION,
  UPDATE_MODEL_STATUS_MUTATION,
  TEST_MODEL_MUTATION,
} from "../store/services/graphql";
import { notifications } from "@mantine/notifications";

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
  const { models, loading, error } = useAppSelector(state => state.models);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testText, setTestText] = useState("2+2=");
  const [testResult, setTestResult] = useState("");
  const [testError, setTestError] = useState("");
  const [currentTestingModel, setCurrentTestingModel] = useState<Model | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  // Reload models mutation
  const [reloadModels, { loading: reloading }] = useMutation(RELOAD_MODELS_MUTATION, {
    onCompleted: data => {
      if (data?.reloadModels?.models) {
        dispatch(setModels(data.reloadModels.models));
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
    dispatch(setSelectedModel(model));

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
    setTestResult("");
    setTestError("");
    setTestModalOpen(true);
  };

  // Handle closing test modal
  const handleCloseTestModal = () => {
    setCurrentTestingModel(null);
    setTestModalOpen(false);
    setTestResult("");
    setTestError("");
  };

  // Handle test model
  const handleTestModel = () => {
    if (!currentTestingModel) return;

    setTestLoading(true);
    setTestResult("");
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

      <Grid>
        {models.map(model => (
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
                      {model.apiType}
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

        {models.length === 0 && (
          <Grid.Col span={12}>
            <Text ta="center" c="dimmed">
              No AI models available. Please contact your administrator.
            </Text>
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
                <Text>{testResult}</Text>
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
