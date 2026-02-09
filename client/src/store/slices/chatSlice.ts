import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { GetChatsResponse, MessageChatInfo, Chat } from "@/types/graphql";
import { logout } from "..";

interface ChatsState {
  chats: Chat[];
  loading: boolean;
  error: string | null;
  next: number | undefined;
  total: number;
}

const initialState: ChatsState = {
  chats: [],
  loading: false,
  error: null,
  next: undefined,
  total: 0,
};

const chatSlice = createSlice({
  name: "chats",
  initialState,
  reducers: {
    setChats(state, action: PayloadAction<GetChatsResponse["getChats"]>) {
      state.chats = action.payload.chats;
      state.total = action.payload.total;
      state.next = action.payload.next;
      state.error = null;
    },
    addChats(state, action: PayloadAction<GetChatsResponse["getChats"]>) {
      const existingChatIds = new Set(state.chats.map((chat: Chat) => chat.id));
      const newChats = action.payload.chats.filter(chat => !existingChatIds.has(chat.id));
      state.chats = [...state.chats, ...newChats];

      state.total = action.payload.total;
      state.next = action.payload.next;
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
    updateChatInfo(
      state,
      action: PayloadAction<
        MessageChatInfo & {
          id: string;
          lastBotMessage?: string;
          lastBotMessageHtml?: string[];
        }
      >
    ) {
      state.chats = state.chats.map(chat => {
        if (chat.id === action.payload.id) {
          return { ...chat, ...action.payload };
        }
        return chat;
      });
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
  extraReducers: builder => {
    builder.addCase(logout, state => {
      state.chats = [];
      state.loading = false;
      state.error = null;
      state.next = undefined;
      state.total = 0;
    });
  },
});

export const { setChats, addChats, addChat, updateChat, updateChatInfo, removeChat, setChatLoading, setChatError } =
  chatSlice.actions;
export default chatSlice.reducer;
