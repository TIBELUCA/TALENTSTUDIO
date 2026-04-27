import { Router } from "express";
import { z } from "zod";
import { talentRepository } from "../repositories/talents";
import { campaignRepository } from "../repositories/campaigns";
import { requireSalesRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import {
  TALENT_PLATFORMS,
  TALENT_DELIVERABLES,
  type InsertTalent,
  type InsertTalentSocial,
  type InsertTalentRate,
} from "@shared/schema";

const router = Router();

// Decimal columns are returned as `string | null` by Drizzle, so we normalise
// every numeric form input (which arrives as `string | number | null`) into
// the same shape before passing it to the repository.
const decimalString = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === "") return null;
    return typeof v === "number" ? String(v) : v.trim();
  });

const requiredDecimalString = z
  .union([z.string(), z.number()])
  .default("0")
  .transform((v) => {
    if (v === null || v === undefined || v === "") return "0";
    return typeof v === "number" ? String(v) : v.trim();
  });

const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v == null || v === "" ? null : v));

const socialInputSchema = z.object({
  platform: z.enum(TALENT_PLATFORMS),
  handle: z.string().min(1, "Handle obbligatorio"),
  profileUrl: optionalText,
  followers: z
    .union([z.coerce.number().int().min(0), z.null()])
    .optional()
    .transform((v) => (v == null ? 0 : v)),
  engagementPct: decimalString,
});

const rateInputSchema = z.object({
  deliverableType: z.enum(TALENT_DELIVERABLES),
  basePriceEur: requiredDecimalString,
  notes: optionalText,
});

const talentBodySchema = z.object({
  talent: z.object({
    displayName: z.string().min(1, "Nome d'arte obbligatorio"),
    realName: optionalText,
    avatarUrl: optionalText,
    bio: optionalText,
    city: optionalText,
    country: optionalText,
    email: optionalText,
    phone: optionalText,
    defaultCommissionPct: decimalString,
    tags: z.array(z.string()).optional().default([]),
    notes: optionalText,
    isActive: z.boolean().optional().default(true),
  }),
  socials: z.array(socialInputSchema).optional().default([]),
  rates: z.array(rateInputSchema).optional().default([]),
});

type ParsedBody = z.infer<typeof talentBodySchema>;

function buildInsertTalent(body: ParsedBody, companyId: number): InsertTalent {
  return {
    ...body.talent,
    companyId,
  };
}

function buildSocials(list: ParsedBody["socials"]): Omit<InsertTalentSocial, "talentId">[] {
  // Stamp statsUpdatedAt server-side so the UI can always show "ultimo
  // aggiornamento statistiche" without relying on the client clock.
  const now = new Date();
  return list.map((s) => ({
    platform: s.platform,
    handle: s.handle,
    profileUrl: s.profileUrl,
    followers: s.followers,
    engagementPct: s.engagementPct,
    statsUpdatedAt: now,
  }));
}

function buildRates(list: ParsedBody["rates"]): Omit<InsertTalentRate, "talentId">[] {
  return list.map((r) => ({
    deliverableType: r.deliverableType,
    basePriceEur: r.basePriceEur,
    notes: r.notes,
  }));
}

router.get("/api/talents", requireSalesRole, asyncHandler(async (req, res) => {
  const list = await talentRepository.getAllWithPrimarySocial(req.companyId);
  res.json(list);
}));

router.get("/api/talents/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID non valido");
  const t = await talentRepository.getById(id);
  if (!t || t.companyId !== req.companyId) throw AppError.notFound("Talent");
  res.json(t);
}));

router.post("/api/talents", requireSalesRole, asyncHandler(async (req, res) => {
  const parsed = talentBodySchema.parse(req.body);
  const created = await talentRepository.create(buildInsertTalent(parsed, req.companyId));
  if (parsed.socials.length > 0) {
    await talentRepository.replaceSocials(created.id, buildSocials(parsed.socials));
  }
  if (parsed.rates.length > 0) {
    await talentRepository.replaceRates(created.id, buildRates(parsed.rates));
  }
  const full = await talentRepository.getById(created.id);
  res.status(201).json(full);
}));

router.put("/api/talents/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID non valido");
  const existing = await talentRepository.getById(id);
  if (!existing || existing.companyId !== req.companyId) throw AppError.notFound("Talent");
  const parsed = talentBodySchema.parse(req.body);
  await talentRepository.update(id, parsed.talent);
  await talentRepository.replaceSocials(id, buildSocials(parsed.socials));
  await talentRepository.replaceRates(id, buildRates(parsed.rates));
  const full = await talentRepository.getById(id);
  res.json(full);
}));

router.get("/api/talents/:id/aggregates", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID non valido");
  const t = await talentRepository.getById(id);
  if (!t || t.companyId !== req.companyId) throw AppError.notFound("Talent");
  const agg = await campaignRepository.getTalentAggregate(id, req.companyId);
  res.json(agg);
}));

router.delete("/api/talents/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID non valido");
  const existing = await talentRepository.getById(id);
  if (!existing || existing.companyId !== req.companyId) throw AppError.notFound("Talent");
  await talentRepository.delete(id);
  res.status(204).end();
}));

export default router;
