import { offerRepository, machineRepository, customerRepository, settingsRepository, dealerRepository } from "../repositories";
import { generatePdf } from "../pdf";
import { DEFAULT_COMPANY_ID } from "../middlewares/company";
import fs from "fs";
import path from "path";
import { expandNumericImagePlaceholders } from "../../shared/lib/imagePlaceholders";

async function expandSnapshotPlaceholders(offer: any): Promise<any> {
  if (!offer?.items?.length) return offer;
  const ids: number[] = Array.from(new Set(
    offer.items.map((it: any) => Number(it.machineId)).filter((n: number) => Number.isFinite(n) && n > 0)
  ));
  const detailById = new Map<number, string[]>();
  await Promise.all(ids.map(async (id) => {
    try {
      const m = await machineRepository.getById(id);
      if (m && Array.isArray((m as any).detailImages)) {
        detailById.set(id, (m as any).detailImages as string[]);
      }
    } catch {}
  }));
  const items = offer.items.map((it: any) => ({
    ...it,
    snapshotMachineDescription: expandNumericImagePlaceholders(
      it.snapshotMachineDescription,
      detailById.get(Number(it.machineId)) ?? [],
    ),
  }));
  return { ...offer, items };
}

function localizeField(titles: Record<string, string> | null | undefined, fallback: string, language: string): string {
  if (!titles) return fallback;
  if (titles[language]) return titles[language];
  if (titles.it) return titles.it;
  const firstAvailable = Object.values(titles).find(v => v);
  return firstAvailable || fallback;
}

interface DealerBranding {
  logoBase64?: string;
  logoBuffer?: Buffer;
  companyName?: string;
  footerLines?: string[];
  termsText?: string;
}

async function resolveDealerBranding(offer: any): Promise<DealerBranding | null> {
  const pd = offer.projectData ?? {};
  const isDealerOffer = pd.presentationMode === "dealer" || !!pd.dealerVersionOf;
  if (!isDealerOffer) return null;
  const dealerUserId = offer.originDealerId ?? offer.dealerId ?? pd.dealerUserId;
  if (!dealerUserId) return null;
  const dealerUser = await dealerRepository.getById(dealerUserId);
  if (!dealerUser?.dealerCompanyId) return null;
  const company = await dealerRepository.getCompanyById(dealerUser.dealerCompanyId);
  if (!company) return null;

  const branding: DealerBranding = { companyName: company.companyName };
  if (company.docFooterLines && Array.isArray(company.docFooterLines)) {
    branding.footerLines = company.docFooterLines as string[];
  }
  if (company.docTermsText) branding.termsText = company.docTermsText;
  if (company.docLogoUrl) {
    const logoDir = path.join(process.cwd(), "server", "assets", "dealer-logos");
    const logoFile = path.join(logoDir, path.basename(company.docLogoUrl));
    if (fs.existsSync(logoFile)) {
      const buf = fs.readFileSync(logoFile);
      branding.logoBuffer = buf;
      branding.logoBase64 = buf.toString("base64");
    }
  }
  return branding;
}

async function resolveDealerCompanyIdFromOffer(offer: any): Promise<number | null> {
  const pd = offer.projectData ?? {};
  const dealerUserId = offer.originDealerId ?? offer.dealerId ?? pd.dealerUserId;
  if (!dealerUserId) return null;
  const dealerUser = await dealerRepository.getById(dealerUserId);
  return dealerUser?.dealerCompanyId ?? null;
}

function applyDealerBrandingToSettings(formatSettings: any, branding: DealerBranding): any {
  const patched = { ...formatSettings };
  if (branding.footerLines && branding.footerLines.length > 0) {
    patched.footer = { ...(patched.footer ?? {}), companyLines: branding.footerLines };
  }
  return patched;
}

async function loadDealerPresets(dealerCompanyId: number): Promise<Array<{ id: number; title: string; content: string }>> {
  const { db: drizzleDb } = await import("../repositories/base");
  const { dealerPresets } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  return drizzleDb.select().from(dealerPresets).where(eq(dealerPresets.dealerCompanyId, dealerCompanyId));
}

