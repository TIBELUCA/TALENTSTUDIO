import { z } from "zod";

export const riskFlagSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  category: z.string(),
  message: z.string(),
  suggestion: z.string().optional(),
});

export const missingInfoItemSchema = z.object({
  field: z.string(),
  label: z.string(),
  importance: z.enum(["required", "recommended", "optional"]),
  reason: z.string(),
});

export const enquirySummaryOutputSchema = z.object({
  summary: z.string(),
  customerIntent: z.string(),
  keyRequirements: z.array(z.string()),
  missingInformation: z.array(missingInfoItemSchema),
  riskFlags: z.array(riskFlagSchema),
  suggestedPriority: z.enum(["low", "medium", "high", "urgent"]),
  estimatedComplexity: z.enum(["simple", "moderate", "complex"]),
  confidence: z.number().min(0).max(1),
}).strict();

export const machineRecommendationSchema = z.object({
  machineId: z.number(),
  machineName: z.string(),
  score: z.number().min(0).max(1),
  reasoning: z.string(),
  assumptions: z.string().optional(),
  suggestedOptions: z.array(z.object({
    optionId: z.number(),
    optionName: z.string(),
    reasoning: z.string(),
  })),
  suggestedQuantity: z.number().int().min(1),
});

export const machineRecommendationOutputSchema = z.object({
  recommendations: z.array(machineRecommendationSchema),
  generalNotes: z.string().optional(),
  dataGaps: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
}).strict();

export const draftSectionSchema = z.object({
  sectionId: z.string(),
  sectionName: z.string(),
  draftText: z.string(),
  notes: z.string().optional(),
});

export const offerTextDraftOutputSchema = z.object({
  subject: z.string(),
  introduction: z.string().optional(),
  sections: z.array(draftSectionSchema),
  closingParagraph: z.string().optional(),
  suggestedPresetIds: z.array(z.number()),
  riskFlags: z.array(riskFlagSchema),
  tone: z.enum(["formal", "concise", "persuasive"]).optional(),
  confidence: z.number().min(0).max(1),
}).strict();

export const presetSuggestionSchema = z.object({
  presetId: z.number(),
  presetTitle: z.string(),
  reasoning: z.string(),
  relevanceScore: z.number().min(0).max(1),
});

export const optionSuggestionSchema = z.object({
  optionId: z.number(),
  optionName: z.string(),
  machineId: z.number(),
  machineName: z.string(),
  reasoning: z.string(),
  compatibilityNotes: z.string().optional(),
});

export const presetRecommendationOutputSchema = z.object({
  suggestedPresets: z.array(presetSuggestionSchema),
  suggestedOptions: z.array(optionSuggestionSchema),
  exclusionWarnings: z.array(z.string()).optional(),
  generalNotes: z.string().optional(),
  confidence: z.number().min(0).max(1),
}).strict();

export const riskReviewItemSchema = z.object({
  category: z.enum(["commercial", "technical", "communication", "pricing", "compliance"]),
  severity: z.enum(["low", "medium", "high"]),
  title: z.string(),
  description: z.string(),
  recommendation: z.string(),
  requiresManualReview: z.boolean(),
});

export const riskReviewOutputSchema = z.object({
  overallRiskLevel: z.enum(["low", "medium", "high"]),
  items: z.array(riskReviewItemSchema),
  missingCommercialDetails: z.array(z.string()),
  missingTechnicalDetails: z.array(z.string()),
  pricingFlags: z.array(z.string()),
  recommendedActions: z.array(z.string()),
  confidence: z.number().min(0).max(1),
}).strict();

export const autoQuoteRequirementSchema = z.object({
  category: z.enum(["machine_type", "capacity", "material", "dimensions", "constraint", "other"]),
  label: z.string(),
  value: z.string(),
  confidence: z.enum(["explicit", "inferred", "uncertain"]),
});

export const autoQuoteMachineSchema = z.object({
  machineId: z.number(),
  machineName: z.string(),
  score: z.number().min(0).max(1),
  reasoning: z.string(),
  suggestedQuantity: z.number().int().min(1),
  suggestedOptions: z.array(z.object({
    optionId: z.number(),
    optionName: z.string(),
    reasoning: z.string(),
  })),
});

export const autoQuotePresetSchema = z.object({
  presetId: z.number(),
  presetTitle: z.string(),
  reasoning: z.string(),
  relevanceScore: z.number().min(0).max(1),
});

export const autoQuoteDraftSectionSchema = z.object({
  sectionId: z.string(),
  sectionName: z.string(),
  draftText: z.string(),
});

