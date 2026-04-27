import { db } from "../../../db";
import { desc } from "drizzle-orm";
import {
  machineUsageStats,
  pricingDistributions,
  offerPatterns,
  salesInsights,
  type SalesInsight,
} from "@shared/schema";

export async function generateInsights(): Promise<SalesInsight[]> {
  await db.delete(salesInsights);

  const results: SalesInsight[] = [];

  const topMachines = await generateTopMachinesInsight();
  if (topMachines) results.push(topMachines);

  const pricingTrend = await generatePricingTrendInsight();
  if (pricingTrend) results.push(pricingTrend);

  const commonConfigs = await generateCommonConfigsInsight();
  if (commonConfigs) results.push(commonConfigs);

  return results;
}

async function generateTopMachinesInsight(): Promise<SalesInsight | null> {
  const topMachines = await db
    .select()
    .from(machineUsageStats)
    .orderBy(desc(machineUsageStats.usageCount))
    .limit(10);

  if (topMachines.length === 0) return null;

  const totalUsage = topMachines.reduce((sum, m) => sum + m.usageCount, 0);
  const confidence = Math.min(totalUsage / 100, 1).toFixed(4);

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 7);

  const [inserted] = await db
    .insert(salesInsights)
    .values({
      insightType: "top_machines",
      insightData: {
        machines: topMachines.map((m) => ({
          machineId: m.machineId,
          machineName: m.machineName,
          macroType: m.macroType,
          usageCount: m.usageCount,
          avgPrice: m.avgPrice,
          totalRevenue: m.totalRevenue,
        })),
        totalSamples: totalUsage,
      },
      confidence,
      computedAt: new Date(),
      validUntil,
    })
    .returning();

  return inserted;
}

async function generatePricingTrendInsight(): Promise<SalesInsight | null> {
  const distributions = await db
    .select()
    .from(pricingDistributions)
    .orderBy(desc(pricingDistributions.sampleCount))
    .limit(10);

  if (distributions.length === 0) return null;

  const totalSamples = distributions.reduce((sum, d) => sum + d.sampleCount, 0);
  const confidence = Math.min(totalSamples / 50, 1).toFixed(4);

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 7);

  const [inserted] = await db
    .insert(salesInsights)
    .values({
      insightType: "pricing_trend",
      insightData: {
        distributions: distributions.map((d) => ({
          machineId: d.machineId,
          machineName: d.machineName,
          minPrice: d.minPrice,
          maxPrice: d.maxPrice,
          avgPrice: d.avgPrice,
          medianPrice: d.medianPrice,
          sampleCount: d.sampleCount,
        })),
        totalSamples,
      },
      confidence,
      computedAt: new Date(),
      validUntil,
    })
    .returning();

  return inserted;
}

async function generateCommonConfigsInsight(): Promise<SalesInsight | null> {
  const patterns = await db
    .select()
    .from(offerPatterns)
    .orderBy(desc(offerPatterns.frequency))
    .limit(10);

  if (patterns.length === 0) return null;

  const maxFrequency = patterns[0]?.frequency ?? 1;
  const confidence = Math.min(maxFrequency / 20, 1).toFixed(4);

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 7);

  const [inserted] = await db
    .insert(salesInsights)
    .values({
      insightType: "common_configs",
      insightData: {
        patterns: patterns.map((p) => ({
          patternType: p.patternType,
          patternData: p.patternData,
          frequency: p.frequency,
          confidence: p.confidence,
        })),
      },
      confidence,
      computedAt: new Date(),
      validUntil,
    })
    .returning();

  return inserted;
}
