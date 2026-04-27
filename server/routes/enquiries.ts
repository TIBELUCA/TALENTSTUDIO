import { Router } from "express";
import { offerRepository, enquiryRepository, dealerRepository, activityRepository, customerRepository, userRepository, settingsRepository } from "../repositories";
import { interactionRepository } from "../repositories/interactions";
import { isMaster, getSalesmanId, requireAuth, getPerformedBy, isAuthenticatedAny, requireSalesRole } from "../middlewares/auth";
import { requireDealer, getDealerId } from "../middlewares/dealer";
import { enquiryAttachmentStorage, dispatchWebhookEvent, refreshForOffer } from "../services";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import multer from "multer";
import path from "path";

const router = Router();

function getDealerEnquiryList(companyId: number, dealer: any) {
  return dealer.dealerCompanyId
    ? enquiryRepository.getByDealerCompanyId(companyId, dealer.dealerCompanyId)
    : enquiryRepository.getByDealerId(companyId, dealer.id);
}

async function hasDealerAccessToEnquiry(dealer: any, enquiry: { dealerId?: number | null }): Promise<boolean> {
  if (!enquiry.dealerId) return false;
  if (enquiry.dealerId === dealer.id) return true;
  if (dealer.dealerCompanyId) {
    return enquiryRepository.dealerBelongsToCompany(enquiry.dealerId, dealer.dealerCompanyId);
  }
  return false;
}

const attachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, enquiryAttachmentStorage.getFullPath("")),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const attachmentUpload = multer({ storage: attachmentStorage, limits: { fileSize: 50 * 1024 * 1024 } });

async function verifyEnquiryAccess(req: import("express").Request, enquiryId: number): Promise<void> {
  const enquiry = await offerRepository.getById(enquiryId);
  if (!enquiry || enquiry.companyId !== req.companyId || enquiry.offerType !== "enquiry") throw AppError.notFound("Enquiry");
  if (isAuthenticatedAny(req)) return;
  const dealerId = getDealerId(req);
  if (!dealerId) throw AppError.unauthorized();
  if (enquiry.dealerId !== dealerId) throw AppError.forbidden();
}

router.get("/api/enquiries/bin", requireSalesRole, asyncHandler(async (req, res) => {
  const salesmanId = getSalesmanId(req);
  const bin = await enquiryRepository.getBin(req.companyId, isMaster(req) ? null : salesmanId);
  res.json(bin.map((e: Record<string, unknown>) => {
    if (!e.dealer) return { ...e, dealer: null };
    const d = e.dealer as Record<string, unknown>;
    const dc = d.dealerCompany ? { ...(d.dealerCompany as Record<string, unknown>), companyId: undefined } : null;
    return { ...e, dealer: { ...d, passwordHash: undefined, companyId: undefined, dealerCompany: dc } };
  }));
}));

router.get("/api/dealer/enquiries/bin", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const bin = dealer.dealerCompanyId
    ? await enquiryRepository.getBinByDealerCompanyId(req.companyId, dealer.dealerCompanyId)
    : await enquiryRepository.getBinByDealerId(req.companyId, dealer.id);
  res.json(bin);
}));

router.get("/api/enquiries", requireSalesRole, asyncHandler(async (req, res) => {
  const salesmanId = getSalesmanId(req);
  const enquiries = await enquiryRepository.getAll(req.companyId, isMaster(req) ? null : salesmanId);
  res.json(enquiries.map((e: Record<string, unknown>) => {
    if (!e.dealer) return { ...e, dealer: null };
    const d = e.dealer as Record<string, unknown>;
    const dc = d.dealerCompany ? { ...(d.dealerCompany as Record<string, unknown>), companyId: undefined } : null;
    return { ...e, dealer: { ...d, passwordHash: undefined, companyId: undefined, dealerCompany: dc } };
  }));
}));

router.get("/api/dealer/enquiries", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const enquiries = await getDealerEnquiryList(req.companyId, dealer);
  res.json(enquiries);
}));

