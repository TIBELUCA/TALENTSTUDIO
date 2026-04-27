import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";
import crypto from "crypto";
import fs from "fs";
import { db, eq, and, sql, isNull, lte } from "../repositories/base";
import { or } from "drizzle-orm";
import {
  googleDriveSettings,
  driveArchiveItems,
  offers as offersTable,
  customers as customersTable,
  drawings as drawingsTable,
  drawingRequests as drawingRequestsTable,
  type GoogleDriveSettings,
  type DriveArchiveItem,
} from "@shared/schema";
import { drawingsFileStorage, drawingAttachmentStorage } from "./fileStorage";
import { generateOfferPdf } from "./documents";

function getEncryptionKey(): string {
  const k = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (!k || k.length < 16) {
    throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY environment variable is required for Google Drive token encryption");
  }
  return k;
}
// NOTE: Full "drive" scope is required to LIST Shared Drives (drives.list)
// and to READ/WRITE inside folders that pre-exist in a Shared Drive (the
// narrower "drive.file" scope only sees files the app itself created).
export const REQUIRED_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const SCOPES = [REQUIRED_DRIVE_SCOPE, "https://www.googleapis.com/auth/userinfo.email"];

/** True when the granted scopes include the broad Drive scope we need
 *  for Shared Drives. Existing users connected with the old narrow scope
 *  will return false and must reconnect. */
export function hasFullDriveScope(scopes: string | null | undefined): boolean {
  if (!scopes) return false;
  return scopes.split(/[\s,]+/).some(s => s === REQUIRED_DRIVE_SCOPE);
}

