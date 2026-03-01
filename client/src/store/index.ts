import { configureStore, createAction, Middleware } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { api } from "./api";
import authReducer from "./slices/authSlice";
import userReducer from "./slices/userSlice";
import modelReducer from "./slices/modelSlice";
import chatReducer from "./slices/chatSlice";
import folderReducer from "./slices/folderSlice";

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
