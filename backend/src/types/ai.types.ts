import { MessageRole } from "../entities/Message";
import { Model } from "../entities/Model";

export interface MessageFormat {
  role: MessageRole;
  content: string;
  timestamp?: Date;
}

export interface StreamCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

export interface ModelServiceProvider {
  generateResponse(messages: MessageFormat[], modelId: string, temperature?: number, maxTokens?: number): Promise<any>;

  parseResponse(responseBody: any): string;
}

export const DEFAULT_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";