function encrypt(text: string): string {
  const key = crypto.scryptSync(getEncryptionKey(), "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text: string): string {
  const key = crypto.scryptSync(getEncryptionKey(), "salt", 32);
  const [ivHex, encryptedHex] = text.split(":");
  if (!ivHex || !encryptedHex) return text;
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function buildOAuthClient(redirectUri: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const client = buildOAuthClient(redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export async function exchangeCode(redirectUri: string, code: string) {
  const client = buildOAuthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: userInfo } = await oauth2.userinfo.get();
  return { tokens, email: userInfo.email || null };
}

export function parseFolderIdFromUrl(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const m1 = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export async function getDriveSettings(companyId: number): Promise<GoogleDriveSettings | null> {
  const [row] = await db.select().from(googleDriveSettings).where(eq(googleDriveSettings.companyId, companyId));
  return row || null;
}

export async function upsertDriveSettings(companyId: number, patch: Partial<GoogleDriveSettings>): Promise<GoogleDriveSettings> {
  const existing = await getDriveSettings(companyId);
  if (existing) {
    const [updated] = await db.update(googleDriveSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(googleDriveSettings.companyId, companyId))
      .returning();
    return updated;
  }
  const insertValues: typeof googleDriveSettings.$inferInsert = {
    companyId,
    ...patch,
    updatedAt: new Date(),
  };
  const [inserted] = await db.insert(googleDriveSettings).values(insertValues).returning();
  return inserted;
}

async function getValidAccessToken(settings: GoogleDriveSettings): Promise<string> {
  const isExpired = settings.tokenExpiry && new Date(settings.tokenExpiry).getTime() <= Date.now() + 60_000;
  if (!isExpired && settings.accessToken) {
    return decrypt(settings.accessToken);
  }
  if (!settings.refreshToken) throw new Error("Missing refresh token; reconnect Google Drive.");

  const client = buildOAuthClient("postmessage");
  client.setCredentials({ refresh_token: decrypt(settings.refreshToken) });
  const { credentials } = await client.refreshAccessToken();
  const newAccess = credentials.access_token!;
  await db.update(googleDriveSettings).set({
    accessToken: encrypt(newAccess),
    tokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    updatedAt: new Date(),
  }).where(eq(googleDriveSettings.companyId, settings.companyId));
  return newAccess;
}

export async function getDriveClient(settings: GoogleDriveSettings): Promise<drive_v3.Drive> {
  const accessToken = await getValidAccessToken(settings);
  const client = buildOAuthClient("postmessage");
  client.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth: client });
}

function sanitizeFolderName(name: string): string {
  return (name || "")
    .replace(/[\\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200) || "unknown";
}

async function findOrCreateFolder(drive: drive_v3.Drive, parentId: string, name: string): Promise<string> {
  const safeName = sanitizeFolderName(name);
  const escName = safeName.replace(/'/g, "\\'");
  const q = `'${parentId}' in parents and name = '${escName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({
    q,
    fields: "files(id, name)",
    pageSize: 1,
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const existing = res.data.files?.[0];
  if (existing?.id) return existing.id;
  const created = await drive.files.create({
    requestBody: {
      name: safeName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error("Failed to create Drive folder");
  return created.data.id;
}

interface OfferFolderContext {
  driveFolderId: string;
  driveFolderUrl: string;
}

async function ensureOfferVersionFolder(
  drive: drive_v3.Drive,
  rootFolderId: string,
  year: number,
  offerCode: string,
  customerName: string,
  version: number,
): Promise<OfferFolderContext> {
  const yearFolderId = await findOrCreateFolder(drive, rootFolderId, String(year));
  const offerFolderName = `${offerCode} - ${customerName}`;
  const offerFolderId = await findOrCreateFolder(drive, yearFolderId, offerFolderName);
  const versionFolderId = await findOrCreateFolder(drive, offerFolderId, `v${version}`);
  return {
    driveFolderId: versionFolderId,
    driveFolderUrl: `https://drive.google.com/drive/folders/${versionFolderId}`,
  };
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function uploadBuffer(
  drive: drive_v3.Drive,
  folderId: string,
  filename: string,
  mimeType: string,
  buffer: Buffer,
  existingFileId?: string | null,
): Promise<{ id: string }> {
  const media = {
    mimeType,
    body: Readable.from(buffer),
  };
  if (existingFileId) {
    try {
      const updated = await drive.files.update({
        fileId: existingFileId,
        media,
        supportsAllDrives: true,
        fields: "id",
      });
      if (updated.data.id) return { id: updated.data.id };
    } catch (e) {
      // fall through to create
    }
  }
  const created = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media,
    supportsAllDrives: true,
    fields: "id",
  });
  if (!created.data.id) throw new Error("Drive upload returned no id");
  return { id: created.data.id };
}

// ───────── Queue / item management ─────────

type Kind = "offer_pdf" | "drawing_pdf" | "drawing_dwg" | "drawing_request_attachment";

interface EnsureItemArgs {
  companyId: number;
  kind: Kind;
  offerId: number | null;
  offerVersion: number | null;
  localId: number | null;
}

async function ensureQueuedItem(args: EnsureItemArgs): Promise<DriveArchiveItem> {
  const { companyId, kind, offerId, offerVersion, localId } = args;

  let existing: DriveArchiveItem | undefined;
  if (kind === "offer_pdf") {
    const rows = await db.select().from(driveArchiveItems).where(and(
      eq(driveArchiveItems.companyId, companyId),
      eq(driveArchiveItems.kind, kind),
      eq(driveArchiveItems.offerId, offerId!),
      eq(driveArchiveItems.offerVersion, offerVersion ?? 1),
    ));
    existing = rows[0];
  } else if (localId !== null) {
    const conds: any[] = [
      eq(driveArchiveItems.companyId, companyId),
      eq(driveArchiveItems.kind, kind),
      eq(driveArchiveItems.localId, localId),
    ];
    if (offerId !== null) conds.push(eq(driveArchiveItems.offerId, offerId));
    if (offerVersion !== null) conds.push(eq(driveArchiveItems.offerVersion, offerVersion));
    const rows = await db.select().from(driveArchiveItems).where(and(...conds));
    existing = rows[0];
  }

  if (existing) {
    // Always re-queue on a domain event: ok → re-sync, error → retry from
    // scratch (reset attempts), queued → keep as-is but clear nextRetryAt
    // so the worker picks it up immediately.
    const shouldReset = existing.status === "ok" || existing.status === "error";
    const [updated] = await db.update(driveArchiveItems).set({
      status: shouldReset ? "queued" : existing.status,
      attempts: existing.status === "error" ? 0 : existing.attempts,
      nextRetryAt: null,
      lastError: existing.status === "error" ? null : existing.lastError,
      updatedAt: new Date(),
    }).where(eq(driveArchiveItems.id, existing.id)).returning();
    return updated;
  }

  const [inserted] = await db.insert(driveArchiveItems).values({
    companyId,
    kind,
    offerId,
    offerVersion,
    localId,
    status: "queued",
    attempts: 0,
  }).returning();
  return inserted;
}

export async function queueOffer(offerId: number): Promise<void> {
  try {
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, offerId));
    if (!offer || offer.companyId === null) return;
    const settings = await getDriveSettings(offer.companyId);
    if (!settings?.refreshToken || !settings.rootFolderId) return;

    await ensureQueuedItem({
      companyId: offer.companyId,
      kind: "offer_pdf",
      offerId: offer.id,
      offerVersion: offer.version ?? 1,
      localId: null,
    });

    // Linked drawings
    const drawings = await db.select().from(drawingsTable).where(eq(drawingsTable.offerId, offerId));
    for (const d of drawings) {
      if (d.pdfFilename) {
        await ensureQueuedItem({
          companyId: offer.companyId,
          kind: "drawing_pdf",
          offerId: offer.id,
          offerVersion: offer.version ?? 1,
          localId: d.id,
        });
      }
      if (d.dwgFilename) {
        await ensureQueuedItem({
          companyId: offer.companyId,
          kind: "drawing_dwg",
          offerId: offer.id,
          offerVersion: offer.version ?? 1,
          localId: d.id,
        });
      }
    }

    // Linked drawing-request attachments
    const reqs = await db.select().from(drawingRequestsTable).where(eq(drawingRequestsTable.offerId, offerId));
    for (const r of reqs) {
      if (r.attachmentFilename) {
        await ensureQueuedItem({
          companyId: offer.companyId,
          kind: "drawing_request_attachment",
          offerId: offer.id,
          offerVersion: offer.version ?? 1,
          localId: r.id,
        });
      }
    }

    triggerWorker();
  } catch (e: any) {
    console.error("[drive] queueOffer failed:", e?.message || e);
  }
}

