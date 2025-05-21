# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KateChat is a full-stack application that provides a universal chat interface for interacting with various AI models. It consists of a React frontend and a Node.js/Express backend with GraphQL API.

## Repository Structure

The repository is organized into two main directories:
- `frontend/`: Contains the React application
- `backend/`: Contains the Node.js/Express GraphQL API server

## Tech Stack

### Frontend
- React
- TypeScript
- esbuild for bundling
- Jest for testing

### Backend
- Node.js/Express
- TypeScript
- GraphQL
- TypeORM for database management
- Jest for testing
- AWS Bedrock integration

## Key Components

### Data Models
The backend defines several key entities:
- `User`: User authentication and management
- `Chat`: Chat session management
- `Message`: Individual chat messages
- `Model`: AI model configuration
- `ModelServiceProvider`: Providers of AI models (like AWS Bedrock)

### AI Integration
The `ai.service.ts` handles integration with AI providers, particularly AWS Bedrock.

## Development Commands

### Frontend Commands
```bash
# Install dependencies
cd frontend
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Serve production build locally
npm run serve
```

### Backend Commands
```bash
# Install dependencies
cd backend
npm install

# Start development server
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# TypeCheck
npm run typecheck

# Lint code
npm run lint
```

## Environment Setup

The backend requires environment variables for:
- Database connection
- JWT secret for authentication
- AWS credentials for Bedrock integration

## Docker Setup

The project includes Docker configuration for both frontend and backend:
```bash
# Start the entire application stack
docker-compose up

# Rebuild containers if needed
docker-compose up --build
```

## Authentication Flow

Authentication is handled using JWT tokens. The `authMiddleware.ts` verifies tokens for protected routes, with token generation/verification in `jwt.ts`.

## AWS Bedrock Integration

The application integrates with AWS Bedrock for AI model access. Configuration is managed in `config/bedrock.ts`.
