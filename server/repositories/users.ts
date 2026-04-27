import { db, eq, desc, asc } from "./base";
import {
  salesmanUsers, salesmanLoginRecords, activityLogs,
  type SalesmanUser, type SalesmanLoginRecord,
  DEFAULT_SALESMAN_FEATURES,
} from "@shared/schema";
import bcrypt from "bcryptjs";

export class UserRepository {
  async getAll(companyId: number): Promise<(SalesmanUser & { loginCount: number; lastLogin: Date | null; activityCount: number })[]> {
    const all = await db.select().from(salesmanUsers).where(eq(salesmanUsers.companyId, companyId)).orderBy(asc(salesmanUsers.name));
    return await Promise.all(all.map(async (s) => {
      const records = await db.select().from(salesmanLoginRecords)
        .where(eq(salesmanLoginRecords.salesmanUserId, s.id))
        .orderBy(desc(salesmanLoginRecords.loginAt));
      const activities = await db.select({ id: activityLogs.id }).from(activityLogs)
        .where(eq(activityLogs.salesmanUserId, s.id));
      return {
        ...s,
        loginCount: records.length,
        lastLogin: records.length > 0 ? records[0].loginAt : null,
        activityCount: activities.length,
      };
    }));
  }

  async getById(id: number): Promise<SalesmanUser | undefined> {
    const [s] = await db.select().from(salesmanUsers).where(eq(salesmanUsers.id, id));
    return s;
  }

  async getByEmail(email: string): Promise<SalesmanUser | undefined> {
    const [s] = await db.select().from(salesmanUsers).where(eq(salesmanUsers.email, email));
    return s;
  }

  async create(companyId: number, data: { email: string; name: string; surname: string; mobileNumber?: string; password?: string; features: any; isMasterSalesman?: boolean; role?: string; parentSalesmanIds?: number[] | null; assignedCountries?: string[] | null }): Promise<SalesmanUser> {
    const passwordHash = data.password ? await bcrypt.hash(data.password, 12) : "GOOGLE_OAUTH_USER";
    const ids = Array.isArray(data.parentSalesmanIds) ? data.parentSalesmanIds.filter((n) => typeof n === "number") : [];
    const [s] = await db.insert(salesmanUsers).values({
      companyId,
      email: data.email,
      name: data.name,
      surname: data.surname ?? "",
      mobileNumber: data.mobileNumber ?? "",
      passwordHash,
      features: data.features ?? DEFAULT_SALESMAN_FEATURES,
      isActive: true,
      isMasterSalesman: data.isMasterSalesman ?? false,
      role: data.role ?? "salesman",
      parentSalesmanId: ids.length > 0 ? ids[0] : null,
      parentSalesmanIds: ids,
      assignedCountries: data.assignedCountries ?? null,
    }).returning();
    return s;
  }

  async update(id: number, data: { email?: string; name?: string; surname?: string; mobileNumber?: string; password?: string; features?: any; isActive?: boolean; isMasterSalesman?: boolean; role?: string; parentSalesmanIds?: number[] | null; assignedCountries?: string[] | null }): Promise<SalesmanUser> {
    const update: any = {};
    if (data.email !== undefined) update.email = data.email;
    if (data.name !== undefined) update.name = data.name;
    if (data.surname !== undefined) update.surname = data.surname;
    if (data.mobileNumber !== undefined) update.mobileNumber = data.mobileNumber;
    if (data.password !== undefined) {
      update.passwordHash = await bcrypt.hash(data.password, 12);
    }
    if (data.features !== undefined) update.features = data.features;
    if (data.isActive !== undefined) update.isActive = data.isActive;
    if (data.isMasterSalesman !== undefined) update.isMasterSalesman = data.isMasterSalesman;
    if (data.role !== undefined) update.role = data.role;
    if (data.parentSalesmanIds !== undefined) {
      const ids = Array.isArray(data.parentSalesmanIds) ? data.parentSalesmanIds.filter((n) => typeof n === "number") : [];
      update.parentSalesmanIds = ids;
      // Mirror first id into legacy single-fk column for backward compatibility.
      update.parentSalesmanId = ids.length > 0 ? ids[0] : null;
    }
    if (data.assignedCountries !== undefined) update.assignedCountries = data.assignedCountries;
    const [s] = await db.update(salesmanUsers).set(update).where(eq(salesmanUsers.id, id)).returning();
    if (!s) throw new Error("Salesman user not found");
    return s;
  }

  async getSalesmen(companyId: number): Promise<SalesmanUser[]> {
    return await db.select().from(salesmanUsers)
      .where(eq(salesmanUsers.companyId, companyId))
      .orderBy(asc(salesmanUsers.name));
  }

  async delete(id: number): Promise<void> {
    await db.delete(salesmanLoginRecords).where(eq(salesmanLoginRecords.salesmanUserId, id));
    await db.delete(activityLogs).where(eq(activityLogs.salesmanUserId, id));
    await db.delete(salesmanUsers).where(eq(salesmanUsers.id, id));
  }

  async recordLogin(salesmanUserId: number, deviceInfo?: string, ipAddress?: string): Promise<void> {
    await db.insert(salesmanLoginRecords).values({
      salesmanUserId,
      deviceInfo: deviceInfo ?? null,
      ipAddress: ipAddress ?? null,
    });
  }

  async getLoginHistory(salesmanUserId: number): Promise<SalesmanLoginRecord[]> {
    return await db.select().from(salesmanLoginRecords)
      .where(eq(salesmanLoginRecords.salesmanUserId, salesmanUserId))
      .orderBy(desc(salesmanLoginRecords.loginAt));
  }
}

export const userRepository = new UserRepository();
