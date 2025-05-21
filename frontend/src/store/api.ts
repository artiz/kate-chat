import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { RootState } from "./index";

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
    }[],
    data: unknown;
}

export const ERROR_UNAUTHORIZED = "Unauthorized"
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

      return headers;
    },
    responseHandler: async (response) => {
        
        if (response.url?.match(/\/graphql$/)) {
            const data: GrpahQLErrorResponse = await response.json();
            
            if (data.errors) {
                const authError = data.errors.find(
                    (error) => error.extensions.code === "UNAUTHENTICATED"
                );
                if (authError) {
                    return Promise.reject(ERROR_UNAUTHORIZED);
                }
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
    }
  }),
  endpoints: () => ({}),
  tagTypes: ["User", "Chat", "Message", "Model"],
});
