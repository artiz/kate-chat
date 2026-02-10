import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Title, Text, Card, Group, Stack, Loader, Button, Modal, TextInput, Alert, Table } from "@mantine/core";
import { DatePicker, DateStringValue } from "@mantine/dates";
import { IconRefresh, IconAlertCircle, IconPlus } from "@tabler/icons-react";
import { useAppSelector, useAppDispatch } from "@/store";
import { useMutation, useLazyQuery } from "@apollo/client";
import { setModelsAndProviders, updateModel, addModel, removeModel } from "@/store/slices/modelSlice";
import {
  CREATE_CHAT_MUTATION,
  RELOAD_MODELS_MUTATION,
  UPDATE_MODEL_STATUS_MUTATION,
  TEST_MODEL_MUTATION,
  GET_COSTS_QUERY,
  CREATE_CUSTOM_MODEL_MUTATION,
  DELETE_MODEL_MUTATION,
  UPDATE_CUSTOM_MODEL_MUTATION,
} from "@/store/services/graphql.queries";
import { notifications } from "@mantine/notifications";
import { addChat } from "@/store/slices/chatSlice";
import { GqlCostsInfo, Message, Model } from "@/types/graphql";
import { CustomModelProtocol } from "@katechat/ui";
import { ProvidersInfo } from "../ProvidersInfo";
import { ModelsList } from "../ModelsList";
import { CustomModelDialog, CustomModelFormData } from "../CustomModelDialog";

