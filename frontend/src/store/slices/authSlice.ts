import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export const STORAGE_AUTH_TOKEN = "auth-token";
export const STORAGE_USER_DATA = "user-data";

export const STORAGE_AWS_REGION = "aws-region";
export const STORAGE_AWS_PROFILE = "aws-profile";
export const STORAGE_AWS_ACCESS_KEY_ID = "aws-access-key-id";
export const STORAGE_AWS_SECRET_ACCESS_KEY = "aws-secret-access-key";
export const STORAGE_OPENAI_API_KEY = "openai-api-key";
export const STORAGE_OPENAI_API_ADMIN_KEY = "openai-api-admin-key";
export const STORAGE_YANDEX_API_KEY = "yandex-api-key";
export const STORAGE_YANDEX_API_FOLDER_ID = "yandex-api-folder-id";

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
}

const currentToken = localStorage.getItem(STORAGE_AUTH_TOKEN);
const initialState: AuthState = {
  token: currentToken,
  isAuthenticated: !!currentToken,
  loading: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    loginStart(state) {
      state.loading = true;
    },
    loginSuccess(state, action: PayloadAction<string>) {
      state.token = action.payload;
      state.isAuthenticated = true;
      state.loading = false;
      localStorage.setItem(STORAGE_AUTH_TOKEN, action.payload);
    },
    loginFailure(state) {
      state.loading = false;
    },
    logout(state) {
      state.token = null;
      state.isAuthenticated = false;
      localStorage.removeItem(STORAGE_AUTH_TOKEN);
      localStorage.removeItem(STORAGE_USER_DATA);
    },
  },
});

export const { loginStart, loginSuccess, loginFailure, logout } = authSlice.actions;
export default authSlice.reducer;
