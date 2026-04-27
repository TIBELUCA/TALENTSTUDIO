import { db } from "../../db";
import { offerEmbeddings } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { AiProvider, AiEmbeddingResult } from "./provider";
import { logIntegration } from "../integrations/logger";

export interface OfferEmbeddingInput {
  offerId: number;
  machineReference: string;
  optionsSummary: string;
  textualSummary: string;
}

export function buildEmbeddingText(input: {
  subject: string;
  customerName?: string;
  machines: Array<{
    name: string;
    macroType?: string | null;
    description?: string;
    options?: string[];
  }>;
  presets?: string[];
  notes?: string;
}): string {
  const parts: string[] = [];
  parts.push(`Offer: ${input.subject}`);
  if (input.customerName) parts.push(`Customer: ${input.customerName}`);

  for (const m of input.machines) {
    parts.push(`Machine: ${m.name}${m.macroType ? ` (${m.macroType})` : ""}`);
    if (m.description) parts.push(`Description: ${m.description.slice(0, 300)}`);
    if (m.options && m.options.length > 0) parts.push(`Options: ${m.options.join(", ")}`);
  }

  if (input.presets && input.presets.length > 0) {
    parts.push(`Terms: ${input.presets.join(", ")}`);
  }
  if (input.notes) parts.push(`Notes: ${input.notes.slice(0, 200)}`);

  return parts.join("\n");
}

export async function generateAndStoreEmbedding(
  provider: AiProvider,
  embeddingInput: OfferEmbeddingInput,
  embeddingText: string,
): Promise<{ embedding: number[] | null; stored: boolean }> {
  if (!provider.isAvailable()) {
    logIntegration({
      service: "ai",
      action: "generate_embedding",
      status: "failure",
      message: "AI provider not available for embedding generation",
    });
    return { embedding: null, stored: false };
  }

  const startTime = Date.now();
  let result: AiEmbeddingResult;
  try {
    result = await provider.embed(embeddingText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logIntegration({
      service: "ai",
      action: "generate_embedding",
      status: "failure",
      message: `Embedding generation failed: ${message}`,
      durationMs: Date.now() - startTime,
    });
    return { embedding: null, stored: false };
  }

  if (!result.embedding || result.embedding.length === 0) {
    return { embedding: null, stored: false };
  }

  await db.delete(offerEmbeddings).where(eq(offerEmbeddings.offerId, embeddingInput.offerId));

  await db.insert(offerEmbeddings).values({
    offerId: embeddingInput.offerId,
    embedding: result.embedding as unknown as Record<string, unknown>,
    machineReference: embeddingInput.machineReference,
    optionsSummary: embeddingInput.optionsSummary,
    textualSummary: embeddingInput.textualSummary,
  });

  logIntegration({
    service: "ai",
    action: "generate_embedding",
    status: "success",
    message: `Stored embedding for offer ${embeddingInput.offerId} (${result.totalTokens} tokens, dim=${result.embedding.length})`,
    durationMs: Date.now() - startTime,
  });

  return { embedding: result.embedding, stored: true };
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

export interface SimilarOfferMatch {
  offerId: number;
  machineReference: string;
  optionsSummary: string;
  textualSummary: string;
  similarityScore: number;
}

export async function findSimilarOffers(
  queryEmbedding: number[],
  topK: number = 5,
  excludeOfferIds: number[] = [],
): Promise<SimilarOfferMatch[]> {
  const allEmbeddings = await db.select().from(offerEmbeddings);

  const scored: SimilarOfferMatch[] = [];
  for (const record of allEmbeddings) {
    if (excludeOfferIds.includes(record.offerId)) continue;

    const storedVec = record.embedding as unknown as number[];
    if (!Array.isArray(storedVec) || storedVec.length === 0) continue;

    const score = cosineSimilarity(queryEmbedding, storedVec);
    const clampedScore = Math.max(0, Math.min(1, score));
    scored.push({
      offerId: record.offerId,
      machineReference: record.machineReference,
      optionsSummary: record.optionsSummary,
      textualSummary: record.textualSummary,
      similarityScore: Math.round(clampedScore * 1000) / 1000,
    });
  }

  scored.sort((a, b) => b.similarityScore - a.similarityScore);
  return scored.slice(0, topK);
}

export async function getAllEmbeddingOfferIds(): Promise<number[]> {
  const rows = await db.select({ offerId: offerEmbeddings.offerId }).from(offerEmbeddings);
  return rows.map(r => r.offerId);
}
