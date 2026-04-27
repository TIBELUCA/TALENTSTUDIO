import { db } from "../../../db";
import { eq, sql } from "drizzle-orm";
import {
  offerItems,
  offers,
  machineUsageStats,
  type MachineUsageStat,
} from "@shared/schema";

export async function computeMachineStats(): Promise<MachineUsageStat[]> {
  const rows = await db
    .select({
      machineId: offerItems.machineId,
      machineName: offerItems.snapshotMachineName,
      macroType: offerItems.snapshotMacroType,
      usageCount: sql<number>`count(*)::int`,
      avgPrice: sql<string>`round(avg(${offerItems.snapshotBasePrice}::numeric), 2)::text`,
      avgQuantity: sql<string>`round(avg(${offerItems.quantity}::numeric), 2)::text`,
      totalRevenue: sql<string>`round(sum(${offerItems.snapshotBasePrice}::numeric * ${offerItems.quantity}), 2)::text`,
      lastUsedAt: sql<Date>`max(${offers.date})`,
    })
    .from(offerItems)
    .innerJoin(offers, eq(offerItems.offerId, offers.id))
    .where(sql`${offers.deletedAt} is null`)
    .groupBy(offerItems.machineId, offerItems.snapshotMachineName, offerItems.snapshotMacroType);

  await db.delete(machineUsageStats);

  const results: MachineUsageStat[] = [];

  for (const row of rows) {
    const [inserted] = await db
      .insert(machineUsageStats)
      .values({
        machineId: row.machineId,
        machineName: row.machineName,
        macroType: row.macroType,
        usageCount: row.usageCount,
        avgPrice: row.avgPrice,
        avgQuantity: row.avgQuantity,
        totalRevenue: row.totalRevenue,
        lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt as any) : null,
        updatedAt: new Date(),
      })
      .returning();
    results.push(inserted);
  }

  return results;
}

export async function computeMachineStatsForOffer(offerId: number): Promise<MachineUsageStat[]> {
  const items = await db
    .select({ machineId: offerItems.machineId })
    .from(offerItems)
    .where(eq(offerItems.offerId, offerId));

  const machineIds = Array.from(new Set(items.map((i) => i.machineId)));
  if (machineIds.length === 0) return [];

  const results: MachineUsageStat[] = [];

  for (const machineId of machineIds) {
    const [row] = await db
      .select({
        machineId: offerItems.machineId,
        machineName: offerItems.snapshotMachineName,
        macroType: offerItems.snapshotMacroType,
        usageCount: sql<number>`count(*)::int`,
        avgPrice: sql<string>`round(avg(${offerItems.snapshotBasePrice}::numeric), 2)::text`,
        avgQuantity: sql<string>`round(avg(${offerItems.quantity}::numeric), 2)::text`,
        totalRevenue: sql<string>`round(sum(${offerItems.snapshotBasePrice}::numeric * ${offerItems.quantity}), 2)::text`,
        lastUsedAt: sql<Date>`max(${offers.date})`,
      })
      .from(offerItems)
      .innerJoin(offers, eq(offerItems.offerId, offers.id))
      .where(sql`${offers.deletedAt} is null and ${offerItems.machineId} = ${machineId}`)
      .groupBy(offerItems.machineId, offerItems.snapshotMachineName, offerItems.snapshotMacroType);

    if (!row) continue;

    await db.delete(machineUsageStats).where(eq(machineUsageStats.machineId, machineId));

    const [inserted] = await db
      .insert(machineUsageStats)
      .values({
        machineId: row.machineId,
        machineName: row.machineName,
        macroType: row.macroType,
        usageCount: row.usageCount,
        avgPrice: row.avgPrice,
        avgQuantity: row.avgQuantity,
        totalRevenue: row.totalRevenue,
        lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt as any) : null,
        updatedAt: new Date(),
      })
      .returning();
    results.push(inserted);
  }

  return results;
}
