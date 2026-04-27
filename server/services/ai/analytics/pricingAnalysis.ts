import { db } from "../../../db";
import { eq, sql } from "drizzle-orm";
import {
  offerItems,
  offers,
  pricingDistributions,
  type PricingDistribution,
} from "@shared/schema";

interface PriceRow {
  machineId: number;
  machineName: string;
  macroType: string | null;
  price: number;
}

export async function computePricingDistributions(): Promise<PricingDistribution[]> {
  const priceRows = await db
    .select({
      machineId: offerItems.machineId,
      machineName: offerItems.snapshotMachineName,
      macroType: offerItems.snapshotMacroType,
      price: sql<number>`(${offerItems.snapshotBasePrice}::numeric * ${offerItems.quantity})::float`,
    })
    .from(offerItems)
    .innerJoin(offers, eq(offerItems.offerId, offers.id))
    .where(sql`${offers.deletedAt} is null`);

  const grouped = groupByMachine(priceRows);

  await db.delete(pricingDistributions);

  const results: PricingDistribution[] = [];

  for (const [machineId, data] of Array.from(grouped.entries())) {
    const stats = computeStats(data.prices);
    const buckets = buildPriceBuckets(data.prices);

    const [inserted] = await db
      .insert(pricingDistributions)
      .values({
        machineId,
        machineName: data.machineName,
        macroType: data.macroType,
        minPrice: stats.min.toFixed(2),
        maxPrice: stats.max.toFixed(2),
        avgPrice: stats.avg.toFixed(2),
        medianPrice: stats.median.toFixed(2),
        sampleCount: data.prices.length,
        priceBuckets: buckets,
        updatedAt: new Date(),
      })
      .returning();
    results.push(inserted);
  }

  return results;
}

export async function computePricingForOffer(offerId: number): Promise<PricingDistribution[]> {
  const items = await db
    .select({ machineId: offerItems.machineId })
    .from(offerItems)
    .where(eq(offerItems.offerId, offerId));

  const machineIds = Array.from(new Set(items.map((i) => i.machineId)));
  if (machineIds.length === 0) return [];

  const results: PricingDistribution[] = [];

  for (const machineId of machineIds) {
    const priceRows = await db
      .select({
        machineId: offerItems.machineId,
        machineName: offerItems.snapshotMachineName,
        macroType: offerItems.snapshotMacroType,
        price: sql<number>`(${offerItems.snapshotBasePrice}::numeric * ${offerItems.quantity})::float`,
      })
      .from(offerItems)
      .innerJoin(offers, eq(offerItems.offerId, offers.id))
      .where(sql`${offers.deletedAt} is null and ${offerItems.machineId} = ${machineId}`);

    if (priceRows.length === 0) continue;

    const prices = priceRows.map((r) => r.price);
    const stats = computeStats(prices);
    const buckets = buildPriceBuckets(prices);

    await db.delete(pricingDistributions).where(eq(pricingDistributions.machineId, machineId));

    const [inserted] = await db
      .insert(pricingDistributions)
      .values({
        machineId,
        machineName: priceRows[0].machineName,
        macroType: priceRows[0].macroType,
        minPrice: stats.min.toFixed(2),
        maxPrice: stats.max.toFixed(2),
        avgPrice: stats.avg.toFixed(2),
        medianPrice: stats.median.toFixed(2),
        sampleCount: prices.length,
        priceBuckets: buckets,
        updatedAt: new Date(),
      })
      .returning();
    results.push(inserted);
  }

  return results;
}

function groupByMachine(rows: PriceRow[]): Map<number, { machineName: string; macroType: string | null; prices: number[] }> {
  const map = new Map<number, { machineName: string; macroType: string | null; prices: number[] }>();
  for (const row of rows) {
    const existing = map.get(row.machineId);
    if (existing) {
      existing.prices.push(row.price);
    } else {
      map.set(row.machineId, {
        machineName: row.machineName,
        macroType: row.macroType,
        prices: [row.price],
      });
    }
  }
  return map;
}

function computeStats(prices: number[]): { min: number; max: number; avg: number; median: number } {
  const sorted = [...prices].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { min, max, avg, median };
}

function buildPriceBuckets(prices: number[], bucketCount = 5): { min: number; max: number; count: number }[] {
  if (prices.length === 0) return [];
  const sorted = [...prices].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min;

  if (range === 0) {
    return [{ min, max, count: prices.length }];
  }

  const step = range / bucketCount;
  const buckets: { min: number; max: number; count: number }[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const bMin = Math.round((min + step * i) * 100) / 100;
    const bMax = Math.round((min + step * (i + 1)) * 100) / 100;
    const count = prices.filter((p) => {
      if (i === bucketCount - 1) return p >= bMin && p <= bMax;
      return p >= bMin && p < bMax;
    }).length;
    buckets.push({ min: bMin, max: bMax, count });
  }

  return buckets;
}
