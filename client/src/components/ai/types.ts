export type AiLanguage = "en" | "it";

export interface RiskFlag {
  severity: "low" | "medium" | "high";
  category: string;
  message: string;
  suggestion?: string;
}

export interface MissingInfoItem {
  field: string;
  label: string;
  importance: "required" | "recommended" | "optional";
  reason: string;
}

export interface EnquirySummaryOutput {
  summary: string;
  customerIntent: string;
  keyRequirements: string[];
  missingInformation: MissingInfoItem[];
  riskFlags: RiskFlag[];
  suggestedPriority: "low" | "medium" | "high" | "urgent";
  estimatedComplexity: "simple" | "moderate" | "complex";
  confidence: number;
}

export interface MachineRecommendation {
  machineId: number;
  machineName: string;
  score: number;
  reasoning: string;
  assumptions?: string;
  suggestedOptions: Array<{ optionId: number; optionName: string; reasoning: string }>;
  suggestedQuantity: number;
}

export interface MachineRecommendationOutput {
  recommendations: MachineRecommendation[];
  generalNotes?: string;
  dataGaps?: string[];
  confidence: number;
}

export interface DraftSection {
  sectionId: string;
  sectionName: string;
  draftText: string;
  notes?: string;
}

export interface OfferTextDraftOutput {
  subject: string;
  introduction?: string;
  sections: DraftSection[];
  closingParagraph?: string;
  suggestedPresetIds: number[];
  riskFlags: RiskFlag[];
  tone?: "formal" | "concise" | "persuasive";
  confidence: number;
}

export interface PresetSuggestion {
  presetId: number;
  presetTitle: string;
  reasoning: string;
  relevanceScore: number;
}

export interface OptionSuggestion {
  optionId: number;
  optionName: string;
  machineId: number;
  machineName: string;
  reasoning: string;
  compatibilityNotes?: string;
}

export interface PresetRecommendationOutput {
  suggestedPresets: PresetSuggestion[];
  suggestedOptions: OptionSuggestion[];
  exclusionWarnings?: string[];
  generalNotes?: string;
  confidence: number;
}

export interface RiskReviewItem {
  category: "commercial" | "technical" | "communication" | "pricing" | "compliance";
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  recommendation: string;
  requiresManualReview: boolean;
}

export interface RiskReviewOutput {
  overallRiskLevel: "low" | "medium" | "high";
  items: RiskReviewItem[];
  missingCommercialDetails: string[];
  missingTechnicalDetails: string[];
  pricingFlags: string[];
  recommendedActions: string[];
  confidence: number;
}

export interface AutoQuoteRequirement {
  category: "machine_type" | "capacity" | "material" | "dimensions" | "constraint" | "other";
  label: string;
  value: string;
  confidence: "explicit" | "inferred" | "uncertain";
}

export interface AutoQuoteMachine {
  machineId: number;
  machineName: string;
  score: number;
  reasoning: string;
  suggestedQuantity: number;
  suggestedOptions: Array<{ optionId: number; optionName: string; reasoning: string }>;
}

export interface AutoQuotePreset {
  presetId: number;
  presetTitle: string;
  reasoning: string;
  relevanceScore: number;
}

export interface AutoQuoteDraftSection {
  sectionId: string;
  sectionName: string;
  draftText: string;
}

export interface AutoQuoteOutput {
  summary: string;
  customerIntent: string;
  extractedRequirements: AutoQuoteRequirement[];
  recommendedMachines: AutoQuoteMachine[];
  recommendedPresets: AutoQuotePreset[];
  draftSubject: string;
  draftIntroduction?: string;
  draftSections: AutoQuoteDraftSection[];
  draftClosing?: string;
  missingInformation: MissingInfoItem[];
  riskFlags: RiskFlag[];
  suggestedPriority: "low" | "medium" | "high" | "urgent";
  estimatedComplexity: "simple" | "moderate" | "complex";
  confidence: number;
}

export interface SimilarOfferMatchItem {
  offerId: number;
  machineReference: string;
  optionsSummary: string;
  textualSummary: string;
  similarityScore: number;
}

export interface SimilarOffersOutput {
  matches: SimilarOfferMatchItem[];
  queryContext: string;
  searchDimensionality?: number;
  confidence: number;
}

