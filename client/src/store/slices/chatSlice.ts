import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User } from "./userSlice";
import { Chat } from "../services/graphql";
import { MessageChatInfo } from "@/types/graphql";
import { logout } from "..";

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
      state.hasMore = false;
      state.total = 0;
    });
  },
});

export const { setChats, addChat, updateChat, updateChatInfo, removeChat, setChatLoading, setChatError } =
  chatSlice.actions;
export default chatSlice.reducer;
