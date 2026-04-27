import { Router } from "express";
import { requireSalesRole, getPerformedBy } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { aiRateLimiter } from "../middlewares/rateLimiter";
import { validate } from "../validators";
import { AppError } from "../errors";
import { z } from "zod";
import {
  getAiProvider,
  summarizeEnquiry,
  recommendMachines,
  draftOfferText,
  recommendPresets,
  reviewRisks,
  autoQuote,
  guardConfigSafety,
  generateOfferEmbedding,
  searchSimilarOffers,
  getAiRuns,
  getAiRunById,
  recordAiFeedback,
  getFeedbackForRun,
  getFeedbackStats,
} from "../services";
import { settingsRepository } from "../repositories";

async function checkAiEnabled(req: import("express").Request): Promise<void> {
  const enabled = await settingsRepository.getAiEnabled(req.companyId);
  if (!enabled) {
    throw new AppError(503, "AI services are disabled in system settings");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new AppError(503, "AI provider is not configured: missing API key");
  }
}

const router = Router();

const languageSchema = z.enum(["en", "it"]).optional().default("en");

const enquirySummaryRequestSchema = z.object({
  enquirySubject: z.string().min(1),
  enquiryNotes: z.string(),
  customerName: z.string().min(1),
  customerAddress: z.string().optional(),
  dealerName: z.string().optional(),
  attachmentNames: z.array(z.string()).optional().default([]),
  existingItems: z.array(z.object({
    machineName: z.string(),
    quantity: z.number().int().min(1),
  })).optional().default([]),
  language: languageSchema,
  enquiryId: z.number().int().optional(),
});

const machineRecommendationRequestSchema = z.object({
  requirements: z.string().min(1),
  customerIndustry: z.string().optional(),
  budget: z.string().optional(),
  availableMachines: z.array(z.object({
    id: z.number().int(),
    name: z.string(),
    macroType: z.string().nullable(),
    description: z.string(),
    basePrice: z.string(),
    options: z.array(z.object({
      id: z.number().int(),
      name: z.string(),
      priceModifier: z.string(),
    })),
  })),
  language: languageSchema,
  offerId: z.number().int().optional(),
});

const offerDraftRequestSchema = z.object({
  offerSubject: z.string().min(1),
  customerName: z.string().min(1),
  selectedMachines: z.array(z.object({
    name: z.string(),
    description: z.string(),
    quantity: z.number().int().min(1),
  })),
  availableSections: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })),
  availablePresets: z.array(z.object({
    id: z.number().int(),
    title: z.string(),
    content: z.string(),
  })),
  notes: z.string().optional(),
  tone: z.enum(["formal", "concise", "persuasive"]).optional(),
  language: languageSchema,
  offerId: z.number().int().optional(),
});

const presetRecommendationRequestSchema = z.object({
  offerSubject: z.string().min(1),
  customerName: z.string().min(1),
  selectedMachines: z.array(z.object({
    id: z.number().int(),
    name: z.string(),
    macroType: z.string().nullable(),
    options: z.array(z.object({
      id: z.number().int(),
      name: z.string(),
    })),
  })),
  availablePresets: z.array(z.object({
    id: z.number().int(),
    title: z.string(),
    content: z.string(),
    category: z.string().optional(),
  })),
  availableOptions: z.array(z.object({
    id: z.number().int(),
    name: z.string(),
    machineId: z.number().int(),
    machineName: z.string(),
  })),
  notes: z.string().optional(),
  language: languageSchema,
  offerId: z.number().int().optional(),
});

const riskReviewRequestSchema = z.object({
  offerSubject: z.string().min(1),
  customerName: z.string().min(1),
  customerAddress: z.string().optional(),
  totalPrice: z.string().optional(),
  selectedMachines: z.array(z.object({
    name: z.string(),
    quantity: z.number().int().min(1),
    unitPrice: z.string().optional(),
  })),
  selectedPresets: z.array(z.object({
    title: z.string(),
    content: z.string(),
  })).optional().default([]),
  offerNotes: z.string().optional(),
  enquiryNotes: z.string().optional(),
  language: languageSchema,
  offerId: z.number().int().optional(),
});

