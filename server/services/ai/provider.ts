export interface AiCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionParams {
  messages: AiCompletionMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json" | "text";
}

export interface AiCompletionResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  finishReason: string;
}

export interface AiEmbeddingResult {
  embedding: number[];
  model: string;
  totalTokens: number;
}

export interface AiProvider {
  complete(params: AiCompletionParams): Promise<AiCompletionResult>;
  embed(text: string): Promise<AiEmbeddingResult>;
  isAvailable(): boolean;
  getDefaultModel(): string;
}

export class NoOpAiProvider implements AiProvider {
  async complete(params: AiCompletionParams): Promise<AiCompletionResult> {
    const lastUserMessage = [...params.messages].reverse().find(m => m.role === "user");
    return {
      content: JSON.stringify({
        _noop: true,
        _message: "AI provider not configured. Install and configure an AI provider to enable this feature.",
        _inputPreview: lastUserMessage?.content.slice(0, 100) ?? "",
      }),
      model: "noop",
      promptTokens: 0,
      completionTokens: 0,
      finishReason: "noop",
    };
  }

  async embed(_text: string): Promise<AiEmbeddingResult> {
    return {
      embedding: [],
      model: "noop",
      totalTokens: 0,
    };
  }

  isAvailable(): boolean {
    return false;
  }

  getDefaultModel(): string {
    return "noop";
  }
}