export async function queueDrawing(drawingId: number): Promise<void> {
  try {
    const [drawing] = await db.select().from(drawingsTable).where(eq(drawingsTable.id, drawingId));
    if (!drawing || drawing.companyId === null || !drawing.offerId) return;
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, drawing.offerId));
    if (!offer) return;
    const settings = await getDriveSettings(drawing.companyId);
    if (!settings?.refreshToken || !settings.rootFolderId) return;

    if (drawing.pdfFilename) {
      await ensureQueuedItem({
        companyId: drawing.companyId,
        kind: "drawing_pdf",
        offerId: offer.id,
        offerVersion: offer.version ?? 1,
        localId: drawing.id,
      });
    }
    if (drawing.dwgFilename) {
      await ensureQueuedItem({
        companyId: drawing.companyId,
        kind: "drawing_dwg",
        offerId: offer.id,
        offerVersion: offer.version ?? 1,
        localId: drawing.id,
      });
    }

    triggerWorker();
  } catch (e: any) {
    console.error("[drive] queueDrawing failed:", e?.message || e);
  }
}

export async function queueDrawingRequest(requestId: number): Promise<void> {
  try {
    const [request] = await db.select().from(drawingRequestsTable).where(eq(drawingRequestsTable.id, requestId));
    if (!request || request.companyId === null || !request.offerId || !request.attachmentFilename) return;
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, request.offerId));
    if (!offer) return;
    const settings = await getDriveSettings(request.companyId);
    if (!settings?.refreshToken || !settings.rootFolderId) return;

    await ensureQueuedItem({
      companyId: request.companyId,
      kind: "drawing_request_attachment",
      offerId: offer.id,
      offerVersion: offer.version ?? 1,
      localId: request.id,
    });
    triggerWorker();
  } catch (e: any) {
    console.error("[drive] queueDrawingRequest failed:", e?.message || e);
  }
}

// ───────── Worker ─────────

const MAX_ATTEMPTS = 5;
let workerRunning = false;
let workerScheduled = false;

export function triggerWorker(): void {
  if (workerScheduled) return;
  workerScheduled = true;
  setImmediate(async () => {
    workerScheduled = false;
    if (workerRunning) return;
    workerRunning = true;
    try {
      await processQueue();
    } finally {
      workerRunning = false;
    }
  });
}

