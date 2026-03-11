import { configureStore, createAction, Middleware } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import { api } from "./api";
import authReducer from "./slices/authSlice";
import userReducer, { User } from "./slices/userSlice";
import modelReducer from "./slices/modelSlice";
import chatReducer from "./slices/chatSlice";
import folderReducer from "./slices/folderSlice";

export const logout = createAction("logout");

const logoutMiddleware: Middleware = storeApi => next => action => {
  const result = next(action);
  if (logout.match(action)) {
    storeApi.dispatch(api.util.resetApiState());
  }
  return result;
};

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    auth: authReducer,
    user: userReducer,
    models: modelReducer,
    chats: chatReducer,
    folders: folderReducer,
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware().concat(api.middleware, logoutMiddleware),
});

setupListeners(store.dispatch);

export const STORAGE_RETURN_URL_KEY = "return-url";

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export function formatStorageKey(key: string, userId?: string | null): string {
  return `${userId || "user"}-${key}`;
}

export function writeStorageValue(key: string, value: string, userId?: string | null, useLocalStorage = true) {
  (useLocalStorage ? localStorage : sessionStorage).setItem(formatStorageKey(key, userId), value);
}

export function getStorageValue(key: string, userId?: string | null, useLocalStorage = true): string | undefined {
  return (
    (useLocalStorage ? localStorage : sessionStorage).getItem(formatStorageKey(key, userId)) ||
    (useLocalStorage ? localStorage : sessionStorage).getItem(formatStorageKey(key)) ||
    undefined
  );
}

export function removeStorageValue(key: string, userId?: string | null, useLocalStorage = true) {
  (useLocalStorage ? localStorage : sessionStorage).removeItem(formatStorageKey(key, userId));
}
