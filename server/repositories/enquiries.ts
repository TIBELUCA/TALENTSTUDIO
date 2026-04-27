import { db, eq, desc, asc, isNull, isNotNull, and } from "./base";
import { inArray } from "drizzle-orm";
import {
  offers, customers, enquiryAttachments, dealerUsers,
  type Offer, type Customer, type DealerUser, type EnquiryAttachment,
} from "@shared/schema";

import { dealerRepository } from "./dealers";

export class EnquiryRepository {
  async getAll(companyId: number, salesmanId?: number | null): Promise<(Offer & { customer: Customer; dealer?: DealerUser | null })[]> {
    const rows = await db.select().from(offers)
      .leftJoin(customers, eq(offers.customerId, customers.id))
      .where(and(isNull(offers.deletedAt), eq(offers.companyId, companyId), eq(offers.offerType, "enquiry")))
      .orderBy(desc(offers.date));

    const result = rows.map(r => ({ ...r.offers, customer: r.customers! }));

    const filtered = salesmanId != null
      ? result.filter(e => e.dealerId != null || e.salesmanUserId === salesmanId)
      : result;

    return await Promise.all(filtered.map(async (e) => {
      if (!e.dealerId) return { ...e, dealer: null };
      const dealer = await dealerRepository.getById(e.dealerId);
      if (salesmanId != null) {
        if (e.salesmanUserId === salesmanId) return { ...e, dealer: dealer ?? null };
        const linked = dealer?.dealerCompany?.linkedSalesmanId ?? dealer?.linkedSalesmanId;
        if (linked !== salesmanId) return null;
      }
      return { ...e, dealer: dealer ?? null };
    })).then(arr => arr.filter(Boolean) as (Offer & { customer: Customer; dealer?: DealerUser | null })[]);
  }

  async getByDealerId(companyId: number, dealerId: number): Promise<(Offer & { customer: Customer; linkedOfferId?: number | null; linkedOfferStatus?: string | null })[]> {
    const rows = await db.select().from(offers)
      .leftJoin(customers, eq(offers.customerId, customers.id))
      .where(and(eq(offers.companyId, companyId), eq(offers.dealerId, dealerId), eq(offers.offerType, "enquiry"), isNull(offers.deletedAt)))
      .orderBy(desc(offers.date));

    return await Promise.all(rows.map(async (r) => {
      const enquiry = { ...r.offers, customer: r.customers! };
      const [linked] = await db.select({ id: offers.id, status: offers.status }).from(offers).where(and(eq(offers.sourceEnquiryId, enquiry.id), isNull(offers.deletedAt))).orderBy(desc(offers.id));
      return { ...enquiry, linkedOfferId: linked?.id ?? null, linkedOfferStatus: linked?.status ?? null };
    }));
  }

  async getByDealerCompanyId(companyId: number, dealerCompanyId: number): Promise<(Offer & { customer: Customer; linkedOfferId?: number | null; linkedOfferStatus?: string | null })[]> {
    const companyDealerIds = await db
      .select({ id: dealerUsers.id })
      .from(dealerUsers)
      .where(eq(dealerUsers.dealerCompanyId, dealerCompanyId))
      .then(rows => rows.map(r => r.id));
    if (companyDealerIds.length === 0) return [];
    const rows = await db.select().from(offers)
      .leftJoin(customers, eq(offers.customerId, customers.id))
      .where(and(eq(offers.companyId, companyId), inArray(offers.dealerId, companyDealerIds), eq(offers.offerType, "enquiry"), isNull(offers.deletedAt)))
      .orderBy(desc(offers.date));

    return await Promise.all(rows.map(async (r) => {
      const enquiry = { ...r.offers, customer: r.customers! };
      const [linked] = await db.select({ id: offers.id, status: offers.status }).from(offers).where(and(eq(offers.sourceEnquiryId, enquiry.id), isNull(offers.deletedAt))).orderBy(desc(offers.id));
      return { ...enquiry, linkedOfferId: linked?.id ?? null, linkedOfferStatus: linked?.status ?? null };
    }));
  }

  async getBin(companyId: number, salesmanId?: number | null): Promise<(Offer & { customer: Customer; dealer?: DealerUser | null })[]> {
    const rows = await db.select().from(offers)
      .leftJoin(customers, eq(offers.customerId, customers.id))
      .where(and(isNotNull(offers.deletedAt), eq(offers.companyId, companyId), eq(offers.offerType, "enquiry")))
      .orderBy(desc(offers.deletedAt));

    const result = rows.map(r => ({ ...r.offers, customer: r.customers! }));

    const filtered = salesmanId != null
      ? result.filter(e => e.dealerId != null)
      : result;

    return await Promise.all(filtered.map(async (e) => {
      if (!e.dealerId) return { ...e, dealer: null };
      const dealer = await dealerRepository.getById(e.dealerId);
      if (salesmanId != null) {
        const linked = dealer?.dealerCompany?.linkedSalesmanId ?? dealer?.linkedSalesmanId;
        if (linked !== salesmanId) return null;
      }
      return { ...e, dealer: dealer ?? null };
    })).then(arr => arr.filter(Boolean) as (Offer & { customer: Customer; dealer?: DealerUser | null })[]);
  }

