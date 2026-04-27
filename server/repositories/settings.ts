import { db, eq, and, desc } from "./base";
import {
  settings,
  catalogImports,
  type DocSection,
  type DocumentFormatSettings,
  DEFAULT_DOC_SECTIONS,
  DEFAULT_PAGE_BACKGROUND,
  DEFAULT_BORDER_RADIUS,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_FOOTER_CONFIG,
} from "@shared/schema";

export class SettingsRepository {
  async getDocumentFormat(companyId: number): Promise<DocumentFormatSettings> {
    const rows = await db.select().from(settings).where(and(eq(settings.key, 'document_format'), eq(settings.companyId, companyId)));
    const defaultResult: DocumentFormatSettings = { sections: DEFAULT_DOC_SECTIONS, pageBackground: DEFAULT_PAGE_BACKGROUND, borderRadius: DEFAULT_BORDER_RADIUS, borderWidth: DEFAULT_BORDER_WIDTH };
    if (!rows.length || !rows[0].value) return defaultResult;
    const raw = rows[0].value as any;
    const savedSections: DocSection[] = Array.isArray(raw) ? raw : (raw.sections ?? DEFAULT_DOC_SECTIONS);
    const pageBackground: string = (Array.isArray(raw) ? undefined : raw.pageBackground) ?? DEFAULT_PAGE_BACKGROUND;
    const savedIds = savedSections.map((s: DocSection) => s.id);
    const missing = DEFAULT_DOC_SECTIONS.filter(d => !savedIds.includes(d.id));
    const borderRadius: number = (Array.isArray(raw) ? undefined : raw.borderRadius) ?? DEFAULT_BORDER_RADIUS;
    const borderWidth: number = (Array.isArray(raw) ? undefined : raw.borderWidth) ?? DEFAULT_BORDER_WIDTH;
    const header = { ...DEFAULT_HEADER_CONFIG, ...(Array.isArray(raw) ? {} : raw.header ?? {}) };
    const footer = { ...DEFAULT_FOOTER_CONFIG, ...(Array.isArray(raw) ? {} : raw.footer ?? {}) };
    if (!Array.isArray(footer.companyLines) || footer.companyLines.length === 0) {
      footer.companyLines = DEFAULT_FOOTER_CONFIG.companyLines;
    }
    const offerReferenceFormat = (Array.isArray(raw) ? undefined : raw.offerReferenceFormat) ?? undefined;
    return { sections: [...savedSections, ...missing], pageBackground, borderRadius, borderWidth, header, footer, offerReferenceFormat };
  }

  async saveDocumentFormat(companyId: number, fmt: DocumentFormatSettings): Promise<void> {
    const existing = await db.select().from(settings).where(and(eq(settings.key, 'document_format'), eq(settings.companyId, companyId)));
    if (existing.length > 0) {
      await db.update(settings).set({ value: fmt as any }).where(and(eq(settings.key, 'document_format'), eq(settings.companyId, companyId)));
    } else {
      await db.insert(settings).values({ key: 'document_format', companyId, value: fmt as any })
        .onConflictDoUpdate({ target: settings.key, set: { value: fmt as any, companyId } });
    }
  }

  async getMediaImportInfo(): Promise<{ filename: string; importedAt: string; machines: number; options: number } | null> {
    const rows = await db.select().from(settings).where(eq(settings.key, 'media_import_info'));
    if (!rows.length || !rows[0].value) return null;
    return rows[0].value as any;
  }

  async saveMediaImportInfo(info: { filename: string; importedAt: string; machines: number; options: number }): Promise<void> {
    await db.insert(settings)
      .values({ key: 'media_import_info', value: info as any })
      .onConflictDoUpdate({ target: settings.key, set: { value: info as any } });
  }

