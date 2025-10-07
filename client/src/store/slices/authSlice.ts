import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { logout } from "..";

export const STORAGE_AUTH_TOKEN = "auth-token";

export const STORAGE_AWS_BEDROCK_REGION = "aws-bedrock-region";
export const STORAGE_AWS_BEDROCK_PROFILE = "aws-bedrock-profile";
export const STORAGE_AWS_BEDROCK_ACCESS_KEY_ID = "aws-bedrock-access-key-id";
export const STORAGE_AWS_BEDROCK_SECRET_ACCESS_KEY = "aws-bedrock-secret-access-key";
export const STORAGE_OPENAI_API_KEY = "openai-api-key";
export const STORAGE_OPENAI_API_ADMIN_KEY = "openai-api-admin-key";
export const STORAGE_YANDEX_FM_API_KEY = "yandex-fm-api-key";
export const STORAGE_YANDEX_FM_API_FOLDER = "yandex-fm-api-folder";

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
      document.cookie = `${STORAGE_AUTH_TOKEN}=${action.payload || ""}; path=/`;
    },
    loginFailure(state) {
      state.loading = false;
    },
  },
  extraReducers: builder => {
    builder.addCase(logout, state => {
      state.token = null;
      state.isAuthenticated = false;
      state.loading = false;
      document.cookie = `${STORAGE_AUTH_TOKEN}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      localStorage.removeItem(STORAGE_AUTH_TOKEN);
    });
  },
});

export const { loginStart, loginSuccess, loginFailure } = authSlice.actions;
export default authSlice.reducer;
