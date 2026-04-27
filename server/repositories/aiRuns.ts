import { db, eq, desc, and } from "./base";
import {
  aiRuns,
  aiFeedback,
  type AiRunRecord,
  type InsertAiRun,
  type AiFeedbackRecord,
  type InsertAiFeedback,
} from "@shared/schema";

export class AiRunRepository {
  async create(data: InsertAiRun): Promise<AiRunRecord> {
    const [run] = await db.insert(aiRuns).values(data).returning();
    return run;
  }

  async update(id: string, data: Partial<{
    status: string;
    output: unknown;
    error: string | null;
    model: string;
    provider: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
    durationMs: number | null;
    completedAt: Date | null;
  }>): Promise<AiRunRecord> {
    const [updated] = await db.update(aiRuns)
      .set({ ...data, updatedAt: new Date() } as Record<string, unknown>)
      .where(eq(aiRuns.id, id))
      .returning();
    if (!updated) throw new Error(`AI run not found: ${id}`);
    return updated;
  }

  async getById(id: string): Promise<AiRunRecord | undefined> {
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, id));
    return run;
  }

  async getAll(filter?: {
    workflow?: string;
    status?: string;
    offerId?: number;
    enquiryId?: number;
    entityType?: string;
    entityId?: number;
    limit?: number;
  }): Promise<AiRunRecord[]> {
    const conditions = [];
    if (filter?.workflow !== undefined) conditions.push(eq(aiRuns.workflow, filter.workflow));
    if (filter?.status !== undefined) conditions.push(eq(aiRuns.status, filter.status));
    if (filter?.offerId !== undefined) conditions.push(eq(aiRuns.offerId, filter.offerId));
    if (filter?.enquiryId !== undefined) conditions.push(eq(aiRuns.enquiryId, filter.enquiryId));
    if (filter?.entityType !== undefined) conditions.push(eq(aiRuns.entityType, filter.entityType));
    if (filter?.entityId !== undefined) conditions.push(eq(aiRuns.entityId, filter.entityId));

    let query = db.select().from(aiRuns);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }
    query = query.orderBy(desc(aiRuns.createdAt)) as typeof query;
    if (filter?.limit) {
      query = query.limit(filter.limit) as typeof query;
    }
    return await query;
  }
}

export class AiFeedbackRepository {
  async create(data: InsertAiFeedback): Promise<AiFeedbackRecord> {
    const [feedback] = await db.insert(aiFeedback).values(data).returning();
    return feedback;
  }

  async getByRunId(runId: string): Promise<AiFeedbackRecord[]> {
    return await db.select().from(aiFeedback)
      .where(eq(aiFeedback.runId, runId))
      .orderBy(desc(aiFeedback.createdAt));
  }

  async getAll(limit = 100): Promise<AiFeedbackRecord[]> {
    return await db.select().from(aiFeedback)
      .orderBy(desc(aiFeedback.createdAt))
      .limit(limit);
  }

  async getStats(): Promise<{
    total: number;
    accepted: number;
    rejected: number;
    modified: number;
  }> {
    const all = await db.select().from(aiFeedback);
    return {
      total: all.length,
      accepted: all.filter(f => f.rating === "accepted").length,
      rejected: all.filter(f => f.rating === "rejected").length,
      modified: all.filter(f => f.rating === "modified").length,
    };
  }
}

export const aiRunRepository = new AiRunRepository();
export const aiFeedbackRepository = new AiFeedbackRepository();