router.post("/api/dealer/enquiries", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const dealerCompany = res.locals.dealerCompany;
  const { offer: offerData, items } = req.body;
  const linkedSalesmanId = dealerCompany?.linkedSalesmanId ?? dealer.linkedSalesmanId ?? null;
  const enquiry = await offerRepository.create(
    req.companyId,
    { ...offerData, offerType: "enquiry", dealerId: dealer.id, salesmanUserId: linkedSalesmanId },
    items || []
  );
  await activityRepository.record({ dealerUserId: dealer.id, performedBy: `${dealer.name} ${dealer.surname}`.trim(), action: "enquiry_submitted", offerId: enquiry.id, offerReference: enquiry.referenceNumber });
  dispatchWebhookEvent("enquiry.created", { enquiryId: enquiry.id, referenceNumber: enquiry.referenceNumber, dealerId: dealer.id, dealerName: `${dealer.name} ${dealer.surname}`.trim() });
  dispatchWebhookEvent("enquiry.submitted", { enquiryId: enquiry.id, referenceNumber: enquiry.referenceNumber, dealerName: `${dealer.name} ${dealer.surname}`.trim() });

  try {
    await interactionRepository.create({
      companyId: req.companyId,
      customerId: enquiry.customerId,
      dealerUserId: dealer.id,
      salesmanUserId: linkedSalesmanId ?? undefined,
      date: new Date(),
      direction: "inbound",
      type: "email",
      classification: "commercial",
      notes: `Dealer offer request submitted: ${enquiry.referenceNumber} – ${enquiry.subject}`,
      autoGenerated: true,
      linkedEnquiryId: enquiry.id,
    });
  } catch (e) { console.error("[auto-interaction] enquiry_submitted failed:", e); }

  res.status(201).json(enquiry);
}));

router.get("/api/dealer/enquiries/:id", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const enquiry = await offerRepository.getById(id);
  if (!enquiry || enquiry.offerType !== "enquiry") throw AppError.notFound("Enquiry");
  if (!(await hasDealerAccessToEnquiry(dealer, enquiry))) throw AppError.notFound("Enquiry");
  const attachments = await enquiryRepository.getAttachments(id);
  const linkedOffers = await enquiryRepository.getAllLinkedOffers(id);
  const linkedOfferId = linkedOffers.length > 0 ? linkedOffers[linkedOffers.length - 1].id : null;
  let linkedOfferStatus: string | null = null;
  if (linkedOfferId) {
    const linkedOffer = await offerRepository.getById(linkedOfferId);
    linkedOfferStatus = linkedOffer?.status ?? null;
  }
  res.json({ ...enquiry, attachments, linkedOfferId, linkedOfferStatus, linkedOffers });
}));

router.post("/api/enquiries/:id/attachments", attachmentUpload.single("file"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await verifyEnquiryAccess(req, id);
  if (!req.file) throw AppError.badRequest("No file uploaded");
  const att = await enquiryRepository.addAttachment({ enquiryId: id, filename: req.file.filename, originalName: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size });
  res.status(201).json(att);
}));

router.get("/api/enquiries/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const enquiry = await offerRepository.getById(id);
  if (!enquiry || enquiry.companyId !== req.companyId || enquiry.offerType !== "enquiry") throw AppError.notFound("Enquiry");
  const attachments = await enquiryRepository.getAttachments(id);
  const dealer = enquiry.dealerId ? await dealerRepository.getById(enquiry.dealerId).then(d => {
    if (!d) return null;
    const dc = d.dealerCompany ? { ...d.dealerCompany, companyId: undefined } : null;
    return { ...d, passwordHash: undefined, companyId: undefined, dealerCompany: dc };
  }).catch(() => null) : null;
  const linkedOfferId = await enquiryRepository.getLinkedOfferId(id);
  res.json({ ...enquiry, attachments, dealer, linkedOfferId });
}));

router.get("/api/enquiries/:id/attachments", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await verifyEnquiryAccess(req, id);
  const atts = await enquiryRepository.getAttachments(id);
  res.json(atts);
}));

router.delete("/api/enquiries/:id/attachments/:aId", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await verifyEnquiryAccess(req, id);
  const aId = Number(req.params.aId);
  const att = await enquiryRepository.getAttachmentById(aId);
  if (!att || att.enquiryId !== id) throw AppError.notFound("Attachment");
  await enquiryRepository.deleteAttachment(aId);
  await enquiryAttachmentStorage.delete(att.filename);
  res.status(204).end();
}));

router.get("/enquiry-attachments/:filename", asyncHandler(async (req, res) => {
  const filename = String(req.params.filename).replace(/[^a-zA-Z0-9_\-\.]/g, "");
  const attachment = await enquiryRepository.getAttachmentByFilename(filename);
  if (!attachment) throw AppError.notFound("File");

  if (isAuthenticatedAny(req)) {
    const fullPath = enquiryAttachmentStorage.getFullPath(filename);
    return res.sendFile(fullPath);
  }

  const dealerId = getDealerId(req);
  if (!dealerId) throw AppError.unauthorized();

  const enquiry = await offerRepository.getById(attachment.enquiryId);
  if (!enquiry || enquiry.dealerId !== dealerId) throw AppError.forbidden();

  const fullPath = enquiryAttachmentStorage.getFullPath(filename);
  res.sendFile(fullPath);
}));

