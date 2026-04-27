import { Router } from "express";
import { db } from "../db";
import { notifications, salesmanUsers, jobOrders } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireSalesmanOrMaster, getSalesmanId, getUserRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";

const router = Router();

router.get("/api/notifications", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const userId = getSalesmanId(req);
  if (!userId) throw AppError.unauthorized();

  const items = await db.select().from(notifications)
    .where(eq(notifications.recipientUserId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  res.json(items);
}));

router.get("/api/notifications/unread-count", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const userId = getSalesmanId(req);
  if (!userId) throw AppError.unauthorized();

  const items = await db.select().from(notifications)
    .where(and(eq(notifications.recipientUserId, userId), eq(notifications.isRead, false)));

  res.json({ count: items.length });
}));

router.patch("/api/notifications/:id/read", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const userId = getSalesmanId(req);
  if (!userId) throw AppError.unauthorized();
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID notifica non valido");

  const result = await db.update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.recipientUserId, userId)))
    .returning({ id: notifications.id });

  if (result.length === 0) throw AppError.notFound("Notifica non trovata");
  res.json({ ok: true });
}));

router.patch("/api/notifications/read-all", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const userId = getSalesmanId(req);
  if (!userId) throw AppError.unauthorized();

  await db.update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.recipientUserId, userId), eq(notifications.isRead, false)));

  res.json({ ok: true });
}));

router.post("/api/orders/:id/request-production-update", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id);
  if (isNaN(orderId)) throw AppError.badRequest("ID commessa non valido");
  const senderId = getSalesmanId(req);
  if (!senderId) throw AppError.unauthorized();

  const senderRole = getUserRole(req);
  if (senderRole === "produzione") throw AppError.forbidden("Il ruolo produzione può aggiornare direttamente");

  const [order] = await db.select().from(jobOrders).where(eq(jobOrders.id, orderId));
  if (!order) throw AppError.notFound("Commessa non trovata");
  if (req.companyId && order.companyId !== req.companyId) throw AppError.notFound("Commessa non trovata");

  const [senderUser] = await db.select().from(salesmanUsers).where(eq(salesmanUsers.id, senderId));

  if (senderRole === "backoffice") {
    const parentIds: number[] = Array.isArray((senderUser as any)?.parentSalesmanIds) && (senderUser as any).parentSalesmanIds.length > 0
      ? (senderUser as any).parentSalesmanIds
      : (senderUser?.parentSalesmanId != null ? [senderUser.parentSalesmanId] : []);
    if (parentIds.length > 0) {
      if (!parentIds.includes(order.salesmanId as number) && order.salesmanId !== senderId) {
        throw AppError.notFound("Commessa non trovata");
      }
    }
  }

  const senderName = senderUser ? `${senderUser.name} ${senderUser.surname}`.trim() : "Utente";

  const companyConditions = [eq(salesmanUsers.role, "produzione"), eq(salesmanUsers.isActive, true)];
  if (req.companyId) companyConditions.push(eq(salesmanUsers.companyId, req.companyId));
  const produzioneUsers = await db.select().from(salesmanUsers).where(and(...companyConditions));

  const masterConditions = [eq(salesmanUsers.role, "master"), eq(salesmanUsers.isActive, true)];
  if (req.companyId) masterConditions.push(eq(salesmanUsers.companyId, req.companyId));

  if (produzioneUsers.length === 0) {
    const masterUsers = await db.select().from(salesmanUsers).where(and(...masterConditions));
    if (masterUsers.length === 0) throw AppError.badRequest("Nessun utente produzione trovato");
    produzioneUsers.push(...masterUsers);
  }

  const jobCode = order.jobCode || `#${orderId}`;
  const title = "Richiesta aggiornamento produzione";
  const message = `${senderName} ha richiesto l'aggiornamento dello stato di produzione per la commessa ${jobCode}.`;

  const insertValues = produzioneUsers.map(u => ({
    companyId: req.companyId ?? null,
    recipientUserId: u.id,
    senderUserId: senderId,
    type: "production_update_request",
    title,
    message,
    orderId,
    isRead: false,
  }));

  await db.insert(notifications).values(insertValues);

  res.json({ ok: true, recipientCount: produzioneUsers.length });
}));

export default router;
