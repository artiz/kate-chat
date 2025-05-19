import { gql } from '@apollo/client';
import { api } from '../api';
import { User } from '../slices/userSlice';
import { Model } from '../slices/modelSlice';
import { Chat, Message } from '../slices/chatSlice';

// Define GraphQL types
interface CurrentUserResponse {
  currentUser: User;
}

interface GetModelsResponse {
  getModels: {
    models: Model[];
  };
}

interface GetChatsResponse {
  getChats: {
    chats: Chat[];
    total: number;
    hasMore: boolean;
  };
}

interface GetChatMessagesResponse {
  getChatMessages: {
    messages: Message[];
    total: number;
    hasMore: boolean;
  };
}

// Create the API endpoints
export const graphqlApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // User queries
    getCurrentUser: builder.query<User, void>({
      query: () => ({
        url: '/graphql',
        method: 'POST',
        body: {
          query: `
            query CurrentUser {
              currentUser {
                id
                email
                firstName
                lastName
              }
            }
          `
        }
      }),
      transformResponse: (response: CurrentUserResponse) => response.currentUser,
      providesTags: ['User'],
    }),

    // Models queries
    getModels: builder.query<Model[], void>({
      query: () => ({
        url: '/graphql',
        method: 'POST',
        body: {
          query: `
            query GetModels {
              getModels {
                models {
                  id
                  name
                  provider
                }
              }
            }
          `
        }
      }),
      transformResponse: (response: GetModelsResponse) => response.getModels.models,
      providesTags: ['Model'],
    }),

    // Chat queries
    getChats: builder.query<{ chats: Chat[], total: number, hasMore: boolean }, { limit: number, offset: number }>({
      query: ({ limit, offset }) => ({
        url: '/graphql',
        method: 'POST',
        body: {
          query: `
            query GetUserChats($input: GetChatsInput!) {
              getChats(input: $input) {
                chats {
                  id
                  title
                  updatedAt
                }
                total
                hasMore
              }
            }
          `,
          variables: {
            input: { limit, offset },
          }
        }
      }),
      transformResponse: (response: GetChatsResponse) => response.getChats,
      providesTags: (result) =>
        result
          ? [
              ...result.chats.map(({ id }) => ({ type: 'Chat' as const, id })),
              { type: 'Chat', id: 'LIST' },
            ]
          : [{ type: 'Chat', id: 'LIST' }],
    }),

    // Initial data load - combines user, models, and chats
    getInitialData: builder.query<
      {
        user: User;
        models: Model[];
        chats: {
          chats: Chat[];
          total: number;
          hasMore: boolean;
        }
      },
      void
    >({
      query: () => ({
        url: '/graphql',
        method: 'POST',
        body: {
          query: `
            query GetInitialData {
              currentUser {
                id
                email
                firstName
                lastName
              }
              getModels {
                models {
                  id
                  name
                  provider 
                  {
                    id
                    name
                  }
                }
              }
              getChats(input: { limit: 20, offset: 0 }) {
                chats {
                  id
                  title
                  updatedAt
                }
                total
                hasMore
              }
            }
          `
        }
      }),
      transformResponse: (response: any) => {
        const { currentUser, getModels, getChats } = response.data;
        return {
            user: currentUser,
            models: getModels?.models || [],
            chats: getChats?.chats || [],
        };
      },
      providesTags: ['User', 'Model', { type: 'Chat', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetCurrentUserQuery,
  useGetModelsQuery,
  useGetChatsQuery,
  useGetInitialDataQuery,
} = graphqlApi;
