import React from 'react';
import { useNavigate } from 'react-router-dom';
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
} from '@mantine/core';
import { IconBrandOpenai, IconRocket, IconBook2, IconBrandAws, IconMessage, IconMessagePlus } from '@tabler/icons-react';
import { useAppSelector, useAppDispatch } from '../store';
import { useMutation } from '@apollo/client';
import { setSelectedModel } from '../store/slices/modelSlice';
import { CREATE_CHAT_MUTATION } from '../store/services/graphql';
import { notifications } from '@mantine/notifications';

// Helper function to get provider icon
const getProviderIcon = (provider: string) => {
  switch (provider.toLowerCase()) {
    case 'openai':
      return <IconBrandOpenai size={24} />;
    case 'anthropic':
      return <IconBook2 size={24} />;
    case 'aws':
    case 'amazon':
      return <IconBrandAws size={24} />;
    default:
      return <IconRocket size={24} />;
  }
};

const Models: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { models, loading, error } = useAppSelector((state) => state.models);
  
  // Create chat mutation
  const [createChat, { loading: creatingChat }] = useMutation(CREATE_CHAT_MUTATION, {
    onCompleted: (data) => {
      navigate(`/chat/${data.createChat.id}`);
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to create chat',
        color: 'red',
      });
    },
  });
  
  // Handle creating a new chat with the selected model
  const handleCreateChat = (model) => {
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
  
  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack align="center" gap="md">
          <Loader size="xl" />
          <Text>Loading models...</Text>
        </Stack>
      </Container>
    );
  }
  
  if (error) {
    return (
      <Container size="lg" py="xl">
        <Title order={2} color="red">Error Loading Models</Title>
        <Text mt="md">{error}</Text>
      </Container>
    );
  }
  
  return (
    <Container size="lg" py="xl">
      <Title order={2} mb="xl">Available AI Models</Title>
      
      <Grid>
        {models.map((model) => (
          <Grid.Col key={model.id} span={{ base: 12, sm: 6, lg: 4 }}>
            <Card withBorder padding="lg" radius="md">
              <Stack gap="md">
                <Group justify="space-between">
                  <Group>
                    {getProviderIcon(model.provider?.name)}
                    <div>
                      <Text fw={500}>{model.name}</Text>
                      <Text size="xs" c="dimmed">
                        {model.provider?.name}
                      </Text>
                    </div>
                  </Group>
                  
                  {model.isDefault && (
                    <Badge color="green" variant="light">Default</Badge>
                  )}
                </Group>
                
                <Button 
                  leftSection={<IconMessagePlus size={16} />}
                  fullWidth
                  onClick={() => handleCreateChat(model)}
                  loading={creatingChat}
                >
                  Start Chat
                </Button>
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
    </Container>
  );
};

export default Models;
