import { Router } from "express";
import { z } from "zod";
import { campaignRepository } from "../repositories/campaigns";
import { activityRepository } from "../repositories/activity";
import { requireSalesRole, getSalesmanId, getPerformedBy } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import { assertBrandInTenant, assertContactBelongsToBrand } from "../repositories/tenantGuards";
import { getPaymentsEnabled } from "./talentSettings";
import {
  CAMPAIGN_STATUSES, DELIVERABLE_STATUSES,
  PAYMENT_IN_STATUSES, PAYMENT_OUT_STATUSES, TALENT_DELIVERABLES,
} from "@shared/schema";

const router = Router();

const decimalString = z.union([z.string(), z.number(), z.null()]).optional()
  .transform((v) => (v == null || v === "" ? "0" : typeof v === "number" ? String(v) : String(v).trim()));

const dateOpt = z.union([z.string(), z.null()]).optional()
  .transform((v) => (v ? new Date(v) : null));

const insertCampaignBody = z.object({
  brandCustomerId: z.coerce.number().int().positive(),
  brandContactId: z.coerce.number().int().positive().nullable().optional(),
  quoteId: z.coerce.number().int().positive().nullable().optional(),
  name: z.string().min(1, "Nome obbligatorio"),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  startDate: dateOpt,
  endDate: dateOpt,
  totalValueEur: decimalString,
  notes: z.string().nullable().optional(),
});

const insertDeliverableBody = z.object({
  talentId: z.coerce.number().int().positive(),
  talentName: z.string().min(1),
  deliverableType: z.enum(TALENT_DELIVERABLES),
  quantity: z.coerce.number().int().min(1).default(1),
  unitPriceEur: decimalString,
  status: z.enum(DELIVERABLE_STATUSES).optional(),
  plannedDate: dateOpt,
  publishedDate: dateOpt,
  postUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  position: z.coerce.number().int().min(0).optional(),
});

const updateDeliverableBody = insertDeliverableBody.partial();

const metricsBody = z.object({
  views: z.coerce.number().int().min(0).optional().default(0),
  likes: z.coerce.number().int().min(0).optional().default(0),
  comments: z.coerce.number().int().min(0).optional().default(0),
  saves: z.coerce.number().int().min(0).optional().default(0),
  reach: z.coerce.number().int().min(0).optional().default(0),
});

const paymentInBody = z.object({
  amountEur: decimalString,
  status: z.enum(PAYMENT_IN_STATUSES).optional(),
  dueDate: dateOpt,
  paidDate: dateOpt,
  invoiceRef: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const paymentOutBody = z.object({
  talentId: z.coerce.number().int().positive(),
  amountEur: decimalString,
  commissionPct: decimalString,
  status: z.enum(PAYMENT_OUT_STATUSES).optional(),
  paidDate: dateOpt,
  method: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ===== Campaigns =====
router.get("/api/campaigns", requireSalesRole, asyncHandler(async (req, res) => {
  res.json(await campaignRepository.list(req.companyId));
}));

router.get("/api/campaigns/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID non valido");
  const c = await campaignRepository.getById(id, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  res.json(c);
}));

router.post("/api/campaigns", requireSalesRole, asyncHandler(async (req, res) => {
  const body = insertCampaignBody.parse(req.body);
  await assertBrandInTenant(body.brandCustomerId, req.companyId);
  if (body.brandContactId != null) {
    await assertContactBelongsToBrand(body.brandContactId, body.brandCustomerId, req.companyId);
  }
  const created = await campaignRepository.create(req.companyId, {
    ...body,
    createdByUserId: getSalesmanId(req) ?? null,
  });
  await activityRepository.record({
    salesmanUserId: getSalesmanId(req),
    performedBy: await getPerformedBy(req),
    action: "campaign_created",
    offerReference: created.code,
    meta: { campaignId: created.id },
  }).catch(() => {});
  res.status(201).json(created);
}));

router.put("/api/campaigns/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await campaignRepository.getById(id, req.companyId);
  if (!existing) throw AppError.notFound("Campagna");
  const body = insertCampaignBody.partial().parse(req.body);
  if (body.brandCustomerId != null) {
    await assertBrandInTenant(body.brandCustomerId, req.companyId);
  }
  if (body.brandContactId != null) {
    const brandId = body.brandCustomerId ?? existing.brandCustomerId;
    await assertContactBelongsToBrand(body.brandContactId, brandId, req.companyId);
  }
  const u = await campaignRepository.update(id, req.companyId, body);
  res.json(u);
}));

router.delete("/api/campaigns/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await campaignRepository.getById(id, req.companyId);
  if (!existing) throw AppError.notFound("Campagna");
  await campaignRepository.delete(id, req.companyId);
  res.status(204).end();
}));

// ===== Deliverables =====
router.post("/api/campaigns/:id/deliverables", requireSalesRole, asyncHandler(async (req, res) => {
  const campaignId = Number(req.params.id);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  const body = insertDeliverableBody.parse(req.body);
  const d = await campaignRepository.addDeliverable(campaignId, req.companyId, body);
  res.status(201).json(d);
}));

router.put("/api/campaigns/:id/deliverables/:deliverableId", requireSalesRole, asyncHandler(async (req, res) => {
  const campaignId = Number(req.params.id);
  const did = Number(req.params.deliverableId);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  if (!c.deliverables.some(d => d.id === did)) throw AppError.notFound("Deliverable");
  const body = updateDeliverableBody.parse(req.body);
  const before = c.deliverables.find(d => d.id === did);
  const d = await campaignRepository.updateDeliverable(did, req.companyId, body);
  if (body.status === "published" && before?.status !== "published") {
    await activityRepository.record({
      salesmanUserId: getSalesmanId(req),
      performedBy: await getPerformedBy(req),
      action: "deliverable_published",
      offerReference: c.code,
      meta: { campaignId, deliverableId: did, talentId: d.talentId, talentName: d.talentName, deliverableType: d.deliverableType },
    }).catch(() => {});
  }
  res.json(d);
}));

