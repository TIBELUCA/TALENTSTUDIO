import { db } from "../db";
import { customMachines, customMachineOptions } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export const customMachineRepository = {
  async list(companyId?: number) {
    const rows = await db.select().from(customMachines)
      .where(companyId ? eq(customMachines.companyId, companyId) : undefined)
      .orderBy(desc(customMachines.createdAt));
    const allOpts = await db.select().from(customMachineOptions);
    return rows.map(m => ({
      ...m,
      options: allOpts.filter(o => o.customMachineId === m.id),
    }));
  },

  async getById(id: number) {
    const [row] = await db.select().from(customMachines).where(eq(customMachines.id, id));
    if (!row) return null;
    const opts = await db.select().from(customMachineOptions)
      .where(eq(customMachineOptions.customMachineId, id));
    return { ...row, options: opts };
  },

  async create(data: {
    companyId?: number;
    name: string;
    description: string;
    basePrice: string;
    imageUrl?: string | null;
    detailImages?: string[] | null;
    titles?: Record<string, string> | null;
    descriptions?: Record<string, string> | null;
    createdBy?: number;
    createdByName?: string;
    options?: { name: string; price: string; quantity: number }[];
  }) {
    const [machine] = await db.insert(customMachines).values({
      companyId: data.companyId ?? null,
      name: data.name,
      description: data.description,
      basePrice: data.basePrice,
      imageUrl: data.imageUrl ?? null,
      detailImages: data.detailImages ?? null,
      titles: data.titles ?? null,
      descriptions: data.descriptions ?? null,
      createdBy: data.createdBy ?? null,
      createdByName: data.createdByName ?? null,
    }).returning();

    if (data.options?.length) {
      for (const opt of data.options) {
        await db.insert(customMachineOptions).values({
          customMachineId: machine.id,
          name: opt.name,
          price: opt.price,
          quantity: opt.quantity,
        });
      }
    }

    return this.getById(machine.id);
  },

  async update(id: number, data: {
    name?: string;
    description?: string;
    basePrice?: string;
    imageUrl?: string | null;
    detailImages?: string[] | null;
    titles?: Record<string, string> | null;
    descriptions?: Record<string, string> | null;
    options?: { name: string; price: string; quantity: number }[];
  }) {
    const updates: any = { updatedAt: new Date() };
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.basePrice !== undefined) updates.basePrice = data.basePrice;
    if (data.imageUrl !== undefined) updates.imageUrl = data.imageUrl;
    if (data.detailImages !== undefined) updates.detailImages = data.detailImages;
    if (data.titles !== undefined) updates.titles = data.titles;
    if (data.descriptions !== undefined) updates.descriptions = data.descriptions;

    await db.update(customMachines).set(updates).where(eq(customMachines.id, id));

    if (data.options !== undefined) {
      await db.delete(customMachineOptions).where(eq(customMachineOptions.customMachineId, id));
      for (const opt of data.options) {
        await db.insert(customMachineOptions).values({
          customMachineId: id,
          name: opt.name,
          price: opt.price,
          quantity: opt.quantity,
        });
      }
    }

    return this.getById(id);
  },

  async remove(id: number) {
    await db.delete(customMachineOptions).where(eq(customMachineOptions.customMachineId, id));
    await db.delete(customMachines).where(eq(customMachines.id, id));
  },
};
