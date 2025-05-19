import React from 'react';
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
} from '@mantine/core';
import { IconBrandOpenai, IconRocket, IconBook2, IconBrandAws } from '@tabler/icons-react';
import { useAppSelector } from '../store';

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
  const { models, loading, error } = useAppSelector((state) => state.models);
  
  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack align="center" spacing="md">
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
              <Group position="apart" mb="md">
                <Group>
                  {getProviderIcon(model.provider)}
                  <div>
                    <Text fw={500}>{model.name}</Text>
                    <Text size="xs" c="dimmed">
                      {model.provider}
                    </Text>
                  </div>
                </Group>
              </Group>
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
