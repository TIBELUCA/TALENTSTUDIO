import { Router, type Request } from "express";
import { z } from "zod";
import { campaignRepository } from "../repositories/campaigns";
import { activityRepository } from "../repositories/activity";
import { requireSalesRole, getSalesmanId, getPerformedBy } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import { assertBrandInTenant, assertContactBelongsToBrand } from "../repositories/tenantGuards";
import { getPaymentsEnabled } from "./talentSettings";
import {
  CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS, DELIVERABLE_STATUSES, DELIVERABLE_STATUS_LABELS,
  PAYMENT_IN_STATUSES, PAYMENT_IN_STATUS_LABELS, PAYMENT_OUT_STATUSES, PAYMENT_OUT_STATUS_LABELS,
  TALENT_DELIVERABLES, TALENT_DELIVERABLE_LABELS,
  type CampaignWithRelations, type CampaignDeliverable,
  type CampaignPaymentIn, type CampaignPaymentOut,
} from "@shared/schema";

const router = Router();

// ===== Versioning helpers =====
function fmtDate(d: any): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("it-IT");
  } catch { return "—"; }
}
function fmtEur(v: any): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}
function normStr(v: any): string {
  return v == null ? "" : String(v).trim();
}
function dateEq(a: any, b: any): boolean {
  const av = a == null ? "" : new Date(a).toISOString().slice(0, 10);
  const bv = b == null ? "" : new Date(b).toISOString().slice(0, 10);
  return av === bv;
}

function computeCampaignChangeSummary(
  before: CampaignWithRelations,
  patch: Record<string, any>,
): string[] {
  const changes: string[] = [];
  if ("name" in patch && normStr(patch.name) !== normStr(before.name)) {
    changes.push(`Nome modificato: ${normStr(before.name) || "—"} → ${normStr(patch.name) || "—"}`);
  }
  if ("status" in patch && patch.status !== before.status) {
    const oldL = CAMPAIGN_STATUS_LABELS[before.status as keyof typeof CAMPAIGN_STATUS_LABELS] ?? before.status;
    const newL = CAMPAIGN_STATUS_LABELS[patch.status as keyof typeof CAMPAIGN_STATUS_LABELS] ?? patch.status;
    changes.push(`Stato cambiato: ${oldL} → ${newL}`);
  }
  if ("brandCustomerId" in patch && patch.brandCustomerId != null && patch.brandCustomerId !== before.brandCustomerId) {
    changes.push(`Brand cambiato (ID ${before.brandCustomerId} → ${patch.brandCustomerId})`);
  }
  if ("brandContactId" in patch && (patch.brandContactId ?? null) !== (before.brandContactId ?? null)) {
    changes.push(patch.brandContactId
      ? `Contatto brand aggiornato`
      : `Contatto brand rimosso`);
  }
  if ("startDate" in patch && !dateEq(patch.startDate, before.startDate)) {
    changes.push(`Data inizio: ${fmtDate(before.startDate)} → ${fmtDate(patch.startDate)}`);
  }
  if ("endDate" in patch && !dateEq(patch.endDate, before.endDate)) {
    changes.push(`Data fine: ${fmtDate(before.endDate)} → ${fmtDate(patch.endDate)}`);
  }
  if ("totalValueEur" in patch && Number(patch.totalValueEur ?? 0) !== Number(before.totalValueEur ?? 0)) {
    changes.push(`Valore: ${fmtEur(before.totalValueEur)} → ${fmtEur(patch.totalValueEur)}`);
  }
  if ("notes" in patch && normStr(patch.notes) !== normStr(before.notes)) {
    changes.push(normStr(patch.notes) ? "Note aggiornate" : "Note rimosse");
  }
  if ("quoteId" in patch && (patch.quoteId ?? null) !== (before.quoteId ?? null)) {
    changes.push(patch.quoteId
      ? `Preventivo collegato (ID ${patch.quoteId})`
      : "Preventivo scollegato");
  }
  return changes;
}

