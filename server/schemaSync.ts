import { pool } from "./db";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

async function ensureMissingColumns(): Promise<void> {
  const alterStatements = [
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS latitude TEXT`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS longitude TEXT`,
    `ALTER TABLE salesman_users ADD COLUMN IF NOT EXISTS assigned_countries JSONB`,
    `ALTER TABLE salesman_users ADD COLUMN IF NOT EXISTS parent_salesman_ids INTEGER[]`,
    `ALTER TABLE dealer_companies ADD COLUMN IF NOT EXISTS assigned_countries JSONB`,
    `ALTER TABLE custom_machines ADD COLUMN IF NOT EXISTS titles JSONB`,
    `ALTER TABLE custom_machines ADD COLUMN IF NOT EXISTS descriptions JSONB`,
    `ALTER TABLE machines ADD COLUMN IF NOT EXISTS youtube_links JSONB`,
    `ALTER TABLE machines ADD COLUMN IF NOT EXISTS catalog_links JSONB`,
    `ALTER TABLE machines ADD COLUMN IF NOT EXISTS drive_links JSONB`,
    `ALTER TABLE presets ADD COLUMN IF NOT EXISTS translations JSONB`,
    `ALTER TABLE dealer_presets ADD COLUMN IF NOT EXISTS translations JSONB`,
    `CREATE TABLE IF NOT EXISTS drawing_requests (
      id SERIAL PRIMARY KEY,
      company_id INTEGER,
      offer_id INTEGER,
      customer_id INTEGER NOT NULL,
      requested_by_user_id INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      attachment_filename TEXT,
      attachment_original_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      fulfilled_at TIMESTAMP
    )`,
    `DO $$ BEGIN IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='drawing_requests' AND column_name='offer_id'
        AND is_nullable='NO'
    ) THEN ALTER TABLE drawing_requests ALTER COLUMN offer_id DROP NOT NULL; END IF; END $$`,
    `CREATE TABLE IF NOT EXISTS catalog_imports (
      id SERIAL PRIMARY KEY,
      company_id INTEGER,
      filename TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      imported_at TIMESTAMP DEFAULT NOW() NOT NULL,
      machine_count INTEGER NOT NULL DEFAULT 0,
      option_count INTEGER NOT NULL DEFAULT 0
    )`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS catalog_version_id INTEGER`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS sales_scenario TEXT`,
    `ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS ai_email_enabled BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE email_send_log ADD COLUMN IF NOT EXISTS provider_message_id TEXT`,
    `ALTER TABLE email_send_log ADD COLUMN IF NOT EXISTS provider_thread_id TEXT`,
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS external_id TEXT`,
    `CREATE INDEX IF NOT EXISTS contacts_external_id_idx ON contacts(external_id)`,
    `CREATE TABLE IF NOT EXISTS drawings (
      id SERIAL PRIMARY KEY,
      company_id INTEGER,
      created_by_user_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      pdf_filename TEXT,
      pdf_original_name TEXT,
      dwg_filename TEXT,
      dwg_original_name TEXT,
      offer_id INTEGER,
      request_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS email_attachment_links (
      id SERIAL PRIMARY KEY,
      company_id INTEGER,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      source_message_id TEXT,
      source_attachment_id TEXT,
      source_subject TEXT,
      source_from TEXT,
      uploaded_by_user_id INTEGER,
      uploaded_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `ALTER TABLE email_attachment_links ADD COLUMN IF NOT EXISTS source_message_id TEXT`,
    `ALTER TABLE email_attachment_links ADD COLUMN IF NOT EXISTS source_attachment_id TEXT`,
    `ALTER TABLE email_attachment_links ADD COLUMN IF NOT EXISTS source_subject TEXT`,
    `ALTER TABLE email_attachment_links ADD COLUMN IF NOT EXISTS source_from TEXT`,
    `ALTER TABLE email_attachment_links ADD COLUMN IF NOT EXISTS uploaded_by_user_id INTEGER`,
    `ALTER TABLE drawings ADD COLUMN IF NOT EXISTS job_order_id INTEGER`,
    `ALTER TABLE drawings ADD COLUMN IF NOT EXISTS replaces_drawing_id INTEGER`,
    `CREATE INDEX IF NOT EXISTS drawings_job_order_company_created_idx
      ON drawings(job_order_id, company_id, created_at)`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS crm_info JSONB`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS offer_id INTEGER`,
    `CREATE TABLE IF NOT EXISTS offer_reminders (
      id SERIAL PRIMARY KEY,
      company_id INTEGER,
      offer_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      remind_at TIMESTAMP NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by_user_id INTEGER NOT NULL,
      sent_at TIMESTAMP,
      is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS offer_reminders_offer_id_idx ON offer_reminders(offer_id)`,
    `CREATE INDEX IF NOT EXISTS offer_reminders_due_idx ON offer_reminders(remind_at) WHERE sent_at IS NULL AND is_dismissed = FALSE`,
    `CREATE TABLE IF NOT EXISTS google_drive_settings (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL UNIQUE,
      root_folder_id TEXT,
      root_folder_url TEXT,
      root_folder_name TEXT,
      account_email TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expiry TIMESTAMP,
      scopes TEXT,
      connected_at TIMESTAMP,
      connected_by_user_id INTEGER,
      last_error_message TEXT,
      last_error_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS drive_archive_items (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      offer_id INTEGER,
      offer_version INTEGER,
      local_id INTEGER,
      drive_file_id TEXT,
      drive_file_name TEXT,
      drive_folder_id TEXT,
      drive_folder_url TEXT,
      file_hash TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_synced_at TIMESTAMP,
      next_retry_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS drive_archive_items_offer_idx ON drive_archive_items(offer_id)`,
    `CREATE INDEX IF NOT EXISTS drive_archive_items_company_status_idx ON drive_archive_items(company_id, status)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS drive_archive_items_unique_offer_pdf_idx
      ON drive_archive_items(company_id, offer_id, offer_version)
      WHERE kind = 'offer_pdf'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS drive_archive_items_unique_local_idx
      ON drive_archive_items(company_id, kind, local_id, offer_id, offer_version)
      WHERE kind <> 'offer_pdf' AND local_id IS NOT NULL`,
    `ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS gmail_history_id TEXT`,
    `ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS gmail_index_backfilled_at TIMESTAMP`,
    `ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS gmail_index_last_synced_at TIMESTAMP`,
    `ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS gmail_index_last_error TEXT`,
    `ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS gmail_index_last_error_at TIMESTAMP`,
    `CREATE TABLE IF NOT EXISTS gmail_message_index (
      id SERIAL PRIMARY KEY,
      email_connection_id INTEGER NOT NULL,
      message_id TEXT NOT NULL,
      internal_date TIMESTAMP NOT NULL,
      sender_email TEXT,
      sender_name TEXT,
      sender_domain TEXT,
      subject TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS gmail_message_index_conn_msg_uniq
      ON gmail_message_index(email_connection_id, message_id)`,
    `CREATE INDEX IF NOT EXISTS gmail_message_index_conn_date_idx
      ON gmail_message_index(email_connection_id, internal_date)`,
    // Recap: thread grouping + outbound (SENT) mirror. Added 2026-04 so
    // sent emails appear in the timeline alongside their replies.
    `ALTER TABLE gmail_message_index ADD COLUMN IF NOT EXISTS thread_id TEXT`,
    `ALTER TABLE gmail_message_index ADD COLUMN IF NOT EXISTS direction TEXT`,
    `ALTER TABLE gmail_message_index ADD COLUMN IF NOT EXISTS recipient_email TEXT`,
    `CREATE TABLE IF NOT EXISTS drawing_machines (
      id SERIAL PRIMARY KEY,
      drawing_id INTEGER NOT NULL,
      position_label TEXT,
      extracted_text TEXT NOT NULL,
      matched_machine_id INTEGER,
      confidence NUMERIC(5,4),
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      not_in_catalog BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    // ===== TALENT MANAGEMENT =====
    `CREATE TABLE IF NOT EXISTS talents (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      display_name TEXT NOT NULL,
      real_name TEXT,
      avatar_url TEXT,
      bio TEXT,
      city TEXT,
      country TEXT,
      email TEXT,
      phone TEXT,
      default_commission_pct NUMERIC(5,2) DEFAULT 20,
      tags TEXT[] NOT NULL DEFAULT '{}',
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS talents_company_idx ON talents(company_id)`,
    `CREATE TABLE IF NOT EXISTS talent_socials (
      id SERIAL PRIMARY KEY,
      talent_id INTEGER NOT NULL REFERENCES talents(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      handle TEXT NOT NULL,
      profile_url TEXT,
      followers INTEGER DEFAULT 0,
      engagement_pct NUMERIC(5,2),
      stats_updated_at TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS talent_socials_talent_idx ON talent_socials(talent_id)`,
    `CREATE TABLE IF NOT EXISTS talent_rates (
      id SERIAL PRIMARY KEY,
      talent_id INTEGER NOT NULL REFERENCES talents(id) ON DELETE CASCADE,
      deliverable_type TEXT NOT NULL,
      base_price_eur NUMERIC(12,2) NOT NULL DEFAULT 0,
      notes TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS talent_rates_talent_idx ON talent_rates(talent_id)`,
    `CREATE TABLE IF NOT EXISTS talent_documents (
      id SERIAL PRIMARY KEY,
      talent_id INTEGER NOT NULL REFERENCES talents(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      kind TEXT,
      label TEXT,
      uploaded_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS talent_documents_talent_idx ON talent_documents(talent_id)`,
    // Ensure FK + cascade exist on already-created tables (idempotent: warns on duplicate)
    `ALTER TABLE talent_socials ADD CONSTRAINT talent_socials_talent_fk
      FOREIGN KEY (talent_id) REFERENCES talents(id) ON DELETE CASCADE`,
    `ALTER TABLE talent_rates ADD CONSTRAINT talent_rates_talent_fk
      FOREIGN KEY (talent_id) REFERENCES talents(id) ON DELETE CASCADE`,
    `ALTER TABLE talent_documents ADD CONSTRAINT talent_documents_talent_fk
      FOREIGN KEY (talent_id) REFERENCES talents(id) ON DELETE CASCADE`,
    // ===== PREVENTIVI / CAMPAGNE =====
    `CREATE TABLE IF NOT EXISTS talent_quotes (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      reference_number TEXT NOT NULL,
      brand_customer_id INTEGER NOT NULL,
      brand_contact_id INTEGER,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      date TIMESTAMP DEFAULT NOW() NOT NULL,
      sent_at TIMESTAMP,
      accepted_at TIMESTAMP,
      rejected_at TIMESTAMP,
      valid_until TIMESTAMP,
      payment_terms TEXT,
      notes TEXT,
      internal_notes TEXT,
      campaign_id INTEGER,
      total_eur NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_by_user_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS talent_quotes_company_idx ON talent_quotes(company_id)`,
    `CREATE INDEX IF NOT EXISTS talent_quotes_brand_idx ON talent_quotes(brand_customer_id)`,
    `CREATE TABLE IF NOT EXISTS talent_quote_items (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      quote_id INTEGER NOT NULL REFERENCES talent_quotes(id) ON DELETE CASCADE,
      talent_id INTEGER NOT NULL,
      talent_name TEXT NOT NULL,
      deliverable_type TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price_eur NUMERIC(12,2) NOT NULL DEFAULT 0,
      discount_pct NUMERIC(5,2) DEFAULT 0,
      notes TEXT,
      position INTEGER NOT NULL DEFAULT 0
    )`,
    `ALTER TABLE talent_quote_items ADD COLUMN IF NOT EXISTS company_id INTEGER`,
    `UPDATE talent_quote_items i SET company_id = q.company_id FROM talent_quotes q WHERE i.quote_id = q.id AND i.company_id IS NULL`,
    `ALTER TABLE talent_quote_items ALTER COLUMN company_id SET NOT NULL`,
    `CREATE INDEX IF NOT EXISTS talent_quote_items_quote_idx ON talent_quote_items(quote_id)`,
    `CREATE INDEX IF NOT EXISTS talent_quote_items_company_idx ON talent_quote_items(company_id)`,
    `CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      brand_customer_id INTEGER NOT NULL,
      brand_contact_id INTEGER,
      quote_id INTEGER,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'briefing',
      start_date TIMESTAMP,
      end_date TIMESTAMP,
      total_value_eur NUMERIC(12,2) NOT NULL DEFAULT 0,
      notes TEXT,
      created_by_user_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS campaigns_company_idx ON campaigns(company_id)`,
    `CREATE INDEX IF NOT EXISTS campaigns_brand_idx ON campaigns(brand_customer_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS campaigns_company_code_uniq ON campaigns(company_id, code)`,
    `CREATE TABLE IF NOT EXISTS campaign_deliverables (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      talent_id INTEGER NOT NULL,
      talent_name TEXT NOT NULL,
      deliverable_type TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price_eur NUMERIC(12,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'briefing',
      planned_date TIMESTAMP,
      published_date TIMESTAMP,
      post_url TEXT,
      notes TEXT,
      attachments JSONB DEFAULT '[]'::jsonb,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `ALTER TABLE campaign_deliverables ADD COLUMN IF NOT EXISTS company_id INTEGER`,
    `UPDATE campaign_deliverables d SET company_id = c.company_id FROM campaigns c WHERE d.campaign_id = c.id AND d.company_id IS NULL`,
    `ALTER TABLE campaign_deliverables ALTER COLUMN company_id SET NOT NULL`,
    `CREATE INDEX IF NOT EXISTS campaign_deliverables_campaign_idx ON campaign_deliverables(campaign_id)`,
    `CREATE INDEX IF NOT EXISTS campaign_deliverables_talent_idx ON campaign_deliverables(talent_id)`,
    `CREATE INDEX IF NOT EXISTS campaign_deliverables_company_idx ON campaign_deliverables(company_id)`,
    `CREATE TABLE IF NOT EXISTS deliverable_metrics (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      deliverable_id INTEGER NOT NULL UNIQUE REFERENCES campaign_deliverables(id) ON DELETE CASCADE,
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      saves INTEGER DEFAULT 0,
      reach INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `ALTER TABLE deliverable_metrics ADD COLUMN IF NOT EXISTS company_id INTEGER`,
    `UPDATE deliverable_metrics m SET company_id = d.company_id FROM campaign_deliverables d WHERE m.deliverable_id = d.id AND m.company_id IS NULL`,
    `ALTER TABLE deliverable_metrics ALTER COLUMN company_id SET NOT NULL`,
    `CREATE INDEX IF NOT EXISTS deliverable_metrics_company_idx ON deliverable_metrics(company_id)`,
    `CREATE TABLE IF NOT EXISTS campaign_payments_in (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      amount_eur NUMERIC(12,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'to_invoice',
      due_date TIMESTAMP,
      paid_date TIMESTAMP,
      invoice_ref TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `ALTER TABLE campaign_payments_in ADD COLUMN IF NOT EXISTS company_id INTEGER`,
    `UPDATE campaign_payments_in p SET company_id = c.company_id FROM campaigns c WHERE p.campaign_id = c.id AND p.company_id IS NULL`,
    `ALTER TABLE campaign_payments_in ALTER COLUMN company_id SET NOT NULL`,
    `CREATE INDEX IF NOT EXISTS campaign_payments_in_campaign_idx ON campaign_payments_in(campaign_id)`,
    `CREATE INDEX IF NOT EXISTS campaign_payments_in_company_idx ON campaign_payments_in(company_id)`,
    `CREATE TABLE IF NOT EXISTS campaign_payments_out (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      talent_id INTEGER NOT NULL,
      amount_eur NUMERIC(12,2) NOT NULL DEFAULT 0,
      commission_pct NUMERIC(5,2) DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'to_pay',
      paid_date TIMESTAMP,
      method TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    `ALTER TABLE campaign_payments_out ADD COLUMN IF NOT EXISTS company_id INTEGER`,
    `UPDATE campaign_payments_out p SET company_id = c.company_id FROM campaigns c WHERE p.campaign_id = c.id AND p.company_id IS NULL`,
    `ALTER TABLE campaign_payments_out ALTER COLUMN company_id SET NOT NULL`,
    `CREATE INDEX IF NOT EXISTS campaign_payments_out_campaign_idx ON campaign_payments_out(campaign_id)`,
    `CREATE INDEX IF NOT EXISTS campaign_payments_out_talent_idx ON campaign_payments_out(talent_id)`,
    `CREATE INDEX IF NOT EXISTS campaign_payments_out_company_idx ON campaign_payments_out(company_id)`,
  ];

  for (const stmt of alterStatements) {
    try {
      await pool.query(stmt);
    } catch (e: any) {
      const isSetNotNull = /SET\s+NOT\s+NULL/i.test(stmt);
      if (isSetNotNull) {
        const tableMatch = stmt.match(/ALTER TABLE\s+(\w+)/i);
        const colMatch = stmt.match(/ALTER COLUMN\s+(\w+)/i);
        const table = tableMatch?.[1] ?? "?";
        const column = colMatch?.[1] ?? "?";
        let orphanCount: number | string = "?";
        try {
          const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${column} IS NULL`);
          orphanCount = r.rows?.[0]?.n ?? "?";
        } catch {
          // ignore counting failures
        }
        console.error(
          `[schema] FAIL: SET NOT NULL on ${table}.${column} failed (${orphanCount} orphan row(s) with NULL). Backfill missed parent rows. Error: ${e.message}`,
        );
      } else {
        console.warn(`[schema] Warning adding column: ${e.message}`);
      }
    }
  }
  console.log(`[schema] ensureMissingColumns complete (${alterStatements.length} checked)`);
}

export async function runSchemaSync(): Promise<void> {
  try {
    let migrationsFolder: string;
    if (process.env.NODE_ENV === "production") {
      migrationsFolder = path.resolve("migrations");
    } else {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      migrationsFolder = path.resolve(currentDir, "..", "migrations");
    }

    const tablesResult = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies')`
    );
    const tablesExist = tablesResult.rows[0]?.exists;

    if (!tablesExist) {
      console.log("[schema] Fresh database detected, creating tables...");

      const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
      if (fs.existsSync(journalPath)) {
        const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));

        for (const entry of journal.entries) {
          const sqlFile = path.join(migrationsFolder, `${entry.tag}.sql`);
          if (!fs.existsSync(sqlFile)) continue;

          let sql = fs.readFileSync(sqlFile, "utf-8");
          sql = sql.replace(/CREATE TABLE /g, "CREATE TABLE IF NOT EXISTS ");

          const statements = sql
            .split("--> statement-breakpoint")
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);

          for (const stmt of statements) {
            try {
              await pool.query(stmt);
            } catch (e: any) {
              if (e.code !== "42P07") {
                console.warn(`[schema] Warning executing statement: ${e.message}`);
              }
            }
          }
        }

        console.log("[schema] Initial migration complete");
      } else {
        console.log("[schema] No migration files found, skipping initial migration");
      }
    } else {
      console.log("[schema] Database tables already exist, skipping initial migration");
    }

    await ensureMissingColumns();

    console.log("[schema] Schema sync complete");
  } catch (e) {
    console.error("[schema] Schema sync failed:", e);
    throw e;
  }
}
