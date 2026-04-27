import { Router } from "express";
import { db, eq, and, sql, desc } from "../repositories/base";
import { bankConnections, bankAccounts, bankBalanceSnapshots, bankTransactions } from "@shared/schema";
import { requireRole } from "../middlewares/auth";
import { getSalesmanId } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import crypto from "crypto";

const router = Router();

const FINANCE_ROLES = ["master", "amministrazione"] as const;
const requireFinanceAccess = requireRole(...FINANCE_ROLES);

const ENCRYPTION_KEY = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;

function ensureEncryptionKey(): string {
  if (!ENCRYPTION_KEY) {
    throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY environment variable is required for banking token encryption");
  }
  return ENCRYPTION_KEY;
}

function encrypt(text: string): string {
  const encKey = ensureEncryptionKey();
  const key = crypto.scryptSync(encKey, "banking-salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text: string): string {
  const encKey = ensureEncryptionKey();
  const key = crypto.scryptSync(encKey, "banking-salt", 32);
  const [ivHex, encryptedHex] = text.split(":");
  if (!ivHex || !encryptedHex) return text;
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function createSignedState(data: Record<string, any>): string {
  const encKey = ensureEncryptionKey();
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = JSON.stringify({ ...data, nonce, ts: Date.now() });
  const hmac = crypto.createHmac("sha256", encKey).update(payload).digest("hex");
  return Buffer.from(JSON.stringify({ p: payload, s: hmac })).toString("base64url");
}

function verifySignedState(state: string, maxAgeMs = 600000): Record<string, any> | null {
  try {
    const encKey = ensureEncryptionKey();
    const { p, s } = JSON.parse(Buffer.from(state, "base64url").toString());
    const expectedHmac = crypto.createHmac("sha256", encKey).update(p).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expectedHmac))) return null;
    const data = JSON.parse(p);
    if (Date.now() - data.ts > maxAgeMs) return null;
    return data;
  } catch {
    return null;
  }
}

function getBaseUrl(req: any): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

const TL_AUTH_URL = "https://auth.truelayer.com";
const TL_API_URL = "https://api.truelayer.com";
const TL_AUTH_URL_SANDBOX = "https://auth.truelayer-sandbox.com";
const TL_API_URL_SANDBOX = "https://api.truelayer-sandbox.com";

function isSandbox(): boolean {
  return process.env.TRUELAYER_SANDBOX === "true";
}

function getAuthBaseUrl(): string {
  return isSandbox() ? TL_AUTH_URL_SANDBOX : TL_AUTH_URL;
}

function getApiBaseUrl(): string {
  return isSandbox() ? TL_API_URL_SANDBOX : TL_API_URL;
}

router.get("/api/finance/oauth/start", requireFinanceAccess, asyncHandler(async (req, res) => {
  const clientId = process.env.TRUELAYER_CLIENT_ID;
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw AppError.badRequest("TrueLayer credentials not configured. Set TRUELAYER_CLIENT_ID and TRUELAYER_CLIENT_SECRET.");
  }

  const userId = getSalesmanId(req);
  if (!userId) throw AppError.badRequest("User ID not found in session");

  const state = createSignedState({ userId });
  const redirectUri = `${getBaseUrl(req)}/api/finance/oauth/callback`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "info accounts balance transactions offline_access",
    redirect_uri: redirectUri,
    state,
    providers: "uk-ob-all uk-oauth-all it-ob-all de-ob-all fr-ob-all es-ob-all eu-ob-all",
  });

  const url = `${getAuthBaseUrl()}/?${params}`;
  res.json({ url });
}));

router.get("/api/finance/oauth/callback", asyncHandler(async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    console.error("[finance] OAuth error:", error);
    return res.redirect("/finance/accounts?error=auth_failed");
  }

  if (!code || !state) {
    return res.redirect("/finance/accounts?error=missing_params");
  }

  const parsed = verifySignedState(state);
  if (!parsed || !parsed.userId) {
    return res.redirect("/finance/accounts?error=invalid_state");
  }

  const clientId = process.env.TRUELAYER_CLIENT_ID!;
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET!;
  const redirectUri = `${getBaseUrl(req)}/api/finance/oauth/callback`;

  const tokenResp = await fetch(`${getAuthBaseUrl()}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    console.error("[finance] Token exchange failed:", errBody);
    return res.redirect("/finance/accounts?error=token_exchange");
  }

  const tokens: any = await tokenResp.json();

  const [connection] = await db.insert(bankConnections).values({
    provider: "truelayer",
    userId: parsed.userId,
    accessToken: encrypt(tokens.access_token),
    refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    tokenExpiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    status: "active",
  }).returning();

  try {
    await fetchAndStoreAccounts(connection.id, tokens.access_token);
  } catch (e) {
    console.error("[finance] Failed to fetch accounts after connection:", e);
  }

  res.redirect("/finance/accounts?connected=true");
}));

async function getValidAccessToken(conn: any): Promise<string> {
  const isExpired = conn.tokenExpiry && new Date(conn.tokenExpiry) <= new Date();
  if (!isExpired) {
    return decrypt(conn.accessToken);
  }

  if (!conn.refreshToken) {
    throw new Error("Token expired and no refresh token available");
  }

  const clientId = process.env.TRUELAYER_CLIENT_ID!;
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET!;

  const resp = await fetch(`${getAuthBaseUrl()}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decrypt(conn.refreshToken),
    }),
  });

  if (!resp.ok) {
    await db.update(bankConnections).set({ status: "expired", updatedAt: new Date() }).where(eq(bankConnections.id, conn.id));
    throw new Error("Failed to refresh TrueLayer token");
  }

  const tokens: any = await resp.json();

  await db.update(bankConnections).set({
    accessToken: encrypt(tokens.access_token),
    refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : conn.refreshToken,
    tokenExpiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    status: "active",
    updatedAt: new Date(),
  }).where(eq(bankConnections.id, conn.id));

  return tokens.access_token;
}

