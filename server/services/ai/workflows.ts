import type { AiProvider } from "./provider";
import type { AiRun, AiLanguage } from "./types";
import {
  enquirySummaryOutputSchema,
  machineRecommendationOutputSchema,
  offerTextDraftOutputSchema,
  presetRecommendationOutputSchema,
  riskReviewOutputSchema,
  autoQuoteOutputSchema,
  similarOffersOutputSchema,
  configSafetyGuardOutputSchema,
  type EnquirySummaryOutput,
  type MachineRecommendationOutput,
  type OfferTextDraftOutput,
  type PresetRecommendationOutput,
  type RiskReviewOutput,
  type AutoQuoteOutput,
  type SimilarOffersOutput,
  type ConfigSafetyGuardOutput,
} from "./schemas";
import {
  buildEnquirySummaryPrompt,
  buildMachineRecommendationPrompt,
  buildOfferTextDraftPrompt,
  buildPresetRecommendationPrompt,
  buildRiskReviewPrompt,
  buildAutoQuotePrompt,
  buildConfigSafetyGuardPrompt,
} from "./prompts";
import { executeAiWorkflow } from "./runner";
import { buildEmbeddingText, findSimilarOffers, generateAndStoreEmbedding } from "./embeddings";
import { aiRunRepository } from "../../repositories/aiRuns";
import { randomUUID } from "crypto";

export async function summarizeEnquiry(
  provider: AiProvider,
  input: {
    enquirySubject: string;
    enquiryNotes: string;
    customerName: string;
    customerAddress?: string;
    dealerName?: string;
    attachmentNames: string[];
    existingItems: Array<{ machineName: string; quantity: number }>;
    language?: AiLanguage;
  },
  triggeredBy: string,
  enquiryId?: number,
): Promise<{ run: AiRun; output: EnquirySummaryOutput | null }> {
  const messages = buildEnquirySummaryPrompt(input);
  return executeAiWorkflow({
    provider,
    workflow: "enquiry_summary",
    messages,
    outputSchema: enquirySummaryOutputSchema,
    triggeredBy,
    enquiryId,
    input: { enquirySubject: input.enquirySubject, customerName: input.customerName, language: input.language ?? "en" },
  });
}

export async function recommendMachines(
  provider: AiProvider,
  input: {
    requirements: string;
    customerIndustry?: string;
    budget?: string;
    availableMachines: Array<{
      id: number;
      name: string;
      macroType: string | null;
      description: string;
      basePrice: string;
      options: Array<{ id: number; name: string; priceModifier: string }>;
    }>;
    language?: AiLanguage;
  },
  triggeredBy: string,
  offerId?: number,
): Promise<{ run: AiRun; output: MachineRecommendationOutput | null }> {
  const messages = buildMachineRecommendationPrompt(input);
  return executeAiWorkflow({
    provider,
    workflow: "machine_recommendation",
    messages,
    outputSchema: machineRecommendationOutputSchema,
    triggeredBy,
    offerId,
    input: { requirements: input.requirements, machineCount: input.availableMachines.length, language: input.language ?? "en" },
  });
}

export async function draftOfferText(
  provider: AiProvider,
  input: {
    offerSubject: string;
    customerName: string;
    selectedMachines: Array<{ name: string; description: string; quantity: number }>;
    availableSections: Array<{ id: string; name: string }>;
    availablePresets: Array<{ id: number; title: string; content: string }>;
    notes?: string;
    tone?: "formal" | "concise" | "persuasive";
    language?: AiLanguage;
  },
  triggeredBy: string,
  offerId?: number,
): Promise<{ run: AiRun; output: OfferTextDraftOutput | null }> {
  const messages = buildOfferTextDraftPrompt(input);
  return executeAiWorkflow({
    provider,
    workflow: "offer_text_draft",
    messages,
    outputSchema: offerTextDraftOutputSchema,
    triggeredBy,
    offerId,
    input: { offerSubject: input.offerSubject, customerName: input.customerName, machineCount: input.selectedMachines.length, language: input.language ?? "en" },
  });
}

