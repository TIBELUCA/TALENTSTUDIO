import { db, eq, and, sql } from "./base";
import { ne, asc } from "drizzle-orm";
import {
  machines, machineOptions,
  type Machine, type InsertMachine,
  type MachineOption, type InsertMachineOption,
  type MachineWithOptions,
} from "@shared/schema";

export class MachineRepository {
  async getAll(companyId: number): Promise<MachineWithOptions[]> {
    const allMachines = await db.select().from(machines).where(eq(machines.companyId, companyId)).orderBy(sql`${machines.seqNum} ASC NULLS LAST`, asc(machines.id));
    const result: MachineWithOptions[] = [];
    for (const m of allMachines) {
      const options = await db.select().from(machineOptions).where(eq(machineOptions.machineId, m.id));
      result.push({ ...m, options });
    }
    return result;
  }

  async getById(id: number): Promise<MachineWithOptions | undefined> {
    const [m] = await db.select().from(machines).where(eq(machines.id, id));
    if (!m) return undefined;
    const options = await db.select().from(machineOptions).where(eq(machineOptions.machineId, m.id));
    return { ...m, options };
  }

  async getByName(companyId: number, name: string): Promise<MachineWithOptions | undefined> {
    const [m] = await db.select().from(machines).where(and(eq(machines.companyId, companyId), eq(machines.name, name)));
    if (!m) return undefined;
    const options = await db.select().from(machineOptions).where(eq(machineOptions.machineId, m.id));
    return { ...m, options };
  }

  async getFamilies(companyId: number): Promise<{ family: string; count: number }[]> {
    const result = await db
      .select({
        family: machines.macroType,
        count: sql<number>`count(*)::int`,
      })
      .from(machines)
      .where(eq(machines.companyId, companyId))
      .groupBy(machines.macroType);
    return result.map(r => ({
      family: r.family || "Other",
      count: r.count,
    }));
  }

  async getByFamily(companyId: number, family: string): Promise<MachineWithOptions[]> {
    const condition = family === "Other"
      ? and(eq(machines.companyId, companyId), sql`${machines.macroType} IS NULL`)
      : and(eq(machines.companyId, companyId), eq(machines.macroType, family));
    const allMachines = await db.select().from(machines).where(condition!).orderBy(sql`${machines.seqNum} ASC NULLS LAST`, asc(machines.id));
    const result: MachineWithOptions[] = [];
    for (const m of allMachines) {
      const options = await db.select().from(machineOptions).where(eq(machineOptions.machineId, m.id));
      result.push({ ...m, options });
    }
    return result;
  }

  async create(machine: InsertMachine, companyId?: number): Promise<Machine> {
    const [m] = await db.insert(machines).values({ ...machine, companyId: companyId ?? machine.companyId }).returning();
    return m;
  }

  async update(id: number, machine: Partial<InsertMachine>): Promise<Machine> {
    const [m] = await db.update(machines).set(machine).where(eq(machines.id, id)).returning();
    return m;
  }

  async delete(id: number): Promise<void> {
    await db.delete(machineOptions).where(eq(machineOptions.machineId, id));
    await db.delete(machines).where(eq(machines.id, id));
  }

  async getOptionById(id: number): Promise<MachineOption | undefined> {
    const [o] = await db.select().from(machineOptions).where(eq(machineOptions.id, id));
    return o;
  }

  async createOption(option: InsertMachineOption): Promise<MachineOption> {
    const [o] = await db.insert(machineOptions).values(option).returning();
    return o;
  }

  async updateOption(id: number, option: Partial<InsertMachineOption>): Promise<MachineOption> {
    const [o] = await db.update(machineOptions).set(option).where(eq(machineOptions.id, id)).returning();
    return o;
  }

  async deleteOption(id: number): Promise<void> {
    await db.delete(machineOptions).where(eq(machineOptions.id, id));
  }

