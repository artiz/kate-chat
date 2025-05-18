"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { gql, useQuery, useMutation } from "@apollo/client";
import { Center, Loader } from "@mantine/core";
import { notifications } from "@mantine/notifications";

// Query to get the default model
const GET_DEFAULT_MODEL = gql`
  query GetDefaultModel {
    getModels {
        models {
            id
            name
            isDefault
        }
    }
  }
`;

// Create chat mutation
const CREATE_CHAT_MUTATION = gql`
  mutation CreateChat($input: CreateChatInput!) {
    createChat(input: $input) {
      id
      title
    }
  }
`;

export default function NewChatPage() {
  const router = useRouter();

  // Get the default model
  const { data, loading, error } = useQuery(GET_DEFAULT_MODEL);

  // Create chat mutation
  const [createChat, { loading: creating }] = useMutation(CREATE_CHAT_MUTATION, {
    onCompleted: data => {
      router.push(`/chat/${data.createChat.id}`);
    },
    onError: error => {
      notifications.show({
        title: "Error creating chat",
        message: error.message,
        color: "red",
      });
      // Fallback to chat list
      router.push("/chat");
    },
  });

  // Create a new chat with the default model when the page loads
  useEffect(() => {
    if (!loading && !error && data?.getModels?.models) {
      // Find the default model
      const defaultModel = data.getModels.models.find((model: any) => model.isDefault);

      // If no default model was found, use the first one
      const modelId = defaultModel ? defaultModel.id : data.getModels[0]?.id;

      // Only proceed if we have a model
      if (modelId) {
        createChat({
          variables: {
            input: {
              modelId,
              title: "New Chat",
            },
          },
        });
      } else {
        notifications.show({
          title: "No models available",
          message: "Please add models to start chatting",
          color: "red",
        });
        // Redirect to models page if no models are available
        router.push("/models");
      }
    }
  }, [loading, error, data, createChat, router]);

  return (
    <Center h="100%">
      <Loader size="xl" />
    </Center>
  );
}
