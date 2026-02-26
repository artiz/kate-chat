# KateChat - Universal AI Chat Interface

_KateChat_ is a universal chatbot platform similar to chat.openai.com that can be used as a base for customized chatbots. The platform supports multiple LLM models from various providers and allows switching between them on the fly within a chat session.

![logo](/logo.png)

## 🚀 Live Demo

Experience KateChat in action with our live demo:

**[Try KateChat Demo →](https://katechat.tech/)**

### Getting Started with Demo

To interact with all supported AI models in the demo, you'll need to provide your own API keys for:
- **AWS Bedrock** - Access to Claude, Llama, and other models
- **OpenAI** - GPT-4, GPT-5, and other OpenAI models  
- **Yandex Foundation Models** - YandexGPT and other Yandex models

> 📋 **Note**: API keys are stored by default locally in your browser and sent securely to our backend. See the [Getting Started](#getting-started) section below for detailed instructions on obtaining API keys.

## Features

- Multiple chats creation, chats history, hierarchical folders structure, messages editing/deletion
- Rich markdown formatting: code blocks, images, MathJax formulas etc.
- Real-time communication with GraphQL subscriptions and WebSocket
- Localization
- "Switch model"/"Call other model" logic to process selected chat messages with another [model](#screenshots)
- LLM tools (Web Search, Code Interpreter, Reasoning) support, custom WebSearch tool implemented using Yandex Search API
- Distributed messages processing using external queue (SQS + Redis), specific queue for long-running requests (images generation, agents) that allows to continue requests processing after service crash/restart
- Request statistics (input/output tokens, tool calls), request cancellation to stop reasoning or web search
- External MCP servers support (could be tested with https://github.com/github/github-mcp-server)
- Images input/generation support (drag & drop, copy-paste, etc.), images stored on S3-compatible storage (`localstack` on local dev environment)
- Client-side Python code [execution](#python-code-run-in-browser) with [Pyodide](https://pyodide.org/) 
- Reusable [@katechat/ui](https://www.npmjs.com/package/@katechat/ui) that includes basic chatbot controls.
  * Usage examples are available in [examples](examples). 
  * Voice-to-voice demo for OpenAI realtime WebRTC API.
- External users authentication (email/password, [Google OAuth, GitHub OAuth](/docs/oauth-setup.md))
- Support for various LLM model Providers:
  - AWS Bedrock (Amazon, Anthropic, Meta, Mistral, AI21, Cohere...)
  - OpenAI
  - [Yandex Foundation Models](https://yandex.cloud/en/docs/foundation-models/concepts/generation/models) with OpenAI protocol 
- Custom OpenAI-compatible REST API endpoints support (Deepseek, local [Ollama](https://developers.openai.com/cookbook/articles/gpt-oss/run-locally-ollama/), etc.).
- RAG implementation with documents (PDF, DOCX, TXT) parsing by [Docling](https://docling-project.github.io/docling/) and vector embeddings stored in PostgreSQL/Sqlite/MS SQL server
- Full-fledged production-like dev environment with docker-compose
- CI/CD pipeline with GitHub Actions to deploy the app to AWS
- Demo mode when no LLM providers configured on Backend and `AWS_BEDROCK_...` or `OPENAI_API_...` settings are stored in local storage and sent to the backend as "x-aws-region", "x-aws-access-key-id", "x-aws-secret-access-key", "x-openai-api-key" headers

## TODO
* Put status update time into document processing, load pages count and show it and full processing time and average proc speed
* Check OpenAI protocol to process all the possible metadata, extend MessageMetadata, add ChatMetadata where totalTokens,totalInputTokens,totalOutputTokens should be stored. 
* Add voice-to-voice interaction for OpenAI realtime models, put basic controls to katechat/ui and extend OpenAI protocol in main API.
* Render: add sortable headers to HTML tables and button to copy/download as csv
* Introduce Agents, that will use existing requests queue to perform operations in background and publish progress and results in output window like in VS Code Copilot chat with collapsible details blocks, links to external sources and MCPs and so on.
* Introduce video generation, reuse requests queue
* Rust API sync: add images generation support, Library, admin API. Migrate to OpenAI protocol for OpenAI, Yandex and Custom models (https://github.com/YanceyOfficial/rs-openai).
* Google Vertex AI provider support
* Finish "Forgot password?" logic for local login
* @katechat/ui chatbot demo with animated UI and custom actions buttons (plugins={[Actions]}) in chat to ask weather report tool or fill some form
* SerpApi for Web Search (new setting in UI)
* Python API (FastAPI)
* MySQL: check whether https://github.com/stephenc222/mysql_vss/ could be used for RAG

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
1. API - Node.js GraphQL API server. There is also an alternative backend API implementation in Rust; Python is planned.
2. Client - Universal web interface
3. Database - any TypeORM compatible RDBMS (PostgreSQL, MySQL, SQLite, etc.)
4. Redis - for message queue and caching (optional, but recommended for production)

## Customization

- The API configuration is centralized in `api/src/global-config.ts`. Defaults are merged with an optional `customization.json`
  placed in the API folder or its parent (use the provided `api/customization.example.json` as a template).
- Supported overrides: demo limits, enabled AI providers, feature flags (images generation, RAG, MCP), AI defaults
  (temperature, max tokens, top_p, context and summarization limits), admin emails, app defaults, and optional initial
  custom models/MCP servers (API keys pulled from env vars such as `DEEPSEEK_API_KEY`).
- Only deployment/security values are loaded from `.env`: `PORT`, `NODE_ENV`, `ALLOWED_ORIGINS`, `LOG_LEVEL`,
  `CALLBACK_URL_BASE`, `FRONTEND_URL`, `JWT_SECRET`, `SESSION_SECRET`, `RECAPTCHA_SECRET_KEY`, OAuth client secrets,
  DB/S3/SQS/AWS Bedrock/OpenAI/Yandex credentials.
- The client reads `customization.json` (current or parent folder; see `client/customization.example.json`) to override
  brand colors, font family, app title, footer links, and the chat AI-usage notice without changing code.

## Getting Started

### Prerequisites
- Node.js (v20+)
- Connection to an LLM, choose any from:
   * AWS Account with [Bedrock](#aws-bedrock-api-connection) access
   * [OpenAI API](#openai-api-connection) Account
   * Yandex Foundation Models [API key](https://yandex.cloud/en/docs/iam/concepts/authorization/api-key).
   * Local [Ollama](#example-local-ollama-models) model
- Docker and Docker Compose (optional, for development environment)

### Quick Start

1. Clone the repository
```
git clone https://github.com/artiz/kate-chat.git
cd kate-chat
npm install
npm run dev
```

App will be available at `http://localhost:3000`
There you can use your own OpenAI API key, AWS Bedrock credentials, or Yandex Foundation Models to connect to cloud models.
Local Ollama-compatible models can be added as Custom models.

### Production-like environment using Docker

Add the following to your `/etc/hosts` file:
```
127.0.0.1       katechat.dev.com
```
Then run the following commands:

```bash
export COMPOSE_BAKE=true
npm install
npm run build:client
docker compose up --build
```

App will be available at `http://katechat.dev.com`

## Development Mode

To run the projects in development mode:

#### Default Node.js API/Client
```bash
npm install
docker compose up redis localstack postgres mysql mssql -d
npm run dev
```

#### Documents processor (Python)
```bash
python -m venv document-processor/.venv
source document-processor/.venv/bin/activate
pip install -r document-processor/requirements.txt
npm run dev:document_processor
```

#### Rust API (experiment)

1. Server
```bash
cd api-rust
diesel migration run
cargo build
cargo run
```

2. Client
```bash
APP_API_URL=http://localhost:4001  APP_WS_URL=http://localhost:4002 npm run dev:client
```

#### API DB Migrations

* Create new migration

```bash
docker compose up redis localstack postgres mysql mssql -d
npm run migration:generate <migration name>
```

* Apply migrations (automated at app start but can be used to test)

```bash
npm run migration:run
```

NOTE: do not update more than one table definition at once, sqlite sometimes applies migrations incorrectly due to "temporary_xxx" tables creation.
NOTE: do not use more than 1 foreign key with ON DELETE CASCADE in one table for MS SQL, or use NO ACTION as fallback:
```
@ManyToOne(() => Message, { onDelete: DB_TYPE == "mssql" ? "NO ACTION" : "CASCADE" })
```

### Production Build

```bash
npm run install:all
npm run build
```

### Docker Build

```bash
docker build -t katechat-api ./ -f api/Dockerfile  
docker run --env-file=./api/.env  -p4000:4000 katechat-api 
```

```bash
docker build -t katechat-client --build-arg APP_API_URL=http://localhost:4000 --build-arg APP_WS_URL=http://localhost:4000 ./ -f client/Dockerfile  
docker run -p3000:80 katechat-client
```

All-in-one service
```bash
docker build -t katechat-app ./ -f infrastructure/services/katechat-app/Dockerfile

docker run -it --rm --pid=host --env-file=./api/.env \
 --env PORT=80 \
 --env NODE_ENV=production \
 --env ALLOWED_ORIGINS="*" \
 --env REDIS_URL="redis://host.docker.internal:6379" \
 --env S3_ENDPOINT="http://host.docker.internal:4566" \
 --env SQS_ENDPOINT="http://host.docker.internal:4566" \
 --env DB_URL="postgres://katechat:katechat@host.docker.internal:5432/katechat" \
 --env CALLBACK_URL_BASE="http://localhost" \
 --env FRONTEND_URL="http://localhost" \
 --env DB_MIGRATIONS_PATH="./db-migrations/*-*.js" \
 -p80:80 katechat-app
```

Document processor
```bash
DOCKER_BUILDKIT=1 docker build -t katechat-document-processor ./ -f infrastructure/services/katechat-document-processor/Dockerfile

docker run -it --rm --pid=host --env-file=./document-processor/.env \
 --env PORT=8080 \
 --env NODE_ENV=production \
 --env REDIS_URL="redis://host.docker.internal:6379" \
 --env S3_ENDPOINT="http://host.docker.internal:4566" \
 --env SQS_ENDPOINT="http://host.docker.internal:4566" \
 -p8080:8080 katechat-document-processor
```

## Environment setup

The app can be tuned for your needs with environment variables:

```bash
cp api/.env.example api/.env
cp api-rust/.env.example api-rust/.env
cp client/.env.example client/.env
```
Edit the `.env` files with your configuration settings.

## Admin Dashboard

KateChat includes an admin dashboard for managing users and viewing system statistics. Admin access is controlled by email addresses specified in the `DEFAULT_ADMIN_EMAILS` environment variable.

### Admin Features

- **User Management**: View all registered users with pagination and search
- **System Statistics**: Monitor total users, chats, and models
- **Role-based Access**: Automatic admin role assignment for specified email addresses

### Configuring Admin Access

1. Set the `DEFAULT_ADMIN_EMAILS` environment variable in your `.env` file:
   ```env
   DEFAULT_ADMIN_EMAILS=admin@example.com,another-admin@example.com
   ```
2. Users with these email addresses will automatically receive admin privileges upon:
   - Registration
   - Login (existing users)
   - OAuth authentication (Google/GitHub)


## AI Setup

### AWS Bedrock API connection

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
   - Open the `.env` file in the `api` directory
   - Add your AWS credentials:
     ```env
     AWS_BEDROCK_REGION=us-east-1  # or your preferred region
     AWS_BEDROCK_ACCESS_KEY_ID=your_access_key_id
     AWS_BEDROCK_SECRET_ACCESS_KEY=your_secret_access_key
     ```

6. **Verify AWS Region Availability**
   - Not all Bedrock models are available in every AWS region
   - Check the [AWS Bedrock documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html) for model availability by region
   - Make sure to set the `AWS_BEDROCK_REGION` to a region that supports your desired models

### OpenAI API connection

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
   - Open the `.env` file in the `api` directory
   - Add your OpenAI API key:
     ```env
     OPENAI_API_KEY=your_openai_api_key
     OPENAI_API_URL=https://api.openai.com/v1  # Default OpenAI API URL
     ```

4. **Note on API Usage Costs**
   - OpenAI charges for API usage based on the number of tokens processed
   - Different models have different pricing tiers
   - Monitor your usage through the [OpenAI dashboard](https://platform.openai.com/usage)
   - Consider setting up usage limits to prevent unexpected charges


### Custom REST API Models (Deepseek, Local Models, etc.)

KateChat supports connecting to any OpenAI-compatible REST API endpoint, allowing you to use services like Deepseek, local models running on Ollama, or other third-party providers.

#### Setting Up Custom Models

Custom models are configured per-model through the GraphQL API or database. Each custom model requires the following settings:

1. **Endpoint URL**: The base URL of the API (e.g., `https://api.deepseek.com/v1`)
2. **API Key**: Your authentication key for the API
3. **Model Name**: The specific model identifier (e.g., `deepseek-chat`, `llama-3-70b`)
4. **Protocol**: Choose between:
   - `OPENAI_CHAT_COMPLETIONS` - Standard OpenAI chat completions API
   - `OPENAI_RESPONSES` - OpenAI Responses API (for advanced features)
5. **Description**: Human-readable description of the model

#### Example: Deepseek Configuration

[Deepseek](https://api-docs.deepseek.com/) is a powerful AI model provider with an OpenAI-compatible API:

1. **Get API Key**
   - Visit [Deepseek Platform](https://platform.deepseek.com/)
   - Sign up and create an API key
   - Copy your API key

2. **Configure Custom Model**
   - Create a new Model entry with:
     ```
     apiProvider: CUSTOM_REST_API
     customSettings: {
       endpoint: "https://api.deepseek.com/v1"
       apiKey: "your_deepseek_api_key"
       modelName: "deepseek-chat"
       protocol: OPENAI_CHAT_COMPLETIONS
       description: "Deepseek Chat Model"
     }
     ```

#### Example: Local Ollama Models

For running local models with Ollama:

1. **Install Ollama**
   - Visit [Ollama website](https://ollama.ai/)
   - Download and install Ollama
   - Pull a model: `ollama pull llama3`
   - Run a model: `ollama run llama3`

2. **Configure Custom Model**
   - Create a new Model entry with:
     ```
     apiProvider: CUSTOM_REST_API
     customSettings: {
       endpoint: "http://localhost:11434/v1"
       apiKey: "ollama"  # Ollama doesn't require real auth
       modelName: "llama3"
       protocol: OPENAI_CHAT_COMPLETIONS
       description: "Local Llama 3 via Ollama"
     }
     ```

#### Supported Protocols

- **OPENAI_CHAT_COMPLETIONS**: Standard chat completions endpoint (`/chat/completions`)
  - Best for most OpenAI-compatible APIs
  - Supports streaming responses
  - Tool/function calling support (if the underlying API supports it)

- **OPENAI_RESPONSES**: Advanced Responses API
  - Support for complex multi-modal interactions
  - Request cancellation support
  - Web search and code interpreter tools

## Screenshots

### Rich Formatting
![image](docs/screenshots/chat.png)

### Images Generation
![image](docs/screenshots/generated-image.png)

### Call Other Model
![image](docs/screenshots/call-other.png)

### RAG (Retrieval-Augmented Generation)
![image](docs/screenshots/rag.png)

### Python Code Run in browser
![image](docs/screenshots/python-code-executor.png)

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/my-new-feature`
5. Submit a pull request


