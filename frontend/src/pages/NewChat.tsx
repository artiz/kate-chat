import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gql, useMutation } from '@apollo/client';
import {
  Container,
  Title,
  Paper,
  Select,
  Button,
  Group,
  TextInput,
  Textarea,
  Stack,
} from '@mantine/core';
import { useAppSelector, useAppDispatch } from '../store';
import { addChat } from '../store/slices/chatSlice';
import { notifications } from '@mantine/notifications';

// GraphQL mutations
const CREATE_CHAT_MUTATION = gql`
  mutation CreateChat($input: CreateChatInput!) {
    createChat(input: $input) {
      id
      title
      updatedAt
    }
  }
`;

const NewChat: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  
  const { models, loading: modelsLoading } = useAppSelector((state) => state.models);
  
  // Create chat mutation
  const [createChat, { loading }] = useMutation(CREATE_CHAT_MUTATION, {
    onCompleted: (data) => {
      dispatch(addChat(data.createChat));
      navigate(`/chat/${data.createChat.id}`);
      
      notifications.show({
        title: 'Chat Created',
        message: 'Your new chat has been created successfully',
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to create chat',
        color: 'red',
      });
    },
  });
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedModelId) {
      notifications.show({
        title: 'Missing Model',
        message: 'Please select an AI model for this chat',
        color: 'yellow',
      });
      return;
    }
    
    await createChat({
      variables: {
        input: {
          title: title.trim() || 'New Chat',
          modelId: selectedModelId,
        },
      },
    });
  };
  
  // Cancel chat creation
  const handleCancel = () => {
    navigate('/chat');
  };
  
  return (
    <Container size="md" py="xl">
      <Title order={2} mb="xl">Create New Chat</Title>
      
      <form onSubmit={handleSubmit}>
        <Paper withBorder p="xl">
          <Stack gap="md">
            <TextInput
              label="Chat Title"
              placeholder="My New Chat"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            
            <Select
              label="Select AI Model"
              placeholder="Choose a model"
              data={models.map((model) => ({
                value: model.modelId,
                label: `${model.name} (${model.provider?.name || model.modelId})`,
              }))}
              value={selectedModelId}
              onChange={setSelectedModelId}
              searchable
              required
              disabled={modelsLoading}
            />
            
            <Group position="right" mt="xl">
              <Button variant="default" onClick={handleCancel}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={!selectedModelId || loading}
                loading={loading}
              >
                Create Chat
              </Button>
            </Group>
          </Stack>
        </Paper>
      </form>
    </Container>
  );
};

export default NewChat;
