import { Router } from "express";
import express from "express";
import { offerRepository, activityRepository, settingsRepository } from "../repositories";
import { interactionRepository } from "../repositories/interactions";
import { api } from "@shared/routes";
import { getSalesmanId, isMaster, requireSalesRole, requireMaster, getPerformedBy } from "../middlewares/auth";
import { requireOfferOwnership } from "../middlewares/ownership";
import { generateOfferPdf, generatePreviewPdf, dispatchWebhookEvent, refreshForOffer, layoutDrawingStorage, machineImageStorage } from "../services";
import { queueOffer as driveQueueOffer } from "../services/googleDrive";
import { buildMockOffer } from "../services/mockOffer";
import { generatePdf } from "../pdf";
import { asyncHandler } from "../middlewares/asyncHandler";
import { validate, offerStatusSchema } from "../validators";
import { AppError } from "../errors";
import { pdfRateLimiter } from "../middlewares/rateLimiter";
import { db, eq, and, desc, asc, inArray } from "../repositories/base";
import { offerDocuments, offers as offersTable, dealerUsers, offerItems, machines } from "@shared/schema";
import { displayVersion } from "@shared/version";
import { expandNumericImagePlaceholders } from "../../shared/lib/imagePlaceholders";
import { computeOfferChangeSummary } from "../lib/offerDiff";
import multer from "multer";
import fs from "fs";
import path from "path";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\- ]/g, "_");
}

function isValidFilename(filename: string): boolean {
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) return false;
  const resolved = path.resolve(layoutDrawingStorage.getFullPath(""), filename);
  return resolved.startsWith(path.resolve(layoutDrawingStorage.getFullPath("")));
}

const layoutUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, layoutDrawingStorage.getFullPath("")),
    filename: (_req, file, cb) => {
      const ts = Date.now();
      const ext = path.extname(file.originalname);
      cb(null, `${ts}${ext}`);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype === "application/pdf" || ext === ".dwg") cb(null, true);
    else cb(new Error("Only PDF and DWG files are allowed"));
  },
});

const OFFER_DOCS_DIR = path.join(process.cwd(), "server/assets/offer-documents");
if (!fs.existsSync(OFFER_DOCS_DIR)) fs.mkdirSync(OFFER_DOCS_DIR, { recursive: true });

const offerDocUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, OFFER_DOCS_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
});

const machinePhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, machineImageStorage.getFullPath("")),
    filename: (_req, file, cb) => {
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `custom_${ts}_${rand}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG and WebP images are allowed"));
  },
});

const router = Router();

router.get(api.offers.list.path, asyncHandler(async (req, res) => {
  const salesmanId = isMaster(req) ? null : getSalesmanId(req);
  const filters = isMaster(req) ? {
    filterSalesmanId: req.query.salesmanId ? Number(req.query.salesmanId) : undefined,
    filterDealerId: req.query.dealerId ? Number(req.query.dealerId) : undefined,
    fromDate: req.query.fromDate as string | undefined,
    toDate: req.query.toDate as string | undefined,
  } : undefined;
  const offersList = await offerRepository.getAll(req.companyId, salesmanId, filters);
  res.json(offersList);
}));

router.get("/api/offers/active-catalog-version", asyncHandler(async (req, res) => {
  const id = await settingsRepository.getActiveCatalogVersionId(req.companyId);
  res.json({ activeCatalogVersionId: id });
}));

router.post("/api/offers/:id/refresh-catalog", requireSalesRole, requireOfferOwnership, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const offer = await offerRepository.getById(id);
  if (!offer) throw AppError.notFound("Offer");

  const activeCatalogVersionId = await settingsRepository.getActiveCatalogVersionId(req.companyId);
  if (!activeCatalogVersionId) throw AppError.badRequest("No catalog version available");
  if (offer.catalogVersionId === activeCatalogVersionId) throw AppError.badRequest("Offer already uses the current catalog");

  const result = await offerRepository.refreshCatalogVersion(id, activeCatalogVersionId);

  const salesmanId = getSalesmanId(req);
  const performedBy = await getPerformedBy(req);
  await activityRepository.record({
    salesmanUserId: salesmanId,
    performedBy,
    action: "offer_catalog_refreshed",
    offerId: result.offer.id,
    offerReference: result.offer.referenceNumber,
  });

  res.status(201).json(result);
}));

router.get("/api/offers/bin", asyncHandler(async (req, res) => {
  const salesmanId = isMaster(req) ? null : getSalesmanId(req);
  const binOffers = await offerRepository.getBin(req.companyId, salesmanId);
  res.json(binOffers);
}));

router.post("/api/offers/preview-pdf", requireSalesRole, pdfRateLimiter, asyncHandler(async (req, res) => {
  const { offer: offerData, items: itemsData = [] } = req.body;
  const pdfBuffer = await generatePreviewPdf(offerData, itemsData);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="preview.pdf"');
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
}));

router.post("/api/settings/document-format/preview", requireSalesRole, pdfRateLimiter, asyncHandler(async (req, res) => {
  const formatSettings = req.body;
  const mockOffer = await buildMockOffer(req.companyId);
  const pdfBuffer = await generatePdf(mockOffer, formatSettings);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="format-preview.pdf"');
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
}));

router.get(api.offers.get.path, asyncHandler(async (req, res) => {
  const offer = await offerRepository.getById(Number(req.params.id));
  if (!offer || offer.companyId !== req.companyId) throw AppError.notFound("Offer");
  res.json(offer);
}));

router.post(api.offers.create.path, requireSalesRole, asyncHandler(async (req, res) => {
  const salesmanId = getSalesmanId(req);
  const { offer: offerData, items } = req.body;

  const activeCatalogVersionId = await settingsRepository.getActiveCatalogVersionId(req.companyId);

  const offer = await offerRepository.create(
    req.companyId,
    {
      ...offerData,
      offerType: "offer",
      salesmanUserId: offerData.salesmanUserId ?? salesmanId,
      catalogVersionId: activeCatalogVersionId,
    },
    items || []
  );

  const performedBy = await getPerformedBy(req);
  await activityRepository.record({
    salesmanUserId: salesmanId,
    performedBy,
    action: "offer_created",
    offerId: offer.id,
    offerReference: offer.referenceNumber,
  });

  dispatchWebhookEvent("offer.created", { offerId: offer.id, referenceNumber: offer.referenceNumber, subject: offer.subject, performedBy });

  refreshForOffer(offer.id).catch((err) => console.error("[analytics] refreshForOffer failed:", err));

  driveQueueOffer(offer.id).catch((err) => console.error("[drive] queue offer create failed:", err));

  // Note: we used to auto-create an `offer_created` CRM interaction here, but
  // it produced a duplicate Recap card alongside the canonical "Offerta …"
  // event derived from the offers table (#84). The activity_logs row above
  // remains the audit trail; CRM interactions stay reserved for real
  // touchpoints (emails sent, calls, visits, etc.).

  res.status(201).json(offer);
}));

router.post("/api/offers/:id/save-copy", requireSalesRole, asyncHandler(async (req, res) => {
  const offerId = Number(req.params.id);
  const salesmanId = getSalesmanId(req);
  if (!salesmanId) throw AppError.forbidden("Salesman session required");

  const original = await offerRepository.getById(offerId);
  if (!original || original.companyId !== req.companyId || original.offerType !== "offer") {
    throw AppError.notFound("Offer");
  }
  if (original.salesmanUserId === salesmanId) {
    throw AppError.badRequest("You already own this offer");
  }

  const { db: drizzleDb } = await import("../repositories/base");
  const { shareMessages, shareParticipants } = await import("@shared/schema");
  const { eq, and } = await import("drizzle-orm");
  const msgs = await drizzleDb.select({ conversationId: shareMessages.conversationId })
    .from(shareMessages)
    .where(eq(shareMessages.sharedOfferId, offerId));
  const convIds = Array.from(new Set(msgs.map(m => m.conversationId)));
  if (convIds.length === 0) throw AppError.forbidden("This offer was not shared with you");
  const participations = await drizzleDb.select()
    .from(shareParticipants)
    .where(and(
      eq(shareParticipants.participantType, "salesman"),
      eq(shareParticipants.participantId, salesmanId),
    ));
  const isParticipant = participations.some(p => convIds.includes(p.conversationId));
  if (!isParticipant) throw AppError.forbidden("This offer was not shared with you");

  const clone = await offerRepository.cloneForUser(offerId, salesmanId, original.salesmanUserId!);

  const performedBy = await getPerformedBy(req);
  await activityRepository.record({
    salesmanUserId: salesmanId,
    performedBy,
    action: "offer_saved_from_share",
    offerId: clone.id,
    offerReference: clone.referenceNumber,
  });

  res.status(201).json(clone);
}));

router.delete("/api/offers/:id", requireSalesRole, requireOfferOwnership, asyncHandler(async (req, res) => {
  await offerRepository.softDelete(Number(req.params.id));
  res.status(204).end();
}));

router.patch("/api/offers/:id/restore", requireSalesRole, requireOfferOwnership, asyncHandler(async (req, res) => {
  await offerRepository.restore(Number(req.params.id));
  res.json({ ok: true });
}));

// Master-only migration: rewrite [[IMGn]] → [[IMG:filename]] in offer-item
// description snapshots for the current company, using the source machine's
// detailImages list as the lookup table.
router.post("/api/offers/migrate-image-placeholders", requireMaster, asyncHandler(async (req, res) => {
  const stats = { itemsScanned: 0, itemsUpdated: 0 };
  // Restrict to offer items of the caller's company.
  const items = await db.select().from(offerItems).where(eq(offerItems.companyId, req.companyId));
  const cache = new Map<number, string[]>();
  const getDetail = async (machineId: number | null | undefined): Promise<string[]> => {
    if (!machineId) return [];
    if (cache.has(machineId)) return cache.get(machineId)!;
    const [m] = await db.select().from(machines).where(eq(machines.id, machineId));
    const list = (m && Array.isArray((m as any).detailImages)) ? (m as any).detailImages as string[] : [];
    cache.set(machineId, list);
    return list;
  };
  for (const it of items) {
    stats.itemsScanned++;
    const detail = await getDetail((it as any).machineId);
    if (detail.length === 0) continue;

    let changed = false;
    const newSnapDesc = it.snapshotMachineDescription
      ? expandNumericImagePlaceholders(it.snapshotMachineDescription, detail)
      : it.snapshotMachineDescription;
    if (newSnapDesc !== it.snapshotMachineDescription) changed = true;

    const descs = ((it as any).snapshotDescriptions || {}) as Record<string, string>;
    const newDescs: Record<string, string> = {};
    for (const lang of Object.keys(descs)) {
      const expanded = expandNumericImagePlaceholders(descs[lang], detail);
      newDescs[lang] = expanded;
      if (expanded !== descs[lang]) changed = true;
    }
    if (changed) {
      await db
        .update(offerItems)
        .set({
          snapshotMachineDescription: newSnapDesc ?? it.snapshotMachineDescription,
          snapshotDescriptions: Object.keys(newDescs).length > 0 ? newDescs : (it as any).snapshotDescriptions,
        })
        .where(eq(offerItems.id, it.id));
      stats.itemsUpdated++;
    }
  }
  res.json(stats);
}));

router.delete("/api/offers/:id/permanent", requireMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const offer = await offerRepository.getById(id);
  if (!offer) throw AppError.notFound("Offer");
  if (!offer.deletedAt) throw AppError.badRequest("Offer must be in the bin before permanent deletion");
  if ((offer as any).companyId != null && (offer as any).companyId !== req.companyId) {
    throw AppError.forbidden("Access denied");
  }

  await offerRepository.permanentDelete(id);

  const performedBy = await getPerformedBy(req);
  await activityRepository.record({
    salesmanUserId: getSalesmanId(req),
    performedBy,
    action: "offer_permanently_deleted",
    offerId: id,
    offerReference: offer.referenceNumber,
  });

  dispatchWebhookEvent("offer.permanently_deleted", { offerId: id, referenceNumber: offer.referenceNumber, performedBy });
  res.status(204).end();
}));

router.patch("/api/offers/:id/status", requireSalesRole, validate(offerStatusSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await offerRepository.getById(id);
  if (!existing || existing.companyId !== req.companyId) throw AppError.notFound("Offer");
  const { status } = req.body;
  const fromStatus = existing.status;
  const updated = await offerRepository.updateStatus(id, status);

  const salesmanId = getSalesmanId(req);
  const performedBy = await getPerformedBy(req);
  // Capture the actual transition (fromStatus → toStatus) at write time so
  // the recap event for `offer_status_changed` reflects the historical
  // transition, not the offer's current status at read time.
  await activityRepository.record({
    salesmanUserId: salesmanId,
    performedBy,
    action: "offer_status_changed",
    offerId: id,
    offerReference: updated.referenceNumber,
    meta: { fromStatus, toStatus: status },
  });

  dispatchWebhookEvent("offer.status_changed", { offerId: id, referenceNumber: updated.referenceNumber, newStatus: status, performedBy });

  res.json(updated);
}));

router.get("/api/offers/:id/versions", requireOfferOwnership, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = await offerRepository.getById(id);
  if (!current) throw AppError.notFound("Offer");

  const chainParentId = current.parentOfferId || current.id;

  const parentOffer = current.parentOfferId
    ? await offerRepository.getById(current.parentOfferId)
    : current;

  const childRows = await db.select({ id: offersTable.id })
    .from(offersTable)
    .where(and(
      eq(offersTable.parentOfferId, chainParentId),
      eq(offersTable.companyId, req.companyId!),
    ))
    .orderBy(asc(offersTable.version));

  const childIds = childRows.map(r => r.id);
  const allIdsOrdered: number[] = [chainParentId, ...childIds.filter(cid => cid !== chainParentId)];

  const allOffers = await Promise.all(allIdsOrdered.map(oid => offerRepository.getById(oid)));
  const offersClean = allOffers.filter((o): o is NonNullable<typeof o> => !!o && o.companyId === req.companyId);
  offersClean.sort((a, b) => (a.version ?? 0) - (b.version ?? 0));

  const chainMaxVersion = offersClean.reduce((m, o) => Math.max(m, o.version ?? 0), 0);

  // Resolve reference format to compute the displayed version number that
  // matches the suffix in `referenceNumber`. We must use the same dealer
  // context the version-creation path uses (originDealerId → dealer company),
  // otherwise dealer-format differences (e.g. versionInitial) would cause the
  // badge to diverge from the suffix actually present in referenceNumber.
  let dealerCompanyIdForFmt: number | null = null;
  const originDealerId = (parentOffer as any)?.originDealerId ?? (current as any)?.originDealerId ?? null;
  if (originDealerId) {
    const [dealerRow] = await db
      .select({ dealerCompanyId: dealerUsers.dealerCompanyId })
      .from(dealerUsers)
      .where(eq(dealerUsers.id, originDealerId));
    dealerCompanyIdForFmt = dealerRow?.dealerCompanyId ?? null;
  }
  const refFmt = await offerRepository.resolveReferenceFormatFor({
    companyId: parentOffer?.companyId ?? current.companyId ?? null,
    dealerCompanyId: dealerCompanyIdForFmt,
  });
  void refFmt; // resolved for downstream usage by other helpers; offset no longer needed

  // Fetch documents for all offers in the chain in a single query
  const docsByOffer = new Map<number, any[]>();
  if (offersClean.length > 0) {
    const offerIds = offersClean.map(o => o.id);
    const allDocs = await db.select().from(offerDocuments)
      .where(inArray(offerDocuments.offerId, offerIds));
    offersClean.forEach(o => docsByOffer.set(o.id, []));
    allDocs.forEach(d => {
      const arr = docsByOffer.get(d.offerId);
      if (arr) arr.push(d);
    });
  }

  const result = offersClean.map((o, idx) => {
    const prev = idx > 0 ? offersClean[idx - 1] : null;
    const prevDocs = prev ? (docsByOffer.get(prev.id) ?? []) : [];
    const currDocs = docsByOffer.get(o.id) ?? [];
    return {
      id: o.id,
      version: o.version,
      displayVersion: displayVersion(o.version),
      referenceNumber: o.referenceNumber,
      status: o.status,
      date: o.date,
      totalPrice: o.totalPrice,
      salesmanName: o.salesmanName,
      salesmanUserId: o.salesmanUserId,
      subject: o.subject,
      customerId: o.customerId,
      customerName: (o as any).customer?.name ?? null,
      language: o.language,
      projectData: o.projectData,
      items: o.items,
      isCurrent: (o.version ?? 0) === chainMaxVersion,
      isViewed: o.id === id,
      changeSummary: prev ? computeOfferChangeSummary(prev, o, prevDocs, currDocs) : [],
    };
  });

  res.json(result);
}));

router.post("/api/offers/:id/version", requireSalesRole, requireOfferOwnership, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const offer = await offerRepository.getById(id);
  if (!offer) throw AppError.notFound("Offer");

  const newVersion = await offerRepository.createVersion(id);

  const salesmanId = getSalesmanId(req);
  const performedBy = await getPerformedBy(req);
  await activityRepository.record({
    salesmanUserId: salesmanId,
    performedBy,
    action: "offer_versioned",
    offerId: newVersion.id,
    offerReference: newVersion.referenceNumber,
  });

  dispatchWebhookEvent("offer.versioned", { offerId: newVersion.id, referenceNumber: newVersion.referenceNumber, originalOfferId: id, performedBy });

  driveQueueOffer(newVersion.id).catch((err) => console.error("[drive] queue offer version failed:", err));

  try {
    await interactionRepository.create({
      companyId: req.companyId,
      customerId: newVersion.customerId,
      salesmanUserId: salesmanId ?? undefined,
      date: new Date(),
      direction: "outbound",
      type: "offer_versioned",
      classification: null,
      notes: `Nuova versione offerta: ${newVersion.referenceNumber} (v${displayVersion(newVersion.version)})`,
      autoGenerated: true,
      linkedOfferId: newVersion.id,
    });
  } catch (e) { console.error("[auto-interaction] offer_versioned failed:", e); }

  res.status(201).json(newVersion);
}));

router.put("/api/offers/:id", requireSalesRole, requireOfferOwnership, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const offer = await offerRepository.getById(id);
  if (!offer) throw AppError.notFound("Offer");
  const { offer: offerData, items } = req.body;
  const updated = await offerRepository.update(id, offerData, items || []);
  dispatchWebhookEvent("offer.updated", { offerId: id, referenceNumber: updated.referenceNumber });

  refreshForOffer(id).catch((err) => console.error("[analytics] refreshForOffer failed:", err));

  driveQueueOffer(id).catch((err) => console.error("[drive] queue offer update failed:", err));

  res.json(updated);
}));

router.get("/api/offers/:id/pdf", pdfRateLimiter, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("Invalid offer ID");
  const existing = await offerRepository.getById(id);
  if (!existing || existing.companyId !== req.companyId) throw AppError.notFound("Offer");
  const { buffer, filename } = await generateOfferPdf(id);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", buffer.length);
  res.send(buffer);
}));

router.post("/api/offers/layout-drawing", requireSalesRole, layoutUpload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest("No file uploaded");
  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
    url: `/api/layout-drawings/${req.file.filename}`,
  });
}));

router.get("/api/layout-drawings/:filename", asyncHandler(async (req, res) => {
  if (!req.session.salesmanUserId && !req.session.dealerId) {
    throw AppError.unauthorized("Authentication required");
  }
  const { filename } = req.params;
  if (!isValidFilename(filename)) throw AppError.badRequest("Invalid filename");
  const filePath = layoutDrawingStorage.getFullPath(filename);
  if (!fs.existsSync(filePath)) throw new AppError(404, "File not found");
  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === ".dwg" ? "application/octet-stream" : "application/pdf";
  res.setHeader("Content-Type", contentType);
  const disposition = req.query.download === "1" || ext === ".dwg" ? "attachment" : "inline";
  const displayName = typeof req.query.name === "string" && req.query.name ? req.query.name : filename;
  res.setHeader("Content-Disposition", `${disposition}; filename="${displayName}"; filename*=UTF-8''${encodeURIComponent(displayName)}`);
  fs.createReadStream(filePath).pipe(res);
}));

router.delete("/api/offers/layout-drawing/:filename", requireSalesRole, asyncHandler(async (req, res) => {
  const { filename } = req.params;
  if (!isValidFilename(filename)) throw AppError.badRequest("Invalid filename");
  await layoutDrawingStorage.delete(filename);
  res.json({ ok: true });
}));

router.post("/api/offers/:id/layout-files", requireSalesRole, layoutUpload.single("file"), asyncHandler(async (req, res) => {
  const offerId = parseInt(req.params.id);
  if (!offerId) throw AppError.badRequest("Invalid offer ID");
  const offer = await offerRepository.getById(offerId);
  if (!offer || offer.companyId !== req.companyId) throw AppError.notFound("Offer");
  if (!req.file) throw AppError.badRequest("No file uploaded");

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (ext !== ".dwg" && ext !== ".pdf") throw AppError.badRequest("Only PDF and DWG files are accepted");
  const fileInfo = { filename: req.file.filename, originalName: req.file.originalname };
  const projectData = (offer.projectData as any) ?? {};
  const field = ext === ".dwg" ? "layoutDwg" : "layoutDrawing";

  const oldFile = projectData[field];
  if (oldFile?.filename) {
    try { await layoutDrawingStorage.delete(oldFile.filename); } catch {}
  }

  projectData[field] = fileInfo;

  await offerRepository.updateProjectData(offerId, projectData);
  res.json({ ok: true, fileType: ext === ".dwg" ? "dwg" : "pdf", ...fileInfo });
}));

router.delete("/api/offers/:id/layout-files/:fileType", requireSalesRole, asyncHandler(async (req, res) => {
  const offerId = parseInt(req.params.id);
  const fileType = req.params.fileType;
  if (!offerId) throw AppError.badRequest("Invalid offer ID");
  if (fileType !== "pdf" && fileType !== "dwg") throw AppError.badRequest("fileType must be 'pdf' or 'dwg'");
  const offer = await offerRepository.getById(offerId);
  if (!offer || offer.companyId !== req.companyId) throw AppError.notFound("Offer");

  const projectData = (offer.projectData as any) ?? {};
  const field = fileType === "dwg" ? "layoutDwg" : "layoutDrawing";
  const fileInfo = projectData[field];
  if (fileInfo?.filename) {
    try { await layoutDrawingStorage.delete(fileInfo.filename); } catch {}
  }
  delete projectData[field];
  await offerRepository.updateProjectData(offerId, projectData);
  res.json({ ok: true });
}));

router.post("/api/offers/machine-photo", requireSalesRole, machinePhotoUpload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest("No file uploaded");
  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
    url: `/machine-images/${req.file.filename}`,
  });
}));

router.get("/api/offers/:id/documents", asyncHandler(async (req, res) => {
  const offerId = Number(req.params.id);
  const offer = await offerRepository.getById(offerId);
  if (!offer || offer.companyId !== req.companyId) throw AppError.notFound("Offer");
  const docs = await db.select().from(offerDocuments)
    .where(eq(offerDocuments.offerId, offerId))
    .orderBy(desc(offerDocuments.uploadedAt));
  res.json(docs);
}));

router.post("/api/offers/:id/documents", requireSalesRole, offerDocUpload.single("file"), asyncHandler(async (req, res) => {
  const offerId = Number(req.params.id);
  const offer = await offerRepository.getById(offerId);
  if (!offer || offer.companyId !== req.companyId) throw AppError.notFound("Offer");
  if (!req.file) throw AppError.badRequest("File required");

  const [doc] = await db.insert(offerDocuments).values({
    offerId,
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    description: (req.body.description as string) || undefined,
  }).returning();
  res.status(201).json(doc);
}));

router.delete("/api/offers/:offerId/documents/:docId", requireSalesRole, asyncHandler(async (req, res) => {
  const offerId = Number(req.params.offerId);
  const docId = Number(req.params.docId);
  const offer = await offerRepository.getById(offerId);
  if (!offer || offer.companyId !== req.companyId) throw AppError.notFound("Offer");

  const [doc] = await db.select().from(offerDocuments)
    .where(and(eq(offerDocuments.id, docId), eq(offerDocuments.offerId, offerId)));
  if (!doc) throw AppError.notFound("Document");

  const filepath = path.join(OFFER_DOCS_DIR, doc.filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  await db.delete(offerDocuments).where(eq(offerDocuments.id, docId));
  res.json({ success: true });
}));

router.use("/offer-documents", express.static(OFFER_DOCS_DIR));
router.use("/layout-drawings", express.static(layoutDrawingStorage.getFullPath("")));

export default router;
