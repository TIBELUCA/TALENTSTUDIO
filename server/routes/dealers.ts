import express, { Router, type Request, type Response } from "express";
import { dealerRepository, customerRepository, contactRepository, offerRepository, enquiryRepository, activityRepository, machineRepository, settingsRepository, interactionRepository } from "../repositories";
import { requireMaster, requireSalesRole, getBackofficeParentId, getBackofficeParentIds } from "../middlewares/auth";
import { requireDealer, getDealerId } from "../middlewares/dealer";
import { generateOfferPdf, generatePreviewPdf, dispatchWebhookEvent } from "../services";
import { generatePdf } from "../pdf";
import { asyncHandler } from "../middlewares/asyncHandler";
import { validate, loginSchema, dealerCreateSchema, dealerUpdateSchema, dealerCustomerCreateSchema, customerUpdateSchema, contactCreateSchema, contactUpdateSchema, revisionRequestSchema, dealerCompanyCreateSchema, dealerCompanyUpdateSchema, dealerContactCreateSchema, dealerContactUpdateSchema, presetCreateSchema, presetUpdateSchema } from "../validators";
import { AppError } from "../errors";

function localizeField(titles: Record<string, string> | null | undefined, fallback: string, language: string): string {
  if (!titles) return fallback;
  if (titles[language]) return titles[language];
  if (titles.it) return titles.it;
  const firstAvailable = Object.values(titles).find(v => v);
  return firstAvailable || fallback;
}
import { z } from "zod";
import { authRateLimiter, pdfRateLimiter } from "../middlewares/rateLimiter";
import type { DocSection, HeaderConfig, FooterConfig, DocumentFormatSettings } from "@shared/schema";
import { DEFAULT_HEADER_CONFIG, DEFAULT_FOOTER_CONFIG, DEFAULT_OFFER_NUMBER_STYLE, DEFAULT_DATE_STYLE } from "@shared/schema";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";

const DEALER_LOGOS_DIR = path.join(process.cwd(), "server", "assets", "dealer-logos");
if (!fs.existsSync(DEALER_LOGOS_DIR)) fs.mkdirSync(DEALER_LOGOS_DIR, { recursive: true });

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const dealerLogoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DEALER_LOGOS_DIR),
  filename: (req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || ".png";
    const dealerCompanyId = req.params.id;
    cb(null, `dealer-company-${dealerCompanyId}-${Date.now()}${ext}`);
  },
});

const dealerLogoUpload = multer({
  storage: dealerLogoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are accepted"));
  },
});

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    const oldSession = req.session;
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.cookie = oldSession.cookie;
      resolve();
    });
  });
}

function destroySession(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) return reject(err);
      res.clearCookie("connect.sid");
      resolve();
    });
  });
}

const router = Router();

function getDealerEnquiries(companyId: number, dealer: any) {
  return dealer.dealerCompanyId
    ? enquiryRepository.getByDealerCompanyId(companyId, dealer.dealerCompanyId)
    : enquiryRepository.getByDealerId(companyId, dealer.id);
}

async function assertDealerOfferAccess(companyId: number, dealer: any, offer: any): Promise<void> {
  if (!offer || offer.companyId !== companyId || offer.offerType !== "offer") throw AppError.notFound("Offer");
  if (offer.dealerId === dealer.id) return;
  if (offer.originDealerId != null) {
    if (offer.originDealerId === dealer.id) return;
    if (dealer.dealerCompanyId && await enquiryRepository.dealerBelongsToCompany(offer.originDealerId, dealer.dealerCompanyId)) return;
  }
  const dealerEnquiries = await getDealerEnquiries(companyId, dealer);
  const linked = dealerEnquiries.find((e: { linkedOfferId?: number | null; id: number }) =>
    e.linkedOfferId === offer.id || (offer.sourceEnquiryId != null && dealerEnquiries.some((eq2: { id: number }) => eq2.id === offer.sourceEnquiryId))
  );
  if (linked) return;
  throw AppError.forbidden("Access denied");
}

router.post("/api/dealer/login", authRateLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const dealer = await dealerRepository.getByEmail(email);
  if (!dealer || !dealer.isActive) throw AppError.unauthorized("Invalid credentials");
  const valid = await bcrypt.compare(password, dealer.passwordHash);
  if (!valid) throw AppError.unauthorized("Invalid credentials");
  await regenerateSession(req);
  req.session.dealerId = dealer.id;
  await dealerRepository.recordLogin(dealer.id);
  await activityRepository.record({ dealerUserId: dealer.id, performedBy: `${dealer.name} ${dealer.surname}`.trim(), action: "dealer_login" });
  dispatchWebhookEvent("dealer.login", { dealerId: dealer.id, dealerEmail: dealer.email });
  const dealerWithCompany = await dealerRepository.getById(dealer.id);
  const company = dealerWithCompany?.dealerCompany;
  const linkedSalesmanId = company?.linkedSalesmanId ?? dealer.linkedSalesmanId;
  res.json({ type: "dealer", id: dealer.id, email: dealer.email, name: dealer.name, surname: dealer.surname, linkedSalesmanId, dealerCompanyId: dealer.dealerCompanyId, dealerCompany: company });
}));

router.post("/api/dealer/logout", asyncHandler(async (req, res) => {
  const dealerId = getDealerId(req);
  if (dealerId) {
    const dealer = await dealerRepository.getById(dealerId);
    if (dealer) await activityRepository.record({ dealerUserId: dealer.id, performedBy: `${dealer.name} ${dealer.surname}`.trim(), action: "dealer_logout" });
  }
  await destroySession(req, res);
  res.json({ ok: true });
}));

// ─── Dealer Document Format Settings ────────────────────────────────────────

async function resolveDealerCompanyId(req: Request): Promise<number> {
  const dealerId = getDealerId(req);
  if (!dealerId) throw AppError.unauthorized("Dealer authentication required");
  const dealer = await dealerRepository.getById(dealerId);
  if (!dealer?.dealerCompanyId) throw AppError.badRequest("No dealer company associated");
  return dealer.dealerCompanyId;
}

const dealerFormatLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DEALER_LOGOS_DIR),
    filename: (req, _file, cb) => {
      const ext = MIME_TO_EXT[_file.mimetype] || ".png";
      cb(null, `dealer-format-logo-${req.session.dealerId}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are accepted"));
  },
});

router.get("/api/dealer/settings/document-format", requireDealer, asyncHandler(async (req, res) => {
  const dealerCompanyId = await resolveDealerCompanyId(req);
  const fmt = await settingsRepository.getDealerDocumentFormat(dealerCompanyId);
  const company = await dealerRepository.getCompanyById(dealerCompanyId);
  if (company) {
    const footer = fmt.footer ?? { ...DEFAULT_FOOTER_CONFIG };
    const isProducerDefault = !footer.companyLines || footer.companyLines.length === 0
      || JSON.stringify(footer.companyLines) === JSON.stringify(DEFAULT_FOOTER_CONFIG.companyLines);
    if (isProducerDefault) {
      if (company.docFooterLines && Array.isArray(company.docFooterLines) && (company.docFooterLines as string[]).length > 0) {
        footer.companyLines = company.docFooterLines as string[];
      } else {
        footer.companyLines = [company.companyName];
      }
    }
    fmt.footer = footer;
  }
  res.json(fmt);
}));

router.put("/api/dealer/settings/document-format", requireDealer, asyncHandler(async (req, res) => {
  const dealerCompanyId = await resolveDealerCompanyId(req);
  const body = req.body;
  if (!body || !Array.isArray(body.sections)) throw AppError.badRequest("Invalid format settings");
  const existing = await settingsRepository.getDealerDocumentFormat(dealerCompanyId) as any;
  const fmt: DocumentFormatSettings = {
    sections: body.sections as DocSection[],
    pageBackground: body.pageBackground ?? '#F9FAFB',
    borderRadius: body.borderRadius ?? 6,
    borderWidth: body.borderWidth ?? 1,
    header: body.header
      ? {
          ...DEFAULT_HEADER_CONFIG,
          ...body.header,
          offerNumberStyle: { ...DEFAULT_OFFER_NUMBER_STYLE, ...(body.header.offerNumberStyle ?? {}) },
          dateStyle: { ...DEFAULT_DATE_STYLE, ...(body.header.dateStyle ?? {}) },
        } as HeaderConfig
      : undefined,
    footer: body.footer
      ? { ...DEFAULT_FOOTER_CONFIG, ...body.footer } as FooterConfig
      : undefined,
    dealerLogoFilename: existing.dealerLogoFilename,
    dealerOfferPrefix: existing.dealerOfferPrefix,
    dealerOfferNextNumber: existing.dealerOfferNextNumber,
    dealerOfferNumberPadding: existing.dealerOfferNumberPadding,
    // Allow explicit `null` to clear an override and inherit the company-level
    // format. Only fall back to the existing value when the field is absent.
    offerReferenceFormat: 'offerReferenceFormat' in (body as object)
      ? (body as any).offerReferenceFormat
      : existing.offerReferenceFormat ?? undefined,
  } as any;
  await settingsRepository.saveDealerDocumentFormat(dealerCompanyId, fmt);
  res.json(fmt);
}));

router.get("/api/dealer/settings/offer-naming", requireDealer, asyncHandler(async (req, res) => {
  const dealerCompanyId = await resolveDealerCompanyId(req);
  const fmt = await settingsRepository.getDealerDocumentFormat(dealerCompanyId) as any;
  res.json({
    offerPrefix: fmt.dealerOfferPrefix || "",
    nextNumber: fmt.dealerOfferNextNumber || 1,
    numberPadding: fmt.dealerOfferNumberPadding || 3,
  });
}));

router.put("/api/dealer/settings/offer-naming", requireDealer, asyncHandler(async (req, res) => {
  const dealerCompanyId = await resolveDealerCompanyId(req);
  const { offerPrefix, nextNumber, numberPadding } = req.body;
  if (offerPrefix != null && typeof offerPrefix !== "string") throw AppError.badRequest("Invalid prefix");
  const parsedNext = nextNumber != null ? parseInt(String(nextNumber), 10) : NaN;
  const parsedPadding = numberPadding != null ? parseInt(String(numberPadding), 10) : NaN;
  const fmt = await settingsRepository.getDealerDocumentFormat(dealerCompanyId) as any;
  const updated = {
    ...fmt,
    dealerOfferPrefix: offerPrefix ?? fmt.dealerOfferPrefix ?? "",
    dealerOfferNextNumber: !isNaN(parsedNext) ? Math.max(1, parsedNext) : (fmt.dealerOfferNextNumber ?? 1),
    dealerOfferNumberPadding: !isNaN(parsedPadding) ? Math.max(1, Math.min(6, parsedPadding)) : (fmt.dealerOfferNumberPadding ?? 3),
  };
  await settingsRepository.saveDealerDocumentFormat(dealerCompanyId, updated);
  res.json({
    offerPrefix: updated.dealerOfferPrefix,
    nextNumber: updated.dealerOfferNextNumber,
    numberPadding: updated.dealerOfferNumberPadding,
  });
}));

router.post("/api/dealer/settings/document-format/logo", requireDealer, dealerFormatLogoUpload.single("logo"), asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest("No logo file uploaded");
  const dealerCompanyId = await resolveDealerCompanyId(req);
  const fmt = await settingsRepository.getDealerDocumentFormat(dealerCompanyId);
  const logoFilename = req.file.filename;
  await settingsRepository.saveDealerDocumentFormat(dealerCompanyId, { ...fmt, dealerLogoFilename: logoFilename } as any);
  res.json({ success: true, path: `/api/dealer/settings/document-format/logo-preview` });
}));

router.get("/api/dealer/settings/document-format/logo-preview", requireDealer, asyncHandler(async (req, res) => {
  const dealerCompanyId = await resolveDealerCompanyId(req);
  const fmt = await settingsRepository.getDealerDocumentFormat(dealerCompanyId) as any;
  const logoFilename = fmt.dealerLogoFilename;
  if (!logoFilename) {
    const company = await dealerRepository.getCompanyById(dealerCompanyId);
    if (company?.docLogoUrl) {
      const fallbackPath = path.join(DEALER_LOGOS_DIR, path.basename(company.docLogoUrl));
      if (fs.existsSync(fallbackPath)) return res.sendFile(fallbackPath);
    }
    throw AppError.notFound("No dealer logo");
  }
  const filePath = path.join(DEALER_LOGOS_DIR, path.basename(logoFilename));
  if (!fs.existsSync(filePath)) throw AppError.notFound("Logo not found");
  res.sendFile(filePath);
}));

router.post("/api/dealer/settings/document-format/preview", requireDealer, pdfRateLimiter, asyncHandler(async (req, res) => {
  const { buildMockOffer } = await import("../services/mockOffer");
  const formatSettings = req.body;
  const dealerCompanyId = await resolveDealerCompanyId(req);
  const company = await dealerRepository.getCompanyById(dealerCompanyId);

  const mockOffer = await buildMockOffer(req.companyId);
  mockOffer.projectData = mockOffer.projectData ?? {};
  mockOffer.projectData.presentationMode = "dealer";

  const dealerId = getDealerId(req);
  const dealerUser = dealerId ? await dealerRepository.getById(dealerId) : null;

  if (dealerUser) {
    const dealerName = `${dealerUser.name ?? ""} ${dealerUser.surname ?? ""}`.trim() || company?.companyName || "Dealer";
    mockOffer.projectData.headerInfo = {
      ...(mockOffer.projectData.headerInfo ?? {}),
      salesman: {
        name: dealerName,
        email: dealerUser.email ?? "",
        mobile: dealerUser.mobileNumber ?? "",
      },
    };
  }

  if (company) {
    mockOffer.salesmanName = company.companyName;
    if (company.docTermsText) {
      mockOffer.projectData.selectedPresets = [
        { id: -1, title: "TERMS & CONDITIONS", content: company.docTermsText },
      ];
    }
  }

  let logoBase64: string | undefined;
  const fmt = await settingsRepository.getDealerDocumentFormat(dealerCompanyId) as any;
  const logoFilename = fmt.dealerLogoFilename;

  function readLogoAsBase64(filePath: string): string | undefined {
    if (!fs.existsSync(filePath)) return undefined;
    const buf = fs.readFileSync(filePath);
    return buf.toString("base64");
  }

  if (logoFilename) {
    logoBase64 = readLogoAsBase64(path.join(DEALER_LOGOS_DIR, path.basename(logoFilename)));
  }
  if (!logoBase64 && company?.docLogoUrl) {
    logoBase64 = readLogoAsBase64(path.join(DEALER_LOGOS_DIR, path.basename(company.docLogoUrl)));
  }

  const pdfBuffer = await generatePdf(mockOffer, formatSettings, logoBase64);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="dealer-format-preview.pdf"');
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
}));

// ─── Dealer Company admin CRUD ──────────────────────────────────────────────

router.get("/api/dealers", requireSalesRole, asyncHandler(async (req, res) => {
  let companies = await dealerRepository.getAllCompanies(req.companyId);
  const backofficeParentDealer = getBackofficeParentIds(req);
  if (backofficeParentDealer.length > 0) {
    companies = companies.filter((c: any) => c.linkedSalesmanId != null && backofficeParentDealer.includes(c.linkedSalesmanId));
  }
  res.json(companies);
}));

router.post("/api/dealers", requireMaster, validate(dealerCompanyCreateSchema), asyncHandler(async (req, res) => {
  const company = await dealerRepository.createCompany(req.companyId, req.body);
  res.status(201).json(company);
}));

router.put("/api/dealers/:id", requireMaster, validate(dealerCompanyUpdateSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await dealerRepository.getCompanyById(id);
  if (!existing || existing.companyId !== req.companyId) throw AppError.notFound("Dealer company not found");
  const company = await dealerRepository.updateCompany(id, req.body);
  res.json(company);
}));

router.delete("/api/dealers/:id", requireMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await dealerRepository.getCompanyById(id);
  if (!existing || existing.companyId !== req.companyId) throw AppError.notFound("Dealer company not found");
  await dealerRepository.deleteCompany(id);
  res.status(204).end();
}));

router.use("/dealer-logos", (_req, res, next) => {
  res.setHeader("Cache-Control", "public, max-age=86400");
  next();
}, express.static(DEALER_LOGOS_DIR));

router.post("/api/dealers/:id/logo", requireMaster, dealerLogoUpload.single("logo"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const company = await dealerRepository.getCompanyById(id);
  if (!company || company.companyId !== req.companyId) throw AppError.notFound("Dealer company not found");
  const file = req.file;
  if (!file) throw AppError.badRequest("No file uploaded");
  const logoUrl = `/dealer-logos/${file.filename}`;
  await dealerRepository.updateCompany(id, { docLogoUrl: logoUrl });
  res.json({ docLogoUrl: logoUrl });
}));

router.delete("/api/dealers/:id/logo", requireMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const company = await dealerRepository.getCompanyById(id);
  if (!company || company.companyId !== req.companyId) throw AppError.notFound("Dealer company not found");
  if (company.docLogoUrl) {
    const filePath = path.join(DEALER_LOGOS_DIR, path.basename(company.docLogoUrl));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  await dealerRepository.updateCompany(id, { docLogoUrl: null });
  res.json({ docLogoUrl: null });
}));

// ─── Dealer Contact admin CRUD ───────────────────────────────────────────────

router.get("/api/dealers/:id/contacts", requireSalesRole, asyncHandler(async (req, res) => {
  const dealerCompanyId = Number(req.params.id);
  const company = await dealerRepository.getCompanyById(dealerCompanyId);
  if (!company || company.companyId !== req.companyId) throw AppError.notFound("Dealer company not found");
  const backofficeParentDealerContacts = getBackofficeParentIds(req);
  if (backofficeParentDealerContacts.length > 0 && (company.linkedSalesmanId == null || !backofficeParentDealerContacts.includes(company.linkedSalesmanId))) {
    throw AppError.forbidden("Access denied: dealer not linked to your salesman");
  }
  const contacts = await dealerRepository.getContactsByCompanyId(dealerCompanyId);
  res.json(contacts.map(c => ({ ...c, passwordHash: undefined, companyId: undefined })));
}));

router.post("/api/dealers/:id/contacts", requireMaster, validate(dealerContactCreateSchema), asyncHandler(async (req, res) => {
  const dealerCompanyId = Number(req.params.id);
  const company = await dealerRepository.getCompanyById(dealerCompanyId);
  if (!company) throw AppError.notFound("Dealer company");
  try {
    const contact = await dealerRepository.createContact(dealerCompanyId, req.companyId, req.body);
    dispatchWebhookEvent("dealer.registered", { dealerId: contact.id, dealerEmail: contact.email, dealerName: `${contact.name} ${contact.surname}`.trim() });
    res.status(201).json({ ...contact, passwordHash: undefined, companyId: undefined });
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { code?: string }).code === "23505") {
      throw AppError.conflict("Email already in use");
    }
    throw err;
  }
}));

router.put("/api/dealers/:id/contacts/:cid", requireMaster, validate(dealerContactUpdateSchema), asyncHandler(async (req, res) => {
  const contact = await dealerRepository.updateContact(Number(req.params.cid), req.body);
  res.json({ ...contact, passwordHash: undefined, companyId: undefined });
}));

router.delete("/api/dealers/:id/contacts/:cid", requireMaster, asyncHandler(async (req, res) => {
  await dealerRepository.deleteContact(Number(req.params.cid));
  res.status(204).end();
}));

router.get("/api/dealers/:id/contacts/:cid", requireSalesRole, asyncHandler(async (req, res) => {
  const dealerCompanyId = Number(req.params.id);
  const company = await dealerRepository.getCompanyById(dealerCompanyId);
  if (!company || company.companyId !== req.companyId) throw AppError.notFound("Dealer company not found");
  const backofficeParentDealerContact = getBackofficeParentIds(req);
  if (backofficeParentDealerContact.length > 0 && (company.linkedSalesmanId == null || !backofficeParentDealerContact.includes(company.linkedSalesmanId))) {
    throw AppError.forbidden("Access denied: dealer not linked to your salesman");
  }
  const contacts = await dealerRepository.getContactsByCompanyId(dealerCompanyId);
  const contact = contacts.find(c => c.id === Number(req.params.cid));
  if (!contact) throw AppError.notFound("Dealer contact not found");
  res.json({ ...contact, passwordHash: undefined, companyId: undefined });
}));

// ─── Dealer Company linked offers / enquiries (admin view) ────────────────
router.get("/api/dealers/:id/linked-offers", requireMaster, asyncHandler(async (req, res) => {
  const dealerCompanyId = Number(req.params.id);
  const company = await dealerRepository.getCompanyById(dealerCompanyId);
  if (!company || company.companyId !== req.companyId) throw AppError.notFound("Dealer company not found");
  const { db: drizzleDb } = await import("../repositories/base");
  const { offers: offersTable, dealerUsers } = await import("@shared/schema");
  const { eq, and, isNull, inArray } = await import("drizzle-orm");
  const dealerUserRows = await drizzleDb.select({ id: dealerUsers.id }).from(dealerUsers).where(eq(dealerUsers.dealerCompanyId, dealerCompanyId));
  const dealerIds = dealerUserRows.map(d => d.id);
  if (dealerIds.length === 0) return res.json([]);
  const linkedOffers = await drizzleDb.select().from(offersTable).where(and(
    eq(offersTable.companyId, req.companyId),
    inArray(offersTable.originDealerId, dealerIds),
    isNull(offersTable.deletedAt),
  ));
  res.json(linkedOffers);
}));

router.get("/api/dealer/machines", requireDealer, asyncHandler(async (req, res) => {
  const machines = await machineRepository.getAll(req.companyId);
  res.json(machines);
}));

router.get("/api/dealer/customers", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const list = dealer.dealerCompanyId
    ? await customerRepository.getByDealerCompanyId(dealer.dealerCompanyId)
    : await customerRepository.getByDealerId(dealer.id);
  res.json(list);
}));

router.get("/api/dealer/customers/:id", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const existing = await customerRepository.getById(id);
  if (!existing) throw AppError.notFound("Customer");
  const hasAccess = dealer.dealerCompanyId
    ? await customerRepository.belongsToDealerCompany(id, dealer.dealerCompanyId)
    : existing.dealerId === dealer.id;
  if (!hasAccess) throw AppError.notFound("Customer");
  res.json(existing);
}));

router.post("/api/dealer/customers", requireDealer, validate(dealerCustomerCreateSchema), asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const { dealerId, companyId, mergedIntoId, salesmanId, ...fields } = req.body;
  const dealerWithCompany = await dealerRepository.getById(dealer.id);
  const linkedSalesmanId = dealerWithCompany?.dealerCompany?.linkedSalesmanId ?? dealer.linkedSalesmanId ?? null;
  const customer = await customerRepository.create({
    ...fields,
    dealerId: dealer.id,
    companyId: req.companyId,
    accountStatus: "Pending Validation",
    salesmanId: linkedSalesmanId,
  });
  await activityRepository.record({
    dealerUserId: dealer.id,
    performedBy: `${dealer.name} ${dealer.surname}`.trim(),
    action: "dealer_created_company",
    offerId: customer.id,
    offerReference: customer.name,
  });
  res.status(201).json(customer);
}));

router.put("/api/dealer/customers/:id", requireDealer, validate(customerUpdateSchema), asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const existing = await customerRepository.getById(id);
  if (!existing) throw AppError.notFound("Customer");
  const hasAccess = dealer.dealerCompanyId
    ? await customerRepository.belongsToDealerCompany(id, dealer.dealerCompanyId)
    : existing.dealerId === dealer.id;
  if (!hasAccess) throw AppError.notFound("Customer");
  const { dealerId, companyId, mergedIntoId, salesmanId, accountStatus, ...fields } = req.body;
  const updated = await customerRepository.update(id, fields);
  await activityRepository.record({
    dealerUserId: dealer.id,
    performedBy: `${dealer.name} ${dealer.surname}`.trim(),
    action: "dealer_edited_company",
    offerId: id,
    offerReference: updated.name,
  });
  res.json(updated);
}));

router.delete("/api/dealer/customers/:id", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const existing = await customerRepository.getById(id);
  if (!existing) throw AppError.notFound("Customer");
  const hasAccess = dealer.dealerCompanyId
    ? await customerRepository.belongsToDealerCompany(id, dealer.dealerCompanyId)
    : existing.dealerId === dealer.id;
  if (!hasAccess) throw AppError.notFound("Customer");
  await customerRepository.update(id, { accountStatus: "Pending Deletion" });
  await activityRepository.record({
    dealerUserId: dealer.id,
    performedBy: `${dealer.name} ${dealer.surname}`.trim(),
    action: "dealer_requested_company_deletion",
    offerId: id,
    offerReference: existing.name,
  });
  res.json({ message: "Deletion request sent for validation" });
}));

router.get("/api/dealer/contacts", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const filterCustomerId = req.query.customerId ? Number(req.query.customerId) : undefined;
  const customers = dealer.dealerCompanyId
    ? await customerRepository.getByDealerCompanyId(dealer.dealerCompanyId)
    : await customerRepository.getByDealerId(dealer.id);
  const customerIds = customers.map((c: any) => c.id);
  if (filterCustomerId) {
    if (!customerIds.includes(filterCustomerId)) {
      throw new AppError(404, "Customer not found");
    }
    const list = await contactRepository.getByCustomerId(filterCustomerId);
    return res.json(list);
  }
  const contactsList = await contactRepository.getByDealerCustomerIds(customerIds);
  res.json(contactsList);
}));

router.post("/api/dealer/contacts", requireDealer, validate(contactCreateSchema), asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const { customerId, firstName, lastName } = req.body;
  if (!customerId || !firstName || !lastName) throw new AppError(400, "customerId, firstName, and lastName are required");
  const customer = await customerRepository.getById(customerId);
  if (!customer) throw AppError.notFound("Customer");
  const hasAccess = dealer.dealerCompanyId
    ? await customerRepository.belongsToDealerCompany(customerId, dealer.dealerCompanyId)
    : customer.dealerId === dealer.id;
  if (!hasAccess) throw AppError.notFound("Customer");
  const { salesmanId: _s, ...fields } = req.body;
  const contact = await contactRepository.create({
    ...fields,
    contactStatus: "Pending Validation",
  });
  await activityRepository.record({
    dealerUserId: dealer.id,
    performedBy: `${dealer.name} ${dealer.surname}`.trim(),
    action: "dealer_created_contact",
    offerId: contact.id,
    offerReference: `${contact.firstName} ${contact.lastName}`.trim(),
  });
  res.status(201).json(contact);
}));

router.get("/api/dealer/contacts/:contactId", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const contactId = Number(req.params.contactId);
  const existing = await contactRepository.getById(contactId);
  if (!existing) throw AppError.notFound("Contact");
  const customer = await customerRepository.getById(existing.customerId);
  if (!customer) throw AppError.notFound("Customer");
  const hasAccess = dealer.dealerCompanyId
    ? await customerRepository.belongsToDealerCompany(existing.customerId, dealer.dealerCompanyId)
    : customer.dealerId === dealer.id;
  if (!hasAccess) throw AppError.notFound("Contact");
  res.json(existing);
}));

router.put("/api/dealer/contacts/:contactId", requireDealer, validate(contactUpdateSchema), asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const contactId = Number(req.params.contactId);
  const existing = await contactRepository.getById(contactId);
  if (!existing) throw AppError.notFound("Contact");
  const customer = await customerRepository.getById(existing.customerId);
  if (!customer) throw AppError.notFound("Customer");
  const hasAccess = dealer.dealerCompanyId
    ? await customerRepository.belongsToDealerCompany(existing.customerId, dealer.dealerCompanyId)
    : customer.dealerId === dealer.id;
  if (!hasAccess) throw AppError.notFound("Contact");
  const { customerId, contactStatus, salesmanId: _s2, ...fields } = req.body;
  const updated = await contactRepository.update(contactId, fields);
  await activityRepository.record({
    dealerUserId: dealer.id,
    performedBy: `${dealer.name} ${dealer.surname}`.trim(),
    action: "dealer_edited_contact",
    offerId: contactId,
    offerReference: `${updated.firstName} ${updated.lastName}`,
  });
  res.json(updated);
}));

router.delete("/api/dealer/contacts/:contactId", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const contactId = Number(req.params.contactId);
  const existing = await contactRepository.getById(contactId);
  if (!existing) throw AppError.notFound("Contact");
  const customer = await customerRepository.getById(existing.customerId);
  if (!customer) throw AppError.notFound("Customer");
  const hasAccess = dealer.dealerCompanyId
    ? await customerRepository.belongsToDealerCompany(existing.customerId, dealer.dealerCompanyId)
    : customer.dealerId === dealer.id;
  if (!hasAccess) throw AppError.notFound("Contact");
  await contactRepository.update(contactId, { contactStatus: "Pending Deletion" });
  await activityRepository.record({
    dealerUserId: dealer.id,
    performedBy: `${dealer.name} ${dealer.surname}`.trim(),
    action: "dealer_requested_contact_deletion",
    offerId: contactId,
    offerReference: `${existing.firstName} ${existing.lastName}`.trim(),
  });
  res.json({ message: "Deletion request sent for validation" });
}));

async function getAllDealerOffers(companyId: number, dealer: any) {
  const enquiries = await getDealerEnquiries(companyId, dealer);

  const resaleEnquiries = enquiries.filter((e: any) => {
    const sm = (e.projectData as any)?.commercial?.salesModel;
    return !sm || sm === "dealer_buys_resells";
  });

  const offerIds = resaleEnquiries
    .map((e: { linkedOfferId?: number | null }) => e.linkedOfferId)
    .filter((id): id is number => id != null);
  const dealerOffers = await Promise.all(offerIds.map(id => offerRepository.getById(id)));

  const { db: drizzleDb } = await import("../repositories/base");
  const { offers: offersTable } = await import("@shared/schema");
  const { eq, and, isNull, inArray } = await import("drizzle-orm");
  const dealerIds: number[] = [];
  dealerIds.push(dealer.id);
  if (dealer.dealerCompanyId) {
    const { dealerUsers } = await import("@shared/schema");
    const companyDealers = await drizzleDb.select({ id: dealerUsers.id }).from(dealerUsers).where(eq(dealerUsers.dealerCompanyId, dealer.dealerCompanyId));
    companyDealers.forEach(d => { if (!dealerIds.includes(d.id)) dealerIds.push(d.id); });
  }
  const originOffers = await drizzleDb.select().from(offersTable).where(and(
    eq(offersTable.companyId, companyId),
    inArray(offersTable.originDealerId, dealerIds),
    eq(offersTable.offerType, "offer"),
    isNull(offersTable.deletedAt),
  ));
  const originOffersFull = await Promise.all(
    originOffers
      .filter(o => !offerIds.includes(o.id))
      .map(o => offerRepository.getById(o.id))
  );

  const allOffers = [...dealerOffers, ...originOffersFull];
  const valid = allOffers.filter(o => o != null && !o.deletedAt);
  const seen = new Set<number>();
  const unique = valid.filter(o => { if (seen.has(o!.id)) return false; seen.add(o!.id); return true; });
  return unique.map(o => {
    const sourceEnquiry = enquiries.find((e: { linkedOfferId?: number | null; id: number; referenceNumber: string }) => e.linkedOfferId === o!.id);
    return { ...o, customer: o!.customer, sourceEnquiryRef: sourceEnquiry?.referenceNumber ?? null, sourceEnquiryId: sourceEnquiry?.id ?? o!.originEnquiryId ?? null };
  });
}

router.get("/api/dealer/offers", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const category = req.query.category as string | undefined;
  const allOffers = await getAllDealerOffers(req.companyId, dealer);

  if (category === "supplier") {
    const supplierOffers = allOffers.filter(o => {
      const pd = o.projectData as any;
      if (pd?.dealerVersionOf) return false;
      const sm = pd?.commercial?.salesModel;
      return !sm || sm === "dealer_buys_resells";
    });
    return res.json(supplierOffers);
  }

  if (category === "customer") {
    const customerOffers = allOffers.filter(o => {
      const pd = o.projectData as any;
      return !!pd?.dealerVersionOf;
    });
    return res.json(customerOffers);
  }

  res.json(allOffers);
}));

router.get("/api/dealer/offers/:id", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const offer = await offerRepository.getById(id);
  await assertDealerOfferAccess(req.companyId, dealer, offer);
  await activityRepository.record({ dealerUserId: dealer.id, performedBy: `${dealer.name} ${dealer.surname}`.trim(), action: "dealer_viewed_offer", offerId: offer.id, offerReference: offer.referenceNumber });
  res.json(offer);
}));

router.delete("/api/dealer/offers/:id", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const offer = await offerRepository.getById(id);
  await assertDealerOfferAccess(req.companyId, dealer, offer);
  await offerRepository.softDelete(id);
  await activityRepository.record({ dealerUserId: dealer.id, performedBy: `${dealer.name} ${dealer.surname}`.trim(), action: "dealer_deleted_offer", offerId: id, offerReference: offer.referenceNumber });
  res.json({ success: true });
}));

router.put("/api/dealer/offers/:id/prices", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const offer = await offerRepository.getById(id);
  await assertDealerOfferAccess(req.companyId, dealer, offer);
  const { pricing, items, sectionOrder, hiddenSections, pageBreaks, machineBreakPositions, language } = req.body;
  const newVersion = await offerRepository.createVersion(id);
  const existingPD = (offer.projectData as Record<string, unknown>) || {};
  const updatedProjectData = {
    ...existingPD,
    pricing: pricing || (existingPD as Record<string, unknown>).pricing,
    ...(sectionOrder !== undefined && { sectionOrder }),
    ...(hiddenSections !== undefined && { hiddenSections }),
    ...(pageBreaks !== undefined && { pageBreaks }),
    ...(machineBreakPositions !== undefined && { machineBreakPositions }),
  };
  await offerRepository.update(newVersion.id, {
    customerId: newVersion.customerId,
    subject: newVersion.subject,
    salesmanName: newVersion.salesmanName,
    language: language ?? offer.language ?? "it",
    totalPrice: req.body.totalPrice ?? parseFloat(newVersion.totalPrice?.toString() ?? "0"),
    projectData: updatedProjectData,
  }, items || []);
  if (offer.sourceEnquiryId) {
    await offerRepository.linkToEnquiry(newVersion.id, offer.sourceEnquiryId);
  }
  await offerRepository.updateStatus(newVersion.id, "Sent");
  if (offer.sourceEnquiryId) {
    await offerRepository.updateStatus(offer.sourceEnquiryId, "completed");
  }
  await activityRepository.record({ dealerUserId: dealer.id, performedBy: `${dealer.name} ${dealer.surname}`.trim(), action: "dealer_edited_prices", offerId: newVersion.id, offerReference: newVersion.referenceNumber });
  dispatchWebhookEvent("dealer.price.updated", { offerId: newVersion.id, referenceNumber: newVersion.referenceNumber, dealerId: dealer.id, dealerName: `${dealer.name} ${dealer.surname}`.trim() });
  res.json({ newOfferId: newVersion.id });
}));

router.patch("/api/dealer/offers/:id/presentation-mode", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const offer = await offerRepository.getById(id);
  await assertDealerOfferAccess(req.companyId, dealer, offer);
  const mode = req.body.presentationMode;
  if (mode !== "manufacturer" && mode !== "dealer") throw AppError.badRequest("Invalid presentation mode");
  const existingPD = (offer.projectData as Record<string, unknown>) || {};
  const updatedPD = { ...existingPD, presentationMode: mode };
  await offerRepository.updateProjectData(id, updatedPD);
  await activityRepository.record({ dealerUserId: dealer.id, performedBy: `${dealer.name} ${dealer.surname}`.trim(), action: "dealer_changed_presentation_mode", offerId: id, offerReference: offer.referenceNumber });
  res.json({ presentationMode: mode });
}));

router.post("/api/dealer/offers/:id/request-revision", requireDealer, validate(revisionRequestSchema), asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const { notes } = req.body;
  const offer = await offerRepository.getById(id);
  await assertDealerOfferAccess(req.companyId, dealer, offer);
  const enquiryId = offer.sourceEnquiryId;
  if (!enquiryId) throw AppError.badRequest("No enquiry linked to this offer");
  const enquiry = await offerRepository.getById(enquiryId);
  if (!enquiry) throw AppError.notFound("Enquiry");
  const existingPD = (enquiry.projectData as Record<string, unknown>) || {};
  const revisionNotes = [...((existingPD.revisionNotes as Array<unknown>) || []), { text: notes.trim(), requestedAt: new Date().toISOString(), dealerName: `${dealer.name} ${dealer.surname}`.trim() }];
  await offerRepository.update(enquiryId, {
    customerId: enquiry.customerId,
    subject: enquiry.subject,
    salesmanName: enquiry.salesmanName,
    totalPrice: parseFloat(enquiry.totalPrice?.toString() ?? "0"),
    projectData: { ...existingPD, revisionNotes },
  }, []);
  await offerRepository.updateStatus(enquiryId, "revision_requested");
  await activityRepository.record({ dealerUserId: dealer.id, performedBy: `${dealer.name} ${dealer.surname}`.trim(), action: "dealer_requested_revision", offerId: id, offerReference: offer.referenceNumber });
  res.json({ ok: true });
}));

router.post("/api/dealer/offers/:id/create-version", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const offer = await offerRepository.getById(id);
  await assertDealerOfferAccess(req.companyId, dealer, offer);
  const pd = offer.projectData as Record<string, unknown> | null;
  if (!pd?.dealerVersionOf) throw AppError.badRequest("Can only version dealer's own offers");
  const newVersion = await offerRepository.createVersion(id);
  await activityRepository.record({
    dealerUserId: dealer.id,
    performedBy: `${dealer.name} ${dealer.surname}`.trim(),
    action: "dealer_created_version",
    offerId: newVersion.id,
    offerReference: newVersion.referenceNumber,
  });
  res.status(201).json(newVersion);
}));

router.post("/api/dealer/offers/:id/preview-pdf", requireDealer, pdfRateLimiter, asyncHandler(async (req, res) => {
  const { offer: offerData, items: itemsData = [] } = req.body;
  const pdfBuffer = await generatePreviewPdf(offerData, itemsData);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="preview.pdf"');
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
}));

router.get("/api/dealer/offers/:id/pdf", requireDealer, pdfRateLimiter, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const offerCheck = await offerRepository.getById(id);
  await assertDealerOfferAccess(req.companyId, dealer, offerCheck);
  const { buffer, filename } = await generateOfferPdf(id);
  await activityRepository.record({ dealerUserId: dealer.id, performedBy: `${dealer.name} ${dealer.surname}`.trim(), action: "dealer_downloaded_pdf", offerId: id, offerReference: filename.replace(".pdf", "") });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", buffer.length);
  res.send(buffer);
}));

router.post("/api/dealer/offers/:id/create-dealer-version", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const sourceId = Number(req.params.id);
  const sourceOffer = await offerRepository.getById(sourceId);
  await assertDealerOfferAccess(req.companyId, dealer, sourceOffer);

  const { customerId, subject, projectData, items, totalPrice, language } = req.body;
  if (!customerId || !subject) throw AppError.badRequest("Customer and subject are required");

  const customer = await customerRepository.getById(Number(customerId));
  if (!customer) throw AppError.notFound("Customer");
  if (dealer.dealerCompanyId) {
    const belongs = await customerRepository.belongsToDealerCompany(Number(customerId), dealer.dealerCompanyId);
    if (!belongs) throw AppError.forbidden("Customer does not belong to your company");
  }

  const dealerName = `${dealer.name || ""} ${dealer.surname || ""}`.trim() || "Dealer";

  const mergedPD = {
    ...(sourceOffer.projectData as Record<string, unknown> || {}),
    ...(projectData || {}),
    presentationMode: "dealer",
    dealerVersionOf: sourceId,
    dealerUserId: dealer.id,
    dealerCompanyId: dealer.dealerCompanyId,
  };

  // Reference numbering is now fully driven by OfferRepository.create, which
  // resolves the dealer's offerReferenceFormat (or falls back to the company
  // format when the dealer has not configured an override).
  const activeCatalogVersionId = await settingsRepository.getActiveCatalogVersionId(req.companyId);

  const newOffer = await offerRepository.create(
    req.companyId,
    {
      customerId: Number(customerId),
      subject,
      salesmanName: dealerName,
      language: language ?? sourceOffer.language ?? "it",
      totalPrice: parseFloat(totalPrice?.toString() ?? "0"),
      projectData: mergedPD,
      offerType: "offer",
      originDealerId: dealer.id,
      sourceEnquiryId: sourceOffer.sourceEnquiryId ?? null,
      catalogVersionId: activeCatalogVersionId,
    } as any,
    items || [],
  );

  await offerRepository.updateStatus(newOffer.id, "Sent");

  await activityRepository.record({
    dealerUserId: dealer.id,
    performedBy: dealerName,
    action: "dealer_created_offer_version",
    offerId: newOffer.id,
    offerReference: newOffer.referenceNumber,
  });

  dispatchWebhookEvent("dealer.offer.created", {
    offerId: newOffer.id,
    referenceNumber: newOffer.referenceNumber,
    sourceOfferId: sourceId,
    dealerId: dealer.id,
    dealerName,
  });

  res.status(201).json({ offerId: newOffer.id, referenceNumber: newOffer.referenceNumber });
}));

router.post("/api/dealer/offers/:id/dealer-preview-pdf", requireDealer, pdfRateLimiter, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const { offer: offerData, items: itemsData = [] } = req.body;

  let formatSettings: any;
  if (dealer.dealerCompanyId && await settingsRepository.hasDealerDocumentFormat(dealer.dealerCompanyId)) {
    formatSettings = await settingsRepository.getDealerDocumentFormat(dealer.dealerCompanyId);
  } else {
    formatSettings = await settingsRepository.getDocumentFormat(req.companyId);
  }

  let logoBase64: string | undefined;
  if (dealer.dealerCompanyId) {
    const company = await dealerRepository.getCompanyById(dealer.dealerCompanyId);
    if (company?.docLogoUrl) {
      const fs = await import("fs");
      const pathMod = await import("path");
      const logoDir = pathMod.join(process.cwd(), "server", "assets", "dealer-logos");
      const logoFile = pathMod.join(logoDir, pathMod.basename(company.docLogoUrl));
      if (fs.existsSync(logoFile)) {
        logoBase64 = fs.readFileSync(logoFile).toString("base64");
      }
    }
    if (company?.docFooterLines && Array.isArray(company.docFooterLines)) {
      formatSettings = { ...formatSettings, footer: { ...(formatSettings.footer ?? {}), companyLines: company.docFooterLines as string[] } };
    }
  }

  const lang = offerData.language ?? "it";
  const descOverrides: Record<number, string> = offerData.projectData?.machineDescOverrides ?? {};
  const speedOverrides: Record<number, string> = offerData.projectData?.lineSpeedOverrides ?? {};
  const defaultLineSpeed: string = offerData.projectData?.technicalSpecs?.averageLineSpeed ?? "";
  const builtItems: any[] = [];
  for (let idx = 0; idx < itemsData.length; idx++) {
    const item = itemsData[idx];
    const machine = await machineRepository.getById(Number(item.machineId));
    if (!machine) continue;
    const optionIds: number[] = item.optionIds ?? [];
    const optionQuantities: Record<number, number> = item.optionQuantities ?? {};
    const customOptionPrices: Record<number, number> = item.customOptionPrices ?? {};
    const builtOptions = optionIds
      .map((oid: number) => {
        const opt = (machine as any).options?.find((o: any) => o.id === oid);
        if (!opt) return null;
        return {
          machineOptionId: oid,
          quantity: optionQuantities[oid] ?? 1,
          snapshotOptionName: localizeField(opt.titles, opt.name, lang),
          snapshotPriceModifier: customOptionPrices[oid] != null ? String(customOptionPrices[oid]) : String(opt.priceModifier ?? 0),
          snapshotElectricalPower: opt.electricalPower ?? null,
          snapshotCompressedAir: opt.compressedAir ?? null,
          snapshotExhaustedAir: opt.exhaustedAir ?? null,
          snapshotAirIntroduced: opt.airIntroduced ?? null,
        };
      })
      .filter(Boolean);
    const localizedDesc = localizeField((machine as any).descriptions, (machine as any).description ?? "", lang);
    const rawDealerDesc = descOverrides[item.machineId] ?? localizedDesc;
    const effectiveDealerSpeed = speedOverrides[item.machineId] || defaultLineSpeed;
    builtItems.push({
      id: idx,
      offerId: 0,
      machineId: item.machineId,
      position: idx + 1,
      quantity: item.quantity ?? 1,
      snapshotMachineName: localizeField((machine as any).titles, (machine as any).name, lang),
      snapshotMachineDescription: rawDealerDesc.replace(/\{\{lineSpeed\}\}/g, effectiveDealerSpeed),
      snapshotMacroType: (machine as any).macroType ?? null,
      snapshotImageUrl: (machine as any).imageUrl ?? null,
      snapshotBasePrice: item.customBasePrice != null ? String(item.customBasePrice) : String((machine as any).basePrice ?? 0),
      snapshotElectricalPower: (machine as any).electricalPower ?? null,
      snapshotCompressedAir: (machine as any).compressedAir ?? null,
      snapshotExhaustedAir: (machine as any).exhaustedAir ?? null,
      snapshotAirIntroduced: (machine as any).airIntroduced ?? null,
      snapshotInstallationDays: (machine as any).installationDays ?? null,
      options: builtOptions,
      machine,
    });
  }

  let customer: any = null;
  if (offerData.customerId) {
    customer = await customerRepository.getById(Number(offerData.customerId));
  }
  if (!customer && offerData.projectData?.headerInfo?.customer) {
    const hc = offerData.projectData.headerInfo.customer;
    customer = { id: 0, name: hc.name ?? "", email: hc.email ?? "", contactPerson: hc.contactPerson ?? null, address: hc.address ?? null };
  }

  const textOverrides: Record<string, any> = offerData.projectData?.sectionTextOverrides ?? {};
  const patchedFormatSettings = {
    ...formatSettings,
    sections: (formatSettings.sections ?? []).map((s: any) => {
      const ov = textOverrides[s.id];
      if (!ov) return s;
      return { ...s, labels: { ...(s.labels ?? {}), ...ov } };
    }),
  };

  let previewRef = "PREVIEW";
  if (dealer.dealerCompanyId) {
    const fmtRaw = await settingsRepository.getDealerDocumentFormat(dealer.dealerCompanyId) as any;
    const prefix = fmtRaw?.dealerOfferPrefix || "";
    if (prefix) {
      const nextNum = fmtRaw.dealerOfferNextNumber || 1;
      const padding = fmtRaw.dealerOfferNumberPadding || 3;
      previewRef = `${prefix}-${String(nextNum).padStart(padding, "0")}`;
    }
  }

  const draftOffer: any = {
    id: 0,
    referenceNumber: offerData.referenceNumber || previewRef,
    subject: offerData.subject ?? "",
    customerId: offerData.customerId ?? null,
    status: "Draft",
    totalPrice: offerData.totalPrice ?? "0",
    salesmanName: offerData.salesmanName ?? "",
    date: new Date().toISOString(),
    projectData: { ...(offerData.projectData ?? {}), dealerVersionOf: Number(req.params.id) },
    customer,
    items: builtItems,
    dealer: null,
  };

  const pdfBuffer = await generatePdf(draftOffer, patchedFormatSettings, logoBase64);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="dealer-preview.pdf"');
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
}));

router.get("/api/dealer/presets", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  if (!dealer.dealerCompanyId) return res.json([]);
  const { db: drizzleDb } = await import("../repositories/base");
  const { dealerPresets } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await drizzleDb.select().from(dealerPresets).where(eq(dealerPresets.dealerCompanyId, dealer.dealerCompanyId));
  res.json(rows);
}));

router.post("/api/dealer/presets", requireDealer, validate(presetCreateSchema), asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  if (!dealer.dealerCompanyId) throw AppError.badRequest("No dealer company");
  const { title, content, type, translations } = req.body;
  if (!title?.trim() || !content?.trim()) throw AppError.badRequest("Title and content are required");
  const { db: drizzleDb } = await import("../repositories/base");
  const { dealerPresets } = await import("@shared/schema");
  const [created] = await drizzleDb.insert(dealerPresets).values({
    dealerCompanyId: dealer.dealerCompanyId,
    type: type || "general",
    title: title.trim(),
    content: content.trim(),
    translations: translations || null,
  }).returning();
  res.status(201).json(created);
}));

router.put("/api/dealer/presets/:id", requireDealer, validate(presetUpdateSchema), asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  if (!dealer.dealerCompanyId) throw AppError.badRequest("No dealer company");
  const id = Number(req.params.id);
  const { title, content, type, translations } = req.body;
  const { db: drizzleDb } = await import("../repositories/base");
  const { dealerPresets } = await import("@shared/schema");
  const { eq, and } = await import("drizzle-orm");
  const [existing] = await drizzleDb.select().from(dealerPresets).where(and(eq(dealerPresets.id, id), eq(dealerPresets.dealerCompanyId, dealer.dealerCompanyId)));
  if (!existing) throw AppError.notFound("Preset");
  const updateData: Record<string, unknown> = {};
  if (title !== undefined) updateData.title = title.trim();
  if (content !== undefined) updateData.content = content.trim();
  if (type !== undefined) updateData.type = type;
  if (translations !== undefined) updateData.translations = translations;
  const [updated] = await drizzleDb.update(dealerPresets).set(updateData).where(eq(dealerPresets.id, id)).returning();
  res.json(updated);
}));

router.delete("/api/dealer/presets/:id", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  if (!dealer.dealerCompanyId) throw AppError.badRequest("No dealer company");
  const id = Number(req.params.id);
  const { db: drizzleDb } = await import("../repositories/base");
  const { dealerPresets } = await import("@shared/schema");
  const { eq, and } = await import("drizzle-orm");
  const [existing] = await drizzleDb.select().from(dealerPresets).where(and(eq(dealerPresets.id, id), eq(dealerPresets.dealerCompanyId, dealer.dealerCompanyId)));
  if (!existing) throw AppError.notFound("Preset");
  await drizzleDb.delete(dealerPresets).where(eq(dealerPresets.id, id));
  res.status(204).end();
}));

const dealerInteractionBodySchema = z.object({
  customerId: z.number(),
  contactId: z.number().nullable().optional(),
  date: z.string(),
  direction: z.enum(["inbound", "outbound"]),
  type: z.enum(["email", "phone_call", "visit", "whatsapp", "video_call", "offer_created", "offer_versioned", "todo"]),
  classification: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  reminders: z.array(z.object({ minutesBefore: z.number() })).nullable().optional(),
  sendEmail: z.boolean().optional(),
  linkedOfferId: z.number().nullable().optional(),
});

router.get("/api/dealer/interactions", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const customerIds = dealer.dealerCompanyId
    ? (await customerRepository.getByDealerCompanyId(dealer.dealerCompanyId)).map(c => c.id)
    : (await customerRepository.getByDealerId(dealer.id)).map(c => c.id);

  const filters: any = {};
  if (req.query.customerId) {
    const custId = Number(req.query.customerId);
    if (!customerIds.includes(custId)) return res.json([]);
    filters.customerId = custId;
  }
  if (req.query.contactId) filters.contactId = Number(req.query.contactId);

  const allInteractions = await interactionRepository.list(filters);
  const scoped = filters.customerId
    ? allInteractions
    : allInteractions.filter(i => customerIds.includes(i.customerId));
  res.json(scoped);
}));

router.get("/api/dealer/interactions/:id", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const interaction = await interactionRepository.getById(Number(req.params.id));
  if (!interaction) throw AppError.notFound("Interaction not found");

  const customerIds = dealer.dealerCompanyId
    ? (await customerRepository.getByDealerCompanyId(dealer.dealerCompanyId)).map(c => c.id)
    : (await customerRepository.getByDealerId(dealer.id)).map(c => c.id);
  if (!customerIds.includes(interaction.customerId)) throw AppError.notFound("Interaction not found");

  res.json(interaction);
}));

router.post("/api/dealer/interactions", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const parsed = dealerInteractionBodySchema.parse(req.body);

  const customerIds = dealer.dealerCompanyId
    ? (await customerRepository.getByDealerCompanyId(dealer.dealerCompanyId)).map(c => c.id)
    : (await customerRepository.getByDealerId(dealer.id)).map(c => c.id);
  if (!customerIds.includes(parsed.customerId)) throw AppError.forbidden("Customer not accessible");

  if (parsed.contactId) {
    const contact = await contactRepository.getById(parsed.contactId);
    if (!contact || contact.customerId !== parsed.customerId) throw AppError.forbidden("Contact does not belong to this customer");
  }

  if (parsed.linkedOfferId) {
    const offer = await offerRepository.getById(parsed.linkedOfferId);
    if (!offer || (dealer.companyId && offer.companyId !== dealer.companyId)) {
      throw AppError.badRequest("Linked offer not found or not accessible");
    }
  }

  const interaction = await interactionRepository.create({
    ...parsed,
    companyId: dealer.companyId,
    dealerUserId: dealer.id,
    date: new Date(parsed.date),
  });
  res.status(201).json(interaction);
}));

router.put("/api/dealer/interactions/:id", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const existing = await interactionRepository.getById(id);
  if (!existing) throw AppError.notFound("Interaction not found");

  const customerIds = dealer.dealerCompanyId
    ? (await customerRepository.getByDealerCompanyId(dealer.dealerCompanyId)).map(c => c.id)
    : (await customerRepository.getByDealerId(dealer.id)).map(c => c.id);
  if (!customerIds.includes(existing.customerId)) throw AppError.notFound("Interaction not found");

  const parsed = dealerInteractionBodySchema.partial().parse(req.body);

  if (parsed.customerId != null && !customerIds.includes(parsed.customerId)) {
    throw AppError.forbidden("Customer not accessible");
  }

  const resolvedCustomerId = parsed.customerId ?? existing.customerId;
  if (parsed.contactId) {
    const contact = await contactRepository.getById(parsed.contactId);
    if (!contact || contact.customerId !== resolvedCustomerId) throw AppError.forbidden("Contact does not belong to this customer");
  }

  if (parsed.linkedOfferId) {
    const offer = await offerRepository.getById(parsed.linkedOfferId);
    if (!offer || (dealer.companyId && offer.companyId !== dealer.companyId)) {
      throw AppError.badRequest("Linked offer not found or not accessible");
    }
  }

  const updates: any = { ...parsed };
  if (parsed.date) updates.date = new Date(parsed.date);

  const updated = await interactionRepository.update(id, updates);
  res.json(updated);
}));

router.delete("/api/dealer/interactions/:id", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const existing = await interactionRepository.getById(id);
  if (!existing) throw AppError.notFound("Interaction not found");

  const customerIds = dealer.dealerCompanyId
    ? (await customerRepository.getByDealerCompanyId(dealer.dealerCompanyId)).map(c => c.id)
    : (await customerRepository.getByDealerId(dealer.id)).map(c => c.id);
  if (!customerIds.includes(existing.customerId)) throw AppError.notFound("Interaction not found");

  await interactionRepository.delete(id);
  res.status(204).end();
}));

export default router;
