import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { gql, useQuery, useMutation } from '@apollo/client';
import {
  Container,
  Paper,
  Text,
  Textarea,
  Button,
  Stack,
  Group,
  Avatar,
  Loader,
  Title,
  Box,
  ActionIcon,
} from '@mantine/core';
import { IconSend, IconRobot, IconUser, IconX } from '@tabler/icons-react';
import { useAppSelector, useAppDispatch } from '../store';
import { setMessages, setCurrentChat, addMessage } from '../store/slices/chatSlice';

// GraphQL queries
const GET_CHAT = gql`
  query GetChat($id: ID!) {
    getChatById(id: $id) {
      id
      title
      createdAt
      updatedAt
    }
  }
`;

const GET_CHAT_MESSAGES = gql`
  query GetChatMessages($input: GetMessagesInput!) {
    getChatMessages(input: $input) {
      messages {
        id
        content
        role
        createdAt
        modelId
        modelName
      }
      total
      hasMore
    }
  }
`;

const SEND_MESSAGE = gql`
  mutation SendMessage($input: CreateMessageInput!) {
    createMessage(input: $input) {
      id
      content
      role
      createdAt
    }
  }
`;

const Chat: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  
  const selectedModel = useAppSelector((state) => state.models.selectedModel);
  const messages = useAppSelector((state) => state.chats.messages);
  
  // Get chat details
  const { data: chatData, loading: chatLoading, error: chatError } = useQuery(GET_CHAT, {
    variables: { id },
    skip: !id,
    onCompleted: (data) => {
      dispatch(setCurrentChat(data.getChat));
    },
  });
  
  // Get chat messages
  const { loading: messagesLoading, error: messagesError } = useQuery(GET_CHAT_MESSAGES, {
    variables: {
      input: {
        chatId: id,
        limit: 100,
        offset: 0,
      },
    },
    skip: !id,
    onCompleted: (data) => {
      dispatch(setMessages(data.getChatMessages.messages));
    },
  });
  
  // Send message mutation
  const [sendMessageMutation] = useMutation(SEND_MESSAGE, {
    onCompleted: (data) => {
      dispatch(addMessage(data.createMessage));
      setSending(false);
    },
    onError: (error) => {
      console.error('Error sending message:', error);
      setSending(false);
    },
  });
  
  // Handle send message
  const handleSendMessage = async () => {
    if (!message.trim() || !id) return;
    
    setSending(true);
    setMessage('');
    
    await sendMessageMutation({
      variables: {
        input: {
          chatId: id,
          content: message,
          role: 'user',
          modelId: selectedModel?.modelId,
        },
      },
    });
  };
  
  // Loading state
  const isLoading = chatLoading || messagesLoading;
  const error = chatError || messagesError;
  
  if (error) {
    return (
      <Container size="md" py="xl">
        <Paper p="xl" withBorder>
          <Title order={2} color="red">Error Loading Chat</Title>
          <Text mt="md">{error.message}</Text>
          <Button mt="xl" onClick={() => navigate('/chat')}>
            Back to Chats
          </Button>
        </Paper>
      </Container>
    );
  }
  
  return (
    <Container size="md" py="md" h="calc(100vh - 120px)" style={{ display: 'flex', flexDirection: 'column' }}>
      <Group justify="flex-start" mb="md">
        <Title order={3}>
          {isLoading ? 'Loading...' : chatData?.getChat?.title || 'Untitled Chat'}
        </Title>
        <Title size="xs" color="dimmed" ml="md">
          {isLoading ? 'Loading...' : (selectedModel?.name || 'No Model Selected') }
        </Title>
        <ActionIcon onClick={() => navigate('/chat')}>
          <IconX size={18} />
        </ActionIcon>
      </Group>
      
      {/* Messages */}
      <Paper 
        withBorder 
        p="md" 
        style={{ flexGrow: 1, overflowY: 'auto', marginBottom: '1rem' }}
      >
        {isLoading ? (
          <Group align="center" py="xl">
            <Loader />
          </Group>
        ) : messages.length === 0 ? (
          <Stack align="center" justify="center" h="100%" gap="md">
            <IconRobot size={48} opacity={0.5} />
            <Text size="lg" ta="center">No messages yet</Text>
            <Text c="dimmed" size="sm" ta="center">
              Start the conversation by sending a message
            </Text>
          </Stack>
        ) : (
          <Stack spacing="lg">
            {messages.map((msg) => (
              <Group key={msg.id} align="flex-start" spacing="xs">
                <Avatar 
                  color={msg.role === 'user' ? 'blue' : 'gray'} 
                  radius="xl"
                >
                  {msg.role === 'user' ? <IconUser size={20} /> : <IconRobot size={20} />}
                </Avatar>
                <Box 
                  style={{ 
                    maxWidth: 'calc(100% - 50px)', 
                    wordWrap: 'break-word'
                  }}
                >
                  <Text 
                    size="sm" 
                    fw={500} 
                    c={msg.role === 'user' ? 'blue' : 'dark'}
                  >
                    {msg.role === 'user' ? 'You' : msg.modelName || "AI"}
                  </Text>
                  <Paper 
                    p="sm" 
                    bg={msg.role === 'user' ? 'blue.0' : 'gray.0'} 
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {msg.content}
                  </Paper>
                  <Text size="xs" c="dimmed" mt={2}>
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </Text>
                </Box>
              </Group>
            ))}
            {sending && (
              <Group align="flex-start" gap="xs">
                <Avatar color="gray" radius="xl">
                  <IconRobot size={20} />
                </Avatar>
                <Box>
                  <Text size="sm" fw={500}>AI</Text>
                  <Loader size="sm" />
                </Box>
              </Group>
            )}
          </Stack>
        )}
      </Paper>
      
      {/* Message input */}
      <Group justify="space-between" align="flex-start">
        <Textarea
          placeholder="Type your message..."
          value={message}
          onChange={(e) => setMessage(e.currentTarget.value)}
          autosize
          minRows={1}
          maxRows={5}
          style={{ flexGrow: 1 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          disabled={sending || isLoading}
        />
        <Button 
          onClick={handleSendMessage} 
          disabled={!message.trim() || sending || isLoading}
        >
          <IconSend size={16} /> Send
        </Button>
      </Group>
    </Container>
  );
};

export default Chat;
