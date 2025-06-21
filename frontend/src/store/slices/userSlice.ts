import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ApplicationConfig } from "../services/graphql";
import { set } from "lodash";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  defaultModelId?: string;
  defaultSystemPrompt?: string;
  githubId?: string;
    googleId?: string;
    avatarUrl?: string;
}

interface UserState {
  currentUser: User | null;
  loading: boolean;
  error: string | null;
  appConfig: ApplicationConfig | null;
}

const initialState: UserState = {
  currentUser: null,
  loading: false,
  error: null,
  appConfig: null,
};

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<User>) {
      state.currentUser = action.payload;
      state.error = null;
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
      state.appConfig = action.payload;
    },
  },
});

export const { setUser, setUserLoading, setUserError, clearUser, setAppConfig } = userSlice.actions;
export default userSlice.reducer;
