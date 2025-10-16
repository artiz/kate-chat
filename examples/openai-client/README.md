# OpenAI Client Demo

A standalone demo application showcasing the `@katechat/ui` package with direct OpenAI-compatible API integration.

## Features

- 🎨 Uses `@katechat/ui` components (`ChatMessagesContainer`, `ChatMessagesList`, `ChatInput`)
- 🔌 Direct browser connection to OpenAI-compatible APIs (OpenAI, Yandex FM, DeepSeek)
- 🔐 User-provided API key and endpoint configuration
- 🔄 Supports both Chat Completions and Text Completions APIs
- 📡 Built-in CORS proxy for development
- ⚡ Fast development with esbuild and HMR

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at http://localhost:3001

### Production Build

```bash
npm run build
```

The build output will be in the `dist/` folder.

## Configuration

1. Click the **Settings** button in the top right corner
2. Enter your API key
3. Select an API endpoint (OpenAI, Yandex FM, DeepSeek, or custom)
4. Choose API mode:
   - **Chat Completions**: Uses `/chat/completions` endpoint (recommended)
   - **Text Completions**: Uses `/completions` endpoint
5. Select or enter a model name
6. Click **Save Settings**

Your configuration is stored in localStorage.

## Supported API Providers

### OpenAI
- Endpoint: `https://api.openai.com/v1`
- Models: `gpt-4o`, `gpt-4.1-mini`, `gpt-4-turbo`, `gpt-3.5-turbo`

### Yandex Foundation Models
- Endpoint: `https://llm.api.cloud.yandex.net/foundationModels/v1`
- Models: `yandexgpt/latest`, `yandexgpt-lite/latest`

### DeepSeek
- Endpoint: `https://api.deepseek.com/v1`
- Models: `deepseek-chat`, `deepseek-reasoner`

### Custom
- Any OpenAI-compatible API endpoint

## Architecture

- **Frontend**: React 19 + TypeScript + @katechat/ui
- **Styling**: Mantine UI + SCSS modules
- **Build**: esbuild for fast bundling
- **API Client**: Custom streaming client with SSE support
- **CORS Proxy**: Node.js HTTP proxy for development (avoids CORS issues)

## Project Structure

```
src/
├── index.tsx              # App entry point
├── App.tsx                # Main app component
├── App.scss               # App styles
├── styles.scss            # Global styles
├── components/
│   └── SettingsForm.tsx   # API configuration form
└── lib/
    └── openai-client.ts   # OpenAI API client with streaming
```

## How It Works

### Chat Flow

1. User types a message in `ChatInput`
2. Message is added to the `messages` state
3. `OpenAIClient` sends request to the configured API endpoint
4. Response is streamed back chunk by chunk
5. `ChatMessagesList` displays messages in real-time
6. `ChatMessagesContainer` handles scrolling and layout

### CORS Proxy

In development mode, the app uses a proxy server to avoid CORS issues:
- Client makes request to `/proxy/{encoded-url}`
- Proxy forwards request to the actual API
- Response is streamed back with proper CORS headers

In production, you would deploy this behind a proper backend or use the API's CORS configuration.

## License

MIT
