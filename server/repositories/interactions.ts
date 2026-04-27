import { db, eq, desc, and, gte, lte, isNull } from "./base";
import { interactions, type Interaction, type InsertInteraction, customers, contacts, offers, jobOrders } from "@shared/schema";

export class InteractionRepository {
  async create(data: InsertInteraction): Promise<Interaction> {
    const [interaction] = await db.insert(interactions).values(data).returning();
    return interaction;
  }

  async getById(id: number): Promise<Interaction | undefined> {
    const [interaction] = await db.select().from(interactions).where(eq(interactions.id, id));
    return interaction;
  }

  async update(id: number, data: Partial<InsertInteraction>): Promise<Interaction | undefined> {
    const [interaction] = await db.update(interactions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(interactions.id, id))
      .returning();
    return interaction;
  }

  async delete(id: number): Promise<void> {
    await db.delete(interactions).where(eq(interactions.id, id));
  }

  async list(filters: {
    companyId?: number;
    customerId?: number;
    contactId?: number;
    salesmanUserId?: number;
    dealerUserId?: number;
    dateFrom?: Date;
    dateTo?: Date;
    type?: string;
    direction?: string;
    linkedJobOrderId?: number;
  } = {}): Promise<(Interaction & { customerName?: string; contactName?: string; offerReference?: string; jobOrderReference?: string })[]> {
    const conditions: any[] = [];

    if (filters.companyId != null) conditions.push(eq(interactions.companyId, filters.companyId));
    if (filters.customerId != null) conditions.push(eq(interactions.customerId, filters.customerId));
    if (filters.contactId != null) conditions.push(eq(interactions.contactId, filters.contactId));
    if (filters.salesmanUserId != null) conditions.push(eq(interactions.salesmanUserId, filters.salesmanUserId));
    if (filters.dealerUserId != null) conditions.push(eq(interactions.dealerUserId, filters.dealerUserId));
    if (filters.dateFrom) conditions.push(gte(interactions.date, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(interactions.date, filters.dateTo));
    if (filters.type) conditions.push(eq(interactions.type, filters.type));
    if (filters.direction) conditions.push(eq(interactions.direction, filters.direction));
    if (filters.linkedJobOrderId != null) conditions.push(eq(interactions.linkedJobOrderId, filters.linkedJobOrderId));

    const rows = await db
      .select({
        interaction: interactions,
        customerName: customers.name,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        offerReference: offers.referenceNumber,
        offerSubject: offers.subject,
        jobOrderNumber: jobOrders.jobNumber,
      })
      .from(interactions)
      .leftJoin(customers, eq(interactions.customerId, customers.id))
      .leftJoin(contacts, eq(interactions.contactId, contacts.id))
      .leftJoin(offers, eq(interactions.linkedOfferId, offers.id))
      .leftJoin(jobOrders, eq(interactions.linkedJobOrderId, jobOrders.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(interactions.date));

    return rows.map(r => ({
      ...r.interaction,
      customerName: r.customerName ?? undefined,
      contactName: r.contactFirstName && r.contactLastName
        ? `${r.contactFirstName} ${r.contactLastName}`
        : r.contactFirstName || r.contactLastName || undefined,
      offerReference: r.offerReference
        ? `${r.offerReference}${r.offerSubject ? ` – ${r.offerSubject}` : ""}`
        : undefined,
      jobOrderReference: r.jobOrderNumber ?? undefined,
    }));
  }
}

export const interactionRepository = new InteractionRepository();
