import { db, eq } from "./base";
import { customers, contacts } from "@shared/schema";
import { AppError } from "../errors";

/**
 * Verifies a customer (brand) exists and is strictly scoped to the given
 * tenant. Legacy customers with NULL companyId are refused to prevent any
 * residual cross-tenant leak path through unscoped pre-existing data.
 */
export async function assertBrandInTenant(
  customerId: number,
  companyId: number,
): Promise<void> {
  const [c] = await db
    .select({ id: customers.id, companyId: customers.companyId })
    .from(customers)
    .where(eq(customers.id, customerId));
  if (!c) throw AppError.badRequest("Brand non trovato");
  if (c.companyId !== companyId) {
    throw AppError.forbidden("Brand non appartiene a questa azienda");
  }
}

/**
 * Verifies a contact exists, belongs to the given customer, and the customer
 * itself is in the tenant.
 */
export async function assertContactBelongsToBrand(
  contactId: number,
  customerId: number,
  companyId: number,
): Promise<void> {
  const [c] = await db
    .select({ id: contacts.id, customerId: contacts.customerId })
    .from(contacts)
    .where(eq(contacts.id, contactId));
  if (!c) throw AppError.badRequest("Contatto non trovato");
  if (c.customerId !== customerId) {
    throw AppError.badRequest("Contatto non collegato al brand selezionato");
  }
  await assertBrandInTenant(customerId, companyId);
}
