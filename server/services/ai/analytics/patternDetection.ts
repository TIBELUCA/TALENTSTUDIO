import { db } from "../../../db";
import { eq, sql } from "drizzle-orm";
import {
  offerItems,
  offerItemOptions,
  offers,
  offerPatterns,
  type OfferPattern,
} from "@shared/schema";

export async function detectPatterns(): Promise<OfferPattern[]> {
  await db.delete(offerPatterns);

  const results: OfferPattern[] = [];

  const combos = await detectMachineCombos();
  results.push(...combos);

  const bundles = await detectOptionBundles();
  results.push(...bundles);

  return results;
}

export async function detectPatternsForOffer(offerId: number): Promise<OfferPattern[]> {
  const items = await db
    .select({ machineId: offerItems.machineId })
    .from(offerItems)
    .where(eq(offerItems.offerId, offerId));

  if (items.length <= 1) return [];

  return detectPatterns();
}

async function detectMachineCombos(): Promise<OfferPattern[]> {
  const offerMachines = await db
    .select({
      offerId: offerItems.offerId,
      machineId: offerItems.machineId,
      machineName: offerItems.snapshotMachineName,
    })
    .from(offerItems)
    .innerJoin(offers, eq(offerItems.offerId, offers.id))
    .where(sql`${offers.deletedAt} is null`);

  const byOffer = new Map<number, { machineId: number; machineName: string }[]>();
  for (const row of offerMachines) {
    const list = byOffer.get(row.offerId) ?? [];
    list.push({ machineId: row.machineId, machineName: row.machineName });
    byOffer.set(row.offerId, list);
  }

  const comboCount = new Map<string, { machineIds: number[]; machineNames: string[]; count: number }>();

  for (const [, machines] of Array.from(byOffer.entries())) {
    if (machines.length < 2) continue;
    const sorted = [...machines].sort((a, b) => a.machineId - b.machineId);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i].machineId}-${sorted[j].machineId}`;
        const existing = comboCount.get(key);
        if (existing) {
          existing.count++;
        } else {
          comboCount.set(key, {
            machineIds: [sorted[i].machineId, sorted[j].machineId],
            machineNames: [sorted[i].machineName, sorted[j].machineName],
            count: 1,
          });
        }
      }
    }
  }

  const totalOffers = byOffer.size || 1;
  const results: OfferPattern[] = [];

  for (const [, combo] of Array.from(comboCount.entries())) {
    if (combo.count < 2) continue;

    const confidence = (combo.count / totalOffers).toFixed(4);

    const [inserted] = await db
      .insert(offerPatterns)
      .values({
        patternType: "machine_combo",
        patternData: {
          machineIds: combo.machineIds,
          machineNames: combo.machineNames,
        },
        frequency: combo.count,
        confidence,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    results.push(inserted);
  }

  return results;
}

async function detectOptionBundles(): Promise<OfferPattern[]> {
  const optionPairs = await db
    .select({
      offerItemId: offerItemOptions.offerItemId,
      machineOptionId: offerItemOptions.machineOptionId,
      optionName: offerItemOptions.snapshotOptionName,
    })
    .from(offerItemOptions)
    .innerJoin(offerItems, eq(offerItemOptions.offerItemId, offerItems.id))
    .innerJoin(offers, eq(offerItems.offerId, offers.id))
    .where(sql`${offers.deletedAt} is null`);

  const byItem = new Map<number, { machineOptionId: number; optionName: string }[]>();
  for (const row of optionPairs) {
    const list = byItem.get(row.offerItemId) ?? [];
    list.push({ machineOptionId: row.machineOptionId, optionName: row.optionName });
    byItem.set(row.offerItemId, list);
  }

  const bundleCount = new Map<string, { optionIds: number[]; optionNames: string[]; count: number }>();

  for (const [, options] of Array.from(byItem.entries())) {
    if (options.length < 2) continue;
    const sorted = [...options].sort((a, b) => a.machineOptionId - b.machineOptionId);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i].machineOptionId}-${sorted[j].machineOptionId}`;
        const existing = bundleCount.get(key);
        if (existing) {
          existing.count++;
        } else {
          bundleCount.set(key, {
            optionIds: [sorted[i].machineOptionId, sorted[j].machineOptionId],
            optionNames: [sorted[i].optionName, sorted[j].optionName],
            count: 1,
          });
        }
      }
    }
  }

  const totalItems = byItem.size || 1;
  const results: OfferPattern[] = [];

  for (const [, bundle] of Array.from(bundleCount.entries())) {
    if (bundle.count < 2) continue;

    const confidence = (bundle.count / totalItems).toFixed(4);

    const [inserted] = await db
      .insert(offerPatterns)
      .values({
        patternType: "option_bundle",
        patternData: {
          optionIds: bundle.optionIds,
          optionNames: bundle.optionNames,
        },
        frequency: bundle.count,
        confidence,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    results.push(inserted);
  }

  return results;
}
