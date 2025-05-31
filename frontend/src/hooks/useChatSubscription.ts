import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { gql, useSubscription, OnDataOptions } from "@apollo/client";
import { Message, MessageType, MessageRole } from "../store/slices/chatSlice";
import { notifications } from "@mantine/notifications";
import { useAppDispatch } from "@/store";
import { throttle } from "lodash";

// GraphQL queries and subscriptions
const NEW_MESSAGE_SUBSCRIPTION = gql`
  subscription OnNewMessage($chatId: String!) {
    newMessage(chatId: $chatId) {
      type
      message {
        id
        content
        role
        createdAt
        modelId
        modelName
      }
      error
    }
  }
`;

type SubscriptionResult = {
  wsConnected: boolean;
};

interface UseChatSubscriptionProps {
  id: string | undefined;
  resetSending: () => void;
  addMessage: (message: Message) => void;
}

export const useChatSubscription: (props: UseChatSubscriptionProps) => SubscriptionResult = ({
  id,
  resetSending,
  addMessage,
}) => {
  const [wsConnected, setWsConnected] = useState(false);

  const dispatch = useAppDispatch();

  // Effect to update connection status
  useEffect(() => {
    if (id) {
      setWsConnected(false);
    }
  }, [id]);

  const addChatMessage = useCallback(
    throttle((message: Message) => {
      if (!message) return;
      addMessage(message);
    }, 200),
    [dispatch, addMessage]
  );

  // Subscribe to new messages in this chat
  useSubscription(NEW_MESSAGE_SUBSCRIPTION, {
    variables: { chatId: id },
    skip: !id,
    shouldResubscribe: true, // Resubscribe if variables change
    fetchPolicy: "no-cache", // Don't cache subscription data
    onComplete: () => {
      setWsConnected(false);
    },
    onData: (options: OnDataOptions<{ newMessage?: { type: MessageType; message: Message; error: string } }>) => {
      const data = options.data?.data || {};

      setWsConnected(true);
      if (data?.newMessage) {
        const response = data.newMessage;

        if (response.type === MessageType.MESSAGE) {
          if (response.message) {
            setImmediate(() => addChatMessage(response.message));
          } else if (response.error) {
            notifications.show({
              title: "Model interaction error",
              message: response.error,
              color: "red",
            });
          }

          // If it's an assistant message after we sent something, clear loading state
          if (response.error || response.message?.role === MessageRole.ASSISTANT) {
            resetSending();
          }
        }
      }
    },
    onError: error => {
      console.error(`Subscription error for chat ${id}:`, error);
      setWsConnected(false);
    },
  });

  return {
    wsConnected,
  };
};