async function fetchAndStoreAccounts(connectionId: number, accessToken: string): Promise<void> {
  const resp = await fetch(`${getApiBaseUrl()}/data/v1/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch accounts: ${resp.status}`);
  }

  const data: any = await resp.json();
  const results = data.results || [];

  for (const acct of results) {
    const existing = await db.select().from(bankAccounts)
      .where(and(
        eq(bankAccounts.connectionId, connectionId),
        eq(bankAccounts.providerAccountId, acct.account_id),
      ))
      .limit(1);

    if (existing.length > 0) {
      await db.update(bankAccounts).set({
        bankName: acct.provider?.display_name || acct.provider?.provider_id || null,
        accountName: acct.display_name || null,
        iban: acct.account_number?.iban || null,
        currency: acct.currency || null,
        accountType: acct.account_type || null,
        updatedAt: new Date(),
      }).where(eq(bankAccounts.id, existing[0].id));
    } else {
      await db.insert(bankAccounts).values({
        connectionId,
        providerAccountId: acct.account_id,
        bankName: acct.provider?.display_name || acct.provider?.provider_id || null,
        accountName: acct.display_name || null,
        iban: acct.account_number?.iban || null,
        currency: acct.currency || null,
        accountType: acct.account_type || null,
      });
    }
  }
}

