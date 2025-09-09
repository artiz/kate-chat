import {
  EmbeddingsResponse,
  GetEmbeddingsRequest,
  InvokeModelParamsRequest,
  ModelResponse,
  StreamCallbacks,
} from "@/types/ai.types";
import OpenAI from "openai";

export interface BaseChatProtocol {
  invokeModel(request: InvokeModelParamsRequest): Promise<ModelResponse>;
  invokeModelAsync(inputRequest: InvokeModelParamsRequest, callbacks: StreamCallbacks): Promise<void>;
  getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse>;

  get api(): OpenAI;
}
