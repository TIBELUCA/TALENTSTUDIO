import { Router } from "express";
import { db } from "../db";
import { offers, offerReminders, salesmanUsers, notifications, offerCrmInfoSchema, createOfferReminderInputSchema, updateOfferReminderInputSchema, type OfferCrmInfo } from "@shared/schema";
import { and, eq, asc } from "drizzle-orm";
import { requireSalesmanOrMaster, getSalesmanId } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";

const router = Router();

async function loadOfferForCompany(req: any, offerId: number) {
  const [offer] = await db.select().from(offers).where(eq(offers.id, offerId));
  if (!offer) throw AppError.notFound("Offer");
  if (req.companyId != null && offer.companyId !== req.companyId) throw AppError.notFound("Offer");
  return offer;
}

router.get("/api/offers/:id/crm", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const offerId = Number(req.params.id);
  if (isNaN(offerId)) throw AppError.badRequest("ID offerta non valido");
  const offer = await loadOfferForCompany(req, offerId);
  res.json((offer.crmInfo as OfferCrmInfo | null) ?? null);
}));

router.put("/api/offers/:id/crm", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const offerId = Number(req.params.id);
  if (isNaN(offerId)) throw AppError.badRequest("ID offerta non valido");
  await loadOfferForCompany(req, offerId);

  const parsed = offerCrmInfoSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest("Dati CRM non validi", parsed.error.flatten());

  const userId = getSalesmanId(req);
  const updatedAt = new Date().toISOString();
  const crmInfo: OfferCrmInfo = {
    expectedCloseDate: parsed.data.expectedCloseDate ?? null,
    winProbability: parsed.data.winProbability ?? null,
    budget: parsed.data.budget ?? null,
    decisionMaker: parsed.data.decisionMaker ?? null,
    competitors: parsed.data.competitors ?? [],
    nextSteps: parsed.data.nextSteps ?? null,
    notes: parsed.data.notes ?? null,
    updatedAt,
    updatedByUserId: userId ?? null,
  };

  await db.update(offers).set({ crmInfo }).where(eq(offers.id, offerId));
  res.json(crmInfo);
}));

router.get("/api/offers/:id/reminders", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const offerId = Number(req.params.id);
  if (isNaN(offerId)) throw AppError.badRequest("ID offerta non valido");
  await loadOfferForCompany(req, offerId);

  const rows = await db.select().from(offerReminders)
    .where(eq(offerReminders.offerId, offerId))
    .orderBy(asc(offerReminders.remindAt));
  res.json(rows);
}));

router.post("/api/offers/:id/reminders", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const offerId = Number(req.params.id);
  if (isNaN(offerId)) throw AppError.badRequest("ID offerta non valido");
  const offer = await loadOfferForCompany(req, offerId);
  const userId = getSalesmanId(req);
  if (!userId) throw AppError.unauthorized();

  const parsed = createOfferReminderInputSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest("Dati promemoria non validi", parsed.error.flatten());

  const remindAt = new Date(parsed.data.remindAt);
  if (isNaN(remindAt.getTime())) throw AppError.badRequest("Data promemoria non valida");

  const targetUserId = parsed.data.userId ?? userId;
  if (targetUserId !== userId) {
    const [target] = await db.select({ id: salesmanUsers.id, companyId: salesmanUsers.companyId })
      .from(salesmanUsers).where(eq(salesmanUsers.id, targetUserId));
    if (!target) throw AppError.badRequest("Utente destinatario non trovato");
    if (req.companyId != null && target.companyId !== req.companyId) throw AppError.forbidden("Utente non valido");
  }

  const [created] = await db.insert(offerReminders).values({
    companyId: offer.companyId ?? req.companyId ?? null,
    offerId,
    userId: targetUserId,
    remindAt,
    note: parsed.data.note ?? "",
    createdByUserId: userId,
  }).returning();

  res.status(201).json(created);
}));

router.patch("/api/offers/:id/reminders/:rid", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const offerId = Number(req.params.id);
  const rid = Number(req.params.rid);
  if (isNaN(offerId) || isNaN(rid)) throw AppError.badRequest("ID non valido");
  await loadOfferForCompany(req, offerId);

  const [existing] = await db.select().from(offerReminders).where(eq(offerReminders.id, rid));
  if (!existing || existing.offerId !== offerId) throw AppError.notFound("Promemoria non trovato");

  const parsed = updateOfferReminderInputSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest("Dati promemoria non validi", parsed.error.flatten());

  const update: Partial<typeof offerReminders.$inferInsert> & { sentAt?: Date | null } = {};
  if (parsed.data.remindAt) {
    const d = new Date(parsed.data.remindAt);
    if (isNaN(d.getTime())) throw AppError.badRequest("Data promemoria non valida");
    update.remindAt = d;
    // re-arming: reset sentAt so it can fire again
    update.sentAt = null;
  }
  if (parsed.data.note !== undefined) update.note = parsed.data.note;
  if (parsed.data.isDismissed !== undefined) update.isDismissed = parsed.data.isDismissed;

  const [updated] = await db.update(offerReminders).set(update).where(eq(offerReminders.id, rid)).returning();
  res.json(updated);
}));

router.delete("/api/offers/:id/reminders/:rid", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const offerId = Number(req.params.id);
  const rid = Number(req.params.rid);
  if (isNaN(offerId) || isNaN(rid)) throw AppError.badRequest("ID non valido");
  await loadOfferForCompany(req, offerId);

  const [existing] = await db.select().from(offerReminders).where(eq(offerReminders.id, rid));
  if (!existing || existing.offerId !== offerId) throw AppError.notFound("Promemoria non trovato");

  await db.delete(offerReminders).where(eq(offerReminders.id, rid));
  res.status(204).end();
}));

export default router;
