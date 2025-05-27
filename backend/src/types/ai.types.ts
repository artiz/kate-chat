import { MessageRole } from "../entities/Message";

export enum ApiProvider {
  AWS_BEDROCK = "bedrock",
  OPEN_AI = "open_ai",
}

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

export interface ModelMessageFormat {
  role: MessageRole;
  content: string;
  // TODO: Add support for images
  // contentType?: "text" | "image";
  timestamp?: Date;
}

export interface ModelResponse {
  type: "text" | "image";
  // TODO: Add support for > 1 image
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
