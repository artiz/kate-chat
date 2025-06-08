import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { gql, useSubscription, OnDataOptions, useApolloClient, useMutation } from "@apollo/client";
import {
  Message,
  MessageType,
  MessageRole,
  Chat,
  updateChat as updateChatInState,
  setCurrentChat,
} from "@/store/slices/chatSlice";
import { notifications } from "@mantine/notifications";
import { useAppDispatch } from "@/store";
import { parseChatMessages, parseMarkdown } from "@/lib/services/MarkdownParser";
import { GET_CHAT_MESSAGES, GetChatMessagesResponse, UPDATE_CHAT_MUTATION } from "@/store/services/graphql";
import { debounce, pick } from "lodash";

type HookResult = {
  chat: Chat | undefined;
  messages: Message[] | undefined;
  messagesLoading: boolean;
  loadCompleted: boolean;
  addChatMessage: (msg: Message) => void;
  removeMessages: (messageIds: string[]) => void;
  loadMoreMessages: () => void;
  updateChat: (chatId: string | undefined, input: UpdateChatInput, afterUpdate?: () => void) => void;
};

interface HookProps {
  chatId?: string;
}

export interface UpdateChatInput {
  title?: string;
  description?: string;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;

  lastBotMessage?: string;
  lastBotMessageHtml?: string[];
}

const MESSAGES_PER_PAGE = 50;

export const useChatMessages: (props?: HookProps) => HookResult = ({ chatId } = {}) => {
  const [chat, setChat] = useState<Chat | undefined>();

  const [messages, setMessages] = useState<Message[] | undefined>();
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);
  const [loadCompleted, setLoadCompleted] = useState<boolean>(false);

  const dispatch = useAppDispatch();
  const client = useApolloClient();

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
              setMessages(prev => (prev && offset ? [...parsedMessages, ...prev] : parsedMessages));
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

  const removeMessages = (messageIds: string[]) => {
    if (!chatId || !messageIds.length) return;
    setMessages(prev => {
      if (!prev) return []; // If no messages yet, return empty array

      // Filter out messages that match the IDs to be removed
      const updatedMessages = prev.filter(msg => !messageIds.includes(msg.id));
      if (updatedMessages.length === prev.length) {
        return prev; // No changes made, return original array
      }

      // If the last message was removed, reset the lastBotMessage in chat
      if (chat && messageIds.includes(chat.lastBotMessageId || "")) {
        updateChat(chatId, {
          ...chat,
          lastBotMessage: "...",
          lastBotMessageHtml: undefined,
        });
      }

      return updatedMessages;
    });
  };

  // Update chat mutation (for changing the model)
  const [updateChatMutation] = useMutation(UPDATE_CHAT_MUTATION, {
    onCompleted: data => {
      notifications.update({
        title: "Model Changed",
        message: `Chat model has been updated`,
        color: "green",
      });
      dispatch(setCurrentChat(data.updateChat));
    },
    onError: error => {
      console.error("Error updating chat:", error);
      notifications.show({
        title: "Error",
        message: error.message || "Failed to update chat model",
        color: "red",
      });
    },
  });

  const mutateChat = debounce(updateChatMutation, 250);

  const updateChat = (chatId: string | undefined, input: UpdateChatInput, afterUpdate?: () => void) => {
    setChat(prev =>
      prev
        ? {
            ...prev,
            ...input,
          }
        : undefined
    );

    if (chat) {
      dispatch(
        updateChatInState({
          ...chat,
          ...input,
        })
      );
    }

    if (chatId) {
      mutateChat({
        variables: {
          id: chatId,
          input: pick(input, ["title", "description", "modelId", "temperature", "maxTokens", "topP"]),
        },
      });

      afterUpdate && setTimeout(afterUpdate, 500); // Allow some time for the mutation to complete
    }
  };

  const addChatMessage = (msg: Message) => {
    if (!msg) return;

    const addMessage = (message: Message) => {
      setMessages(prev => {
        if (!prev) return [message]; // If no messages yet, start with this one

        const existingNdx = prev.findLastIndex(m => m.id === message.id);
        // If the last message is from the same user and has the same content, skip adding
        if (existingNdx !== -1) {
          prev[existingNdx] = { ...message }; // Update the last message instead
          return prev;
        } else {
          return [...prev, message];
        }
      });

      if (chat && message.role === MessageRole.ASSISTANT) {
        updateChat(chatId, {
          ...chat,
          lastBotMessage: message.content,
          lastBotMessageHtml: message.html,
        });
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

  return {
    chat,
    messages,
    messagesLoading,
    loadCompleted,
    removeMessages,
    addChatMessage,
    loadMoreMessages,
    updateChat,
  };
};
