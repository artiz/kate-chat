import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export const STORAGE_AUTH_TOKEN = "auth-token";
export const STORAGE_USER_DATA = "user-data";
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
