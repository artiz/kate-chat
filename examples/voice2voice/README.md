# Voice2Voice OpenAI Demo

This example demonstrates how to use the OpenAI Realtime API with WebRTC for voice-to-voice interaction directly in the browser.

## Features

- **WebRTC Connection**: Connects directly to OpenAI's Realtime API.
- **Voice Visualization**: Displays a real-time audio spectrum for both user input and AI response.
- **Chat History**: Transcribes the conversation and displays it as a chat.
- **Local Settings**: functionality to provide your own API key (stored in local storage).

## Prerequisites

- OpenAI API Key with access to `gpt-4o-realtime-preview` models.

## How to Run

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run development server:
   ```bash
   npm run dev
   ```

3. Open `http://localhost:8890` in your browser.

4. Enter your OpenAI API Key in the settings.

## Implementation Details

- `App.tsx`: Main application logic.
- `hooks/useWebRTC.ts`: Handles the WebRTC connection, ephemeral token generation, and data channel events.
- `components/AudioVisualizer.tsx`: Canvas-based audio spectrum visualization using Web Audio API.

## Notes

This is a client-side demo. In a production environment, the ephemeral token generation should happen on your secure backend to avoid exposing your API credentials client-side. The demo asks for your API key solely to request this token from the client for demonstration purposes.
