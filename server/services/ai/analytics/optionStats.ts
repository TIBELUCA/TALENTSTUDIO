import { db } from "../../../db";
import { eq, sql } from "drizzle-orm";
import {
  offerItemOptions,
  offerItems,
  offers,
  optionUsageStats,
  type OptionUsageStat,
} from "@shared/schema";

export async function computeOptionStats(): Promise<OptionUsageStat[]> {
  const rows = await db
    .select({
      machineOptionId: offerItemOptions.machineOptionId,
      optionName: offerItemOptions.snapshotOptionName,
      machineId: offerItems.machineId,
      usageCount: sql<number>`count(*)::int`,
      avgQuantity: sql<string>`round(avg(${offerItemOptions.quantity}::numeric), 2)::text`,
    })
    .from(offerItemOptions)
    .innerJoin(offerItems, eq(offerItemOptions.offerItemId, offerItems.id))
    .innerJoin(offers, eq(offerItems.offerId, offers.id))
    .where(sql`${offers.deletedAt} is null`)
    .groupBy(offerItemOptions.machineOptionId, offerItemOptions.snapshotOptionName, offerItems.machineId);

  const coOccurrenceMap = await buildCoOccurrenceMap();

  await db.delete(optionUsageStats);

  const results: OptionUsageStat[] = [];

  for (const row of rows) {
    const coIds = coOccurrenceMap.get(row.machineOptionId) ?? [];

    const [inserted] = await db
      .insert(optionUsageStats)
      .values({
        machineOptionId: row.machineOptionId,
        optionName: row.optionName,
        machineId: row.machineId,
        usageCount: row.usageCount,
        coOccurrenceOptionIds: coIds,
        avgQuantity: row.avgQuantity,
        updatedAt: new Date(),
      })
      .returning();
    results.push(inserted);
  }

  return results;
}

async function buildCoOccurrenceMap(): Promise<Map<number, number[]>> {
  const pairs = await db
    .select({
      offerItemId: offerItemOptions.offerItemId,
      machineOptionId: offerItemOptions.machineOptionId,
    })
    .from(offerItemOptions)
    .innerJoin(offerItems, eq(offerItemOptions.offerItemId, offerItems.id))
    .innerJoin(offers, eq(offerItems.offerId, offers.id))
    .where(sql`${offers.deletedAt} is null`);

  const byItem = new Map<number, number[]>();
  for (const p of pairs) {
    const list = byItem.get(p.offerItemId) ?? [];
    list.push(p.machineOptionId);
    byItem.set(p.offerItemId, list);
  }

  const coMap = new Map<number, Set<number>>();
  Array.from(byItem.values()).forEach((optionIds) => {
    for (const optId of optionIds) {
      const existing = coMap.get(optId) ?? new Set<number>();
      for (const otherId of optionIds) {
        if (otherId !== optId) existing.add(otherId);
      }
      coMap.set(optId, existing);
    }
  });

  const result = new Map<number, number[]>();
  Array.from(coMap.entries()).forEach(([optId, coSet]) => {
    result.set(optId, Array.from(coSet));
  });
  return result;
}

export async function computeOptionStatsForOffer(offerId: number): Promise<OptionUsageStat[]> {
  const items = await db
    .select({ id: offerItems.id })
    .from(offerItems)
    .where(eq(offerItems.offerId, offerId));

  if (items.length === 0) return [];

  const itemIds = items.map((i) => i.id);
  const pgItemIds = `{${itemIds.join(",")}}`;
  const options = await db
    .select({ machineOptionId: offerItemOptions.machineOptionId })
    .from(offerItemOptions)
    .where(sql`${offerItemOptions.offerItemId} = any(${pgItemIds}::int[])`);

  const optionIds = Array.from(new Set(options.map((o) => o.machineOptionId)));
  if (optionIds.length === 0) return [];

  const coOccurrenceMap = await buildCoOccurrenceMap();
  const results: OptionUsageStat[] = [];

  for (const machineOptionId of optionIds) {
    const [row] = await db
      .select({
        machineOptionId: offerItemOptions.machineOptionId,
        optionName: offerItemOptions.snapshotOptionName,
        machineId: offerItems.machineId,
        usageCount: sql<number>`count(*)::int`,
        avgQuantity: sql<string>`round(avg(${offerItemOptions.quantity}::numeric), 2)::text`,
      })
      .from(offerItemOptions)
      .innerJoin(offerItems, eq(offerItemOptions.offerItemId, offerItems.id))
      .innerJoin(offers, eq(offerItems.offerId, offers.id))
      .where(sql`${offers.deletedAt} is null and ${offerItemOptions.machineOptionId} = ${machineOptionId}`)
      .groupBy(offerItemOptions.machineOptionId, offerItemOptions.snapshotOptionName, offerItems.machineId);

    if (!row) continue;

    const coIds = coOccurrenceMap.get(machineOptionId) ?? [];

    await db.delete(optionUsageStats).where(eq(optionUsageStats.machineOptionId, machineOptionId));

    const [inserted] = await db
      .insert(optionUsageStats)
      .values({
        machineOptionId: row.machineOptionId,
        optionName: row.optionName,
        machineId: row.machineId,
        usageCount: row.usageCount,
        coOccurrenceOptionIds: coIds,
        avgQuantity: row.avgQuantity,
        updatedAt: new Date(),
      })
      .returning();
    results.push(inserted);
  }

  return results;
}
