import { db, eq } from "./base";
import { presets, type Preset, type InsertPreset } from "@shared/schema";

export class PresetRepository {
  async getAll(companyId: number): Promise<Preset[]> {
    return await db.select().from(presets).where(eq(presets.companyId, companyId));
  }

  async create(preset: InsertPreset): Promise<Preset> {
    const [p] = await db.insert(presets).values(preset).returning();
    return p;
  }

  async update(id: number, preset: Partial<InsertPreset>): Promise<Preset> {
    const [updated] = await db.update(presets).set(preset).where(eq(presets.id, id)).returning();
    if (!updated) throw new Error("Preset not found");
    return updated;
  }

  async delete(id: number): Promise<void> {
    await db.delete(presets).where(eq(presets.id, id));
  }
}

export const presetRepository = new PresetRepository();