  async getBinByDealerId(companyId: number, dealerId: number): Promise<(Offer & { customer: Customer })[]> {
    const rows = await db.select().from(offers)
      .leftJoin(customers, eq(offers.customerId, customers.id))
      .where(and(eq(offers.companyId, companyId), eq(offers.dealerId, dealerId), eq(offers.offerType, "enquiry"), isNotNull(offers.deletedAt)))
      .orderBy(desc(offers.deletedAt));

    return rows.map(r => ({ ...r.offers, customer: r.customers! }));
  }

  async getBinByDealerCompanyId(companyId: number, dealerCompanyId: number): Promise<(Offer & { customer: Customer })[]> {
    const companyDealerIds = await db
      .select({ id: dealerUsers.id })
      .from(dealerUsers)
      .where(eq(dealerUsers.dealerCompanyId, dealerCompanyId))
      .then(rows => rows.map(r => r.id));
    if (companyDealerIds.length === 0) return [];
    const rows = await db.select().from(offers)
      .leftJoin(customers, eq(offers.customerId, customers.id))
      .where(and(eq(offers.companyId, companyId), inArray(offers.dealerId, companyDealerIds), eq(offers.offerType, "enquiry"), isNotNull(offers.deletedAt)))
      .orderBy(desc(offers.deletedAt));

    return rows.map(r => ({ ...r.offers, customer: r.customers! }));
  }

  async dealerBelongsToCompany(dealerId: number, dealerCompanyId: number): Promise<boolean> {
    const [dealer] = await db.select({ id: dealerUsers.id }).from(dealerUsers).where(and(eq(dealerUsers.id, dealerId), eq(dealerUsers.dealerCompanyId, dealerCompanyId)));
    return !!dealer;
  }

  async getAttachments(enquiryId: number): Promise<EnquiryAttachment[]> {
    return await db.select().from(enquiryAttachments).where(eq(enquiryAttachments.enquiryId, enquiryId)).orderBy(asc(enquiryAttachments.uploadedAt));
  }

  async addAttachment(data: { enquiryId: number; filename: string; originalName: string; mimetype: string; size: number }): Promise<EnquiryAttachment> {
    const [a] = await db.insert(enquiryAttachments).values(data).returning();
    return a;
  }

  async getAttachmentById(id: number): Promise<EnquiryAttachment | undefined> {
    const [a] = await db.select().from(enquiryAttachments).where(eq(enquiryAttachments.id, id));
    return a;
  }

  async getAttachmentByFilename(filename: string): Promise<EnquiryAttachment | undefined> {
    const [a] = await db.select().from(enquiryAttachments).where(eq(enquiryAttachments.filename, filename));
    return a;
  }

  async deleteAttachment(id: number): Promise<EnquiryAttachment | undefined> {
    const [d] = await db.delete(enquiryAttachments).where(eq(enquiryAttachments.id, id)).returning();
    return d;
  }

  async getLinkedOfferId(enquiryId: number): Promise<number | null> {
    const [linked] = await db.select({ id: offers.id }).from(offers)
      .where(and(
        eq(offers.sourceEnquiryId, enquiryId),
        isNull(offers.deletedAt),
        isNull(offers.sourceOfferId),
      ))
      .orderBy(desc(offers.id))
      .limit(1);
    return linked?.id ?? null;
  }

  async getAllLinkedOffers(enquiryId: number) {
    const cols = {
      id: offers.id,
      referenceNumber: offers.referenceNumber,
      status: offers.status,
      projectData: offers.projectData,
    };
    const directOffers = await db.select(cols).from(offers)
      .where(and(eq(offers.sourceEnquiryId, enquiryId), isNull(offers.deletedAt)))
      .orderBy(offers.id);

    const directIds = directOffers.map(o => o.id);
    if (directIds.length === 0) return directOffers;

    const allOffers = await db.select(cols).from(offers)
      .where(isNull(offers.deletedAt));

    const dealerVersions = allOffers.filter(o => {
      const pd = o.projectData as any;
      return pd?.dealerVersionOf && directIds.includes(pd.dealerVersionOf);
    });

    const merged = new Map([...directOffers, ...dealerVersions].map(o => [o.id, o]));
    return Array.from(merged.values()).sort((a, b) => a.id - b.id);
  }
}

export const enquiryRepository = new EnquiryRepository();
