import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { gql, useMutation, useQuery } from "@apollo/client";
import { Center, Loader, Text } from "@mantine/core";
import { useAppSelector, useAppDispatch } from "../store";
import { addChat } from "../store/slices/chatSlice";
import { notifications } from "@mantine/notifications";
import { CREATE_CHAT_MUTATION } from "../store/services/graphql";

// Query to find a pristine chat
const FIND_PRISTINE_CHAT = gql`
  query FindPristineChat {
    getChats(input: { limit: 10, offset: 0 }) {
      chats {
        id
        title
        isPristine
        modelId
      }
    }
  }
`;

const CreateChat: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [isProcessing, setIsProcessing] = useState(true);

  const { models, selectedModel } = useAppSelector(state => state.models);
  const defaultModel = selectedModel || models.find(model => model.isDefault) || (models.length > 0 ? models[0] : null);

  // Find pristine chat query
  const { data: pristineData, loading: pristineLoading } = useQuery(FIND_PRISTINE_CHAT, {
    fetchPolicy: "network-only",
    onCompleted: data => {
      const pristineChats = data?.getChats?.chats?.filter(chat => chat.isPristine) || [];

      if (pristineChats.length > 0) {
        // Found a pristine chat, navigate to it
        navigate(`/chat/${pristineChats[0].id}`);
        setIsProcessing(false);
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
      setIsProcessing(false);
    },
  });

  // Create chat mutation
  const [createChat, { loading }] = useMutation(CREATE_CHAT_MUTATION, {
    onCompleted: data => {
      dispatch(addChat(data.createChat));
      navigate(`/chat/${data.createChat.id}`);
      setIsProcessing(false);
    },
    onError: error => {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to create chat",
        color: "red",
      });
      navigate("/chat");
      setIsProcessing(false);
    },
  });

  // Create new chat function
  const createNewChat = () => {
    if (!defaultModel) {
      notifications.show({
        title: "No Models Available",
        message: "Please configure AI models before creating a chat",
        color: "yellow",
      });
      navigate("/chat");
      setIsProcessing(false);
      return;
    }

    createChat({
      variables: {
        input: {
          title: "New Chat",
          modelId: defaultModel.modelId,
        },
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

export default CreateChat;
