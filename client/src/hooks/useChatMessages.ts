import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApolloClient, useMutation } from "@apollo/client";
import { parseChatMessages, parseMarkdown, MessageRole } from "@katechat/ui";
import { updateChat as updateChatInState } from "@/store/slices/chatSlice";
import { notifications } from "@mantine/notifications";
import { ChatLink, useAppDispatch, useAppSelector, useChat } from "@/store";
import { GET_CHAT_MESSAGES, UPDATE_CHAT_MUTATION } from "@/store/services/graphql.queries";
import { pick } from "lodash";
import { Message, GetChatMessagesResponse, MessageChatInfo, ToolType, ChatSettings, Chat } from "@/types/graphql";
import { updateFolderChat } from "@/store/slices/folderSlice";

type RemoveMessagesArgs = {
  messagesToDelete?: Message[];
  deleteAfter?: Message;
  isEdit?: boolean;
};

type HookResult = {
  messages: Message[] | undefined;
  chat: Chat | undefined;
  messagesLoading: boolean;
  loadCompleted: boolean;
  streaming: boolean;
  addChatMessage: (message: Message) => void;
  removeMessages: (args: RemoveMessagesArgs) => void;
  loadMoreMessages: () => void;
  updateChat: (link: ChatLink, input: UpdateChatInput, afterUpdate?: () => void) => void;
};

interface HookProps {
  chatId?: string;
}

export interface UpdateChatInput {
  title?: string;
  description?: string;
  modelId?: string;
  settings?: ChatSettings;
  tools?: { type: ToolType; name?: string }[];
  folderId?: string;

  lastBotMessage?: string;
  lastBotMessageId?: string;
  lastBotMessageHtml?: string[];
}

const MESSAGES_PER_PAGE = 50;

export const useChatMessages: (props?: HookProps) => HookResult = ({ chatId } = {}) => {
  const [messages, setMessages] = useState<Message[] | undefined>();
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);
  const [loadCompleted, setLoadCompleted] = useState<boolean>(false);
  const [streaming, setStreaming] = useState<boolean>(false);
  const [chat, setChat] = useState<Chat | undefined>(undefined);
  const updateTimeout = useRef<NodeJS.Timeout | null>(null);
  const loadTimeout = useRef<NodeJS.Timeout | null>(null);

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
          const { chat: ch, messages = [], hasMore, error } = response.data.getChatMessages || {};

          if (error) {
            return notifications.show({
              title: "Error",
              message: error,
              color: "red",
            });
          }

          if (ch) {
            if (ch.id !== chatId) {
              return; // If the chat ID doesn't match, do nothing
            }
            setChat(ch);

            dispatch(updateChatInState(ch));
            dispatch(updateFolderChat(ch));
            setHasMoreMessages(hasMore);

            // Parse and set messages
            const parsedMessages = parseChatMessages(messages);
            setMessages(prev => (prev && offset ? [...parsedMessages, ...prev] : parsedMessages));

            loadTimeout.current = setTimeout(() => setLoadCompleted(true), 300);
          }
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
    setHasMoreMessages(false);
    setMessages(undefined);
    setLoadCompleted(false);

    const timeout = setTimeout(() => {
      loadMessages();
    }, 200);

    return () => {
      clearTimeout(timeout);
    };
  }, [chatId]);

  const removeMessages = ({ messagesToDelete, deleteAfter, isEdit = false }: RemoveMessagesArgs) => {
    if (!chat) return;

    const resetLastBotMessage = (msgs: Message[] = []) => {
      // If the last message was removed, reset the lastBotMessage in chat
      const lastMsgNdx = msgs.findLastIndex(m => m.role === MessageRole.ASSISTANT && !m.linkedToMessageId);
      const lastMsg = lastMsgNdx != -1 ? msgs[lastMsgNdx] : undefined;
      if (chat?.lastBotMessageId && chat.lastBotMessageId !== lastMsg?.id) {
        updateChat(chat, {
          ...chat,
          lastBotMessage: lastMsg?.content || "...",
          lastBotMessageId: lastMsg?.id || undefined,
          lastBotMessageHtml: lastMsg?.html || parseMarkdown(lastMsg?.content || "..."),
        });
      }
    };

    if (deleteAfter) {
      const assistantMessage = messages?.find(
        msg => msg.createdAt >= deleteAfter.createdAt && msg.id !== deleteAfter.id && msg.role === MessageRole.ASSISTANT
      );

      const filtered =
        messages?.filter(msg => {
          if (isEdit && msg.id === assistantMessage?.id) {
            return true; // Keep the assistant message if it's an edit, it will be updated with new content
          }
          if (msg.createdAt >= deleteAfter.createdAt && msg.id !== deleteAfter.id) {
            return false; // Remove messages after the specified message
          }

          return true;
        }) || [];

      setMessages(filtered);
      resetLastBotMessage(filtered);
    } else {
      if (!messagesToDelete || messagesToDelete.length === 0) return;
      const messageIds = new Set(messagesToDelete.map(m => m.id));

      if (!messages) {
        setMessages([]);
        return;
      }
      // linked one delete
      const linkedMessages = new Set(messagesToDelete.filter(m => m.linkedToMessageId).map(m => m.linkedToMessageId));
      if (linkedMessages.size) {
        setMessages(
          messages.map(msg => {
            if (linkedMessages.has(msg.id)) {
              return { ...msg, linkedMessages: msg.linkedMessages?.filter(lm => !messageIds.has(lm.id)) };
            }
            return msg;
          })
        );
      } else {
        // Filter out messages that match the IDs to be removed
        const filtered = messages.filter(msg => !messageIds.has(msg.id));
        if (filtered.length === messages.length) {
          return;
        }
        setMessages(filtered);
        resetLastBotMessage(filtered);
      }
    }
  };

  // Update chat mutation (for changing the model)
  const [updateChatMutation] = useMutation(UPDATE_CHAT_MUTATION, {
    onError: error => {
      console.error("Error updating chat:", error);
      notifications.show({
        title: "Error",
        message: error.message || "Failed to update chat model",
        color: "red",
      });
    },
  });

  const updateChat = (link: ChatLink, input: UpdateChatInput, afterUpdate?: () => void) => {
    if (!link) return;

    setChat(prev => (prev?.id === link.id ? ({ ...prev, ...input } as Chat) : prev));
    dispatch(updateChatInState({ ...link, ...input }));
    dispatch(updateFolderChat({ ...link, ...input }));

    if (updateTimeout.current) {
      clearTimeout(updateTimeout.current);
    }

    const request = pick(input, ["title", "description", "modelId", "settings", "tools"]);

    updateTimeout.current = setTimeout(() => {
      if ((request?.settings as any)?.__typename) {
        request.settings = { ...request.settings, __typename: undefined } as ChatSettings;
      }
      if (request.tools) {
        request.tools = request.tools.map(t => ({ ...t, __typename: undefined }));
      }

      updateChatMutation({
        variables: {
          id: link.id,
          input: request,
        },
      });
    }, 500);

    afterUpdate && setTimeout(afterUpdate, 500); // Allow some time for the mutation to complete
  };

  const addChatMessage = (msg: Message, info?: MessageChatInfo) => {
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
    };

    setStreaming(msg.streaming || false);

    if (msg.content) {
      const html = parseMarkdown(msg.content);
      addMessage({ ...msg, html });
    } else {
      addMessage(msg);
    }
  };

  return {
    messages,
    chat,
    messagesLoading,
    loadCompleted,
    streaming,
    removeMessages,
    addChatMessage,
    loadMoreMessages,
    updateChat,
  };
};
