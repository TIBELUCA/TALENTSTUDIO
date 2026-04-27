import { db, eq, and, sql, isNull } from "./base";
import { customers, contacts, offers, productionFacilities, dealerUsers, type Customer, type InsertCustomer } from "@shared/schema";

export class CustomerRepository {
  async getAll(companyId: number): Promise<Customer[]> {
    return await db.select().from(customers).where(and(eq(customers.companyId, companyId), isNull(customers.mergedIntoId)));
  }

  async getByDealerId(dealerId: number): Promise<Customer[]> {
    return await db.select().from(customers).where(and(eq(customers.dealerId, dealerId), isNull(customers.mergedIntoId)));
  }

  async getByDealerCompanyId(dealerCompanyId: number): Promise<Customer[]> {
    return await db
      .select({ customer: customers })
      .from(customers)
      .innerJoin(dealerUsers, eq(customers.dealerId, dealerUsers.id))
      .where(and(eq(dealerUsers.dealerCompanyId, dealerCompanyId), isNull(customers.mergedIntoId)))
      .then(rows => rows.map(r => r.customer));
  }

  async belongsToDealerCompany(customerId: number, dealerCompanyId: number): Promise<boolean> {
    const [row] = await db
      .select({ id: customers.id })
      .from(customers)
      .innerJoin(dealerUsers, eq(customers.dealerId, dealerUsers.id))
      .where(and(eq(customers.id, customerId), eq(dealerUsers.dealerCompanyId, dealerCompanyId)));
    return !!row;
  }

  async getById(id: number): Promise<Customer | undefined> {
    const [c] = await db.select().from(customers).where(eq(customers.id, id));
    return c;
  }

  async create(customer: InsertCustomer): Promise<Customer> {
    const [c] = await db.insert(customers).values(customer).returning();
    return c;
  }

  async update(id: number, customer: Partial<InsertCustomer>): Promise<Customer> {
    const [c] = await db.update(customers).set({ ...customer, updatedAt: new Date() }).where(eq(customers.id, id)).returning();
    return c;
  }

  async delete(id: number): Promise<void> {
    await db.delete(customers).where(eq(customers.id, id));
  }

  async mergeInto(sourceId: number, targetId: number, companyId: number, performedBy: string): Promise<{
    offersUpdated: number;
    contactsMoved: number;
    facilitiesMoved: number;
    endCustomerRefsUpdated: number;
  }> {
    return await db.transaction(async (tx) => {
      const offersResult = await tx.update(offers)
        .set({ customerId: targetId })
        .where(and(eq(offers.customerId, sourceId), eq(offers.companyId, companyId)))
        .returning({ id: offers.id });
      const offersUpdated = offersResult.length;

      const endCustResult = await tx.execute(sql`
        UPDATE offers
        SET project_data = jsonb_set(
          project_data,
          '{commercial,endCustomerId}',
          ${targetId}::text::jsonb
        )
        WHERE project_data->'commercial'->>'endCustomerId' = ${String(sourceId)}
        AND company_id = ${companyId}
        AND deleted_at IS NULL
      `) as any;
      const endCustomerRefsUpdated = endCustResult.rowCount ?? 0;

      const contactsResult = await tx.update(contacts)
        .set({ customerId: targetId, updatedAt: new Date() })
        .where(eq(contacts.customerId, sourceId))
        .returning({ id: contacts.id });
      const contactsMoved = contactsResult.length;

      const facilitiesResult = await tx.update(productionFacilities)
        .set({ customerId: targetId, updatedAt: new Date() })
        .where(eq(productionFacilities.customerId, sourceId))
        .returning({ id: productionFacilities.id });
      const facilitiesMoved = facilitiesResult.length;

      await tx.update(customers)
        .set({
          mergedIntoId: targetId,
          accountStatus: "Merged",
          updatedAt: new Date(),
          updatedBy: performedBy,
        })
        .where(and(eq(customers.id, sourceId), eq(customers.companyId, companyId)));

      return { offersUpdated, contactsMoved, facilitiesMoved, endCustomerRefsUpdated };
    });
  }
}

export const customerRepository = new CustomerRepository();