router.delete("/api/campaigns/:id/deliverables/:deliverableId", requireSalesRole, asyncHandler(async (req, res) => {
  const campaignId = Number(req.params.id);
  const did = Number(req.params.deliverableId);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  if (!c.deliverables.some(d => d.id === did)) throw AppError.notFound("Deliverable");
  await campaignRepository.deleteDeliverable(did, req.companyId);
  res.status(204).end();
}));

router.post("/api/campaigns/:id/deliverables/reorder", requireSalesRole, asyncHandler(async (req, res) => {
  const campaignId = Number(req.params.id);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  const ids = z.array(z.coerce.number().int().positive()).parse(req.body?.orderedIds ?? []);
  // Defense in depth: ensure every id belongs to this campaign + tenant
  const allowed = new Set(c.deliverables.map(d => d.id));
  if (!ids.every(id => allowed.has(id))) throw AppError.badRequest("Deliverable IDs non validi");
  await campaignRepository.reorderDeliverables(campaignId, req.companyId, ids);
  res.status(204).end();
}));

// ===== Metrics =====
router.put("/api/campaigns/:id/deliverables/:deliverableId/metrics", requireSalesRole, asyncHandler(async (req, res) => {
  const campaignId = Number(req.params.id);
  const did = Number(req.params.deliverableId);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  if (!c.deliverables.some(d => d.id === did)) throw AppError.notFound("Deliverable");
  const body = metricsBody.parse(req.body);
  const m = await campaignRepository.upsertMetrics(did, req.companyId, body);
  res.json(m);
}));

// ===== Payments In =====
async function assertPaymentsEnabled(companyId: number): Promise<void> {
  if (!(await getPaymentsEnabled(companyId))) {
    throw AppError.forbidden("Modulo pagamenti disattivato");
  }
}

router.post("/api/campaigns/:id/payments-in", requireSalesRole, asyncHandler(async (req, res) => {
  await assertPaymentsEnabled(req.companyId);
  const campaignId = Number(req.params.id);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  const body = paymentInBody.parse(req.body);
  const p = await campaignRepository.addPaymentIn(campaignId, req.companyId, body);
  await activityRepository.record({
    salesmanUserId: getSalesmanId(req),
    performedBy: await getPerformedBy(req),
    action: "campaign_payment_in_recorded",
    offerReference: c.code,
    meta: { campaignId, paymentId: p.id, status: p.status, amountEur: p.amountEur },
  }).catch(() => {});
  res.status(201).json(p);
}));

router.put("/api/campaigns/:id/payments-in/:paymentId", requireSalesRole, asyncHandler(async (req, res) => {
  await assertPaymentsEnabled(req.companyId);
  const campaignId = Number(req.params.id);
  const pid = Number(req.params.paymentId);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  if (!c.paymentsIn.some(p => p.id === pid)) throw AppError.notFound("Pagamento");
  const body = paymentInBody.partial().parse(req.body);
  const p = await campaignRepository.updatePaymentIn(pid, req.companyId, body);
  res.json(p);
}));

router.delete("/api/campaigns/:id/payments-in/:paymentId", requireSalesRole, asyncHandler(async (req, res) => {
  const campaignId = Number(req.params.id);
  const pid = Number(req.params.paymentId);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  if (!c.paymentsIn.some(p => p.id === pid)) throw AppError.notFound("Pagamento");
  await campaignRepository.deletePaymentIn(pid, req.companyId);
  res.status(204).end();
}));

// ===== Payments Out =====
router.post("/api/campaigns/:id/payments-out", requireSalesRole, asyncHandler(async (req, res) => {
  await assertPaymentsEnabled(req.companyId);
  const campaignId = Number(req.params.id);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  const body = paymentOutBody.parse(req.body);
  const p = await campaignRepository.addPaymentOut(campaignId, req.companyId, body);
  await activityRepository.record({
    salesmanUserId: getSalesmanId(req),
    performedBy: await getPerformedBy(req),
    action: "campaign_payment_out_recorded",
    offerReference: c.code,
    meta: { campaignId, paymentId: p.id, status: p.status, talentId: p.talentId, amountEur: p.amountEur },
  }).catch(() => {});
  res.status(201).json(p);
}));

router.put("/api/campaigns/:id/payments-out/:paymentId", requireSalesRole, asyncHandler(async (req, res) => {
  await assertPaymentsEnabled(req.companyId);
  const campaignId = Number(req.params.id);
  const pid = Number(req.params.paymentId);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  if (!c.paymentsOut.some(p => p.id === pid)) throw AppError.notFound("Pagamento");
  const body = paymentOutBody.partial().parse(req.body);
  const p = await campaignRepository.updatePaymentOut(pid, req.companyId, body);
  res.json(p);
}));

router.delete("/api/campaigns/:id/payments-out/:paymentId", requireSalesRole, asyncHandler(async (req, res) => {
  const campaignId = Number(req.params.id);
  const pid = Number(req.params.paymentId);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  if (!c.paymentsOut.some(p => p.id === pid)) throw AppError.notFound("Pagamento");
  await campaignRepository.deletePaymentOut(pid, req.companyId);
  res.status(204).end();
}));

export default router;