async function processQueue(): Promise<void> {
  // Pick all queued items whose nextRetryAt is null or due. Limit per pass.
  const now = new Date();
  const due = await db.select().from(driveArchiveItems).where(and(
    eq(driveArchiveItems.status, "queued"),
    or(isNull(driveArchiveItems.nextRetryAt), lte(driveArchiveItems.nextRetryAt, now))!,
  )).limit(50);

  if (due.length === 0) return;

  // Group by company to batch settings/drive client lookups
  const byCompany = new Map<number, DriveArchiveItem[]>();
  for (const item of due) {
    const arr = byCompany.get(item.companyId) ?? [];
    arr.push(item);
    byCompany.set(item.companyId, arr);
  }

  for (const [companyId, items] of byCompany) {
    const settings = await getDriveSettings(companyId);
    if (!settings?.refreshToken || !settings.rootFolderId) {
      // Skip — not configured
      continue;
    }
    let drive: drive_v3.Drive;
    try {
      drive = await getDriveClient(settings);
    } catch (e: any) {
      const message = e?.message || String(e);
      await db.update(googleDriveSettings).set({
        lastErrorMessage: message,
        lastErrorAt: new Date(),
      }).where(eq(googleDriveSettings.companyId, companyId));
      continue;
    }

    for (const item of items) {
      await processItem(drive, settings, item);
    }
  }
}

async function processItem(drive: drive_v3.Drive, settings: GoogleDriveSettings, item: DriveArchiveItem): Promise<void> {
  try {
    if (!item.offerId) throw new Error("Item missing offerId");
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, item.offerId));
    if (!offer) throw new Error("Offer not found");
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, offer.customerId));
    const customerName = customer?.company || customer?.name || `customer-${offer.customerId}`;
    const year = offer.date ? new Date(offer.date).getUTCFullYear() : new Date().getUTCFullYear();
    const folder = await ensureOfferVersionFolder(
      drive,
      settings.rootFolderId!,
      year,
      offer.referenceNumber,
      customerName,
      item.offerVersion ?? offer.version ?? 1,
    );

    let buffer: Buffer;
    let filename: string;
    let mimeType: string;

    if (item.kind === "offer_pdf") {
      const result = await generateOfferPdf(offer.id);
      buffer = result.buffer;
      filename = result.filename;
      mimeType = "application/pdf";
    } else if (item.kind === "drawing_pdf" || item.kind === "drawing_dwg") {
      const [drawing] = await db.select().from(drawingsTable).where(eq(drawingsTable.id, item.localId!));
      if (!drawing) throw new Error(`Drawing ${item.localId} not found`);
      const isPdf = item.kind === "drawing_pdf";
      const fname = isPdf ? drawing.pdfFilename : drawing.dwgFilename;
      const original = (isPdf ? drawing.pdfOriginalName : drawing.dwgOriginalName) || fname;
      if (!fname) throw new Error(`Drawing ${drawing.id} missing ${isPdf ? "pdf" : "dwg"} file`);
      const fullPath = drawingsFileStorage.getFullPath(fname);
      if (!fs.existsSync(fullPath)) throw new Error(`Local file missing: ${fullPath}`);
      buffer = fs.readFileSync(fullPath);
      filename = `disegno-${drawing.id}-${original || fname}`;
      mimeType = isPdf ? "application/pdf" : "application/octet-stream";
    } else if (item.kind === "drawing_request_attachment") {
      const [request] = await db.select().from(drawingRequestsTable).where(eq(drawingRequestsTable.id, item.localId!));
      if (!request || !request.attachmentFilename) throw new Error(`Drawing request ${item.localId} missing attachment`);
      const fullPath = drawingAttachmentStorage.getFullPath(request.attachmentFilename);
      if (!fs.existsSync(fullPath)) throw new Error(`Local file missing: ${fullPath}`);
      buffer = fs.readFileSync(fullPath);
      filename = `richiesta-${request.id}-${request.attachmentOriginalName || request.attachmentFilename}`;
      mimeType = "application/octet-stream";
    } else {
      throw new Error(`Unknown kind: ${item.kind}`);
    }

    const hash = sha256(buffer);
    if (item.fileHash === hash && item.driveFileId) {
      // No change since last sync — just mark synced.
      await db.update(driveArchiveItems).set({
        status: "ok",
        lastSyncedAt: new Date(),
        lastError: null,
        nextRetryAt: null,
        attempts: 0,
        driveFolderId: folder.driveFolderId,
        driveFolderUrl: folder.driveFolderUrl,
        updatedAt: new Date(),
      }).where(eq(driveArchiveItems.id, item.id));
      return;
    }

    const { id: driveFileId } = await uploadBuffer(drive, folder.driveFolderId, filename, mimeType, buffer, item.driveFileId);

    await db.update(driveArchiveItems).set({
      driveFileId,
      driveFileName: filename,
      driveFolderId: folder.driveFolderId,
      driveFolderUrl: folder.driveFolderUrl,
      fileHash: hash,
      status: "ok",
      attempts: 0,
      lastError: null,
      lastSyncedAt: new Date(),
      nextRetryAt: null,
      updatedAt: new Date(),
    }).where(eq(driveArchiveItems.id, item.id));
  } catch (e: any) {
    const message = e?.message || String(e);
    const attempts = (item.attempts ?? 0) + 1;
    const finalAttempt = attempts >= MAX_ATTEMPTS;
    const backoffMs = Math.min(60_000 * Math.pow(2, attempts - 1), 60 * 60_000);
    await db.update(driveArchiveItems).set({
      attempts,
      lastError: message,
      status: finalAttempt ? "error" : "queued",
      nextRetryAt: finalAttempt ? null : new Date(Date.now() + backoffMs),
      updatedAt: new Date(),
    }).where(eq(driveArchiveItems.id, item.id));
    console.error(`[drive] item #${item.id} (${item.kind}) failed (attempt ${attempts}):`, message);
  }
}