router.post("/api/enquiries/:id/start-offer", requireSalesRole, asyncHandler(async (req, res) => {
  const enquiryId = Number(req.params.id);
  const enquiry = await offerRepository.getById(enquiryId);
  if (!enquiry || enquiry.companyId !== req.companyId || enquiry.offerType !== "enquiry") throw AppError.notFound("Enquiry");
  const { offer: offerData, items } = req.body;
  const salesmanId = getSalesmanId(req);

  const enquiryPD = (enquiry.projectData as Record<string, any>) || {};
  const salesModel = enquiryPD.commercial?.salesModel || null;
  const incomingPD = (offerData.projectData as Record<string, any>) || {};
  const mergedProjectData: Record<string, any> = {
    ...incomingPD,
    commercial: {
      ...(incomingPD.commercial || {}),
      ...(enquiryPD.commercial || {}),
    },
  };
  let resolvedCustomerId = offerData.customerId ?? enquiry.customerId;

  // The client may now explicitly tell us which sales scenario it picked.
  // When provided, honor it instead of silently overriding from salesModel.
  const explicitScenario = (offerData.salesScenario as
    | "direct" | "with_dealer" | "to_dealer" | undefined) ?? null;
  const isToDealer = explicitScenario
    ? explicitScenario === "to_dealer"
    : salesModel === "dealer_buys_resells";

  if (isToDealer) {
    if (enquiry.customer) {
      mergedProjectData.commercial.endCustomerId = enquiry.customerId;
      mergedProjectData.commercial.endCustomerName = enquiry.customer.companyName || enquiry.customer.name || null;
    }

    const dealerUser = enquiry.dealerId ? await dealerRepository.getById(enquiry.dealerId) : null;
    const dealerCompany = dealerUser?.dealerCompanyId ? await dealerRepository.getCompanyById(dealerUser.dealerCompanyId) : null;
    if (dealerCompany) {
      mergedProjectData.commercial.dealerCompanyId = dealerCompany.id;
      mergedProjectData.commercial.dealerCompanyName = dealerCompany.companyName;

      // Legacy callers (no explicit scenario) still rely on offers.customerId
      // pointing at a dealer-proxy customer record. New callers send
      // salesScenario explicitly and treat customerId as the end customer.
      if (!explicitScenario) {
        const existing = await customerRepository.getAll(req.companyId);
        let dealerCustomer = existing.find(c => c.name === dealerCompany.companyName && !c.dealerId);
        if (!dealerCustomer) {
          dealerCustomer = await customerRepository.create({
            companyId: req.companyId,
            name: dealerCompany.companyName,
            email: dealerCompany.email ?? "",
            contactPerson: dealerUser ? `${dealerUser.name ?? ""} ${dealerUser.surname ?? ""}`.trim() || null : null,
            address: dealerCompany.address ?? null,
          });
        }
        resolvedCustomerId = dealerCustomer.id;
      }

      mergedProjectData.headerInfo = {
        ...(mergedProjectData.headerInfo ?? {}),
        customer: {
          name: dealerCompany.companyName,
          contactPerson: dealerUser ? `${dealerUser.name ?? ""} ${dealerUser.surname ?? ""}`.trim() : "",
          email: dealerCompany.email ?? "",
          address: dealerCompany.address ?? "",
        },
      };

      if (enquiry.customer) {
        const endCustRef = enquiry.customer.companyName || enquiry.customer.name || "";
        mergedProjectData.commercial.endCustomerRef = endCustRef;
      }
    }
  }

  let resolvedSalesmanName = offerData.salesmanName;
  let resolvedSalesmanEmail = offerData.salesmanEmail ?? null;
  let resolvedSalesmanMobile = offerData.salesmanMobile ?? null;

  if (salesModel === "dealer_buys_resells" && salesmanId) {
    const creatingUser = await userRepository.getById(salesmanId);
    if (creatingUser) {
      resolvedSalesmanName = `${creatingUser.name || ""} ${creatingUser.surname || ""}`.trim() || resolvedSalesmanName;
      resolvedSalesmanEmail = creatingUser.email || resolvedSalesmanEmail;
      resolvedSalesmanMobile = creatingUser.mobileNumber || resolvedSalesmanMobile;
      mergedProjectData.headerInfo = {
        ...(mergedProjectData.headerInfo ?? {}),
        salesman: {
          name: resolvedSalesmanName,
          email: resolvedSalesmanEmail || "",
          mobile: resolvedSalesmanMobile || "",
        },
      };
    }
  }

  const activeCatalogVersionId = await settingsRepository.getActiveCatalogVersionId(req.companyId);

  const newOffer = await offerRepository.create(req.companyId, {
    ...offerData,
    customerId: resolvedCustomerId,
    salesmanName: resolvedSalesmanName,
    salesmanEmail: resolvedSalesmanEmail,
    salesmanMobile: resolvedSalesmanMobile,
    projectData: mergedProjectData,
    offerType: "offer",
    salesmanUserId: salesmanId ?? offerData.salesmanUserId ?? enquiry.salesmanUserId,
    dealerId: enquiry.dealerId ?? offerData.dealerId ?? null,
    originDealerId: enquiry.dealerId ?? null,
    originEnquiryId: enquiryId,
    catalogVersionId: activeCatalogVersionId,
  }, items || []);
  await offerRepository.linkToEnquiry(newOffer.id, enquiryId);
  const performedBy = await getPerformedBy(req);
  await activityRepository.record({ salesmanUserId: salesmanId, performedBy, action: "offer_created_from_enquiry", offerId: newOffer.id, offerReference: newOffer.referenceNumber });

  refreshForOffer(newOffer.id).catch((err) => console.error("[analytics] refreshForOffer failed:", err));

  res.status(201).json(newOffer);
}));

