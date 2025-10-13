import React, { useMemo } from "react";
import { Text, Grid, Card, Button, Group, Stack, Badge, Divider, Table, Alert, Code } from "@mantine/core";
import { IconReportMoney } from "@tabler/icons-react";
import { ProviderInfo } from "@/store/slices/modelSlice";
import { Link } from "react-router-dom";
import { ProviderIcon } from "@katechat/ui/src/components/icons/ProviderIcon";

interface ProvidersInfoProps {
  providers: ProviderInfo[];
  onOpenCostModal: (providerId: string) => void;
}

export const ProvidersInfo: React.FC<ProvidersInfoProps> = ({ providers, onOpenCostModal }) => {
  const noActiveProviders = useMemo(() => {
    return providers.length === 0 || !providers.some(provider => provider.isConnected);
  }, [providers]);

  return (
    <Stack gap="md" mb="xl">
      <Text fw={700} size="lg">
        API Connections
      </Text>
      {noActiveProviders && (
        <Alert color="yellow" title="No Active Providers">
          <Text size="sm">
            No active AI providers connected. Please configure at least one provider on the{" "}
            <Link to="/settings">settings</Link> page.
          </Text>
        </Alert>
      )}
      <Grid>
        {providers.map(provider => (
          <Grid.Col key={provider.name} span={{ base: 12, md: 6 }}>
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
                        Usage
                      </Button>
                    )}
                    <Badge color={provider.isConnected ? "green" : "red"}>
                      {provider.isConnected ? "Connected" : "Disconnected"}
                    </Badge>
                  </Group>
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

                {provider.id === "aws_bedrock" && !provider.isConnected && (
                  <Alert color="yellow" title="AWS Bedrock Configuration">
                    {process.env.NODE_ENV === "development" && (
                      <>
                        <Text size="sm">
                          AWS Bedrock requires AWS credentials. Set the following environment variables:
                        </Text>

                        <Code block mt="xs">
                          <p>
                            AWS_BEDROCK_REGION=us-west-2
                            <br />
                            AWS_BEDROCK_PROFILE=your_profile
                          </p>
                          <p>or</p>
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
                        AWS Bedrock requires AWS credentials. Please setup connection credentials on{" "}
                        <Link to="/settings">settings</Link> page.
                      </Text>
                    )}
                  </Alert>
                )}

                {provider.id === "open_ai" && !provider.isConnected && (
                  <Alert color="yellow" title="OpenAI Configuration">
                    {process.env.NODE_ENV === "development" && (
                      <>
                        <Text size="sm">OpenAI requires an API key. Set the following environment variable:</Text>
                        <Code block mt="xs">
                          OPENAI_API_KEY=your_openai_key
                          <br />
                          OPENAI_API_ADMIN_KEY=your_openai_admin_key
                        </Code>
                      </>
                    )}
                    {process.env.NODE_ENV !== "development" && (
                      <Text size="sm">
                        OpenAI requires an API key. Please setup connection credentials on{" "}
                        <Link to="/settings">settings</Link> page.
                      </Text>
                    )}
                  </Alert>
                )}

                {provider.id === "yandex_fm" && !provider.isConnected && (
                  <Alert color="yellow" title="Yandex Configuration">
                    {process.env.NODE_ENV === "development" && (
                      <>
                        <Text size="sm">Yandex requires an API key. Set the following environment variable:</Text>
                        <Code block mt="xs">
                          YANDEX_FM_API_KEY=your_yandex_api_key
                          <br />
                          YANDEX_FM_API_FOLDER=your_yandex_folder_id
                        </Code>
                      </>
                    )}
                    {process.env.NODE_ENV !== "development" && (
                      <Text size="sm">
                        Yandex requires an API key. Please setup connection credentials on{" "}
                        <Link to="/settings">settings</Link> page.
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