  async importMachines(rows: {
    type: 'M' | 'O';
    seqNum?: number;
    code: string;
    macroType?: string;
    name: string;
    titles?: Record<string, string>;
    price: number;
    electricalPower?: number;
    compressedAir?: number;
    exhaustedAir?: number;
    airIntroduced?: number;
    installationDays?: number;
    description?: string;
    descriptions?: Record<string, string>;
    imageName?: string;
  }[], companyId?: number): Promise<{ machinesCreated: number; optionsCreated: number; optionsSkipped: number; skippedCodes: string[] }> {
    const excelConditions: any[] = [];
    if (companyId != null) excelConditions.push(eq(machines.companyId, companyId));
    excelConditions.push(sql`(${machines.source} = 'excel' OR ${machines.source} IS NULL)`);

    const existingMachines = await db.select({ id: machines.id }).from(machines).where(and(...excelConditions));
    for (const m of existingMachines) {
      await db.delete(machineOptions).where(eq(machineOptions.machineId, m.id));
    }
    if (existingMachines.length > 0) {
      const ids = existingMachines.map(m => m.id);
      for (const id of ids) {
        await db.delete(machines).where(eq(machines.id, id));
      }
    }

    const machineCodeMap = new Map<string, number>();
    let machinesCreated = 0;
    let optionsCreated = 0;

    const machineRows = rows.filter(r => r.type === 'M');
    const optionRows = rows.filter(r => r.type === 'O');

    for (const row of machineRows) {
      const [m] = await db.insert(machines).values({
        companyId: companyId ?? null,
        seqNum: row.seqNum ?? null,
        machineCode: row.code,
        macroType: row.macroType || null,
        name: row.name,
        description: row.description || '',
        titles: row.titles || null,
        descriptions: row.descriptions || null,
        imageUrl: row.imageName || null,
        basePrice: row.price.toString(),
        electricalPower: row.electricalPower != null ? row.electricalPower.toString() : null,
        compressedAir: row.compressedAir != null ? row.compressedAir.toString() : null,
        exhaustedAir: row.exhaustedAir != null ? row.exhaustedAir.toString() : null,
        airIntroduced: row.airIntroduced != null ? row.airIntroduced.toString() : null,
        installationDays: row.installationDays != null ? row.installationDays.toString() : null,
        source: "excel",
      }).returning();
      machineCodeMap.set(row.code, m.id);
      machinesCreated++;
    }

    let optionsSkipped = 0;
    const skippedCodes = new Set<string>();
    for (const row of optionRows) {
      const matchingMachineIds: number[] = [];
      for (const [machineCode, machineId] of Array.from(machineCodeMap.entries())) {
        if (machineCode === row.code || machineCode.startsWith(row.code + '-')) {
          matchingMachineIds.push(machineId);
        }
      }
      if (matchingMachineIds.length === 0) {
        optionsSkipped++;
        skippedCodes.add(row.code);
        console.warn(`[import] Option "${row.name}" (code "${row.code}") did not match any machine — skipped.`);
        continue;
      }

      for (const machineId of matchingMachineIds) {
        await db.insert(machineOptions).values({
          companyId: companyId ?? null,
          machineId,
          seqNum: row.seqNum ?? null,
          name: row.name,
          description: row.description || null,
          titles: row.titles || null,
          descriptions: row.descriptions || null,
          priceModifier: row.price.toString(),
          electricalPower: row.electricalPower != null ? row.electricalPower.toString() : null,
          compressedAir: row.compressedAir != null ? row.compressedAir.toString() : null,
          exhaustedAir: row.exhaustedAir != null ? row.exhaustedAir.toString() : null,
          airIntroduced: row.airIntroduced != null ? row.airIntroduced.toString() : null,
        });
        optionsCreated++;
      }
    }

    if (optionsSkipped > 0) {
      console.warn(`[import] ${optionsSkipped} option rows skipped (unmatched parent codes): ${Array.from(skippedCodes).join(', ')}`);
    }

    return { machinesCreated, optionsCreated, optionsSkipped, skippedCodes: Array.from(skippedCodes) };
  }
}

export const machineRepository = new MachineRepository();
