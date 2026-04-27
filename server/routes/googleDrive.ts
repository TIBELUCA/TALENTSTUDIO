import { Router } from "express";
import { z } from "zod";
import { requireMaster, requireAnyAuth, requireSalesmanOrMaster } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import {
  buildAuthUrl,
  exchangeCode,
  getDriveSettings,
  upsertDriveSettings,
  parseFolderIdFromUrl,
  listItemsByOffer,
  listQueueForCompany,
  retryItem,
  retryOfferErrors,
  retryAllErrors,
  backfillCompany,
  triggerWorker,
  getDriveClient,
  hasFullDriveScope,
  _encryptToken,
} from "../services/googleDrive";
import { db, eq } from "../repositories/base";
import { googleDriveSettings } from "@shared/schema";
import { google } from "googleapis";
import { getSalesmanId } from "../middlewares/auth";
import crypto from "crypto";
import { Readable } from "stream";

const router = Router();

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getStateSecret(): string {
  const k = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (!k || k.length < 16) {
    throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY environment variable is required for Google Drive OAuth state signing");
  }
  return k;
}

function signState(payload: object): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + STATE_TTL_MS })).toString("base64url");
  const sig = crypto.createHmac("sha256", getStateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyState(state: string): { companyId: number; userId: number | null } {
  if (!state || typeof state !== "string") throw AppError.badRequest("State mancante");
  const [body, sig] = state.split(".");
  if (!body || !sig) throw AppError.badRequest("State non valido");
  const expected = crypto.createHmac("sha256", getStateSecret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw AppError.forbidden("Firma state non valida");
  }
  const decoded = JSON.parse(Buffer.from(body, "base64url").toString());
  if (typeof decoded.exp !== "number" || decoded.exp < Date.now()) {
    throw AppError.forbidden("State scaduto");
  }
  if (typeof decoded.companyId !== "number") throw AppError.badRequest("State invalido");
  return { companyId: decoded.companyId, userId: decoded.userId ?? null };
}

function getBaseUrl(req: any): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function getRedirectUri(req: any): string {
  return `${getBaseUrl(req)}/api/drive/oauth/callback`;
}

// Public-facing settings (no token material)
function publicSettings(s: any) {
  if (!s) return null;
  const connected = !!s.refreshToken;
  return {
    id: s.id,
    companyId: s.companyId,
    rootFolderId: s.rootFolderId,
    rootFolderUrl: s.rootFolderUrl,
    rootFolderName: s.rootFolderName,
    accountEmail: s.accountEmail,
    connectedAt: s.connectedAt,
    connected,
    needsReauth: connected && !hasFullDriveScope(s.scopes),
    scopes: s.scopes ?? null,
    lastErrorMessage: s.lastErrorMessage,
    lastErrorAt: s.lastErrorAt,
    updatedAt: s.updatedAt,
  };
}

// ── GET settings (any internal user) ──
// Read-only public settings (no token material). Used by both /drive-settings
// (master-only page) and /drive-archive (browse-only page accessible to any
// authenticated internal user).
router.get("/api/drive/settings", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  const s = await getDriveSettings(req.companyId);
  res.json(publicSettings(s));
}));

// ── Public read (any auth) — used by offer view to render the badge ──
router.get("/api/drive/status", requireAnyAuth, asyncHandler(async (req, res) => {
  if (req.companyId == null) return res.json({ connected: false });
  const s = await getDriveSettings(req.companyId);
  res.json({
    connected: !!(s?.refreshToken && s?.rootFolderId),
    rootFolderUrl: s?.rootFolderUrl ?? null,
  });
}));

// ── PUT settings: set folder URL ──
const folderSchema = z.object({
  folderUrl: z.string().min(1).optional(),
  folderId: z.string().min(1).optional(),
  folderName: z.string().optional(),
}).refine(v => !!(v.folderUrl || v.folderId), { message: "folderUrl or folderId required" });

