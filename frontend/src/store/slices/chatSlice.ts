import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface Chat {
  id: string;
  title: string;
  updatedAt: string;
  isPristine?: boolean;
}

export enum MessageType {
  MESSAGE = "message",
  SYSTEM = "system",
}

export enum MessageRole {
    USER = "user",
    ASSISTANT = "assistant",
  }

export interface Message {
  id: string;
  chatId: string;
  content: string;
  html?: string[];
  role: MessageRole;
  modelId?: string;
  modelName?: string;
  createdAt: string;
}

interface ChatsState {
  chats: Chat[];
  currentChat: Chat | null;
  messages: Message[];
  messagesMap: Record<string, number>;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  total: number;
}

const initialState: ChatsState = {
  chats: [],
  currentChat: null,
  messages: [],
  messagesMap: {},
  loading: false,
  error: null,
  hasMore: false,
  total: 0,
};

const loadMessagesMap = (messages: Message[]) => {
  return messages.reduce(
    (map, message, index) => {
      map[message.id] = index;
      return map;
    },
    {} as Record<string, number>
  );
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
      state.chats = state.chats.map(chat => (chat.id === action.payload.id ? action.payload : chat));
    },
    setCurrentChat(state, action: PayloadAction<Chat | null>) {
      state.currentChat = action.payload;
    },
    setMessages(state, action: PayloadAction<Message[]>) {
      state.messages = action.payload;
      state.messagesMap = loadMessagesMap(action.payload);
    },
    addMessage(state, action: PayloadAction<Message>) {
      const message = action.payload;
      const pos = state.messagesMap[message.id];
      if (pos !== undefined) {
        state.messages[pos] = message;
      } else {
        state.messagesMap[message.id] = state.messages.length;
        state.messages.push(message);
      }
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

export const { setChats, addChat, updateChat, setCurrentChat, setMessages, addMessage, setChatLoading, setChatError } =
  chatSlice.actions;
export default chatSlice.reducer;