async function applyDealerTermsToOffer(offer: any, branding: DealerBranding, dealerCompanyId?: number | null): Promise<any> {
  const pd = { ...(offer.projectData ?? {}) };
  const presetItems: Array<{ id: number; title: string; content: string }> = [];

  if (dealerCompanyId) {
    const dbPresets = await loadDealerPresets(dealerCompanyId);
    presetItems.push(...dbPresets);
  }

  if (branding.termsText && presetItems.length === 0) {
    presetItems.push({ id: -1, title: "TERMS & CONDITIONS", content: branding.termsText });
  }

  if (presetItems.length > 0) {
    pd.selectedPresets = presetItems;
  }
  return { ...offer, projectData: pd };
}

function localizeOfferItems(offer: any): any {
  const lang = offer.language ?? "it";
  if (!offer.items) return offer;
  return {
    ...offer,
    items: offer.items.map((item: any) => ({
      ...item,
      snapshotMachineName: localizeField(item.snapshotTitles, item.snapshotMachineName, lang),
      snapshotMachineDescription: localizeField(item.snapshotDescriptions, item.snapshotMachineDescription, lang),
      options: (item.options ?? []).map((opt: any) => ({
        ...opt,
        snapshotOptionName: localizeField(opt.snapshotOptionTitles, opt.snapshotOptionName, lang),
      })),
    })),
  };
}

export async function generateOfferPdf(offerId: number): Promise<{ buffer: Buffer; filename: string }> {
  const offer = await offerRepository.getById(offerId);
  if (!offer) throw new Error("Offer not found");
  const companyId = (offer as any).companyId ?? DEFAULT_COMPANY_ID;
  // Localize first so per-language snapshotDescriptions overrides take effect,
  // then resolve numeric image placeholders in the now-localized text.
  const localizedOffer = await expandSnapshotPlaceholders(localizeOfferItems(offer));

  const branding = await resolveDealerBranding(offer);
  if (branding) {
    const dealerCompanyId = await resolveDealerCompanyIdFromOffer(offer);
    let baseSettings: any;
    if (dealerCompanyId && await settingsRepository.hasDealerDocumentFormat(dealerCompanyId)) {
      baseSettings = await settingsRepository.getDealerDocumentFormat(dealerCompanyId);
    } else {
      baseSettings = await settingsRepository.getDocumentFormat(companyId);
    }
    const patchedSettings = applyDealerBrandingToSettings(baseSettings, branding);
    const patchedOffer = await applyDealerTermsToOffer(localizedOffer, branding, dealerCompanyId);
    const pdfBuffer = await generatePdf(patchedOffer, patchedSettings, branding.logoBase64);
    return { buffer: pdfBuffer, filename: `${offer.referenceNumber}.pdf` };
  }

  const formatSettings = await settingsRepository.getDocumentFormat(companyId);
  const pdfBuffer = await generatePdf(localizedOffer, formatSettings);
  return { buffer: pdfBuffer, filename: `${offer.referenceNumber}.pdf` };
}