router.put("/api/drive/settings/folder", requireMaster, asyncHandler(async (req, res) => {
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  const parsed = folderSchema.parse(req.body);
  let folderId: string | null = parsed.folderId ?? null;
  let folderUrl: string | null = null;
  let folderNameOverride: string | undefined = parsed.folderName;
  if (folderId) {
    folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
  } else if (parsed.folderUrl) {
    folderId = parseFolderIdFromUrl(parsed.folderUrl);
    if (!folderId) throw AppError.badRequest("URL cartella Drive non valido");
    folderUrl = parsed.folderUrl;
  }

  // If folderId was passed directly (Shared Drives picker), validate it exists,
  // is accessible and is a folder. Auto-fill canonical name from Drive API.
  if (parsed.folderId) {
    const settings = await getDriveSettings(req.companyId);
    if (!settings?.refreshToken) throw AppError.badRequest("Account Google non collegato");
    if (!hasFullDriveScope(settings.scopes)) {
      throw AppError.badRequest("Permessi insufficienti: riconnetti l'account per usare i Drive Condivisi.");
    }
    const drive = await getDriveClient(settings);
    try {
      const meta = await drive.files.get({
        fileId: parsed.folderId,
        fields: "id, name, mimeType, driveId",
        supportsAllDrives: true,
      });
      const isSharedDriveRoot = meta.data.driveId === parsed.folderId;
      if (!isSharedDriveRoot && meta.data.mimeType !== "application/vnd.google-apps.folder") {
        throw AppError.badRequest("L'ID indicato non è una cartella Drive.");
      }
      if (!folderNameOverride && meta.data.name) folderNameOverride = meta.data.name;
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      throw AppError.badRequest(`Impossibile accedere alla cartella Drive: ${e?.message || "errore Google API"}`);
    }
  }

  const updated = await upsertDriveSettings(req.companyId, {
    rootFolderId: folderId,
    rootFolderUrl: folderUrl,
    ...(folderNameOverride !== undefined ? { rootFolderName: folderNameOverride } : {}),
  });
  res.json(publicSettings(updated));
}));

// ── List Shared Drives ──
router.get("/api/drive/shared-drives", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  const settings = await getDriveSettings(req.companyId);
  if (!settings?.refreshToken) throw AppError.badRequest("Account Google non collegato");
  if (!hasFullDriveScope(settings.scopes)) {
    throw AppError.badRequest("Permessi insufficienti: riconnetti l'account per accedere ai Drive Condivisi.");
  }
  const drive = await getDriveClient(settings);
  const out: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;
  do {
    const r = await drive.drives.list({
      pageSize: 100,
      pageToken,
      fields: "nextPageToken, drives(id, name)",
    });
    for (const d of r.data.drives ?? []) {
      if (d.id && d.name) out.push({ id: d.id, name: d.name });
    }
    pageToken = r.data.nextPageToken ?? undefined;
  } while (pageToken && out.length < 500);
  out.sort((a, b) => a.name.localeCompare(b.name, "it"));
  res.json({ drives: out });
}));

// ── List child folders of a parent (within My Drive or a Shared Drive) ──
const foldersQuery = z.object({
  parentId: z.string().min(1),
  driveId: z.string().min(1).optional(),
});
router.get("/api/drive/folders", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  const settings = await getDriveSettings(req.companyId);
  if (!settings?.refreshToken) throw AppError.badRequest("Account Google non collegato");
  if (!hasFullDriveScope(settings.scopes)) {
    throw AppError.badRequest("Permessi insufficienti: riconnetti l'account per esplorare i Drive Condivisi.");
  }
  const { parentId, driveId } = foldersQuery.parse(req.query);
  const drive = await getDriveClient(settings);
  const escParent = parentId.replace(/'/g, "\\'");
  const q = `'${escParent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const r = await drive.files.list({
    q,
    pageSize: 200,
    fields: "files(id, name)",
    orderBy: "name",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: driveId ? "drive" : "user",
    driveId: driveId || undefined,
  });
  const folders = (r.data.files ?? [])
    .filter(f => f.id && f.name)
    .map(f => ({ id: f.id!, name: f.name! }));
  res.json({ folders });
}));

// ── List files (non-folders) of a parent ──
const filesQuery = z.object({
  parentId: z.string().min(1),
  driveId: z.string().min(1).optional(),
});
router.get("/api/drive/files", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  const settings = await getDriveSettings(req.companyId);
  if (!settings?.refreshToken) throw AppError.badRequest("Account Google non collegato");
  if (!hasFullDriveScope(settings.scopes)) {
    throw AppError.badRequest("Permessi insufficienti: riconnetti l'account per esplorare i Drive Condivisi.");
  }
  const { parentId, driveId } = filesQuery.parse(req.query);
  const drive = await getDriveClient(settings);
  const escParent = parentId.replace(/'/g, "\\'");
  const q = `'${escParent}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
  const r = await drive.files.list({
    q,
    pageSize: 200,
    fields: "files(id, name, mimeType, thumbnailLink, iconLink, webViewLink, size, modifiedTime)",
    orderBy: "name",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: driveId ? "drive" : "user",
    driveId: driveId || undefined,
  });
  const files = (r.data.files ?? [])
    .filter(f => f.id && f.name)
    .map(f => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType || "application/octet-stream",
      thumbnailLink: f.thumbnailLink || null,
      iconLink: f.iconLink || null,
      webViewLink: f.webViewLink || null,
      size: f.size ? Number(f.size) : null,
      modifiedTime: f.modifiedTime || null,
    }));
  res.json({ files });
}));

