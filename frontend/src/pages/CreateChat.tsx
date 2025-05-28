import React from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client";
import { Center, Loader, Text } from "@mantine/core";
import { useAppSelector, useAppDispatch } from "../store";
import { addChat, Chat } from "../store/slices/chatSlice";
import { notifications } from "@mantine/notifications";
import { FIND_PRISTINE_CHAT, CREATE_CHAT_MUTATION } from "../store/services/graphql";

export const CreateChat: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const { models } = useAppSelector(state => state.models);
  const user = useAppSelector(state => state.user.currentUser);

  // Find model to use - priority:
  // 1. User's default model
  // 2. First active model
  const userDefaultModel = user?.defaultModelId ? models.find(model => model.modelId === user.defaultModelId) : null;
  const firstActiveModel = models.find(model => model.isActive);
  const modelToUse = userDefaultModel || firstActiveModel || (models.length > 0 ? models[0] : null);

  // Find pristine chat query
  const { loading: pristineLoading } = useQuery(FIND_PRISTINE_CHAT, {
    fetchPolicy: "network-only",
    onCompleted: data => {
      const pristineChats = data?.getChats?.chats?.filter((chat: Chat) => chat.isPristine) || [];

      if (pristineChats.length > 0) {
        // Found a pristine chat, navigate to it
        navigate(`/chat/${pristineChats[0].id}`);
      } else {
        // No pristine chat found, create a new one
        createNewChat();
      }
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to check for existing chats",
        color: "red",
      });
      navigate("/chat");
    },
  });

  // Create chat mutation
  const [createChat, { loading }] = useMutation(CREATE_CHAT_MUTATION, {
    onCompleted: data => {
      dispatch(addChat(data.createChat));
      navigate(`/chat/${data.createChat.id}`);
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to create chat",
        color: "red",
      });
      navigate("/chat");
    },
  });

  // Create new chat function
  const createNewChat = () => {
    if (!modelToUse) {
      notifications.show({
        title: "No Models Available",
        message: "Please configure AI models before creating a chat",
        color: "yellow",
      });
      navigate("/chat");
      return;
    }

    const chatInput: any = {
      title: "New Chat",
      modelId: modelToUse.modelId,
    };

    // Add system prompt if available
    if (user?.defaultSystemPrompt) {
      chatInput.systemPrompt = user.defaultSystemPrompt;
    }

    createChat({
      variables: {
        input: chatInput,
      },
    });
  };

  return (
    <Center style={{ height: "100vh" }}>
      <Loader size="lg" />
      <Text ml="md">Creating new chat...</Text>
    </Center>
  );
};