export async function recommendPresets(
  provider: AiProvider,
  input: {
    offerSubject: string;
    customerName: string;
    selectedMachines: Array<{
      id: number;
      name: string;
      macroType: string | null;
      options: Array<{ id: number; name: string }>;
    }>;
    availablePresets: Array<{ id: number; title: string; content: string; category?: string }>;
    availableOptions: Array<{ id: number; name: string; machineId: number; machineName: string }>;
    notes?: string;
    language?: AiLanguage;
  },
  triggeredBy: string,
  offerId?: number,
): Promise<{ run: AiRun; output: PresetRecommendationOutput | null }> {
  const messages = buildPresetRecommendationPrompt(input);
  return executeAiWorkflow({
    provider,
    workflow: "preset_recommendation",
    messages,
    outputSchema: presetRecommendationOutputSchema,
    triggeredBy,
    offerId,
    input: { offerSubject: input.offerSubject, customerName: input.customerName, machineCount: input.selectedMachines.length, language: input.language ?? "en" },
  });
}

export async function reviewRisks(
  provider: AiProvider,
  input: {
    offerSubject: string;
    customerName: string;
    customerAddress?: string;
    totalPrice?: string;
    selectedMachines: Array<{ name: string; quantity: number; unitPrice?: string }>;
    selectedPresets: Array<{ title: string; content: string }>;
    offerNotes?: string;
    enquiryNotes?: string;
    language?: AiLanguage;
  },
  triggeredBy: string,
  offerId?: number,
): Promise<{ run: AiRun; output: RiskReviewOutput | null }> {
  const messages = buildRiskReviewPrompt(input);
  return executeAiWorkflow({
    provider,
    workflow: "risk_review",
    messages,
    outputSchema: riskReviewOutputSchema,
    triggeredBy,
    offerId,
    input: { offerSubject: input.offerSubject, customerName: input.customerName, machineCount: input.selectedMachines.length, language: input.language ?? "en" },
  });
}

export async function autoQuote(
  provider: AiProvider,
  input: {
    enquirySubject: string;
    enquiryNotes: string;
    customerName: string;
    customerAddress?: string;
    dealerName?: string;
    attachmentNames: string[];
    salesmanNotes?: string;
    availableMachines: Array<{
      id: number;
      name: string;
      macroType: string | null;
      description: string;
      basePrice: string;
      options: Array<{ id: number; name: string; priceModifier: string }>;
    }>;
    availableSections: Array<{ id: string; name: string }>;
    availablePresets: Array<{ id: number; title: string; content: string }>;
    language?: AiLanguage;
  },
  triggeredBy: string,
  enquiryId?: number,
): Promise<{ run: AiRun; output: AutoQuoteOutput | null }> {
  const messages = buildAutoQuotePrompt(input);
  return executeAiWorkflow({
    provider,
    workflow: "auto_quote",
    messages,
    outputSchema: autoQuoteOutputSchema,
    triggeredBy,
    enquiryId,
    input: {
      enquirySubject: input.enquirySubject,
      customerName: input.customerName,
      machineCount: input.availableMachines.length,
      presetCount: input.availablePresets.length,
      language: input.language ?? "en",
    },
  });
}

export async function guardConfigSafety(
  provider: AiProvider,
  input: {
    offerSubject: string;
    customerName: string;
    customerAddress?: string;
    totalPrice?: string;
    selectedMachines: Array<{
      name: string;
      quantity: number;
      unitPrice?: string;
      macroType?: string | null;
      options: Array<{ name: string; priceModifier?: string }>;
    }>;
    selectedPresets: Array<{ title: string; content: string }>;
    offerNotes?: string;
    enquiryNotes?: string;
    historicalContext?: string;
    language?: AiLanguage;
  },
  triggeredBy: string,
  offerId?: number,
): Promise<{ run: AiRun; output: ConfigSafetyGuardOutput | null }> {
  const messages = buildConfigSafetyGuardPrompt(input);
  return executeAiWorkflow({
    provider,
    workflow: "config_safety_guard",
    messages,
    outputSchema: configSafetyGuardOutputSchema,
    triggeredBy,
    offerId,
    input: {
      offerSubject: input.offerSubject,
      customerName: input.customerName,
      machineCount: input.selectedMachines.length,
      presetCount: input.selectedPresets.length,
      totalPrice: input.totalPrice ?? "N/A",
      language: input.language ?? "en",
    },
  });
}

