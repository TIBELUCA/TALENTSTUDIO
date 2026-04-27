import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { settingsRepository } from "../repositories";
import { api } from "@shared/routes";
import { requireAnyAuth, requireSalesmanOrMaster, requireMaster } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import type { DocSection, HeaderConfig, FooterConfig } from "@shared/schema";
import { DEFAULT_HEADER_CONFIG, DEFAULT_FOOTER_CONFIG, DEFAULT_OFFER_NUMBER_STYLE, DEFAULT_DATE_STYLE } from "@shared/schema";

const router = Router();

const HEADER_LOGO_PATH = path.join(process.cwd(), "server", "assets", "header-logo.png");
const logoUpload = multer({
  storage: multer.diskStorage({
    destination: path.join(process.cwd(), "server", "assets"),
    filename: (_req, _file, cb) => cb(null, "header-logo.png"),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.get(api.settings.getDocumentFormat.path, asyncHandler(async (req, res) => {
  const fmt = await settingsRepository.getDocumentFormat(req.companyId);
  res.json(fmt);
}));

router.put(api.settings.saveDocumentFormat.path, requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const parsed = api.settings.saveDocumentFormat.input.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest("Invalid format settings");
  const fmt: import("@shared/schema").DocumentFormatSettings = {
    sections: parsed.data.sections as DocSection[],
    pageBackground: parsed.data.pageBackground ?? '#F9FAFB',
    borderRadius: parsed.data.borderRadius ?? 6,
    borderWidth: parsed.data.borderWidth ?? 1,
    header: parsed.data.header
      ? {
          ...DEFAULT_HEADER_CONFIG,
          ...parsed.data.header,
          offerNumberStyle: { ...DEFAULT_OFFER_NUMBER_STYLE, ...(parsed.data.header.offerNumberStyle ?? {}) },
          dateStyle: { ...DEFAULT_DATE_STYLE, ...(parsed.data.header.dateStyle ?? {}) },
        } as HeaderConfig
      : undefined,
    footer: parsed.data.footer
      ? { ...DEFAULT_FOOTER_CONFIG, ...parsed.data.footer } as FooterConfig
      : undefined,
    offerReferenceFormat: parsed.data.offerReferenceFormat ?? undefined,
  };
  await settingsRepository.saveDocumentFormat(req.companyId, fmt);
  res.json(fmt);
}));

router.get("/api/settings/family-defaults", requireAnyAuth, asyncHandler(async (req, res) => {
  const data = await settingsRepository.getFamilyDefaults(req.companyId);
  res.json(data);
}));

router.put("/api/settings/family-defaults", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const data = req.body;
  if (typeof data !== "object" || data === null) throw AppError.badRequest("Invalid family defaults");
  await settingsRepository.saveFamilyDefaults(req.companyId, data);
  res.json(data);
}));

router.post("/api/settings/document-format/logo", requireMaster, logoUpload.single("logo"), asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest("No logo file uploaded");
  res.json({ success: true, path: "/api/header-logo" });
}));

router.get("/api/settings/ai", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const enabled = await settingsRepository.getAiEnabled(req.companyId);
  const hasKey = !!process.env.OPENAI_API_KEY;
  res.json({ enabled, hasKey });
}));

router.put("/api/settings/ai", requireMaster, asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") throw AppError.badRequest("enabled must be a boolean");
  await settingsRepository.saveAiEnabled(req.companyId, enabled);
  res.json({ enabled });
}));

function getUserKey(req: any): string | null {
  if (req.session?.salesmanId) return `dashboard_tile_order:salesman:${req.session.salesmanId}`;
  if (req.session?.dealerId) return `dashboard_tile_order:dealer:${req.session.dealerId}`;
  return null;
}

router.get("/api/user-preferences/dashboard-tile-order", requireAnyAuth, asyncHandler(async (req, res) => {
  const userKey = getUserKey(req);
  if (!userKey) return res.json({ order: null });
  const order = await settingsRepository.getDashboardTileOrder(userKey);
  res.json({ order });
}));

router.put("/api/user-preferences/dashboard-tile-order", requireAnyAuth, asyncHandler(async (req, res) => {
  const userKey = getUserKey(req);
  if (!userKey) throw AppError.badRequest("No user context");
  const order = req.body?.order;
  if (!Array.isArray(order) || !order.every((x: any) => typeof x === "string")) {
    throw AppError.badRequest("order must be an array of strings");
  }
  const companyId = (req as any).companyId ?? null;
  await settingsRepository.setDashboardTileOrder(userKey, companyId, order);
  res.json({ order });
}));

router.delete("/api/user-preferences/dashboard-tile-order", requireAnyAuth, asyncHandler(async (req, res) => {
  const userKey = getUserKey(req);
  if (!userKey) throw AppError.badRequest("No user context");
  await settingsRepository.clearDashboardTileOrder(userKey);
  res.json({ order: null });
}));

router.get("/api/header-logo", asyncHandler(async (_req, res) => {
  if (fs.existsSync(HEADER_LOGO_PATH)) {
    return res.sendFile(HEADER_LOGO_PATH);
  }
  const fallback = path.join(process.cwd(), "server", "assets", "logo.png");
  if (fs.existsSync(fallback)) {
    return res.sendFile(fallback);
  }
  res.status(404).json({ error: "No header logo found" });
}));

export default router;
