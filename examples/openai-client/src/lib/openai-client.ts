export type ApiMode = "completions" | "responses";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export class OpenAIClient {
  private apiKey: string;
  private baseUrl: string;
  private mode: ApiMode;
  private useProxy: boolean;
  private controller: AbortController | null = null;

  constructor(apiKey: string, baseUrl: string, mode: ApiMode = "completions") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.mode = mode;
    // Use proxy for development to handle CORS
    this.useProxy = process.env.NODE_ENV === "development";
  }

  private getUrl(endpoint: string): string {
    const fullUrl = `${this.baseUrl}${endpoint}`;
    if (this.useProxy) {
      return `/proxy/${encodeURIComponent(fullUrl)}`;
    }
    return fullUrl;
  }

  async sendMessage(
    messages: ChatMessage[],
    model: string,
    onChunk?: (chunk: string) => void,
  ): Promise<string> {
    const endpoint =
      this.mode === "completions" ? "/chat/completions" : "/responses";
    const url = this.getUrl(endpoint);
    this.controller = new AbortController();

    const body =
      this.mode === "completions"
        ? {
            model,
            messages,
            stream: true,
          }
        : {
            model,
            input: messages,
            stream: true,
            max_output_tokens: 2000,
          };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: this.controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API Error: ${response.status} ${response.statusText}`;

      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        // If parsing fails, use the raw error text if available
        if (errorText) {
          errorMessage = errorText;
        }
      }

      throw new Error(errorMessage);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let fullContent = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((line) => line.trim() !== "");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.substring(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              let content = "";

              if (this.mode === "completions") {
                content = parsed.choices?.[0]?.delta?.content || "";
              } else {
                if (parsed.type === "response.output_text.delta") {
                  content = parsed.delta || "";
                }
              }

              if (content) {
                fullContent += content;
                onChunk?.(content);
              }
            } catch (e) {
              console.warn("Failed to parse SSE data:", data, e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      this.controller = null;
    }

    return fullContent;
  }

  stop() {
    this.controller?.abort();
  }
}
