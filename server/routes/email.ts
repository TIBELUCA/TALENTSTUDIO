import { Router } from "express";
import { db, eq, and, sql, isNull } from "../repositories/base";
import { emailConnections, emailSendLog, interactions, offers, customers, contacts, dealerCompanies, drawings, jobOrders, gmailMessageIndex, emailAttachmentLinks } from "@shared/schema";
import { drawingsFileStorage } from "../services/fileStorage";
import fs from "fs";
import { requireAnyAuth } from "../middlewares/auth";
import { getSalesmanId } from "../middlewares/auth";
import { getDealerId } from "../middlewares/dealer";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import { generateOfferPdf } from "../services";
import { google } from "googleapis";
import crypto from "crypto";
import { z } from "zod";
import { executeAiWorkflow } from "../services/ai/runner";
import { settingsRepository } from "../repositories";
import type { AiRunWorkflow } from "../services/ai/types";
import { syncConnectionNow } from "../services/gmailIndexScheduler";

const router = Router();

const ENCRYPTION_KEY = process.env.EMAIL_TOKEN_ENCRYPTION_KEY || "quotepilot-default-key-change-me!!";

function encrypt(text: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const [ivHex, encryptedHex] = text.split(":");
  if (!ivHex || !encryptedHex) return text;
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function getBaseUrl(req: any): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function getUserIds(req: any): { salesmanUserId: number | null; dealerUserId: number | null } {
  return {
    salesmanUserId: getSalesmanId(req),
    dealerUserId: getDealerId(req),
  };
}

function getGoogleClient(req: any) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${getBaseUrl(req)}/api/email/oauth/google/callback`
  );
}

function getMicrosoftRedirectUri(req: any): string {
  return `${getBaseUrl(req)}/api/email/oauth/outlook/callback`;
}

export async function getGmailConnection(req: any): Promise<any> {
  const { salesmanUserId, dealerUserId } = getUserIds(req);
  const ownerCondition = salesmanUserId
    ? eq(emailConnections.salesmanUserId, salesmanUserId)
    : dealerUserId
    ? eq(emailConnections.dealerUserId, dealerUserId!)
    : null;
  if (!ownerCondition) throw AppError.forbidden();

  const rows = await db.select().from(emailConnections).where(
    and(ownerCondition, eq(emailConnections.provider, "gmail"))
  );
  const conn = rows.find(r => r.isDefault) || rows[0];
  if (!conn) throw AppError.badRequest("No Gmail connection configured. Connect Gmail in your account settings.");
  return conn;
}

// ─── LIST CONNECTIONS ───
router.get("/api/email/connections", requireAnyAuth, asyncHandler(async (req, res) => {
  const { salesmanUserId, dealerUserId } = getUserIds(req);
  const conditions = salesmanUserId
    ? eq(emailConnections.salesmanUserId, salesmanUserId)
    : dealerUserId
    ? eq(emailConnections.dealerUserId, dealerUserId)
    : sql`false`;

  const rows = await db.select({
    id: emailConnections.id,
    provider: emailConnections.provider,
    providerAccountEmail: emailConnections.providerAccountEmail,
    isDefault: emailConnections.isDefault,
    senderDisplayName: emailConnections.senderDisplayName,
    signature: emailConnections.signature,
    connectedAt: emailConnections.connectedAt,
    // Background-index status (Gmail only). Kept on the same payload so the
    // account UI can render "Ultima sincronizzazione: …" / error warnings
    // without a second round-trip.
    gmailIndexBackfilledAt: emailConnections.gmailIndexBackfilledAt,
    gmailIndexLastSyncedAt: emailConnections.gmailIndexLastSyncedAt,
    gmailIndexLastError: emailConnections.gmailIndexLastError,
    gmailIndexLastErrorAt: emailConnections.gmailIndexLastErrorAt,
  }).from(emailConnections).where(conditions);

  res.json(rows);
}));

// ─── SYNC NOW (Gmail metadata index) ───
// Triggers an on-demand sync of the local Gmail message-index cache for the
// requested connection. Awaits the sync so the client can refresh its
// "Ultima sincronizzazione" label with the new timestamp.
router.post("/api/email/connections/:id/sync", requireAnyAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { salesmanUserId, dealerUserId } = getUserIds(req);

  const [existing] = await db.select().from(emailConnections).where(eq(emailConnections.id, id));
  if (!existing) throw AppError.notFound("Email connection");
  if (salesmanUserId && existing.salesmanUserId !== salesmanUserId) throw AppError.forbidden();
  if (dealerUserId && existing.dealerUserId !== dealerUserId) throw AppError.forbidden();
  if (existing.provider !== "gmail") {
    throw AppError.badRequest("Solo le connessioni Gmail supportano la sincronizzazione manuale.");
  }

  const result = await syncConnectionNow(id);

  // Read back the current state so the client gets the freshest timestamps
  // (and any persisted error) in a single round-trip.
  const [updated] = await db.select({
    gmailIndexBackfilledAt: emailConnections.gmailIndexBackfilledAt,
    gmailIndexLastSyncedAt: emailConnections.gmailIndexLastSyncedAt,
    gmailIndexLastError: emailConnections.gmailIndexLastError,
    gmailIndexLastErrorAt: emailConnections.gmailIndexLastErrorAt,
  }).from(emailConnections).where(eq(emailConnections.id, id));

  if (result.ok) {
    res.json({ ok: true, ...updated });
  } else {
    res.status(502).json({ ok: false, error: result.error, ...updated });
  }
}));

// ─── UPDATE CONNECTION (signature, displayName, default) ───
router.patch("/api/email/connections/:id", requireAnyAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { salesmanUserId, dealerUserId } = getUserIds(req);

  const [existing] = await db.select().from(emailConnections).where(eq(emailConnections.id, id));
  if (!existing) throw AppError.notFound("Email connection");
  if (salesmanUserId && existing.salesmanUserId !== salesmanUserId) throw AppError.forbidden();
  if (dealerUserId && existing.dealerUserId !== dealerUserId) throw AppError.forbidden();

  const updates: any = { updatedAt: new Date() };
  if (req.body.senderDisplayName !== undefined) updates.senderDisplayName = req.body.senderDisplayName;
  if (req.body.signature !== undefined) updates.signature = req.body.signature;

  if (req.body.isDefault === true) {
    const ownerCondition = salesmanUserId
      ? eq(emailConnections.salesmanUserId, salesmanUserId)
      : eq(emailConnections.dealerUserId, dealerUserId!);
    await db.update(emailConnections).set({ isDefault: false }).where(ownerCondition);
    updates.isDefault = true;
  }

  await db.update(emailConnections).set(updates).where(eq(emailConnections.id, id));
  res.json({ ok: true });
}));

// ─── DELETE CONNECTION ───
router.delete("/api/email/connections/:id", requireAnyAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { salesmanUserId, dealerUserId } = getUserIds(req);

  const [existing] = await db.select().from(emailConnections).where(eq(emailConnections.id, id));
  if (!existing) throw AppError.notFound("Email connection");
  if (salesmanUserId && existing.salesmanUserId !== salesmanUserId) throw AppError.forbidden();
  if (dealerUserId && existing.dealerUserId !== dealerUserId) throw AppError.forbidden();

  await db.delete(emailConnections).where(eq(emailConnections.id, id));
  res.json({ ok: true });
}));

// ─── OAUTH: GOOGLE START ───
router.get("/api/email/oauth/google/start", requireAnyAuth, asyncHandler(async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw AppError.badRequest("Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  const client = getGoogleClient(req);
  const { salesmanUserId, dealerUserId } = getUserIds(req);
  const state = Buffer.from(JSON.stringify({ salesmanUserId, dealerUserId })).toString("base64url");

  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
  });

  res.json({ url });
}));

// ─── OAUTH: GOOGLE CALLBACK ───
router.get("/api/email/oauth/google/callback", asyncHandler(async (req, res) => {
  const code = req.query.code as string;
  const stateRaw = req.query.state as string;
  if (!code || !stateRaw) throw AppError.badRequest("Missing code or state");

  const { salesmanUserId, dealerUserId } = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
  const client = getGoogleClient(req);
  const { tokens } = await client.getToken(code);

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: userInfo } = await oauth2.userinfo.get();

  const ownerCondition = salesmanUserId
    ? and(eq(emailConnections.salesmanUserId, salesmanUserId), eq(emailConnections.provider, "gmail"))
    : and(eq(emailConnections.dealerUserId, dealerUserId), eq(emailConnections.provider, "gmail"));

  const [existingConn] = await db.select().from(emailConnections).where(ownerCondition!);

  const connData = {
    provider: "gmail" as const,
    providerAccountEmail: userInfo.email || null,
    accessToken: encrypt(tokens.access_token!),
    refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : existingConn?.refreshToken || null,
    tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scopes: (tokens.scope || "").toString(),
    senderDisplayName: userInfo.name || null,
    updatedAt: new Date(),
  };

  if (existingConn) {
    // If the user reconnected to a different mailbox, the locally indexed
    // metadata belongs to the previous account: wipe it and reset the
    // history cursor / backfill marker so the gmail-index scheduler does a
    // fresh backfill against the new mailbox.
    const accountChanged = (existingConn.providerAccountEmail || "") !== (connData.providerAccountEmail || "");
    const resetIndexFields = accountChanged ? {
      gmailHistoryId: null,
      gmailIndexBackfilledAt: null,
      gmailIndexLastSyncedAt: null,
    } : {};
    await db.update(emailConnections)
      .set({ ...connData, ...resetIndexFields })
      .where(eq(emailConnections.id, existingConn.id));
    if (accountChanged) {
      await db.delete(gmailMessageIndex)
        .where(eq(gmailMessageIndex.emailConnectionId, existingConn.id));
    }
  } else {
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(emailConnections).where(
      salesmanUserId ? eq(emailConnections.salesmanUserId, salesmanUserId) : eq(emailConnections.dealerUserId, dealerUserId)
    );
    const isFirst = Number(countResult[0]?.count ?? 0) === 0;

    await db.insert(emailConnections).values({
      salesmanUserId,
      dealerUserId,
      ...connData,
      isDefault: isFirst,
    });
  }

  res.send(`<html><body><script>window.location.href="/account";</script></body></html>`);
}));

// ─── OAUTH: OUTLOOK START ───
router.get("/api/email/oauth/outlook/start", requireAnyAuth, asyncHandler(async (req, res) => {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    throw AppError.badRequest("Microsoft OAuth credentials not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.");
  }
  const { salesmanUserId, dealerUserId } = getUserIds(req);
  const state = Buffer.from(JSON.stringify({ salesmanUserId, dealerUserId })).toString("base64url");
  const redirectUri = getMicrosoftRedirectUri(req);

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "openid email profile offline_access Mail.Send User.Read",
    state,
    prompt: "consent",
  });

  res.json({ url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}` });
}));

