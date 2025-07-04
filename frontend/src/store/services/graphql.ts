import { gql } from "@apollo/client";
import { api } from "../api";
import { User } from "../slices/userSlice";
import { Model, ProviderInfo } from "../slices/modelSlice";
import { Chat, Message, MessageRole } from "../slices/chatSlice";
import { parseMarkdown } from "@/lib/services/MarkdownParser";

export const BASE_MODEL_FRAGMENT = `
    fragment BaseModel on GqlModel {
      id
      name
      modelId
      provider
      apiProvider
      isActive
      supportsImageIn
      supportsTextIn
      supportsEmbeddingsIn
      supportsImageOut
      supportsTextOut
      supportsEmbeddingsOut
    }
`;

export const FULL_USER_FRAGMENT = `
    fragment FullUser on User {
      id
      email
      firstName
      lastName
      createdAt
      defaultModelId
      defaultSystemPrompt
      googleId
      githubId
      avatarUrl
      role
      settings {
        s3Endpoint
        s3Region
        s3AccessKeyId
        s3SecretAccessKey
        s3FilesBucketName

        awsBedrockAccessKeyId
        awsBedrockProfile
        awsBedrockRegion
        awsBedrockSecretAccessKey
        openaiApiAdminKey
        openaiApiKey
        yandexFmApiFolderId
        yandexFmApiKey
      }
    }
`;

export const BASE_MESSAGE_FRAGMENT = `
    fragment BaseMessage on Message {
      id
      content
      role
      createdAt
      modelId
      modelName
      user {
        lastName
        firstName
        avatarUrl
      }
      linkedToMessageId
      metadata {
        usage {
          inputTokens
          outputTokens
        }
      }
    }
`;

export const REGISTER_MUTATION = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      token
      user {
        ...FullUser
      }
    }
  }
`;

export const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      token
      user {
        ...FullUser
      }
    }
  }
`;

export const UPDATE_USER_MUTATION = gql`
  mutation UpdateUser($input: UpdateUserInput!) {
    updateUser(input: $input) {
      ...FullUser
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
      messagesCount
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

export const DELETE_MESSAGE_MUTATION = gql`
  mutation DeleteMessage($id: ID!, $deleteFollowing: Boolean) {
    deleteMessage(id: $id, deleteFollowing: $deleteFollowing) {
      messages {
        id
        linkedToMessageId
      }
    }
  }
`;

export const SWITCH_MODEL_MUTATION = gql`
  mutation SwitchModel($messageId: ID!, $modelId: String!) {
    switchModel(messageId: $messageId, modelId: $modelId) {
      message {
        id
        content
        role
        createdAt
        modelId
        modelName
        user {
          lastName
          firstName
        }
      }
      error
    }
  }
`;

export const CALL_OTHERS_MUTATION = gql`
  mutation CallOther($input: CallOtherInput!) {
    callOther(input: $input) {
      message {
        id
        content
        role
        createdAt
        modelId
        modelName
        linkedToMessageId
        user {
          lastName
          firstName
        }
      }
      error
    }
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

export const GET_CHAT_MESSAGES = gql`
  query GetChatMessages($input: GetMessagesInput!) {
    getChatMessages(input: $input) {
      messages {
        ...BaseMessage
        linkedMessages {
          ...BaseMessage
        }
      }
      total
      hasMore
      chat {
        id
        title
        modelId
        isPristine
        messagesCount
        createdAt
        updatedAt
        temperature
        maxTokens
        topP
      }
    }
  }
`;

export const GET_ALL_IMAGES = gql`
  query GetAllImages($input: GetImagesInput!) {
    getAllImages(input: $input) {
      images {
        id
        fileName
        fileUrl
        mimeType
        role
        createdAt
        message {
          id
          content
        }
        chat {
          id
          title
        }
      }
      total
      nextPage
      error
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

export interface LibraryImage {
  id: string;
  fileName: string;
  fileUrl: string;
  role: MessageRole;
  mimeType: string;
  createdAt: string;
  message: {
    id: string;
    content: string;
  };
  chat: {
    id: string;
    title: string;
  };
}

export interface GetAllImagesResponse {
  getAllImages: {
    images: LibraryImage[];
    total: number;
    nextPage?: number;
    error?: string;
  };
}

export interface GetImagesInput {
  offset?: number;
  limit?: number;
}

export interface ImageInput {
  fileName: string;
  mimeType: string;
  bytesBase64: string;
}

export interface CreateChatInput {
  title: string;
  description?: string;
  modelId?: string;
  systemPrompt?: string;
}

export interface ApplicationConfig {
  demoMode: boolean;
  s3Connected: boolean;
  maxChats?: number;
  maxChatMessages?: number;
  maxImages?: number;
  lastUpdate?: number;
}

export interface GetInitialDataResponse {
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
    refreshToken: {
      token: string;
    };
    appConfig: ApplicationConfig;
  };
}

export interface GqlAmount {
  amount: number;
  currency: string;
}

export interface GqlServiceCostInfo {
  name: string;
  type: string;
  amounts: GqlAmount[];
}

export interface GqlCostsInfo {
  start: Date;
  end?: Date;
  error?: string;
  costs: GqlServiceCostInfo[];
}

export interface DeleteMessageResponse {
  deleteMessage: {
    messages: Message[];
  };
}

export interface SwitchModelResponse {
  switchModel: {
    message: Message;
    error?: string;
  };
}

export interface CallOthersInput {
  messageId: string;
  modelIds: string[];
}

export interface CallOthersResponse {
  callOther: {
    message?: Message;
    error?: string;
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
                ...FullUser
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
                  messagesCount
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
        refreshToken: { token: string };
        appConfig: ApplicationConfig;
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
                ...FullUser
              }
              getModels {
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
              getChats(input: { limit: 20, offset: 0 }) {
                chats {
                  id
                  title
                  isPristine
                  messagesCount
                  updatedAt
                  lastBotMessage
                  lastBotMessageId
                }
                total
                hasMore
              }
              refreshToken {
                token
              }
              appConfig {
                demoMode
                s3Connected
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
        const { currentUser, getModels, getChats, refreshToken, appConfig } = response.data || {};
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
          refreshToken,
          appConfig,
        };
      },
      providesTags: ["User", "Model", { type: "Chat", id: "LIST" }],
    }),
  }),
});

export const { useGetCurrentUserQuery, useGetModelsQuery, useGetChatsQuery, useGetInitialDataQuery } = graphqlApi;
