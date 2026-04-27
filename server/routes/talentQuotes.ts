import { Router } from "express";
import { z } from "zod";
import { talentQuoteRepository } from "../repositories/talentQuotes";
import { nextCampaignCode } from "../repositories/campaigns";
import { activityRepository } from "../repositories/activity";
import { requireSalesRole, getSalesmanId, getPerformedBy } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import { generateTalentQuotePdf } from "../talentQuotePdf";
import { assertBrandInTenant, assertContactBelongsToBrand } from "../repositories/tenantGuards";
import { TALENT_DELIVERABLES, QUOTE_STATUSES } from "@shared/schema";

const router = Router();

const decimalString = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === "") return "0";
    return typeof v === "number" ? String(v) : String(v).trim();
  });

const itemSchema = z.object({
  talentId: z.coerce.number().int().positive(),
  talentName: z.string().min(1),
  deliverableType: z.enum(TALENT_DELIVERABLES),
  quantity: z.coerce.number().int().min(1).default(1),
  unitPriceEur: decimalString,
  discountPct: decimalString,
  notes: z.string().nullable().optional(),
});

const quoteBodySchema = z.object({
  quote: z.object({
    brandCustomerId: z.coerce.number().int().positive(),
    brandContactId: z.coerce.number().int().positive().nullable().optional(),
    subject: z.string().min(1, "Oggetto obbligatorio"),
    status: z.enum(QUOTE_STATUSES).optional().default("draft"),
    validUntil: z.string().nullable().optional().transform(v => v ? new Date(v) : null),
    paymentTerms: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    internalNotes: z.string().nullable().optional(),
  }),
  items: z.array(itemSchema).default([]),
});

router.get("/api/quotes", requireSalesRole, asyncHandler(async (req, res) => {
  const list = await talentQuoteRepository.list(req.companyId);
  res.json(list);
}));

router.get("/api/quotes/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID non valido");
  const q = await talentQuoteRepository.getById(id, req.companyId);
  if (!q) throw AppError.notFound("Preventivo");
  res.json(q);
}));

router.post("/api/quotes", requireSalesRole, asyncHandler(async (req, res) => {
  const parsed = quoteBodySchema.parse(req.body);
  await assertBrandInTenant(parsed.quote.brandCustomerId, req.companyId);
  if (parsed.quote.brandContactId != null) {
    await assertContactBelongsToBrand(parsed.quote.brandContactId, parsed.quote.brandCustomerId, req.companyId);
  }
  const salesmanId = getSalesmanId(req);
  const created = await talentQuoteRepository.create(
    req.companyId,
    { ...parsed.quote, createdByUserId: salesmanId },
    parsed.items,
  );
  await activityRepository.record({
    salesmanUserId: salesmanId,
    performedBy: await getPerformedBy(req),
    action: "quote_created",
    offerReference: created.referenceNumber,
    meta: { quoteId: created.id },
  }).catch(() => {});
  const full = await talentQuoteRepository.getById(created.id, req.companyId);
  res.status(201).json(full);
}));

router.put("/api/quotes/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID non valido");
  const existing = await talentQuoteRepository.getById(id, req.companyId);
  if (!existing) throw AppError.notFound("Preventivo");
  const parsed = quoteBodySchema.parse(req.body);
  await assertBrandInTenant(parsed.quote.brandCustomerId, req.companyId);
  if (parsed.quote.brandContactId != null) {
    await assertContactBelongsToBrand(parsed.quote.brandContactId, parsed.quote.brandCustomerId, req.companyId);
  }
  await talentQuoteRepository.update(id, req.companyId, parsed.quote, parsed.items);
  const full = await talentQuoteRepository.getById(id, req.companyId);
  res.json(full);
}));

router.patch("/api/quotes/:id/status", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const status = z.enum(QUOTE_STATUSES).parse(req.body?.status);
  const existing = await talentQuoteRepository.getById(id, req.companyId);
  if (!existing) throw AppError.notFound("Preventivo");
  const updated = await talentQuoteRepository.setStatus(id, req.companyId, status);
  await activityRepository.record({
    salesmanUserId: getSalesmanId(req),
    performedBy: await getPerformedBy(req),
    action: status === "sent" ? "quote_sent"
      : status === "accepted" ? "quote_accepted"
      : status === "rejected" ? "quote_rejected" : "quote_status_changed",
    offerReference: existing.referenceNumber,
    meta: { quoteId: id, status },
  }).catch(() => {});
  res.json(updated);
}));

router.post("/api/quotes/:id/duplicate", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await talentQuoteRepository.getById(id, req.companyId);
  if (!existing) throw AppError.notFound("Preventivo");
  const dup = await talentQuoteRepository.duplicate(id, req.companyId, getSalesmanId(req));
  res.status(201).json(dup);
}));

router.delete("/api/quotes/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await talentQuoteRepository.getById(id, req.companyId);
  if (!existing) throw AppError.notFound("Preventivo");
  await talentQuoteRepository.delete(id, req.companyId);
  res.status(204).end();
}));

router.get("/api/quotes/:id/pdf", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await talentQuoteRepository.getById(id, req.companyId);
  if (!existing) throw AppError.notFound("Preventivo");
  const { buffer, filename } = await generateTalentQuotePdf(id, req.companyId);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    (req.query.inline ? "inline" : "attachment") + `; filename="${filename}"`,
  );
  res.send(buffer);
}));

router.post("/api/quotes/:id/create-campaign", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await talentQuoteRepository.getById(id, req.companyId);
  if (!existing) throw AppError.notFound("Preventivo");
  if (existing.status !== "accepted") throw AppError.badRequest("Solo i preventivi accettati possono diventare campagne");

  // Retry on (company_id, code) unique-violation: two concurrent quote
  // conversions can compute the same MAX(code)+1 before either inserts.
  let campaign;
  let reused = false;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await nextCampaignCode(req.companyId);
    try {
      const result = await talentQuoteRepository.acceptAndCreateCampaign(
        id,
        req.companyId,
        code,
        getSalesmanId(req) ?? null,
      );
      campaign = result.campaign;
      reused = result.reused;
      lastErr = undefined;
      break;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : "";
      const isUniqueViolation = /campaigns_company_code_uniq|duplicate key|unique constraint/i.test(msg);
      if (!isUniqueViolation) break;
    }
  }
  if (!campaign) {
    const msg = lastErr instanceof Error ? lastErr.message : "Errore creazione campagna";
    throw AppError.badRequest(msg);
  }

  if (!reused) {
    await activityRepository.record({
      salesmanUserId: getSalesmanId(req),
      performedBy: await getPerformedBy(req),
      action: "campaign_created",
      offerReference: campaign.code,
      meta: { campaignId: campaign.id, quoteId: id },
    }).catch(() => {});
  }

  res.status(reused ? 200 : 201).json(campaign);
}));

export default router;