  async getFamilyDefaults(companyId: number): Promise<Record<string, any>> {
    const EMPTY_VALS = { minMaxLength: "", maxWidth: "", minMaxThickness: "", averageLineSpeed: "", controlSide: "", maxBow: "", paint: "", substrate: "", finishing: "", standardVoltage: "", standardColors: "", components: "", precautions: "", commissioning: "" };
    const FAMILIES = ["rullo", "spruzzatrici", "robot", "profilo", "velo"];
    const LANGS = ["it", "en", "de", "fr", "es", "pt"];
    const emptyLang = () => Object.fromEntries(LANGS.map(l => [l, { ...EMPTY_VALS }])) as Record<string, Record<string, string>>;
    const DEFAULT: Record<string, any> = Object.fromEntries(FAMILIES.map(f => [f, emptyLang()]));
    const rows = await db.select().from(settings).where(and(eq(settings.key, 'family_defaults'), eq(settings.companyId, companyId)));
    if (!rows.length || !rows[0].value) return DEFAULT;
    const saved = rows[0].value as Record<string, any>;
    for (const family of FAMILIES) {
      const fv = saved[family];
      if (!fv || typeof fv !== "object") continue;
      const isNested = LANGS.some(l => fv[l] && typeof fv[l] === "object");
      if (isNested) {
        for (const lang of LANGS) {
          DEFAULT[family][lang] = { ...EMPTY_VALS, ...(fv[lang] ?? {}) };
        }
      } else {
        // legacy flat → put under "it"
        DEFAULT[family].it = { ...EMPTY_VALS, ...fv };
      }
    }
    if (saved.__labels && typeof saved.__labels === "object") {
      DEFAULT.__labels = saved.__labels;
    }
    return DEFAULT;
  }

  async saveFamilyDefaults(companyId: number, data: Record<string, any>): Promise<void> {
    const existing = await db.select().from(settings).where(and(eq(settings.key, 'family_defaults'), eq(settings.companyId, companyId)));
    if (existing.length > 0) {
      await db.update(settings).set({ value: data as any }).where(and(eq(settings.key, 'family_defaults'), eq(settings.companyId, companyId)));
    } else {
      await db.insert(settings).values({ key: 'family_defaults', companyId, value: data as any });
    }
  }

  async getAiEnabled(companyId: number): Promise<boolean> {
    const rows = await db.select().from(settings).where(and(eq(settings.key, 'ai_enabled'), eq(settings.companyId, companyId)));
    if (!rows.length || rows[0].value === null) return false;
    return (rows[0].value as any).enabled === true;
  }

  async saveAiEnabled(companyId: number, enabled: boolean): Promise<void> {
    const existing = await db.select().from(settings).where(and(eq(settings.key, 'ai_enabled'), eq(settings.companyId, companyId)));
    if (existing.length > 0) {
      await db.update(settings).set({ value: { enabled } as any }).where(and(eq(settings.key, 'ai_enabled'), eq(settings.companyId, companyId)));
    } else {
      await db.insert(settings).values({ key: 'ai_enabled', companyId, value: { enabled } as any });
    }
  }

  async hasDealerDocumentFormat(dealerCompanyId: number): Promise<boolean> {
    const settingsKey = `dealer_doc_format_${dealerCompanyId}`;
    const rows = await db.select().from(settings).where(eq(settings.key, settingsKey));
    return rows.length > 0 && rows[0].value != null;
  }

  async getDealerDocumentFormat(dealerCompanyId: number): Promise<DocumentFormatSettings> {
    const settingsKey = `dealer_doc_format_${dealerCompanyId}`;
    const rows = await db.select().from(settings).where(eq(settings.key, settingsKey));
    const defaultResult: DocumentFormatSettings = { sections: DEFAULT_DOC_SECTIONS, pageBackground: DEFAULT_PAGE_BACKGROUND, borderRadius: DEFAULT_BORDER_RADIUS, borderWidth: DEFAULT_BORDER_WIDTH };
    if (!rows.length || !rows[0].value) return defaultResult;
    const raw = rows[0].value as any;
    const savedSections: DocSection[] = Array.isArray(raw) ? raw : (raw.sections ?? DEFAULT_DOC_SECTIONS);
    const pageBackground: string = (Array.isArray(raw) ? undefined : raw.pageBackground) ?? DEFAULT_PAGE_BACKGROUND;
    const savedIds = savedSections.map((s: DocSection) => s.id);
    const missing = DEFAULT_DOC_SECTIONS.filter(d => !savedIds.includes(d.id));
    const borderRadius: number = (Array.isArray(raw) ? undefined : raw.borderRadius) ?? DEFAULT_BORDER_RADIUS;
    const borderWidth: number = (Array.isArray(raw) ? undefined : raw.borderWidth) ?? DEFAULT_BORDER_WIDTH;
    const header = { ...DEFAULT_HEADER_CONFIG, ...(Array.isArray(raw) ? {} : raw.header ?? {}) };
    const rawFooter = Array.isArray(raw) ? {} : (raw.footer ?? {});
    const footer = { ...DEFAULT_FOOTER_CONFIG, ...rawFooter };
    if (rawFooter.companyLines && Array.isArray(rawFooter.companyLines)) {
      footer.companyLines = rawFooter.companyLines;
    }
    return {
      sections: [...savedSections, ...missing], pageBackground, borderRadius, borderWidth, header, footer,
      dealerLogoFilename: raw.dealerLogoFilename,
      dealerOfferPrefix: raw.dealerOfferPrefix,
      dealerOfferNextNumber: raw.dealerOfferNextNumber,
      dealerOfferNumberPadding: raw.dealerOfferNumberPadding,
      offerReferenceFormat: raw.offerReferenceFormat ?? undefined,
    } as DocumentFormatSettings;
  }