function computeDeliverableUpdateSummary(
  before: CampaignDeliverable,
  patch: Record<string, any>,
): string[] {
  const subs: string[] = [];
  if ("status" in patch && patch.status !== before.status) {
    const oldL = DELIVERABLE_STATUS_LABELS[before.status as keyof typeof DELIVERABLE_STATUS_LABELS] ?? before.status;
    const newL = DELIVERABLE_STATUS_LABELS[patch.status as keyof typeof DELIVERABLE_STATUS_LABELS] ?? patch.status;
    subs.push(`stato ${oldL} → ${newL}`);
  }
  if ("quantity" in patch && Number(patch.quantity) !== Number(before.quantity)) subs.push("quantità");
  if ("unitPriceEur" in patch && Number(patch.unitPriceEur ?? 0) !== Number(before.unitPriceEur ?? 0)) subs.push("prezzo");
  if ("plannedDate" in patch && !dateEq(patch.plannedDate, before.plannedDate)) subs.push("data pianificata");
  if ("publishedDate" in patch && !dateEq(patch.publishedDate, before.publishedDate)) subs.push("data pubblicazione");
  if ("postUrl" in patch && normStr(patch.postUrl) !== normStr(before.postUrl)) subs.push("URL post");
  if ("notes" in patch && normStr(patch.notes) !== normStr(before.notes)) subs.push("note");
  if ("deliverableType" in patch && patch.deliverableType !== before.deliverableType) subs.push("tipo");
  if ("talentId" in patch && Number(patch.talentId) !== Number(before.talentId)) subs.push("talent");
  if ("talentName" in patch && normStr(patch.talentName) !== normStr(before.talentName)) {
    if (!subs.includes("talent")) subs.push("nome talent");
  }
  if ("position" in patch && Number(patch.position) !== Number(before.position)) subs.push("posizione");
  const label = `${before.talentName} (${TALENT_DELIVERABLE_LABELS[before.deliverableType as keyof typeof TALENT_DELIVERABLE_LABELS] ?? before.deliverableType})`;
  return subs.length > 0 ? [`Modificato deliverable ${label}: ${subs.join(", ")}`] : [];
}

async function snapshotBefore(
  req: Request,
  campaignId: number,
  changeSummary: string[],
): Promise<void> {
  if (changeSummary.length === 0) return;
  await campaignRepository.createVersionSnapshot(campaignId, req.companyId, changeSummary, {
    userId: getSalesmanId(req),
    name: await getPerformedBy(req),
  });
}

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

