import { db, eq, desc, asc, isNull, isNotNull, and, sql, gte, lte } from "./base";
import { alias } from "drizzle-orm/pg-core";
import {
  offers, offerItems, offerItemOptions, offerSequence, enquirySequence, customers, machineOptions,
  dealerUsers, dealerCompanies,
  type Offer, type InsertOffer, type Customer,
  type OfferWithDetails,
  type OfferReferenceFormatConfig,
  DEFAULT_OFFER_REFERENCE_FORMAT,
  buildOfferReferenceCore,
  buildOfferReferenceVersionSuffix,
  applyOfferReferenceVersion,
  resolveOfferReferenceFormat,
} from "@shared/schema";
import { machineRepository } from "./machines";
import { settingsRepository } from "./settings";

export class OfferRepository {
  async generateReferenceNumber(config: OfferReferenceFormatConfig = DEFAULT_OFFER_REFERENCE_FORMAT): Promise<string> {
    const year = new Date().getFullYear();
    const result = await db.execute(sql`
      INSERT INTO offer_sequence (year, last_sequence) VALUES (${year}, 1)
      ON CONFLICT (year) DO UPDATE SET last_sequence = offer_sequence.last_sequence + 1
      RETURNING last_sequence
    `) as any;
    const row = result.rows?.[0] ?? result[0];
    const sequence = Number(row.last_sequence);
    const core = buildOfferReferenceCore(year, sequence, config);
    return `${core}${buildOfferReferenceVersionSuffix(1, config)}`;
  }

  /**
   * Resolve the offer-reference format to use for a given offer context.
   * Dealer offers use the dealer's company config (with fallback to the
   * supplier company config); regular offers use the supplier company config.
   */
  async resolveReferenceFormatFor(opts: {
    companyId: number | null;
    dealerCompanyId?: number | null;
  }): Promise<OfferReferenceFormatConfig> {
    if (opts.dealerCompanyId) {
      const dealerFmt = await settingsRepository.getDealerDocumentFormat(opts.dealerCompanyId);
      if (dealerFmt?.offerReferenceFormat) {
        return resolveOfferReferenceFormat(dealerFmt.offerReferenceFormat);
      }
    }
    if (opts.companyId == null) {
      return resolveOfferReferenceFormat(undefined);
    }
    const companyFmt = await settingsRepository.getDocumentFormat(opts.companyId);
    return resolveOfferReferenceFormat(companyFmt?.offerReferenceFormat);
  }

