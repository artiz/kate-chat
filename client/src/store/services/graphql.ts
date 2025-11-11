import { parseMarkdown } from "@katechat/ui";
import { api } from "../api";
import { User } from "../slices/userSlice";

import {
  ApplicationConfig,
  Chat,
  CurrentUserResponse,
  GetChatsResponse,
  GetInitialDataResponse,
  GetModelsResponse,
  Model,
  ProviderInfo,
} from "@/types/graphql";
import { BASE_MODEL_FRAGMENT, FULL_USER_FRAGMENT } from "./graphql.queries";
import { CHAT_PAGE_SIZE } from "@/lib/config";

export const handleError = (error: { status?: string | number }, meta: unknown) => {
  if (error?.status === "FETCH_ERROR") {
    setTimeout(() => {
      window.location.reload();
    }, 1000);

    // Backend is unreachable
    return {
      error: "Unable to connect to the server. Please try again later.",
    };
  }
  return error;
};

// Create the API endpoints
export const graphqlApi = api.injectEndpoints({
  endpoints: builder => ({
    // User queries
    getCurrentUser: builder.query<User, void>({
      query: () => ({
        url: "/graphql",
        method: "POST",
        body: {
          query: `
            query CurrentUser {
              currentUser {
                ...FullUser
              }
            }
          `,
        },
      }),
      transformResponse: (response: CurrentUserResponse) => response.currentUser,
      transformErrorResponse: handleError,
      providesTags: ["User"],
    }),

    // Models queries
    getModels: builder.query<Model[], { reload?: boolean }>({
      query: ({ reload = false }: { reload?: boolean }) => ({
        url: "/graphql",
        method: "POST",
        body: {
          variables: { reload },
          query: `
            query GetModels($reload: Boolean) {
              getModels(reload: $reload) {
                models {
                  id
                  name
                  modelId
                  provider
                  isActive
                  apiProvider
                }
                providers {
                  id
                  name
                  isConnected
                  costsInfoAvailable
                  details {
                    key
                    value
                  }
                }
              }
            }
          `,
        },
      }),
      transformResponse: (response: GetModelsResponse) => response.getModels.models,
      transformErrorResponse: handleError,
      providesTags: ["Model"],
    }),

    // Chat queries
    getChats: builder.query<GetChatsResponse["getChats"], { limit: number; offset: number }>({
      query: ({ limit, offset }) => ({
        url: "/graphql",
        method: "POST",
        body: {
          query: `
            query GetUserChats($input: GetChatsInput!) {
              getChats(input: $input) {
                chats {
                  id
                  title
                  isPristine
                  messagesCount
                  updatedAt
                }
                total
                next
              }
            }
          `,
          variables: {
            input: { limit, offset },
          },
        },
      }),
      transformResponse: (response: GetChatsResponse) => response.getChats,
      transformErrorResponse: handleError,
      providesTags: result =>
        result
          ? [...result.chats.map(({ id }) => ({ type: "Chat" as const, id })), { type: "Chat", id: "LIST" }]
          : [{ type: "Chat", id: "LIST" }],
    }),

    // Initial data load - combines user, models, and chats
    getInitialData: builder.query<
      {
        appConfig: ApplicationConfig;
        models: Model[];
        providers: ProviderInfo[];
        chats: {
          chats: Chat[];
          total: number;
          next: number | undefined;
        };
        pinnedChats: {
          chats: Chat[];
          total: number;
          next: number | undefined;
        };
      },
      void
    >({
      query: () => ({
        url: "/graphql",
        method: "POST",
        body: {
          query: `
            query GetInitialData {
              models: getModels {
                models {
                    ...BaseModel
                }
                providers {
                  id
                  name
                  isConnected
                  costsInfoAvailable
                  details {
                    key
                    value
                  }
                }
              }
              chats: getChats(input: { limit: ${CHAT_PAGE_SIZE} }) {
                chats {
                  id
                  title
                  isPristine
                  isPinned
                  modelId
                  messagesCount
                  updatedAt
                  lastBotMessage
                  lastBotMessageId
                }
                total
                next
              }
              
              pinnedChats: getChats(input: { pinned: true }) {
                chats {
                  id
                  title
                  isPristine
                  isPinned
                  modelId
                  messagesCount
                  updatedAt
                  lastBotMessage
                  lastBotMessageId
                }
              }

              appConfig {
                currentUser {
                  ...FullUser
                }
                token
                demoMode
                s3Connected
                ragSupported
                ragEnabled
                maxChats
                maxChatMessages
                maxImages
              }
            }

            ${FULL_USER_FRAGMENT}
            ${BASE_MODEL_FRAGMENT}
          `,
        },
      }),

      transformResponse: async (response: GetInitialDataResponse) => {
        const {
          models,
          chats = {
            chats: [],
            total: 0,
            next: undefined,
          },
          pinnedChats = {
            chats: [],
            total: 0,
            next: undefined,
          },
          appConfig,
        } = response.data || {};

        for (const chat of pinnedChats.chats) {
          if (chat.lastBotMessage) {
            chat.lastBotMessageHtml = parseMarkdown(chat.lastBotMessage);
          }
        }

        for (const chat of chats.chats) {
          if (chat.lastBotMessage) {
            chat.lastBotMessageHtml = parseMarkdown(chat.lastBotMessage);
          }
        }

        return {
          models: models?.models || [],
          providers: models?.providers || [],
          chats,
          pinnedChats,
          appConfig,
        };
      },
      transformErrorResponse: handleError,
      providesTags: ["User", "Model", { type: "Chat", id: "LIST" }],
    }),
  }),
});

export const { useGetCurrentUserQuery, useGetModelsQuery, useGetChatsQuery, useGetInitialDataQuery } = graphqlApi;
