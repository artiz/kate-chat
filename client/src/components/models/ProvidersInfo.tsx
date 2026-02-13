import React, { useMemo } from "react";
import { Text, Grid, Card, Button, Group, Stack, Badge, Divider, Table, Alert, Code } from "@mantine/core";
import { IconReportMoney } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { ProviderIcon } from "@katechat/ui";
import { ProviderInfo } from "@/types/graphql";

interface ProvidersInfoProps {
  providers: ProviderInfo[];
  onOpenCostModal: (providerId: string) => void;
}

export const ProvidersInfo: React.FC<ProvidersInfoProps> = ({ providers, onOpenCostModal }) => {
  const { t } = useTranslation();
  const noActiveProviders = useMemo(() => {
    return providers.length === 0 || !providers.some(provider => provider.isConnected);
  }, [providers]);

  return (
    <Stack gap="md" mb="xl">
      <Text fw={700} size="lg">
        {t("models.apiConnections")}
      </Text>
      {noActiveProviders && (
        <Alert color="yellow" title={t("models.noActiveProvidersTitle")}>
          <Text size="sm">
            {t("models.noActiveProvidersMessage")}
          </Text>
        </Alert>
      )}
      <Grid>
        {providers.map(provider => (
          <Grid.Col key={provider.name} span={{ base: 12, md: 6, lg: 4 }}>
            <Card withBorder padding="md" radius="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Group>
                    <ProviderIcon apiProvider={provider.id} />
                    <Text fw={500}>{provider.name}</Text>
                  </Group>
                  <Group>
                    {provider.costsInfoAvailable && (
                      <Button
                        variant="subtle"
                        leftSection={<IconReportMoney size={16} />}
                        onClick={() => onOpenCostModal(provider.id)}
                      >
                        {t("models.usage")}
                      </Button>
                    )}
                    <Badge color={provider.isConnected ? "green" : "red"}>
                      {provider.isConnected ? t("models.connected") : t("models.disconnected")}
                    </Badge>
                  </Group>
                </Group>

                {provider.details && provider.details.length > 0 ? <Divider /> : null}

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

                {provider.id === "AWS_BEDROCK" && !provider.isConnected && (
                  <Alert color="yellow" title={t("models.awsBedrockConfig")}>
                    {process.env.NODE_ENV === "development" && (
                      <>
                        <Text size="sm">
                          {t("models.awsBedrockRequiresEnv")}
                        </Text>

                        <Code block mt="xs">
                          <p>
                            AWS_BEDROCK_REGION=us-west-2
                            <br />
                            AWS_BEDROCK_PROFILE=your_profile
                          </p>
                          <p>{t("common.or")}</p>
                          <p>
                            AWS_BEDROCK_ACCESS_KEY_ID=your_access_key
                            <br />
                            AWS_BEDROCK_SECRET_ACCESS_KEY=your_secret_key
                          </p>
                        </Code>
                      </>
                    )}
                    {process.env.NODE_ENV !== "development" && (
                      <Text size="sm">
                        {t("models.awsBedrockRequiresSetup")}
                      </Text>
                    )}
                  </Alert>
                )}

                {provider.id === "OPEN_AI" && !provider.isConnected && (
                  <Alert color="yellow" title={t("models.openaiConfig")}>
                    {process.env.NODE_ENV === "development" && (
                      <>
                        <Text size="sm">{t("models.openaiRequiresEnv")}</Text>
                        <Code block mt="xs">
                          OPENAI_API_KEY=your_openai_key
                          <br />
                          OPENAI_API_ADMIN_KEY=your_openai_admin_key
                        </Code>
                      </>
                    )}
                    {process.env.NODE_ENV !== "development" && (
                      <Text size="sm">
                        {t("models.openaiRequiresSetup")}
                      </Text>
                    )}
                  </Alert>
                )}

                {provider.id === "YANDEX_FM" && !provider.isConnected && (
                  <Alert color="yellow" title={t("models.yandexConfig")}>
                    {process.env.NODE_ENV === "development" && (
                      <>
                        <Text size="sm">{t("models.yandexRequiresEnv")}</Text>
                        <Code block mt="xs">
                          YANDEX_FM_API_KEY=your_yandex_api_key
                          <br />
                          YANDEX_FM_API_FOLDER=your_yandex_folder_id
                        </Code>
                      </>
                    )}
                    {process.env.NODE_ENV !== "development" && (
                      <Text size="sm">
                        {t("models.yandexRequiresSetup")}
                      </Text>
                    )}
                  </Alert>
                )}
              </Stack>
            </Card>
          </Grid.Col>
        ))}
      </Grid>
    </Stack>
  );
};
