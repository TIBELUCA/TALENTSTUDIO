import { db } from "../db";
import { emailConnections, gmailMessageIndex } from "@shared/schema";
import { and, eq, lt, sql } from "drizzle-orm";
import { google } from "googleapis";
import crypto from "crypto";

// ─── Encryption (mirrors server/routes/email.ts) ─────────────────────────
const ENCRYPTION_KEY = process.env.EMAIL_TOKEN_ENCRYPTION_KEY || "quotepilot-default-key-change-me!!";

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

function encrypt(text: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

// ─── Configuration ───────────────────────────────────────────────────────
const SYNC_INTERVAL_MS = 12 * 60 * 1000;          // every 12 minutes
const FIRST_RUN_DELAY_MS = 30 * 1000;             // first tick 30s after boot
const RETENTION_MONTHS = 6;                        // prune older than this
const BACKFILL_MONTHS = 6;                         // initial sweep window
const BACKFILL_MAX_MESSAGES = 5000;                // hard cap per connection
const BACKFILL_MAX_PAGES = 100;                    // (5000 / 100 = 50)
const METADATA_CHUNK_SIZE = 25;                    // gmail metadata fetch size
const HISTORY_MAX_PAGES = 30;                      // history.list pagination

let started = false;
let inFlight = false;
const triggerInFlight = new Set<number>();

type GmailConnRow = typeof emailConnections.$inferSelect;

// ─── OAuth helpers ───────────────────────────────────────────────────────

function buildOAuthClient() {
  // Redirect URI is irrelevant for token refresh; reuse "postmessage" sentinel
  // (same trick used by the Google Drive service).
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "postmessage",
  );
}

async function getValidAccessToken(conn: GmailConnRow): Promise<string> {
  const isExpired = conn.tokenExpiry && new Date(conn.tokenExpiry).getTime() <= Date.now() + 60_000;
  if (!isExpired && conn.accessToken) {
    return decrypt(conn.accessToken);
  }
  if (!conn.refreshToken) throw new Error("No refresh token for Gmail");
  const client = buildOAuthClient();
  client.setCredentials({ refresh_token: decrypt(conn.refreshToken) });
  const { credentials } = await client.refreshAccessToken();
  const newAccess = credentials.access_token!;
  await db.update(emailConnections).set({
    accessToken: encrypt(newAccess),
    tokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    updatedAt: new Date(),
  }).where(eq(emailConnections.id, conn.id));
  return newAccess;
}

class GmailHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function gmailGet(accessToken: string, path: string): Promise<any> {
  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new GmailHttpError(resp.status, `Gmail API ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
}

// ─── Header parsing ──────────────────────────────────────────────────────
type ParsedMsg = {
  messageId: string;
  internalDate: Date;
  senderEmail: string | null;
  senderName: string | null;
  senderDomain: string | null;
  subject: string;
  // Gmail thread (conversation) id. Lets the Recap link replies of the
  // same back-and-forth back to one strong cluster.
  threadId: string | null;
  // Derived from labelIds: "outbound" if the message is in SENT, otherwise
  // "inbound" (INBOX). Both directions are indexed so the Recap can show
  // sent emails — even those sent directly from Gmail (not through QP).
  direction: "inbound" | "outbound";
  // For outbound messages: lowercased first recipient address (To header).
  // Null for inbound rows (the recipient there is the user's own mailbox).
  recipientEmail: string | null;
};

function parseFirstAddress(raw: string): string | null {
  const match = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<?([^\s<>,]+@[^\s<>,]+)>?/);
  const addr = ((match?.[2] || "").trim().toLowerCase()) || null;
  return addr;
}

function parseGmailMessage(m: any): ParsedMsg | null {
  if (!m || !m.id) return null;
  const headers: Record<string, string> = {};
  for (const h of (m.payload?.headers || [])) {
    headers[String(h.name).toLowerCase()] = h.value;
  }
  const fromH = headers["from"] || "";
  const toH = headers["to"] || "";
  const subject = headers["subject"] || "(senza oggetto)";
  const dateStr = headers["date"];
  const internalMs = m.internalDate ? Number(m.internalDate) : NaN;
  const d = !isNaN(internalMs) ? new Date(internalMs) : (dateStr ? new Date(dateStr) : null);
  if (!d || isNaN(d.getTime())) return null;
  const fromMatch = fromH.match(/^\s*(?:"?([^"<]*?)"?\s*)?<?([^\s<>]+@[^\s<>]+)>?/);
  const senderName = (fromMatch?.[1] || "").trim() || null;
  const senderEmail = ((fromMatch?.[2] || "").trim().toLowerCase()) || null;
  const senderDomain = senderEmail && senderEmail.includes("@") ? senderEmail.split("@")[1] : null;
  const labels: string[] = Array.isArray(m.labelIds) ? m.labelIds : [];
  // Gmail tags every message with its folder label. We treat SENT as
  // outbound EVEN when the label set also contains INBOX (which can happen
  // for self-addressed messages); the user is interested in "did I send
  // this?" first and foremost.
  const direction: "inbound" | "outbound" = labels.includes("SENT") ? "outbound" : "inbound";
  const recipientEmail = direction === "outbound" ? parseFirstAddress(toH) : null;
  return {
    messageId: String(m.id),
    internalDate: d,
    senderEmail,
    senderName,
    senderDomain,
    subject,
    threadId: m.threadId ? String(m.threadId) : null,
    direction,
    recipientEmail,
  };
}

async function insertMessages(emailConnectionId: number, parsed: ParsedMsg[]): Promise<number> {
  if (parsed.length === 0) return 0;
  // Batch insert with ON CONFLICT DO NOTHING. Drizzle's onConflictDoNothing
  // requires a unique constraint; we have a unique index on
  // (email_connection_id, message_id). Fall back to raw SQL to keep this
  // robust even if drizzle's introspection misses the index target.
  const values = parsed.map(p => ({
    emailConnectionId,
    messageId: p.messageId,
    internalDate: p.internalDate,
    senderEmail: p.senderEmail,
    senderName: p.senderName,
    senderDomain: p.senderDomain,
    subject: p.subject,
    threadId: p.threadId,
    direction: p.direction,
    recipientEmail: p.recipientEmail,
  }));
  const result = await db.insert(gmailMessageIndex)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: gmailMessageIndex.id });
  return result.length;
}

async function pruneOldEntries(emailConnectionId: number): Promise<void> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  await db.delete(gmailMessageIndex).where(and(
    eq(gmailMessageIndex.emailConnectionId, emailConnectionId),
    lt(gmailMessageIndex.internalDate, cutoff),
  ));
}

// ─── Backfill (full window) ──────────────────────────────────────────────
async function backfillConnection(conn: GmailConnRow, accessToken: string): Promise<void> {
  // Capture the historyId BEFORE the backfill starts so that any messages
  // arriving while we paginate are not lost: the next incremental tick will
  // replay them via users.history.list (and onConflictDoNothing will dedup
  // anything we already fetched during the backfill itself).
  let preHistoryId: string | null = null;
  try {
    const profile = await gmailGet(accessToken, `profile`);
    preHistoryId = profile?.historyId ? String(profile.historyId) : null;
  } catch (e: any) {
    console.warn(`[gmail-index] could not fetch profile for conn ${conn.id}: ${e?.message ?? e}`);
  }

  const to = new Date();
  const from = new Date(); from.setMonth(from.getMonth() - BACKFILL_MONTHS);
  const afterEpoch = Math.floor(from.getTime() / 1000);
  const beforeEpoch = Math.ceil(to.getTime() / 1000);
  // Index BOTH inbox AND sent so the Recap can show received and sent
  // emails — including those sent directly from Gmail (outside QP). The
  // direction column on each row tells the Recap which way the arrow goes.
  const q = `(in:inbox OR in:sent) after:${afterEpoch} before:${beforeEpoch}`;

  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < BACKFILL_MAX_PAGES; page++) {
    const params = new URLSearchParams({ q, maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const list = await gmailGet(accessToken, `messages?${params.toString()}`);
    const pageIds: string[] = (list.messages || []).map((m: any) => m.id).filter(Boolean);
    ids.push(...pageIds);
    if (ids.length >= BACKFILL_MAX_MESSAGES) {
      ids.length = BACKFILL_MAX_MESSAGES;
      break;
    }
    pageToken = list.nextPageToken;
    if (!pageToken) break;
  }

  let inserted = 0;
  for (let i = 0; i < ids.length; i += METADATA_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + METADATA_CHUNK_SIZE);
    // Pull To header on top of From/Subject/Date so we can populate the
    // recipient column for outbound (SENT) messages — used by Recap to
    // render "Email → recipient" titles.
    const results = await Promise.all(chunk.map(id =>
      gmailGet(accessToken, `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`)
        .catch(() => null)
    ));
    const parsed = results.map(parseGmailMessage).filter(Boolean) as ParsedMsg[];
    inserted += await insertMessages(conn.id, parsed);
  }

  await db.update(emailConnections).set({
    // Use the cursor captured BEFORE backfill so the next incremental sync
    // replays any deltas that landed while we were paginating.
    gmailHistoryId: preHistoryId ?? conn.gmailHistoryId ?? null,
    gmailIndexBackfilledAt: new Date(),
    gmailIndexLastSyncedAt: new Date(),
    gmailIndexLastError: null,
    gmailIndexLastErrorAt: null,
    updatedAt: new Date(),
  }).where(eq(emailConnections.id, conn.id));

  await pruneOldEntries(conn.id);

  console.log(`[gmail-index] backfill conn=${conn.id} fetched=${ids.length} inserted=${inserted} historyId=${preHistoryId ?? "n/a"}`);
}

// ─── Incremental sync via history.list ───────────────────────────────────
async function incrementalSync(conn: GmailConnRow, accessToken: string): Promise<void> {
  if (!conn.gmailHistoryId) {
    return backfillConnection(conn, accessToken);
  }
  const startHistoryId = conn.gmailHistoryId;
  const newIds = new Set<string>();
  let latestHistoryId = startHistoryId;
  let pageToken: string | undefined;
  try {
    for (let page = 0; page < HISTORY_MAX_PAGES; page++) {
      // No `labelId` filter on history.list — Gmail's history endpoint only
      // accepts a single label per call, but we want to track BOTH INBOX
      // and SENT in one pass. We filter messages by labelId after pulling
      // the page (cheap because labels travel inline with each event).
      const params = new URLSearchParams({
        startHistoryId,
        historyTypes: "messageAdded",
        maxResults: "500",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await gmailGet(accessToken, `history?${params.toString()}`);
      if (res?.historyId) latestHistoryId = String(res.historyId);
      const history: any[] = res?.history || [];
      for (const h of history) {
        const added: any[] = h.messagesAdded || [];
        for (const a of added) {
          const labels: string[] = a?.message?.labelIds || [];
          // Keep messages that landed in INBOX or SENT (or both, e.g.
          // self-addressed). Drop chats, drafts, trashed messages, etc.
          const inboxOrSent = labels.includes("INBOX") || labels.includes("SENT");
          if (labels.length > 0 && !inboxOrSent) continue;
          if (a?.message?.id) newIds.add(String(a.message.id));
        }
      }
      pageToken = res?.nextPageToken;
      if (!pageToken) break;
    }
  } catch (e) {
    if (e instanceof GmailHttpError && (e.status === 404 || e.status === 410)) {
      console.log(`[gmail-index] history expired for conn=${conn.id}, falling back to backfill`);
      return backfillConnection(conn, accessToken);
    }
    throw e;
  }

  let inserted = 0;
  if (newIds.size > 0) {
    const ids = Array.from(newIds);
    for (let i = 0; i < ids.length; i += METADATA_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + METADATA_CHUNK_SIZE);
      const results = await Promise.all(chunk.map(id =>
        gmailGet(accessToken, `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`)
          .catch(() => null)
      ));
      const parsed = results.map(parseGmailMessage).filter(Boolean) as ParsedMsg[];
      inserted += await insertMessages(conn.id, parsed);
    }
  }

  await db.update(emailConnections).set({
    gmailHistoryId: latestHistoryId,
    gmailIndexLastSyncedAt: new Date(),
    gmailIndexLastError: null,
    gmailIndexLastErrorAt: null,
    updatedAt: new Date(),
  }).where(eq(emailConnections.id, conn.id));

  // Periodically prune old entries (cheap; bounded delete by date).
  await pruneOldEntries(conn.id);

  if (inserted > 0 || newIds.size > 0) {
    console.log(`[gmail-index] incremental conn=${conn.id} new=${newIds.size} inserted=${inserted} historyId=${latestHistoryId}`);
  }
}

// ─── Per-connection driver ───────────────────────────────────────────────
async function syncConnection(conn: GmailConnRow): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const accessToken = await getValidAccessToken(conn);
    if (!conn.gmailIndexBackfilledAt) {
      await backfillConnection(conn, accessToken);
    } else {
      await incrementalSync(conn, accessToken);
    }
    return { ok: true };
  } catch (e: any) {
    const message = String(e?.message ?? e ?? "unknown error").slice(0, 500);
    console.warn(`[gmail-index] sync failed for conn=${conn.id}: ${message}`);
    // Persist the failure so the account UI can surface it. We do not bump
    // gmailIndexLastSyncedAt — that timestamp must keep representing the most
    // recent SUCCESSFUL sync so the user can see how stale the cache is.
    try {
      await db.update(emailConnections).set({
        gmailIndexLastError: message,
        gmailIndexLastErrorAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(emailConnections.id, conn.id));
    } catch (writeErr: any) {
      console.warn(`[gmail-index] failed to persist sync error for conn=${conn.id}: ${writeErr?.message ?? writeErr}`);
    }
    return { ok: false, error: message };
  }
}

async function processAllConnections(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const conns = await db.select().from(emailConnections).where(eq(emailConnections.provider, "gmail"));
    if (conns.length === 0) return;
    for (const conn of conns) {
      await syncConnection(conn);
    }
  } catch (e: any) {
    console.error(`[gmail-index] tick failed: ${e?.message ?? e}`);
  } finally {
    inFlight = false;
  }
}

export function startGmailIndexScheduler(): void {
  if (started) return;
  started = true;
  setTimeout(() => {
    processAllConnections().catch(e => console.error("[gmail-index] initial tick failed:", e));
  }, FIRST_RUN_DELAY_MS);
  const handle = setInterval(() => {
    processAllConnections().catch(e => console.error("[gmail-index] tick failed:", e));
  }, SYNC_INTERVAL_MS);
  handle.unref?.();
  console.log(`[gmail-index] scheduler started (interval ${Math.round(SYNC_INTERVAL_MS / 60000)} min)`);
}

// ─── On-demand trigger (used by recap to bootstrap empty connections) ────
export function triggerConnectionSync(connectionId: number): void {
  if (triggerInFlight.has(connectionId)) return;
  triggerInFlight.add(connectionId);
  (async () => {
    try {
      const [conn] = await db.select().from(emailConnections)
        .where(and(eq(emailConnections.id, connectionId), eq(emailConnections.provider, "gmail")));
      if (!conn) return;
      await syncConnection(conn);
    } catch (e: any) {
      console.warn(`[gmail-index] on-demand sync failed for conn=${connectionId}: ${e?.message ?? e}`);
    } finally {
      triggerInFlight.delete(connectionId);
    }
  })().catch(() => triggerInFlight.delete(connectionId));
}

// ─── Sync now (await result) — used by the "Sincronizza adesso" button ───
// Unlike `triggerConnectionSync`, this awaits the sync and returns the
// outcome so the UI can show a toast and refresh the displayed timestamp.
// If a background sync is already in progress for this connection it waits
// in line behind it (best-effort) to avoid stomping on its writes.
export async function syncConnectionNow(connectionId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  // Wait briefly if another sync is in flight for this connection (the
  // scheduler holds the same lock). We poll up to ~10s; if it's still busy
  // after that, we report "already syncing" so the UI doesn't hang.
  const waitStart = Date.now();
  while (triggerInFlight.has(connectionId) && Date.now() - waitStart < 10_000) {
    await new Promise(r => setTimeout(r, 250));
  }
  if (triggerInFlight.has(connectionId)) {
    return { ok: false, error: "Sincronizzazione già in corso, riprova tra poco." };
  }
  triggerInFlight.add(connectionId);
  try {
    const [conn] = await db.select().from(emailConnections)
      .where(and(eq(emailConnections.id, connectionId), eq(emailConnections.provider, "gmail")));
    if (!conn) return { ok: false, error: "Connessione Gmail non trovata." };
    return await syncConnection(conn);
  } catch (e: any) {
    const message = String(e?.message ?? e ?? "unknown error").slice(0, 500);
    return { ok: false, error: message };
  } finally {
    triggerInFlight.delete(connectionId);
  }
}