  async saveDealerDocumentFormat(dealerCompanyId: number, fmt: DocumentFormatSettings): Promise<void> {
    const settingsKey = `dealer_doc_format_${dealerCompanyId}`;
    const existing = await db.select().from(settings).where(eq(settings.key, settingsKey));
    if (existing.length > 0) {
      await db.update(settings).set({ value: fmt as any }).where(eq(settings.key, settingsKey));
    } else {
      await db.insert(settings).values({ key: settingsKey, companyId: dealerCompanyId, value: fmt as any });
    }
  }

  async getDashboardTileOrder(userKey: string): Promise<string[] | null> {
    const rows = await db.select().from(settings).where(eq(settings.key, userKey));
    if (!rows.length || !rows[0].value) return null;
    const v = rows[0].value as any;
    if (Array.isArray(v?.order)) return v.order.filter((x: any) => typeof x === "string");
    return null;
  }

  async setDashboardTileOrder(userKey: string, companyId: number | null, order: string[]): Promise<void> {
    const existing = await db.select().from(settings).where(eq(settings.key, userKey));
    const value = { order } as any;
    if (existing.length > 0) {
      await db.update(settings).set({ value }).where(eq(settings.key, userKey));
    } else {
      await db.insert(settings).values({ key: userKey, companyId: companyId ?? undefined, value });
    }
  }

  async clearDashboardTileOrder(userKey: string): Promise<void> {
    await db.delete(settings).where(eq(settings.key, userKey));
  }

  async getAvatar(key: string): Promise<string | null> {
    const rows = await db.select().from(settings).where(eq(settings.key, key));
    if (!rows.length || !rows[0].value) return null;
    return (rows[0].value as any).photoUrl ?? null;
  }

  async setAvatar(key: string, companyId: number, photoUrl: string): Promise<void> {
    const existing = await db.select().from(settings).where(eq(settings.key, key));
    if (existing.length > 0) {
      await db.update(settings).set({ value: { photoUrl } as any }).where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, companyId, value: { photoUrl } as any });
    }
  }

  async getMasterProfile(companyId: number): Promise<{ name: string; surname: string; email: string; mobileNumber: string; photoUrl?: string }> {
    const rows = await db.select().from(settings).where(and(eq(settings.key, 'master_profile'), eq(settings.companyId, companyId)));
    if (!rows.length || !rows[0].value) return { name: "", surname: "", email: "", mobileNumber: "" };
    return rows[0].value as any;
  }

  async saveMasterProfile(companyId: number, profile: { name: string; surname: string; email: string; mobileNumber: string; photoUrl?: string }): Promise<void> {
    const existing = await db.select().from(settings).where(and(eq(settings.key, 'master_profile'), eq(settings.companyId, companyId)));
    if (existing.length > 0) {
      await db.update(settings).set({ value: profile as any }).where(and(eq(settings.key, 'master_profile'), eq(settings.companyId, companyId)));
    } else {
      await db.insert(settings).values({ key: 'master_profile', companyId, value: profile as any });
    }
  }
  async createCatalogImport(companyId: number, data: { filename: string; fileHash: string; machineCount: number; optionCount: number }): Promise<{ id: number }> {
    const [row] = await db.insert(catalogImports).values({
      companyId,
      filename: data.filename,
      fileHash: data.fileHash,
      machineCount: data.machineCount,
      optionCount: data.optionCount,
    }).returning();
    return row;
  }

  async getActiveCatalogVersionId(companyId: number): Promise<number | null> {
    const [row] = await db.select({ id: catalogImports.id })
      .from(catalogImports)
      .where(eq(catalogImports.companyId, companyId))
      .orderBy(desc(catalogImports.id))
      .limit(1);
    return row?.id ?? null;
  }
}

export const settingsRepository = new SettingsRepository();
