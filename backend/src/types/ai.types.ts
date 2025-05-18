import { MessageRole } from "../entities/Message";
import { Model } from "../entities/Model";

export interface MessageFormat {
  role: MessageRole;
  content: string;
}

export interface StreamCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

export interface ModelProvider {
  generateResponse(
    messages: MessageFormat[],
    modelId: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<string>;
  
  streamResponse(
    messages: MessageFormat[],
    modelId: string,
    callbacks: StreamCallbacks,
    temperature?: number,
    maxTokens?: number
  ): Promise<void>;
}

export const DEFAULT_MODEL_PROVIDER = "Anthropic";
export const DEFAULT_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";
