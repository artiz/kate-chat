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

## TODO
* Add images input support (drag & drop, copy-paste, etc.) ✅
* Add parallel call for 2-3 models, link parallel messages with linkedToMessageId
* Add more UI stuff like:
  * Chat settings (temperature, max tokens, etc.) ✅
  * Chat message pagination ✅
  * Image resolution/count 
  * Copy code section ✅
  * Chat message editing
  * Chat message deletion ✅
* Add distributed messages processing using external queue (e.g., AWS SQS, Redis, etc.)
* Add "no any" TS rule and setup strict type checking ✅
* Finish user profile management (change password, etc.) ✅
* Add user registration with Google, GitHub, and MS account
* Add Demo mode when no LLM providers configured on Backend and AWS_REGION/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or OPENAI_API_KEY are stored in local storage and sent to the backend as "X-Aws-Region", "X-Aws-Access-Key-Id", "X-Aws-Secret-Access-Key", "X-Openai-Api-Key" headers
* Setup basic CI/CD pipeline with GitHub Actions to deploy the app to AWS (Azure?)
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

The project consists of two main parts:
1. Backend - GraphQL API server
2. Frontend - Web interface

## Getting Started

### Prerequisites
- Node.js (v20+)
- AWS Account with Bedrock access (instructions below)
- OpenAI API Account (instructions below)
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
     AWS_REGION=us-east-1  # or your preferred region
     AWS_ACCESS_KEY_ID=your_access_key_id
     AWS_SECRET_ACCESS_KEY=your_secret_access_key
     ```

6. **Verify AWS Region Availability**
   - Not all Bedrock models are available in every AWS region
   - Check the [AWS Bedrock documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html) for model availability by region
   - Make sure to set the `AWS_REGION` to a region that supports your desired models

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

3. Start the development environment using Docker
```
docker-compose up -d
```


### Development Mode

To run the projects in development mode:

#### 
```
npm install:all
npm run dev
```

### Production Build

```
npm install:all
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
