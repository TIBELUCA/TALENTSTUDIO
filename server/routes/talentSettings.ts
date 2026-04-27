import { Router } from "express";
import { z } from "zod";
import { db, eq, and } from "../repositories/base";
import { settings } from "@shared/schema";
import { requireSalesRole, requireMaster } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();

function paymentsKey(companyId: number): string {
  return `payments_module_enabled:${companyId}`;
}

export async function getPaymentsEnabled(companyId: number): Promise<boolean> {
  const rows = await db.select().from(settings).where(eq(settings.key, paymentsKey(companyId)));
  if (!rows.length || !rows[0].value) return false;
  return (rows[0].value as any).enabled === true;
}

async function setPaymentsEnabled(companyId: number, enabled: boolean): Promise<void> {
  const key = paymentsKey(companyId);
  const rows = await db.select().from(settings).where(eq(settings.key, key));
  if (rows.length > 0) {
    await db.update(settings).set({ value: { enabled } as any, companyId }).where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, companyId, value: { enabled } as any });
  }
}

router.get("/api/talent-settings", requireSalesRole, asyncHandler(async (req, res) => {
  const paymentsEnabled = await getPaymentsEnabled(req.companyId);
  res.json({ paymentsEnabled });
}));

router.put("/api/talent-settings/payments", requireMaster, asyncHandler(async (req, res) => {
  const enabled = z.boolean().parse(req.body?.enabled);
  await setPaymentsEnabled(req.companyId, enabled);
  res.json({ paymentsEnabled: enabled });
}));

export default router;