  async generateEnquiryReferenceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const result = await db.execute(sql`
      INSERT INTO enquiry_sequence (year, last_sequence) VALUES (${year}, 1)
      ON CONFLICT (year) DO UPDATE SET last_sequence = enquiry_sequence.last_sequence + 1
      RETURNING last_sequence
    `) as any;
    const row = result.rows?.[0] ?? result[0];
    return `ENQ-${year}-${String(row.last_sequence).padStart(4, '0')}`;
  }

  async getAll(companyId: number, salesmanUserId?: number | null, filters?: {
    filterSalesmanId?: number;
    filterDealerId?: number;
    fromDate?: string;
    toDate?: string;
  }): Promise<(Offer & { customer: Customer; sourceEnquiryRef?: string | null; dealerCompanyName?: string | null; dealerContactName?: string | null })[]> {
    const sourceEnq = alias(offers, "source_enquiry");
    const base = db.select({
      offer: offers,
      customer: customers,
      sourceEnquiryRef: sourceEnq.referenceNumber,
      dealerCompanyName: dealerCompanies.companyName,
      dealerContactName: dealerUsers.name,
      dealerContactSurname: dealerUsers.surname,
    })
      .from(offers)
      .leftJoin(customers, eq(offers.customerId, customers.id))
      .leftJoin(sourceEnq, eq(offers.sourceEnquiryId, sourceEnq.id))
      .leftJoin(dealerUsers, eq(offers.dealerId, dealerUsers.id))
      .leftJoin(dealerCompanies, eq(dealerUsers.dealerCompanyId, dealerCompanies.id));

    const conditions: any[] = [
      isNull(offers.deletedAt),
      eq(offers.companyId, companyId),
      eq(offers.offerType, "offer"),
    ];

    if (salesmanUserId != null) {
      conditions.push(eq(offers.salesmanUserId, salesmanUserId));
    }

    if (filters?.filterSalesmanId) {
      conditions.push(eq(offers.salesmanUserId, filters.filterSalesmanId));
    }
    if (filters?.filterDealerId) {
      conditions.push(eq(dealerUsers.dealerCompanyId, filters.filterDealerId));
    }
    if (filters?.fromDate) {
      conditions.push(gte(offers.date, new Date(filters.fromDate)));
    }
    if (filters?.toDate) {
      const to = new Date(filters.toDate);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(offers.date, to));
    }

    const rows = await base.where(and(...conditions)).orderBy(desc(offers.date));

    return rows.map(r => ({
      ...r.offer,
      customer: r.customer!,
      sourceEnquiryRef: r.sourceEnquiryRef,
      dealerCompanyName: r.dealerCompanyName ?? null,
      dealerContactName: r.dealerContactName ? `${r.dealerContactName}${r.dealerContactSurname ? ' ' + r.dealerContactSurname : ''}` : null,
    }));
  }

  async getBin(companyId: number, salesmanUserId?: number | null): Promise<(Offer & { customer: Customer })[]> {
    const base = db.select().from(offers)
      .leftJoin(customers, eq(offers.customerId, customers.id));

    const rows = salesmanUserId != null
      ? await base.where(and(isNotNull(offers.deletedAt), eq(offers.companyId, companyId), eq(offers.salesmanUserId, salesmanUserId), eq(offers.offerType, "offer"))).orderBy(desc(offers.deletedAt))
      : await base.where(and(isNotNull(offers.deletedAt), eq(offers.companyId, companyId), eq(offers.offerType, "offer"))).orderBy(desc(offers.deletedAt));

    return rows.map(r => ({ ...r.offers, customer: r.customers! }));
  }

  async getById(id: number): Promise<OfferWithDetails | undefined> {
    const [offer] = await db.select().from(offers).where(eq(offers.id, id));
    if (!offer) return undefined;

    const [customer] = await db.select().from(customers).where(eq(customers.id, offer.customerId));
    const items = await db.select().from(offerItems).where(eq(offerItems.offerId, id)).orderBy(asc(offerItems.position));
    const itemsWithDetails = await Promise.all(items.map(async (item) => {
      const options = await db.select().from(offerItemOptions).where(eq(offerItemOptions.offerItemId, item.id));
      return { ...item, options };
    }));

    return { ...offer, customer: customer!, items: itemsWithDetails };
  }

  async create(
    companyId: number,
    offerData: InsertOffer & { salesmanEmail?: string | null; salesmanMobile?: string | null },
    itemsData: { machineId: number; quantity: number; optionIds: number[]; customBasePrice?: number; customOptionPrices?: Record<number, number>; optionQuantities?: Record<number, number>; isCustom?: boolean; snapshotMachineName?: string; snapshotMachineDescription?: string; customOptions?: { name: string; price: number }[]; snapshotOptionNames?: Record<number, string> }[]
  ): Promise<Offer> {
    let ref: string;
    if (offerData.offerType === "enquiry") {
      ref = await this.generateEnquiryReferenceNumber();
    } else {
      let dealerCompanyId: number | null = null;
      const originDealerId = (offerData as any).originDealerId as number | null | undefined;
      if (originDealerId) {
        const [dealerRow] = await db.select({ dealerCompanyId: dealerUsers.dealerCompanyId })
          .from(dealerUsers).where(eq(dealerUsers.id, originDealerId));
        dealerCompanyId = dealerRow?.dealerCompanyId ?? null;
      }
      const fmt = await this.resolveReferenceFormatFor({ companyId, dealerCompanyId });
      ref = await this.generateReferenceNumber(fmt);
    }
    const [offer] = await db.insert(offers).values({
      ...offerData,
      companyId,
      referenceNumber: ref,
      date: new Date(),
    } as any).returning();

    const descOv: Record<number, string> = (offerData.projectData as any)?.machineDescOverrides ?? {};
    const speedOv: Record<number, string> = (offerData.projectData as any)?.lineSpeedOverrides ?? {};
    const defaultSpeed: string = (offerData.projectData as any)?.technicalSpecs?.averageLineSpeed ?? "";
    let position = 1;
    for (const itemData of itemsData) {
      if (itemData.isCustom) {
        const [offerItem] = await db.insert(offerItems).values({
          offerId: offer.id,
          machineId: 0,
          position: position,
          quantity: itemData.quantity,
          snapshotMachineName: itemData.snapshotMachineName || "Custom Machine",
          snapshotMachineDescription: itemData.snapshotMachineDescription || "",
          snapshotBasePrice: (itemData.customBasePrice ?? 0).toString(),
          snapshotMacroType: "custom",
          snapshotImageUrl: itemData.customMainImage || null,
          snapshotElectricalPower: null,
          snapshotCompressedAir: null,
          snapshotExhaustedAir: null,
          snapshotAirIntroduced: null,
          snapshotInstallationDays: null,
        }).returning();
        position++;

        for (const optId of itemData.optionIds) {
          const customPrice = itemData.customOptionPrices?.[optId] ?? 0;
          const optName = itemData.snapshotOptionNames?.[optId] ?? "";
          const optQty = itemData.optionQuantities?.[optId] ?? 1;
          await db.insert(offerItemOptions).values({
            offerItemId: offerItem.id,
            machineOptionId: 0,
            quantity: optQty,
            snapshotOptionName: optName,
            snapshotPriceModifier: customPrice.toString(),
            snapshotElectricalPower: null,
            snapshotCompressedAir: null,
            snapshotExhaustedAir: null,
            snapshotAirIntroduced: null,
          });
        }
        continue;
      }

      const machine = (await machineRepository.getById(itemData.machineId))!;
      const rawDesc = descOv[itemData.machineId] ?? machine.description;
      const effectiveSpeed = speedOv[itemData.machineId] || defaultSpeed;
      const resolvedDesc = rawDesc ? rawDesc.replace(/\{\{lineSpeed\}\}/g, effectiveSpeed) : rawDesc;

      const [offerItem] = await db.insert(offerItems).values({
        offerId: offer.id,
        machineId: itemData.machineId,
        position: position,
        quantity: itemData.quantity,
        snapshotMachineName: machine.name,
        snapshotMachineDescription: resolvedDesc,
        snapshotTitles: machine.titles || null,
        snapshotDescriptions: machine.descriptions || null,
        snapshotBasePrice: itemData.customBasePrice != null ? itemData.customBasePrice.toString() : machine.basePrice,
        snapshotMacroType: machine.macroType,
        snapshotImageUrl: machine.imageUrl ?? null,
        snapshotElectricalPower: machine.electricalPower,
        snapshotCompressedAir: machine.compressedAir,
        snapshotExhaustedAir: machine.exhaustedAir,
        snapshotAirIntroduced: machine.airIntroduced,
        snapshotInstallationDays: machine.installationDays,
      }).returning();

      position++;

      for (const optId of itemData.optionIds) {
        const option = machine.options.find(o => o.id === optId);
        if (option) {
          const customPrice = itemData.customOptionPrices?.[optId];
          const optQty = itemData.optionQuantities?.[optId] ?? 1;
          await db.insert(offerItemOptions).values({
            offerItemId: offerItem.id,
            machineOptionId: optId,
            quantity: optQty,
            snapshotOptionName: option.name,
            snapshotOptionTitles: option.titles || null,
            snapshotOptionDescriptions: option.descriptions || null,
            snapshotPriceModifier: customPrice != null ? customPrice.toString() : option.priceModifier,
            snapshotElectricalPower: option.electricalPower,
            snapshotCompressedAir: option.compressedAir,
            snapshotExhaustedAir: option.exhaustedAir,
            snapshotAirIntroduced: option.airIntroduced,
          });
        }
      }
    }

    return offer;
  }

  async update(
    id: number,
    offerData: { customerId: number; subject: string; salesmanName: string; salesmanEmail?: string | null; salesmanMobile?: string | null; totalPrice: number; projectData?: any; language?: string; salesScenario?: string | null },
    itemsData: { machineId: number; quantity: number; optionIds: number[]; customBasePrice?: number; customOptionPrices?: Record<number, number>; optionQuantities?: Record<number, number>; isCustom?: boolean; snapshotMachineName?: string; snapshotMachineDescription?: string; customOptions?: { name: string; price: number }[]; snapshotOptionNames?: Record<number, string> }[]
  ): Promise<Offer> {
    const setData: any = {
      customerId: offerData.customerId,
      subject: offerData.subject,
      salesmanName: offerData.salesmanName,
      salesmanEmail: offerData.salesmanEmail,
      salesmanMobile: offerData.salesmanMobile,
      totalPrice: offerData.totalPrice.toString(),
      projectData: offerData.projectData,
    };
    if (offerData.language) setData.language = offerData.language;
    if (offerData.salesScenario !== undefined) setData.salesScenario = offerData.salesScenario;
    const [updated] = await db.update(offers).set(setData).where(eq(offers.id, id)).returning();

    if (!updated) throw new Error("Offer not found");

    const existingItems = await db.select().from(offerItems).where(eq(offerItems.offerId, id));
    for (const item of existingItems) {
      await db.delete(offerItemOptions).where(eq(offerItemOptions.offerItemId, item.id));
    }
    await db.delete(offerItems).where(eq(offerItems.offerId, id));

    const descOv: Record<number, string> = (offerData.projectData as any)?.machineDescOverrides ?? {};
    const speedOv: Record<number, string> = (offerData.projectData as any)?.lineSpeedOverrides ?? {};
    const defaultSpeed: string = (offerData.projectData as any)?.technicalSpecs?.averageLineSpeed ?? "";
    let position = 1;
    for (const itemData of itemsData) {
      if (itemData.isCustom) {
        const [offerItem] = await db.insert(offerItems).values({
          offerId: id,
          machineId: 0,
          position: position,
          quantity: itemData.quantity,
          snapshotMachineName: itemData.snapshotMachineName || "Custom Machine",
          snapshotMachineDescription: itemData.snapshotMachineDescription || "",
          snapshotBasePrice: (itemData.customBasePrice ?? 0).toString(),
          snapshotMacroType: "custom",
          snapshotImageUrl: itemData.customMainImage || null,
          snapshotElectricalPower: null,
          snapshotCompressedAir: null,
          snapshotExhaustedAir: null,
          snapshotAirIntroduced: null,
          snapshotInstallationDays: null,
        }).returning();
        position++;

        for (const optId of itemData.optionIds) {
          const customPrice = itemData.customOptionPrices?.[optId] ?? 0;
          const optName = itemData.snapshotOptionNames?.[optId] ?? "";
          const optQty = itemData.optionQuantities?.[optId] ?? 1;
          await db.insert(offerItemOptions).values({
            offerItemId: offerItem.id,
            machineOptionId: 0,
            quantity: optQty,
            snapshotOptionName: optName,
            snapshotPriceModifier: customPrice.toString(),
            snapshotElectricalPower: null,
            snapshotCompressedAir: null,
            snapshotExhaustedAir: null,
            snapshotAirIntroduced: null,
          });
        }
        continue;
      }

      const machine = (await machineRepository.getById(itemData.machineId))!;
      const rawDesc = descOv[itemData.machineId] ?? machine.description;
      const effectiveSpeed = speedOv[itemData.machineId] || defaultSpeed;
      const resolvedDesc = rawDesc ? rawDesc.replace(/\{\{lineSpeed\}\}/g, effectiveSpeed) : rawDesc;

      const [offerItem] = await db.insert(offerItems).values({
        offerId: id,
        machineId: itemData.machineId,
        position: position,
        quantity: itemData.quantity,
        snapshotMachineName: machine.name,
        snapshotMachineDescription: resolvedDesc,
        snapshotTitles: machine.titles || null,
        snapshotDescriptions: machine.descriptions || null,
        snapshotBasePrice: itemData.customBasePrice != null ? itemData.customBasePrice.toString() : machine.basePrice,
        snapshotMacroType: machine.macroType,
        snapshotImageUrl: machine.imageUrl ?? null,
        snapshotElectricalPower: machine.electricalPower,
        snapshotCompressedAir: machine.compressedAir,
        snapshotExhaustedAir: machine.exhaustedAir,
        snapshotAirIntroduced: machine.airIntroduced,
        snapshotInstallationDays: machine.installationDays,
      }).returning();

      position++;

      for (const optId of itemData.optionIds) {
        const option = machine.options.find(o => o.id === optId);
        if (option) {
          const customPrice = itemData.customOptionPrices?.[optId];
          const optQty = itemData.optionQuantities?.[optId] ?? 1;
          await db.insert(offerItemOptions).values({
            offerItemId: offerItem.id,
            machineOptionId: optId,
            quantity: optQty,
            snapshotOptionName: option.name,
            snapshotOptionTitles: option.titles || null,
            snapshotOptionDescriptions: option.descriptions || null,
            snapshotPriceModifier: customPrice != null ? customPrice.toString() : option.priceModifier,
            snapshotElectricalPower: option.electricalPower,
            snapshotCompressedAir: option.compressedAir,
            snapshotExhaustedAir: option.exhaustedAir,
            snapshotAirIntroduced: option.airIntroduced,
          });
        }
      }
    }

    return updated;
  }

  async softDelete(id: number): Promise<void> {
    const [offer] = await db.select({ sourceEnquiryId: offers.sourceEnquiryId }).from(offers).where(eq(offers.id, id));
    await db.update(offers).set({ deletedAt: new Date() }).where(eq(offers.id, id));
    if (offer?.sourceEnquiryId) {
      const [otherLinked] = await db.select({ id: offers.id }).from(offers)
        .where(and(eq(offers.sourceEnquiryId, offer.sourceEnquiryId), isNull(offers.deletedAt)));
      if (!otherLinked) {
        await db.update(offers).set({ status: "pending" }).where(eq(offers.id, offer.sourceEnquiryId));
      }
    }
  }

  async restore(id: number): Promise<void> {
    await db.update(offers).set({ deletedAt: sql`NULL` }).where(eq(offers.id, id));
  }

  async permanentDelete(id: number): Promise<void> {
    const existingItems = await db.select().from(offerItems).where(eq(offerItems.offerId, id));
    for (const item of existingItems) {
      await db.delete(offerItemOptions).where(eq(offerItemOptions.offerItemId, item.id));
    }
    await db.delete(offerItems).where(eq(offerItems.offerId, id));
    await db.delete(offers).where(eq(offers.id, id));
  }

  async updateStatus(id: number, status: string): Promise<Offer> {
    const [updated] = await db.update(offers).set({ status }).where(eq(offers.id, id)).returning();
    if (!updated) throw new Error("Offer not found");
    return updated;
  }

  async updateReferenceNumber(id: number, referenceNumber: string): Promise<void> {
    await db.update(offers).set({ referenceNumber }).where(eq(offers.id, id));
  }

  async updateProjectData(id: number, projectData: any): Promise<Offer> {
    const [updated] = await db.update(offers).set({ projectData } as any).where(eq(offers.id, id)).returning();
    if (!updated) throw new Error("Offer not found");
    return updated;
  }

  async createVersion(originalOfferId: number): Promise<Offer> {
    const original = await this.getById(originalOfferId);
    if (!original) throw new Error("Original offer not found");

    const parentId = original.parentOfferId || original.id;
    const relatedOffers = await db.select().from(offers).where(eq(offers.parentOfferId, parentId));
    const originalIsParent = !original.parentOfferId;
    const allVersions = originalIsParent
      ? [original.version, ...relatedOffers.map(o => o.version)]
      : relatedOffers.map(o => o.version);
    const nextVersion = Math.max(...allVersions) + 1;

    let baseRef: string;
    let baseRefVersion: number;
    if (original.parentOfferId) {
      const [parentOffer] = await db.select().from(offers).where(eq(offers.id, original.parentOfferId));
      baseRef = parentOffer?.referenceNumber || original.referenceNumber;
      baseRefVersion = parentOffer?.version ?? original.version;
    } else {
      baseRef = original.referenceNumber;
      baseRefVersion = original.version;
    }
    let dealerCompanyIdForFmt: number | null = null;
    if (original.originDealerId) {
      const [dealerRow] = await db.select({ dealerCompanyId: dealerUsers.dealerCompanyId })
        .from(dealerUsers).where(eq(dealerUsers.id, original.originDealerId));
      dealerCompanyIdForFmt = dealerRow?.dealerCompanyId ?? null;
    }
    const refFmt = await this.resolveReferenceFormatFor({ companyId: original.companyId, dealerCompanyId: dealerCompanyIdForFmt });
    const ref = applyOfferReferenceVersion(baseRef, nextVersion, refFmt, baseRefVersion);

    const [newOffer] = await db.insert(offers).values({
      referenceNumber: ref,
      companyId: original.companyId,
      customerId: original.customerId,
      date: new Date(),
      subject: original.subject,
      salesmanName: original.salesmanName,
      salesmanEmail: original.salesmanEmail,
      salesmanMobile: original.salesmanMobile,
      salesmanUserId: original.salesmanUserId,
      projectData: original.projectData,
      status: "Draft",
      totalPrice: original.totalPrice,
      version: nextVersion,
      parentOfferId: parentId,
      offerType: original.offerType,
      dealerId: original.dealerId,
      sourceEnquiryId: original.sourceEnquiryId,
      originDealerId: original.originDealerId,
      originEnquiryId: original.originEnquiryId,
      language: original.language ?? "it",
      catalogVersionId: original.catalogVersionId,
    }).returning();

    let position = 1;
    for (const item of original.items) {
      const [newItem] = await db.insert(offerItems).values({
        offerId: newOffer.id,
        machineId: item.machineId,
        position: position,
        quantity: item.quantity,
        snapshotMachineName: item.snapshotMachineName,
        snapshotMachineDescription: item.snapshotMachineDescription,
        snapshotTitles: item.snapshotTitles || null,
        snapshotDescriptions: item.snapshotDescriptions || null,
        snapshotBasePrice: item.snapshotBasePrice,
        snapshotMacroType: item.snapshotMacroType,
        snapshotImageUrl: item.snapshotImageUrl ?? null,
        snapshotElectricalPower: item.snapshotElectricalPower,
        snapshotCompressedAir: item.snapshotCompressedAir,
        snapshotExhaustedAir: item.snapshotExhaustedAir,
        snapshotAirIntroduced: item.snapshotAirIntroduced,
        snapshotInstallationDays: item.snapshotInstallationDays,
      }).returning();
      position++;

      for (const opt of item.options) {
        await db.insert(offerItemOptions).values({
          offerItemId: newItem.id,
          machineOptionId: opt.machineOptionId,
          quantity: opt.quantity ?? 1,
          snapshotOptionName: opt.snapshotOptionName,
          snapshotOptionTitles: opt.snapshotOptionTitles || null,
          snapshotOptionDescriptions: opt.snapshotOptionDescriptions || null,
          snapshotPriceModifier: opt.snapshotPriceModifier,
          snapshotElectricalPower: opt.snapshotElectricalPower,
          snapshotCompressedAir: opt.snapshotCompressedAir,
          snapshotExhaustedAir: opt.snapshotExhaustedAir,
          snapshotAirIntroduced: opt.snapshotAirIntroduced,
        });
      }
    }

    return newOffer;
  }

  async cloneForUser(originalOfferId: number, newSalesmanUserId: number, sharedByUserId: number): Promise<Offer> {
    const original = await this.getById(originalOfferId);
    if (!original) throw new Error("Original offer not found");

    const cloneFmt = await this.resolveReferenceFormatFor({ companyId: original.companyId });
    const ref = await this.generateReferenceNumber(cloneFmt);
    const [newOffer] = await db.insert(offers).values({
      referenceNumber: ref,
      companyId: original.companyId,
      customerId: original.customerId,
      date: new Date(),
      subject: original.subject,
      salesmanName: original.salesmanName,
      salesmanEmail: original.salesmanEmail,
      salesmanMobile: original.salesmanMobile,
      salesmanUserId: newSalesmanUserId,
      projectData: original.projectData,
      status: "Draft",
      totalPrice: original.totalPrice,
      version: 1,
      offerType: "offer",
      dealerId: original.dealerId,
      sourceEnquiryId: original.sourceEnquiryId,
      sourceOfferId: originalOfferId,
      sharedByUserId,
      language: original.language ?? "it",
      catalogVersionId: original.catalogVersionId,
    } as any).returning();

    let position = 1;
    for (const item of original.items) {
      const [newItem] = await db.insert(offerItems).values({
        offerId: newOffer.id,
        machineId: item.machineId,
        position: position,
        quantity: item.quantity,
        snapshotMachineName: item.snapshotMachineName,
        snapshotMachineDescription: item.snapshotMachineDescription,
        snapshotTitles: item.snapshotTitles || null,
        snapshotDescriptions: item.snapshotDescriptions || null,
        snapshotBasePrice: item.snapshotBasePrice,
        snapshotMacroType: item.snapshotMacroType,
        snapshotImageUrl: item.snapshotImageUrl ?? null,
        snapshotElectricalPower: item.snapshotElectricalPower,
        snapshotCompressedAir: item.snapshotCompressedAir,
        snapshotExhaustedAir: item.snapshotExhaustedAir,
        snapshotAirIntroduced: item.snapshotAirIntroduced,
        snapshotInstallationDays: item.snapshotInstallationDays,
      }).returning();
      position++;

      for (const opt of item.options) {
        await db.insert(offerItemOptions).values({
          offerItemId: newItem.id,
          machineOptionId: opt.machineOptionId,
          quantity: opt.quantity ?? 1,
          snapshotOptionName: opt.snapshotOptionName,
          snapshotOptionTitles: opt.snapshotOptionTitles || null,
          snapshotOptionDescriptions: opt.snapshotOptionDescriptions || null,
          snapshotPriceModifier: opt.snapshotPriceModifier,
          snapshotElectricalPower: opt.snapshotElectricalPower,
          snapshotCompressedAir: opt.snapshotCompressedAir,
          snapshotExhaustedAir: opt.snapshotExhaustedAir,
          snapshotAirIntroduced: opt.snapshotAirIntroduced,
        });
      }
    }

    return newOffer;
  }

  async refreshCatalogVersion(originalOfferId: number, newCatalogVersionId: number): Promise<{ offer: Offer; warnings: string[] }> {
    const original = await this.getById(originalOfferId);
    if (!original) throw new Error("Original offer not found");

    const parentId = original.parentOfferId || original.id;
    const relatedOffers = await db.select().from(offers).where(eq(offers.parentOfferId, parentId));
    const originalIsParent = !original.parentOfferId;
    const allVersions = originalIsParent
      ? [original.version, ...relatedOffers.map(o => o.version)]
      : relatedOffers.map(o => o.version);
    const nextVersion = Math.max(...allVersions) + 1;

    let baseRef: string;
    let baseRefVersion: number;
    if (original.parentOfferId) {
      const [parentOffer] = await db.select().from(offers).where(eq(offers.id, original.parentOfferId));
      baseRef = parentOffer?.referenceNumber || original.referenceNumber;
      baseRefVersion = parentOffer?.version ?? original.version;
    } else {
      baseRef = original.referenceNumber;
      baseRefVersion = original.version;
    }
    let dealerCompanyIdForFmt: number | null = null;
    if (original.originDealerId) {
      const [dealerRow] = await db.select({ dealerCompanyId: dealerUsers.dealerCompanyId })
        .from(dealerUsers).where(eq(dealerUsers.id, original.originDealerId));
      dealerCompanyIdForFmt = dealerRow?.dealerCompanyId ?? null;
    }
    const refFmt = await this.resolveReferenceFormatFor({ companyId: original.companyId, dealerCompanyId: dealerCompanyIdForFmt });
    const ref = applyOfferReferenceVersion(baseRef, nextVersion, refFmt, baseRefVersion);

    const [newOffer] = await db.insert(offers).values({
      referenceNumber: ref,
      companyId: original.companyId,
      customerId: original.customerId,
      date: new Date(),
      subject: original.subject,
      salesmanName: original.salesmanName,
      salesmanEmail: original.salesmanEmail,
      salesmanMobile: original.salesmanMobile,
      salesmanUserId: original.salesmanUserId,
      projectData: original.projectData,
      status: "Draft",
      totalPrice: original.totalPrice,
      version: nextVersion,
      parentOfferId: parentId,
      offerType: original.offerType,
      dealerId: original.dealerId,
      sourceEnquiryId: original.sourceEnquiryId,
      originDealerId: original.originDealerId,
      originEnquiryId: original.originEnquiryId,
      language: original.language ?? "it",
      catalogVersionId: newCatalogVersionId,
    }).returning();

    const warnings: string[] = [];
    let position = 1;
    let newTotal = 0;
    const companyId = original.companyId;

    for (const item of original.items) {
      if (item.machineId === 0) {
        const basePrice = parseFloat(item.snapshotBasePrice) || 0;
        let itemTotal = basePrice * item.quantity;
        const [newItem] = await db.insert(offerItems).values({
          offerId: newOffer.id,
          machineId: item.machineId,
          position: position,
          quantity: item.quantity,
          snapshotMachineName: item.snapshotMachineName,
          snapshotMachineDescription: item.snapshotMachineDescription,
          snapshotTitles: item.snapshotTitles || null,
          snapshotDescriptions: item.snapshotDescriptions || null,
          snapshotBasePrice: item.snapshotBasePrice,
          snapshotMacroType: item.snapshotMacroType,
          snapshotImageUrl: item.snapshotImageUrl ?? null,
          snapshotElectricalPower: item.snapshotElectricalPower,
          snapshotCompressedAir: item.snapshotCompressedAir,
          snapshotExhaustedAir: item.snapshotExhaustedAir,
          snapshotAirIntroduced: item.snapshotAirIntroduced,
          snapshotInstallationDays: item.snapshotInstallationDays,
        }).returning();
        position++;
        for (const opt of item.options) {
          itemTotal += (parseFloat(opt.snapshotPriceModifier) || 0) * (opt.quantity ?? 1);
          await db.insert(offerItemOptions).values({
            offerItemId: newItem.id,
            machineOptionId: opt.machineOptionId,
            quantity: opt.quantity ?? 1,
            snapshotOptionName: opt.snapshotOptionName,
            snapshotOptionTitles: opt.snapshotOptionTitles || null,
            snapshotOptionDescriptions: opt.snapshotOptionDescriptions || null,
            snapshotPriceModifier: opt.snapshotPriceModifier,
            snapshotElectricalPower: opt.snapshotElectricalPower,
            snapshotCompressedAir: opt.snapshotCompressedAir,
            snapshotExhaustedAir: opt.snapshotExhaustedAir,
            snapshotAirIntroduced: opt.snapshotAirIntroduced,
          });
        }
        newTotal += itemTotal;
        continue;
      }

      let machine = await machineRepository.getById(item.machineId);
      if (!machine && companyId) {
        machine = await machineRepository.getByName(companyId, item.snapshotMachineName);
      }

      if (!machine) {
        warnings.push(item.snapshotMachineName);
        const basePrice = parseFloat(item.snapshotBasePrice) || 0;
        let itemTotal = basePrice * item.quantity;
        const [newItem] = await db.insert(offerItems).values({
          offerId: newOffer.id,
          machineId: item.machineId,
          position: position,
          quantity: item.quantity,
          snapshotMachineName: item.snapshotMachineName,
          snapshotMachineDescription: item.snapshotMachineDescription,
          snapshotTitles: item.snapshotTitles || null,
          snapshotDescriptions: item.snapshotDescriptions || null,
          snapshotBasePrice: item.snapshotBasePrice,
          snapshotMacroType: item.snapshotMacroType,
          snapshotImageUrl: item.snapshotImageUrl ?? null,
          snapshotElectricalPower: item.snapshotElectricalPower,
          snapshotCompressedAir: item.snapshotCompressedAir,
          snapshotExhaustedAir: item.snapshotExhaustedAir,
          snapshotAirIntroduced: item.snapshotAirIntroduced,
          snapshotInstallationDays: item.snapshotInstallationDays,
        }).returning();
        position++;
        for (const opt of item.options) {
          itemTotal += (parseFloat(opt.snapshotPriceModifier) || 0) * (opt.quantity ?? 1);
          await db.insert(offerItemOptions).values({
            offerItemId: newItem.id,
            machineOptionId: opt.machineOptionId,
            quantity: opt.quantity ?? 1,
            snapshotOptionName: opt.snapshotOptionName,
            snapshotOptionTitles: opt.snapshotOptionTitles || null,
            snapshotOptionDescriptions: opt.snapshotOptionDescriptions || null,
            snapshotPriceModifier: opt.snapshotPriceModifier,
            snapshotElectricalPower: opt.snapshotElectricalPower,
            snapshotCompressedAir: opt.snapshotCompressedAir,
            snapshotExhaustedAir: opt.snapshotExhaustedAir,
            snapshotAirIntroduced: opt.snapshotAirIntroduced,
          });
        }
        newTotal += itemTotal;
        continue;
      }

      let itemTotal = (parseFloat(machine.basePrice) || 0) * item.quantity;

      const [newItem] = await db.insert(offerItems).values({
        offerId: newOffer.id,
        machineId: machine.id,
        position: position,
        quantity: item.quantity,
        snapshotMachineName: machine.name,
        snapshotMachineDescription: machine.description,
        snapshotTitles: machine.titles || null,
        snapshotDescriptions: machine.descriptions || null,
        snapshotBasePrice: machine.basePrice,
        snapshotMacroType: machine.macroType,
        snapshotImageUrl: machine.imageUrl ?? null,
        snapshotElectricalPower: machine.electricalPower,
        snapshotCompressedAir: machine.compressedAir,
        snapshotExhaustedAir: machine.exhaustedAir,
        snapshotAirIntroduced: machine.airIntroduced,
        snapshotInstallationDays: machine.installationDays,
      }).returning();
      position++;

      for (const opt of item.options) {
        if (opt.machineOptionId === 0) {
          itemTotal += (parseFloat(opt.snapshotPriceModifier) || 0) * (opt.quantity ?? 1);
          await db.insert(offerItemOptions).values({
            offerItemId: newItem.id,
            machineOptionId: 0,
            quantity: opt.quantity ?? 1,
            snapshotOptionName: opt.snapshotOptionName,
            snapshotOptionTitles: opt.snapshotOptionTitles || null,
            snapshotOptionDescriptions: opt.snapshotOptionDescriptions || null,
            snapshotPriceModifier: opt.snapshotPriceModifier,
            snapshotElectricalPower: opt.snapshotElectricalPower,
            snapshotCompressedAir: opt.snapshotCompressedAir,
            snapshotExhaustedAir: opt.snapshotExhaustedAir,
            snapshotAirIntroduced: opt.snapshotAirIntroduced,
          });
          continue;
        }
        const option = machine.options.find(o => o.id === opt.machineOptionId)
          || machine.options.find(o => o.name === opt.snapshotOptionName);
        if (option) {
          itemTotal += (parseFloat(option.priceModifier) || 0) * (opt.quantity ?? 1);
          await db.insert(offerItemOptions).values({
            offerItemId: newItem.id,
            machineOptionId: option.id,
            quantity: opt.quantity ?? 1,
            snapshotOptionName: option.name,
            snapshotOptionTitles: option.titles || null,
            snapshotOptionDescriptions: option.descriptions || null,
            snapshotPriceModifier: option.priceModifier,
            snapshotElectricalPower: option.electricalPower,
            snapshotCompressedAir: option.compressedAir,
            snapshotExhaustedAir: option.exhaustedAir,
            snapshotAirIntroduced: option.airIntroduced,
          });
        } else {
          warnings.push(`${item.snapshotMachineName} → ${opt.snapshotOptionName}`);
          itemTotal += (parseFloat(opt.snapshotPriceModifier) || 0) * (opt.quantity ?? 1);
          await db.insert(offerItemOptions).values({
            offerItemId: newItem.id,
            machineOptionId: opt.machineOptionId,
            quantity: opt.quantity ?? 1,
            snapshotOptionName: opt.snapshotOptionName,
            snapshotOptionTitles: opt.snapshotOptionTitles || null,
            snapshotOptionDescriptions: opt.snapshotOptionDescriptions || null,
            snapshotPriceModifier: opt.snapshotPriceModifier,
            snapshotElectricalPower: opt.snapshotElectricalPower,
            snapshotCompressedAir: opt.snapshotCompressedAir,
            snapshotExhaustedAir: opt.snapshotExhaustedAir,
            snapshotAirIntroduced: opt.snapshotAirIntroduced,
          });
        }
      }
      newTotal += itemTotal;
    }

    await db.update(offers).set({ totalPrice: newTotal.toFixed(2) }).where(eq(offers.id, newOffer.id));
    newOffer.totalPrice = newTotal.toFixed(2);

    return { offer: newOffer, warnings };
  }

  async linkToEnquiry(offerId: number, enquiryId: number): Promise<void> {
    await db.update(offers).set({ sourceEnquiryId: enquiryId } as any).where(eq(offers.id, offerId));
    await db.update(offers).set({ status: "in_progress" }).where(eq(offers.id, enquiryId));
  }
}

export const offerRepository = new OfferRepository();
