# KateChat - Universal ChatBot Platform

KateChat is a universal chat bot platform similar to chat.openai.com that can be used as a base for customized chat bots. The platform supports multiple LLM models from various providers and allows switching between them on the fly within a chat session.

## Features

- Multiple chat creation
- Support for various LLM models:
  - OpenAI
  - Anthropic
  - DeepSeek
  - Mistral
  - Amazon models
- On-the-fly model switching
- Chat history storage
- User authentication with MSAL.js
- Real-time communication with WebSockets

## Tech Stack

### Frontend
- React.js with TypeScript
- Redux for state management
- React Router for navigation
- esbuild for bundling
- Styled-components for styling
- MSAL.js for authentication

### Backend
- Node.js with TypeScript
- Express.js for REST API
- GraphQL for data fetching
- Socket.IO for real-time communication
- AWS Bedrock for AI model integrations
- Jest for testing

## Project Structure

The project consists of two main parts:
1. Backend - API server 
2. Frontend - Web interface

## Getting Started

### Prerequisites
- Node.js (v16+)
- Docker and Docker Compose
- AWS Account with Bedrock access
- Microsoft Azure AD for authentication

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

### REST API
- POST /api/auth/login - Login with MSAL
- GET /api/auth/me - Get current user profile

### GraphQL API
Available at `/graphql` endpoint with the following main queries/mutations:
- Query: chats, chat, messages
- Mutation: createChat, deleteChat, sendMessage

### WebSocket API
- Connection: ws://localhost:4000
- Events:
  - message - Receive new message from server
  - typing - User is typing
  - model_change - Model was switched
