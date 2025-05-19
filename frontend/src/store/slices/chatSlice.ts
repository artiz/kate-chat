import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Chat {
  id: string;
  title: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  content: string;
  role: 'user' | 'assistant';
  modelId?: string;
  modelName?: string;
  createdAt: string;
}

interface ChatsState {
  chats: Chat[];
  currentChat: Chat | null;
  messages: Message[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  total: number;
}

const initialState: ChatsState = {
  chats: [],
  currentChat: null,
  messages: [],
  loading: false,
  error: null,
  hasMore: false,
  total: 0,
};

const chatSlice = createSlice({
  name: 'chats',
  initialState,
  reducers: {
    setChats(state, action: PayloadAction<{ chats: Chat[], total: number, hasMore: boolean }>) {
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
      state.chats = state.chats.map(chat => 
        chat.id === action.payload.id ? action.payload : chat
      );
    },
    setCurrentChat(state, action: PayloadAction<Chat | null>) {
      state.currentChat = action.payload;
    },
    setMessages(state, action: PayloadAction<Message[]>) {
      state.messages = action.payload;
    },
    addMessage(state, action: PayloadAction<Message>) {
      state.messages = [...state.messages, action.payload];
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

export const { 
  setChats, 
  addChat, 
  updateChat,
  setCurrentChat, 
  setMessages, 
  addMessage,
  setChatLoading, 
  setChatError 
} = chatSlice.actions;
export default chatSlice.reducer;
