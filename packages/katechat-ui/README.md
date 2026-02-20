# @katechat/ui

[![npm version](https://badge.fury.io/js/@katechat%2Fui.svg)](https://www.npmjs.com/package/@katechat/ui)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

KateChat - AI Chat Interface UI Components Library

A comprehensive collection of React components, hooks, and utilities for building AI chat interfaces. This package is extracted from the [KateChat](https://github.com/artiz/kate-chat) project to provide reusable UI modules for AI-powered chat applications.

## Installation

```bash
npm install @katechat/ui
```

or

```bash
yarn add @katechat/ui
```

or

```bash
pnpm add @katechat/ui
```

## Peer Dependencies

This package requires the following peer dependencies:

```json
{
  "@mantine/core": "8.3.3",
  "@mantine/dates": "8.3.3",
  "@mantine/form": "8.3.3",
  "@mantine/hooks": "8.3.3",
  "@mantine/modals": "8.3.3",
  "@mantine/notifications": "8.3.3",
  "@tabler/icons-react": "^3.1.0",
  "react": "19.1.0",
  "react-dom": "19.1.0",
  "react-redux": "^9.2.0",
  "react-router-dom": "^6.23.1"
}
```

## Features

- 🎨 **Built with Mantine UI** - Modern, accessible components
- 💬 **Chat Components** - Ready-to-use chat message containers and lists
- 🔌 **Modular Architecture** - Import only what you need
- 🎯 **TypeScript** - Full type safety
- 🪝 **Custom Hooks** - Reusable React hooks
- 🎨 **Theme Support** - Customizable theming system
- 📝 **Markdown Support** - Rich text rendering with code highlighting

## Package Structure

This package is distributed with both ESM and CommonJS builds for maximum compatibility:

```
dist/
├── esm/           # ES Module build (import)
├── cjs/           # CommonJS build (require)
└── types/         # TypeScript type definitions
```

The package automatically uses the correct build format based on your bundler and module system.

### Components

#### Chat Components (`./components/chat`)

- **ChatMessagesContainer** - Container component for chat messages with scrolling behavior
- **ChatMessagesList** - List component for rendering chat messages
- **Chat Input** - Input components for user messages
- **Chat Message** - Individual message display components

#### Modal Components (`./components/modal`)

- **ImagePopup** - Modal for displaying images in fullscreen

#### Icon Components (`./components/icons`)

- **ProviderIcon** - Icons for different AI providers (OpenAI, Anthropic, etc.)

### Controls

#### File Controls (`./controls`)

- **FileDropzone** - Drag-and-drop file upload component

### Core Types & Utilities (`./core`)

Type definitions and utilities for:

- **Message Types** - Chat message structures and interfaces
- **Model Types** - AI model configurations and metadata
- **User Types** - User profile and authentication types
- **AI Types** - AI provider and configuration types

### Hooks (`./hooks`)

Custom React hooks:

- **useIntersectionObserver** - Detect element visibility for lazy loading and infinite scroll
- **useTheme** - Access and manage application theme

### Libraries (`./lib`)

- **Markdown Parser** - Parse and render markdown with syntax highlighting
  - Supports code blocks with language detection
  - KaTeX math rendering
  - Syntax highlighting with highlight.js

## Usage

### Importing Styles

The package includes pre-bundled CSS with all Mantine styles. Import it in your main entry file:

```scss
// In your main SCSS file
@import "@katechat/ui/styles.css";
```

Or in your JavaScript/TypeScript:

```typescript
// In your main entry file (e.g., index.tsx)
import "@katechat/ui/styles.css";
```

### Basic Import

```typescript
import { ChatMessagesContainer, ChatMessagesList, FileDropzone, useTheme, useIntersectionObserver } from "@katechat/ui";
```

### Using Chat Components

```tsx
import { ChatMessagesContainer, ChatMessagesList } from "@katechat/ui";

function ChatView({ messages }) {
  return (
    <ChatMessagesContainer>
      <ChatMessagesList messages={messages} />
    </ChatMessagesContainer>
  );
}
```

### Using File Upload

```tsx
import { FileDropzone } from "@katechat/ui";

function UploadArea() {
  const handleFileDrop = (files: File[]) => {
    console.log("Files uploaded:", files);
  };

  return <FileDropzone onDrop={handleFileDrop} />;
}
```

### Using Custom Hooks

```tsx
import { useTheme, useIntersectionObserver } from "@katechat/ui";

function MyComponent() {
  const { theme, setTheme } = useTheme();

  const { ref, isIntersecting } = useIntersectionObserver({
    threshold: 0.5,
  });

  return <div ref={ref}>{isIntersecting && <div>Element is visible!</div>}</div>;
}
```

### Using Markdown Parser

```tsx
import { parseMarkdown } from "@katechat/ui";

function MessageRenderer({ content }) {
  const html = parseMarkdown(content);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
```

## Development

This package is part of the [KateChat](https://github.com/artiz/kate-chat) monorepo.

### Building

```bash
npm run build
```

### Type Checking

```bash
npm run typecheck
```

### Testing

```bash
npm test
```

### Formatting

```bash
npm run format
```

## Dependencies

The package includes the following built-in dependencies:

- **highlight.js** - Syntax highlighting for code blocks
- **i18next** - Internationalization framework
- **lodash** - Utility functions
- **marked** - Markdown parser
- **marked-highlight** - Syntax highlighting for marked
- **marked-katex-extension** - KaTeX math rendering for marked

## Contributing

Contributions are welcome! Please visit the main repository at [https://github.com/artiz/kate-chat](https://github.com/artiz/kate-chat) to contribute.

## License

MIT

## Links

- **GitHub Repository**: [https://github.com/artiz/kate-chat](https://github.com/artiz/kate-chat)
- **Issues**: [https://github.com/artiz/kate-chat/issues](https://github.com/artiz/kate-chat/issues)
- **NPM Package**: [https://www.npmjs.com/package/@katechat/ui](https://www.npmjs.com/package/@katechat/ui)

## Support

For questions, issues, or feature requests, please open an issue on the [GitHub repository](https://github.com/artiz/kate-chat/issues).

---

Made with ❤️ by the KateChat team
