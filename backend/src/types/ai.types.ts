import { MessageRole } from "../entities/Message";

export enum ApiProvider {
  AWS_BEDROCK = "bedrock",
  OPEN_AI = "open_ai",
}

export interface AIModelInfo {
  apiProvider: ApiProvider;
  provider: string;
  name: string;
  modelArn?: string;
  description: string;
  supportsStreaming: boolean;
  supportsTextIn: boolean;
  supportsTextOut: boolean;
  supportsImageIn: boolean;
  supportsImageOut: boolean;
  supportsEmbeddingsIn: boolean;
  currentRegion: string;
}

export interface ModelMessageFormat {
  role: MessageRole;
  content: string;
  timestamp?: Date;
}

export interface ModelResponse {
  type: "text" | "image";
  content: string;
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
    messages: ModelMessageFormat[],
    modelId: string,
    temperature?: number,
    maxTokens?: number
  ): Promise<GenerateResponseParams>;

  parseResponse(responseBody: any): ModelResponse;
}