// ── Search files & folders (by name contains) ──
const searchQuery = z.object({
  q: z.string().min(1).max(200),
  driveId: z.string().min(1).optional(),
});
router.get("/api/drive/search", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  const settings = await getDriveSettings(req.companyId);
  if (!settings?.refreshToken) throw AppError.badRequest("Account Google non collegato");
  if (!hasFullDriveScope(settings.scopes)) {
    throw AppError.badRequest("Permessi insufficienti: riconnetti l'account per cercare nei Drive Condivisi.");
  }
  const { q, driveId } = searchQuery.parse(req.query);
  const drive = await getDriveClient(settings);
  const escQ = q.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const driveQ = `name contains '${escQ}' and trashed = false`;
  const r = await drive.files.list({
    q: driveQ,
    pageSize: 100,
    fields:
      "files(id, name, mimeType, thumbnailLink, iconLink, webViewLink, size, modifiedTime, parents, driveId)",
    orderBy: "folder,name",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: driveId ? "drive" : "allDrives",
    driveId: driveId || undefined,
  });
  const all = r.data.files ?? [];
  const folders = all
    .filter(f => f.id && f.name && f.mimeType === "application/vnd.google-apps.folder")
    .map(f => ({ id: f.id!, name: f.name!, driveId: f.driveId || driveId || null }));
  const files = all
    .filter(f => f.id && f.name && f.mimeType !== "application/vnd.google-apps.folder")
    .map(f => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType || "application/octet-stream",
      thumbnailLink: f.thumbnailLink || null,
      iconLink: f.iconLink || null,
      webViewLink: f.webViewLink || null,
      size: f.size ? Number(f.size) : null,
      modifiedTime: f.modifiedTime || null,
      driveId: f.driveId || driveId || null,
    }));
  res.json({ folders, files });
}));

