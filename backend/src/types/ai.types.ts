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

export type GenerateResponseParams = {
  params: {
    modelId: string;
    body: string;
  };
};

export interface ModelServiceProvider {
  generateResponseParams(
    messages: MessageFormat[],
    modelId: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<GenerateResponseParams>;

  parseResponse(responseBody: any): string;
}