export const autoQuoteOutputSchema = z.object({
  summary: z.string(),
  customerIntent: z.string(),
  extractedRequirements: z.array(autoQuoteRequirementSchema),
  recommendedMachines: z.array(autoQuoteMachineSchema),
  recommendedPresets: z.array(autoQuotePresetSchema),
  draftSubject: z.string(),
  draftIntroduction: z.string().optional(),
  draftSections: z.array(autoQuoteDraftSectionSchema),
  draftClosing: z.string().optional(),
  missingInformation: z.array(missingInfoItemSchema),
  riskFlags: z.array(riskFlagSchema),
  suggestedPriority: z.enum(["low", "medium", "high", "urgent"]),
  estimatedComplexity: z.enum(["simple", "moderate", "complex"]),
  confidence: z.number().min(0).max(1),
}).strict();

export type EnquirySummaryOutput = z.infer<typeof enquirySummaryOutputSchema>;
export type MachineRecommendationOutput = z.infer<typeof machineRecommendationOutputSchema>;
export type OfferTextDraftOutput = z.infer<typeof offerTextDraftOutputSchema>;
export type PresetRecommendationOutput = z.infer<typeof presetRecommendationOutputSchema>;
export type RiskReviewOutput = z.infer<typeof riskReviewOutputSchema>;
export const similarOfferMatchSchema = z.object({
  offerId: z.number(),
  machineReference: z.string(),
  optionsSummary: z.string(),
  textualSummary: z.string(),
  similarityScore: z.number().min(0).max(1),
});

export const similarOffersOutputSchema = z.object({
  matches: z.array(similarOfferMatchSchema),
  queryContext: z.string(),
  searchDimensionality: z.number().optional(),
  confidence: z.number().min(0).max(1),
}).strict();

export const configurationIssueSchema = z.object({
  category: z.enum(["incompatible_combo", "unusual_config", "missing_option", "redundant_option"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  machineNames: z.array(z.string()),
  optionNames: z.array(z.string()).optional(),
  title: z.string(),
  description: z.string(),
  suggestedFix: z.string(),
});

export const missingElementSchema = z.object({
  category: z.enum(["installation", "training", "warranty", "delivery", "payment_terms", "spare_parts", "documentation", "other"]),
  element: z.string(),
  importance: z.enum(["required", "recommended", "optional"]),
  description: z.string(),
  suggestedAction: z.string(),
});

export const pricingWarningSchema = z.object({
  type: z.enum(["below_market", "above_market", "margin_risk", "discount_anomaly", "missing_price"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  title: z.string(),
  description: z.string(),
  affectedItems: z.array(z.string()),
  suggestedAction: z.string(),
});

export const marginRiskSchema = z.object({
  overallMarginAssessment: z.enum(["healthy", "attention", "warning", "critical"]),
  estimatedMarginCategory: z.enum(["high", "moderate", "low", "negative"]),
  factors: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export const suggestedFixSchema = z.object({
  issueRef: z.string(),
  fixType: z.enum(["add_option", "remove_option", "replace_machine", "add_preset", "adjust_quantity", "review_pricing", "add_terms"]),
  title: z.string(),
  description: z.string(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  estimatedImpact: z.string(),
});

export const configSafetyGuardOutputSchema = z.object({
  configurationIssues: z.array(configurationIssueSchema),
  missingElements: z.array(missingElementSchema),
  pricingWarnings: z.array(pricingWarningSchema),
  marginRisk: marginRiskSchema,
  suggestedFixes: z.array(suggestedFixSchema),
  overallSafetyScore: z.number().min(0).max(1),
  readyToSend: z.boolean(),
  blockers: z.array(z.string()),
  advisoryNotes: z.array(z.string()),
  confidence: z.number().min(0).max(1),
}).strict();

export type AutoQuoteOutput = z.infer<typeof autoQuoteOutputSchema>;
export type SimilarOffersOutput = z.infer<typeof similarOffersOutputSchema>;
export type SimilarOfferMatch = z.infer<typeof similarOfferMatchSchema>;
export type ConfigSafetyGuardOutput = z.infer<typeof configSafetyGuardOutputSchema>;
export type ConfigurationIssue = z.infer<typeof configurationIssueSchema>;
export type MissingElement = z.infer<typeof missingElementSchema>;
export type PricingWarning = z.infer<typeof pricingWarningSchema>;
export type MarginRisk = z.infer<typeof marginRiskSchema>;
export type SuggestedFix = z.infer<typeof suggestedFixSchema>;
export type RiskFlag = z.infer<typeof riskFlagSchema>;
export type MissingInfoItem = z.infer<typeof missingInfoItemSchema>;
export type RiskReviewItem = z.infer<typeof riskReviewItemSchema>;
export type AutoQuoteRequirement = z.infer<typeof autoQuoteRequirementSchema>;