// ─── OAUTH: OUTLOOK CALLBACK ───
router.get("/api/email/oauth/outlook/callback", asyncHandler(async (req, res) => {
  const code = req.query.code as string;
  const stateRaw = req.query.state as string;
  if (!code || !stateRaw) throw AppError.badRequest("Missing code or state");

  const { salesmanUserId, dealerUserId } = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
  const redirectUri = getMicrosoftRedirectUri(req);

  const tokenResp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResp.ok) {
    const err = await tokenResp.text();
    console.error("[email] Microsoft token exchange failed:", err);
    throw AppError.badRequest("Microsoft token exchange failed");
  }

  const tokens: any = await tokenResp.json();

  const profileResp = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile: any = profileResp.ok ? await profileResp.json() : {};

  const ownerCondition = salesmanUserId
    ? and(eq(emailConnections.salesmanUserId, salesmanUserId), eq(emailConnections.provider, "outlook"))
    : and(eq(emailConnections.dealerUserId, dealerUserId), eq(emailConnections.provider, "outlook"));

  const [existingConn] = await db.select().from(emailConnections).where(ownerCondition!);

  const connData = {
    provider: "outlook" as const,
    providerAccountEmail: profile.mail || profile.userPrincipalName || null,
    accessToken: encrypt(tokens.access_token),
    refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : existingConn?.refreshToken || null,
    tokenExpiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    scopes: tokens.scope || "",
    senderDisplayName: profile.displayName || null,
    updatedAt: new Date(),
  };

  if (existingConn) {
    await db.update(emailConnections).set(connData).where(eq(emailConnections.id, existingConn.id));
  } else {
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(emailConnections).where(
      salesmanUserId ? eq(emailConnections.salesmanUserId, salesmanUserId) : eq(emailConnections.dealerUserId, dealerUserId)
    );
    const isFirst = Number(countResult[0]?.count ?? 0) === 0;

    await db.insert(emailConnections).values({
      salesmanUserId,
      dealerUserId,
      ...connData,
      isDefault: isFirst,
    });
  }

  res.send(`<html><body><script>window.location.href="/account";</script></body></html>`);
}));

// ─── TOKEN REFRESH ───
async function refreshGoogleToken(conn: any, req: any): Promise<string> {
  if (!conn.refreshToken) throw new Error("No refresh token for Gmail");
  const client = getGoogleClient(req);
  client.setCredentials({ refresh_token: decrypt(conn.refreshToken) });
  const { credentials } = await client.refreshAccessToken();
  const newAccessToken = credentials.access_token!;

  await db.update(emailConnections).set({
    accessToken: encrypt(newAccessToken),
    tokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    updatedAt: new Date(),
  }).where(eq(emailConnections.id, conn.id));

  return newAccessToken;
}

async function refreshOutlookToken(conn: any, req: any): Promise<string> {
  if (!conn.refreshToken) throw new Error("No refresh token for Outlook");

  const resp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: decrypt(conn.refreshToken),
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) throw new Error("Failed to refresh Outlook token");
  const tokens: any = await resp.json();

  await db.update(emailConnections).set({
    accessToken: encrypt(tokens.access_token),
    refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : conn.refreshToken,
    tokenExpiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    updatedAt: new Date(),
  }).where(eq(emailConnections.id, conn.id));

  return tokens.access_token;
}

export async function getValidAccessToken(conn: any, req: any): Promise<string> {
  const isExpired = conn.tokenExpiry && new Date(conn.tokenExpiry) <= new Date();
  if (!isExpired) {
    return decrypt(conn.accessToken);
  }
  if (conn.provider === "gmail") return refreshGoogleToken(conn, req);
  if (conn.provider === "outlook") return refreshOutlookToken(conn, req);
  throw new Error("Unknown provider");
}

// ─── GMAIL API HELPERS ───
export async function gmailApiGet(accessToken: string, path: string): Promise<any> {
  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[email] Gmail API GET ${path} failed:`, err);
    throw new Error(`Gmail API error: ${resp.status}`);
  }
  return resp.json();
}

async function gmailApiPost(accessToken: string, path: string, body: any): Promise<any> {
  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[email] Gmail API POST ${path} failed:`, err);
    throw new Error(`Gmail API error: ${resp.status}`);
  }
  return resp.json();
}

