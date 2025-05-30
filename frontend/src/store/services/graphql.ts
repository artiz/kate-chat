import { gql } from "@apollo/client";
import { api } from "../api";
import { User } from "../slices/userSlice";
import { Model, ProviderInfo } from "../slices/modelSlice";
import { Chat, Message } from "../slices/chatSlice";
import { parseMarkdown } from "@/lib/services/MarkdownParser";

// Define GraphQL mutations for auth
export const REGISTER_MUTATION = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      token
      user {
        id
        email
        firstName
        lastName
        defaultModelId
        defaultSystemPrompt
      }
    }
  }
`;

export const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      token
      user {
        id
        email
        firstName
        lastName
        defaultModelId
        defaultSystemPrompt
      }
    }
  }
`;

export const UPDATE_CHAT_MUTATION = gql`
  mutation UpdateChat($id: ID!, $input: UpdateChatInput!) {
    updateChat(id: $id, input: $input) {
      id
      title
      description
      modelId
      isPristine
      temperature
      maxTokens
      topP
      updatedAt
    }
  }
`;

export const DELETE_CHAT_MUTATION = gql`
  mutation DeleteChat($id: ID!) {
    deleteChat(id: $id)
  }
`;

export const CREATE_CHAT_MUTATION = gql`
  mutation CreateChat($input: CreateChatInput!) {
    createChat(input: $input) {
      id
      title
      description
      modelId
      isPristine
      createdAt
    }
  }
`;

export const RELOAD_MODELS_MUTATION = gql`
  mutation ReloadModels {
    reloadModels {
      models {
        id
        name
        modelId
        apiProvider
        provider
        isActive
        supportsImageOut
        supportsTextOut
      }
      providers {
        name
        isConnected
        costsInfoAvailable
        details {
          key
          value
        }
      }
      error
    }
  }
`;

export const UPDATE_MODEL_STATUS_MUTATION = gql`
  mutation UpdateModelStatus($input: UpdateModelStatusInput!) {
    updateModelStatus(input: $input) {
      id
      name
      modelId
      provider
      isActive
    }
  }
`;

export const TEST_MODEL_MUTATION = gql`
  mutation TestModel($input: TestModelInput!) {
    testModel(input: $input) {
      content
      modelId
    }
  }
`;

// Query to find a pristine chat
export const FIND_PRISTINE_CHAT = gql`
  query FindPristineChat {
    getChats(input: { limit: 10, offset: 0 }) {
      chats {
        id
        title
        isPristine
        modelId
      }
    }
  }
`;

export const GET_COSTS_QUERY = gql`
  query GetCosts($input: GetCostsInput!) {
    getCosts(input: $input) {
      start
      end
      error
      costs {
        name
        type
        amounts {
          amount
          currency
        }
      }
    }
  }
`;

// Define GraphQL types
interface CurrentUserResponse {
  currentUser: User;
}
interface GetModelsResponse {
  getModels: {
    models: Model[];
    providers?: ProviderInfo[];
  };
}

interface GetChatsResponse {
  getChats: {
    chats: Chat[];
    total: number;
    hasMore: boolean;
  };
}

export interface GetChatMessagesResponse {
  getChatMessages: {
    chat: Chat;
    messages: Message[];
    total: number;
    hasMore: boolean;
  };
}

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
                id
                email
                firstName
                lastName
                defaultModelId
                defaultSystemPrompt
              }
            }
          `,
        },
      }),
      transformResponse: (response: CurrentUserResponse) => response.currentUser,
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
      providesTags: ["Model"],
    }),

    // Chat queries
    getChats: builder.query<{ chats: Chat[]; total: number; hasMore: boolean }, { limit: number; offset: number }>({
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
                  updatedAt
                }
                total
                hasMore
              }
            }
          `,
          variables: {
            input: { limit, offset },
          },
        },
      }),
      transformResponse: (response: GetChatsResponse) => response.getChats,
      providesTags: result =>
        result
          ? [...result.chats.map(({ id }) => ({ type: "Chat" as const, id })), { type: "Chat", id: "LIST" }]
          : [{ type: "Chat", id: "LIST" }],
    }),

    // Initial data load - combines user, models, and chats
    getInitialData: builder.query<
      {
        user: User;
        models: Model[];
        providers: ProviderInfo[];
        chats: {
          chats: Chat[];
          total: number;
          hasMore: boolean;
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
              currentUser {
                id
                email
                firstName
                lastName
                createdAt
                defaultModelId
                defaultSystemPrompt
              }
              getModels {
                models {
                  id
                  name
                  modelId
                  provider
                  apiProvider
                  isActive
                  supportsImageOut
                  supportsTextOut
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
              getChats(input: { limit: 20, offset: 0 }) {
                chats {
                  id
                  title
                  isPristine
                  updatedAt
                  messagesCount
                  lastBotMessage
                }
                total
                hasMore
              }
            }
          `,
        },
      }),

      transformResponse: async (response: GetInitialDataResponse) => {
        const { currentUser, getModels, getChats } = response.data || {};
        const chats = getChats || {
          chats: [],
          total: 0,
          hasMore: false,
        };

        for (const chat of chats.chats) {
          if (chat.lastBotMessage) {
            chat.lastBotMessageHtml = await parseMarkdown(chat.lastBotMessage);
          }
        }

        return {
          user: currentUser,
          models: getModels?.models || [],
          providers: getModels?.providers || [],
          chats,
        };
      },
      providesTags: ["User", "Model", { type: "Chat", id: "LIST" }],
    }),
  }),
});

interface GetInitialDataResponse {
  data: {
    currentUser: User;
    getModels: {
      models: Model[];
      providers?: ProviderInfo[];
    };
    getChats: {
      chats: Chat[];
      total: number;
      hasMore: boolean;
    };
  };
}

export const { useGetCurrentUserQuery, useGetModelsQuery, useGetChatsQuery, useGetInitialDataQuery } = graphqlApi;
