import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { bedrockClient, BEDROCK_MODEL_IDS } from '../config/bedrock';
import { MessageRole } from '../entities/Message';

interface MessageFormat {
  role: string;
  content: string;
}

interface StreamCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

export class AIService {
  
  // Main method to interact with models
  async generateResponse(
    messages: MessageFormat[], 
    modelId: string,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<string> {
    if (modelId.startsWith('anthropic.')) {
      return this.generateAnthropicResponse(messages, modelId, temperature, maxTokens);
    } else if (modelId.startsWith('amazon.')) {
      return this.generateAmazonResponse(messages, modelId, temperature, maxTokens);
    } else if (modelId.startsWith('ai21.')) {
      return this.generateAI21Response(messages, modelId, temperature, maxTokens);
    } else if (modelId.startsWith('cohere.')) {
      return this.generateCohereResponse(messages, modelId, temperature, maxTokens);
    } else if (modelId.startsWith('meta.')) {
      return this.generateLlamaResponse(messages, modelId, temperature, maxTokens);
    } else if (modelId.startsWith('mistral.')) {
      return this.generateMistralResponse(messages, modelId, temperature, maxTokens);
    }
    
    throw new Error('Unsupported model provider');
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
      
      if (modelId.startsWith('anthropic.')) {
        await this.streamAnthropicResponse(messages, modelId, callbacks, temperature, maxTokens);
      } else if (modelId.startsWith('amazon.')) {
        await this.streamAmazonResponse(messages, modelId, callbacks, temperature, maxTokens);
      } else if (modelId.startsWith('mistral.')) {
        await this.streamMistralResponse(messages, modelId, callbacks, temperature, maxTokens);
      } else {
        // For models that don't support streaming, use the regular generation and simulate streaming
        const fullResponse = await this.generateResponse(messages, modelId, temperature, maxTokens);
        
        // Simulate streaming by sending chunks of the response
        const chunks = fullResponse.split(' ');
        for (const chunk of chunks) {
          callbacks.onToken?.(chunk + ' ');
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
      role: msg.role === MessageRole.ASSISTANT ? 'assistant' : 'user',
      content: msg.content
    }));
    
    const params = {
      modelId,
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        messages: anthropicMessages,
        temperature
      })
    };
    
    try {
      const command = new InvokeModelCommand(params);
      const response = await bedrockClient.send(command);
      
      // Parse the response body
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.content[0].text || '';
    } catch (error) {
      console.error('Error calling Anthropic model:', error);
      throw error;
    }
  }

  // Amazon Titan models
  private async generateAmazonResponse(
    messages: MessageFormat[],
    modelId: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    // Convert messages to a single prompt for Amazon models
    let prompt = '';
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
    prompt += 'Assistant:';
    
    const params = {
      modelId,
      body: JSON.stringify({
        inputText: prompt,
        textGenerationConfig: {
          maxTokenCount: maxTokens,
          temperature,
          stopSequences: ['Human:']
        }
      })
    };
    
    try {
      const command = new InvokeModelCommand(params);
      const response = await bedrockClient.send(command);
      
      // Parse the response body
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.results?.[0]?.outputText || '';
    } catch (error) {
      console.error('Error calling Amazon model:', error);
      throw error;
    }
  }

  // AI21 Jurassic models
  private async generateAI21Response(
    messages: MessageFormat[],
    modelId: string,
    temperature: number,
    maxTokens: number
  ): Promise<string> {
    // Convert messages to a single prompt
    let prompt = '';
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
    prompt += 'Assistant:';
    
    const params = {
      modelId,
      body: JSON.stringify({
        prompt,
        maxTokens,
        temperature,
        stopSequences: ['Human:']
      })
    };
    
    try {
      const command = new InvokeModelCommand(params);
      const response = await bedrockClient.send(command);
      
      // Parse the response body
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.completions?.[0]?.data?.text || '';
    } catch (error) {
      console.error('Error calling AI21 model:', error);
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
    let prompt = '';
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
    prompt += 'Chatbot:';
    
    const params = {
      modelId,
      body: JSON.stringify({
        prompt,
        max_tokens: maxTokens,
        temperature,
        stop_sequences: ['User:']
      })
    };
    
    try {
      const command = new InvokeModelCommand(params);
      const response = await bedrockClient.send(command);
      
      // Parse the response body
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.generations?.[0]?.text || '';
    } catch (error) {
      console.error('Error calling Cohere model:', error);
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
          role: 'user',
          content: msg.content
        });
      } else if (msg.role === MessageRole.ASSISTANT) {
        llamaMessages.push({
          role: 'assistant',
          content: msg.content
        });
      } else if (msg.role === MessageRole.SYSTEM) {
        llamaMessages.push({
          role: 'system',
          content: msg.content
        });
      }
    }
    
    const params = {
      modelId,
      body: JSON.stringify({
        messages: llamaMessages,
        max_gen_len: maxTokens,
        temperature
      })
    };
    
    try {
      const command = new InvokeModelCommand(params);
      const response = await bedrockClient.send(command);
      
      // Parse the response body
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.generation || '';
    } catch (error) {
      console.error('Error calling Llama model:', error);
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
          role: 'user',
          content: msg.content
        });
      } else if (msg.role === MessageRole.ASSISTANT) {
        mistralMessages.push({
          role: 'assistant',
          content: msg.content
        });
      } else if (msg.role === MessageRole.SYSTEM) {
        mistralMessages.push({
          role: 'system',
          content: msg.content
        });
      }
    }
    
    const params = {
      modelId,
      body: JSON.stringify({
        messages: mistralMessages,
        max_tokens: maxTokens,
        temperature
      })
    };
    
    try {
      const command = new InvokeModelCommand(params);
      const response = await bedrockClient.send(command);
      
      // Parse the response body
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.outputs[0]?.text || '';
    } catch (error) {
      console.error('Error calling Mistral model:', error);
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
    const chunks = response.split(' ');
    let fullResponse = '';
    
    for (const chunk of chunks) {
      const token = chunk + ' ';
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
    const chunks = response.split(' ');
    let fullResponse = '';
    
    for (const chunk of chunks) {
      const token = chunk + ' ';
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
    const chunks = response.split(' ');
    let fullResponse = '';
    
    for (const chunk of chunks) {
      const token = chunk + ' ';
      fullResponse += token;
      callbacks.onToken?.(token);
      // Add a small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    
    callbacks.onComplete?.(fullResponse);
  }

  // Helper method to get all supported models
  static getSupportedModels() {
    return BEDROCK_MODEL_IDS;
  }
}