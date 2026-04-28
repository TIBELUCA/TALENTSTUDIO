import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";
import { talentRepository } from "../repositories/talents";
import { campaignRepository } from "../repositories/campaigns";
import { userRepository } from "../repositories/users";
import { requireSalesRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import {
  TALENT_PLATFORMS,
  TALENT_DELIVERABLES,
  TALENT_DELIVERABLE_LABELS,
  type TalentDeliverable,
  type InsertTalent,
  type InsertTalentSocial,
  type InsertTalentRate,
} from "@shared/schema";

// Limit price-list uploads to small Excel files held in memory only.
const ratesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Only Master and Head of Talent are allowed to upload/replace the price list
// for a talent. Talent Manager and Talent itself can only read prices.
function requireListinoEditor(req: Request, res: Response, next: NextFunction) {
  const s = req.session as any;
  const isMaster = !!s?.salesmanIsMaster || s?.salesmanRole === "master";
  const role = s?.salesmanRole as string | undefined;
  if (isMaster || role === "head_of_talent") return next();
  return res.status(403).json({ message: "Solo Master e Head of Talent possono modificare il listino." });
}

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
  await ensureTalentLoginUser(parsed, req.companyId);
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

// Download a fixed Excel template that the user can fill in with the talent's
// price list. Headers and the first column (deliverable label) are pre-filled
// so the operator only needs to type the price (and optional notes).
router.get("/api/talents/rates/template", requireSalesRole, asyncHandler(async (_req, res) => {
  const rows: (string | number)[][] = [
    ["Attività", "Prezzo (€)", "Note"],
    ...TALENT_DELIVERABLES.map((d) => [TALENT_DELIVERABLE_LABELS[d], "", ""]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 36 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Listino");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="listino-talent-template.xlsx"');
  res.send(buf);
}));

// Build a label → enum lookup that is tolerant to case/spacing/accents.
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const DELIVERABLE_BY_LABEL: Record<string, TalentDeliverable> = (() => {
  const m: Record<string, TalentDeliverable> = {};
  for (const d of TALENT_DELIVERABLES) {
    m[norm(d)] = d;
    m[norm(TALENT_DELIVERABLE_LABELS[d])] = d;
  }
  // A few common Italian aliases that operators may type by hand.
  m[norm("post ig")] = "post";
  m[norm("post feed")] = "post";
  m[norm("ig story")] = "story";
  m[norm("storia")] = "story";
  m[norm("storie")] = "story";
  m[norm("video lungo")] = "video";
  m[norm("evento")] = "event";
  return m;
})();

function parsePriceCell(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
  if (typeof v === "string") {
    const cleaned = v.replace(/[€\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return null;
}

// Upload an Excel file and replace the talent's full price list. Expected
// columns: Attività | Prezzo (€) | Note. Unknown rows and rows without a
// valid price are skipped silently and reported back to the caller.
router.post(
  "/api/talents/:id/rates/import",
  requireSalesRole,
  requireListinoEditor,
  ratesUpload.single("file"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) throw AppError.badRequest("ID non valido");
    const existing = await talentRepository.getById(id);
    if (!existing || existing.companyId !== req.companyId) throw AppError.notFound("Talent");
    if (!req.file) throw AppError.badRequest("File mancante");

    let rows: any[][];
    try {
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("Foglio vuoto");
      rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, defval: "" });
    } catch {
      throw AppError.badRequest("File Excel non valido");
    }

    // Build a per-deliverable map, last occurrence wins so an operator can
    // override an earlier row simply by re-listing it lower in the sheet.
    const byType = new Map<TalentDeliverable, { price: string; notes: string | null }>();
    const skipped: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const labelRaw = String(row[0] ?? "").trim();
      if (!labelRaw) continue;
      // Skip the header row.
      if (i === 0 && norm(labelRaw) === norm("Attività")) continue;
      const deliverable = DELIVERABLE_BY_LABEL[norm(labelRaw)];
      if (!deliverable) {
        skipped.push(`Riga ${i + 1}: attività "${labelRaw}" non riconosciuta`);
        continue;
      }
      const price = parsePriceCell(row[1]);
      if (price === null) {
        skipped.push(`Riga ${i + 1}: prezzo mancante o non valido`);
        continue;
      }
      const notes = String(row[2] ?? "").trim() || null;
      byType.set(deliverable, { price: price.toFixed(2), notes });
    }

    const newRates: Omit<InsertTalentRate, "talentId">[] = Array.from(byType.entries()).map(([d, v]) => ({
      deliverableType: d,
      basePriceEur: v.price,
      notes: v.notes,
    }));

    await talentRepository.replaceRates(id, newRates);
    const full = await talentRepository.getById(id);
    res.json({ talent: full, importedCount: newRates.length, skipped });
  }),
);

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

// When a talent is created with an email, automatically provision a login user
// with role="talent" so the talent can sign in. If the email is missing or a
// user with that email already exists, the call is a no-op. Failures are
// logged but never block the talent creation request.
async function ensureTalentLoginUser(parsed: ParsedBody, companyId: number): Promise<void> {
  try {
    const email = (parsed.talent.email ?? "").trim().toLowerCase();
    if (!email) return;
    const existing = await userRepository.getByEmail(email);
    if (existing) return;
    const display = (parsed.talent.displayName ?? "").trim();
    const real = (parsed.talent.realName ?? "").trim();
    let name = display || real || email.split("@")[0];
    let surname = "";
    if (real) {
      const parts = real.split(/\s+/);
      if (parts.length >= 2) {
        name = parts[0];
        surname = parts.slice(1).join(" ");
      } else {
        name = parts[0];
      }
    }
    await userRepository.create(companyId, {
      email,
      name: name || "Talent",
      surname,
      mobileNumber: parsed.talent.phone ?? "",
      // No password → user will sign in with Google OAuth (passwordHash=GOOGLE_OAUTH_USER).
      features: undefined as any,
      isMasterSalesman: false,
      role: "talent",
      parentSalesmanIds: [],
      assignedCountries: null,
    });
  } catch (err) {
    console.error("[talents] auto-create login user failed", err);
  }
}

export default router;