async function gmailApiPut(accessToken: string, path: string, body: any): Promise<any> {
  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[email] Gmail API PUT ${path} failed:`, err);
    throw new Error(`Gmail API error: ${resp.status}`);
  }
  return resp.json();
}

async function gmailApiDelete(accessToken: string, path: string): Promise<void> {
  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok && resp.status !== 204) {
    const err = await resp.text();
    console.error(`[email] Gmail API DELETE ${path} failed:`, err);
    throw new Error(`Gmail API error: ${resp.status}`);
  }
}

function flattenParts(payload: any): any[] {
  const result: any[] = [];
  if (!payload) return result;
  if (payload.parts) {
    for (const part of payload.parts) {
      result.push(part);
      result.push(...flattenParts(part));
    }
  }
  return result;
}

function parseGmailHeaders(headers: any[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const h of headers || []) {
    result[h.name.toLowerCase()] = h.value;
  }
  return result;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function extractEmailBody(payload: any): { html: string; text: string } {
  let html = "";
  let text = "";

  if (payload.mimeType === "text/html" && payload.body?.data) {
    html = decodeBase64Url(payload.body.data);
  } else if (payload.mimeType === "text/plain" && payload.body?.data) {
    text = decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        html = decodeBase64Url(part.body.data);
      } else if (part.mimeType === "text/plain" && part.body?.data) {
        text = decodeBase64Url(part.body.data);
      } else if (part.mimeType?.startsWith("multipart/") && part.parts) {
        const nested = extractEmailBody(part);
        if (nested.html) html = nested.html;
        if (nested.text) text = nested.text;
      }
    }
  }

  return { html, text };
}

function extractInlineImages(payload: any): Map<string, string> {
  const map = new Map<string, string>();
  function walk(part: any) {
    const headers = (part.headers || []) as Array<{ name: string; value: string }>;
    const cidHeader = headers.find(h => h.name.toLowerCase() === "content-id");
    const dispHeader = headers.find(h => h.name.toLowerCase() === "content-disposition");
    const isInline = dispHeader?.value?.toLowerCase().includes("inline");
    if (part.body?.attachmentId && (cidHeader || isInline) && part.mimeType?.startsWith("image/")) {
      const cid = cidHeader?.value?.replace(/^<|>$/g, "").trim();
      if (cid) map.set(cid, part.body.attachmentId);
    }
    if (part.parts) {
      for (const child of part.parts) walk(child);
    }
  }
  walk(payload);
  return map;
}

function rewriteCidImages(html: string, messageId: string, cidMap: Map<string, string>): string {
  if (!html || cidMap.size === 0) return html;
  return html.replace(/src=(["'])cid:([^"']+)\1/gi, (match, quote, cid) => {
    const attachmentId = cidMap.get(cid.trim());
    if (!attachmentId) return match;
    return `src=${quote}/api/email/messages/${messageId}/attachments/${attachmentId}${quote}`;
  });
}

function extractAttachments(payload: any): Array<{
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}> {
  const attachments: any[] = [];

  function walk(part: any) {
    if (part.filename && part.body?.attachmentId) {
      const headers: Array<{ name: string; value: string }> = part.headers || [];
      const dispHeader = headers.find(h => h.name?.toLowerCase() === "content-disposition");
      const cidHeader = headers.find(h => h.name?.toLowerCase() === "content-id");
      const isInlineDisp = dispHeader?.value?.toLowerCase().includes("inline");
      const hasCid = !!cidHeader?.value;
      const mimeType: string = part.mimeType || "application/octet-stream";
      const isImage = mimeType.startsWith("image/");
      const size: number = part.body.size || 0;
      // Skip inline images (signature icons, social media logos, embedded images
      // referenced by cid: in the HTML body). Treat as inline if marked
      // Content-Disposition: inline OR has a Content-ID, OR is a small image
      // typical of signature graphics (< 20KB).
      const isInlineImage = isImage && (isInlineDisp || hasCid || size < 20 * 1024);
      if (!isInlineImage) {
        attachments.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          mimeType,
          size,
        });
      }
    }
    if (part.parts) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  }

  walk(payload);
  return attachments;
}

function formatGmailMessage(msg: any, full = false): any {
  const headers = parseGmailHeaders(msg.payload?.headers || []);
  const labelIds: string[] = msg.labelIds || [];

  const result: any = {
    id: msg.id,
    threadId: msg.threadId,
    labelIds,
    snippet: msg.snippet || "",
    from: headers.from || "",
    to: headers.to || "",
    cc: headers.cc || "",
    subject: headers.subject || "(nessun oggetto)",
    date: headers.date || "",
    internalDate: msg.internalDate,
    isUnread: labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
    hasAttachments: false,
  };

  if (msg.payload) {
    const attachments = extractAttachments(msg.payload);
    result.hasAttachments = attachments.length > 0;
    if (full) {
      const body = extractEmailBody(msg.payload);
      const cidMap = extractInlineImages(msg.payload);
      result.bodyHtml = rewriteCidImages(body.html, msg.id, cidMap);
      result.bodyText = body.text;
      result.attachments = attachments;
      result.messageId = headers["message-id"] || "";
      result.references = headers.references || "";
      result.inReplyTo = headers["in-reply-to"] || "";
    }
  }

  return result;
}

// ─── LIST MESSAGES (INBOX/SENT/STARRED/ALL) ───
router.get("/api/email/messages", requireAnyAuth, asyncHandler(async (req, res) => {
  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  const folder = (req.query.folder as string) || "INBOX";
  const pageToken = req.query.pageToken as string | undefined;
  const q = req.query.q as string | undefined;
  const maxResults = Math.min(Number(req.query.maxResults) || 20, 50);

  let labelFilter = "";
  switch (folder.toUpperCase()) {
    case "INBOX": labelFilter = "in:inbox"; break;
    case "SENT": labelFilter = "in:sent"; break;
    case "STARRED": labelFilter = "is:starred"; break;
    case "TRASH": labelFilter = "in:trash"; break;
    case "SPAM": labelFilter = "in:spam"; break;
    default: labelFilter = "in:inbox";
  }

  const query = q ? `${labelFilter} ${q}` : labelFilter;
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });
  if (pageToken) params.set("pageToken", pageToken);

  const listResult = await gmailApiGet(accessToken, `messages?${params}`);
  const messageIds: string[] = (listResult.messages || []).map((m: any) => m.id);

  if (messageIds.length === 0) {
    return res.json({ messages: [], nextPageToken: null, resultSizeEstimate: 0 });
  }

  const batchMessages = await Promise.all(
    messageIds.map(id =>
      gmailApiGet(accessToken, `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`)
    )
  );

  const messages = batchMessages.map(msg => formatGmailMessage(msg, false));

  // ─── Enrich each message with `hasAlerts` (lightweight) ───
  // Computes two cheap signals for the list view so the UI can show an
  // alert icon without opening the message:
  //  1) sender unknown → CRM data missing (no contact/customer match)
  //  2) subject/snippet contains a known order or offer code → possible link
  if (req.companyId && messages.length > 0) {
    const isPersonalDomain = new Set([
      "gmail.com", "googlemail.com", "yahoo.com", "yahoo.it", "hotmail.com",
      "hotmail.it", "outlook.com", "outlook.it", "live.com", "libero.it",
      "alice.it", "tiscali.it", "icloud.com", "me.com", "tin.it",
      "virgilio.it", "fastwebnet.it", "pec.it",
    ]);

    const [ordersList, offersList, customersList, contactsList] = await Promise.all([
      db.select({ jobNumber: jobOrders.jobNumber })
        .from(jobOrders)
        .where(and(eq(jobOrders.companyId, req.companyId), isNull(jobOrders.deletedAt))),
      db.select({ referenceNumber: offers.referenceNumber })
        .from(offers)
        .where(eq(offers.companyId, req.companyId)),
      db.select({ id: customers.id, email: customers.email, pec: customers.pec, webSite: customers.webSite })
        .from(customers)
        .where(eq(customers.companyId, req.companyId)),
      db.select({ email: contacts.email, customerId: contacts.customerId })
        .from(contacts)
        .innerJoin(customers, eq(contacts.customerId, customers.id))
        .where(eq(customers.companyId, req.companyId)),
    ]);

    const customerIdSet = new Set(customersList.map(c => c.id));

    // Sender lookup sets
    const knownEmails = new Set<string>();
    const knownDomains = new Set<string>();
    for (const c of customersList) {
      if (c.email) knownEmails.add(c.email.toLowerCase());
      if (c.pec) knownEmails.add(c.pec.toLowerCase());
      const collectDomain = (s: string | null | undefined) => {
        if (!s) return;
        const d = s.toLowerCase().includes("@")
          ? s.toLowerCase().split("@")[1]
          : s.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
        if (d && !isPersonalDomain.has(d)) knownDomains.add(d);
      };
      collectDomain(c.email);
      collectDomain(c.pec);
      collectDomain(c.webSite);
    }
    for (const c of contactsList) {
      if (c.email && customerIdSet.has(c.customerId)) {
        knownEmails.add(c.email.toLowerCase());
      }
    }

    // Code list for snippet/subject scan (only codes ≥3 chars)
    const codes: string[] = [];
    for (const o of ordersList) {
      if (o.jobNumber && o.jobNumber.length >= 3) codes.push(o.jobNumber.toLowerCase());
    }
    for (const o of offersList) {
      if (o.referenceNumber && o.referenceNumber.length >= 3) {
        const code = o.referenceNumber.toLowerCase();
        codes.push(code);
        const base = code.replace(/-v\d+$/, "");
        if (base !== code) codes.push(base);
      }
    }

    for (const m of messages) {
      // Sender alert (only on incoming messages)
      let senderAlert = false;
      const isSent = Array.isArray(m.labelIds) && m.labelIds.includes("SENT");
      if (!isSent) {
        const fromMatch = (m.from || "").match(/^\s*(?:"?([^"<]*?)"?\s*)?<?([^\s<>]+@[^\s<>]+)>?/);
        const senderEmail = (fromMatch?.[2] || "").trim().toLowerCase();
        if (senderEmail) {
          const senderDomain = senderEmail.includes("@") ? senderEmail.split("@")[1] : "";
          const knownByEmail = knownEmails.has(senderEmail);
          const knownByDomain = senderDomain
            && !isPersonalDomain.has(senderDomain)
            && Array.from(knownDomains).some(d =>
              d === senderDomain || d.endsWith("." + senderDomain) || senderDomain.endsWith("." + d),
            );
          if (!knownByEmail && !knownByDomain) senderAlert = true;
          else if (!knownByEmail && knownByDomain) senderAlert = true; // known_domain → contact missing
        }
      }

      // Link suggestion alert (subject + snippet only — cheap)
      let linkAlert = false;
      if (codes.length > 0) {
        const haystack = `${m.subject || ""}\n${m.snippet || ""}`.toLowerCase();
        for (const code of codes) {
          if (haystack.includes(code)) { linkAlert = true; break; }
        }
      }

      m.hasAlerts = senderAlert || linkAlert;
    }
  }

  res.json({
    messages,
    nextPageToken: listResult.nextPageToken || null,
    resultSizeEstimate: listResult.resultSizeEstimate || 0,
  });
}));

// ─── GET SINGLE MESSAGE (full body) ───
router.get("/api/email/messages/:messageId", requireAnyAuth, asyncHandler(async (req, res) => {
  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  const msg = await gmailApiGet(accessToken, `messages/${req.params.messageId}?format=full`);
  res.json(formatGmailMessage(msg, true));
}));

// ─── LINK SUGGESTIONS (auto-detect commessa/offerta codes in message) ───
router.get("/api/email/messages/:messageId/link-suggestions", requireAnyAuth, asyncHandler(async (req, res) => {
  if (!req.companyId) throw new AppError(401, "Company not set");
  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  const msg = await gmailApiGet(accessToken, `messages/${req.params.messageId}?format=full`);
  const headers = parseGmailHeaders(msg.payload?.headers || []);
  const subject = headers.subject || "";
  const fromHeader = headers.from || "";
  const body = msg.payload ? extractEmailBody(msg.payload) : { html: "", text: "" };
  // Strip HTML tags for plain-text scanning
  const htmlAsText = (body.html || "").replace(/<[^>]+>/g, " ");
  const haystack = `${subject}\n${body.text || ""}\n${htmlAsText}`.toLowerCase();

  // Parse sender "Name <email@host>" or just "email@host"
  let senderEmail = "";
  let senderName = "";
  const fromMatch = fromHeader.match(/^\s*(?:"?([^"<]*?)"?\s*)?<?([^\s<>]+@[^\s<>]+)>?/);
  if (fromMatch) {
    senderName = (fromMatch[1] || "").trim();
    senderEmail = (fromMatch[2] || "").trim().toLowerCase();
  }
  const senderDomain = senderEmail.includes("@") ? senderEmail.split("@")[1] : "";

  const [orders, ofs, customersList, contactsList] = await Promise.all([
    db.select().from(jobOrders).where(and(eq(jobOrders.companyId, req.companyId), isNull(jobOrders.deletedAt))),
    db.select().from(offers).where(eq(offers.companyId, req.companyId)),
    db.select().from(customers).where(eq(customers.companyId, req.companyId)),
    db.select().from(contacts),
  ]);
  const custMap = new Map<number, string>();
  for (const c of customersList) custMap.set(c.id, c.name);

  type Suggestion = {
    entityType: "order" | "offer";
    entityId: number;
    label: string;
    secondary: string | null;
    matchedText: string;
  };
  const suggestions: Suggestion[] = [];

  for (const o of orders) {
    if (!o.jobNumber || o.jobNumber.length < 3) continue;
    const code = o.jobNumber.toLowerCase();
    if (haystack.includes(code)) {
      suggestions.push({
        entityType: "order",
        entityId: o.id,
        label: o.jobNumber,
        secondary: o.customerId ? (custMap.get(o.customerId) ?? null) : null,
        matchedText: o.jobNumber,
      });
    }
  }
  for (const o of ofs) {
    if (!o.referenceNumber || o.referenceNumber.length < 3) continue;
    const code = o.referenceNumber.toLowerCase();
    // Match base reference (without -vN suffix) too
    const base = code.replace(/-v\d+$/, "");
    if (haystack.includes(code) || (base !== code && haystack.includes(base))) {
      suggestions.push({
        entityType: "offer",
        entityId: o.id,
        label: o.referenceNumber,
        secondary: o.customerId ? (custMap.get(o.customerId) ?? null) : null,
        matchedText: o.referenceNumber,
      });
    }
  }

  // Dedup by entityType+entityId
  const seen = new Set<string>();
  const deduped = suggestions.filter(s => {
    const k = `${s.entityType}:${s.entityId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // ─── Existing links for THIS message ───
  // Used to mark each suggestion as already-linked so the UI can show a
  // "Collegato" indicator instead of an actionable button.
  const existingLinks = await db
    .select()
    .from(emailAttachmentLinks)
    .where(and(
      eq(emailAttachmentLinks.companyId, req.companyId),
      eq(emailAttachmentLinks.sourceMessageId, req.params.messageId),
    ));
  type EnrichedSuggestion = Suggestion & {
    linkedAsMessage: boolean;
    linkedAttachmentIds: string[];
  };
  const enriched: EnrichedSuggestion[] = deduped.map(s => {
    const ours = existingLinks.filter(l =>
      l.entityType === s.entityType && l.entityId === s.entityId,
    );
    return {
      ...s,
      linkedAsMessage: ours.some(l => l.kind === "message"),
      linkedAttachmentIds: ours
        .filter(l => l.kind === "attachment" && l.sourceAttachmentId)
        .map(l => l.sourceAttachmentId as string),
    };
  });

  // ─── Sender CRM lookup ───
  type SenderInfo = {
    email: string;
    name: string;
    status: "known_contact" | "known_customer" | "known_domain" | "unknown" | "no_email";
    customerId: number | null;
    customerName: string | null;
    contactId: number | null;
    contactName: string | null;
  };
  const senderInfo: SenderInfo = {
    email: senderEmail,
    name: senderName,
    status: "unknown",
    customerId: null,
    customerName: null,
    contactId: null,
    contactName: null,
  };
  const isPersonalDomain = ["gmail.com", "googlemail.com", "yahoo.com", "yahoo.it", "hotmail.com", "hotmail.it", "outlook.com", "outlook.it", "live.com", "libero.it", "alice.it", "tiscali.it", "icloud.com", "me.com", "tin.it", "virgilio.it", "fastwebnet.it", "pec.it"];

  if (!senderEmail) {
    senderInfo.status = "no_email";
  } else {
    // 1) Exact match against contacts (scoped to customers belonging to this company)
    const customerIdsOfCompany = new Set(customersList.map(c => c.id));
    const matchedContact = contactsList.find(c =>
      c.email && c.email.toLowerCase() === senderEmail && customerIdsOfCompany.has(c.customerId),
    );
    if (matchedContact) {
      senderInfo.status = "known_contact";
      senderInfo.contactId = matchedContact.id;
      senderInfo.contactName = `${matchedContact.firstName ?? ""} ${matchedContact.lastName ?? ""}`.trim();
      senderInfo.customerId = matchedContact.customerId;
      senderInfo.customerName = custMap.get(matchedContact.customerId) ?? null;
    } else {
      // 2) Exact match against customer.email or customer.pec
      const matchedCustomer = customersList.find(c =>
        (c.email && c.email.toLowerCase() === senderEmail)
        || (c.pec && c.pec.toLowerCase() === senderEmail),
      );
      if (matchedCustomer) {
        senderInfo.status = "known_customer";
        senderInfo.customerId = matchedCustomer.id;
        senderInfo.customerName = matchedCustomer.name;
      } else if (senderDomain && !isPersonalDomain.includes(senderDomain)) {
        // 3) Domain match against customer email/pec/website
        const domainMatch = customersList.find(c => {
          const domains: string[] = [];
          if (c.email) {
            const d = c.email.toLowerCase().split("@")[1];
            if (d) domains.push(d);
          }
          if (c.pec) {
            const d = c.pec.toLowerCase().split("@")[1];
            if (d) domains.push(d);
          }
          if (c.webSite) {
            const d = c.webSite.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
            if (d) domains.push(d);
          }
          return domains.some(d => d === senderDomain || d.endsWith("." + senderDomain) || senderDomain.endsWith("." + d));
        });
        if (domainMatch) {
          senderInfo.status = "known_domain";
          senderInfo.customerId = domainMatch.id;
          senderInfo.customerName = domainMatch.name;
        }
      }
    }
  }

  res.json({ suggestions: enriched, sender: senderInfo });
}));

