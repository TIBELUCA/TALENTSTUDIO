import { Router } from "express";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { db } from "../db";
import {
  emailAttachmentLinks, customers, contacts, offers, jobOrders,
  offerDocuments, jobOrderDocuments, drawings,
} from "@shared/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { requireAnyAuth, getSalesmanId } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { emailLinkedAttachmentStorage, drawingsFileStorage } from "../services/fileStorage";
import { getGmailConnection, getValidAccessToken, gmailApiGet } from "./email";

const OFFER_DOCS_DIR = path.join(process.cwd(), "server/assets/offer-documents");
const ORDER_DOCS_DIR = path.join(process.cwd(), "server/assets/order-documents");

const router = Router();

const ENTITY_TYPES = ["customer", "contact", "offer", "order"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

const linkBodySchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.number().int().positive(),
});

async function verifyEntityExists(
  entityType: EntityType,
  entityId: number,
  companyId: number | null,
): Promise<boolean> {
  if (entityType === "customer") {
    const conds = [eq(customers.id, entityId)];
    if (companyId) conds.push(eq(customers.companyId, companyId));
    const [row] = await db.select({ id: customers.id }).from(customers).where(and(...conds)).limit(1);
    return !!row;
  }
  if (entityType === "contact") {
    // Contacts are scoped via their parent customer's companyId (no companyId column on contacts).
    const conds = [eq(contacts.id, entityId)];
    if (companyId) conds.push(eq(customers.companyId, companyId));
    const [row] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .innerJoin(customers, eq(customers.id, contacts.customerId))
      .where(and(...conds))
      .limit(1);
    return !!row;
  }
  if (entityType === "offer") {
    const conds = [eq(offers.id, entityId)];
    if (companyId) conds.push(eq(offers.companyId, companyId));
    const [row] = await db.select({ id: offers.id }).from(offers).where(and(...conds)).limit(1);
    return !!row;
  }
  if (entityType === "order") {
    const conds = [eq(jobOrders.id, entityId)];
    if (companyId) conds.push(eq(jobOrders.companyId, companyId));
    const [row] = await db.select({ id: jobOrders.id }).from(jobOrders).where(and(...conds)).limit(1);
    return !!row;
  }
  return false;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200);
}

router.post(
  "/api/email/messages/:messageId/attachments/:attachmentId/link",
  requireAnyAuth,
  asyncHandler(async (req, res) => {
    const parsed = linkBodySchema.parse(req.body);
    const { entityType, entityId } = parsed;
    const companyId = req.companyId ?? null;

    const exists = await verifyEntityExists(entityType, entityId, companyId);
    if (!exists) return res.status(404).json({ message: "Entità non trovata" });

    // Idempotency: if this exact attachment is already linked to this entity,
    // return the existing row instead of creating a duplicate (the one-click
    // suggestion shortcut would otherwise multiply rows on accidental repeats).
    const dupConds = [
      eq(emailAttachmentLinks.entityType, entityType),
      eq(emailAttachmentLinks.entityId, entityId),
      eq(emailAttachmentLinks.kind, "attachment"),
      eq(emailAttachmentLinks.sourceMessageId, req.params.messageId),
      eq(emailAttachmentLinks.sourceAttachmentId, req.params.attachmentId),
    ];
    if (companyId) dupConds.push(eq(emailAttachmentLinks.companyId, companyId));
    const [existing] = await db.select().from(emailAttachmentLinks)
      .where(and(...dupConds)).limit(1);
    if (existing) return res.status(200).json(existing);

    const conn = await getGmailConnection(req);
    const accessToken = await getValidAccessToken(conn, req);

    const msg = await gmailApiGet(
      accessToken,
      `messages/${req.params.messageId}?format=full`,
    );

    let originalName = "attachment";
    let mimeType = "application/octet-stream";
    let subject = "";
    let from = "";

    const headers = (msg?.payload?.headers ?? []) as Array<{ name: string; value: string }>;
    for (const h of headers) {
      if (h.name.toLowerCase() === "subject") subject = h.value;
      if (h.name.toLowerCase() === "from") from = h.value;
    }

    function findPart(payload: Record<string, unknown>): void {
      const parts = payload.parts as Array<Record<string, unknown>> | undefined;
      if (!parts) return;
      for (const part of parts) {
        const body = part.body as { attachmentId?: string } | undefined;
        if (body?.attachmentId === req.params.attachmentId) {
          originalName = (part.filename as string) || originalName;
          mimeType = (part.mimeType as string) || mimeType;
          return;
        }
        if (part.parts) findPart(part as Record<string, unknown>);
      }
    }
    if (msg.payload) findPart(msg.payload);
    if (mimeType === "application/octet-stream" && /\.pdf$/i.test(originalName)) {
      mimeType = "application/pdf";
    }

    const attachment = await gmailApiGet(
      accessToken,
      `messages/${req.params.messageId}/attachments/${req.params.attachmentId}`,
    );
    const data = Buffer.from(attachment.data, "base64url");

    const safeName = sanitizeFilename(originalName);
    const storedFilename = `${Date.now()}-${entityType}-${entityId}-${safeName}`;
    await emailLinkedAttachmentStorage.upload(storedFilename, data);

    const [row] = await db.insert(emailAttachmentLinks).values({
      companyId: companyId ?? undefined,
      entityType,
      entityId,
      filename: storedFilename,
      originalName,
      mimeType,
      size: data.length,
      sourceMessageId: req.params.messageId,
      sourceAttachmentId: req.params.attachmentId,
      sourceSubject: subject || null,
      sourceFrom: from || null,
      uploadedByUserId: getSalesmanId(req) ?? undefined,
    }).returning();

    res.status(201).json(row);
  }),
);

