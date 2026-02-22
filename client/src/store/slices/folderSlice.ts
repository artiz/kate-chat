import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Chat, ChatFolder } from "@/types/graphql";
import { logout } from "..";
import { init } from "i18next";

interface FolderExpandedData {
  subfolders: ChatFolder[];
  chats: Chat[];
  next?: number;
  total?: number;
  loading: boolean;
  initialLoaded?: boolean;
}

interface FoldersState {
  folders: ChatFolder[]; // top-level folders
  folderChats: Record<string, FolderExpandedData>;
}

const initialState: FoldersState = {
  folders: [],
  folderChats: {},
};

const folderSlice = createSlice({
  name: "folders",
  initialState,
  reducers: {
    setFolders(state, action: PayloadAction<ChatFolder[]>) {
      state.folders = action.payload;
    },
    addFolder(state, action: PayloadAction<ChatFolder>) {
      if (!action.payload.parentId) {
        // Top-level folder
        state.folders = [...state.folders, action.payload];
      } else {
        // Add as a subfolder in the parent's expanded data
        const parentId = action.payload.topParentId ?? action.payload.parentId;
        if (state.folderChats[parentId]) {
          state.folderChats[parentId].subfolders = [...state.folderChats[parentId].subfolders, action.payload];
        }
        // Also add to direct parent's expanded data if different
        if (action.payload.parentId !== parentId && state.folderChats[action.payload.parentId]) {
          state.folderChats[action.payload.parentId].subfolders = [
            ...state.folderChats[action.payload.parentId].subfolders,
            action.payload,
          ];
        }
      }
    },
    updateFolder(state, action: PayloadAction<ChatFolder>) {
      state.folders = state.folders.map(f => (f.id === action.payload.id ? { ...f, ...action.payload } : f));
      // Update in expanded data
      for (const key of Object.keys(state.folderChats)) {
        state.folderChats[key].subfolders = state.folderChats[key].subfolders.map(f =>
          f.id === action.payload.id ? { ...f, ...action.payload } : f
        );
      }
    },
    removeFolder(state, action: PayloadAction<string>) {
      state.folders = state.folders.filter(f => f.id !== action.payload);
      delete state.folderChats[action.payload];
      // Remove from subfolders in expanded data
      for (const key of Object.keys(state.folderChats)) {
        state.folderChats[key].subfolders = state.folderChats[key].subfolders.filter(f => f.id !== action.payload);
      }
    },
    setFolderLoading(state, action: PayloadAction<{ folderId: string; loading: boolean }>) {
      const { folderId, loading } = action.payload;
      if (!state.folderChats[folderId]) {
        state.folderChats[folderId] = { subfolders: [], chats: [], loading };
      } else {
        state.folderChats[folderId].loading = loading;
      }
    },
    setFolderContents(
      state,
      action: PayloadAction<
        FolderExpandedData & {
          folderId: string;
        }
      >
    ) {
      const { folderId, subfolders, chats, next, total, initialLoaded } = action.payload;
      state.folderChats[folderId] = { subfolders, chats, next, total, loading: false, initialLoaded };
    },
    appendFolderChats(
      state,
      action: PayloadAction<{ folderId: string; chats: Chat[]; next?: number; total?: number }>
    ) {
      const { folderId, chats, next, total } = action.payload;
      if (state.folderChats[folderId]) {
        const existingIds = new Set(state.folderChats[folderId].chats.map(c => c.id));
        const newChats = chats.filter(c => !existingIds.has(c.id));
        state.folderChats[folderId].chats = [...state.folderChats[folderId].chats, ...newChats];
        state.folderChats[folderId].next = next;
        if (total !== undefined) state.folderChats[folderId].total = total;
      }
    },
    updateFolderChat(state, action: PayloadAction<Chat>) {
      const chat = action.payload;
      if (!chat.folderId) return; // Only update if chat has a folder

      if (state.folderChats[chat.folderId]) {
        const folder = state.folderChats[chat.folderId];
        if (folder.chats.some(c => c.id === chat.id)) {
          folder.chats = folder.chats.map(c => (c.id === chat.id ? { ...c, ...chat } : c));
        } else {
          // If chat's folderId changed and it now belongs in this folder, add it
          folder.chats = [...folder.chats, chat];
        }
      } else {
        state.folderChats[chat.folderId] = {
          subfolders: [],
          chats: [chat],
          loading: false,
        };
      }
    },
    removeFolderChat(state, action: PayloadAction<string>) {
      for (const key of Object.keys(state.folderChats)) {
        state.folderChats[key].chats = state.folderChats[key].chats.filter(c => c.id !== action.payload);
      }
    },
  },
  extraReducers: builder => {
    builder.addCase(logout, () => initialState);
  },
});

export const {
  setFolders,
  addFolder,
  updateFolder,
  removeFolder,
  setFolderLoading,
  setFolderContents,
  appendFolderChats,
  updateFolderChat,
  removeFolderChat,
} = folderSlice.actions;
export default folderSlice.reducer;
