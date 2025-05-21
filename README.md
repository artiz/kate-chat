# KateChat - Universal AI Chat Interface

KateChat is a universal chat bot platform similar to chat.openai.com that can be used as a base for customized chat bots. The platform supports multiple LLM models from various providers and allows switching between them on the fly within a chat session.

## Features

- Multiple chat creation with pristine chat functionality
- Support for various LLM models:
  - OpenAI
  - Anthropic
  - DeepSeek
  - Mistral
  - Amazon models
  - AI21
  - Cohere
  - Meta
- On-the-fly model switching
- Chat history storage and management
- User authentication
- Real-time communication with GraphQL subscriptions
- Responsive UI with Mantine

## Tech Stack

### Frontend
- Next.js with TypeScript
- Mantine UI library
- Apollo Client for GraphQL
- GraphQL code generation
- Real-time updates with GraphQL subscriptions

### Backend
- Node.js with TypeScript
- [TypeORM](https://typeorm.io/relations) for persistence
- Express.js for API server
- GraphQL with Apollo Server
- AWS [Bedrock](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_bedrock-runtime_code_examples.html) for AI model integrations
- Jest for testing

## Project Structure

The project consists of two main parts:
1. Backend - GraphQL API server
2. Frontend - Next.js web interface

## Getting Started

### Prerequisites
- Node.js (v18+)
- Docker and Docker Compose
- AWS Account with Bedrock access

### Installation

1. Clone the repository
```
git clone https://github.com/yourname/kate-chat.git
cd kate-chat
```

2. Set up environment variables
```
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```
Edit the `.env` files with your configuration settings.

3. Start the development environment using Docker
```
docker-compose up -d
```

### Development Mode

To run the projects in development mode:

#### Backend
```
cd backend
npm install
npm run dev
```

#### Frontend
```
cd frontend
npm install
npm run dev
```

### Production Build

#### Backend
```
cd backend
npm install
npm run build
npm start
```

#### Frontend
```
cd frontend
npm install
npm run build
npm start
```

## API Documentation

### GraphQL API
Available at `/graphql` endpoint with the following main queries/mutations:

#### Queries
- `currentUser` - Get current authenticated user
- `getChats` - Get list of user's chats with pagination
- `getChatById` - Get a specific chat
- `getChatMessages` - Get messages for a specific chat
- `getModelServiceProviders` - Get list of available AI model providers
- `getModels` - Get list of available AI models

#### Mutations
- `login` - Authenticate a user
- `register` - Register a new user
- `createChat` - Create a new chat
- `updateChat` - Update chat details
- `deleteChat` - Delete a chat
- `createMessage` - Send a message and generate AI response
- `deleteMessage` - Delete a message

#### Subscriptions
- `newMessage` - Real-time updates for new messages in a chat

## Authentication

Authentication is handled via JWT tokens. When a user logs in or registers, they receive a token that must be included in the Authorization header for subsequent requests.

## Screenshots

[Put some screenshots here when they're available]

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/my-new-feature`
5. Submit a pull request