const autoQuoteRequestSchema = z.object({
  enquirySubject: z.string().min(1),
  enquiryNotes: z.string(),
  customerName: z.string().min(1),
  customerAddress: z.string().optional(),
  dealerName: z.string().optional(),
  attachmentNames: z.array(z.string()).optional().default([]),
  salesmanNotes: z.string().optional(),
  availableMachines: z.array(z.object({
    id: z.number().int(),
    name: z.string(),
    macroType: z.string().nullable(),
    description: z.string(),
    basePrice: z.string(),
    options: z.array(z.object({
      id: z.number().int(),
      name: z.string(),
      priceModifier: z.string(),
    })),
  })),
  availableSections: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })).optional().default([]),
  availablePresets: z.array(z.object({
    id: z.number().int(),
    title: z.string(),
    content: z.string(),
  })).optional().default([]),
  language: languageSchema,
  enquiryId: z.number().int().optional(),
});

const configSafetyGuardRequestSchema = z.object({
  offerSubject: z.string().min(1),
  customerName: z.string().min(1),
  customerAddress: z.string().optional(),
  totalPrice: z.string().optional(),
  selectedMachines: z.array(z.object({
    name: z.string(),
    quantity: z.number().int().min(1),
    unitPrice: z.string().optional(),
    macroType: z.string().nullable().optional(),
    options: z.array(z.object({
      name: z.string(),
      priceModifier: z.string().optional(),
    })),
  })).min(1),
  selectedPresets: z.array(z.object({
    title: z.string(),
    content: z.string(),
  })),
  offerNotes: z.string().optional(),
  enquiryNotes: z.string().optional(),
  historicalContext: z.string().optional(),
  language: languageSchema,
  offerId: z.number().int().optional(),
});

