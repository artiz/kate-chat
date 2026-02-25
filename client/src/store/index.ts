import { configureStore, createAction, Middleware } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { api } from "./api";
import authReducer from "./slices/authSlice";
import userReducer from "./slices/userSlice";
import modelReducer from "./slices/modelSlice";
import chatReducer from "./slices/chatSlice";
import folderReducer from "./slices/folderSlice";
import { Chat } from "@/types/graphql";
import { useMemo } from "react";
import { cpSync } from "fs";

export const logout = createAction("logout");

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    auth: authReducer,
    user: userReducer,
    models: modelReducer,
    chats: chatReducer,
    folders: folderReducer,
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware().concat(api.middleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export interface ChatLink {
  id: string;
  folderId?: string;
  isPinned?: boolean;
}

export const useChat = (link: ChatLink): Chat | undefined => {
  const { chats, pinnedChats } = useAppSelector(state => state.chats);
  const folderChats = useAppSelector(state => state.folders.folderChats);
  const { id, folderId, isPinned } = link;

  const chat = useMemo(() => {
    if (isPinned) {
      let chat = pinnedChats.find(c => c.id === id);
      if (chat) return chat;

      if (folderId) {
        chat = folderChats[folderId].chats.find(c => c.id === id);
      } else {
        for (const folderId in folderChats) {
          chat = folderChats[folderId].chats.find(c => c.id === id);
          if (chat) return chat;
        }
      }

      return chat;
    }

    return chats.find(c => c.id === id);
  }, [id, chats, pinnedChats, folderChats]);

  return chat;
};
