import { db, eq, and, desc, sql, inArray, isNull } from "./base";
import {
  talentQuotes, talentQuoteItems, customers, contacts,
  campaigns, campaignDeliverables,
  type TalentQuote, type TalentQuoteItem, type InsertTalentQuote,
  type InsertTalentQuoteItem, type TalentQuoteWithItems, type Campaign,
} from "@shared/schema";

type ItemPayload = Omit<InsertTalentQuoteItem, "quoteId" | "companyId" | "position">;

function decToNum(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

type Numeric = string | number | null | undefined;

type ComputableItem = {
  quantity?: number;
  unitPriceEur?: Numeric;
  discountPct?: Numeric;
};

function computeItemTotal(it: ComputableItem): number {
  const qty = it.quantity || 0;
  const unit = decToNum(it.unitPriceEur);
  const disc = decToNum(it.discountPct ?? 0);
  const gross = qty * unit;
  return Math.round((gross - (gross * disc) / 100) * 100) / 100;
}

function computeTotal(items: ReadonlyArray<ComputableItem>): number {
  return Math.round(items.reduce((acc, it) => acc + computeItemTotal(it), 0) * 100) / 100;
}

async function nextReferenceNumber(companyId: number): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PRV-${year}-`;
  const rows = await db.select({ ref: talentQuotes.referenceNumber })
    .from(talentQuotes)
    .where(and(eq(talentQuotes.companyId, companyId), sql`${talentQuotes.referenceNumber} LIKE ${prefix + '%'}`));
  let max = 0;
  for (const r of rows) {
    const seq = parseInt(r.ref.replace(prefix, ""), 10);
    if (!isNaN(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export class TalentQuoteRepository {
  async list(companyId: number): Promise<TalentQuoteWithItems[]> {
    const rows = await db
      .select({
        quote: talentQuotes,
        brandName: customers.name,
      })
      .from(talentQuotes)
      .leftJoin(customers, eq(talentQuotes.brandCustomerId, customers.id))
      .where(eq(talentQuotes.companyId, companyId))
      .orderBy(desc(talentQuotes.createdAt));
    if (rows.length === 0) return [];
    const ids = rows.map(r => r.quote.id);
    const items = await db.select().from(talentQuoteItems)
      .where(and(eq(talentQuoteItems.companyId, companyId), inArray(talentQuoteItems.quoteId, ids)));
    const byQuote = new Map<number, TalentQuoteItem[]>();
    for (const it of items) {
      const arr = byQuote.get(it.quoteId) ?? [];
      arr.push(it);
      byQuote.set(it.quoteId, arr);
    }
    return rows.map(r => ({
      ...r.quote,
      brandName: r.brandName ?? null,
      items: (byQuote.get(r.quote.id) ?? []).sort((a, b) => a.position - b.position),
      itemsCount: (byQuote.get(r.quote.id) ?? []).length,
    }));
  }

  async getById(id: number, companyId?: number): Promise<TalentQuoteWithItems | undefined> {
    const where = companyId != null
      ? and(eq(talentQuotes.id, id), eq(talentQuotes.companyId, companyId))
      : eq(talentQuotes.id, id);
    const [row] = await db
      .select({ quote: talentQuotes, brandName: customers.name })
      .from(talentQuotes)
      .leftJoin(customers, eq(talentQuotes.brandCustomerId, customers.id))
      .where(where);
    if (!row) return undefined;
    const items = await db.select().from(talentQuoteItems)
      .where(and(
        eq(talentQuoteItems.quoteId, id),
        eq(talentQuoteItems.companyId, row.quote.companyId),
      ))
      .orderBy(talentQuoteItems.position);
    let brandContactName: string | null = null;
    if (row.quote.brandContactId) {
      const [c] = await db.select().from(contacts).where(eq(contacts.id, row.quote.brandContactId));
      if (c) brandContactName = `${c.firstName} ${c.lastName}`.trim();
    }
    return { ...row.quote, brandName: row.brandName ?? null, brandContactName, items };
  }

  async create(
    companyId: number,
    quote: Omit<InsertTalentQuote, "companyId">,
    items: ItemPayload[],
  ): Promise<TalentQuote> {
    const referenceNumber = await nextReferenceNumber(companyId);
    const total = computeTotal(items);
    const [created] = await db.insert(talentQuotes).values({
      ...quote,
      companyId,
      referenceNumber,
      totalEur: String(total),
    }).returning();
    if (items.length > 0) {
      await db.insert(talentQuoteItems).values(
        items.map((it, idx) => ({
          ...it,
          companyId,
          quoteId: created.id,
          position: idx,
        }))
      );
    }
    return created;
  }

  async update(
    id: number,
    companyId: number,
    quote: Partial<Omit<InsertTalentQuote, "companyId">>,
    items: ItemPayload[] | null,
  ): Promise<TalentQuote> {
    const total = items ? computeTotal(items) : undefined;
    const [updated] = await db.update(talentQuotes).set({
      ...quote,
      ...(total != null ? { totalEur: String(total) } : {}),
      updatedAt: new Date(),
    }).where(and(eq(talentQuotes.id, id), eq(talentQuotes.companyId, companyId))).returning();
    if (items != null) {
      await db.delete(talentQuoteItems)
        .where(and(eq(talentQuoteItems.quoteId, id), eq(talentQuoteItems.companyId, companyId)));
      if (items.length > 0) {
        await db.insert(talentQuoteItems).values(
          items.map((it, idx) => ({
            ...it,
            companyId,
            quoteId: id,
            position: idx,
          }))
        );
      }
    }
    return updated;
  }

  async setStatus(id: number, companyId: number, status: string): Promise<TalentQuote> {
    const patch: Partial<TalentQuote> & { updatedAt: Date } = { status, updatedAt: new Date() };
    if (status === "sent") patch.sentAt = new Date();
    if (status === "accepted") patch.acceptedAt = new Date();
    if (status === "rejected") patch.rejectedAt = new Date();
    const [u] = await db.update(talentQuotes).set(patch)
      .where(and(eq(talentQuotes.id, id), eq(talentQuotes.companyId, companyId))).returning();
    return u;
  }

  async setCampaignId(id: number, companyId: number, campaignId: number | null): Promise<void> {
    await db.update(talentQuotes).set({ campaignId, updatedAt: new Date() })
      .where(and(eq(talentQuotes.id, id), eq(talentQuotes.companyId, companyId)));
  }

  /**
   * Atomically converts an accepted quote into a campaign.
   *
   * The conditional UPDATE acts as the lock: only one concurrent request will
   * see `campaign_id IS NULL` and proceed. If the update affects zero rows, we
   * either return the already-existing campaign (true idempotency for retries)
   * or raise a conflict so callers see a clear error.
   *
   * Caller is responsible for tenant validation upstream — companyId is always
   * part of the WHERE clause.
   */
  async acceptAndCreateCampaign(
    id: number,
    companyId: number,
    nextCampaignCode: string,
    createdByUserId: number | null,
  ): Promise<{ campaign: Campaign; reused: boolean }> {
    return await db.transaction(async (tx) => {
      // Lock the quote row for the rest of the tx — concurrent requests block
      // here until we commit. Combined with the campaignId check below, this
      // makes the operation single-flight even under heavy parallelism.
      const [reserved] = await tx.select().from(talentQuotes)
        .where(and(
          eq(talentQuotes.id, id),
          eq(talentQuotes.companyId, companyId),
        ))
        .for("update");
      if (!reserved) throw new Error("Quote not found");
      if (reserved.status !== "accepted") {
        throw new Error("Solo i preventivi accettati possono diventare campagne");
      }

      // Idempotent: if a campaign already exists, return it instead of creating a duplicate.
      if (reserved.campaignId != null) {
        const [existing] = await tx.select().from(campaigns)
          .where(and(
            eq(campaigns.id, reserved.campaignId),
            eq(campaigns.companyId, companyId),
          ));
        if (existing) return { campaign: existing, reused: true };
      }

      const items = await tx.select().from(talentQuoteItems)
        .where(and(
          eq(talentQuoteItems.quoteId, id),
          eq(talentQuoteItems.companyId, companyId),
        ))
        .orderBy(talentQuoteItems.position);

      const [campaign] = await tx.insert(campaigns).values({
        companyId,
        code: nextCampaignCode,
        brandCustomerId: reserved.brandCustomerId,
        brandContactId: reserved.brandContactId ?? null,
        quoteId: reserved.id,
        name: reserved.subject,
        status: "briefing",
        totalValueEur: reserved.totalEur,
        notes: reserved.notes,
        createdByUserId,
      }).returning();

      // Expand each item into one deliverable per unit.
      const deliverableRows = items.flatMap((it, i) => {
        return Array.from({ length: it.quantity }, (_, q) => ({
          companyId,
          campaignId: campaign.id,
          talentId: it.talentId,
          talentName: it.talentName,
          deliverableType: it.deliverableType,
          quantity: 1,
          unitPriceEur: it.unitPriceEur,
          status: "briefing",
          position: i * 10 + q,
        }));
      });
      if (deliverableRows.length > 0) {
        await tx.insert(campaignDeliverables).values(deliverableRows);
      }

      await tx.update(talentQuotes)
        .set({ campaignId: campaign.id, updatedAt: new Date() })
        .where(and(
          eq(talentQuotes.id, id),
          eq(talentQuotes.companyId, companyId),
        ));

      return { campaign, reused: false };
    });
  }

  async delete(id: number, companyId: number): Promise<void> {
    await db.delete(talentQuoteItems)
      .where(and(eq(talentQuoteItems.quoteId, id), eq(talentQuoteItems.companyId, companyId)));
    await db.delete(talentQuotes)
      .where(and(eq(talentQuotes.id, id), eq(talentQuotes.companyId, companyId)));
  }

  async duplicate(id: number, companyId: number, createdByUserId: number | null): Promise<TalentQuote> {
    const original = await this.getById(id, companyId);
    if (!original) throw new Error("Quote not found");
    const newQuote: Omit<InsertTalentQuote, "companyId"> = {
      brandCustomerId: original.brandCustomerId,
      brandContactId: original.brandContactId ?? null,
      subject: `${original.subject} (copia)`,
      status: "draft",
      date: new Date(),
      validUntil: original.validUntil ?? null,
      paymentTerms: original.paymentTerms ?? null,
      notes: original.notes ?? null,
      internalNotes: original.internalNotes ?? null,
      createdByUserId: createdByUserId ?? null,
    };
    const items: ItemPayload[] = original.items.map((it) => ({
      talentId: it.talentId,
      talentName: it.talentName,
      deliverableType: it.deliverableType,
      quantity: it.quantity,
      unitPriceEur: it.unitPriceEur,
      discountPct: it.discountPct,
      notes: it.notes,
    }));
    return await this.create(companyId, newQuote, items);
  }
}

export const talentQuoteRepository = new TalentQuoteRepository();
export { computeItemTotal, computeTotal };