async function fetchAndStoreBalances(bankAccountId: number, providerAccountId: string, accessToken: string): Promise<void> {
  const resp = await fetch(`${getApiBaseUrl()}/data/v1/accounts/${providerAccountId}/balance`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Failed to fetch balances (${resp.status}): ${errText}`);
  }

  const data: any = await resp.json();
  const results = data.results || [];

  for (const bal of results) {
    await db.insert(bankBalanceSnapshots).values({
      bankAccountId,
      currentBalance: bal.current?.toString() || null,
      availableBalance: bal.available?.toString() || null,
      currency: bal.currency || null,
    });
  }
}

async function fetchAndStoreTransactions(bankAccountId: number, providerAccountId: string, accessToken: string): Promise<void> {
  const now = new Date();
  const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fromStr = from.toISOString().split("T")[0];
  const toStr = now.toISOString().split("T")[0];

  const resp = await fetch(
    `${getApiBaseUrl()}/data/v1/accounts/${providerAccountId}/transactions?from=${fromStr}&to=${toStr}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Failed to fetch transactions (${resp.status}): ${errText}`);
  }

  const data: any = await resp.json();
  const results = data.results || [];

  for (const tx of results) {
    const existing = await db.select().from(bankTransactions)
      .where(and(
        eq(bankTransactions.bankAccountId, bankAccountId),
        eq(bankTransactions.providerTransactionId, tx.transaction_id),
      ))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(bankTransactions).values({
        bankAccountId,
        providerTransactionId: tx.transaction_id || null,
        transactionDate: tx.timestamp ? new Date(tx.timestamp) : null,
        amount: tx.amount?.toString() || null,
        currency: tx.currency || null,
        description: tx.description || tx.meta?.provider_transaction_category || null,
        reference: tx.transaction_reference || null,
        counterpartyName: tx.merchant_name || tx.meta?.provider_merchant_name || null,
        rawPayload: tx,
      });
    }
  }
}

router.get("/api/finance/accounts", requireFinanceAccess, asyncHandler(async (req, res) => {
  const userId = getSalesmanId(req);
  if (!userId) throw AppError.badRequest("User ID not found");

  const connections = await db.select().from(bankConnections)
    .where(eq(bankConnections.userId, userId));

  const connectionIds = connections.map(c => c.id);

  let accounts: any[] = [];
  if (connectionIds.length > 0) {
    accounts = await db.execute(sql`
      SELECT ba.*,
        (SELECT row_to_json(bs) FROM (
          SELECT current_balance, available_balance, currency, fetched_at
          FROM bank_balance_snapshots
          WHERE bank_account_id = ba.id
          ORDER BY fetched_at DESC
          LIMIT 1
        ) bs) as latest_balance
      FROM bank_accounts ba
      WHERE ba.connection_id = ANY(ARRAY[${sql.join(connectionIds.map(id => sql`${id}`), sql`, `)}]::int[])
      ORDER BY ba.bank_name, ba.account_name
    `);
  }

  res.json({
    connections: connections.map(c => ({
      id: c.id,
      provider: c.provider,
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    accounts,
  });
}));

router.get("/api/finance/accounts/:accountId", requireFinanceAccess, asyncHandler(async (req, res) => {
  const accountId = Number(req.params.accountId);
  if (isNaN(accountId)) throw AppError.badRequest("Invalid account ID");

  const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId));
  if (!account) throw AppError.notFound("Bank account");

  const [connection] = await db.select().from(bankConnections).where(eq(bankConnections.id, account.connectionId));
  if (!connection) throw AppError.notFound("Bank connection");

  const userId = getSalesmanId(req);
  if (connection.userId !== userId) throw AppError.forbidden("Not authorized for this account");

  const balances = await db.select().from(bankBalanceSnapshots)
    .where(eq(bankBalanceSnapshots.bankAccountId, accountId))
    .orderBy(desc(bankBalanceSnapshots.fetchedAt))
    .limit(1);

  const transactions = await db.select().from(bankTransactions)
    .where(eq(bankTransactions.bankAccountId, accountId))
    .orderBy(desc(bankTransactions.transactionDate))
    .limit(200);

  res.json({
    account,
    balance: balances[0] || null,
    transactions,
    connectionStatus: connection.status,
  });
}));

router.post("/api/finance/accounts/:accountId/refresh", requireFinanceAccess, asyncHandler(async (req, res) => {
  const accountId = Number(req.params.accountId);
  if (isNaN(accountId)) throw AppError.badRequest("Invalid account ID");

  const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId));
  if (!account) throw AppError.notFound("Bank account");

  const [connection] = await db.select().from(bankConnections).where(eq(bankConnections.id, account.connectionId));
  if (!connection) throw AppError.notFound("Bank connection");

  const userId = getSalesmanId(req);
  if (connection.userId !== userId) throw AppError.forbidden("Not authorized");

  const accessToken = await getValidAccessToken(connection);

  const errors: string[] = [];
  try {
    await fetchAndStoreBalances(account.id, account.providerAccountId, accessToken);
  } catch (e: any) {
    errors.push(`Saldi: ${e.message}`);
  }
  try {
    await fetchAndStoreTransactions(account.id, account.providerAccountId, accessToken);
  } catch (e: any) {
    errors.push(`Movimenti: ${e.message}`);
  }

  res.json({ success: errors.length === 0, errors });
}));

router.post("/api/finance/refresh-all", requireFinanceAccess, asyncHandler(async (req, res) => {
  const userId = getSalesmanId(req);
  if (!userId) throw AppError.badRequest("User ID not found");

  const connections = await db.select().from(bankConnections)
    .where(and(eq(bankConnections.userId, userId), eq(bankConnections.status, "active")));

  let refreshedCount = 0;
  let errorCount = 0;

  for (const conn of connections) {
    try {
      const accessToken = await getValidAccessToken(conn);

      await fetchAndStoreAccounts(conn.id, accessToken);

      const accounts = await db.select().from(bankAccounts)
        .where(eq(bankAccounts.connectionId, conn.id));

      for (const acct of accounts) {
        await fetchAndStoreBalances(acct.id, acct.providerAccountId, accessToken);
        await fetchAndStoreTransactions(acct.id, acct.providerAccountId, accessToken);
      }
      refreshedCount++;
    } catch (e) {
      console.error(`[finance] Failed to refresh connection ${conn.id}:`, e);
      errorCount++;
    }
  }

  res.json({ refreshed: refreshedCount, errors: errorCount });
}));

router.delete("/api/finance/connections/:id", requireFinanceAccess, asyncHandler(async (req, res) => {
  const connId = Number(req.params.id);
  if (isNaN(connId)) throw AppError.badRequest("Invalid connection ID");

  const [connection] = await db.select().from(bankConnections).where(eq(bankConnections.id, connId));
  if (!connection) throw AppError.notFound("Connection");

  const userId = getSalesmanId(req);
  if (connection.userId !== userId) throw AppError.forbidden("Not authorized");

  const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.connectionId, connId));
  for (const acct of accounts) {
    await db.delete(bankTransactions).where(eq(bankTransactions.bankAccountId, acct.id));
    await db.delete(bankBalanceSnapshots).where(eq(bankBalanceSnapshots.bankAccountId, acct.id));
  }
  await db.delete(bankAccounts).where(eq(bankAccounts.connectionId, connId));
  await db.delete(bankConnections).where(eq(bankConnections.id, connId));

  res.json({ success: true });
}));

export default router;