// ─── GET ATTACHMENT ───
router.get("/api/email/messages/:messageId/attachments/:attachmentId", requireAnyAuth, asyncHandler(async (req, res) => {
  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  const msg = await gmailApiGet(accessToken, `messages/${req.params.messageId}?format=full`);
  let resolvedFilename = "attachment";
  let resolvedMimeType = "application/octet-stream";

  function findAttachmentPart(payload: Record<string, unknown>): void {
    const parts = payload.parts as Array<Record<string, unknown>> | undefined;
    if (parts) {
      for (const part of parts) {
        const body = part.body as { attachmentId?: string } | undefined;
        if (body?.attachmentId === req.params.attachmentId) {
          resolvedFilename = (part.filename as string) || "attachment";
          resolvedMimeType = (part.mimeType as string) || "application/octet-stream";
          return;
        }
        if (part.parts) findAttachmentPart(part as Record<string, unknown>);
      }
    }
  }
  if (msg.payload) findAttachmentPart(msg.payload);

  if (resolvedMimeType === "application/octet-stream" && /\.pdf$/i.test(resolvedFilename)) {
    resolvedMimeType = "application/pdf";
  }

  const safeInlineTypes = [
    "image/png", "image/jpeg", "image/gif", "image/webp",
    "application/pdf",
  ];
  const forceDownload = req.query.download === "1" || req.query.download === "true";
  const disposition = !forceDownload && safeInlineTypes.includes(resolvedMimeType) ? "inline" : "attachment";

  const attachment = await gmailApiGet(
    accessToken,
    `messages/${req.params.messageId}/attachments/${req.params.attachmentId}`
  );

  const data = Buffer.from(attachment.data, "base64url");

  const asciiFallback = resolvedFilename
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  const utf8Encoded = encodeURIComponent(resolvedFilename);
  const contentDisposition =
    `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;

  res.set("Content-Type", resolvedMimeType);
  res.set("Content-Disposition", contentDisposition);
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Length", String(data.length));
  res.send(data);
}));

// ─── MARK READ/UNREAD ───
router.patch("/api/email/messages/:messageId/read", requireAnyAuth, asyncHandler(async (req, res) => {
  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  const { read } = req.body;
  const body = read
    ? { removeLabelIds: ["UNREAD"] }
    : { addLabelIds: ["UNREAD"] };

  await gmailApiPost(accessToken, `messages/${req.params.messageId}/modify`, body);
  res.json({ ok: true });
}));

// ─── TRASH MESSAGE ───
router.delete("/api/email/messages/:messageId", requireAnyAuth, asyncHandler(async (req, res) => {
  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  await gmailApiPost(accessToken, `messages/${req.params.messageId}/trash`, {});
  res.json({ ok: true });
}));

// ─── STAR/UNSTAR ───
router.patch("/api/email/messages/:messageId/star", requireAnyAuth, asyncHandler(async (req, res) => {
  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  const { starred } = req.body;
  const body = starred
    ? { addLabelIds: ["STARRED"] }
    : { removeLabelIds: ["STARRED"] };

  await gmailApiPost(accessToken, `messages/${req.params.messageId}/modify`, body);
  res.json({ ok: true });
}));

// ─── UNREAD COUNT ───
router.get("/api/email/unread-count", requireAnyAuth, asyncHandler(async (req, res) => {
  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  const labels = await gmailApiGet(accessToken, "labels/INBOX");
  res.json({
    unreadCount: labels.messagesUnread || 0,
    totalCount: labels.messagesTotal || 0,
  });
}));

// ─── LIST DRAFTS ───
router.get("/api/email/drafts", requireAnyAuth, asyncHandler(async (req, res) => {
  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  const pageToken = req.query.pageToken as string | undefined;
  const maxResults = Math.min(Number(req.query.maxResults) || 20, 50);

  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (pageToken) params.set("pageToken", pageToken);

  const listResult = await gmailApiGet(accessToken, `drafts?${params}`);
  const drafts: any[] = listResult.drafts || [];

  if (drafts.length === 0) {
    return res.json({ drafts: [], nextPageToken: null });
  }

  const fullDrafts = await Promise.all(
    drafts.map(d => gmailApiGet(accessToken, `drafts/${d.id}?format=full`))
  );

  const formatted = fullDrafts.map(d => ({
    draftId: d.id,
    ...formatGmailMessage(d.message, true),
  }));

  res.json({
    drafts: formatted,
    nextPageToken: listResult.nextPageToken || null,
  });
}));

// ─── CREATE DRAFT ───
router.post("/api/email/drafts", requireAnyAuth, asyncHandler(async (req, res) => {
  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  const { to, cc, subject, bodyHtml, inReplyTo, references, threadId, attachments: userAttachments } = req.body;

  const fileAttachments: FileAttachment[] = Array.isArray(userAttachments)
    ? userAttachments.filter((a: Record<string, string>) => a.filename && a.mimeType && a.data)
        .map((a: Record<string, string>) => ({ filename: a.filename, mimeType: a.mimeType, data: a.data }))
    : [];

  const raw = buildRawEmail({
    from: conn.senderDisplayName
      ? `${conn.senderDisplayName} <${conn.providerAccountEmail}>`
      : conn.providerAccountEmail || "",
    to: to || "",
    cc: cc || "",
    subject: subject || "",
    bodyHtml: bodyHtml || "",
    inReplyTo,
    references,
    attachments: fileAttachments,
  });

  const draftBody: any = { message: { raw } };
  if (threadId) draftBody.message.threadId = threadId;

  const draft = await gmailApiPost(accessToken, "drafts", draftBody);
  res.json({ draftId: draft.id });
}));

// ─── UPDATE DRAFT ───
router.put("/api/email/drafts/:draftId", requireAnyAuth, asyncHandler(async (req, res) => {
  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  const { to, cc, subject, bodyHtml, inReplyTo, references, threadId,
          attachments: userAttachments, preserveExistingAttachments } = req.body;

  const newAttachments: FileAttachment[] = Array.isArray(userAttachments)
    ? userAttachments.filter((a: Record<string, string>) => a.filename && a.mimeType && a.data)
        .map((a: Record<string, string>) => ({ filename: a.filename, mimeType: a.mimeType, data: a.data }))
    : [];

  let existingAttachments: FileAttachment[] = [];
  if (preserveExistingAttachments) {
    try {
      const existingDraft = await gmailApiGet(accessToken, `drafts/${req.params.draftId}?format=full`);
      const existingParts = flattenParts(existingDraft.message?.payload);
      for (const part of existingParts) {
        if (part.body?.attachmentId && part.filename) {
          const attData = await gmailApiGet(
            accessToken,
            `messages/${existingDraft.message.id}/attachments/${part.body.attachmentId}`
          );
          if (attData.data) {
            existingAttachments.push({
              filename: part.filename,
              mimeType: part.mimeType || "application/octet-stream",
              data: attData.data.replace(/-/g, "+").replace(/_/g, "/"),
            });
          }
        }
      }
    } catch (_e) {
      // ignore - proceed without existing attachments
    }
  }

  const allAttachments = [...existingAttachments, ...newAttachments];

  const raw = buildRawEmail({
    from: conn.senderDisplayName
      ? `${conn.senderDisplayName} <${conn.providerAccountEmail}>`
      : conn.providerAccountEmail || "",
    to: to || "",
    cc: cc || "",
    subject: subject || "",
    bodyHtml: bodyHtml || "",
    inReplyTo,
    references,
    attachments: allAttachments,
  });

  const draftBody: any = { message: { raw } };
  if (threadId) draftBody.message.threadId = threadId;

  const draft = await gmailApiPut(accessToken, `drafts/${req.params.draftId}`, draftBody);
  res.json({ draftId: draft.id });
}));

// ─── DELETE DRAFT ───
router.delete("/api/email/drafts/:draftId", requireAnyAuth, asyncHandler(async (req, res) => {
  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  await gmailApiDelete(accessToken, `drafts/${req.params.draftId}`);
  res.json({ ok: true });
}));

// ─── SEND DRAFT ───
router.post("/api/email/drafts/:draftId/send", requireAnyAuth, asyncHandler(async (req, res) => {
  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  await gmailApiPost(accessToken, `drafts/send`, { id: req.params.draftId });
  res.json({ ok: true });
}));

// ─── GET THREAD ───
router.get("/api/email/threads/:threadId", requireAnyAuth, asyncHandler(async (req, res) => {
  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  const thread = await gmailApiGet(accessToken, `threads/${req.params.threadId}?format=full`);
  const messages = (thread.messages || []).map((msg: any) => formatGmailMessage(msg, true));
  res.json({ id: thread.id, messages });
}));

// ─── BUILD RAW EMAIL ───
interface FileAttachment {
  filename: string;
  mimeType: string;
  data: string;
}

function buildRawEmail(opts: {
  from: string; to: string; cc: string; subject: string;
  bodyHtml: string; inReplyTo?: string; references?: string;
  attachments?: FileAttachment[];
}): string {
  const parts: string[] = [];
  parts.push(`From: ${opts.from}`);
  if (opts.to) parts.push(`To: ${opts.to}`);
  if (opts.cc) parts.push(`Cc: ${opts.cc}`);
  parts.push(`Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString("base64")}?=`);
  parts.push("MIME-Version: 1.0");
  if (opts.inReplyTo) parts.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) parts.push(`References: ${opts.references}`);

  const hasAttachments = opts.attachments && opts.attachments.length > 0;

  if (hasAttachments) {
    const boundary = "boundary_" + Date.now();
    parts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    parts.push("");
    parts.push(`--${boundary}`);
    parts.push("Content-Type: text/html; charset=UTF-8");
    parts.push("Content-Transfer-Encoding: base64");
    parts.push("");
    parts.push(Buffer.from(opts.bodyHtml || "").toString("base64"));
    for (const att of opts.attachments!) {
      const safeName = att.filename.replace(/[\r\n"\\]/g, "_");
      const safeMime = att.mimeType.replace(/[\r\n]/g, "");
      parts.push(`--${boundary}`);
      parts.push(`Content-Type: ${safeMime}; name="${safeName}"`);
      parts.push("Content-Transfer-Encoding: base64");
      parts.push(`Content-Disposition: attachment; filename="${safeName}"`);
      parts.push("");
      parts.push(att.data);
    }
    parts.push(`--${boundary}--`);
  } else {
    parts.push("Content-Type: text/html; charset=UTF-8");
    parts.push("Content-Transfer-Encoding: base64");
    parts.push("");
    parts.push(Buffer.from(opts.bodyHtml || "").toString("base64"));
  }

  return Buffer.from(parts.join("\r\n")).toString("base64url");
}

// ─── SEND EMAIL (extended with reply/forward support + file attachments) ───
router.post("/api/email/send", requireAnyAuth, asyncHandler(async (req, res) => {
  const { connectionId, to, cc, subject, bodyHtml, offerId, jobOrderId, customerId,
          inReplyTo, references, threadId, attachments: userAttachments,
          attachLinkedDrawingId } = req.body;
  if (!to || !subject) throw AppError.badRequest("Recipient and subject required");

  const fileAttachments: FileAttachment[] = Array.isArray(userAttachments)
    ? userAttachments.filter((a: Record<string, string>) => a.filename && a.mimeType && a.data)
        .map((a: Record<string, string>) => ({ filename: a.filename, mimeType: a.mimeType, data: a.data }))
    : [];

  const { salesmanUserId, dealerUserId } = getUserIds(req);

  let conn: any;
  if (connectionId) {
    [conn] = await db.select().from(emailConnections).where(eq(emailConnections.id, connectionId));
  } else {
    const ownerCondition = salesmanUserId
      ? eq(emailConnections.salesmanUserId, salesmanUserId)
      : eq(emailConnections.dealerUserId, dealerUserId!);
    const rows = await db.select().from(emailConnections).where(ownerCondition);
    conn = rows.find(r => r.isDefault) || rows[0];
  }

  if (!conn) throw AppError.badRequest("No email connection configured. Connect Gmail or Outlook in your account settings.");
  if (salesmanUserId && conn.salesmanUserId !== salesmanUserId) throw AppError.forbidden();
  if (dealerUserId && conn.dealerUserId !== dealerUserId) throw AppError.forbidden();

  let pdfBuffer: Buffer | null = null;
  let pdfFilename = "offerta.pdf";
  if (offerId) {
    try {
      const result = await generateOfferPdf(Number(offerId));
      pdfBuffer = result.buffer;
      pdfFilename = result.filename;
    } catch (e) {
      console.error("[email] Failed to generate PDF for offer", offerId, e);
    }
  }

  const accessToken = await getValidAccessToken(conn, req);

  const signatureHtml = conn.signature
    ? `<br/><br/>--<br/>${conn.signature.replace(/\n/g, "<br/>")}`
    : "";
  const fullBodyHtml = (bodyHtml || "") + signatureHtml;

  const allAttachments: FileAttachment[] = [...fileAttachments];
  if (pdfBuffer) {
    allAttachments.push({
      filename: pdfFilename,
      mimeType: "application/pdf",
      data: pdfBuffer.toString("base64"),
    });
  }

  // Attach linked technical drawing files (PDF + DWG) when requested
  if (attachLinkedDrawingId) {
    try {
      const [drawing] = await db.select().from(drawings).where(
        and(eq(drawings.id, Number(attachLinkedDrawingId)), eq(drawings.companyId, req.companyId))
      );
      if (drawing) {
        if (drawing.pdfFilename) {
          const p = drawingsFileStorage.getFullPath(drawing.pdfFilename);
          if (fs.existsSync(p)) {
            allAttachments.push({
              filename: drawing.pdfOriginalName || drawing.pdfFilename,
              mimeType: "application/pdf",
              data: fs.readFileSync(p).toString("base64"),
            });
          }
        }
        if (drawing.dwgFilename) {
          const p = drawingsFileStorage.getFullPath(drawing.dwgFilename);
          if (fs.existsSync(p)) {
            allAttachments.push({
              filename: drawing.dwgOriginalName || drawing.dwgFilename,
              mimeType: "application/acad",
              data: fs.readFileSync(p).toString("base64"),
            });
          }
        }
      }
    } catch (e) {
      console.error("[email] Failed to attach linked drawing", attachLinkedDrawingId, e);
    }
  }

  let providerMessageId: string | null = null;
  // Gmail's send response also returns the threadId of the conversation
  // the message was filed under (either the threadId we passed in for a
  // reply, or a fresh one for a new conversation). We persist it so the
  // Recap can group sent emails with their inbound replies under one
  // "same-email-thread" link without an extra Gmail round-trip.
  let providerThreadId: string | null = null;
  if (conn.provider === "gmail") {
    const fromAddr = conn.senderDisplayName
      ? `${conn.senderDisplayName} <${conn.providerAccountEmail}>`
      : conn.providerAccountEmail || "";
    const raw = buildRawEmail({
      from: fromAddr,
      to,
      cc: cc || "",
      subject,
      bodyHtml: fullBodyHtml,
      inReplyTo,
      references,
      attachments: allAttachments.length > 0 ? allAttachments : undefined,
    });
    const sendBody: Record<string, string> = { raw };
    if (threadId) sendBody.threadId = threadId;
    const sendRes: { id?: unknown; threadId?: unknown } = await gmailApiPost(accessToken, "messages/send", sendBody);
    if (sendRes && typeof sendRes.id === "string") {
      providerMessageId = sendRes.id;
    }
    if (sendRes && typeof sendRes.threadId === "string") {
      providerThreadId = sendRes.threadId;
    } else if (typeof threadId === "string" && threadId) {
      // Fallback: if Gmail didn't echo the threadId for some reason, fall
      // back to the one we requested for replies/forwards.
      providerThreadId = threadId;
    }
  } else if (conn.provider === "outlook") {
    // Microsoft Graph /me/sendMail returns 202 with no body, so no message
    // id is available here. providerMessageId stays null for Outlook sends.
    await sendViaOutlook(accessToken, {
      to,
      cc: cc || "",
      subject,
      bodyHtml: fullBodyHtml,
      attachments: allAttachments.length > 0 ? allAttachments : undefined,
    });
  } else {
    throw AppError.badRequest("Unsupported provider");
  }

  let interactionId: number | null = null;
  if (customerId) {
    try {
      const [interaction] = await db.insert(interactions).values({
        customerId: Number(customerId),
        salesmanUserId,
        dealerUserId,
        date: new Date(),
        direction: "outbound",
        type: "email",
        classification: "commercial",
        notes: `Email inviata a ${to}\nOggetto: ${subject}`,
        autoGenerated: true,
        linkedOfferId: offerId ? Number(offerId) : null,
        linkedJobOrderId: jobOrderId ? Number(jobOrderId) : null,
      }).returning();
      interactionId = interaction.id;
    } catch (e) {
      console.error("[email] Failed to create CRM interaction:", e);
    }
  }

  await db.insert(emailSendLog).values({
    salesmanUserId,
    dealerUserId,
    provider: conn.provider,
    recipient: to,
    cc: cc || null,
    subject,
    offerId: offerId ? Number(offerId) : null,
    jobOrderId: jobOrderId ? Number(jobOrderId) : null,
    customerId: customerId ? Number(customerId) : null,
    interactionId,
    providerMessageId,
    providerThreadId,
  });

  // If this email was about an offer, promote its status to "Sent" — but
  // never downgrade an offer that is already Accepted / Rejected / Expired.
  let offerStatusUpdatedTo: string | null = null;
  if (offerId) {
    try {
      const [cur] = await db
        .select({ status: offers.status, companyId: offers.companyId })
        .from(offers)
        .where(eq(offers.id, Number(offerId)));
      if (cur && cur.companyId === req.companyId && cur.status === "Draft") {
        await db
          .update(offers)
          .set({ status: "Sent" })
          .where(and(eq(offers.id, Number(offerId)), eq(offers.companyId, req.companyId)));
        offerStatusUpdatedTo = "Sent";
      }
    } catch (e) {
      console.error("[email] Failed to update offer status to Sent:", e);
    }
  }

  res.json({ ok: true, provider: conn.provider, offerStatusUpdatedTo, interactionId });
}));

// ─── SEND VIA OUTLOOK ───
async function sendViaOutlook(accessToken: string, opts: {
  to: string; cc: string; subject: string;
  bodyHtml: string; attachments?: FileAttachment[];
}) {
  const toRecipients = opts.to.split(",").map(e => e.trim()).filter(Boolean).map(email => ({
    emailAddress: { address: email },
  }));

  const ccRecipients = opts.cc
    ? opts.cc.split(",").map(e => e.trim()).filter(Boolean).map(email => ({
        emailAddress: { address: email },
      }))
    : [];

  const message: any = {
    subject: opts.subject,
    body: { contentType: "HTML", content: opts.bodyHtml },
    toRecipients,
    ccRecipients,
  };

  if (opts.attachments && opts.attachments.length > 0) {
    message.attachments = opts.attachments.map(a => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.filename,
      contentType: a.mimeType,
      contentBytes: a.data,
    }));
  }

  const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error("[email] Outlook send failed:", err);
    throw new Error(`Outlook send failed: ${resp.status}`);
  }
}

// ─── SEND LOG ───
router.get("/api/email/send-log", requireAnyAuth, asyncHandler(async (req, res) => {
  const { salesmanUserId, dealerUserId } = getUserIds(req);
  const condition = salesmanUserId
    ? eq(emailSendLog.salesmanUserId, salesmanUserId)
    : dealerUserId
    ? eq(emailSendLog.dealerUserId, dealerUserId)
    : sql`false`;

  const rows = await db.select().from(emailSendLog)
    .where(condition)
    .orderBy(sql`${emailSendLog.sentAt} DESC`)
    .limit(50);

  res.json(rows);
}));

// ─── OFFER DATA FOR EMAIL COMPOSE ───
router.get("/api/email/offer-data/:offerId", requireAnyAuth, asyncHandler(async (req, res) => {
  const offerId = Number(req.params.offerId);
  if (isNaN(offerId)) throw AppError.badRequest("Invalid offer ID");

  const [offer] = await db.select().from(offers).where(and(eq(offers.id, offerId), eq(offers.companyId, req.companyId)));
  if (!offer) throw AppError.notFound("Offer");

  const projectData = (offer.projectData || {}) as Record<string, any>;
  const commercial = projectData.commercial || {};
  const headerInfo = projectData.headerInfo || {};

  const salesScenario = (offer.salesScenario as "direct" | "with_dealer" | "to_dealer" | null)
    ?? (commercial.dealerCompanyId ? (commercial.endCustomerId ? "to_dealer" : "with_dealer") : "direct");

  // End customer resolution (for "to_dealer" uses endCustomerId; otherwise offer.customerId)
  const endCustomerId: number | null = salesScenario === "to_dealer"
    ? (commercial.endCustomerId ?? offer.customerId ?? null)
    : (offer.customerId ?? null);

  let customerName: string | null = null;
  let customerEmail: string | null = null;
  if (endCustomerId) {
    const [cust] = await db.select().from(customers).where(eq(customers.id, endCustomerId));
    if (cust) {
      customerName = cust.companyName || cust.name || null;
      customerEmail = cust.email || null;
    }
  }

  // Priority for "contatto scelto in offerta":
  //   1. Explicit contactId stored on the offer -> contacts.email
  //   2. Email materialized on projectData.headerInfo.customer (this is what
  //      was actually displayed on the offer as the chosen contact's email).
  //   3. customers.email (fallback computed above)
  const contactId: number | null = commercial.endCustomerContactId
    ?? headerInfo?.customer?.contactId
    ?? null;
  if (contactId) {
    const [ct] = await db.select().from(contacts).where(eq(contacts.id, Number(contactId)));
    if (ct?.email) customerEmail = ct.email;
  } else if (headerInfo?.customer?.email) {
    customerEmail = String(headerInfo.customer.email);
  }
  if (!customerName && headerInfo?.customer?.name) {
    customerName = String(headerInfo.customer.name);
  }

  // Dealer company email, with the same priority override from headerInfo
  let dealerName: string | null = null;
  let dealerEmail: string | null = null;
  const dealerCompanyId: number | null = commercial.dealerCompanyId ?? null;
  if (dealerCompanyId) {
    const [dc] = await db.select().from(dealerCompanies).where(eq(dealerCompanies.id, dealerCompanyId));
    if (dc) {
      dealerName = dc.companyName || null;
      dealerEmail = dc.email || null;
    }
  }
  if (headerInfo?.dealer?.email) dealerEmail = String(headerInfo.dealer.email);
  if (!dealerName && headerInfo?.dealer?.name) dealerName = String(headerInfo.dealer.name);

  // Compute recipient list per scenario rules
  const recipientEmails: string[] = [];
  if (salesScenario === "direct") {
    if (customerEmail) recipientEmails.push(customerEmail);
  } else if (salesScenario === "with_dealer") {
    if (customerEmail) recipientEmails.push(customerEmail);
    if (dealerEmail) recipientEmails.push(dealerEmail);
  } else if (salesScenario === "to_dealer") {
    if (dealerEmail) recipientEmails.push(dealerEmail);
  }

  // Linked technical drawing
  const linkedDrawingId: number | null = projectData.linkedDrawingId ?? null;
  let linkedDrawing: {
    id: number;
    pdfFilename: string | null;
    pdfOriginalName: string | null;
    dwgFilename: string | null;
    dwgOriginalName: string | null;
  } | null = null;
  if (linkedDrawingId) {
    const [d] = await db.select().from(drawings).where(eq(drawings.id, linkedDrawingId));
    if (d) {
      linkedDrawing = {
        id: d.id,
        pdfFilename: d.pdfFilename,
        pdfOriginalName: d.pdfOriginalName,
        dwgFilename: d.dwgFilename,
        dwgOriginalName: d.dwgOriginalName,
      };
    }
  }

  res.json({
    offerId: offer.id,
    referenceNumber: offer.referenceNumber,
    status: offer.status,
    totalPrice: offer.totalPrice,
    subject: offer.subject || null,
    customerId: endCustomerId,
    customerName,
    customerEmail,
    dealerCompanyId,
    dealerName,
    dealerEmail,
    salesScenario,
    recipientEmail: recipientEmails.join(", "),
    linkedDrawingId,
    linkedDrawing,
  });
}));

// ─── AI EMAIL STATUS + TOGGLE ───
router.get("/api/email/ai/status", requireAnyAuth, asyncHandler(async (req, res) => {
  const globalEnabled = await settingsRepository.getAiEnabled(req.companyId);
  const hasApiKey = !!process.env.OPENAI_API_KEY;

  let userPref = true;
  try {
    const conn = await getGmailConnection(req);
    userPref = conn.aiEmailEnabled !== false;
  } catch {
    // no connection, default to true
  }

  res.json({ aiEnabled: globalEnabled && hasApiKey && userPref, userPref, globalEnabled: globalEnabled && hasApiKey });
}));

router.patch("/api/email/ai/toggle", requireAnyAuth, asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") throw AppError.badRequest("enabled (boolean) required");

  const conn = await getGmailConnection(req);
  await db.update(emailConnections)
    .set({ aiEmailEnabled: enabled, updatedAt: new Date() })
    .where(eq(emailConnections.id, conn.id));

  res.json({ ok: true, aiEmailEnabled: enabled });
}));

// ─── AI EMAIL ENDPOINTS ───

async function checkEmailAiEnabled(req: import("express").Request): Promise<void> {
  const enabled = await settingsRepository.getAiEnabled(req.companyId);
  if (!enabled) {
    throw new AppError(503, "AI services are disabled in system settings");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new AppError(503, "AI provider is not configured: missing API key");
  }
  try {
    const conn = await getGmailConnection(req);
    if (conn.aiEmailEnabled === false) {
      throw new AppError(503, "AI email assistant is disabled for your account");
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
  }
}

function getTriggeredBy(req: import("express").Request): string {
  const salesmanId = getSalesmanId(req);
  const dealerId = getDealerId(req);
  return salesmanId ? `salesman:${salesmanId}` : dealerId ? `dealer:${dealerId}` : "unknown";
}

const emailSummarizeSchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
  actionRequired: z.boolean(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
});

const emailTodosSchema = z.object({
  todos: z.array(z.object({
    text: z.string(),
    priority: z.enum(["high", "medium", "low"]),
    deadline: z.string().nullable().optional(),
  })),
});

const emailSuggestRepliesSchema = z.object({
  replies: z.array(z.object({
    label: z.string(),
    bodyHtml: z.string(),
  })),
});

const emailImproveSchema = z.object({
  improved: z.string(),
});

const emailRecapSchema = z.object({
  recap: z.string(),
  highlights: z.array(z.string()),
  pendingActions: z.array(z.string()),
});

router.post("/api/email/ai/summarize", requireAnyAuth, asyncHandler(async (req, res) => {
  await checkEmailAiEnabled(req);
  const { body: emailBody, subject } = req.body;
  if (!emailBody && !subject) throw AppError.badRequest("Email body or subject required");

  const { getAiProvider } = await import("../services/ai/index");
  const provider = getAiProvider();
  const textContent = stripHtml(emailBody || "") || subject || "";

  const { run, output } = await executeAiWorkflow({
    provider,
    workflow: "email_summarize" as AiRunWorkflow,
    messages: [
      { role: "system", content: `Sei un assistente AI per QuotePilot, un CRM per vendite industriali. 
Riassumi la seguente email in modo conciso e professionale in italiano. 
Rispondi con un JSON: { "summary": "...", "keyPoints": ["..."], "actionRequired": true/false, "sentiment": "positive/neutral/negative" }` },
      { role: "user", content: `Oggetto: ${subject || "(nessun oggetto)"}\n\nCorpo:\n${textContent.slice(0, 4000)}` },
    ],
    outputSchema: emailSummarizeSchema,
    triggeredBy: getTriggeredBy(req),
    input: { subject, bodyLength: textContent.length },
  });

  if (run.status === "failed") throw new AppError(500, run.error || "AI workflow failed");
  res.json(output || { summary: "", keyPoints: [], actionRequired: false, sentiment: "neutral" });
}));

router.post("/api/email/ai/extract-todos", requireAnyAuth, asyncHandler(async (req, res) => {
  await checkEmailAiEnabled(req);
  const { body: emailBody, subject } = req.body;
  if (!emailBody && !subject) throw AppError.badRequest("Email body or subject required");

  const { getAiProvider } = await import("../services/ai/index");
  const provider = getAiProvider();
  const textContent = stripHtml(emailBody || "") || subject || "";

  const { run, output } = await executeAiWorkflow({
    provider,
    workflow: "email_extract_todos" as AiRunWorkflow,
    messages: [
      { role: "system", content: `Sei un assistente AI per QuotePilot. Analizza l'email ed estrai tutte le azioni richieste, task e to-do.
Rispondi con un JSON: { "todos": [{ "text": "...", "priority": "high/medium/low", "deadline": "..." }] }
Se non ci sono azioni chiare, restituisci un array vuoto.` },
      { role: "user", content: `Oggetto: ${subject || ""}\n\nCorpo:\n${textContent.slice(0, 4000)}` },
    ],
    outputSchema: emailTodosSchema,
    triggeredBy: getTriggeredBy(req),
    input: { subject, bodyLength: textContent.length },
  });

  if (run.status === "failed") throw new AppError(500, run.error || "AI workflow failed");
  res.json(output || { todos: [] });
}));

router.post("/api/email/ai/suggest-replies", requireAnyAuth, asyncHandler(async (req, res) => {
  await checkEmailAiEnabled(req);
  const { body: emailBody, subject } = req.body;
  if (!emailBody && !subject) throw AppError.badRequest("Email body or subject required");

  const { getAiProvider } = await import("../services/ai/index");
  const provider = getAiProvider();
  const textContent = stripHtml(emailBody || "") || subject || "";

  const { run, output } = await executeAiWorkflow({
    provider,
    workflow: "email_suggest_replies" as AiRunWorkflow,
    messages: [
      { role: "system", content: `Sei un assistente AI per QuotePilot. Genera 3 opzioni di risposta per l'email seguente, in italiano professionale.
Rispondi con un JSON: { "replies": [{ "label": "Formale/Concisa/Dettagliata", "bodyHtml": "<p>...</p>" }] }
Ogni risposta deve essere completa e pronta all'invio.` },
      { role: "user", content: `Oggetto: ${subject || ""}\n\nCorpo:\n${textContent.slice(0, 3000)}` },
    ],
    outputSchema: emailSuggestRepliesSchema,
    triggeredBy: getTriggeredBy(req),
    input: { subject, bodyLength: textContent.length },
  });

  if (run.status === "failed") throw new AppError(500, run.error || "AI workflow failed");
  res.json(output || { replies: [] });
}));

