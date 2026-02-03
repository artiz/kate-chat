import {
  ModelMessage,
  ModelResponse,
  StreamCallbacks,
  CompleteChatRequest,
  GetEmbeddingsRequest,
  EmbeddingsResponse,
} from "@/types/ai.types";

/**
 * Interface defining the protocol for interacting with AI models.
 * This includes methods for chat completion, streaming chat, and generating embeddings.
 */
export interface ModelProtocol {
  /**
   * Sends a chat completion request to the model and returns the full response.
   * @param request The configuration for the chat completion (e.g., model ID, temperature).
   * @param messages The history of messages in the conversation.
   * @returns A promise that resolves to the model's response.
   */
  completeChat(request: CompleteChatRequest, messages: ModelMessage[]): Promise<ModelResponse>;

  /**
   * Sends a chat completion request and streams the response back via callbacks.
   * @param inputRequest The configuration for the chat completion.
   * @param messages The history of messages in the conversation.
   * @param callbacks Callbacks to handle streaming events (start, progress, complete, error).
   * @returns A promise that resolves when the stream completes.
   */
  streamChatCompletion(
    inputRequest: CompleteChatRequest,
    messages: ModelMessage[],
    callbacks: StreamCallbacks
  ): Promise<void>;

  /**
   * Generates embeddings for the given input text.
   * @param request The request containing the text to embed and model parameters.
   * @returns A promise that resolves to the embeddings response.
   */
  getEmbeddings(request: GetEmbeddingsRequest): Promise<EmbeddingsResponse>;

  stopRequest(requestId: string): Promise<void>;
}