// Link an ENTIRE email message (saved as .eml RFC822) to an entity.
router.post(
  "/api/email/messages/:messageId/link",
  requireAnyAuth,
  asyncHandler(async (req, res) => {
    const parsed = linkBodySchema.parse(req.body);
    const { entityType, entityId } = parsed;
    const companyId = req.companyId ?? null;

    const exists = await verifyEntityExists(entityType, entityId, companyId);
    if (!exists) return res.status(404).json({ message: "Entità non trovata" });

    // Idempotency: if this exact email is already linked to this entity, return existing row.
    const dupConds = [
      eq(emailAttachmentLinks.entityType, entityType),
      eq(emailAttachmentLinks.entityId, entityId),
      eq(emailAttachmentLinks.kind, "message"),
      eq(emailAttachmentLinks.sourceMessageId, req.params.messageId),
    ];
    if (companyId) dupConds.push(eq(emailAttachmentLinks.companyId, companyId));
    const [existing] = await db.select().from(emailAttachmentLinks)
      .where(and(...dupConds)).limit(1);
    if (existing) return res.status(200).json(existing);

    const conn = await getGmailConnection(req);
    const accessToken = await getValidAccessToken(conn, req);

    // Pull headers (subject/from/date) from a lightweight metadata fetch first.
    const meta = await gmailApiGet(
      accessToken,
      `messages/${req.params.messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
    );
    let subject = "";
    let from = "";
    let dateHeader = "";
    const headers = (meta?.payload?.headers ?? []) as Array<{ name: string; value: string }>;
    for (const h of headers) {
      const n = h.name.toLowerCase();
      if (n === "subject") subject = h.value;
      else if (n === "from") from = h.value;
      else if (n === "date") dateHeader = h.value;
    }

    // Then fetch the full RFC822 raw bytes for the .eml.
    const raw = await gmailApiGet(
      accessToken,
      `messages/${req.params.messageId}?format=raw`,
    );
    if (!raw?.raw) {
      return res.status(502).json({ message: "Impossibile scaricare il messaggio raw da Gmail" });
    }
    const data = Buffer.from(raw.raw, "base64url");

    const baseName = subject?.trim() || `Email-${req.params.messageId}`;
    const originalName = sanitizeFilename(`${baseName}.eml`);
    const storedFilename = `${Date.now()}-${entityType}-${entityId}-msg-${sanitizeFilename(baseName)}.eml`;
    await emailLinkedAttachmentStorage.upload(storedFilename, data);

    const [row] = await db.insert(emailAttachmentLinks).values({
      companyId: companyId ?? undefined,
      entityType,
      entityId,
      kind: "message",
      filename: storedFilename,
      originalName,
      mimeType: "message/rfc822",
      size: data.length,
      sourceMessageId: req.params.messageId,
      sourceAttachmentId: null,
      sourceSubject: subject || null,
      sourceFrom: [from, dateHeader].filter(Boolean).join(" · ") || null,
      uploadedByUserId: getSalesmanId(req) ?? undefined,
    }).returning();

    res.status(201).json(row);
  }),
);

router.get(
  "/api/email-attachments/linked",
  requireAnyAuth,
  asyncHandler(async (req, res) => {
    const entityType = String(req.query.entityType ?? "");
    const entityId = Number(req.query.entityId);
    if (!ENTITY_TYPES.includes(entityType as EntityType) || !Number.isFinite(entityId)) {
      return res.status(400).json({ message: "Parametri non validi" });
    }
    const companyId = req.companyId ?? null;
    const conds = [
      eq(emailAttachmentLinks.entityType, entityType),
      eq(emailAttachmentLinks.entityId, entityId),
    ];
    if (companyId) conds.push(eq(emailAttachmentLinks.companyId, companyId));
    const rows = await db.select().from(emailAttachmentLinks)
      .where(and(...conds))
      .orderBy(desc(emailAttachmentLinks.uploadedAt));
    res.json(rows);
  }),
);

router.get(
  "/api/email-attachments/linked/:id/file",
  requireAnyAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [row] = await db.select().from(emailAttachmentLinks)
      .where(eq(emailAttachmentLinks.id, id)).limit(1);
    if (!row) return res.status(404).json({ message: "Allegato non trovato" });
    if (req.companyId && row.companyId && row.companyId !== req.companyId) {
      return res.status(403).json({ message: "Accesso negato" });
    }
    const fullPath = emailLinkedAttachmentStorage.getFullPath(row.filename);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: "File non disponibile" });
    }
    const forceDownload = req.query.download === "1" || req.query.download === "true";
    const safeInline = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"];
    const mime = row.mimeType || "application/octet-stream";
    const disposition = !forceDownload && safeInline.includes(mime) ? "inline" : "attachment";
    const ascii = row.originalName.normalize("NFKD").replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    const utf8 = encodeURIComponent(row.originalName);
    res.set("Content-Type", mime);
    res.set("Content-Disposition", `${disposition}; filename="${ascii}"; filename*=UTF-8''${utf8}`);
    res.set("X-Content-Type-Options", "nosniff");
    res.sendFile(path.resolve(fullPath));
  }),
);

const moveBodySchema = z.object({
  target: z.enum(["offer_document", "order_document", "drawing"]),
});

router.post(
  "/api/email-attachments/linked/:id/move-to",
  requireAnyAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { target } = moveBodySchema.parse(req.body);

    const [link] = await db.select().from(emailAttachmentLinks)
      .where(eq(emailAttachmentLinks.id, id)).limit(1);
    if (!link) return res.status(404).json({ message: "Allegato non trovato" });
    if (req.companyId && link.companyId && link.companyId !== req.companyId) {
      return res.status(403).json({ message: "Accesso negato" });
    }

    const sourcePath = emailLinkedAttachmentStorage.getFullPath(link.filename);
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ message: "File non disponibile" });
    }

    const safeOriginal = sanitizeFilename(link.originalName);
    const stamp = Date.now();
    const salesmanId = getSalesmanId(req);

    const companyId = req.companyId ?? null;

    // Resolve and validate the destination, then perform the file copy +
    // DB insert + cleanup atomically (DB ops in a transaction). On any
    // failure after copy, the destination file is removed to avoid orphans.

    let destFilename: string | null = null;
    let destPath: string | null = null;
    const cleanupCopiedFile = () => {
      if (destPath) {
        try { fs.unlinkSync(destPath); } catch {}
      }
    };

    try {
      if (target === "offer_document") {
        if (link.entityType !== "offer") {
          return res.status(400).json({ message: "Allegato non collegato a un'offerta" });
        }
        const offerConds = [eq(offers.id, link.entityId)];
        if (companyId) offerConds.push(eq(offers.companyId, companyId));
        const [offer] = await db.select().from(offers).where(and(...offerConds)).limit(1);
        if (!offer) return res.status(404).json({ message: "Offerta non trovata" });

        if (!fs.existsSync(OFFER_DOCS_DIR)) fs.mkdirSync(OFFER_DOCS_DIR, { recursive: true });
        destFilename = `${stamp}-${safeOriginal}`;
        destPath = path.join(OFFER_DOCS_DIR, destFilename);
        fs.copyFileSync(sourcePath, destPath);

        const result = await db.transaction(async (tx) => {
          const [doc] = await tx.insert(offerDocuments).values({
            offerId: offer.id,
            filename: destFilename!,
            originalName: link.originalName,
            mimeType: link.mimeType,
            description: link.sourceSubject ? `Da email: ${link.sourceSubject}` : undefined,
          }).returning();
          await tx.delete(emailAttachmentLinks).where(eq(emailAttachmentLinks.id, id));
          return doc;
        });

        await emailLinkedAttachmentStorage.delete(link.filename).catch(() => undefined);
        return res.status(201).json({ ok: true, target, doc: result });
      }

      if (target === "order_document") {
        if (link.entityType !== "order") {
          return res.status(400).json({ message: "Allegato non collegato a una commessa" });
        }
        const orderConds = [eq(jobOrders.id, link.entityId)];
        if (companyId) orderConds.push(eq(jobOrders.companyId, companyId));
        const [order] = await db.select().from(jobOrders).where(and(...orderConds)).limit(1);
        if (!order) return res.status(404).json({ message: "Commessa non trovata" });

        if (!fs.existsSync(ORDER_DOCS_DIR)) fs.mkdirSync(ORDER_DOCS_DIR, { recursive: true });
        destFilename = `${stamp}-${safeOriginal}`;
        destPath = path.join(ORDER_DOCS_DIR, destFilename);
        fs.copyFileSync(sourcePath, destPath);

        const result = await db.transaction(async (tx) => {
          const [doc] = await tx.insert(jobOrderDocuments).values({
            jobOrderId: order.id,
            filename: destFilename!,
            originalName: link.originalName,
            mimeType: link.mimeType,
            description: link.sourceSubject ? `Da email: ${link.sourceSubject}` : undefined,
          }).returning();
          await tx.delete(emailAttachmentLinks).where(eq(emailAttachmentLinks.id, id));
          return doc;
        });

        await emailLinkedAttachmentStorage.delete(link.filename).catch(() => undefined);
        return res.status(201).json({ ok: true, target, doc: result });
      }

      if (target === "drawing") {
        let customerId: number | null = null;
        let offerId: number | null = null;
        let jobOrderId: number | null = null;

        if (link.entityType === "customer") {
          const custConds = [eq(customers.id, link.entityId)];
          if (companyId) custConds.push(eq(customers.companyId, companyId));
          const [cust] = await db.select({ id: customers.id }).from(customers)
            .where(and(...custConds)).limit(1);
          if (!cust) return res.status(404).json({ message: "Cliente non trovato" });
          customerId = cust.id;
        } else if (link.entityType === "offer") {
          const offerConds = [eq(offers.id, link.entityId)];
          if (companyId) offerConds.push(eq(offers.companyId, companyId));
          const [offer] = await db.select().from(offers).where(and(...offerConds)).limit(1);
          if (!offer) return res.status(404).json({ message: "Offerta non trovata" });
          customerId = offer.customerId;
          offerId = offer.id;
        } else if (link.entityType === "order") {
          const orderConds = [eq(jobOrders.id, link.entityId)];
          if (companyId) orderConds.push(eq(jobOrders.companyId, companyId));
          const [order] = await db.select().from(jobOrders).where(and(...orderConds)).limit(1);
          if (!order) return res.status(404).json({ message: "Commessa non trovata" });
          customerId = order.customerId;
          offerId = order.offerId ?? null;
          jobOrderId = order.id;
        } else {
          return res.status(400).json({
            message: "Allegato deve essere collegato a Cliente, Offerta o Commessa per spostare in Disegni",
          });
        }
        if (!customerId) return res.status(400).json({ message: "Cliente non risolvibile" });

        // Magic-byte fallback when mime/filename are inconclusive.
        let isPdf = (link.mimeType || "").toLowerCase().includes("pdf")
          || /\.pdf$/i.test(link.originalName);
        let isDwg = (link.mimeType || "").toLowerCase().includes("dwg")
          || /\.dwg$/i.test(link.originalName);
        if (!isPdf && !isDwg) {
          let fd: number | null = null;
          try {
            fd = fs.openSync(sourcePath, "r");
            const buf = Buffer.alloc(8);
            fs.readSync(fd, buf, 0, 8, 0);
            const head = buf.toString("ascii");
            if (head.startsWith("%PDF-")) {
              isPdf = true;
            } else if (/^AC1[0-9A-F]{3}$/i.test(head.slice(0, 6))) {
              isDwg = true;
            }
          } catch {
            // ignore; will fall through to the 400 below
          } finally {
            if (fd !== null) {
              try { fs.closeSync(fd); } catch {}
            }
          }
        }
        if (!isPdf && !isDwg) {
          return res.status(400).json({
            message: "Solo file PDF o DWG possono essere spostati in Disegni",
          });
        }

        destFilename = `${stamp}-${safeOriginal}`;
        destPath = drawingsFileStorage.getFullPath(destFilename);
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(sourcePath, destPath);

        // Per-commessa versioning: lock the parent job_orders row plus the
        // candidate drawings (FOR UPDATE) inside the transaction so two
        // concurrent moves cannot both become "head".
        const result = await db.transaction(async (tx) => {
          let replacesDrawingId: number | null = null;
          if (jobOrderId) {
            const orderLockConds = [eq(jobOrders.id, jobOrderId)];
            if (companyId) orderLockConds.push(eq(jobOrders.companyId, companyId));
            await tx
              .select({ id: jobOrders.id })
              .from(jobOrders)
              .where(and(...orderLockConds))
              .for("update");

            const orderDrawingConds = [eq(drawings.jobOrderId, jobOrderId)];
            if (companyId) orderDrawingConds.push(eq(drawings.companyId, companyId));
            const candidates = await tx
              .select({ id: drawings.id, replacesDrawingId: drawings.replacesDrawingId })
              .from(drawings)
              .where(and(...orderDrawingConds))
              .orderBy(desc(drawings.createdAt))
              .for("update");
            if (candidates.length > 0) {
              const replacedIds = new Set(
                candidates
                  .map(c => c.replacesDrawingId)
                  .filter((x): x is number => x !== null && x !== undefined),
              );
              const currentHead = candidates.find(c => !replacedIds.has(c.id));
              if (currentHead) replacesDrawingId = currentHead.id;
            }
          }
          const [drawing] = await tx.insert(drawings).values({
            companyId,
            createdByUserId: salesmanId ?? 0,
            customerId: customerId!,
            notes: link.sourceSubject ? `Da email: ${link.sourceSubject}` : "",
            pdfFilename: isPdf ? destFilename! : null,
            pdfOriginalName: isPdf ? link.originalName : null,
            dwgFilename: isDwg ? destFilename! : null,
            dwgOriginalName: isDwg ? link.originalName : null,
            offerId,
            jobOrderId,
            replacesDrawingId,
          }).returning();
          await tx.delete(emailAttachmentLinks).where(eq(emailAttachmentLinks.id, id));
          return drawing;
        });

        await emailLinkedAttachmentStorage.delete(link.filename).catch(() => undefined);
        return res.status(201).json({ ok: true, target, drawing: result });
      }

      return res.status(400).json({ message: "Target non supportato" });
    } catch (err) {
      cleanupCopiedFile();
      throw err;
    }
  }),
);

router.delete(
  "/api/email-attachments/linked/:id",
  requireAnyAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [row] = await db.select().from(emailAttachmentLinks)
      .where(eq(emailAttachmentLinks.id, id)).limit(1);
    if (!row) return res.status(404).json({ message: "Allegato non trovato" });
    if (req.companyId && row.companyId && row.companyId !== req.companyId) {
      return res.status(403).json({ message: "Accesso negato" });
    }
    await emailLinkedAttachmentStorage.delete(row.filename).catch(() => undefined);
    await db.delete(emailAttachmentLinks).where(eq(emailAttachmentLinks.id, id));
    res.json({ ok: true });
  }),
);

export default router;
