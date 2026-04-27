import { db, eq, desc } from "./base";
import { activityLogs, type ActivityLog } from "@shared/schema";

export class ActivityRepository {
  async record(params: {
    salesmanUserId?: number | null;
    dealerUserId?: number | null;
    performedBy: string;
    action: string;
    offerId?: number;
    offerReference?: string;
    meta?: Record<string, unknown> | null;
  }): Promise<void> {
    await db.insert(activityLogs).values({
      salesmanUserId: params.salesmanUserId ?? null,
      dealerUserId: params.dealerUserId ?? null,
      performedBy: params.performedBy,
      action: params.action,
      offerId: params.offerId ?? null,
      offerReference: params.offerReference ?? null,
      meta: params.meta ?? null,
    });
  }

  async getBySalesmanId(salesmanUserId: number): Promise<ActivityLog[]> {
    return await db.select().from(activityLogs)
      .where(eq(activityLogs.salesmanUserId, salesmanUserId))
      .orderBy(desc(activityLogs.createdAt));
  }

  async getAll(companyId?: number): Promise<ActivityLog[]> {
    return await db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt));
  }
}

export const activityRepository = new ActivityRepository();
