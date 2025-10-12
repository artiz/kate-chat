import { gql } from "@apollo/client";
import { parseMarkdown } from "@katechat/ui";
import { api } from "../api";
import { User } from "../slices/userSlice";
import { Model, ProviderInfo } from "../slices/modelSlice";

import {
  ApplicationConfig,
  Chat,
  CurrentUserResponse,
  GetChatsResponse,
  GetInitialDataResponse,
  GetModelsResponse,
} from "@/types/graphql";

export const BASE_MODEL_FRAGMENT = `
    fragment BaseModel on Model {
      id
      name
      modelId
      provider
      apiProvider
      isActive
      type
      imageInput
      maxInputTokens
      tools
    }
`;

export const BASE_CHAT_FRAGMENT = `
    fragment BaseChat on Chat {
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
        imagesCount
        user {
          id
          firstName
          lastName
        }
        chatDocuments {
          document {
            id
            fileName
            status
            downloadUrl
          }
        }
        tools {
          type
          name
          options { 
            name
            value
          }
        }
    }
`;

export const BASE_DOCUMENT_FRAGMENT = `
    fragment BaseDocument on Document {
      id
      fileName
      fileSize
      status
      summary
      statusInfo
      statusProgress
      createdAt
      updatedAt
      downloadUrl
      embeddingsModelId
      summaryModelId
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
      documentsEmbeddingsModelId
      documentSummarizationModelId
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
      updatedAt
      modelId
      modelName
      user {
        id
        lastName
        firstName
        avatarUrl
      }
      linkedToMessageId
      metadata {
        documentIds
        usage {
          inputTokens
          outputTokens
        }
        relevantsChunks {
          id
          documentId
          documentName
          page
          content
          relevance
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
      imagesCount
      tools {
        type
        name
      }
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
        ...BaseMessage
        linkedMessages {
          ...BaseMessage
        }
      }
      error
    }
  }
`;

export const CALL_OTHER_MUTATION = gql`
  mutation CallOther($messageId: ID!, $modelId: String!) {
    callOther(messageId: $messageId, modelId: $modelId) {
      message {
        ...BaseMessage
        linkedMessages {
          ...BaseMessage
        }
      }
      error
    }
  }
`;

export const EDIT_MESSAGE_MUTATION = gql`
  mutation EditMessage($messageId: ID!, $content: String!) {
    editMessage(messageId: $messageId, content: $content) {
      message {
        ...BaseMessage
        linkedMessages {
          ...BaseMessage
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

export const REINDEX_DOCUMENT_MUTATION = gql`
  mutation ReindexDocument($id: ID!) {
    reindexDocument(id: $id) {
      id
      status
      fileName
      summary
      s3key
      createdAt
    }
  }
`;

export const DELETE_DOCUMENT_MUTATION = gql`
  mutation DeleteDocument($id: ID!) {
    deleteDocument(id: $id)
  }
`;

export const ADD_TO_CHAT_MUTATION = gql`
  mutation AddDocumentsToChat($documentIds: [ID!]!, $chatId: ID!) {
    addDocumentsToChat(documentIds: $documentIds, chatId: $chatId) {
      chat {
        ...BaseChat
      }
      error
    }
  }
`;

export const REMOVE_FROM_CHAT_MUTATION = gql`
  mutation RemoveDocumentsFromChat($documentIds: [ID!]!, $chatId: ID!) {
    removeDocumentsFromChat(documentIds: $documentIds, chatId: $chatId) {
      chat {
        ...BaseChat
      }
      error
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
      error
      messages {
        ...BaseMessage
        linkedMessages {
          ...BaseMessage
        }
      }
      total
      hasMore
      chat {
        ...BaseChat
      }
    }
  }
`;

export const GET_CHAT = gql`
  query GetChat($id: ID!) {
    getChatById(id: $id) {
      ...BaseChat
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

export const GET_DOCUMENTS = gql`
  ${BASE_DOCUMENT_FRAGMENT}

  query GetDocuments($input: GetDocumentsInput) {
    getDocuments(input: $input) {
      documents {
        ...BaseDocument
      }
      total
      hasMore
    }
  }
`;

export const GET_DOCUMENTS_FOR_CHAT = gql`
  ${BASE_CHAT_FRAGMENT}
  ${BASE_DOCUMENT_FRAGMENT}
  query GetDocumentsForChat($chatId: ID!, $input: GetDocumentsInput) {
    chatById(id: $chatId) {
      ...BaseChat
    }

    getDocuments(input: $input) {
      documents {
        ...BaseDocument
      }
      total
      hasMore
    }
  }
`;

export const DOCUMENT_STATUS_SUBSCRIPTION = gql`
  subscription DocumentStatus($documentIds: [String!]!) {
    documentsStatus(documentIds: $documentIds) {
      documentId
      status
      statusProgress
      statusInfo
      summary
      updatedAt
    }
  }
`;

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
        appConfig: ApplicationConfig;
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
        const { getModels, getChats, appConfig } = response.data || {};
        const chats = getChats || {
          chats: [],
          total: 0,
          hasMore: false,
        };

        for (const chat of chats.chats) {
          if (chat.lastBotMessage) {
            chat.lastBotMessageHtml = parseMarkdown(chat.lastBotMessage);
          }
        }

        return {
          models: getModels?.models || [],
          providers: getModels?.providers || [],
          chats,
          appConfig,
        };
      },
      providesTags: ["User", "Model", { type: "Chat", id: "LIST" }],
    }),
  }),
});

export const { useGetCurrentUserQuery, useGetModelsQuery, useGetChatsQuery, useGetInitialDataQuery } = graphqlApi;

// Re-export types for other modules
export type {
  ApplicationConfig,
  Chat,
  Document,
  DocumentStatusMessage,
  ChatDocument,
  GetDocumentsResponse,
  GetDocumentsForChatResponse,
  GetDocumentsInput,
  CurrentUserResponse,
  GetModelsResponse,
  GetChatsResponse,
  GetInitialDataResponse,
  CreateChatInput,
  ImageInput,
  LibraryImage,
  GetAllImagesResponse,
  GetImagesInput,
} from "@/types/graphql";
