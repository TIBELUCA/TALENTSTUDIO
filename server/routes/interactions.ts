import { Router } from "express";
import { interactionRepository } from "../repositories/interactions";
import { offerRepository } from "../repositories/offers";
import { db, eq } from "../repositories/base";
import { jobOrders } from "@shared/schema";
import { requireSalesRole, getSalesmanId } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import { z } from "zod";

const interactionBodySchema = z.object({
  customerId: z.number(),
  contactId: z.number().nullable().optional(),
  date: z.string(),
  direction: z.enum(["inbound", "outbound"]),
  type: z.enum(["email", "phone_call", "visit", "whatsapp", "video_call", "offer_created", "offer_versioned", "todo"]),
  classification: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  additionalContactIds: z.array(z.number()).nullable().optional(),
  reminders: z.array(z.object({ minutesBefore: z.number() })).nullable().optional(),
  sendEmail: z.boolean().optional(),
  linkedJobOrderId: z.number().nullable().optional(),
  linkedOfferId: z.number().nullable().optional(),
});

const router = Router();

router.get("/api/interactions", requireSalesRole, asyncHandler(async (req, res) => {
  const filters: any = {};

  if (req.companyId) filters.companyId = req.companyId;
  if (req.query.customerId) filters.customerId = Number(req.query.customerId);
  if (req.query.contactId) filters.contactId = Number(req.query.contactId);
  if (req.query.type) filters.type = req.query.type as string;
  if (req.query.direction) filters.direction = req.query.direction as string;
  if (req.query.dateFrom) filters.dateFrom = new Date(req.query.dateFrom as string);
  if (req.query.dateTo) filters.dateTo = new Date(req.query.dateTo as string);
  if (req.query.salesmanUserId) filters.salesmanUserId = Number(req.query.salesmanUserId);
  if (req.query.linkedJobOrderId) filters.linkedJobOrderId = Number(req.query.linkedJobOrderId);

  const list = await interactionRepository.list(filters);
  res.json(list);
}));

router.get("/api/interactions/calendar", requireSalesRole, asyncHandler(async (req, res) => {
  const salesmanId = getSalesmanId(req);
  const filters: any = {};

  if (req.companyId) filters.companyId = req.companyId;
  if (req.query.dateFrom) filters.dateFrom = new Date(req.query.dateFrom as string);
  if (req.query.dateTo) filters.dateTo = new Date(req.query.dateTo as string);
  if (req.query.salesmanUserId) {
    filters.salesmanUserId = Number(req.query.salesmanUserId);
  } else if (salesmanId) {
    filters.salesmanUserId = salesmanId;
  }

  const list = await interactionRepository.list(filters);
  res.json(list);
}));

router.get("/api/interactions/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const interaction = await interactionRepository.getById(Number(req.params.id));
  if (!interaction) throw AppError.notFound("Interaction not found");
  if (interaction.companyId != null && interaction.companyId !== req.companyId) {
    throw AppError.notFound("Interaction not found");
  }
  res.json(interaction);
}));

router.post("/api/interactions", requireSalesRole, asyncHandler(async (req, res) => {
  const salesmanId = getSalesmanId(req);
  const parsed = interactionBodySchema.parse(req.body);

  if (parsed.linkedOfferId) {
    const offer = await offerRepository.getById(parsed.linkedOfferId);
    if (!offer || (req.companyId && offer.companyId !== req.companyId)) {
      throw AppError.badRequest("Linked offer not found or not accessible");
    }
  }

  if (parsed.linkedJobOrderId) {
    const [order] = await db.select({ id: jobOrders.id, companyId: jobOrders.companyId }).from(jobOrders).where(eq(jobOrders.id, parsed.linkedJobOrderId));
    if (!order || (req.companyId && order.companyId !== req.companyId)) {
      throw AppError.badRequest("Linked order not found or not accessible");
    }
  }

  const interaction = await interactionRepository.create({
    ...parsed,
    companyId: req.companyId,
    salesmanUserId: salesmanId ?? undefined,
    date: new Date(parsed.date),
  });
  res.status(201).json(interaction);
}));

router.put("/api/interactions/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await interactionRepository.getById(id);
  if (!existing) throw AppError.notFound("Interaction not found");
  if (existing.companyId != null && existing.companyId !== req.companyId) {
    throw AppError.notFound("Interaction not found");
  }

  const parsed = interactionBodySchema.partial().parse(req.body);

  if (parsed.linkedOfferId) {
    const offer = await offerRepository.getById(parsed.linkedOfferId);
    if (!offer || (req.companyId && offer.companyId !== req.companyId)) {
      throw AppError.badRequest("Linked offer not found or not accessible");
    }
  }

  if (parsed.linkedJobOrderId) {
    const [order] = await db.select({ id: jobOrders.id, companyId: jobOrders.companyId }).from(jobOrders).where(eq(jobOrders.id, parsed.linkedJobOrderId));
    if (!order || (req.companyId && order.companyId !== req.companyId)) {
      throw AppError.badRequest("Linked order not found or not accessible");
    }
  }

  const updates: any = { ...parsed };
  if (parsed.date) updates.date = new Date(parsed.date);

  const updated = await interactionRepository.update(id, updates);
  res.json(updated);
}));

router.delete("/api/interactions/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await interactionRepository.getById(id);
  if (!existing) throw AppError.notFound("Interaction not found");
  if (existing.companyId != null && existing.companyId !== req.companyId) {
    throw AppError.notFound("Interaction not found");
  }

  await interactionRepository.delete(id);
  res.json({ success: true });
}));

export default router;
