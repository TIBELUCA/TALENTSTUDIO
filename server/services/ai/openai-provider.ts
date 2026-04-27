import OpenAI from "openai";
import type { AiProvider, AiCompletionParams, AiCompletionResult, AiEmbeddingResult } from "./provider";

export class OpenAiProvider implements AiProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = process.env.AI_MODEL || "gpt-4o-mini";
  }

  async complete(params: AiCompletionParams): Promise<AiCompletionResult> {
    const response = await this.client.chat.completions.create({
      model: params.model || this.model,
      messages: params.messages.map(m => ({ role: m.role, content: m.content })),
      temperature: params.temperature ?? 0.3,
      max_tokens: params.maxTokens,
      response_format: params.responseFormat === "json" ? { type: "json_object" } : { type: "text" },
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content ?? "",
      model: response.model,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      finishReason: choice.finish_reason ?? "stop",
    };
  }

  async embed(text: string): Promise<AiEmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    return {
      embedding: response.data[0].embedding,
      model: response.model,
      totalTokens: response.usage.total_tokens,
    };
  }

  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  getDefaultModel(): string {
    return this.model;
  }
}
