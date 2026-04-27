import { db, eq, and, inArray, isNotNull } from "./base";
import { contacts, customers, type Contact, type InsertContact } from "@shared/schema";

export class ContactRepository {
  async getAllByCompanyId(companyId: number): Promise<Contact[]> {
    return await db
      .select({ contact: contacts })
      .from(contacts)
      .innerJoin(customers, eq(contacts.customerId, customers.id))
      .where(eq(customers.companyId, companyId))
      .orderBy(contacts.lastName)
      .then(rows => rows.map(r => r.contact));
  }

  async getByCustomerId(customerId: number): Promise<Contact[]> {
    return await db.select().from(contacts).where(eq(contacts.customerId, customerId));
  }

  async getById(id: number): Promise<Contact | undefined> {
    const [c] = await db.select().from(contacts).where(eq(contacts.id, id));
    return c;
  }

  async getByIdAndCompany(id: number, companyId: number): Promise<Contact | undefined> {
    const rows = await db
      .select({ contact: contacts })
      .from(contacts)
      .innerJoin(customers, eq(contacts.customerId, customers.id))
      .where(and(eq(contacts.id, id), eq(customers.companyId, companyId)));
    return rows[0]?.contact;
  }

  async create(contact: InsertContact): Promise<Contact> {
    const [c] = await db.insert(contacts).values(contact).returning();
    return c;
  }

  async update(id: number, contact: Partial<InsertContact>): Promise<Contact> {
    const [c] = await db
      .update(contacts)
      .set({ ...contact, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning();
    return c;
  }

  async getByDealerCustomerIds(customerIds: number[]): Promise<Contact[]> {
    if (customerIds.length === 0) return [];
    return await db
      .select()
      .from(contacts)
      .where(inArray(contacts.customerId, customerIds))
      .orderBy(contacts.lastName);
  }

  async delete(id: number): Promise<void> {
    await db.delete(contacts).where(eq(contacts.id, id));
  }

  async getByCompanyExternalIdMap(companyId: number): Promise<Map<string, Contact>> {
    const rows = await db
      .select({ contact: contacts })
      .from(contacts)
      .innerJoin(customers, eq(contacts.customerId, customers.id))
      .where(and(eq(customers.companyId, companyId), isNotNull(contacts.externalId)));
    const map = new Map<string, Contact>();
    for (const r of rows) {
      const eid = r.contact.externalId;
      if (eid) map.set(String(eid), r.contact);
    }
    return map;
  }
}

export const contactRepository = new ContactRepository();
