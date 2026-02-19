import { gql } from "@apollo/client";

export const BASE_MODEL_FRAGMENT = `
    fragment BaseModel on Model {
      id
      name
      modelId
      provider
      apiProvider
      isActive
      isCustom
      type
      imageInput
      maxInputTokens
      tools
      features
      description
      streaming
      customSettings {
        endpoint
        apiKey
        modelName
        protocol
      }
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
        settings {
          systemPrompt
          temperature
          maxTokens
          topP
          imagesCount
          thinking
          thinkingBudget
        }
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
          id
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
      downloadUrlMarkdown
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
      defaultTemperature
      defaultMaxTokens
      defaultTopP
      defaultImagesCount
      documentsEmbeddingsModelId
      documentSummarizationModelId
      authProvider
      avatarUrl
      role
      settings {
        language
        s3Endpoint
        s3Region
        s3FilesBucketName
        s3AccessKeyId
        s3SecretAccessKey
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
      status
      metadata {
        documentIds
        requestId
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
        tools {
          name
          content
        }
        toolCalls {
          name
          type
          args
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

export const NEW_MESSAGE_SUBSCRIPTION = gql`
  subscription OnNewMessage($chatId: String!) {
    newMessage(chatId: $chatId) {
      type
      message {
        ...BaseMessage
        status
        statusInfo
        linkedMessages {
          ...BaseMessage
        }
      }
      chat {
        title
        modelId
      }
      error
      streaming
    }
  }

  ${BASE_MESSAGE_FRAGMENT}
`;

export const CREATE_MESSAGE = gql`
  mutation CreateMessage($input: CreateMessageInput!) {
    createMessage(input: $input) {
      ...BaseMessage
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
      isPinned
      messagesCount
      settings {
        systemPrompt
        temperature
        maxTokens
        topP
        imagesCount
        thinking
        thinkingBudget
      }
      tools {
        type
        name
        id
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
  mutation SwitchModel($messageId: ID!, $modelId: String!, $messageContext: MessageContext) {
    switchModel(messageId: $messageId, modelId: $modelId, messageContext: $messageContext) {
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
  mutation CallOther($messageId: ID!, $modelId: String!, $messageContext: MessageContext) {
    callOther(messageId: $messageId, modelId: $modelId, messageContext: $messageContext) {
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
  mutation EditMessage($messageId: ID!, $content: String!, $messageContext: MessageContext) {
    editMessage(messageId: $messageId, content: $content, messageContext: $messageContext) {
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

export const STOP_MESSAGE_GENERATION_MUTATION = gql`
  mutation StopMessageGeneration($input: StopMessageGenerationInput!) {
    stopMessageGeneration(input: $input) {
      error
      requestId
      messageId
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
    findPristineChat {
      id
      title
      isPristine
      modelId
      updatedAt
    }
  }
`;

export const GET_CHATS = gql`
  query GetChats($input: GetChatsInput) {
    getChats(input: $input) {
      chats {
        id
        title
        isPristine
        modelId
        messagesCount
        updatedAt
        lastBotMessage
        lastBotMessageId
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
        mime
        role
        createdAt
        predominantColor
        message {
          id
          content
        }
        chat {
          id
          title
        }
      }
      nextPage
      error
    }
  }
`;

export const RELOAD_CHAT_FILE_METADATA = gql`
  mutation ReloadChatFileMetadata($id: String!) {
    reloadChatFileMetadata(id: $id) {
      id
      predominantColor
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

export const CREATE_CUSTOM_MODEL_MUTATION = gql`
  ${BASE_MODEL_FRAGMENT}
  mutation CreateCustomModel($input: CreateCustomModelInput!) {
    createCustomModel(input: $input) {
      ...BaseModel
    }
  }
`;

export const DELETE_MODEL_MUTATION = gql`
  mutation DeleteModel($input: DeleteModelInput!) {
    deleteModel(input: $input)
  }
`;

export const UPDATE_CUSTOM_MODEL_MUTATION = gql`
  ${BASE_MODEL_FRAGMENT}
  mutation UpdateCustomModel($input: UpdateCustomModelInput!) {
    updateCustomModel(input: $input) {
      ...BaseModel
    }
  }
`;

export const TEST_CUSTOM_MODEL_MUTATION = gql`
  ${BASE_MESSAGE_FRAGMENT}
  mutation TestCustomModel($input: TestCustomModelInput!) {
    testCustomModel(input: $input) {
      ...BaseMessage
    }
  }
`;

export const REFETCH_MCP_SERVER_TOOLS = gql`
  mutation RefetchMcpServerTools($serverId: String!, $authToken: String) {
    refetchMcpServerTools(serverId: $serverId, authToken: $authToken) {
      server {
        id
        tools {
          name
          description
          inputSchema
          outputSchema
        }
      }
      error
    }
  }
`;

export const TEST_MCP_TOOL = gql`
  mutation TestMCPTool($input: TestMCPToolInput!) {
    testMCPTool(input: $input) {
      result
      error
    }
  }
`;

// MCP servers query for MCP tool dropdown
export const GET_MCP_SERVERS_FOR_CHAT = gql`
  query GetMCPServersForChat {
    getMCPServers {
      servers {
        id
        name
        isActive
        authType
        authConfig {
          clientId
          authorizationUrl
          scope
        }
      }
    }
  }
`;

export const CREATE_MCP_SERVER = gql`
  mutation CreateMCPServer($input: CreateMCPServerInput!) {
    createMCPServer(input: $input) {
      server {
        id
        name
        url
        description
        transportType
        authType
        isActive
      }
      error
    }
  }
`;

export const UPDATE_MCP_SERVER = gql`
  mutation UpdateMCPServer($input: UpdateMCPServerInput!) {
    updateMCPServer(input: $input) {
      server {
        id
        name
        url
        description
        transportType
        authType
        isActive
      }
      error
    }
  }
`;

// GraphQL queries and mutations
export const GET_MCP_SERVERS = gql`
  query GetMCPServers {
    getMCPServers {
      servers {
        id
        name
        url
        description
        transportType
        authType
        authConfig {
          headerName
          clientId
          clientSecret
          tokenUrl
          authorizationUrl
          scope
        }
        tools {
          name
          description
          inputSchema
          outputSchema
        }
        isActive
        createdAt
        updatedAt
      }
      total
      error
    }
  }
`;

export const DELETE_MCP_SERVER = gql`
  mutation DeleteMCPServer($input: DeleteMCPServerInput!) {
    deleteMCPServer(input: $input)
  }
`;