// Periodic sweep so retries that were scheduled in the future eventually run
setInterval(() => triggerWorker(), 2 * 60_000).unref?.();

// ───────── Public helpers for routes ─────────

export async function listItemsByOffer(offerId: number, companyId?: number): Promise<DriveArchiveItem[]> {
  if (companyId !== undefined) {
    return db.select().from(driveArchiveItems).where(and(
      eq(driveArchiveItems.offerId, offerId),
      eq(driveArchiveItems.companyId, companyId),
    ));
  }
  return db.select().from(driveArchiveItems).where(eq(driveArchiveItems.offerId, offerId));
}

export async function listQueueForCompany(companyId: number, limit = 100): Promise<DriveArchiveItem[]> {
  return db.select().from(driveArchiveItems).where(eq(driveArchiveItems.companyId, companyId)).orderBy(sql`${driveArchiveItems.updatedAt} DESC`).limit(limit);
}

export async function retryItem(id: number, companyId: number): Promise<void> {
  await db.update(driveArchiveItems).set({
    status: "queued",
    attempts: 0,
    nextRetryAt: null,
    updatedAt: new Date(),
  }).where(and(eq(driveArchiveItems.id, id), eq(driveArchiveItems.companyId, companyId)));
  triggerWorker();
}

export async function retryOfferErrors(offerId: number, companyId: number): Promise<number> {
  const result = await db.update(driveArchiveItems).set({
    status: "queued",
    attempts: 0,
    nextRetryAt: null,
    updatedAt: new Date(),
  }).where(and(
    eq(driveArchiveItems.companyId, companyId),
    eq(driveArchiveItems.offerId, offerId),
    eq(driveArchiveItems.status, "error"),
  )).returning({ id: driveArchiveItems.id });
  triggerWorker();
  return result.length;
}

export async function retryAllErrors(companyId: number): Promise<number> {
  const result = await db.update(driveArchiveItems).set({
    status: "queued",
    attempts: 0,
    nextRetryAt: null,
    updatedAt: new Date(),
  }).where(and(eq(driveArchiveItems.companyId, companyId), eq(driveArchiveItems.status, "error"))).returning({ id: driveArchiveItems.id });
  triggerWorker();
  return result.length;
}

export async function backfillCompany(companyId: number): Promise<{ offers: number }> {
  const offers = await db.select({ id: offersTable.id }).from(offersTable).where(and(
    eq(offersTable.companyId, companyId),
    sql`(${offersTable.deletedAt} IS NULL)`,
  ));
  for (const o of offers) {
    await queueOffer(o.id);
  }
  return { offers: offers.length };
}

export { encrypt as _encryptToken, decrypt as _decryptToken };