export interface ConfigurationIssue {
  category: "incompatible_combo" | "unusual_config" | "missing_option" | "redundant_option";
  severity: "low" | "medium" | "high" | "critical";
  machineNames: string[];
  optionNames?: string[];
  title: string;
  description: string;
  suggestedFix: string;
}

export interface MissingElement {
  category: "installation" | "training" | "warranty" | "delivery" | "payment_terms" | "spare_parts" | "documentation" | "other";
  element: string;
  importance: "required" | "recommended" | "optional";
  description: string;
  suggestedAction: string;
}

export interface PricingWarning {
  type: "below_market" | "above_market" | "margin_risk" | "discount_anomaly" | "missing_price";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  affectedItems: string[];
  suggestedAction: string;
}

export interface MarginRisk {
  overallMarginAssessment: "healthy" | "attention" | "warning" | "critical";
  estimatedMarginCategory: "high" | "moderate" | "low" | "negative";
  factors: string[];
  recommendations: string[];
}

export interface SuggestedFix {
  issueRef: string;
  fixType: "add_option" | "remove_option" | "replace_machine" | "add_preset" | "adjust_quantity" | "review_pricing" | "add_terms";
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  estimatedImpact: string;
}

export interface ConfigSafetyGuardOutput {
  configurationIssues: ConfigurationIssue[];
  missingElements: MissingElement[];
  pricingWarnings: PricingWarning[];
  marginRisk: MarginRisk;
  suggestedFixes: SuggestedFix[];
  overallSafetyScore: number;
  readyToSend: boolean;
  blockers: string[];
  advisoryNotes: string[];
  confidence: number;
}

export type AiWorkflowType =
  | "enquiry_summary"
  | "offer_text_draft"
  | "machine_recommendation"
  | "preset_recommendation"
  | "risk_review"
  | "auto_quote"
  | "similar_offers"
  | "config_safety_guard"
  | "sales_brain";

export type AiRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface AiRun {
  id: string;
  workflow: AiWorkflowType;
  status: AiRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
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
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type AiWorkflowOutput =
  | EnquirySummaryOutput
  | MachineRecommendationOutput
  | OfferTextDraftOutput
  | PresetRecommendationOutput
  | RiskReviewOutput
  | AutoQuoteOutput
  | SimilarOffersOutput
  | ConfigSafetyGuardOutput
  | SalesBrainData;

export interface MachineUsageStat {
  id: number;
  machineId: number;
  machineName: string;
  macroType: string | null;
  usageCount: number;
  avgPrice: string | null;
  avgQuantity: string | null;
  totalRevenue: string | null;
  lastUsedAt: string | null;
  updatedAt: string;
}

export interface OptionUsageStat {
  id: number;
  machineOptionId: number;
  optionName: string;
  machineId: number;
  usageCount: number;
  coOccurrenceOptionIds: number[] | null;
  avgQuantity: string | null;
  updatedAt: string;
}

export interface PricingDistribution {
  id: number;
  machineId: number;
  machineName: string;
  macroType: string | null;
  minPrice: string | null;
  maxPrice: string | null;
  avgPrice: string | null;
  medianPrice: string | null;
  sampleCount: number;
  priceBuckets: { min: number; max: number; count: number }[] | null;
  updatedAt: string;
}

export interface OfferPattern {
  id: number;
  patternType: "machine_combo" | "option_bundle" | "preset_group";
  patternData: Record<string, unknown>;
  frequency: number;
  confidence: string | null;
  lastSeenAt: string | null;
  updatedAt: string;
}

export interface SalesInsight {
  id: number;
  insightType: "top_machines" | "pricing_trend" | "common_configs" | "sector_recommendation";
  insightData: Record<string, unknown>;
  confidence: string | null;
  computedAt: string;
  validUntil: string | null;
}

export interface QuoteContext {
  machineStats: MachineUsageStat[];
  pricingDistributions: PricingDistribution[];
  commonOptions: OptionUsageStat[];
}

export interface SalesBrainData {
  insights: SalesInsight[];
  machineStats: MachineUsageStat[];
  optionStats: OptionUsageStat[];
  pricingDistributions: PricingDistribution[];
  patterns: OfferPattern[];
  quoteContext: QuoteContext | null;
}
