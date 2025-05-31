import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { gql, useSubscription, OnDataOptions, useApolloClient } from "@apollo/client";
import { Message, MessageType, MessageRole, Chat, updateChat, setCurrentChat } from "@/store/slices/chatSlice";
import { notifications } from "@mantine/notifications";
import { useAppDispatch } from "@/store";
import { parseChatMessages, parseMarkdown } from "@/lib/services/MarkdownParser";
import { GetChatMessagesResponse } from "@/store/services/graphql";

type HookResult = {
  chat: Chat | undefined;
  messages: Message[] | undefined;
  messagesLoading: boolean;
  loadCompleted: boolean;
  addChatMessage: (msg: Message) => void;
  loadMoreMessages: () => void;
  updateChat: (cb: (chat: Chat | undefined) => Chat | undefined) => void;
};

interface HookProps {
  chatId: string | undefined;
}

const MESSAGES_PER_PAGE = 50;

// GraphQL queries and subscriptions
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
        user {
          lastName
          firstName
        }
      }
      total
      hasMore
      chat {
        id
        title
        modelId
        isPristine
        createdAt
        updatedAt
        temperature
        maxTokens
        topP
      }
    }
  }
`;

export const useChatMessages: (props: HookProps) => HookResult = ({ chatId }) => {
  const [chat, setChat] = useState<Chat | undefined>();

  const [messages, setMessages] = useState<Message[] | undefined>();
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);
  const [loadCompleted, setLoadCompleted] = useState<boolean>(false);

  const dispatch = useAppDispatch();
  const client = useApolloClient();

  const addChatMessage = (msg: Message) => {
    if (!msg) return;

    const addMessage = (message: Message) => {
      setMessages(prev => {
        if (!prev) return [message]; // If no messages yet, start with this one

        const existingNdx = prev.findLastIndex(m => m.id === message.id);
        // If the last message is from the same user and has the same content, skip adding
        if (existingNdx !== -1) {
          prev[existingNdx] = message; // Update the last message instead
          return [...prev];
        } else {
          return [...prev, message];
        }
      });

      if (chat && message.role === MessageRole.ASSISTANT) {
        dispatch(
          updateChat({
            ...chat,
            lastBotMessage: message.content,
            lastBotMessageHtml: message.html,
          })
        );
      }
    };

    if (msg.content) {
      parseMarkdown(msg.content).then(html => {
        addMessage({ ...msg, html });
      });
    } else {
      addMessage(msg);
    }
  };

  // Get chat messages and chat details
  const loadMessages = useCallback(
    (offset = 0) => {
      if (!chatId) return;
      setMessagesLoading(true);
      client
        .query<GetChatMessagesResponse>({
          query: GET_CHAT_MESSAGES,
          variables: {
            input: {
              chatId,
              limit: MESSAGES_PER_PAGE,
              offset,
            },
          },
        })
        .then(response => {
          const { chat: ch, messages = [], hasMore } = response.data.getChatMessages || {};
          // Set chat details from the chat field in getChatMessages
          if (ch) {
            if (ch.id !== chatId) {
              return; // If the chat ID doesn't match, do nothing
            }

            dispatch(setCurrentChat(ch));
            setChat(ch);
            setHasMoreMessages(hasMore);

            // Parse and set messages
            parseChatMessages(messages).then(parsedMessages => {
              setMessages(prev => (prev ? [...parsedMessages, ...prev] : parsedMessages));
            });

            setTimeout(() => setLoadCompleted(true), 300);
          }
        })
        .catch(error => {
          notifications.show({
            title: "Error",
            message: error.message || "Failed to load messages",
            color: "red",
          });
        })
        .finally(() => {
          setMessagesLoading(false);
        });
    },
    [chatId]
  );

  const loadMoreMessages = () => {
    if (!chatId || messagesLoading) return;
    if (!hasMoreMessages) return; // No more messages to load
    loadMessages(messages?.length);
  };

  useEffect(() => {
    if (!chatId) return;
    setMessages(undefined);
    setHasMoreMessages(false);
    setLoadCompleted(false);
    const timeout = setTimeout(() => {
      loadMessages();
    }, 200);

    return () => {
      clearTimeout(timeout);
    };
  }, [chatId]);

  return {
    chat,
    messages,
    messagesLoading,
    loadCompleted,
    addChatMessage,
    loadMoreMessages,
    updateChat: setChat,
  };
};
