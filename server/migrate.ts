import { db, eq, sql } from "./repositories/base";
import { dealerUsers, dealerCompanies } from "@shared/schema";

export async function runAuditLogMigration(): Promise<void> {
  try {
    await db.execute(sql`ALTER TABLE "job_orders" ADD COLUMN IF NOT EXISTS "audit_log" jsonb DEFAULT '[]'::jsonb`);
  } catch (e) {
    console.error("[migrate] Failed to add audit_log column:", e);
  }
}

export async function runOfferLanguageMigration(): Promise<void> {
  try {
    await db.execute(sql`ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "language" text NOT NULL DEFAULT 'it'`);
  } catch (e) {
    console.error("[migrate] Failed to add offers.language column:", e);
  }
}

export async function runInvoicingMigration(): Promise<void> {
  try {
    await db.execute(sql`ALTER TABLE "job_orders" ADD COLUMN IF NOT EXISTS "invoicing" jsonb DEFAULT '[]'::jsonb`);
  } catch (e) {
    console.error("[migrate] Failed to add invoicing column:", e);
  }
}

export async function runDealerCompanyMigration(): Promise<void> {
  const contacts = await db.select().from(dealerUsers).where(sql`${dealerUsers.dealerCompanyId} IS NULL`);
  for (const contact of contacts) {
    const [company] = await db.insert(dealerCompanies).values({
      companyId: contact.companyId ?? undefined,
      companyName: `${contact.name} ${contact.surname}`.trim() || contact.email,
      address: "",
      vatNumber: "",
      state: "",
      city: "",
      postalCode: "",
      email: contact.email,
      phone: contact.mobileNumber ?? "",
      notes: "",
      linkedSalesmanId: contact.linkedSalesmanId ?? null,
      isActive: contact.isActive,
    }).returning();
    await db.update(dealerUsers).set({ dealerCompanyId: company.id }).where(eq(dealerUsers.id, contact.id));
  }
  if (contacts.length > 0) {
    console.log(`[migrate] Created ${contacts.length} dealer company record(s) from legacy contacts`);
  }
}

export async function runBankingMigration(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "bank_connections" (
        "id" serial PRIMARY KEY,
        "provider" text NOT NULL DEFAULT 'truelayer',
        "user_id" integer NOT NULL,
        "access_token" text NOT NULL,
        "refresh_token" text,
        "token_expiry" timestamp,
        "status" text NOT NULL DEFAULT 'active',
        "provider_user_reference" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "bank_accounts" (
        "id" serial PRIMARY KEY,
        "connection_id" integer NOT NULL,
        "provider_account_id" text NOT NULL,
        "bank_name" text,
        "account_name" text,
        "iban" text,
        "currency" text,
        "account_type" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "bank_balance_snapshots" (
        "id" serial PRIMARY KEY,
        "bank_account_id" integer NOT NULL,
        "current_balance" numeric(18,2),
        "available_balance" numeric(18,2),
        "currency" text,
        "fetched_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "bank_transactions" (
        "id" serial PRIMARY KEY,
        "bank_account_id" integer NOT NULL,
        "provider_transaction_id" text,
        "transaction_date" timestamp,
        "amount" numeric(18,2),
        "currency" text,
        "description" text,
        "reference" text,
        "counterparty_name" text,
        "raw_payload" jsonb,
        "fetched_at" timestamp NOT NULL DEFAULT now()
      )
    `);
  } catch (e) {
    console.error("[migrate] Failed to create banking tables:", e);
  }
}

export async function runEmailConnectionsMigration(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "email_connections" (
        "id" serial PRIMARY KEY,
        "salesman_user_id" integer,
        "dealer_user_id" integer,
        "provider" text NOT NULL,
        "provider_account_email" text,
        "access_token" text NOT NULL,
        "refresh_token" text,
        "token_expiry" timestamp,
        "scopes" text,
        "is_default" boolean DEFAULT false,
        "sender_display_name" text,
        "signature" text,
        "connected_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "email_send_log" (
        "id" serial PRIMARY KEY,
        "salesman_user_id" integer,
        "dealer_user_id" integer,
        "provider" text NOT NULL,
        "recipient" text NOT NULL,
        "cc" text,
        "subject" text NOT NULL,
        "offer_id" integer,
        "job_order_id" integer,
        "customer_id" integer,
        "interaction_id" integer,
        "sent_at" timestamp NOT NULL DEFAULT now()
      )
    `);
  } catch (e) {
    console.error("[migrate] Failed to create email tables:", e);
  }
}
