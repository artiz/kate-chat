import { Mode } from "fs";
import { MessageRole } from "../entities/Message";

export enum ApiProvider {
  AWS_BEDROCK = "bedrock",
  OPEN_AI = "open_ai",
}

export type ContentType = "text" | "image" | "video" | "audio";
export interface ProviderInfo {
  id: ApiProvider;
  name: string;
  isConnected: boolean;
  costsInfoAvailable?: boolean;
  details: Record<string, string | number | boolean | undefined>;
}

export interface Amount {
  amount: number;
  currency: string;
}

export interface ServiceCostInfo {
  name: string;
  type: string; // e.g., "project", "service"
  amounts: Amount[];
}

export interface UsageCostInfo {
  start: Date;
  end?: Date;
  error?: string;
  costs: ServiceCostInfo[];
}

export interface AIModelInfo {
  apiProvider: ApiProvider;
  provider: string;
  name: string;
  description: string;
  supportsStreaming: boolean;
  supportsTextIn: boolean;
  supportsTextOut: boolean;
  supportsImageIn: boolean;
  supportsImageOut: boolean;
  supportsEmbeddingsIn: boolean;
}

export interface ModelMessageContent {
  content: string;
  contentType?: ContentType;
  timestamp?: Date;
}

export interface ModelMessageFormat {
  role: MessageRole;
  body: string | ModelMessageContent[];
  timestamp?: Date;
}

export interface ModelResponse {
  type: ContentType;
  // TODO: Add support for > 1 image
  content: string;
}

export interface StreamCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

export type InvokeModelParamsResponse = {
  params: {
    modelId: string;
    body: string;
  };
};

export type InvokeModelParamsRequest = {
  systemPrompt?: string;
  messages: ModelMessageFormat[];
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
};

export interface BedrockModelServiceProvider<T = any> {
  getInvokeModelParams(request: InvokeModelParamsRequest): Promise<InvokeModelParamsResponse>;

  // TODO: setup typed response
  parseResponse(responseBody: T, request?: InvokeModelParamsRequest): ModelResponse;
}