// ── Stream a file (proxy with optional Range support) ──
router.get("/api/drive/files/:id/content", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  const settings = await getDriveSettings(req.companyId);
  if (!settings?.refreshToken) throw AppError.badRequest("Account Google non collegato");
  if (!hasFullDriveScope(settings.scopes)) {
    throw AppError.badRequest("Permessi insufficienti: riconnetti l'account per leggere i file Drive.");
  }
  const drive = await getDriveClient(settings);
  const fileId = req.params.id;
  const meta = await drive.files.get({
    fileId,
    fields: "mimeType, name, size",
    supportsAllDrives: true,
  });
  const mimeType = meta.data.mimeType || "application/octet-stream";
  if (mimeType === "application/vnd.google-apps.folder") {
    throw AppError.badRequest("L'ID indicato è una cartella");
  }
  const range = req.headers.range as string | undefined;
  const driveRes = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true } as any,
    { responseType: "stream", headers: range ? { Range: range } : {} }
  );
  res.status(driveRes.status === 206 ? 206 : 200);
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Accept-Ranges", "bytes");
  const passthrough = ["content-length", "content-range"];
  for (const h of passthrough) {
    const v = (driveRes.headers as any)[h];
    if (v) res.setHeader(h, v);
  }
  if (meta.data.name) {
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(meta.data.name)}`);
  }
  (driveRes.data as any).pipe(res);
}));

// ── OAuth start ──
router.get("/api/drive/oauth/start", requireMaster, asyncHandler(async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw AppError.badRequest("Google OAuth non configurato. Impostare GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.");
  }
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  const state = signState({ companyId: req.companyId, userId: getSalesmanId(req) });
  const url = buildAuthUrl(getRedirectUri(req), state);
  res.json({ url });
}));

// ── OAuth callback ──
// Requires a logged-in master session (cookies are sent on the OAuth redirect).
// State is HMAC-signed + expiring, and we additionally verify the session's
// companyId matches the state's companyId to prevent cross-company binding.
router.get("/api/drive/oauth/callback", requireMaster, asyncHandler(async (req, res) => {
  const code = req.query.code as string;
  const stateRaw = req.query.state as string;
  if (!code || !stateRaw) throw AppError.badRequest("Missing code or state");
  const { companyId, userId } = verifyState(stateRaw);
  if (req.companyId == null || req.companyId !== companyId) {
    throw AppError.forbidden("Sessione non autorizzata per questa azienda");
  }
  const { tokens, email } = await exchangeCode(getRedirectUri(req), code);

  const existing = await getDriveSettings(companyId);

  await upsertDriveSettings(companyId, {
    accessToken: tokens.access_token ? _encryptToken(tokens.access_token) : null,
    refreshToken: tokens.refresh_token ? _encryptToken(tokens.refresh_token) : (existing?.refreshToken || null),
    tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scopes: (tokens.scope || "").toString(),
    accountEmail: email,
    connectedAt: new Date(),
    connectedByUserId: userId ?? null,
    lastErrorMessage: null,
    lastErrorAt: null,
  });

  res.send(`<html><body><script>window.location.href="/drive-settings?connected=1";</script></body></html>`);
}));

// ── Disconnect ──
router.delete("/api/drive/settings", requireMaster, asyncHandler(async (req, res) => {
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  await upsertDriveSettings(req.companyId, {
    accessToken: null,
    refreshToken: null,
    tokenExpiry: null,
    accountEmail: null,
    connectedAt: null,
    scopes: null,
    lastErrorMessage: null,
    lastErrorAt: null,
  });
  res.json({ ok: true });
}));

// ── Test connection ──
router.post("/api/drive/test", requireMaster, asyncHandler(async (req, res) => {
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  const s = await getDriveSettings(req.companyId);
  if (!s?.refreshToken) throw AppError.badRequest("Account Google non collegato");
  if (!s.rootFolderId) throw AppError.badRequest("Cartella Drive non impostata");

  const { _decryptToken } = await import("../services/googleDrive");
  const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: _decryptToken(s.refreshToken) });
  const { credentials } = await client.refreshAccessToken();
  client.setCredentials(credentials);

  const drive = google.drive({ version: "v3", auth: client });
  const folder = await drive.files.get({
    fileId: s.rootFolderId,
    fields: "id, name, mimeType, webViewLink",
    supportsAllDrives: true,
  });
  if (folder.data.mimeType !== "application/vnd.google-apps.folder") {
    throw AppError.badRequest("Il link non punta a una cartella Drive");
  }

  // Probe write permission with a small file we immediately delete
  let probeWriteOk = false;
  try {
    const probeName = `.quotepilot-write-test-${Date.now()}`;
    const created = await drive.files.create({
      requestBody: { name: probeName, parents: [s.rootFolderId] },
      media: { mimeType: "text/plain", body: Readable.from(Buffer.from("ok")) },
      fields: "id",
      supportsAllDrives: true,
    });
    if (created.data.id) {
      probeWriteOk = true;
      try {
        await drive.files.delete({ fileId: created.data.id, supportsAllDrives: true });
      } catch (e) {
        // best-effort cleanup
      }
    }
  } catch (e: any) {
    throw AppError.badRequest(`Permessi di scrittura insufficienti sulla cartella: ${e?.message || "errore Drive"}`);
  }
  if (!probeWriteOk) throw AppError.badRequest("Impossibile scrivere nella cartella Drive");

  await db.update(googleDriveSettings).set({
    rootFolderName: folder.data.name || null,
    lastErrorMessage: null,
    lastErrorAt: null,
    updatedAt: new Date(),
  }).where(eq(googleDriveSettings.companyId, req.companyId));

  res.json({ ok: true, folderName: folder.data.name, folderUrl: folder.data.webViewLink, writeProbe: probeWriteOk });
}));

// ── Queue / items ──
router.get("/api/drive/items", requireMaster, asyncHandler(async (req, res) => {
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  const items = await listQueueForCompany(req.companyId);
  res.json(items);
}));

router.get("/api/drive/items/by-offer/:offerId", requireAnyAuth, asyncHandler(async (req, res) => {
  const offerId = Number(req.params.offerId);
  if (!offerId) throw AppError.badRequest("offerId non valido");
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  const items = await listItemsByOffer(offerId, req.companyId);
  res.json(items);
}));

router.post("/api/drive/items/:id/retry", requireMaster, asyncHandler(async (req, res) => {
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  await retryItem(Number(req.params.id), req.companyId);
  res.json({ ok: true });
}));

router.post("/api/drive/offers/:offerId/retry", requireMaster, asyncHandler(async (req, res) => {
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  const count = await retryOfferErrors(Number(req.params.offerId), req.companyId);
  res.json({ ok: true, count });
}));

router.post("/api/drive/items/retry-errors", requireMaster, asyncHandler(async (req, res) => {
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  const count = await retryAllErrors(req.companyId);
  res.json({ ok: true, count });
}));

router.post("/api/drive/backfill", requireMaster, asyncHandler(async (req, res) => {
  if (req.companyId == null) throw AppError.badRequest("Company context missing");
  const result = await backfillCompany(req.companyId);
  triggerWorker();
  res.json({ ok: true, ...result });
}));

export default router;