router.post("/api/email/ai/improve", requireAnyAuth, asyncHandler(async (req, res) => {
  await checkEmailAiEnabled(req);
  const { draft, tone } = req.body;
  if (!draft) throw AppError.badRequest("Draft text required");

  const { getAiProvider } = await import("../services/ai/index");
  const provider = getAiProvider();

  const toneLabel = tone === "formal" ? "formale e professionale" :
                    tone === "concise" ? "conciso e diretto" :
                    tone === "persuasive" ? "persuasivo e convincente" : "professionale";

  const { run, output } = await executeAiWorkflow({
    provider,
    workflow: "email_improve" as AiRunWorkflow,
    messages: [
      { role: "system", content: `Sei un assistente AI per QuotePilot. Migliora il seguente testo di email in italiano, rendendolo ${toneLabel}.
Correggi grammatica, migliora il tono e la chiarezza. Mantieni il significato originale.
Rispondi con un JSON: { "improved": "<p>testo migliorato in HTML</p>" }` },
      { role: "user", content: stripHtml(draft).slice(0, 3000) },
    ],
    outputSchema: emailImproveSchema,
    triggeredBy: getTriggeredBy(req),
    input: { tone, draftLength: draft.length },
  });

  if (run.status === "failed") throw new AppError(500, run.error || "AI workflow failed");
  res.json(output || { improved: draft });
}));

