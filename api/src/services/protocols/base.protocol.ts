import {
  EmbeddingsResponse,
  GetEmbeddingsRequest,
  CompleteChatRequest,
  ModelResponse,
  StreamCallbacks,
} from "@/types/ai.types";
import OpenAI from "openai";

export type ApiType = "completions" | "responses" | "default";

export interface BaseChatProtocol {
  completeChat(request: CompleteChatRequest, apiType?: ApiType): Promise<ModelResponse>;
  streamChatCompletion(inputRequest: CompleteChatRequest, callbacks: StreamCallbacks, apiType?: ApiType): Promise<void>;
  getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse>;

  get api(): OpenAI;
}