export async function generateOfferEmbedding(
  provider: AiProvider,
  offer: {
    id: number;
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
  },
): Promise<{ stored: boolean }> {
  const embeddingText = buildEmbeddingText({
    subject: offer.subject,
    customerName: offer.customerName,
    machines: offer.machines,
    presets: offer.presets,
    notes: offer.notes,
  });

  const machineReference = offer.machines.map(m => m.name).join(", ") || "No machines";
  const optionsSummary = offer.machines
    .flatMap(m => m.options ?? [])
    .join(", ") || "No options";

  const result = await generateAndStoreEmbedding(provider, {
    offerId: offer.id,
    machineReference,
    optionsSummary,
    textualSummary: embeddingText.slice(0, 500),
  }, embeddingText);

  return { stored: result.stored };
}

export async function searchSimilarOffers(
  provider: AiProvider,
  input: {
    queryText: string;
    topK?: number;
    excludeOfferIds?: number[];
  },
  triggeredBy: string,
  enquiryId?: number,
): Promise<{ run: AiRun; output: SimilarOffersOutput | null }> {
  const runId = randomUUID();
  await aiRunRepository.create({
    id: runId,
    workflow: "similar_offers",
    status: "pending",
    input: { queryPreview: input.queryText.slice(0, 200), topK: input.topK ?? 5 },
    output: null,
    error: null,
    model: provider.getDefaultModel(),
    provider: null,
    promptTokens: null,
    completionTokens: null,
    durationMs: null,
    triggeredBy,
    entityType: null,
    entityId: null,
    offerId: null,
    enquiryId: enquiryId ?? null,
    completedAt: null,
  });

  if (!provider.isAvailable()) {
    const updated = await aiRunRepository.update(runId, {
      status: "failed",
      error: "AI provider not configured",
      completedAt: new Date(),
    });
    return {
      run: toAiRunFromRecord(updated),
      output: null,
    };
  }

  await aiRunRepository.update(runId, { status: "running" });
  const startTime = Date.now();

  try {
    const embeddingResult = await provider.embed(input.queryText);
    if (!embeddingResult.embedding || embeddingResult.embedding.length === 0) {
      const updated = await aiRunRepository.update(runId, {
        status: "failed",
        error: "Embedding generation returned empty result",
        durationMs: Date.now() - startTime,
        completedAt: new Date(),
      });
      return { run: toAiRunFromRecord(updated), output: null };
    }

    const matches = await findSimilarOffers(
      embeddingResult.embedding,
      input.topK ?? 5,
      input.excludeOfferIds ?? [],
    );

    const output: SimilarOffersOutput = {
      matches,
      queryContext: input.queryText.slice(0, 300),
      searchDimensionality: embeddingResult.embedding.length,
      confidence: matches.length > 0 ? matches[0].similarityScore : 0,
    };

    const validation = similarOffersOutputSchema.safeParse(output);
    if (!validation.success) {
      const errorMsg = `Output validation failed: ${validation.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
      const updated = await aiRunRepository.update(runId, {
        status: "failed",
        output: output as unknown as Record<string, unknown>,
        error: errorMsg,
        durationMs: Date.now() - startTime,
        completedAt: new Date(),
      });
      return { run: toAiRunFromRecord(updated), output: null };
    }

    const durationMs = Date.now() - startTime;
    const updated = await aiRunRepository.update(runId, {
      status: "completed",
      output: validation.data as unknown as Record<string, unknown>,
      model: embeddingResult.model,
      durationMs,
      completedAt: new Date(),
    });

    return { run: toAiRunFromRecord(updated), output: validation.data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const updated = await aiRunRepository.update(runId, {
      status: "failed",
      error: message,
      durationMs: Date.now() - startTime,
      completedAt: new Date(),
    });
    return { run: toAiRunFromRecord(updated), output: null };
  }
}

function toAiRunFromRecord(record: {
  id: string;
  workflow: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  model: string;
  provider: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number | null;
  triggeredBy: string;
  entityType: string | null;
  entityId: number | null;
  offerId: number | null;
  enquiryId: number | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}): AiRun {
  return {
    id: record.id,
    workflow: record.workflow as AiRun["workflow"],
    status: record.status as AiRun["status"],
    input: (record.input ?? {}) as Record<string, unknown>,
    output: (record.output ?? null) as Record<string, unknown> | null,
    error: record.error,
    model: record.model,
    provider: record.provider,
    promptTokens: record.promptTokens,
    completionTokens: record.completionTokens,
    durationMs: record.durationMs,
    triggeredBy: record.triggeredBy,
    entityType: record.entityType,
    entityId: record.entityId,
    offerId: record.offerId,
    enquiryId: record.enquiryId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
  };
}
