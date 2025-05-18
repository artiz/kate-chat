"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gql, useQuery, useMutation } from "@apollo/client";
import {
    Container,
    Title,
    Text,
    Card,
    Grid,
    Badge,
    Group,
    Button,
    Loader,
    Center,
    Stack,
    Accordion,
    ActionIcon,
    Tooltip,
} from "@mantine/core";
import { IconStar, IconStarFilled, IconInfoCircle, IconPlus } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

// GraphQL query for model providers
const GET_MODEL_PROVIDERS = gql`
  query GetModelProviders {
    getModelProviders {
      providers {
          id
          name
          description
          isDefault
      }
    }
  }
`;

// GraphQL query for models
const GET_MODELS = gql`
  query GetModels {
    getModels {
      models {
          id
          name
          provider {
            id
            name
          }
          maxTokens
          isDefault
          description
          contextWindow
      }
    }
  }
`;

// Create chat mutation
const CREATE_CHAT_WITH_MODEL = gql`
  mutation CreateChatWithModel($input: CreateChatInput!) {
    createChat(input: $input) {
      id
    }
  }
`;

export default function ModelsPage() {
    const router = useRouter();
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

    // Fetch model providers
    const { data: providersData, loading: providersLoading, error: providersError } = useQuery(GET_MODEL_PROVIDERS);

    // Fetch models
    const { data: modelsData, loading: modelsLoading, error: modelsError } = useQuery(GET_MODELS);

    // Mutation for creating a new chat with selected model
    const [createChatWithModel, { loading: creating }] = useMutation(CREATE_CHAT_WITH_MODEL, {
        onCompleted: data => {
            // Navigate to the newly created chat
            router.push(`/chat/${data.createChat.id}`);
        },
        onError: error => {
            notifications.show({
                title: "Error creating chat",
                message: error.message,
                color: "red",
            });
        },
    });

    // Handle creating a new chat with selected model
    const handleCreateChat = (modelId: string) => {
        createChatWithModel({
            variables: {
                input: {
                    modelId,
                    title: "New Chat", // Default title
                },
            },
        });
    };

    // Loading state
    if (providersLoading || modelsLoading) {
        return (
            <Center h="100%">
                <Loader size="xl" />
            </Center>
        );
    }

    // Error state
    if (providersError || modelsError) {
        return (
            <Container>
                <Title order={2} mb="xl">
                    Models
                </Title>
                <Text c="red">Error loading models. Please try again later.</Text>
            </Container>
        );
    }

    // Get all providers
    const providers = providersData?.getModelProviders?.providers || [];
    const models = modelsData?.getModels?.models || [];

    return (
        <Container size="xl">
            <Title order={2} mb="md">
                AI Model Providers
            </Title>
            <Text mb="xl">
                Select a model provider to view available models or select a specific model to create a new chat.
            </Text>

            <Accordion
                variant="separated"
                defaultValue={providers.find((p: any) => p.isDefault)?.id || null}
                onChange={value => setSelectedProviderId(value as string)}
                mb="xl"
            >
                {providers?.map((provider: any) => (
                    <Accordion.Item key={provider.id} value={provider.id}>
                        <Accordion.Control>
                            <Group justify="space-between">
                                <Text fw={600}>{provider.name}</Text>
                                {provider.isDefault && (
                                    <Badge color="blue" size="sm">
                                        Default
                                    </Badge>
                                )}
                            </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Stack gap="md">
                                <Text size="sm">{provider.description}</Text>

                                <Title order={4} mt="md">
                                    Available Models
                                </Title>
                                <Grid>
                                    {models
                                        .filter((model: any) => model.provider.id === provider.id)
                                        .map((model: any) => (
                                            <Grid.Col key={model.id} span={{ base: 12, sm: 6, md: 4 }}>
                                                <Card shadow="sm" padding="lg" radius="md" withBorder>
                                                    <Group justify="space-between" mb="xs">
                                                        <Text fw={600}>{model.name}</Text>
                                                        {model.isDefault && (
                                                            <Badge color="blue" size="sm">
                                                                Default
                                                            </Badge>
                                                        )}
                                                    </Group>

                                                    <Text size="sm" c="dimmed" mb="md" lineClamp={3}>
                                                        {model.description || "No description available."}
                                                    </Text>

                                                    <Group justify="space-between" mt="md">
                                                        <Group gap="xs">
                                                            <Text size="xs" c="dimmed">
                                                                Context: {model.contextWindow} tokens
                                                            </Text>
                                                        </Group>

                                                        <Button
                                                            variant="light"
                                                            size="xs"
                                                            leftSection={<IconPlus size={16} />}
                                                            onClick={() => handleCreateChat(model.id)}
                                                            loading={creating}
                                                        >
                                                            New Chat
                                                        </Button>
                                                    </Group>
                                                </Card>
                                            </Grid.Col>
                                        ))}
                                </Grid>
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                ))}
            </Accordion>
        </Container>
    );
}
