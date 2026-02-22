import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { GetChatsResponse, MessageChatInfo, Chat } from "@/types/graphql";
import { logout } from "..";

interface ChatsState {
  chats: Chat[];
  loading: boolean;
  error: string | null;
  next: number | undefined;
  total: number;
  // Pinned chats without a folder (for the sidebar pinned section)
  pinnedChats: Chat[];
  pinnedNext: number | undefined;
  pinnedTotal: number;
}

const initialState: ChatsState = {
  chats: [],
  loading: false,
  error: null,
  next: undefined,
  total: 0,
  pinnedChats: [],
  pinnedNext: undefined,
  pinnedTotal: 0,
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
    setPinnedChats(state, action: PayloadAction<GetChatsResponse["getChats"]>) {
      state.pinnedChats = action.payload.chats;
      state.pinnedTotal = action.payload.total;
      state.pinnedNext = action.payload.next;
    },
    addPinnedChats(state, action: PayloadAction<GetChatsResponse["getChats"]>) {
      const existingIds = new Set(state.pinnedChats.map((c: Chat) => c.id));
      const newChats = action.payload.chats.filter(c => !existingIds.has(c.id));
      state.pinnedChats = [...state.pinnedChats, ...newChats];
      state.pinnedTotal = action.payload.total;
      state.pinnedNext = action.payload.next;
    },
    addChat(state, action: PayloadAction<Chat>) {
      state.chats = [action.payload, ...state.chats];
      state.total += 1;
    },
    updateChat(state, action: PayloadAction<Chat>) {
      const updatedChat = action.payload;
      const existsInChats = state.chats.some(c => c.id === updatedChat.id);
      const existsInPinned = state.pinnedChats.some(c => c.id === updatedChat.id);

      if (updatedChat.isPinned && !updatedChat.folderId) {
        // Belongs in pinnedChats (pinned, no folder)
        state.chats = state.chats.filter(c => c.id !== updatedChat.id);
        if (existsInPinned) {
          state.pinnedChats = state.pinnedChats.map(c => (c.id === updatedChat.id ? { ...c, ...updatedChat } : c));
        } else {
          state.pinnedChats = [updatedChat, ...state.pinnedChats];
        }
      } else if (updatedChat.isPinned && updatedChat.folderId) {
        // In a folder — remove from both (folderSlice handles folder contents)
        state.chats = state.chats.filter(c => c.id !== updatedChat.id);
        state.pinnedChats = state.pinnedChats.filter(c => c.id !== updatedChat.id);
      } else {
        // Not pinned — belongs in chats
        state.pinnedChats = state.pinnedChats.filter(c => c.id !== updatedChat.id);
        if (existsInChats) {
          state.chats = state.chats.map(c => (c.id === updatedChat.id ? { ...c, ...updatedChat } : c));
        } else {
          state.chats = [updatedChat, ...state.chats];
        }
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
      state.pinnedChats = state.pinnedChats.map(chat => {
        if (chat.id === action.payload.id) {
          return { ...chat, ...action.payload };
        }
        return chat;
      });
    },

    removeChat(state, action: PayloadAction<string>) {
      state.chats = state.chats.filter(chat => chat.id !== action.payload);
      state.pinnedChats = state.pinnedChats.filter(chat => chat.id !== action.payload);
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
      state = initialState;
      return initialState;
    });
  },
});

export const {
  setChats,
  addChats,
  setPinnedChats,
  addPinnedChats,
  addChat,
  updateChat,
  updateChatInfo,
  removeChat,
  setChatLoading,
  setChatError,
} = chatSlice.actions;
export default chatSlice.reducer;
