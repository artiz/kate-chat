import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gql, useSubscription, OnDataOptions } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { BASE_MESSAGE_FRAGMENT, Message, MessageRole, MessageType } from "@/store/services/graphql";

const THROTTLE_TIMEOUT = 60; // ms throttle timeout

// GraphQL queries and subscriptions
const NEW_MESSAGE_SUBSCRIPTION = gql`
  subscription OnNewMessage($chatId: String!) {
    newMessage(chatId: $chatId) {
      type
      message {
        ...BaseMessage
      }
      error
      streaming
    }
  }

  ${BASE_MESSAGE_FRAGMENT}
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
  const lastTs = useRef(0);
  const addMessageTs = useRef<NodeJS.Timeout>(null);

  // Effect to update connection status
  useEffect(() => {
    if (id) {
      setWsConnected(false);
    }
  }, [id]);

  const addChatMessage = useCallback(
    (message: Message) => {
      if (!message) return;
      const now = Date.now();
      // Throttle to avoid too many updates in a short time
      if (now - lastTs.current < THROTTLE_TIMEOUT) {
        if (addMessageTs.current) {
          clearTimeout(addMessageTs.current);
        }

        addMessageTs.current = setTimeout(() => addMessage(message), THROTTLE_TIMEOUT);
        return;
      }

      lastTs.current = now;

      if (addMessageTs.current) {
        clearTimeout(addMessageTs.current);
      }
      addMessage(message);
    },
    [addMessage]
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
    onData: (
      options: OnDataOptions<{
        newMessage?: { type: MessageType; message: Message; error: string; streaming: boolean };
      }>
    ) => {
      const data = options.data?.data || {};

      setWsConnected(true);
      if (data?.newMessage) {
        const response = data.newMessage;

        if (response.type === MessageType.MESSAGE) {
          if (response.message) {
            setTimeout(() => addChatMessage({ ...response.message, streaming: response.streaming }), 0);
          } else if (response.error) {
            notifications.show({
              title: "Model interaction error",
              message: response.error,
              color: "red",
            });
          }

          // If it's an assistant message after we sent something, clear loading state
          if (
            response.error ||
            response.message?.role === MessageRole.ASSISTANT ||
            response.message?.role === MessageRole.ERROR
          ) {
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
