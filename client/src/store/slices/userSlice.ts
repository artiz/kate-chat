import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ApplicationConfig } from "../services/graphql";

export interface UserSettings {
  s3Endpoint?: string;
  s3Region?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3FilesBucketName?: string;

  awsBedrockRegion?: string;
  awsBedrockProfile?: string;
  awsBedrockAccessKeyId?: string;
  awsBedrockSecretAccessKey?: string;
  openaiApiKey?: string;
  openaiApiAdminKey?: string;
  yandexFmApiKey?: string;
  yandexFmApiFolderId?: string;
}

export enum UserRole {
  USER = "user",
  ADMIN = "admin",
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  defaultModelId?: string;
  defaultSystemPrompt?: string;
  documentsEmbeddingsModelId?: string;
  documentSummarizationModelId?: string;

  githubId?: string;
  googleId?: string;
  avatarUrl?: string;
  settings?: UserSettings;
  createdAt?: string;
}

export interface UpdateUserInput {
  defaultModelId?: string;
  defaultSystemPrompt?: string;
  documentsEmbeddingsModelId?: string;
  documentSummarizationModelId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  settings?: UserSettings;
}

interface UserState {
  currentUser: User | null;
  loading: boolean;
  error?: string;
  appConfig?: ApplicationConfig;
}

const initialState: UserState = {
  currentUser: null,
  loading: false,
};

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<User>) {
      state.currentUser = action.payload;
      state.error = undefined;
    },
    setUserLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setUserError(state, action: PayloadAction<string>) {
      state.error = action.payload;
      state.loading = false;
    },
    clearUser(state) {
      state.currentUser = null;
    },
    setAppConfig(state, action: PayloadAction<ApplicationConfig>) {
      state.appConfig = {
        ...action.payload,
        lastUpdate: action.payload.lastUpdate ? action.payload.lastUpdate : Date.now(),
      };
    },
  },
});

export const { setUser, setUserLoading, setUserError, clearUser, setAppConfig } = userSlice.actions;
export default userSlice.reducer;