router.get("/api/campaigns/timeline", requireSalesRole, asyncHandler(async (req, res) => {
  res.json(await campaignRepository.listForTimeline(req.companyId));
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
  const summary = computeCampaignChangeSummary(existing, body);
  await snapshotBefore(req, id, summary);
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

router.get("/api/campaigns/:id/versions", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID non valido");
  const c = await campaignRepository.getById(id, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  const versions = await campaignRepository.listVersions(id);
  // Mark the most recent saved version as the latest historical entry; the live row IS the current state.
  res.json(versions.map((v, idx) => ({ ...v, isCurrent: idx === 0 && v.versionNumber === c.currentVersion - 1 })));
}));

// ===== Deliverables =====
router.post("/api/campaigns/:id/deliverables", requireSalesRole, asyncHandler(async (req, res) => {
  const campaignId = Number(req.params.id);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  const body = insertDeliverableBody.parse(req.body);
  const typeLabel = TALENT_DELIVERABLE_LABELS[body.deliverableType as keyof typeof TALENT_DELIVERABLE_LABELS] ?? body.deliverableType;
  await snapshotBefore(req, campaignId, [`Aggiunto deliverable: ${body.talentName} — ${typeLabel} (qtà ${body.quantity ?? 1})`]);
  const d = await campaignRepository.addDeliverable(campaignId, req.companyId, body);
  res.status(201).json(d);
}));

router.put("/api/campaigns/:id/deliverables/:deliverableId", requireSalesRole, asyncHandler(async (req, res) => {
  const campaignId = Number(req.params.id);
  const did = Number(req.params.deliverableId);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  const before = c.deliverables.find(d => d.id === did);
  if (!before) throw AppError.notFound("Deliverable");
  const body = updateDeliverableBody.parse(req.body);
  const summary = computeDeliverableUpdateSummary(before, body);
  await snapshotBefore(req, campaignId, summary);
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
  const target = c.deliverables.find(d => d.id === did);
  if (!target) throw AppError.notFound("Deliverable");
  const typeLabel = TALENT_DELIVERABLE_LABELS[target.deliverableType as keyof typeof TALENT_DELIVERABLE_LABELS] ?? target.deliverableType;
  await snapshotBefore(req, campaignId, [`Rimosso deliverable: ${target.talentName} — ${typeLabel}`]);
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
  const currentOrder = c.deliverables.map(d => d.id).join(",");
  if (ids.join(",") !== currentOrder) {
    await snapshotBefore(req, campaignId, ["Ordine deliverable modificato"]);
  }
  await campaignRepository.reorderDeliverables(campaignId, req.companyId, ids);
  res.status(204).end();
}));

// ===== Metrics =====
router.put("/api/campaigns/:id/deliverables/:deliverableId/metrics", requireSalesRole, asyncHandler(async (req, res) => {
  const campaignId = Number(req.params.id);
  const did = Number(req.params.deliverableId);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  const target = c.deliverables.find(d => d.id === did);
  if (!target) throw AppError.notFound("Deliverable");
  const body = metricsBody.parse(req.body);
  await snapshotBefore(req, campaignId, [`Aggiornate metriche deliverable: ${target.talentName} (views ${body.views ?? 0})`]);
  const m = await campaignRepository.upsertMetrics(did, req.companyId, body);
  res.json(m);
}));

// ===== Payments In =====
async function assertPaymentsEnabled(companyId: number): Promise<void> {
  if (!(await getPaymentsEnabled(companyId))) {
    throw AppError.forbidden("Modulo pagamenti disattivato");
  }
}

function paymentInSummary(action: "added" | "updated" | "removed", before: CampaignPaymentIn | undefined, body: any): string {
  const amt = fmtEur(body?.amountEur ?? before?.amountEur);
  if (action === "added") return `Aggiunto incasso ${amt}${body?.invoiceRef ? ` (fattura ${body.invoiceRef})` : ""}`;
  if (action === "removed") return `Rimosso incasso ${amt}${before?.invoiceRef ? ` (fattura ${before.invoiceRef})` : ""}`;
  // updated
  const subs: string[] = [];
  if (before && body) {
    if ("amountEur" in body && Number(body.amountEur ?? 0) !== Number(before.amountEur ?? 0)) subs.push(`importo ${fmtEur(before.amountEur)} → ${fmtEur(body.amountEur)}`);
    if ("status" in body && body.status !== before.status) {
      const oldL = PAYMENT_IN_STATUS_LABELS[before.status as keyof typeof PAYMENT_IN_STATUS_LABELS] ?? before.status;
      const newL = PAYMENT_IN_STATUS_LABELS[body.status as keyof typeof PAYMENT_IN_STATUS_LABELS] ?? body.status;
      subs.push(`stato ${oldL} → ${newL}`);
    }
    if ("dueDate" in body && !dateEq(body.dueDate, before.dueDate)) subs.push("scadenza");
    if ("paidDate" in body && !dateEq(body.paidDate, before.paidDate)) subs.push("data incasso");
    if ("invoiceRef" in body && normStr(body.invoiceRef) !== normStr(before.invoiceRef)) subs.push("riferimento fattura");
  }
  return subs.length > 0 ? `Modificato incasso ${amt}: ${subs.join(", ")}` : `Modificato incasso ${amt}`;
}

function paymentOutSummary(action: "added" | "updated" | "removed", before: CampaignPaymentOut | undefined, body: any, talentName?: string): string {
  const amt = fmtEur(body?.amountEur ?? before?.amountEur);
  const who = talentName ? ` per ${talentName}` : "";
  if (action === "added") return `Aggiunto pagamento talent ${amt}${who}`;
  if (action === "removed") return `Rimosso pagamento talent ${amt}${who}`;
  const subs: string[] = [];
  if (before && body) {
    if ("amountEur" in body && Number(body.amountEur ?? 0) !== Number(before.amountEur ?? 0)) subs.push(`importo ${fmtEur(before.amountEur)} → ${fmtEur(body.amountEur)}`);
    if ("commissionPct" in body && Number(body.commissionPct ?? 0) !== Number(before.commissionPct ?? 0)) subs.push(`commissione ${before.commissionPct}% → ${body.commissionPct}%`);
    if ("status" in body && body.status !== before.status) {
      const oldL = PAYMENT_OUT_STATUS_LABELS[before.status as keyof typeof PAYMENT_OUT_STATUS_LABELS] ?? before.status;
      const newL = PAYMENT_OUT_STATUS_LABELS[body.status as keyof typeof PAYMENT_OUT_STATUS_LABELS] ?? body.status;
      subs.push(`stato ${oldL} → ${newL}`);
    }
    if ("paidDate" in body && !dateEq(body.paidDate, before.paidDate)) subs.push("data pagamento");
    if ("method" in body && normStr(body.method) !== normStr(before.method)) subs.push("metodo");
  }
  return subs.length > 0 ? `Modificato pagamento talent ${amt}${who}: ${subs.join(", ")}` : `Modificato pagamento talent ${amt}${who}`;
}

router.post("/api/campaigns/:id/payments-in", requireSalesRole, asyncHandler(async (req, res) => {
  await assertPaymentsEnabled(req.companyId);
  const campaignId = Number(req.params.id);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  const body = paymentInBody.parse(req.body);
  await snapshotBefore(req, campaignId, [paymentInSummary("added", undefined, body)]);
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
  const before = c.paymentsIn.find(p => p.id === pid);
  if (!before) throw AppError.notFound("Pagamento");
  const body = paymentInBody.partial().parse(req.body);
  await snapshotBefore(req, campaignId, [paymentInSummary("updated", before, body)]);
  const p = await campaignRepository.updatePaymentIn(pid, req.companyId, body);
  res.json(p);
}));

router.delete("/api/campaigns/:id/payments-in/:paymentId", requireSalesRole, asyncHandler(async (req, res) => {
  const campaignId = Number(req.params.id);
  const pid = Number(req.params.paymentId);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  const before = c.paymentsIn.find(p => p.id === pid);
  if (!before) throw AppError.notFound("Pagamento");
  await snapshotBefore(req, campaignId, [paymentInSummary("removed", before, undefined)]);
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
  const talentName = c.deliverables.find(d => d.talentId === body.talentId)?.talentName;
  await snapshotBefore(req, campaignId, [paymentOutSummary("added", undefined, body, talentName)]);
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
  const before = c.paymentsOut.find(p => p.id === pid);
  if (!before) throw AppError.notFound("Pagamento");
  const body = paymentOutBody.partial().parse(req.body);
  const talentName = c.deliverables.find(d => d.talentId === before.talentId)?.talentName;
  await snapshotBefore(req, campaignId, [paymentOutSummary("updated", before, body, talentName)]);
  const p = await campaignRepository.updatePaymentOut(pid, req.companyId, body);
  res.json(p);
}));

router.delete("/api/campaigns/:id/payments-out/:paymentId", requireSalesRole, asyncHandler(async (req, res) => {
  const campaignId = Number(req.params.id);
  const pid = Number(req.params.paymentId);
  const c = await campaignRepository.getById(campaignId, req.companyId);
  if (!c) throw AppError.notFound("Campagna");
  const before = c.paymentsOut.find(p => p.id === pid);
  if (!before) throw AppError.notFound("Pagamento");
  const talentName = c.deliverables.find(d => d.talentId === before.talentId)?.talentName;
  await snapshotBefore(req, campaignId, [paymentOutSummary("removed", before, undefined, talentName)]);
  await campaignRepository.deletePaymentOut(pid, req.companyId);
  res.status(204).end();
}));

export default router;
