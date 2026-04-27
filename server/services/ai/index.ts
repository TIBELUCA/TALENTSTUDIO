import { NoOpAiProvider, type AiProvider } from "./provider";
import { OpenAiProvider } from "./openai-provider";

let aiProvider: AiProvider;

export function initAi(): void {
  const providerName = process.env.AI_PROVIDER;
  if (providerName === "openai" && process.env.OPENAI_API_KEY) {
    aiProvider = new OpenAiProvider();
  } else {
    aiProvider = new NoOpAiProvider();
  }
}

export function getAiProvider(): AiProvider {
  if (!aiProvider) initAi();
  return aiProvider;
}

export function setAiProvider(provider: AiProvider): void {
  aiProvider = provider;
}

export { type AiProvider, type AiCompletionParams, type AiCompletionResult, NoOpAiProvider } from "./provider";
export { type AiRun, type AiFeedback, type AiRunWorkflow, type AiRunStatus, type AiFeedbackRating, type AiFeedbackType, type AiLanguage } from "./types";
export {
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
  type ConfigurationIssue,
  type MissingElement,
  type PricingWarning,
  type MarginRisk,
  type SuggestedFix,
  type RiskFlag,
  type MissingInfoItem,
  type RiskReviewItem,
  type AutoQuoteRequirement,
} from "./schemas";
export { summarizeEnquiry, recommendMachines, draftOfferText, recommendPresets, reviewRisks, autoQuote, guardConfigSafety, generateOfferEmbedding, searchSimilarOffers } from "./workflows";
export { buildEmbeddingText, findSimilarOffers, getAllEmbeddingOfferIds } from "./embeddings";
export { executeAiWorkflow, getAiRuns, getAiRunById } from "./runner";
export { recordAiFeedback, getFeedbackForRun, getFeedbackStats } from "./feedback";
export { refreshAllAnalytics, refreshForOffer } from "./analytics";
export type { QuoteContextData } from "./analytics";
