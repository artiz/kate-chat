# KateChat - Universal AI Chat Interface

KateChat is a universal chat bot platform similar to chat.openai.com that can be used as a base for customized chat bots. The platform supports multiple LLM models from various providers and allows switching between them on the fly within a chat session.

![logo](/logo.png)


## Features

- Multiple chats creation with pristine chat functionality
- Distributed messages processing using external queue (Redis atm)
- Support for various LLM model Providers:
  - AWS Bedrock (Amazon, Anthropic, Meta, Mistral, AI21, Cohere...)
  - OpenAI
  - Yandex Foundation Models
- Demo mode when no LLM providers configured on Backend and AWS_BEDROCK_REGION/AWS_BEDROCK_ACCESS_KEY_ID/AWS_BEDROCK_SECRET_ACCESS_KEY or OPENAI_API_KEY are stored in local storage and sent to the backend as "x-aws-region", "x-aws-access-key-id", "x-aws-secret-access-key", "x-openai-api-key" headers
- On-the-fly model switching
- Chat history storage and management, messages deletion
- Rich markdown formatting: code blocks, images, MatJAX formulas etc.
- Images input support (drag & drop, copy-paste, etc.)
- User authentication (email/password, [Google OAuth, GitHub OAuth](/docs/oauth-setup.md))
- Real-time communication with GraphQL subscriptions
- Responsive UI with Mantine

## TODO
* Extend docker-compose.yml to include Postgres and Nginx for production-like environment to run 2-3 instances of the backend app ✅
* Setup images uploads to S3 (selected bucket name in settings), add backend methods to download images from S3 woth correct cache headers 🏃‍➡️ (need to finish docker env)

* Setup basic CI/CD pipeline with GitHub Actions to deploy the app to AWS (Azure?)
* Add parallel call for 2-3 models, link parallel messages with linkedToMessageId
* Add more UI stuff like:
  * Image resolution/count 
  * Chat message editing
* Open AI code interpreter support  
* Finish custom models support (enter ARN for Bedrock models)
* Add support for more Google LLM provider
* Add support for more Azure LLM provider


## Tech Stack

### Frontend
- React with TypeScript
- Mantine UI library
- Apollo Client for GraphQL
- GraphQL code generation
- Real-time updates with GraphQL subscriptions (WebSockets)

### Backend
- Node.js with TypeScript
- [TypeORM](https://typeorm.io/relations) for persistence
- Express.js for API server
- GraphQL with Apollo Server
- AWS [Bedrock](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_bedrock-runtime_code_examples.html) for AI model integrations
- OpenAI API for AI model integrations
- Jest for testing

## Project Structure

The project consists of several parts:
1. Backend - GraphQL API server
2. Frontend - Web interface
3. Database - any TypePRM compatible RDBMS (PostgreSQL, MySQL, SQLite, etc.)
4. Redis - for message queue and caching (optional, but recommended for production)

## Getting Started

### Prerequisites
- Node.js (v20+)
- AWS Account with Bedrock access (instructions below)
- OpenAI API Account (instructions below)
- Yandex Foundation Models [API key](https://yandex.cloud/en/docs/iam/concepts/authorization/api-key).
- Docker and Docker Compose (optional, for development environment)

### AWS Bedrock API keys retrieval

1. **Create an AWS Account**
   - Visit [AWS Sign-up](https://portal.aws.amazon.com/billing/signup)
   - Follow the instructions to create a new AWS account
   - You'll need to provide a credit card and phone number for verification

2. **Enable AWS Bedrock Access**
   - Log in to the [AWS Management Console](https://console.aws.amazon.com/)
   - Search for "Bedrock" in the services search bar
   - Click on "Amazon Bedrock"
   - Click on "Model access" in the left navigation
   - Select the models you want to use (e.g., Claude, Llama 2)
   - Click "Request model access" and follow the approval process

3. **Create an IAM User for API Access**
   - Go to the [IAM Console](https://console.aws.amazon.com/iam/)
   - Click "Users" in the left navigation and then "Create user"
   - Enter a user name (e.g., "bedrock-api-user")
   - For permissions, select "Attach policies directly"
   - Search for and select "AmazonBedrockFullAccess"
   - Complete the user creation process

4. **Generate Access Keys**
   - From the user details page, navigate to the "Security credentials" tab
   - Under "Access keys", click "Create access key"
   - Select "Command Line Interface (CLI)" as the use case
   - Click through the confirmation and create the access key
   - **IMPORTANT**: Download the CSV file or copy the "Access key ID" and "Secret access key" values immediately. You won't be able to view the secret key again.

5. **Configure Your Environment**
   - Open the `.env` file in the backend directory
   - Add your AWS credentials:
     ```
     AWS_BEDROCK_REGION=us-east-1  # or your preferred region
     AWS_BEDROCK_ACCESS_KEY_ID=your_access_key_id
     AWS_BEDROCK_SECRET_ACCESS_KEY=your_secret_access_key
     ```

6. **Verify AWS Region Availability**
   - Not all Bedrock models are available in every AWS region
   - Check the [AWS Bedrock documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html) for model availability by region
   - Make sure to set the `AWS_BEDROCK_REGION` to a region that supports your desired models

### OpenAI API keys retrieval

1. **Create an OpenAI Account**
   - Visit [OpenAI's website](https://openai.com/)
   - Click "Sign Up" and create an account
   - Complete the verification process

2. **Generate API Key**
   - Log in to your OpenAI account
   - Navigate to the [API keys page](https://platform.openai.com/api-keys)
   - Click "Create new secret key"
   - Name your API key (e.g., "KateChat")
   - Copy the API key immediately - it won't be shown again

3. **Configure Your Environment**
   - Open the `.env` file in the backend directory
   - Add your OpenAI API key:
     ```
     OPENAI_API_KEY=your_openai_api_key
     OPENAI_API_URL=https://api.openai.com/v1  # Default OpenAI API URL
     ```

4. **Note on API Usage Costs**
   - OpenAI charges for API usage based on the number of tokens processed
   - Different models have different pricing tiers
   - Monitor your usage through the [OpenAI dashboard](https://platform.openai.com/usage)
   - Consider setting up usage limits to prevent unexpected charges


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

3. Start the production-like environment using Docker

add the following to your `/etc/hosts` file:
```
127.0.0.1       katechat.dev.com
```
Then run the following commands:

```
export COMPOSE_BAKE=true
npm run install:all
npm run frontend:build
docker compose up --build
```

App will be available at `http://katechat.dev.com`

### Development Mode

To run the projects in development mode:

#### 
```
npm run install:all
npm run dev
```

### Production Build

```
npm run install:all
npm run build
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

![image](https://github.com/user-attachments/assets/6bd059dd-2102-4f49-bdde-3bd4b9a7fa82)
![image](https://github.com/user-attachments/assets/abf403da-d63d-430f-81ad-e1ebbc7fce3d)

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/my-new-feature`
5. Submit a pull request
