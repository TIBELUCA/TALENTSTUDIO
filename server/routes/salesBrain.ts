import { Router } from "express";
import { requireSalesRole, isMaster } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { aiRateLimiter } from "../middlewares/rateLimiter";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  machineUsageStats,
  optionUsageStats,
  pricingDistributions,
  offerPatterns,
  salesInsights,
} from "@shared/schema";
import { refreshAllAnalytics } from "../services";

const router = Router();

router.get("/api/sales-brain/insights", requireSalesRole, asyncHandler(async (_req, res) => {
  const rows = await db.select().from(salesInsights);
  res.json(rows);
}));

router.get("/api/sales-brain/machine-stats", requireSalesRole, asyncHandler(async (req, res) => {
  const macroType = typeof req.query.macroType === "string" ? req.query.macroType : undefined;

  let query = db.select().from(machineUsageStats);
  if (macroType) {
    query = query.where(eq(machineUsageStats.macroType, macroType)) as typeof query;
  }
  const rows = await query;
  res.json(rows);
}));

router.get("/api/sales-brain/option-stats/:machineId", requireSalesRole, asyncHandler(async (req, res) => {
  const machineId = parseInt(String(req.params.machineId), 10);
  if (isNaN(machineId)) {
    return res.status(400).json({ message: "Invalid machineId" });
  }
  const rows = await db.select().from(optionUsageStats).where(eq(optionUsageStats.machineId, machineId));
  res.json(rows);
}));

router.get("/api/sales-brain/pricing/:machineId", requireSalesRole, asyncHandler(async (req, res) => {
  const machineId = parseInt(String(req.params.machineId), 10);
  if (isNaN(machineId)) {
    return res.status(400).json({ message: "Invalid machineId" });
  }
  const rows = await db.select().from(pricingDistributions).where(eq(pricingDistributions.machineId, machineId));
  res.json(rows.length > 0 ? rows[0] : null);
}));

router.get("/api/sales-brain/patterns", requireSalesRole, asyncHandler(async (req, res) => {
  const type = typeof req.query.type === "string" ? req.query.type : undefined;

  let query = db.select().from(offerPatterns);
  if (type) {
    query = query.where(eq(offerPatterns.patternType, type)) as typeof query;
  }
  const rows = await query;
  res.json(rows);
}));

router.post("/api/sales-brain/refresh", requireSalesRole, aiRateLimiter, asyncHandler(async (req, res) => {
  if (!isMaster(req)) {
    return res.status(403).json({ message: "Master access required for full refresh" });
  }
  await refreshAllAnalytics();
  res.json({ success: true, refreshedAt: new Date().toISOString() });
}));

router.get("/api/sales-brain/quote-context", requireSalesRole, asyncHandler(async (req, res) => {
  const machineIdsParam = req.query.machineIds;
  const machineIdsSchema = z.preprocess(
    (val) => (typeof val === "string" ? val.split(",").map(Number) : Array.isArray(val) ? (val as string[]).map(Number) : []),
    z.array(z.number().int().positive())
  );
  const parsed = machineIdsSchema.safeParse(machineIdsParam);
  if (!parsed.success || parsed.data.length === 0) {
    return res.status(400).json({ message: "machineIds query parameter required (comma-separated integers)" });
  }

  const machineIds = parsed.data;

  const pgArray = `{${machineIds.join(",")}}`;

  const stats = await db
    .select()
    .from(machineUsageStats)
    .where(sql`${machineUsageStats.machineId} = any(${pgArray}::int[])`);

  const pricing = await db
    .select()
    .from(pricingDistributions)
    .where(sql`${pricingDistributions.machineId} = any(${pgArray}::int[])`);

  const commonOptions = await db
    .select()
    .from(optionUsageStats)
    .where(sql`${optionUsageStats.machineId} = any(${pgArray}::int[])`);

  res.json({
    machineStats: stats,
    pricingDistributions: pricing,
    commonOptions,
  });
}));

export default router;