router.patch("/api/enquiries/:id/status", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  const allowedStatuses = ["pending", "in_progress", "completed", "revision_requested"];
  if (!status || !allowedStatuses.includes(status)) throw AppError.badRequest("Invalid status");
  const enquiry = await offerRepository.getById(id);
  if (!enquiry || enquiry.offerType !== "enquiry" || enquiry.companyId !== req.companyId) throw AppError.notFound("Enquiry");
  const updated = await offerRepository.updateStatus(id, status);
  dispatchWebhookEvent("enquiry.status_changed", { enquiryId: id, referenceNumber: updated.referenceNumber, newStatus: status });
  res.json(updated);
}));

router.patch("/api/enquiries/:id/restore", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const enquiry = await offerRepository.getById(id);
  if (!enquiry || enquiry.offerType !== "enquiry" || enquiry.companyId !== req.companyId) throw AppError.notFound("Enquiry");
  await offerRepository.restore(id);
  res.json({ ok: true });
}));

router.delete("/api/enquiries/:id/permanent", requireSalesRole, asyncHandler(async (req, res) => {
  if (!isMaster(req)) throw AppError.forbidden("Only administrators can permanently delete enquiries");
  const id = Number(req.params.id);
  const enquiry = await offerRepository.getById(id);
  if (!enquiry || enquiry.offerType !== "enquiry" || enquiry.companyId !== req.companyId) throw AppError.notFound("Enquiry");
  if (!enquiry.deletedAt) throw AppError.badRequest("Enquiry must be in the bin before permanent deletion");
  await offerRepository.permanentDelete(id);
  const performedBy = await getPerformedBy(req);
  await activityRepository.record({ salesmanUserId: getSalesmanId(req), performedBy, action: "enquiry_permanently_deleted", offerId: id, offerReference: enquiry.referenceNumber });
  res.status(204).end();
}));

router.delete("/api/enquiries/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const enquiry = await offerRepository.getById(id);
  if (!enquiry || enquiry.offerType !== "enquiry" || enquiry.companyId !== req.companyId) throw AppError.notFound("Enquiry");
  await offerRepository.softDelete(id);
  const performedBy = await getPerformedBy(req);
  await activityRepository.record({ salesmanUserId: getSalesmanId(req), performedBy, action: "enquiry_deleted", offerId: id, offerReference: enquiry.referenceNumber });
  dispatchWebhookEvent("enquiry.deleted", { enquiryId: id, referenceNumber: enquiry.referenceNumber });
  res.status(204).end();
}));

