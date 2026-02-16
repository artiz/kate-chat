import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Stack, TextInput, Button, Card, Text, Alert, Group } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { Model, Message } from "@/types/graphql";
import { useMutation } from "@apollo/client";
import { TEST_MODEL_MUTATION } from "@/store/services/graphql.queries";

interface ModelTestModalProps {
  opened: boolean;
  model: Model | undefined;
  onClose: () => void;
  onTest: (text: string) => Promise<void>;
  onDisableModel?: () => void;
}

export const ModelTestModal: React.FC<ModelTestModalProps> = ({ opened, model, onClose, onTest, onDisableModel }) => {
  const { t } = useTranslation();
  const [testText, setTestText] = useState("2+2=");
  const [testResult, setTestResult] = useState<Message>();
  const [testError, setTestError] = useState("");
  const [testLoading, setTestLoading] = useState(false);

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

  const handleTest = async () => {
    setTestError("");
    setTestResult(undefined);
    setTestLoading(true);
    try {
      await testModel({
        variables: {
          input: {
            id: model?.id,
            text: testText,
          },
        },
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleClose = () => {
    setTestText("2+2=");
    setTestResult(undefined);
    setTestError("");
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t("models.testModel", { modelName: model?.name || "Model" })}
      size="lg"
    >
      <Stack gap="md">
        <TextInput
          label={t("models.testPrompt")}
          value={testText}
          onChange={e => setTestText(e.target.value)}
          placeholder={t("models.enterTestPrompt")}
        />

        <Button onClick={handleTest} loading={testLoading} disabled={!testText.trim()} fullWidth>
          {t("models.runTest")}
        </Button>

        {testResult && (
          <Stack>
            <Text fw={500}>{t("models.modelResponse")}</Text>
            <Card withBorder p="md" radius="md">
              <Text>{testResult?.content}</Text>
            </Card>
          </Stack>
        )}

        {testError && (
          <Alert icon={<IconAlertCircle size={16} />} title={t("common.error")} color="red">
            {testError}
            {onDisableModel && (
              <Group mt="md">
                <Button color="red" onClick={onDisableModel}>
                  {t("models.disableModel")}
                </Button>
              </Group>
            )}
          </Alert>
        )}
      </Stack>
    </Modal>
  );
};
