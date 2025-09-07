import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApolloClient, useMutation } from "@apollo/client";
import { updateChat as updateChatInState } from "@/store/slices/chatSlice";
import { notifications } from "@mantine/notifications";
import { useAppDispatch, useAppSelector } from "@/store";
import { parseChatMessages, parseMarkdown } from "@/lib/services/MarkdownParser";
import {
  DeleteMessageResponse,
  GET_CHAT_MESSAGES,
  GetChatMessagesResponse,
  Message,
  UPDATE_CHAT_MUTATION,
} from "@/store/services/graphql";
import { pick } from "lodash";
import { MessageRole } from "@/types/ai";

type HookResult = {
  messages: Message[] | undefined;
  messagesLoading: boolean;
  loadCompleted: boolean;
  streaming: boolean;
  addChatMessage: (message: Message) => void;
  clearMessagesAfter: (message: Message) => void;
  removeMessages: (result: DeleteMessageResponse) => void;
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
  imagesCount?: number;

  lastBotMessage?: string;
  lastBotMessageHtml?: string[];
}

const MESSAGES_PER_PAGE = 50;

export const useChatMessages: (props?: HookProps) => HookResult = ({ chatId } = {}) => {
  const [messages, setMessages] = useState<Message[] | undefined>();
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);
  const [loadCompleted, setLoadCompleted] = useState<boolean>(false);
  const [streaming, setStreaming] = useState<boolean>(false);
  const updateTimeout = useRef<NodeJS.Timeout | null>(null);
  const loadTimeout = useRef<NodeJS.Timeout | null>(null);
  const chats = useAppSelector(state => state.chats.chats);

  const dispatch = useAppDispatch();
  const client = useApolloClient();

  // Get chat messages and chat details

  const loadMessages = useCallback(
    (offset = 0) => {
      if (!chatId) return;
      setMessagesLoading(true);
      if (loadTimeout.current) {
        clearTimeout(loadTimeout.current);
      }

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

            dispatch(updateChatInState(ch));
            setHasMoreMessages(hasMore);

            // Parse and set messages
            parseChatMessages(messages).then(parsedMessages => {
              setMessages(prev => (prev && offset ? [...parsedMessages, ...prev] : parsedMessages));
            });

            loadTimeout.current = setTimeout(() => setLoadCompleted(true), 300);
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

  const chat = useMemo(() => {
    if (!chatId) return;
    return chats.find(c => c.id === chatId);
  }, [chats, chatId]);

  const loadMoreMessages = () => {
    if (!chatId || messagesLoading) return;
    if (!hasMoreMessages) return; // No more messages to load
    loadMessages(messages?.length);
  };

  const clearMessagesAfter = (message: Message) => {
    setMessages(
      prev =>
        prev?.filter(msg => {
          if (msg.createdAt >= message.createdAt && msg.id !== message.id) {
            return false; // Remove messages after the specified message
          }

          return true;
        }) || []
    );
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

  const removeMessages = (result: DeleteMessageResponse) => {
    if (!chatId || !result.deleteMessage.messages.length) return;
    const deletedMessages = result.deleteMessage.messages;
    setMessages(prev => {
      if (!prev) return []; // If no messages yet, return empty array
      const messageIds = new Set(deletedMessages.map(m => m.id));

      // linked one delete
      const linkedMessages = new Set(deletedMessages.filter(m => m.linkedToMessageId).map(m => m.linkedToMessageId));
      if (linkedMessages.size) {
        return prev.map(msg => {
          if (linkedMessages.has(msg.id)) {
            return { ...msg, linkedMessages: msg.linkedMessages?.filter(lm => !messageIds.has(lm.id)) };
          }
          return msg;
        });
      } else {
        // Filter out messages that match the IDs to be removed
        const updatedMessages = prev.filter(msg => !messageIds.has(msg.id));
        if (updatedMessages.length === prev.length) {
          return prev; // No changes made, return original array
        }

        // If the last message was removed, reset the lastBotMessage in chat
        if (chat && messageIds.has(chat.lastBotMessageId || "")) {
          const lastMsgNdx = updatedMessages.findLastIndex(m => m.role === MessageRole.ASSISTANT);
          const lastMsg = lastMsgNdx != -1 ? updatedMessages[lastMsgNdx] : undefined;
          updateChat(chatId, {
            ...chat,
            lastBotMessage: lastMsg?.content || "...",
            lastBotMessageHtml: lastMsg?.html || undefined,
          });
        }

        return updatedMessages;
      }
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
      dispatch(updateChatInState(data.updateChat));
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

  const updateChat = (id: string | undefined, input: UpdateChatInput, afterUpdate?: () => void) => {
    if (!id) return;

    const existing = chats.find(c => c.id === id);
    if (existing) {
      updateChatInState({
        ...existing,
        ...input,
      });
    }

    if (updateTimeout.current) {
      clearTimeout(updateTimeout.current);
    }
    updateTimeout.current = setTimeout(() => {
      updateChatMutation({
        variables: {
          id,
          input: pick(input, ["title", "description", "modelId", "temperature", "maxTokens", "topP", "imagesCount"]),
        },
      });
    }, 300);

    afterUpdate && setTimeout(afterUpdate, 500); // Allow some time for the mutation to complete
  };

  const addChatMessage = (msg: Message) => {
    if (!msg) return;

    const addMessage = (message: Message) => {
      setMessages(prev => {
        if (!prev) return [message]; // If no messages yet, start with this one

        if (message.linkedToMessageId) {
          const parentNdx = prev.findLastIndex(m => m.id === message.linkedToMessageId);
          if (parentNdx === -1) {
            notifications.show({
              title: "Error",
              message: `Parent message with ID ${message.linkedToMessageId} not found`,
              color: "red",
            });

            return prev; // If parent not found, do not add this message
          }

          const linkedMessages = [...(prev[parentNdx].linkedMessages || [])];
          const existingNdx = linkedMessages.findLastIndex(m => m.id === message.id);
          if (existingNdx !== -1) {
            linkedMessages[existingNdx] = { ...message };
          } else {
            linkedMessages.push(message);
          }
          prev[parentNdx] = {
            ...prev[parentNdx],
            linkedMessages,
          };
          return [...prev];
        } else {
          const existingNdx = prev.findLastIndex(m => m.id === message.id);
          // If the last message is from the same user and has the same content, skip adding
          if (existingNdx !== -1) {
            prev[existingNdx] = { ...message }; // Update the last message instead
            return [...prev];
          } else {
            return [...prev, message];
          }
        }
      });

      if (chat && message.role === MessageRole.ASSISTANT && !message.linkedToMessageId) {
        const update = {
          ...chat,
          lastBotMessage: message.content,
          lastBotMessageHtml: message.html,
          isPristine: false,
        };

        dispatch(updateChatInState(update));
      }
    };

    setStreaming(msg.streaming || false);

    if (msg.content) {
      parseMarkdown(msg.content)
        .then(html => {
          addMessage({ ...msg, html });
        })
        .catch(error => {
          console.error("Error parsing markdown:", error);
          addMessage({ ...msg });
        });
    } else {
      addMessage(msg);
    }
  };

  return {
    messages,
    messagesLoading,
    loadCompleted,
    streaming,
    removeMessages,
    addChatMessage,
    clearMessagesAfter,
    loadMoreMessages,
    updateChat,
  };
};
