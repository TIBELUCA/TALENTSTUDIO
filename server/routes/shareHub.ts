import { Router } from "express";
import { shareHubRepository, userRepository, dealerRepository } from "../repositories";
import { getSalesmanId, requireAuth } from "../middlewares/auth";
import { getDealerId } from "../middlewares/dealer";
import { shareHubAttachmentStorage } from "../services";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import multer from "multer";
import path from "path";

const router = Router();

const shareUploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, shareHubAttachmentStorage.getFullPath("")),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const shareUpload = multer({ storage: shareUploadStorage, limits: { fileSize: 50 * 1024 * 1024 } });

function getCallerIdentity(req: import("express").Request): { type: "salesman" | "dealer"; id: number } {
  const salesmanId = getSalesmanId(req);
  if (salesmanId) return { type: "salesman", id: salesmanId };
  const dealerId = getDealerId(req);
  if (dealerId) return { type: "dealer", id: dealerId };
  throw AppError.unauthorized();
}

async function resolveParticipantName(pType: string, pId: number): Promise<string> {
  if (pType === "salesman") {
    const u = await userRepository.getById(pId);
    return u ? `${u.name} ${(u as any).surname || ""}`.trim() : "Unknown";
  }
  if (pType === "dealer") {
    const d = await dealerRepository.getById(pId);
    return d ? `${d.name} ${d.surname || ""}`.trim() : "Unknown";
  }
  return "Unknown";
}

router.get("/api/share-hub/conversations", requireAuth, asyncHandler(async (req, res) => {
  const caller = getCallerIdentity(req);
  const conversations = await shareHubRepository.getConversationsByParticipant(req.companyId, caller.type, caller.id);

  const enriched = await Promise.all(
    conversations.map(async (conv) => {
      const participantsWithNames = await Promise.all(
        conv.participants.map(async (p) => ({
          ...p,
          name: await resolveParticipantName(p.participantType, p.participantId),
        })),
      );
      return { ...conv, participants: participantsWithNames };
    }),
  );

  res.json(enriched);
}));

router.get("/api/share-hub/conversations/:id", requireAuth, asyncHandler(async (req, res) => {
  const caller = getCallerIdentity(req);
  const conversationId = parseInt(req.params.id, 10);
  if (isNaN(conversationId)) throw AppError.badRequest("Invalid conversation ID");

  const conv = await shareHubRepository.getConversationById(conversationId);
  if (!conv || conv.companyId !== req.companyId) throw AppError.notFound("Conversation");

  const isParticipant = await shareHubRepository.isParticipant(conversationId, caller.type, caller.id);
  if (!isParticipant) throw AppError.forbidden("Not a participant in this conversation");

  await shareHubRepository.markRead(conversationId, caller.type, caller.id);

  const messages = await shareHubRepository.getMessages(conversationId);
  const participants = await shareHubRepository.getParticipants(conversationId);

  const participantsWithNames = await Promise.all(
    participants.map(async (p) => ({
      ...p,
      name: await resolveParticipantName(p.participantType, p.participantId),
    })),
  );

  const messagesWithNames = await Promise.all(
    messages.map(async (m) => ({
      ...m,
      senderName: await resolveParticipantName(m.senderType, m.senderId),
    })),
  );

  res.json({ ...conv, participants: participantsWithNames, messages: messagesWithNames });
}));

router.post("/api/share-hub/conversations", requireAuth, shareUpload.single("file"), asyncHandler(async (req, res) => {
  const caller = getCallerIdentity(req);
  const { subject, recipientType, recipientId, body, sharedOfferId, sharedEnquiryId } = req.body;

  if (!subject || !recipientType || !recipientId) {
    throw AppError.badRequest("subject, recipientType, and recipientId are required");
  }

  const parsedRecipientId = parseInt(recipientId, 10);
  if (isNaN(parsedRecipientId)) throw AppError.badRequest("Invalid recipientId");

  if (!["salesman", "dealer"].includes(recipientType)) {
    throw AppError.badRequest("recipientType must be salesman or dealer");
  }

  if (caller.type === "dealer" && recipientType === "dealer") {
    throw AppError.forbidden("Dealer-to-dealer sharing is not supported");
  }

  if (recipientType === "salesman") {
    const recipient = await userRepository.getById(parsedRecipientId);
    if (!recipient || !recipient.isActive) throw AppError.notFound("Recipient salesman");
  } else {
    const recipient = await dealerRepository.getById(parsedRecipientId);
    if (!recipient || !recipient.isActive) throw AppError.notFound("Recipient dealer");
  }

  const conv = await shareHubRepository.createConversation({
    companyId: req.companyId,
    subject,
    createdByType: caller.type,
    createdById: caller.id,
    participantIds: [{ type: recipientType, id: parsedRecipientId }],
  });

  const msg = await shareHubRepository.addMessage({
    conversationId: conv.id,
    senderType: caller.type,
    senderId: caller.id,
    body: body || null,
    sharedOfferId: sharedOfferId ? parseInt(sharedOfferId, 10) : null,
    sharedEnquiryId: sharedEnquiryId ? parseInt(sharedEnquiryId, 10) : null,
  });

  if (req.file) {
    await shareHubRepository.addAttachment({
      messageId: msg.id,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });
  }

  await shareHubRepository.markRead(conv.id, caller.type, caller.id);

  res.status(201).json({ conversationId: conv.id, messageId: msg.id });
}));

