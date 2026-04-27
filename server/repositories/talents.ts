import { db, eq, and, desc, inArray } from "./base";
import {
  talents,
  talentSocials,
  talentRates,
  talentDocuments,
  type Talent,
  type TalentSocial,
  type TalentRate,
  type TalentDocument,
  type InsertTalent,
  type InsertTalentSocial,
  type InsertTalentRate,
  type InsertTalentDocument,
  type TalentWithDetails,
  type TalentListItem,
} from "@shared/schema";

export class TalentRepository {
  async getAll(companyId: number): Promise<Talent[]> {
    return await db
      .select()
      .from(talents)
      .where(eq(talents.companyId, companyId))
      .orderBy(desc(talents.createdAt));
  }

  // Used by the roster grid: returns each talent plus a single "primary"
  // social — the one with the most followers, preferring instagram/tiktok
  // when followers are equal — so the card can display handle + count
  // without N+1 queries from the client.
  async getAllWithPrimarySocial(companyId: number): Promise<TalentListItem[]> {
    const list = await this.getAll(companyId);
    if (list.length === 0) return [];
    const ids = list.map((t) => t.id);
    const socials = await db
      .select()
      .from(talentSocials)
      .where(inArray(talentSocials.talentId, ids));
    const platformPriority: Record<string, number> = {
      instagram: 4,
      tiktok: 3,
      youtube: 2,
      x: 1,
    };
    const byTalent = new Map<number, TalentSocial>();
    for (const s of socials) {
      const current = byTalent.get(s.talentId);
      if (!current) {
        byTalent.set(s.talentId, s);
        continue;
      }
      const cFollowers = current.followers ?? 0;
      const sFollowers = s.followers ?? 0;
      if (sFollowers > cFollowers) {
        byTalent.set(s.talentId, s);
      } else if (sFollowers === cFollowers) {
        const cPrio = platformPriority[current.platform] ?? 0;
        const sPrio = platformPriority[s.platform] ?? 0;
        if (sPrio > cPrio) byTalent.set(s.talentId, s);
      }
    }
    return list.map((t) => ({ ...t, primarySocial: byTalent.get(t.id) ?? null }));
  }

  async getById(id: number): Promise<TalentWithDetails | undefined> {
    const [t] = await db.select().from(talents).where(eq(talents.id, id));
    if (!t) return undefined;
    const socials = await db.select().from(talentSocials).where(eq(talentSocials.talentId, id));
    const rates = await db.select().from(talentRates).where(eq(talentRates.talentId, id));
    const documents = await db.select().from(talentDocuments).where(eq(talentDocuments.talentId, id));
    return { ...t, socials, rates, documents };
  }

  async create(data: InsertTalent): Promise<Talent> {
    const [t] = await db.insert(talents).values(data).returning();
    return t;
  }

  async update(id: number, data: Partial<InsertTalent>): Promise<Talent> {
    const [t] = await db
      .update(talents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(talents.id, id))
      .returning();
    return t;
  }

  async delete(id: number): Promise<void> {
    await db.delete(talentSocials).where(eq(talentSocials.talentId, id));
    await db.delete(talentRates).where(eq(talentRates.talentId, id));
    await db.delete(talentDocuments).where(eq(talentDocuments.talentId, id));
    await db.delete(talents).where(eq(talents.id, id));
  }

  // Socials
  async replaceSocials(talentId: number, list: Omit<InsertTalentSocial, "talentId">[]): Promise<TalentSocial[]> {
    await db.delete(talentSocials).where(eq(talentSocials.talentId, talentId));
    if (list.length === 0) return [];
    return await db
      .insert(talentSocials)
      .values(list.map(s => ({ ...s, talentId })))
      .returning();
  }

  // Rates
  async replaceRates(talentId: number, list: Omit<InsertTalentRate, "talentId">[]): Promise<TalentRate[]> {
    await db.delete(talentRates).where(eq(talentRates.talentId, talentId));
    if (list.length === 0) return [];
    return await db
      .insert(talentRates)
      .values(list.map(r => ({ ...r, talentId })))
      .returning();
  }

  // Documents
  async addDocument(data: InsertTalentDocument): Promise<TalentDocument> {
    const [d] = await db.insert(talentDocuments).values(data).returning();
    return d;
  }

  async deleteDocument(id: number): Promise<TalentDocument | undefined> {
    const [d] = await db.delete(talentDocuments).where(eq(talentDocuments.id, id)).returning();
    return d;
  }
}

export const talentRepository = new TalentRepository();
