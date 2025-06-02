# KateChat API Documentation

This document provides information on how to use the KateChat GraphQL API with Postman.

## Getting Started

### Prerequisites
- [Postman](https://www.postman.com/downloads/) installed on your machine
- KateChat backend running locally or on a server

### Importing the Collection
1. Open Postman
2. Click on "Import" in the top left
3. Select the `KateChat-API.postman_collection.json` file
4. Click "Import"

### Setting Environment Variables
1. Create a new environment in Postman
2. Add the following variables:
   - `baseUrl`: URL of your backend server (default: `http://localhost:4000`)
   - `authToken`: Will be populated after login

## Authentication

### Register a New User
1. Open the "Register" request in the Authentication folder
2. Modify the variables in the request body as needed:
   ```json
   {
     "firstName": "John",
     "lastName": "Doe",
     "email": "user@example.com",
     "password": "password123",
     "avatarUrl": "https://example.com/avatar.jpg" // Optional
   }
   ```
3. Send the request
4. If successful, you'll receive a token that you should save to the `authToken` environment variable

### Login
1. Open the "Login" request in the Authentication folder
2. Modify the variables in the request body as needed:
   ```json
   {
     "email": "user@example.com",
     "password": "password123"
   }
   ```
3. Send the request
4. From the response, copy the token value and set it to your `authToken` environment variable:
   ```
   pm.environment.set("authToken", pm.response.json().data.login.token);
   ```

## Working with Chats

### Create a Chat
1. Make sure you're authenticated (token is set)
2. Open the "Create Chat" request in the Chats folder
3. Modify the title, description, and modelId (optional) as needed
4. Send the request
5. Save the returned chat ID for future requests

### Get All Chats
1. Open the "Get Chats" request in the Chats folder
2. Optionally modify pagination parameters (offset, limit) and searchTerm
3. Send the request
4. The response includes chats, total count, and hasMore flag for pagination

### Get Chat by ID
1. Open the "Get Chat by ID" request in the Chats folder
2. Replace `chatId` in the variables with your actual chat ID
3. Send the request

### Update Chat
1. Open the "Update Chat" request in the Chats folder
2. Replace `chatId` with your actual chat ID
3. Modify title, description, modelId, and/or isActive as needed
4. Send the request

### Delete Chat
1. Open the "Delete Chat" request in the Chats folder
2. Replace `chatId` with your actual chat ID
3. Send the request

## Working with Messages

### Send a Message
1. Make sure you're authenticated (token is set)
2. Open the "Create Message" request in the Messages folder
3. Update the variables in the request body:
   - `chatId`: ID of the chat where you want to send the message
   - `content`: Your message text
   - `modelId`: ID of the AI model to use for response generation (optional)
   - `role`: Usually "user" for user messages
4. Send the request
5. The system will automatically generate an AI response

### Get Messages from a Chat
1. Open the "Get Chat Messages" request in the Messages folder
2. Replace `chatId` with your actual chat ID
3. Optionally modify pagination parameters (offset, limit)
4. Send the request
5. The response includes messages, total count, and hasMore flag for pagination

### Get Specific Message
1. Open the "Get Message by ID" request in the Messages folder
2. Replace `messageId` with your actual message ID
3. Send the request

### Delete a Message
1. Open the "Delete Message" request in the Messages folder
2. Replace `messageId` with your actual message ID
3. Send the request

## Working with Models

### Get Available Models
1. Open the "Get Models" request in the Models folder
2. Send the request
3. The response includes available models with their properties

### Reload Models
1. Open the "Reload Models" request in the Models folder
2. Send the request to refresh the list of available models from providers
3. The response includes the updated list of models

## User Information

### Get Current User
1. Open the "Current User" request
2. Make sure you're authenticated (token is set)
3. Send the request to get information about the currently logged-in user

## Real-time Messaging with WebSockets

KateChat supports real-time messaging using GraphQL subscriptions over WebSockets. 

### Setting up WebSocket Connection
1. Open the "WebSocket Connection" request in the GraphQL WebSocket folder
2. Make sure the URL is correct: `ws://{{baseUrl}}/graphql/subscriptions`
3. Click "Connect" to establish a WebSocket connection

### Subscribing to New Messages
Once connected via WebSocket, you can subscribe to new messages using the following GraphQL subscription:

```graphql
subscription NewMessage($chatId: String!) {
  newMessage(chatId: $chatId) {
    type
    message {
      id
      role
      content
      modelId
      modelName
      createdAt
    }
    error
  }
}
```

Variables:
```json
{
  "chatId": "your-chat-id"
}
```

### WebSocket Connection Parameters
When connecting to the WebSocket endpoint, you should provide your authentication token in the connection parameters:

```json
{
  "connectionParams": {
    "authToken": "your-auth-token"
  }
}
```

## Testing Tips

1. **Authentication**: Always ensure your `authToken` is valid and updated. Tokens might expire after some time.

2. **Error Handling**: Check response error messages for troubleshooting. GraphQL provides detailed error information.

3. **Chat IDs**: Keep track of chat IDs returned from the "Create Chat" request for use in other requests.

4. **Model IDs**: To send messages, you need a valid model ID. Use the "Get Models" request to obtain available model IDs.

5. **WebSocket Testing**: For testing WebSocket subscriptions, consider using the Postman WebSocket request or a dedicated WebSocket client.

## API Request Structure

All GraphQL requests (except WebSocket connections) are HTTP POST requests to the `/graphql` endpoint with:

- Content-Type: application/json
- Authorization: Bearer {{authToken}} (for authenticated requests)
- Body format:
  ```json
  {
    "query": "your GraphQL query",
    "variables": {
      "var1": "value1"
    }
  }
  ```

## GraphQL Schema Reference

### Types

#### User
```graphql
type User {
  id: ID!
  email: String!
  firstName: String!
  lastName: String!
  avatarUrl: String
  msalId: String
  createdAt: DateTimeISO!
  updatedAt: DateTimeISO!
}
```

#### Chat
```graphql
type Chat {
  id: ID!
  title: String!
  description: String!
  isPristine: Boolean!
  modelId: String
  user: User!
  createdAt: DateTimeISO!
  updatedAt: DateTimeISO!
}
```

#### Message
```graphql
type Message {
  id: ID!
  role: String!
  content: String!
  modelId: String!
  modelName: String
  chatId: String!
  chat: Chat!
  user: User!
  createdAt: DateTimeISO!
  updatedAt: DateTimeISO!
}
```

#### Model
```graphql
type ModelResponse {
  id: ID!
  name: String!
  description: String!
  modelId: String!
  provider: String
  apiProvider: String!
  supportsStreaming: Boolean!
  supportsTextIn: Boolean!
  supportsTextOut: Boolean!
  supportsEmbeddingsIn: Boolean!
  supportsImageIn: Boolean!
  supportsImageOut: Boolean!
  isActive: Boolean!
  createdAt: DateTimeISO!
  updatedAt: DateTimeISO!
}
```

#### Response Types
```graphql
type AuthResponse {
  token: String!
  user: User!
}

type ChatsResponse {
  chats: [Chat!]
  total: Float
  hasMore: Boolean!
  error: String
}

type MessagesResponse {
  messages: [Message!]
  total: Float
  hasMore: Boolean!
  error: String
}

type ModelsResponse {
  models: [ModelResponse!]
  total: Float
  error: String
}

type MessageResponse {
  type: String!
  message: Message
  error: String
}
```

### Queries
```graphql
type Query {
  currentUser: User
  getChatById(id: ID!): Chat
  getChats(input: GetChatsInput): ChatsResponse!
  getChatMessages(input: GetMessagesInput!): MessagesResponse!
  getMessageById(id: String!): Message
  getModels: ModelsResponse!
}
```

### Mutations
```graphql
type Mutation {
  register(input: RegisterInput!): AuthResponse!
  login(input: LoginInput!): AuthResponse!
  createChat(input: CreateChatInput!): Chat!
  updateChat(id: ID!, input: UpdateChatInput!): Chat!
  deleteChat(id: ID!): Boolean!
  createMessage(input: CreateMessageInput!): Message!
  deleteMessage(id: String!): Boolean!
  reloadModels: ModelsResponse!
}
```

### Subscriptions
```graphql
type Subscription {
  newMessage(chatId: String!): MessageResponse!
}
```

### Input Types

#### RegisterInput
```graphql
input RegisterInput {
  email: String!
  password: String!
  firstName: String!
  lastName: String!
  avatarUrl: String
}
```

#### LoginInput
```graphql
input LoginInput {
  email: String!
  password: String!
}
```

#### CreateChatInput
```graphql
input CreateChatInput {
  title: String!
  description: String
  modelId: String
}
```

#### UpdateChatInput
```graphql
input UpdateChatInput {
  title: String
  description: String
  modelId: String
  temperature
  maxTokens
  topP
}
```

#### GetChatsInput
```graphql
input GetChatsInput {
  offset: Float = 0
  limit: Float = 20
  searchTerm: String
}
```

#### CreateMessageInput
```graphql
input CreateMessageInput {
  chatId: String!
  content: String!
  modelId: String
  role: String! = "user"
}
```

#### GetMessagesInput
```graphql
input GetMessagesInput {
  chatId: String!
  offset: Float = 0
  limit: Float = 20
}
```

## Available AI Models and Providers

KateChat integrates with AWS Bedrock to provide access to various AI models from different providers:

### Model Providers
- Anthropic (Claude models)
- Amazon (Titan models)
- AI21 (Jurassic models)
- Cohere (Command models)
- Meta (Llama models)
- Mistral (Mistral and Mixtral models)

### Default Models
- Default Provider: Anthropic
- Default Model: Claude 3 Haiku (anthropic.claude-3-haiku-20240307-v1:0)

### Models List
- Anthropic
  - Claude 3 Opus
  - Claude 3 Sonnet
  - Claude 3 Haiku
  - Claude 2
  - Claude Instant
- Amazon
  - Titan Text Express
  - Titan Text Lite
- AI21
  - Jurassic-2 Mid
  - Jurassic-2 Ultra
- Cohere
  - Command Text
  - Command Light Text
- Meta
  - Llama 2 13B Chat
  - Llama 2 70B Chat
  - Llama 3 8B Instruct
  - Llama 3 70B Instruct
- Mistral
  - Mistral 7B Instruct
  - Mixtral 8x7B Instruct