export const ModelsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { models, providers, loading, error } = useAppSelector(state => state.models);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [customModelDialogOpen, setCustomModelDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | undefined>();
  const [testText, setTestText] = useState("2+2=");
  const [testResult, setTestResult] = useState<Message>();
  const [testError, setTestError] = useState("");
  const [currentTestingModel, setCurrentTestingModel] = useState<Model>();
  const [testLoading, setTestLoading] = useState(false);

  const [costModalOpen, setCostModalOpen] = useState(false);
  const [costStartDate, setCostStartDate] = useState<Date>();
  const [costEndDate, setCostEndDate] = useState<Date>();
  const [currentProvider, setCurrentProvider] = useState<string>();

  // Usage cost modal state
  const todayTs = Math.floor(Date.now() / 3600_000 / 24) * 3600_000 * 24; // Convert to Unix timestamp in seconds
  const today = new Date(todayTs);

  useEffect(() => {
    // Reset cost dates to last 30 days
    if (!costStartDate) {
      setCostStartDate(new Date(todayTs - 60 * 24 * 60 * 60 * 1000)); // 60 days ago
      setCostEndDate(undefined);
    }
  }, [costStartDate, currentProvider]);

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
      dispatch(addChat(data.createChat));
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

  // Get costs query
  const [getCosts, { loading: costsLoading, data: costsData }] = useLazyQuery<{ getCosts: GqlCostsInfo }>(
    GET_COSTS_QUERY,
    {
      onCompleted: data => {
        // Query completed successfully
      },
      onError: error => {
        notifications.show({
          title: "Error",
          message: error.message || "Failed to fetch cost information",
          color: "red",
        });
      },
    }
  );

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

  // Create custom model mutation
  const [createCustomModel, { loading: creatingCustomModel }] = useMutation(CREATE_CUSTOM_MODEL_MUTATION, {
    onCompleted: data => {
      if (data?.createCustomModel) {
        dispatch(addModel(data.createCustomModel));
        notifications.show({
          title: "Success",
          message: "Custom model created successfully",
          color: "green",
        });
        setCustomModelDialogOpen(false);
      }
    },
    onError: error => {
      setCustomModelDialogOpen(true);
    },
  });

  // Delete model mutation
  const [deleteModel] = useMutation(DELETE_MODEL_MUTATION, {
    onCompleted: data => {
      if (data?.deleteModel) {
        notifications.show({
          title: "Success",
          message: "Model deleted successfully",
          color: "green",
        });
      }
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to delete model",
        color: "red",
      });
    },
  });

  // Update custom model mutation
  const [updateCustomModel, { loading: updatingCustomModel }] = useMutation(UPDATE_CUSTOM_MODEL_MUTATION, {
    onCompleted: data => {
      if (data?.updateCustomModel) {
        dispatch(updateModel(data.updateCustomModel));
        notifications.show({
          title: "Success",
          message: "Custom model updated successfully",
          color: "green",
        });
        setCustomModelDialogOpen(false);
        setEditingModel(undefined);
      }
    },
    onError: error => {
      setCustomModelDialogOpen(true);
    },
  });

  // Handle open create dialog
  const handleOpenCreateDialog = () => {
    setEditingModel(undefined);
    setCustomModelDialogOpen(true);
  };

  // Handle open edit dialog
  const handleOpenEditDialog = (model: Model) => {
    setEditingModel(model);
    setCustomModelDialogOpen(true);
  };

  // Handle create/update custom model
  const handleSubmitCustomModel = async (formData: CustomModelFormData) => {
    if (editingModel) {
      await updateCustomModel({
        variables: {
          input: {
            id: editingModel.id,
            ...formData,
          },
        },
      });
    } else {
      await createCustomModel({
        variables: {
          input: formData,
        },
      });
    }
  };

  // Handle delete model
  const handleDeleteModel = async (modelId: string) => {
    const result = await deleteModel({
      variables: {
        input: { modelId },
      },
    });

    if (result.data?.deleteModel) {
      dispatch(removeModel(modelId));
    }
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
    setCurrentTestingModel(undefined);
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
          id: currentTestingModel.id,
          text: testText,
        },
      },
    });
  };

  // Handle opening cost modal
  const handleOpenCostModal = (providerId: string) => {
    setCurrentProvider(providerId);
    setCostModalOpen(true);

    // Convert dates to Unix timestamps (seconds)
    handleRefreshCosts(providerId);
  };

  // Handle closing cost modal
  const handleCloseCostModal = () => {
    setCurrentProvider(undefined);
    setCostModalOpen(false);
  };

  // Handle date change and refresh costs
  const handleRefreshCosts = (apiProvider: string | undefined) => {
    // Convert dates to Unix timestamps (seconds)
    const startTime = costStartDate ? Math.floor(costStartDate.getTime() / 1000) : undefined;
    const endTime = costEndDate ? Math.floor(costEndDate.getTime() / 1000) : undefined;

    getCosts({
      variables: {
        input: {
          apiProvider,
          startTime,
          endTime,
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

  const totalCosts = useMemo(() => {
    if (!costsData?.getCosts || !costsData.getCosts.costs) return [];
    const map = costsData.getCosts.costs.reduce(
      (map, cost) => {
        cost.amounts?.forEach(amount => {
          map[amount.currency] = (map[amount.currency] || 0) + amount.amount;
        });
        return map;
      },
      {} as Record<string, number>
    );

    return Object.entries(map).map(([currency, amount]) => [currency, amount.toFixed(2)]);
  }, [costsData]);

  if (loading || reloading) {
    return (
      <Stack align="center" gap="md">
        <Loader size="xl" />
        <Text>{reloading ? "Reloading models..." : "Loading models..."}</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <>
        <Title order={2} c="red">
          Error Loading Models
        </Title>
        <Text mt="md">{error}</Text>
      </>
    );
  }

  return (
    <>
      <Group justify="space-between" mb="xl">
        <Title order={2}>AI Models</Title>
        <Group>
          {providers.some(p => p.id === "CUSTOM_REST_API") && (
            <Button leftSection={<IconPlus size={16} />} onClick={handleOpenCreateDialog} variant="filled">
              Custom Model
            </Button>
          )}
          <Button leftSection={<IconRefresh size={16} />} onClick={handleReloadModels} variant="light">
            Reload
          </Button>
        </Group>
      </Group>

      {/* Provider Information Cards */}
      <ProvidersInfo providers={providers} onOpenCostModal={handleOpenCostModal} />

      {/* Models List */}
      <ModelsList
        models={models}
        onCreateChat={handleCreateChat}
        onToggleModelStatus={handleToggleModelStatus}
        onOpenTestModal={handleOpenTestModal}
        onDeleteModel={handleDeleteModel}
        onEditModel={handleOpenEditDialog}
        creatingChat={creatingChat}
      />

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

      {/* Usage Costs Modal */}
      <Modal opened={costModalOpen} onClose={handleCloseCostModal} title={`Usage Costs - ${currentProvider}`} size="lg">
        <Stack gap="md">
          <Group grow align="flex-begin">
            <DatePicker
              value={costStartDate}
              date={costStartDate}
              highlightToday
              onChange={(d: string | null) => d && setCostStartDate(new Date(d))}
              onDateChange={(d: DateStringValue) => d && setCostStartDate(new Date(d))}
              maxDate={today}
            />
            <DatePicker
              value={costEndDate}
              highlightToday
              onChange={(d: string | null) => d && setCostEndDate(new Date(d))}
              maxDate={today}
            />
          </Group>

          <Button
            onClick={() => handleRefreshCosts(currentProvider)}
            loading={costsLoading}
            leftSection={<IconRefresh size={16} />}
          >
            Refresh Data
          </Button>

          {costsLoading ? (
            <Stack align="center" py="xl">
              <Text c="dimmed">Loading cost information...</Text>
            </Stack>
          ) : costsData?.getCosts ? (
            <Stack>
              {costsData.getCosts.error && (
                <Alert icon={<IconAlertCircle size={16} />} title="Warning" color="yellow">
                  {costsData.getCosts.error}
                </Alert>
              )}

              <Card withBorder padding="md">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text fw={500}>Service Costs</Text>
                    <Text size="sm" c="dimmed">
                      {new Date(costsData.getCosts.start).toLocaleDateString()} -
                      {costsData.getCosts.end ? new Date(costsData.getCosts.end).toLocaleDateString() : "Present"}
                    </Text>
                  </Group>

                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Service</Table.Th>
                        <Table.Th>Type</Table.Th>
                        <Table.Th style={{ textAlign: "right" }}>Amount</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {costsData.getCosts.costs.map((cost, index) => (
                        <Table.Tr key={index}>
                          <Table.Td>{cost.name}</Table.Td>
                          <Table.Td>{cost.type}</Table.Td>
                          <Table.Td style={{ textAlign: "right" }}>
                            {cost.amounts.map((amount, i) => (
                              <span key={i}>
                                {amount.amount.toFixed(2)}&nbsp;{amount.currency}
                              </span>
                            ))}
                          </Table.Td>
                        </Table.Tr>
                      ))}

                      {totalCosts.map(cost => (
                        <Table.Tr key={`total-${cost[0]}`}>
                          <Table.Td colSpan={2}>
                            <Text c="blue" fw={500}>
                              TOTAL {cost[0]}
                            </Text>
                          </Table.Td>
                          <Table.Td style={{ textAlign: "right" }}>
                            <Text c="blue" fw={500}>
                              {cost[1]}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>

                  {costsData.getCosts.costs.length === 0 && (
                    <Text ta="center" c="dimmed" py="md">
                      No cost information available for the selected period.
                    </Text>
                  )}
                </Stack>
              </Card>
            </Stack>
          ) : (
            <Text ta="center" c="dimmed">
              Select a date range and click Refresh to view cost information.
            </Text>
          )}
        </Stack>
      </Modal>

      {/* Custom Model Dialog */}
      <CustomModelDialog
        isOpen={customModelDialogOpen}
        onClose={() => setCustomModelDialogOpen(false)}
        onSubmit={handleSubmitCustomModel}
        isLoading={creatingCustomModel || updatingCustomModel}
        initialData={
          editingModel
            ? {
                name: editingModel.name,
                modelId: editingModel.modelId,
                description: editingModel.customSettings?.description || editingModel.description || "",
                endpoint: editingModel.customSettings?.endpoint || "",
                apiKey: editingModel.customSettings?.apiKey || "",
                modelName: editingModel.customSettings?.modelName || "",
                protocol: editingModel.customSettings?.protocol || CustomModelProtocol.OPENAI_CHAT_COMPLETIONS,
                streaming: editingModel.streaming !== undefined ? editingModel.streaming : true,
                imageInput: editingModel.imageInput !== undefined ? editingModel.imageInput : false,
                maxInputTokens: editingModel.maxInputTokens || undefined,
              }
            : undefined
        }
        mode={editingModel ? "edit" : "create"}
      />
    </>
  );
};
