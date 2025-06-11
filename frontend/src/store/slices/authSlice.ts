import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export const STORAGE_AUTH_TOKEN = "auth-token";
export const STORAGE_USER_DATA = "user-data";

export const STORAGE_AWS_BEDROCK_REGION = "aws-bedrock-region";
export const STORAGE_AWS_BEDROCK_PROFILE = "aws-bedrock-profile";
export const STORAGE_AWS_BEDROCK_ACCESS_KEY_ID = "aws-bedrock-access-key-id";
export const STORAGE_AWS_BEDROCK_SECRET_ACCESS_KEY = "aws-bedrock-secret-access-key";
export const STORAGE_OPENAI_API_KEY = "openai-api-key";
export const STORAGE_OPENAI_API_ADMIN_KEY = "openai-api-admin-key";
export const STORAGE_YANDEX_FM_API_KEY = "yandex-fm-api-key";
export const STORAGE_YANDEX_FM_API_FOLDER_ID = "yandex-fm-api-folder-id";
export const STORAGE_S3_ENDPOINT = "s3-endpoint";
export const STORAGE_S3_REGION = "s3-region";
export const STORAGE_S3_ACCESS_KEY_ID = "s3-access-key-id";
export const STORAGE_S3_SECRET_ACCESS_KEY = "s3-secret-access-key";
export const STORAGE_S3_FILES_BUCKET_NAME = "s3-files-bucket-name";

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
