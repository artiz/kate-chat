import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { RootState } from "./index";
import {
  STORAGE_AWS_ACCESS_KEY_ID,
  STORAGE_AWS_PROFILE,
  STORAGE_AWS_REGION,
  STORAGE_AWS_SECRET_ACCESS_KEY,
  STORAGE_OPENAI_API_ADMIN_KEY,
  STORAGE_OPENAI_API_KEY,
  STORAGE_YANDEX_API_FOLDER_ID,
  STORAGE_YANDEX_API_KEY,
} from "./slices/authSlice";

export type GrpahQLErrorResponse = {
  errors: {
    message: string;
    locations: {
      line: number;
      column: number;
    }[];
    extensions: {
      code: string;
      exception?: {
        stacktrace: string[];
      };
    };
    path: string[];
  }[];
  data: unknown;
};

export const ERROR_UNAUTHORIZED = "Unauthorized";
export const ERROR_FORBIDDEN = "Forbidden";
export const ERROR_UNKNOWN = "Unknown error";

export const api = createApi({
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.REACT_APP_API_URL || "http://localhost:4000",
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.token;

      if (token) {
        headers.set("authorization", `Bearer ${token}`);
      }

      headers.set("x-openai-api-key", localStorage.getItem(STORAGE_OPENAI_API_KEY) || "");
      headers.set("x-openai-api-admin-key", localStorage.getItem(STORAGE_OPENAI_API_ADMIN_KEY) || "");
      headers.set("x-aws-region", localStorage.getItem(STORAGE_AWS_REGION) || "");
      headers.set("x-aws-profile", localStorage.getItem(STORAGE_AWS_PROFILE) || "");
      headers.set("x-aws-access-key-id", localStorage.getItem(STORAGE_AWS_ACCESS_KEY_ID) || "");
      headers.set("x-aws-secret-access-key", localStorage.getItem(STORAGE_AWS_SECRET_ACCESS_KEY) || "");
      headers.set("x-yandex-api-key", localStorage.getItem(STORAGE_YANDEX_API_KEY) || "");
      headers.set("x-yandex-api-folder-id", localStorage.getItem(STORAGE_YANDEX_API_FOLDER_ID) || "");

      return headers;
    },
    responseHandler: async response => {
      if (response.url?.match(/\/graphql$/)) {
        const data: GrpahQLErrorResponse = await response.json();

        if (data.errors) {
          const authError = data.errors.find(error => error?.extensions?.code === "UNAUTHENTICATED");
          if (authError) {
            return Promise.reject(ERROR_UNAUTHORIZED);
          }
          const messages = data.errors
            .map(error => error.message)
            .filter(Boolean)
            .join("; ");
          return Promise.reject(messages);
        }

        return data;
      }

      if (response.status === 401) {
        return Promise.reject(ERROR_UNAUTHORIZED);
      }

      if (response.status === 403) {
        return Promise.reject(ERROR_FORBIDDEN);
      }

      if (response.status >= 400) {
        // Handle other error responses
        const error = await response.json();
        return Promise.reject(error.message || ERROR_UNKNOWN);
      }

      return response.json();
    },
  }),
  endpoints: () => ({}),
  tagTypes: ["User", "Chat", "Message", "Model"],
});
