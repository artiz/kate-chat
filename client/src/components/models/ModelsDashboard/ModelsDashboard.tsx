import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Title, Text, Group, Stack, Loader, Button, Modal, Alert, Table, Card } from "@mantine/core";
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
import { CustomModelProtocol, ModelType } from "@katechat/ui";
import { ProvidersInfo } from "../ProvidersInfo";
import { ModelsList } from "../ModelsList";
import { CustomModelDialog, CustomModelFormData } from "../CustomModelDialog";
import { ModelTestModal } from "./ModelTestModal";

export const ModelsDashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { models, providers, loading, error } = useAppSelector(state => state.models);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [customModelDialogOpen, setCustomModelDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | undefined>();
  const [currentTestingModel, setCurrentTestingModel] = useState<Model>();

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
          title: t("common.success"),
          message: t("models.modelsRefreshed"),
          color: "green",
        });
      } else if (data?.reloadModels?.error) {
        notifications.show({
          title: t("common.error"),
          message: data?.reloadModels?.error,
          color: "red",
        });
      }
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
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
        title: t("common.error"),
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
          title: t("common.success"),
          message: `${data.updateModelStatus.name} is now ${data.updateModelStatus.isActive ? t("common.active").toLowerCase() : t("common.inactive").toLowerCase()}`,
          color: "green",
        });
      }
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || "Failed to update model status",
        color: "red",
      });
    },
  });

  // Test model mutation
  const [testModel] = useMutation(TEST_MODEL_MUTATION);

  // Get costs query
  const [getCosts, { loading: costsLoading, data: costsData }] = useLazyQuery<{ getCosts: GqlCostsInfo }>(
    GET_COSTS_QUERY,
    {
      onCompleted: data => {
        // Query completed successfully
      },
      onError: error => {
        notifications.show({
          title: t("common.error"),
          message: error.message || "Failed to fetch cost information",
          color: "red",
        });
      },
    }
  );

  // Handle creating a new chat with the selected model
  const handleCreateChat = useCallback(
    (model: Model) => {
      createChat({
        variables: {
          input: {
            title: t("models.chatWith", { modelName: model.name }),
            modelId: model.modelId,
          },
        },
      });
    },
    [createChat, t]
  );

  // Handle reloading models
  const handleReloadModels = useCallback(() => {
    reloadModels();
  }, [reloadModels]);

  // Handle toggle model active status
  const handleToggleModelStatus = useCallback(
    (model: Model, isActive: boolean) => {
      updateModelStatus({
        variables: {
          input: {
            modelId: model.id,
            isActive,
          },
        },
      });
    },
    [updateModelStatus]
  );

  // Create custom model mutation
  const [createCustomModel, { loading: creatingCustomModel }] = useMutation(CREATE_CUSTOM_MODEL_MUTATION, {
    onCompleted: data => {
      if (data?.createCustomModel) {
        dispatch(addModel(data.createCustomModel));
        notifications.show({
          title: t("common.success"),
          message: t("models.customModelCreated"),
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
          title: t("common.success"),
          message: t("models.modelDeleted"),
          color: "green",
        });
      }
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
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
          title: t("common.success"),
          message: t("models.customModelUpdated"),
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
  const handleOpenCreateDialog = useCallback(() => {
    setEditingModel(undefined);
    setCustomModelDialogOpen(true);
  }, []);

  // Handle open edit dialog
  const handleOpenEditDialog = useCallback((model: Model) => {
    setEditingModel(model);
    setCustomModelDialogOpen(true);
  }, []);

  // Handle create/update custom model
  const handleSubmitCustomModel = useCallback(
    async (formData: CustomModelFormData) => {
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
    },
    [editingModel, updateCustomModel, createCustomModel]
  );

  // Handle delete model
  const handleDeleteModel = useCallback(
    async (modelId: string) => {
      const result = await deleteModel({
        variables: {
          input: { modelId },
        },
      });

      if (result.data?.deleteModel) {
        dispatch(removeModel(modelId));
      }
    },
    [deleteModel, dispatch]
  );

  // Handle opening test modal
  const handleOpenTestModal = useCallback((model: Model) => {
    setCurrentTestingModel(model);
    setTestModalOpen(true);
  }, []);

  // Handle closing test modal
  const handleCloseTestModal = useCallback(() => {
    setCurrentTestingModel(undefined);
    setTestModalOpen(false);
  }, []);

  // Handle test model
  const handleTestModel = useCallback(
    async (text: string) => {
      if (!currentTestingModel) return;

      try {
        await testModel({
          variables: {
            input: {
              id: currentTestingModel.id,
              text,
            },
          },
        });
      } catch (error) {
        // Error handled by mutation
      }
    },
    [currentTestingModel, testModel]
  );

  // Handle disabling model after test error
  const handleDisableModel = useCallback(() => {
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
  }, [currentTestingModel, updateModelStatus, handleCloseTestModal]);

  // Handle date change and refresh costs
  const handleRefreshCosts = useCallback(
    (apiProvider: string | undefined) => {
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
    },
    [costStartDate, costEndDate, getCosts]
  );

  // Handle opening cost modal
  const handleOpenCostModal = useCallback(
    (providerId: string) => {
      setCurrentProvider(providerId);
      setCostModalOpen(true);

      // Convert dates to Unix timestamps (seconds)
      handleRefreshCosts(providerId);
    },
    [handleRefreshCosts]
  );

  // Handle closing cost modal
  const handleCloseCostModal = useCallback(() => {
    setCurrentProvider(undefined);
    setCostModalOpen(false);
  }, []);

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
        <Text>{reloading ? t("models.reloadingModels") : t("models.loadingModels")}</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <>
        <Title order={2} c="red">
          {t("models.errorLoadingModels")}
        </Title>
        <Text mt="md">{error}</Text>
      </>
    );
  }

  return (
    <>
      <Group justify="space-between" mb="xl">
        <Title order={2}>{t("models.title")}</Title>
        <Group>
          {providers.some(p => p.id === "CUSTOM_REST_API") && (
            <Button leftSection={<IconPlus size={16} />} onClick={handleOpenCreateDialog} variant="filled">
              {t("models.customModel")}
            </Button>
          )}
          <Button leftSection={<IconRefresh size={16} />} onClick={handleReloadModels} variant="light">
            {t("models.reload")}
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
      <ModelTestModal
        opened={testModalOpen}
        model={currentTestingModel}
        onClose={handleCloseTestModal}
        onTest={handleTestModel}
        onDisableModel={handleDisableModel}
      />

      {/* Usage Costs Modal */}
      <Modal
        opened={costModalOpen}
        onClose={handleCloseCostModal}
        title={t("models.usageCosts", { provider: currentProvider })}
        size="lg"
      >
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
            {t("models.refreshData")}
          </Button>

          {costsLoading ? (
            <Stack align="center" py="xl">
              <Text c="dimmed">{t("models.loadingCosts")}</Text>
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
                    <Text fw={500}>{t("models.serviceCosts")}</Text>
                    <Text size="sm" c="dimmed">
                      {new Date(costsData.getCosts.start).toLocaleDateString()} -
                      {costsData.getCosts.end ? new Date(costsData.getCosts.end).toLocaleDateString() : "Present"}
                    </Text>
                  </Group>

                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t("models.service")}</Table.Th>
                        <Table.Th>{t("models.type")}</Table.Th>
                        <Table.Th style={{ textAlign: "right" }}>{t("models.amount")}</Table.Th>
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
                              {t("models.totalCurrency", { currency: cost[0] })}
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
                      {t("models.noCostInfo")}
                    </Text>
                  )}
                </Stack>
              </Card>
            </Stack>
          ) : (
            <Text ta="center" c="dimmed">
              {t("models.selectDateRange")}
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
                type: editingModel.type || ModelType.CHAT,
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
