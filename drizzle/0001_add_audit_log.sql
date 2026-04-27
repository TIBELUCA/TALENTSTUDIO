ALTER TABLE "job_orders" ADD COLUMN IF NOT EXISTS "audit_log" jsonb DEFAULT '[]'::jsonb;