export async function generatePreviewPdf(
  offerData: any,
  itemsData: any[],
): Promise<Buffer> {
  let customer: any = null;
  if (offerData.customerId) {
    customer = await customerRepository.getById(Number(offerData.customerId));
  }
  if (!customer && offerData.projectData?.headerInfo?.customer) {
    const hc = offerData.projectData.headerInfo.customer;
    customer = {
      id: 0,
      name: hc.name ?? "",
      email: hc.email ?? "",
      contactPerson: hc.contactPerson ?? null,
      address: hc.address ?? null,
    };
  }

  const descOverrides: Record<number, string> = offerData.projectData?.machineDescOverrides ?? {};
  const speedOverrides: Record<number, string> = offerData.projectData?.lineSpeedOverrides ?? {};
  const defaultLineSpeed: string = offerData.projectData?.technicalSpecs?.averageLineSpeed ?? "";

  const lang = offerData.language ?? "it";
  const builtItems: any[] = [];
  for (let idx = 0; idx < itemsData.length; idx++) {
    const item = itemsData[idx];

    if (item.isCustom || Number(item.machineId) === 0) {
      const optionIds: number[] = item.optionIds ?? [];
      const customOptionPrices: Record<number, number> = item.customOptionPrices ?? {};
      const optionQuantities: Record<number, number> = item.optionQuantities ?? {};
      const snapshotOptionNames: Record<string, string> = item.snapshotOptionNames ?? {};
      const builtOptions = optionIds.map((oid: number) => ({
        machineOptionId: 0,
        quantity: optionQuantities[oid] ?? 1,
        snapshotOptionName: snapshotOptionNames[String(oid)] ?? "",
        snapshotPriceModifier: String(customOptionPrices[oid] ?? 0),
        snapshotElectricalPower: null,
        snapshotCompressedAir: null,
        snapshotExhaustedAir: null,
        snapshotAirIntroduced: null,
      }));
      builtItems.push({
        id: idx,
        offerId: 0,
        machineId: 0,
        position: idx + 1,
        quantity: item.quantity ?? 1,
        snapshotMachineName: item.snapshotMachineName || "Custom Machine",
        snapshotMachineDescription: item.snapshotMachineDescription || "",
        snapshotMacroType: "custom",
        snapshotImageUrl: item.customMainImage || null,
        snapshotBasePrice: String(item.customBasePrice ?? 0),
        snapshotElectricalPower: null,
        snapshotCompressedAir: null,
        snapshotExhaustedAir: null,
        snapshotAirIntroduced: null,
        snapshotInstallationDays: null,
        options: builtOptions,
        machine: null,
      });
      continue;
    }

    const machine = await machineRepository.getById(Number(item.machineId));
    if (!machine) continue;

    const optionIds: number[] = item.optionIds ?? [];
    const optionQuantities: Record<number, number> = item.optionQuantities ?? {};
    const customOptionPrices: Record<number, number> = item.customOptionPrices ?? {};

    const builtOptions = optionIds
      .map((oid: number) => {
        const opt = machine.options?.find((o: any) => o.id === oid);
        if (!opt) return null;
        return {
          machineOptionId: oid,
          quantity: optionQuantities[oid] ?? 1,
          snapshotOptionName: localizeField(opt.titles, opt.name, lang),
          snapshotPriceModifier:
            customOptionPrices[oid] != null
              ? String(customOptionPrices[oid])
              : String(opt.priceModifier ?? 0),
          snapshotElectricalPower: opt.electricalPower ?? null,
          snapshotCompressedAir: opt.compressedAir ?? null,
          snapshotExhaustedAir: opt.exhaustedAir ?? null,
          snapshotAirIntroduced: opt.airIntroduced ?? null,
        };
      })
      .filter(Boolean);

    const customBase =
      item.customBasePrice != null
        ? String(item.customBasePrice)
        : String(machine.basePrice ?? 0);

    builtItems.push({
      id: idx,
      offerId: 0,
      machineId: item.machineId,
      position: idx + 1,
      quantity: item.quantity ?? 1,
      snapshotMachineName: localizeField((machine as any).titles, machine.name, lang),
      snapshotMachineDescription: (() => {
        const localizedDesc = localizeField((machine as any).descriptions, machine.description ?? "", lang);
        const rawDesc = descOverrides[item.machineId] ?? localizedDesc;
        const effectiveSpeed = speedOverrides[item.machineId] || defaultLineSpeed;
        return rawDesc.replace(/\{\{lineSpeed\}\}/g, effectiveSpeed);
      })(),
      snapshotMacroType: (machine as any).macroType ?? null,
      snapshotImageUrl: (machine as any).imageUrl ?? null,
      snapshotBasePrice: customBase,
      snapshotElectricalPower: machine.electricalPower ?? null,
      snapshotCompressedAir: machine.compressedAir ?? null,
      snapshotExhaustedAir: machine.exhaustedAir ?? null,
      snapshotAirIntroduced: machine.airIntroduced ?? null,
      snapshotInstallationDays: machine.installationDays ?? null,
      options: builtOptions,
      machine,
    });
  }

  const draftOffer: any = {
    id: 0,
    referenceNumber: "PREVIEW",
    subject: offerData.subject ?? "",
    customerId: offerData.customerId ?? null,
    status: "Draft",
    totalPrice: offerData.totalPrice ?? "0",
    salesmanName: offerData.salesmanName ?? "",
    date: new Date().toISOString(),
    projectData: offerData.projectData ?? {},
    customer,
    items: builtItems,
    dealer: null,
  };

  const companyId = offerData.companyId ?? DEFAULT_COMPANY_ID;
  const formatSettings = await settingsRepository.getDocumentFormat(companyId);

  const textOverrides: Record<string, any> =
    offerData.projectData?.sectionTextOverrides ?? {};
  const patchedFormatSettings = {
    ...formatSettings,
    sections: (formatSettings.sections ?? []).map((s: any) => {
      const ov = textOverrides[s.id];
      if (!ov) return s;
      return { ...s, labels: { ...(s.labels ?? {}), ...ov } };
    }),
  };

  return generatePdf(draftOffer, patchedFormatSettings);
}

