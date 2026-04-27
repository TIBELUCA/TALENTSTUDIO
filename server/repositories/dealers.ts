import { db, eq, asc } from "./base";
import {
  dealerUsers, dealerLoginRecords, dealerCompanies, salesmanUsers, offers,
  type DealerUser, type DealerCompany,
} from "@shared/schema";
import bcrypt from "bcryptjs";

export type DealerCompanyWithMeta = DealerCompany & {
  contactCount: number;
  salesmanName?: string;
};

export type DealerUserWithCompany = DealerUser & {
  dealerCompany?: DealerCompany;
};

export class DealerRepository {

  // ─── Company CRUD ──────────────────────────────────────────────────────────

  async getAllCompanies(companyId: number): Promise<DealerCompanyWithMeta[]> {
    const all = await db.select().from(dealerCompanies).where(eq(dealerCompanies.companyId, companyId)).orderBy(asc(dealerCompanies.companyName));
    return await Promise.all(all.map(async (c) => {
      const contacts = await db.select().from(dealerUsers).where(eq(dealerUsers.dealerCompanyId, c.id));
      let salesmanName: string | undefined;
      if (c.linkedSalesmanId) {
        const [sm] = await db.select().from(salesmanUsers).where(eq(salesmanUsers.id, c.linkedSalesmanId));
        salesmanName = sm ? `${sm.name} ${sm.surname}`.trim() : undefined;
      }
      return { ...c, contactCount: contacts.length, salesmanName };
    }));
  }

  async getCompanyById(id: number): Promise<DealerCompany | undefined> {
    const [c] = await db.select().from(dealerCompanies).where(eq(dealerCompanies.id, id));
    return c;
  }

  async createCompany(companyId: number, data: {
    companyName: string;
    address?: string;
    vatNumber?: string;
    state?: string;
    city?: string;
    postalCode?: string;
    email?: string;
    phone?: string;
    notes?: string;
    linkedSalesmanId?: number | null;
    assignedCountries?: string[] | null;
  }): Promise<DealerCompany> {
    const [c] = await db.insert(dealerCompanies).values({
      companyId,
      companyName: data.companyName,
      address: data.address ?? "",
      vatNumber: data.vatNumber ?? "",
      state: data.state ?? "",
      city: data.city ?? "",
      postalCode: data.postalCode ?? "",
      email: data.email ?? "",
      phone: data.phone ?? "",
      notes: data.notes ?? "",
      linkedSalesmanId: data.linkedSalesmanId ?? null,
      assignedCountries: data.assignedCountries ?? null,
      isActive: true,
    }).returning();
    return c;
  }

  async updateCompany(id: number, data: {
    companyName?: string;
    address?: string;
    vatNumber?: string;
    state?: string;
    city?: string;
    postalCode?: string;
    email?: string;
    phone?: string;
    notes?: string;
    linkedSalesmanId?: number | null;
    isActive?: boolean;
    docLogoUrl?: string | null;
    docFooterLines?: string[] | null;
    docTermsText?: string | null;
    assignedCountries?: string[] | null;
  }): Promise<DealerCompany> {
    const update: any = {};
    if (data.companyName !== undefined) update.companyName = data.companyName;
    if (data.address !== undefined) update.address = data.address;
    if (data.vatNumber !== undefined) update.vatNumber = data.vatNumber;
    if (data.state !== undefined) update.state = data.state;
    if (data.city !== undefined) update.city = data.city;
    if (data.postalCode !== undefined) update.postalCode = data.postalCode;
    if (data.email !== undefined) update.email = data.email;
    if (data.phone !== undefined) update.phone = data.phone;
    if (data.notes !== undefined) update.notes = data.notes;
    if (data.linkedSalesmanId !== undefined) update.linkedSalesmanId = data.linkedSalesmanId;
    if (data.isActive !== undefined) update.isActive = data.isActive;
    if (data.docLogoUrl !== undefined) update.docLogoUrl = data.docLogoUrl;
    if (data.docFooterLines !== undefined) update.docFooterLines = data.docFooterLines;
    if (data.docTermsText !== undefined) update.docTermsText = data.docTermsText;
    if (data.assignedCountries !== undefined) update.assignedCountries = data.assignedCountries;
    const [c] = await db.update(dealerCompanies).set(update).where(eq(dealerCompanies.id, id)).returning();
    if (!c) throw new Error("Dealer company not found");
    return c;
  }

  async deleteCompany(id: number): Promise<void> {
    const contacts = await db.select().from(dealerUsers).where(eq(dealerUsers.dealerCompanyId, id));
    for (const contact of contacts) {
      await db.delete(dealerLoginRecords).where(eq(dealerLoginRecords.dealerId, contact.id));
      await db.update(offers).set({ dealerId: null } as any).where(eq(offers.dealerId, contact.id));
    }
    await db.delete(dealerUsers).where(eq(dealerUsers.dealerCompanyId, id));
    await db.delete(dealerCompanies).where(eq(dealerCompanies.id, id));
  }

  // ─── Contact CRUD ──────────────────────────────────────────────────────────

  async getContactsByCompanyId(dealerCompanyId: number): Promise<DealerUser[]> {
    return db.select().from(dealerUsers).where(eq(dealerUsers.dealerCompanyId, dealerCompanyId)).orderBy(asc(dealerUsers.name));
  }

