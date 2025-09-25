import {
  EmbeddingsResponse,
  GetEmbeddingsRequest,
  CompleteChatRequest,
  ModelResponse,
  StreamCallbacks,
} from "@/types/ai.types";
import OpenAI from "openai";

export interface BaseChatProtocol {
  completeChat(request: CompleteChatRequest): Promise<ModelResponse>;
  streamChatCompletion(inputRequest: CompleteChatRequest, callbacks: StreamCallbacks): Promise<void>;
  getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse>;

  get api(): OpenAI;
}
