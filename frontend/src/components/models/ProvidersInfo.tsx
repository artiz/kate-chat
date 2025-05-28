import React from "react";
import { Text, Grid, Card, Button, Group, Stack, Badge, Divider, Table, Alert, Code } from "@mantine/core";
import { IconBrandOpenai, IconBrandAws, IconServer, IconReportMoney } from "@tabler/icons-react";
import { ProviderInfo } from "@/store/slices/modelSlice";

interface ProvidersInfoProps {
  providers: ProviderInfo[];
  onOpenCostModal: (providerId: string) => void;
}

export const ProvidersInfo: React.FC<ProvidersInfoProps> = ({ providers, onOpenCostModal }) => {
  return (
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
  );
};