router.post("/api/share-hub/conversations/:id/messages", requireAuth, shareUpload.single("file"), asyncHandler(async (req, res) => {
  const caller = getCallerIdentity(req);
  const conversationId = parseInt(req.params.id, 10);
  if (isNaN(conversationId)) throw AppError.badRequest("Invalid conversation ID");

  const conv = await shareHubRepository.getConversationById(conversationId);
  if (!conv || conv.companyId !== req.companyId) throw AppError.notFound("Conversation");

  const isParticipant = await shareHubRepository.isParticipant(conversationId, caller.type, caller.id);
  if (!isParticipant) throw AppError.forbidden("Not a participant in this conversation");

  const { body, sharedOfferId, sharedEnquiryId } = req.body;

  if (!body && !req.file && !sharedOfferId && !sharedEnquiryId) {
    throw AppError.badRequest("Message must contain at least a body, file, or shared reference");
  }

  const msg = await shareHubRepository.addMessage({
    conversationId,
    senderType: caller.type,
    senderId: caller.id,
    body: body || null,
    sharedOfferId: sharedOfferId ? parseInt(sharedOfferId, 10) : null,
    sharedEnquiryId: sharedEnquiryId ? parseInt(sharedEnquiryId, 10) : null,
  });

  if (req.file) {
    await shareHubRepository.addAttachment({
      messageId: msg.id,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });
  }

  await shareHubRepository.markRead(conversationId, caller.type, caller.id);

  res.status(201).json(msg);
}));

router.get("/api/share-hub/attachments/:filename", requireAuth, asyncHandler(async (req, res) => {
  const caller = getCallerIdentity(req);
  const filename = path.basename(req.params.filename);
  const exists = await shareHubAttachmentStorage.exists(filename);
  if (!exists) throw AppError.notFound("Attachment");

  const conversationId = await shareHubRepository.getAttachmentConversationId(filename);
  if (!conversationId) throw AppError.notFound("Attachment");
  const allowed = await shareHubRepository.isParticipant(conversationId, caller.type, caller.id);
  if (!allowed) throw AppError.forbidden("Not a participant in this conversation");

  res.sendFile(shareHubAttachmentStorage.getFullPath(filename));
}));

router.get("/api/share-hub/unread-count", requireAuth, asyncHandler(async (req, res) => {
  const caller = getCallerIdentity(req);
  const count = await shareHubRepository.getTotalUnreadCount(req.companyId, caller.type, caller.id);
  res.json({ unreadCount: count });
}));

router.get("/api/share-hub/recipients", requireAuth, asyncHandler(async (req, res) => {
  const caller = getCallerIdentity(req);
  const recipients: { type: string; id: number; name: string; email: string }[] = [];

  const salesmen = await userRepository.getAll(req.companyId);
  for (const s of salesmen) {
    if (caller.type === "salesman" && caller.id === s.id) continue;
    if (!s.isActive) continue;
    recipients.push({ type: "salesman", id: s.id, name: `${s.name} ${(s as any).surname || ""}`.trim(), email: s.email });
  }

  if (caller.type === "salesman") {
    const dealerCompanies = await dealerRepository.getAllCompanies(req.companyId);
    for (const company of dealerCompanies) {
      if (!company.isActive) continue;
      const contacts = await dealerRepository.getContactsByCompanyId(company.id);
      for (const c of contacts) {
        if (!c.isActive) continue;
        recipients.push({ type: "dealer", id: c.id, name: `${c.name} ${c.surname || ""}`.trim(), email: c.email });
      }
    }
  }

  res.json(recipients);
}));

router.delete("/api/share-hub/conversations/:id", requireAuth, asyncHandler(async (req, res) => {
  const caller = getCallerIdentity(req);
  const conversationId = parseInt(req.params.id, 10);
  if (isNaN(conversationId)) throw AppError.badRequest("Invalid conversation ID");

  const conv = await shareHubRepository.getConversationById(conversationId);
  if (!conv || conv.companyId !== req.companyId) throw AppError.notFound("Conversation");

  const isParticipant = await shareHubRepository.isParticipant(conversationId, caller.type, caller.id);
  if (!isParticipant) throw AppError.forbidden("Not a participant in this conversation");

  await shareHubRepository.softDeleteConversation(conversationId, caller.type, caller.id);
  res.json({ ok: true });
}));

export default router;