router.post("/api/email/ai/recap", requireAnyAuth, asyncHandler(async (req, res) => {
  await checkEmailAiEnabled(req);
  const { days } = req.body;
  const recapDays = typeof days === "number" && days > 0 ? Math.min(days, 30) : 7;

  const conn = await getGmailConnection(req);
  const accessToken = await getValidAccessToken(conn, req);

  const afterDate = new Date();
  afterDate.setDate(afterDate.getDate() - recapDays);
  const afterEpoch = Math.floor(afterDate.getTime() / 1000);
  const query = `after:${afterEpoch} in:inbox`;

  const listResult = await gmailApiGet(accessToken, `messages?q=${encodeURIComponent(query)}&maxResults=30`);
  const messageIds: string[] = (listResult.messages || []).map((m: Record<string, string>) => m.id);

  if (messageIds.length === 0) {
    res.json({ recap: "Nessuna email negli ultimi " + recapDays + " giorni.", highlights: [], pendingActions: [] });
    return;
  }

  const recapMessages = await Promise.all(
    messageIds.slice(0, 30).map(async (id: string) => {
      const msg = await gmailApiGet(accessToken, `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
      const headers = parseGmailHeaders(msg.payload?.headers || []);
      return {
        from: headers.from || "?",
        subject: headers.subject || "?",
        snippet: msg.snippet || "",
        date: headers.date || "",
      };
    })
  );

  const { getAiProvider } = await import("../services/ai/index");
  const provider = getAiProvider();

  const emailSummaries = recapMessages.map((m, i) =>
    `${i + 1}. Da: ${m.from} | Oggetto: ${m.subject} | Data: ${m.date} | Anteprima: ${m.snippet.slice(0, 100)}`
  ).join("\n");

  const { run, output } = await executeAiWorkflow({
    provider,
    workflow: "email_recap" as AiRunWorkflow,
    messages: [
      { role: "system", content: `Sei un assistente AI per QuotePilot. Genera un recap/digest delle email degli ultimi ${recapDays} giorni in italiano.
Rispondi con un JSON: { "recap": "...", "highlights": ["..."], "pendingActions": ["..."] }
Evidenzia i temi principali, le email importanti e le azioni pendenti.` },
      { role: "user", content: `Ecco le email degli ultimi ${recapDays} giorni:\n${emailSummaries}` },
    ],
    outputSchema: emailRecapSchema,
    triggeredBy: getTriggeredBy(req),
    input: { days: recapDays, messageCount: recapMessages.length },
  });

  if (run.status === "failed") throw new AppError(500, run.error || "AI workflow failed");
  res.json(output || { recap: "", highlights: [], pendingActions: [] });
}));

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export default router;