  async createContact(dealerCompanyId: number, companyId: number, data: {
    email: string;
    name: string;
    surname?: string;
    mobileNumber?: string;
    password: string;
    role?: string;
  }): Promise<DealerUser> {
    const passwordHash = await bcrypt.hash(data.password, 12);
    const [d] = await db.insert(dealerUsers).values({
      companyId,
      dealerCompanyId,
      email: data.email,
      name: data.name,
      surname: data.surname ?? "",
      mobileNumber: data.mobileNumber ?? "",
      role: data.role ?? "",
      passwordHash,
      isActive: true,
    }).returning();
    return d;
  }

  async updateContact(id: number, data: {
    email?: string;
    name?: string;
    surname?: string;
    mobileNumber?: string;
    password?: string;
    role?: string;
    isActive?: boolean;
  }): Promise<DealerUser> {
    const update: any = {};
    if (data.email !== undefined) update.email = data.email;
    if (data.name !== undefined) update.name = data.name;
    if (data.surname !== undefined) update.surname = data.surname;
    if (data.mobileNumber !== undefined) update.mobileNumber = data.mobileNumber;
    if (data.role !== undefined) update.role = data.role;
    if (data.password !== undefined) {
      update.passwordHash = await bcrypt.hash(data.password, 12);
    }
    if (data.isActive !== undefined) update.isActive = data.isActive;
    const [d] = await db.update(dealerUsers).set(update).where(eq(dealerUsers.id, id)).returning();
    if (!d) throw new Error("Contact not found");
    return d;
  }

  async deleteContact(id: number): Promise<void> {
    await db.delete(dealerLoginRecords).where(eq(dealerLoginRecords.dealerId, id));
    await db.update(offers).set({ dealerId: null } as any).where(eq(offers.dealerId, id));
    await db.delete(dealerUsers).where(eq(dealerUsers.id, id));
  }

  // ─── Auth / session helpers ────────────────────────────────────────────────

  async getAll(companyId: number): Promise<(DealerUser & { salesmanName?: string })[]> {
    const all = await db.select().from(dealerUsers).where(eq(dealerUsers.companyId, companyId)).orderBy(asc(dealerUsers.name));
    return await Promise.all(all.map(async (d) => {
      const linkedId = d.linkedSalesmanId;
      if (linkedId) {
        const [sm] = await db.select().from(salesmanUsers).where(eq(salesmanUsers.id, linkedId));
        return { ...d, salesmanName: sm ? `${sm.name} ${sm.surname}`.trim() : undefined };
      }
      return { ...d, salesmanName: undefined };
    }));
  }

  async getById(id: number): Promise<DealerUserWithCompany | undefined> {
    const [d] = await db.select().from(dealerUsers).where(eq(dealerUsers.id, id));
    if (!d) return undefined;
    let dealerCompany: DealerCompany | undefined;
    if (d.dealerCompanyId) {
      const [c] = await db.select().from(dealerCompanies).where(eq(dealerCompanies.id, d.dealerCompanyId));
      dealerCompany = c;
    }
    return { ...d, dealerCompany };
  }

  async getByEmail(email: string): Promise<DealerUser | undefined> {
    const [d] = await db.select().from(dealerUsers).where(eq(dealerUsers.email, email));
    return d;
  }

  async create(companyId: number, data: { email: string; name: string; surname: string; mobileNumber?: string; password: string; linkedSalesmanId?: number | null }): Promise<DealerUser> {
    const passwordHash = await bcrypt.hash(data.password, 12);
    const [d] = await db.insert(dealerUsers).values({
      companyId,
      email: data.email,
      name: data.name,
      surname: data.surname ?? "",
      mobileNumber: data.mobileNumber ?? "",
      passwordHash,
      linkedSalesmanId: data.linkedSalesmanId ?? null,
      isActive: true,
    }).returning();
    return d;
  }

  async update(id: number, data: { email?: string; name?: string; surname?: string; mobileNumber?: string; password?: string; isActive?: boolean; linkedSalesmanId?: number | null }): Promise<DealerUser> {
    const update: any = {};
    if (data.email !== undefined) update.email = data.email;
    if (data.name !== undefined) update.name = data.name;
    if (data.surname !== undefined) update.surname = data.surname;
    if (data.mobileNumber !== undefined) update.mobileNumber = data.mobileNumber;
    if (data.password !== undefined) {
      update.passwordHash = await bcrypt.hash(data.password, 12);
    }
    if (data.isActive !== undefined) update.isActive = data.isActive;
    if (data.linkedSalesmanId !== undefined) update.linkedSalesmanId = data.linkedSalesmanId;
    const [d] = await db.update(dealerUsers).set(update).where(eq(dealerUsers.id, id)).returning();
    if (!d) throw new Error("Dealer not found");
    return d;
  }

  async delete(id: number): Promise<void> {
    await db.delete(dealerLoginRecords).where(eq(dealerLoginRecords.dealerId, id));
    await db.update(offers).set({ dealerId: null } as any).where(eq(offers.dealerId, id));
    await db.delete(dealerUsers).where(eq(dealerUsers.id, id));
  }

  async recordLogin(dealerId: number): Promise<void> {
    await db.insert(dealerLoginRecords).values({ dealerId });
  }
}

export const dealerRepository = new DealerRepository();
