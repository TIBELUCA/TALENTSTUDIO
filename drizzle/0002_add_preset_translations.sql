ALTER TABLE "presets" ADD COLUMN IF NOT EXISTS "translations" jsonb;
ALTER TABLE "dealer_presets" ADD COLUMN IF NOT EXISTS "translations" jsonb;