const generateEmbeddingRequestSchema = z.object({
  offerId: z.number().int(),
  subject: z.string().min(1),
  customerName: z.string().optional(),
  machines: z.array(z.object({
    name: z.string(),
    macroType: z.string().nullable().optional(),
    description: z.string().optional(),
    options: z.array(z.string()).optional(),
  })),
  presets: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const similarOffersRequestSchema = z.object({
  queryText: z.string().min(1),
  topK: z.number().int().min(1).max(20).optional().default(5),
  excludeOfferIds: z.array(z.number().int()).optional().default([]),
  enquiryId: z.number().int().optional(),
});

const feedbackRequestSchema = z.object({
  runId: z.string().uuid(),
  rating: z.enum(["accepted", "rejected", "modified"]),
  feedbackType: z.enum(["overall", "field_level", "suggestion"]).optional(),
  fieldKey: z.string().optional(),
  originalValue: z.string().optional(),
  modifiedValue: z.string().optional(),
  score: z.number().int().min(1).max(5).optional(),
  comment: z.string().optional(),
});

router.post("/api/assistant/summarize-enquiry", requireSalesRole, aiRateLimiter, validate(enquirySummaryRequestSchema), asyncHandler(async (req, res) => {
  await checkAiEnabled(req);
  const provider = getAiProvider();
  const performedBy = await getPerformedBy(req);
  const { enquiryId, ...input } = req.body;
  const result = await summarizeEnquiry(provider, input, performedBy, enquiryId);
  res.json(result);
}));

router.post("/api/assistant/recommend-machines", requireSalesRole, aiRateLimiter, validate(machineRecommendationRequestSchema), asyncHandler(async (req, res) => {
  await checkAiEnabled(req);
  const provider = getAiProvider();
  const performedBy = await getPerformedBy(req);
  const { offerId, ...input } = req.body;
  const result = await recommendMachines(provider, input, performedBy, offerId);
  res.json(result);
}));

router.post("/api/assistant/draft-offer-text", requireSalesRole, aiRateLimiter, validate(offerDraftRequestSchema), asyncHandler(async (req, res) => {
  await checkAiEnabled(req);
  const provider = getAiProvider();
  const performedBy = await getPerformedBy(req);
  const { offerId, ...input } = req.body;
  const result = await draftOfferText(provider, input, performedBy, offerId);
  res.json(result);
}));

router.post("/api/assistant/recommend-presets", requireSalesRole, aiRateLimiter, validate(presetRecommendationRequestSchema), asyncHandler(async (req, res) => {
  await checkAiEnabled(req);
  const provider = getAiProvider();
  const performedBy = await getPerformedBy(req);
  const { offerId, ...input } = req.body;
  const result = await recommendPresets(provider, input, performedBy, offerId);
  res.json(result);
}));

router.post("/api/assistant/review-risks", requireSalesRole, aiRateLimiter, validate(riskReviewRequestSchema), asyncHandler(async (req, res) => {
  await checkAiEnabled(req);
  const provider = getAiProvider();
  const performedBy = await getPerformedBy(req);
  const { offerId, ...input } = req.body;
  const result = await reviewRisks(provider, input, performedBy, offerId);
  res.json(result);
}));

router.post("/api/assistant/auto-quote", requireSalesRole, aiRateLimiter, validate(autoQuoteRequestSchema), asyncHandler(async (req, res) => {
  await checkAiEnabled(req);
  const provider = getAiProvider();
  const performedBy = await getPerformedBy(req);
  const { enquiryId, ...input } = req.body;
  const result = await autoQuote(provider, input, performedBy, enquiryId);
  res.json(result);
}));

router.post("/api/assistant/config-safety-guard", requireSalesRole, aiRateLimiter, validate(configSafetyGuardRequestSchema), asyncHandler(async (req, res) => {
  await checkAiEnabled(req);
  const provider = getAiProvider();
  const performedBy = await getPerformedBy(req);
  const { offerId, ...input } = req.body;
  const result = await guardConfigSafety(provider, input, performedBy, offerId);
  res.json(result);
}));

router.post("/api/assistant/generate-embedding", requireSalesRole, aiRateLimiter, validate(generateEmbeddingRequestSchema), asyncHandler(async (req, res) => {
  await checkAiEnabled(req);
  const provider = getAiProvider();
  const { offerId, ...rest } = req.body;
  const result = await generateOfferEmbedding(provider, { id: offerId, ...rest });
  if (!result.stored) {
    throw new AppError(502, "Embedding generation failed or provider unavailable");
  }
  res.json(result);
}));

router.post("/api/assistant/similar-offers", requireSalesRole, aiRateLimiter, validate(similarOffersRequestSchema), asyncHandler(async (req, res) => {
  await checkAiEnabled(req);
  const provider = getAiProvider();
  const performedBy = await getPerformedBy(req);
  const { enquiryId, ...input } = req.body;
  const result = await searchSimilarOffers(provider, input, performedBy, enquiryId);
  res.json(result);
}));

const runsQuerySchema = z.object({
  workflow: z.enum(["enquiry_summary", "offer_text_draft", "machine_recommendation", "preset_recommendation", "risk_review", "auto_quote", "similar_offers", "config_safety_guard"]).optional(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"]).optional(),
  offerId: z.coerce.number().int().positive().optional(),
  enquiryId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

router.get("/api/assistant/runs", requireSalesRole, aiRateLimiter, asyncHandler(async (req, res) => {
  const parsed = runsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw AppError.badRequest("Invalid query parameters");
  const { workflow, status, offerId, enquiryId, limit } = parsed.data;
  const performedBy = await getPerformedBy(req);
  const allRuns = await getAiRuns({ workflow, status, offerId, enquiryId, limit });
  const runs = allRuns.filter(r => r.triggeredBy === performedBy);
  res.json(runs);
}));

router.get("/api/assistant/runs/:id", requireSalesRole, aiRateLimiter, asyncHandler(async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  const run = await getAiRunById(id);
  if (!run) throw AppError.notFound("AI run");
  const performedBy = await getPerformedBy(req);
  if (run.triggeredBy !== performedBy) throw AppError.forbidden("Access denied");
  const feedback = await getFeedbackForRun(run.id);
  res.json({ ...run, feedback });
}));

router.post("/api/assistant/feedback", requireSalesRole, aiRateLimiter, validate(feedbackRequestSchema), asyncHandler(async (req, res) => {
  const performedBy = await getPerformedBy(req);
  const run = await getAiRunById(req.body.runId);
  if (!run) throw AppError.notFound("AI run");
  if (run.triggeredBy !== performedBy) throw AppError.forbidden("Access denied");
  const feedback = await recordAiFeedback({
    ...req.body,
    submittedBy: performedBy,
  });
  res.status(201).json(feedback);
}));

router.get("/api/assistant/feedback/stats", requireSalesRole, aiRateLimiter, asyncHandler(async (_req, res) => {
  const stats = await getFeedbackStats();
  res.json(stats);
}));

export default router;