router.patch("/api/dealer/enquiries/:id/status", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const enquiry = await offerRepository.getById(id);
  if (!enquiry || enquiry.offerType !== "enquiry") throw AppError.notFound("Enquiry");
  if (!(await hasDealerAccessToEnquiry(dealer, enquiry))) throw AppError.notFound("Enquiry");
  const { status } = req.body;
  const allowedStatuses = ["pending", "in_progress", "completed"];
  if (!allowedStatuses.includes(status)) throw AppError.badRequest("Invalid status");
  const updated = await offerRepository.updateStatus(id, status);
  dispatchWebhookEvent("enquiry.status_changed", { enquiryId: id, referenceNumber: updated.referenceNumber, newStatus: status });
  res.json(updated);
}));

router.patch("/api/dealer/enquiries/:id/restore", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const enquiry = await offerRepository.getById(id);
  if (!enquiry || enquiry.offerType !== "enquiry") throw AppError.notFound("Enquiry");
  if (!(await hasDealerAccessToEnquiry(dealer, enquiry))) throw AppError.notFound("Enquiry");
  await offerRepository.restore(id);
  res.json({ ok: true });
}));

router.delete("/api/dealer/enquiries/:id", requireDealer, asyncHandler(async (req, res) => {
  const dealer = res.locals.dealer;
  const id = Number(req.params.id);
  const enquiry = await offerRepository.getById(id);
  if (!enquiry || enquiry.offerType !== "enquiry") throw AppError.notFound("Enquiry");
  if (!(await hasDealerAccessToEnquiry(dealer, enquiry))) throw AppError.notFound("Enquiry");
  await offerRepository.softDelete(id);
  await activityRepository.record({ dealerUserId: dealer.id, performedBy: `${dealer.name} ${dealer.surname}`.trim(), action: "enquiry_deleted", offerId: id, offerReference: enquiry.referenceNumber });
  dispatchWebhookEvent("enquiry.deleted", { enquiryId: id, referenceNumber: enquiry.referenceNumber });
  res.status(204).end();
}));

router.post("/api/enquiries/:id/claim", requireSalesRole, asyncHandler(async (req, res) => {
  const enquiryId = Number(req.params.id);
  const salesmanId = getSalesmanId(req);
  if (!salesmanId) throw AppError.forbidden("Salesman session required");

  const enquiry = await offerRepository.getById(enquiryId);
  if (!enquiry || enquiry.companyId !== req.companyId || enquiry.offerType !== "enquiry") {
    throw AppError.notFound("Enquiry");
  }
  if (enquiry.salesmanUserId === salesmanId) {
    throw AppError.badRequest("You already own this enquiry");
  }
  if (enquiry.claimedByUserId) {
    throw AppError.badRequest("This enquiry has already been claimed");
  }

  const { db: drizzleDb } = await import("../repositories/base");
  const { shareMessages, shareParticipants } = await import("@shared/schema");
  const { eq, and, isNull } = await import("drizzle-orm");

  const msgs = await drizzleDb.select({
    conversationId: shareMessages.conversationId,
    senderType: shareMessages.senderType,
    senderId: shareMessages.senderId,
  }).from(shareMessages)
    .where(eq(shareMessages.sharedEnquiryId, enquiryId));

  const sharedByOwner = msgs.some(m =>
    m.senderType === "salesman" && m.senderId === enquiry.salesmanUserId
  );
  if (!sharedByOwner) throw AppError.forbidden("This enquiry was not shared by its owner");

  const convIds = [...new Set(msgs.filter(m =>
    m.senderType === "salesman" && m.senderId === enquiry.salesmanUserId
  ).map(m => m.conversationId))];

  const participations = await drizzleDb.select()
    .from(shareParticipants)
    .where(and(
      eq(shareParticipants.participantType, "salesman"),
      eq(shareParticipants.participantId, salesmanId),
    ));
  const isParticipant = participations.some(p => convIds.includes(p.conversationId));
  if (!isParticipant) throw AppError.forbidden("This enquiry was not shared with you");

  const forwardedBy = enquiry.salesmanUserId;
  const { offers: offersTable } = await import("@shared/schema");
  const [updated] = await drizzleDb.update(offersTable).set({
    salesmanUserId: salesmanId,
    claimedByUserId: salesmanId,
    claimedAt: new Date(),
    forwardedByUserId: forwardedBy,
  }).where(and(
    eq(offersTable.id, enquiryId),
    eq(offersTable.companyId, req.companyId),
    eq(offersTable.offerType, "enquiry"),
    isNull(offersTable.claimedByUserId),
  )).returning();

  if (!updated) {
    throw AppError.badRequest("This enquiry has already been claimed");
  }

  res.json(updated);
}));

export default router;
