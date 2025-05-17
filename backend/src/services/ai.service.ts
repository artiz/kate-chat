import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";
import { bedrockClient, bedrockManagementClient, BEDROCK_MODEL_IDS } from "../config/bedrock";
import { MessageRole } from "../entities/Message";
import { ModelProvider } from "../entities/ModelProvider";
import { Model } from "../entities/Model";

interface MessageFormat {
  role: MessageRole;
  content: string;
}

interface StreamCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

export const DEFAULT_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

export class AIService {
  // Main method to interact with models
  async generateResponse(
    messages: MessageFormat[],
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<string> {
    // join user duplicate messages
    messages = messages.reduce((acc: MessageFormat[], msg: MessageFormat) => {
      const lastMessage = acc[acc.length - 1];
      if (lastMessage && lastMessage.role === msg.role) {
        if (lastMessage.content === msg.content) {
          return acc;
        } else {
          lastMessage.content += "\n" + msg.content;
        }
      }
      return [...acc, msg];
    }, []);
    
    if (modelId.startsWith("anthropic.")) {
      return this.generateAnthropicResponse(messages, modelId, temperature, maxTokens);
    } else if (modelId.startsWith("amazon.")) {
      return this.generateAmazonResponse(messages, modelId, temperature, maxTokens);
    } else if (modelId.startsWith("ai21.")) {
      return this.generateAI21Response(messages, modelId, temperature, maxTokens);
    } else if (modelId.startsWith("cohere.")) {
      return this.generateCohereResponse(messages, modelId, temperature, maxTokens);
    } else if (modelId.startsWith("meta.")) {
      return this.generateLlamaResponse(messages, modelId, temperature, maxTokens);
    } else if (modelId.startsWith("mistral.")) {
      return this.generateMistralResponse(messages, modelId, temperature, maxTokens);
    }

    throw new Error("Unsupported model provider");
  }

  // Stream response from models
  async streamResponse(
    messages: MessageFormat[],
    modelId: string,
    callbacks: StreamCallbacks,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<void> {
    try {
      callbacks.onStart?.();

      if (modelId.startsWith("anthropic.")) {
        await this.streamAnthropicResponse(messages, modelId, callbacks, temperature, maxTokens);
      } else if (modelId.startsWith("amazon.")) {
        await this.streamAmazonResponse(messages, modelId, callbacks, temperature, maxTokens);
      } else if (modelId.startsWith("mistral.")) {
        await this.streamMistralResponse(messages, modelId, callbacks, temperature, maxTokens);
      } else {
        // For models that don't support streaming, use the regular generation and simulate streaming
        const fullResponse = await this.generateResponse(messages, modelId, temperature, maxTokens);

        // Simulate streaming by sending chunks of the response
        const chunks = fullResponse.split(" ");
        for (const chunk of chunks) {
          callbacks.onToken?.(chunk + " ");
          // Add a small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        callbacks.onComplete?.(fullResponse);
      }
    } catch (error) {
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Anthropic Claude models
  private async generateAnthropicResponse(
    messages: MessageFormat[],
    modelId: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    // Convert messages to Anthropic format
    const anthropicMessages = messages.map(msg => ({
      role: msg.role === MessageRole.ASSISTANT ? "assistant" : "user",
      content: msg.content,
    }));

    const params = {
      modelId,
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: maxTokens,
        messages: anthropicMessages,
        temperature,
      }),
    };

    const command = new InvokeModelCommand(params);
    const response = await bedrockClient.send(command);

    // Parse the response body
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.content[0].text || "";
  }

  // Amazon Titan models
  private async generateAmazonResponse(
    messages: MessageFormat[],
    modelId: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    // Convert messages to a single prompt for Amazon models
    let prompt = "";
    for (const msg of messages) {
      if (msg.role === MessageRole.USER) {
        prompt += `Human: ${msg.content}\n`;
      } else if (msg.role === MessageRole.ASSISTANT) {
        prompt += `Assistant: ${msg.content}\n`;
      } else if (msg.role === MessageRole.SYSTEM) {
        // Prepend system message
        prompt = `System: ${msg.content}\n` + prompt;
      }
    }

    // Add the final assistant prompt
    prompt += "Assistant:";

    const params = {
      modelId,
      body: JSON.stringify({
        inputText: prompt,
        textGenerationConfig: {
          maxTokenCount: maxTokens,
          temperature,
          stopSequences: ["Human:"],
        },
      }),
    };

    const command = new InvokeModelCommand(params);
    const response = await bedrockClient.send(command);

    // Parse the response body
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.results?.[0]?.outputText || "";

  }

  // AI21 Jurassic models
  private async generateAI21Response(
    messages: MessageFormat[],
    modelId: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    // Convert messages to a single prompt
    let prompt = "";
    for (const msg of messages) {
      if (msg.role === MessageRole.USER) {
        prompt += `Human: ${msg.content}\n`;
      } else if (msg.role === MessageRole.ASSISTANT) {
        prompt += `Assistant: ${msg.content}\n`;
      } else if (msg.role === MessageRole.SYSTEM) {
        // Prepend system message
        prompt = `System: ${msg.content}\n` + prompt;
      }
    }

    // Add the final assistant prompt
    prompt += "Assistant:";

    const params = {
      modelId,
      body: JSON.stringify({
        prompt,
        maxTokens,
        temperature,
        stopSequences: ["Human:"],
      }),
    };

    try {
      const command = new InvokeModelCommand(params);
      const response = await bedrockClient.send(command);

      // Parse the response body
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.completions?.[0]?.data?.text || "";
    } catch (error) {
      console.error("Error calling AI21 model:", error);
      throw error;
    }
  }

  // Cohere Command models
  private async generateCohereResponse(
    messages: MessageFormat[],
    modelId: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    // Convert messages to Cohere format
    let prompt = "";
    for (const msg of messages) {
      if (msg.role === MessageRole.USER) {
        prompt += `User: ${msg.content}\n`;
      } else if (msg.role === MessageRole.ASSISTANT) {
        prompt += `Chatbot: ${msg.content}\n`;
      } else if (msg.role === MessageRole.SYSTEM) {
        // Add as preamble
        prompt = `${msg.content}\n\n` + prompt;
      }
    }

    // Add the final chatbot prompt
    prompt += "Chatbot:";

    const params = {
      modelId,
      body: JSON.stringify({
        prompt,
        max_tokens: maxTokens,
        temperature,
        stop_sequences: ["User:"],
      }),
    };

    try {
      const command = new InvokeModelCommand(params);
      const response = await bedrockClient.send(command);

      // Parse the response body
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.generations?.[0]?.text || "";
    } catch (error) {
      console.error("Error calling Cohere model:", error);
      throw error;
    }
  }

  // Meta Llama models
  private async generateLlamaResponse(
    messages: MessageFormat[],
    modelId: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    // Convert messages to Llama chat format
    const llamaMessages = [];

    for (const msg of messages) {
      if (msg.role === MessageRole.USER) {
        llamaMessages.push({
          role: "user",
          content: msg.content,
        });
      } else if (msg.role === MessageRole.ASSISTANT) {
        llamaMessages.push({
          role: "assistant",
          content: msg.content,
        });
      } else if (msg.role === MessageRole.SYSTEM) {
        llamaMessages.push({
          role: "system",
          content: msg.content,
        });
      }
    }

    const params = {
      modelId,
      body: JSON.stringify({
        messages: llamaMessages,
        max_gen_len: maxTokens,
        temperature,
      }),
    };

    try {
      const command = new InvokeModelCommand(params);
      const response = await bedrockClient.send(command);

      // Parse the response body
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.generation || "";
    } catch (error) {
      console.error("Error calling Llama model:", error);
      throw error;
    }
  }

  // Mistral models
  private async generateMistralResponse(
    messages: MessageFormat[],
    modelId: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    // Convert messages to Mistral format
    const mistralMessages = [];

    for (const msg of messages) {
      if (msg.role === MessageRole.USER) {
        mistralMessages.push({
          role: "user",
          content: msg.content,
        });
      } else if (msg.role === MessageRole.ASSISTANT) {
        mistralMessages.push({
          role: "assistant",
          content: msg.content,
        });
      } else if (msg.role === MessageRole.SYSTEM) {
        mistralMessages.push({
          role: "system",
          content: msg.content,
        });
      }
    }

    const params = {
      modelId,
      body: JSON.stringify({
        messages: mistralMessages,
        max_tokens: maxTokens,
        temperature,
      }),
    };

    try {
      const command = new InvokeModelCommand(params);
      const response = await bedrockClient.send(command);

      // Parse the response body
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.outputs[0]?.text || "";
    } catch (error) {
      console.error("Error calling Mistral model:", error);
      throw error;
    }
  }

  // Streaming implementations
  private async streamAnthropicResponse(
    messages: MessageFormat[],
    modelId: string,
    callbacks: StreamCallbacks,
    temperature: number,
    maxTokens: number
  ): Promise<void> {
    // In a real implementation, you would use the streaming API
    // For simplicity, we're simulating it with the regular API
    const response = await this.generateAnthropicResponse(messages, modelId, temperature, maxTokens);
    const chunks = response.split(" ");
    let fullResponse = "";

    for (const chunk of chunks) {
      const token = chunk + " ";
      fullResponse += token;
      callbacks.onToken?.(token);
      // Add a small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    callbacks.onComplete?.(fullResponse);
  }

  private async streamAmazonResponse(
    messages: MessageFormat[],
    modelId: string,
    callbacks: StreamCallbacks,
    temperature: number,
    maxTokens: number
  ): Promise<void> {
    // Simulate streaming for Amazon models
    const response = await this.generateAmazonResponse(messages, modelId, temperature, maxTokens);
    const chunks = response.split(" ");
    let fullResponse = "";

    for (const chunk of chunks) {
      const token = chunk + " ";
      fullResponse += token;
      callbacks.onToken?.(token);
      // Add a small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    callbacks.onComplete?.(fullResponse);
  }

  private async streamMistralResponse(
    messages: MessageFormat[],
    modelId: string,
    callbacks: StreamCallbacks,
    temperature: number,
    maxTokens: number
  ): Promise<void> {
    // Simulate streaming for Mistral models
    const response = await this.generateMistralResponse(messages, modelId, temperature, maxTokens);
    const chunks = response.split(" ");
    let fullResponse = "";

    for (const chunk of chunks) {
      const token = chunk + " ";
      fullResponse += token;
      callbacks.onToken?.(token);
      // Add a small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    callbacks.onComplete?.(fullResponse);
  }

  // Adapter method for message resolver
  async getCompletion(messages: any[], model: Model): Promise<string> {
    // Convert DB message objects to MessageFormat structure
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    // Use the existing generate method
    return this.generateResponse(
      formattedMessages,
      model.modelId || DEFAULT_MODEL_ID,
      0.7,
      2048
    );
  }

  // Helper method to get all supported models
  static getSupportedModels() {
    return BEDROCK_MODEL_IDS;
  }

  // Fetch model providers from AWS Bedrock
  static async getModelProviders(): Promise<ModelProvider[]> {
    const providers: Map<string, ModelProvider> = new Map();

    try {
      // Get real foundation model data from AWS Bedrock
      const command = new ListFoundationModelsCommand({});
      const response = await bedrockManagementClient.send(command);

      // Process the model list and extract providers
      if (response.modelSummaries && response.modelSummaries.length > 0) {
        for (const model of response.modelSummaries) {
          if (model.providerName) {
            const providerName = model.providerName;

            if (!providers.has(providerName)) {
              const provider = new ModelProvider();
              provider.name = providerName;
              provider.description = `${providerName} models on AWS Bedrock`;
              provider.apiType = "bedrock";
              provider.isActive = true;

              providers.set(providerName, provider);
            }
          }
        }
      }

      // If no providers were found from the API (possibly due to permissions),
      // extract unique providers from our predefined model list
      if (providers.size === 0) {
        for (const [modelId, modelInfo] of Object.entries(BEDROCK_MODEL_IDS)) {
          if (!providers.has(modelInfo.provider)) {
            const provider = new ModelProvider();
            provider.name = modelInfo.provider;
            provider.description = `${modelInfo.provider} models on AWS Bedrock`;
            provider.apiType = "bedrock";
            provider.isActive = true;

            providers.set(modelInfo.provider, provider);
          }
        }
      }

      return Array.from(providers.values());
    } catch (error) {
      console.error("Error fetching model providers from AWS Bedrock:", error);

      // Fallback to our predefined list of providers if API call fails
      const uniqueProviders = new Set(Object.values(BEDROCK_MODEL_IDS).map(model => model.provider));

      return Array.from(uniqueProviders).map(providerName => {
        const provider = new ModelProvider();
        provider.name = providerName;
        provider.description = `${providerName} models on AWS Bedrock`;
        provider.apiType = "bedrock";
        provider.isActive = true;
        return provider;
      });
    }
  }
}
