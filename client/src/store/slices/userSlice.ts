import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { User as BaseUser } from "@katechat/ui";

import { logout } from "..";
import { ApplicationConfig } from "@/types/graphql";

export interface UserSettings {
  language?: string;

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

export interface User extends BaseUser {
  role: UserRole;
  defaultSystemPrompt?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
  defaultTopP?: number;
  defaultImagesCount?: number;
  documentsEmbeddingsModelId?: string;
  documentSummarizationModelId?: string;
  authProvider?: string;
  settings?: UserSettings;
  createdAt?: string;
}

export interface UpdateUserInput {
  defaultModelId?: string;
  defaultSystemPrompt?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
  defaultTopP?: number;
  defaultImagesCount?: number;
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
    setAppConfig(state, action: PayloadAction<ApplicationConfig>) {
      state.appConfig = {
        ...action.payload,
        lastUpdate: action.payload.lastUpdate ? action.payload.lastUpdate : Date.now(),
      };
    },
  },
  extraReducers: builder => {
    builder.addCase(logout, state => {
      state = initialState;
      return initialState;
    });
  },
});

export const { setUser, setUserLoading, setUserError, setAppConfig } = userSlice.actions;
export default userSlice.reducer;
