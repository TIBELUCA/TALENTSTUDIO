import { db, eq, and, desc, sql, inArray } from "./base";
import {
  campaigns, campaignDeliverables, deliverableMetrics,
  campaignPaymentsIn, campaignPaymentsOut, customers, contacts,
  type Campaign, type CampaignDeliverable, type DeliverableMetric,
  type CampaignPaymentIn, type CampaignPaymentOut,
  type InsertCampaign, type InsertCampaignDeliverable,
  type InsertDeliverableMetric, type InsertCampaignPaymentIn,
  type InsertCampaignPaymentOut, type CampaignWithRelations,
} from "@shared/schema";

type DeliverablePayload = Omit<InsertCampaignDeliverable, "campaignId" | "companyId">;
type MetricsPayload = Omit<InsertDeliverableMetric, "deliverableId" | "companyId">;
type PaymentInPayload = Omit<InsertCampaignPaymentIn, "campaignId" | "companyId">;
type PaymentOutPayload = Omit<InsertCampaignPaymentOut, "campaignId" | "companyId">;

export async function nextCampaignCode(companyId: number): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CMP-${year}-`;
  const rows = await db.select({ code: campaigns.code })
    .from(campaigns)
    .where(and(eq(campaigns.companyId, companyId), sql`${campaigns.code} LIKE ${prefix + '%'}`));
  let max = 0;
  for (const r of rows) {
    const seq = parseInt(r.code.replace(prefix, ""), 10);
    if (!isNaN(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export class CampaignRepository {
  async list(companyId: number): Promise<(Campaign & { brandName: string | null; deliverablesCount: number; publishedCount: number })[]> {
    const rows = await db
      .select({ c: campaigns, brandName: customers.name })
      .from(campaigns)
      .leftJoin(customers, eq(campaigns.brandCustomerId, customers.id))
      .where(eq(campaigns.companyId, companyId))
      .orderBy(desc(campaigns.createdAt));
    if (rows.length === 0) return [];
    const ids = rows.map(r => r.c.id);
    const dels = await db.select().from(campaignDeliverables)
      .where(and(eq(campaignDeliverables.companyId, companyId), inArray(campaignDeliverables.campaignId, ids)));
    const counts = new Map<number, { total: number; published: number }>();
    for (const d of dels) {
      const cur = counts.get(d.campaignId) ?? { total: 0, published: 0 };
      cur.total++;
      if (d.status === "published") cur.published++;
      counts.set(d.campaignId, cur);
    }
    return rows.map(r => ({
      ...r.c,
      brandName: r.brandName ?? null,
      deliverablesCount: counts.get(r.c.id)?.total ?? 0,
      publishedCount: counts.get(r.c.id)?.published ?? 0,
    }));
  }

  async getById(id: number, companyId?: number): Promise<CampaignWithRelations | undefined> {
    const where = companyId != null
      ? and(eq(campaigns.id, id), eq(campaigns.companyId, companyId))
      : eq(campaigns.id, id);
    const [row] = await db
      .select({ c: campaigns, brandName: customers.name })
      .from(campaigns)
      .leftJoin(customers, eq(campaigns.brandCustomerId, customers.id))
      .where(where);
    if (!row) return undefined;

    let brandContactName: string | null = null;
    if (row.c.brandContactId) {
      const [c] = await db.select().from(contacts).where(eq(contacts.id, row.c.brandContactId));
      if (c) brandContactName = `${c.firstName} ${c.lastName}`.trim();
    }

    const dels = await db.select().from(campaignDeliverables)
      .where(and(
        eq(campaignDeliverables.campaignId, id),
        eq(campaignDeliverables.companyId, row.c.companyId),
      ))
      .orderBy(campaignDeliverables.position);
    const delIds = dels.map(d => d.id);
    let metricsByDel = new Map<number, DeliverableMetric>();
    if (delIds.length > 0) {
      const m = await db.select().from(deliverableMetrics)
        .where(and(
          eq(deliverableMetrics.companyId, row.c.companyId),
          inArray(deliverableMetrics.deliverableId, delIds),
        ));
      metricsByDel = new Map(m.map(x => [x.deliverableId, x]));
    }
    const paymentsIn = await db.select().from(campaignPaymentsIn)
      .where(and(
        eq(campaignPaymentsIn.campaignId, id),
        eq(campaignPaymentsIn.companyId, row.c.companyId),
      ))
      .orderBy(campaignPaymentsIn.createdAt);
    const paymentsOut = await db.select().from(campaignPaymentsOut)
      .where(and(
        eq(campaignPaymentsOut.campaignId, id),
        eq(campaignPaymentsOut.companyId, row.c.companyId),
      ))
      .orderBy(campaignPaymentsOut.createdAt);

    return {
      ...row.c,
      brandName: row.brandName ?? null,
      brandContactName,
      deliverables: dels.map(d => ({ ...d, metrics: metricsByDel.get(d.id) ?? null })),
      paymentsIn,
      paymentsOut,
    };
  }

  async create(companyId: number, data: Omit<InsertCampaign, "companyId">): Promise<Campaign> {
    const code = await nextCampaignCode(companyId);
    const [c] = await db.insert(campaigns).values({ ...data, companyId, code }).returning();
    return c;
  }

  async update(id: number, companyId: number, data: Partial<Omit<InsertCampaign, "companyId">>): Promise<Campaign> {
    const [c] = await db.update(campaigns).set({ ...data, updatedAt: new Date() })
      .where(and(eq(campaigns.id, id), eq(campaigns.companyId, companyId))).returning();
    return c;
  }

  async delete(id: number, companyId: number): Promise<void> {
    await db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.companyId, companyId)));
  }

  // Deliverables
  async addDeliverable(campaignId: number, companyId: number, data: DeliverablePayload): Promise<CampaignDeliverable> {
    const [d] = await db.insert(campaignDeliverables).values({ ...data, campaignId, companyId }).returning();
    return d;
  }

  async updateDeliverable(id: number, companyId: number, data: Partial<DeliverablePayload>): Promise<CampaignDeliverable> {
    const patch: Partial<typeof campaignDeliverables.$inferInsert> & { updatedAt: Date } = {
      ...data, updatedAt: new Date(),
    };
    if (data.status === "published" && data.publishedDate === undefined) {
      patch.publishedDate = new Date();
    }
    const [d] = await db.update(campaignDeliverables).set(patch)
      .where(and(eq(campaignDeliverables.id, id), eq(campaignDeliverables.companyId, companyId))).returning();
    return d;
  }

  async deleteDeliverable(id: number, companyId: number): Promise<void> {
    await db.delete(campaignDeliverables)
      .where(and(eq(campaignDeliverables.id, id), eq(campaignDeliverables.companyId, companyId)));
  }

  async reorderDeliverables(campaignId: number, companyId: number, orderedIds: number[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.update(campaignDeliverables)
        .set({ position: i, updatedAt: new Date() })
        .where(and(
          eq(campaignDeliverables.id, orderedIds[i]),
          eq(campaignDeliverables.campaignId, campaignId),
          eq(campaignDeliverables.companyId, companyId),
        ));
    }
  }

  // Metrics
  async upsertMetrics(deliverableId: number, companyId: number, data: MetricsPayload): Promise<DeliverableMetric> {
    const existing = await db.select().from(deliverableMetrics)
      .where(and(
        eq(deliverableMetrics.deliverableId, deliverableId),
        eq(deliverableMetrics.companyId, companyId),
      ));
    if (existing.length > 0) {
      const [m] = await db.update(deliverableMetrics)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(deliverableMetrics.deliverableId, deliverableId),
          eq(deliverableMetrics.companyId, companyId),
        )).returning();
      return m;
    }
    const [m] = await db.insert(deliverableMetrics)
      .values({ ...data, deliverableId, companyId }).returning();
    return m;
  }

  // Payments In
  async addPaymentIn(campaignId: number, companyId: number, data: PaymentInPayload): Promise<CampaignPaymentIn> {
    const [p] = await db.insert(campaignPaymentsIn).values({ ...data, campaignId, companyId }).returning();
    return p;
  }
  async updatePaymentIn(id: number, companyId: number, data: Partial<PaymentInPayload>): Promise<CampaignPaymentIn> {
    const [p] = await db.update(campaignPaymentsIn).set({ ...data, updatedAt: new Date() })
      .where(and(eq(campaignPaymentsIn.id, id), eq(campaignPaymentsIn.companyId, companyId))).returning();
    return p;
  }
  async deletePaymentIn(id: number, companyId: number): Promise<void> {
    await db.delete(campaignPaymentsIn)
      .where(and(eq(campaignPaymentsIn.id, id), eq(campaignPaymentsIn.companyId, companyId)));
  }

  // Payments Out
  async addPaymentOut(campaignId: number, companyId: number, data: PaymentOutPayload): Promise<CampaignPaymentOut> {
    const [p] = await db.insert(campaignPaymentsOut).values({ ...data, campaignId, companyId }).returning();
    return p;
  }
  async updatePaymentOut(id: number, companyId: number, data: Partial<PaymentOutPayload>): Promise<CampaignPaymentOut> {
    const [p] = await db.update(campaignPaymentsOut).set({ ...data, updatedAt: new Date() })
      .where(and(eq(campaignPaymentsOut.id, id), eq(campaignPaymentsOut.companyId, companyId))).returning();
    return p;
  }
  async deletePaymentOut(id: number, companyId: number): Promise<void> {
    await db.delete(campaignPaymentsOut)
      .where(and(eq(campaignPaymentsOut.id, id), eq(campaignPaymentsOut.companyId, companyId)));
  }

  // Talent aggregates
  async getTalentAggregate(talentId: number, companyId: number): Promise<{
    campaigns: { campaignId: number; campaignCode: string; campaignName: string; brandName: string | null; status: string; deliverablesCount: number; publishedCount: number; valueEur: number; createdAt: Date }[];
    performance: { campaignsCount: number; totalRevenueEur: number; totalCommissionEur: number; avgViews: number; avgEngagementPct: number; deliverablesCount: number; topPerformerCampaignId: number | null };
  }> {
    const dels = await db
      .select({
        d: campaignDeliverables,
        c: campaigns,
        brandName: customers.name,
      })
      .from(campaignDeliverables)
      .innerJoin(campaigns, eq(campaignDeliverables.campaignId, campaigns.id))
      .leftJoin(customers, eq(campaigns.brandCustomerId, customers.id))
      .where(and(
        eq(campaignDeliverables.talentId, talentId),
        eq(campaignDeliverables.companyId, companyId),
        eq(campaigns.companyId, companyId),
      ));

    const byCampaign = new Map<number, {
      campaignId: number; campaignCode: string; campaignName: string; brandName: string | null;
      status: string; deliverablesCount: number; publishedCount: number; valueEur: number; createdAt: Date;
    }>();
    for (const r of dels) {
      const lineValue = (r.d.quantity || 0) * Number(r.d.unitPriceEur || 0);
      const cur = byCampaign.get(r.c.id) ?? {
        campaignId: r.c.id, campaignCode: r.c.code, campaignName: r.c.name,
        brandName: r.brandName ?? null, status: r.c.status,
        deliverablesCount: 0, publishedCount: 0, valueEur: 0, createdAt: r.c.createdAt,
      };
      cur.deliverablesCount++;
      if (r.d.status === "published") cur.publishedCount++;
      cur.valueEur += lineValue;
      byCampaign.set(r.c.id, cur);
    }

    const delIds = dels.map(r => r.d.id);
    let totalViews = 0, totalEng = 0, metricCount = 0;
    let topPerf: { campaignId: number; views: number } | null = null;
    if (delIds.length > 0) {
      const metrics = await db.select().from(deliverableMetrics)
        .where(and(
          eq(deliverableMetrics.companyId, companyId),
          inArray(deliverableMetrics.deliverableId, delIds),
        ));
      const metricsById = new Map(metrics.map(m => [m.deliverableId, m]));
      for (const r of dels) {
        const m = metricsById.get(r.d.id);
        if (!m) continue;
        const v = m.views ?? 0;
        const li = m.likes ?? 0;
        const co = m.comments ?? 0;
        const sa = m.saves ?? 0;
        totalViews += v;
        if (v > 0) {
          totalEng += ((li + co + sa) / v) * 100;
          metricCount++;
        }
        if (!topPerf || v > topPerf.views) topPerf = { campaignId: r.c.id, views: v };
      }
    }

    const outs = await db.select({ p: campaignPaymentsOut, c: campaigns })
      .from(campaignPaymentsOut)
      .innerJoin(campaigns, eq(campaignPaymentsOut.campaignId, campaigns.id))
      .where(and(
        eq(campaignPaymentsOut.talentId, talentId),
        eq(campaignPaymentsOut.companyId, companyId),
        eq(campaigns.companyId, companyId),
      ));
    let totalRevenueEur = 0, totalCommissionEur = 0;
    for (const o of outs) {
      const amt = Number(o.p.amountEur || 0);
      const cmpct = Number(o.p.commissionPct || 0);
      totalRevenueEur += amt;
      totalCommissionEur += (amt * cmpct) / 100;
    }
    if (totalRevenueEur === 0) {
      for (const c of Array.from(byCampaign.values())) totalRevenueEur += c.valueEur;
    }

    return {
      campaigns: Array.from(byCampaign.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      performance: {
        campaignsCount: byCampaign.size,
        totalRevenueEur: Math.round(totalRevenueEur * 100) / 100,
        totalCommissionEur: Math.round(totalCommissionEur * 100) / 100,
        avgViews: dels.length > 0 ? Math.round(totalViews / dels.length) : 0,
        avgEngagementPct: metricCount > 0 ? Math.round((totalEng / metricCount) * 10) / 10 : 0,
        deliverablesCount: dels.length,
        topPerformerCampaignId: topPerf?.campaignId ?? null,
      },
    };
  }
}

export const campaignRepository = new CampaignRepository();
