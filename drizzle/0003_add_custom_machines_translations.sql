ALTER TABLE "custom_machines" ADD COLUMN IF NOT EXISTS "titles" jsonb;
ALTER TABLE "custom_machines" ADD COLUMN IF NOT EXISTS "descriptions" jsonb;
