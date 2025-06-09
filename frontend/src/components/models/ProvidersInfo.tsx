import React, { useMemo } from "react";
import { Text, Grid, Card, Button, Group, Stack, Badge, Divider, Table, Alert, Code } from "@mantine/core";
import { IconBrandOpenai, IconBrandAws, IconServer, IconReportMoney } from "@tabler/icons-react";
import { ProviderInfo } from "@/store/slices/modelSlice";
import { ApiProvider } from "@reduxjs/toolkit/query/react";
import { Link } from "react-router-dom";

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
                    {provider.name === "OpenAI" ? (
                      <IconBrandOpenai size={24} />
                    ) : provider.name === "AWS Bedrock" ? (
                      <IconBrandAws size={24} />
                    ) : (
                      <IconServer size={24} />
                    )}
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

                {provider.id === "bedrock" && !provider.isConnected && (
                  <Alert color="yellow" title="AWS Bedrock Configuration">
                    <Text size="sm">
                      AWS Bedrock requires AWS credentials. Set the following environment variables:
                    </Text>
                    <Code block mt="xs">
                      AWS_REGION=us-west-2
                      <br />
                      and
                      <br />
                      AWS_PROFILE=your_profile
                      <br />
                      or
                      <br />
                      AWS_ACCESS_KEY_ID=your_access_key
                      <br />
                      AWS_SECRET_ACCESS_KEY=your_secret_key
                    </Code>
                  </Alert>
                )}

                {provider.id === "open_ai" && !provider.isConnected && (
                  <Alert color="yellow" title="OpenAI Configuration">
                    <Text size="sm">OpenAI requires an API key. Set the following environment variable:</Text>
                    <Code block mt="xs">
                      OPENAI_API_KEY=your_openai_key
                      <br />
                      OPENAI_API_ADMIN_KEY=your_openai_admin_key
                    </Code>
                  </Alert>
                )}

                {provider.id === "yandex" && !provider.isConnected && (
                  <Alert color="yellow" title="Yandex Configuration">
                    <Text size="sm">Yandex requires an API key. Set the following environment variable:</Text>
                    <Code block mt="xs">
                      YANDEX_API_KEY=your_yandex_api_key
                      <br />
                      YANDEX_API_FOLDER_ID=your_yandex_folder_id
                    </Code>
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
