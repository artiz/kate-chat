import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User } from "./userSlice";

export enum MessageType {
  MESSAGE = "message",
  SYSTEM = "system",
}

export enum MessageRole {
  USER = "user",
  ASSISTANT = "assistant",
  ERROR = "error",
}

export interface Message {
  id: string;
  chatId: string;
  content: string;
  html?: string[];
  role: MessageRole;
  modelId?: string;
  modelName?: string;
  user?: User;
  createdAt: string;
  streaming?: boolean;
  linkedToMessageId?: string;
  linkedMessages?: Message[];
  metadata?: {
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
    };
  };
}

export interface Chat {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
  modelId?: string;
  isPristine?: boolean;
  isPinned?: boolean;
  messagesCount: number;
  lastBotMessage?: string;
  lastBotMessageId?: string;
  lastBotMessageHtml?: string[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

interface ChatsState {
  chats: Chat[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  total: number;
}

const initialState: ChatsState = {
  chats: [],
  loading: false,
  error: null,
  hasMore: false,
  total: 0,
};

const chatSlice = createSlice({
  name: "chats",
  initialState,
  reducers: {
    setChats(state, action: PayloadAction<{ chats: Chat[]; total: number; hasMore: boolean }>) {
      state.chats = action.payload.chats;
      state.total = action.payload.total;
      state.hasMore = action.payload.hasMore;
      state.error = null;
    },
    addChat(state, action: PayloadAction<Chat>) {
      state.chats = [action.payload, ...state.chats];
      state.total += 1;
    },
    updateChat(state, action: PayloadAction<Chat>) {
      let found = false;
      state.chats = state.chats.map(chat => {
        if (chat.id === action.payload.id) {
          found = true;
          return { ...chat, ...action.payload };
        }
        return chat;
      });

      if (!found && action.payload.id) {
        state.chats.push(action.payload);
        state.total += 1;
      }
    },
    removeChat(state, action: PayloadAction<string>) {
      state.chats = state.chats.filter(chat => chat.id !== action.payload);
    },

    setChatLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setChatError(state, action: PayloadAction<string>) {
      state.error = action.payload;
      state.loading = false;
    },
  },
});

export const { setChats, addChat, updateChat, removeChat, setChatLoading, setChatError } = chatSlice.actions;
export default chatSlice.reducer;
