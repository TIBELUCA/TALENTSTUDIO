import { Router } from "express";
import { db, eq, desc, and, gte, lte, sql, isNull, isNotNull } from "../repositories/base";
import { ilike, inArray } from "drizzle-orm";
import { jobOrders, jobOrderDocuments, jobOrderVersions, offers, customers, interactions, contacts, offerItems, offerItemOptions, salesmanUsers, dealerUsers, dealerCompanies, productionFacilities, machines, machineOptions, offerDocuments } from "@shared/schema";
import type { OrderBillingInfo, OrderShippingInfo, OrderLineItem, OrderPriceSummary, OrderShippingTerms, OrderAgentInfo, OrderPaymentTerm, OrderLineTechnicalData, OrderTechnicalSheet, OrderLogistics, OfferHistoryEntry, TimelineEvent, ProductionProgressEntry, AuditLogEntry } from "@shared/schema";
import { canEditSection } from "@shared/schema";
import type { UserRole } from "@shared/schema";
import { displayVersion } from "@shared/version";
import { requireSalesmanOrMaster, requireMaster, requireSalesRole, getSalesmanId, getPerformedBy, isMaster, getUserRole, getBackofficeParentId, getBackofficeParentIds } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import { generateOrderPdf } from "../orderPdf";

const ORDERS_ASSETS = path.join(process.cwd(), "server/assets/order-documents");
if (!fs.existsSync(ORDERS_ASSETS)) fs.mkdirSync(ORDERS_ASSETS, { recursive: true });

const LAYOUT_ASSETS = path.join(process.cwd(), "server/assets/order-layouts");
if (!fs.existsSync(LAYOUT_ASSETS)) fs.mkdirSync(LAYOUT_ASSETS, { recursive: true });

const CERT_ASSETS = path.join(process.cwd(), "server/assets/order-certificates");
if (!fs.existsSync(CERT_ASSETS)) fs.mkdirSync(CERT_ASSETS, { recursive: true });

const PREVIEW_ASSETS = path.join(process.cwd(), "server/assets/order-previews");
if (!fs.existsSync(PREVIEW_ASSETS)) fs.mkdirSync(PREVIEW_ASSETS, { recursive: true });

const CONFIRMATION_ASSETS = path.join(process.cwd(), "server/assets/order-confirmations");
if (!fs.existsSync(CONFIRMATION_ASSETS)) fs.mkdirSync(CONFIRMATION_ASSETS, { recursive: true });

const documentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ORDERS_ASSETS),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});
const uploadDocument = multer({ storage: documentStorage });

const layoutStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LAYOUT_ASSETS),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});
const uploadLayout = multer({ storage: layoutStorage, fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf") });

const confirmationStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CONFIRMATION_ASSETS),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});
const uploadConfirmation = multer({ storage: confirmationStorage, fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf") });

const certStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CERT_ASSETS),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, "");
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const uploadCert = multer({ storage: certStorage });

const router = Router();

async function enforceBackofficeOrderAccess(req: any, orderId: number): Promise<void> {
  const parentIds = getBackofficeParentIds(req);
  if (parentIds.length === 0) return;
  const [order] = await db.select({ responsibleUserId: jobOrders.responsibleUserId }).from(jobOrders).where(eq(jobOrders.id, orderId));
  if (!order || order.responsibleUserId == null || !parentIds.includes(order.responsibleUserId)) {
    throw new AppError(403, "Access denied: order not linked to your salesman");
  }
}

async function generateJobNumber(year: number): Promise<string> {
  const prefix = `JOB-${year}-`;
  const rows = await db.select({ jobNumber: jobOrders.jobNumber }).from(jobOrders)
    .where(ilike(jobOrders.jobNumber, `${prefix}%`));
  let maxSeq = 0;
  for (const r of rows) {
    const seq = parseInt(r.jobNumber.replace(prefix, ""), 10);
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

async function ensureUniqueJobNumber(desired: string): Promise<string> {
  const existing = await db.select({ id: jobOrders.id }).from(jobOrders)
    .where(eq(jobOrders.jobNumber, desired)).limit(1);
  if (existing.length === 0) return desired;
  let suffix = 2;
  while (true) {
    const candidate = `${desired}-${suffix}`;
    const dup = await db.select({ id: jobOrders.id }).from(jobOrders)
      .where(eq(jobOrders.jobNumber, candidate)).limit(1);
    if (dup.length === 0) return candidate;
    suffix++;
  }
}

router.get("/api/orders", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const conditions: any[] = [isNull(jobOrders.deletedAt)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));

  const backofficeParents = getBackofficeParentIds(req);
  if (backofficeParents.length > 0) {
    conditions.push(inArray(jobOrders.responsibleUserId, backofficeParents));
  }

  if (req.query.year) {
    const year = Number(req.query.year);
    conditions.push(gte(jobOrders.createdAt, new Date(`${year}-01-01`)));
    conditions.push(lte(jobOrders.createdAt, new Date(`${year}-12-31T23:59:59.999Z`)));
  }

  const rows = await db
    .select({
      jobOrder: jobOrders,
      customerName: customers.name,
      offerRef: offers.referenceNumber,
      offerSubject: offers.subject,
    })
    .from(jobOrders)
    .leftJoin(customers, eq(jobOrders.customerId, customers.id))
    .leftJoin(offers, eq(jobOrders.offerId, offers.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(jobOrders.createdAt));

  const result = rows.map(r => ({
    ...r.jobOrder,
    customerName: r.customerName,
    offerRef: r.offerRef,
    offerSubject: r.offerSubject,
  }));

  if (req.query.q) {
    const q = (req.query.q as string).toLowerCase();
    const filtered = result.filter(r =>
      r.jobNumber.toLowerCase().includes(q) ||
      (r.customerName ?? "").toLowerCase().includes(q) ||
      (r.offerRef ?? "").toLowerCase().includes(q)
    );
    return res.json(filtered);
  }

  res.json(result);
}));

router.get("/api/orders/years", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const conditions: any[] = [isNull(jobOrders.deletedAt)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));
  const backofficeParentYears = getBackofficeParentIds(req);
  if (backofficeParentYears.length > 0) conditions.push(inArray(jobOrders.responsibleUserId, backofficeParentYears));

  const rows = await db
    .select({ year: sql<number>`EXTRACT(YEAR FROM ${jobOrders.createdAt})::int` })
    .from(jobOrders)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(sql`EXTRACT(YEAR FROM ${jobOrders.createdAt})`)
    .orderBy(desc(sql`EXTRACT(YEAR FROM ${jobOrders.createdAt})`));

  const years = rows.map(r => r.year);
  const currentYear = new Date().getFullYear();
  if (!years.includes(currentYear)) years.unshift(currentYear);
  res.json(years);
}));

router.get("/api/orders/preview", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const offerId = Number(req.query.offerId);
  const customerId = Number(req.query.customerId);
  if (!offerId || !customerId) throw AppError.badRequest("offerId and customerId required");

  const data = await buildPrePopulatedOrder(offerId, customerId, req.companyId);
  const { offer } = data;
  const pd: any = offer.projectData ?? {};

  res.json({
    offerId,
    customerId,
    customerName: data.customerName,
    offerRef: offer.referenceNumber,
    offerSubject: offer.subject,
    status: "active",
    settore: "Legno",
    jobCode: offer.salesmanName || pd.jobCode || "",
    responsibleUserId: offer.salesmanUserId ?? null,
    agentInfo: data.agentInfo,
    billingInfo: data.billingInfo,
    shippingInfo: data.shippingInfo,
    facilities: data.facilities,
    deliveryDate: null,
    assemblyDate: null,
    testingDate: null,
    paymentTerms: [
      { condition: "30% acconto alla conferma ordine" },
      { condition: "60% avviso merce pronta" },
      { condition: "5% montaggio meccanico ultimato" },
      { condition: "5% collaudo ultimato" },
    ],
    bankName: "",
    orderItems: data.orderLineItems,
    additionalItems: data.additionalItems,
    priceSummary: data.priceSummary,
    shippingTerms: data.shippingTerms,
    lineTechnicalData: data.lineTechnicalData,
    technicalSheets: data.technicalSheets,
    logistics: (() => {
      const tlData = buildDefaultLogisticsWithTimeline(pd);
      return {
        contractualDeliveryDate: tlData.contractualDeliveryDate,
        hasPenalties: false,
        penaltiesDescription: "",
        contractualAssemblyStartDate: "",
        contractualTestingEndDate: tlData.contractualTestingEndDate,
        shipments: [],
        phases: [],
        timeline: tlData.timeline,
      };
    })(),
    notes: "",
  });
}));

router.get("/api/orders/:id", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const orderConditions: any[] = [eq(jobOrders.id, Number(req.params.id))];
  if (req.companyId) orderConditions.push(eq(jobOrders.companyId, req.companyId));
  const backofficeParentDetail = getBackofficeParentIds(req);
  if (backofficeParentDetail.length > 0) orderConditions.push(inArray(jobOrders.responsibleUserId, backofficeParentDetail));

  const [row] = await db
    .select({
      jobOrder: jobOrders,
      customerName: customers.name,
      offerRef: offers.referenceNumber,
      offerSubject: offers.subject,
      offerStatus: offers.status,
      offerTotalPrice: offers.totalPrice,
      offerVersion: offers.version,
      offerSalesmanName: offers.salesmanName,
    })
    .from(jobOrders)
    .leftJoin(customers, eq(jobOrders.customerId, customers.id))
    .leftJoin(offers, eq(jobOrders.offerId, offers.id))
    .where(and(...orderConditions));

  if (!row) throw AppError.notFound("Job order not found");

  const docs = await db.select().from(jobOrderDocuments)
    .where(eq(jobOrderDocuments.jobOrderId, row.jobOrder.id))
    .orderBy(desc(jobOrderDocuments.uploadedAt));

  const contactRows = row.jobOrder.contactIds?.length
    ? await db.select().from(contacts).where(
        sql`${contacts.id} = ANY(ARRAY[${sql.raw(row.jobOrder.contactIds.join(","))}]::int[])`
      )
    : [];

  let lastModifiedByName = "";
  if (row.jobOrder.lastModifiedByUserId) {
    const [u] = await db.select({ name: salesmanUsers.name, surname: salesmanUsers.surname }).from(salesmanUsers).where(eq(salesmanUsers.id, row.jobOrder.lastModifiedByUserId));
    if (u) lastModifiedByName = [u.name, u.surname].filter(Boolean).join(" ");
  }

  const facilities = row.jobOrder.customerId
    ? await db.select().from(productionFacilities).where(eq(productionFacilities.customerId, row.jobOrder.customerId))
    : [];

  let lineTechnicalData = row.jobOrder.lineTechnicalData;
  let technicalSheets: any[] = (row.jobOrder.technicalSheets as any[]) ?? [];
  if (!lineTechnicalData && Array.isArray(technicalSheets) && technicalSheets.length > 0) {
    const first: any = technicalSheets[0];
    if (first.controlSide !== undefined || first.workingWidth !== undefined) {
      lineTechnicalData = {
        controlSide: first.controlSide ?? "",
        workingWidth: first.workingWidth ?? "",
        ralColor: first.ralColor ?? "",
        workingHeight: first.workingHeight ?? "",
        speedRange: first.speedRange ?? "",
        workingSpeed: first.workingSpeed ?? "",
        motorProtection: first.motorProtection ?? "",
        electricalProtection: first.electricalProtection ?? "",
        rollerHardness: first.rollerHardness ?? "",
        rubberThickness: first.rubberThickness ?? "",
        transportType: first.transportType ?? "",
        transportLength: first.transportLength ?? "",
        hoodLength: first.hoodLength ?? "",
        airSupply: first.airSupply ?? "",
        exhaustTower: first.exhaustTower ?? "",
        energySources: first.energySources ?? { heating: "", electrical: "", pneumatic: "" },
        performance: first.performance ?? { speed: "", shifts: "", minPieceDimensions: "", maxPieceDimensions: "", maxPieceWeight: "" },
        automations: first.automations ?? { requested: "", control: "", extraControl: "" },
        commissioning: first.commissioning ?? { assemblyStartDate: "", productionStartDate: "", electricalWiring: "", electricalCables: "" },
      };
      technicalSheets = technicalSheets.map((s: any) => ({
        machinePosition: s.machinePosition,
        machineName: s.machineName,
        lamps: s.lamps ?? {},
        optionals: s.optionals ?? [],
        spareParts: s.spareParts ?? [],
      }));
    }
  }

  if (row.jobOrder.offerId && Array.isArray(technicalSheets) && technicalSheets.length > 0) {
    const sheetsNeedEnrichment = technicalSheets.some((s: any) => !s.currentDescription || !s.machineImageUrl || s.originalDescription === undefined || s.isCustomMachine === undefined);
    if (sheetsNeedEnrichment) {
      try {
        const [linkedOffer] = await db.select().from(offers).where(eq(offers.id, row.jobOrder.offerId));
        if (linkedOffer) {
          const pd: any = linkedOffer.projectData ?? {};
          const origDescs: Record<string, string> = pd.originalMachineDescs ?? {};
          const oItems = await db.select().from(offerItems).where(eq(offerItems.offerId, linkedOffer.id));
          const itemsByPos = new Map(oItems.map(it => [it.position, it]));
          let enriched = false;
          technicalSheets = technicalSheets.map((sheet: any) => {
            const matchItem = itemsByPos.get(sheet.machinePosition);
            if (!matchItem) return sheet;
            const patch: any = {};
            if (!sheet.machineImageUrl && matchItem.snapshotImageUrl) {
              patch.machineImageUrl = matchItem.snapshotImageUrl;
            }
            if (!sheet.currentDescription && matchItem.snapshotMachineDescription) {
              patch.currentDescription = matchItem.snapshotMachineDescription;
            }
            if (!sheet.originalDescription) {
              const origDesc = origDescs[String(matchItem.machineId)] ?? "";
              const currDesc = matchItem.snapshotMachineDescription ?? "";
              if (origDesc && currDesc && origDesc !== currDesc) {
                patch.originalDescription = origDesc;
              }
            }
            if (sheet.isCustomMachine === undefined) {
              const isCustom = matchItem.machineId === 0 || matchItem.snapshotMacroType === "custom";
              patch.isCustomMachine = isCustom || false;
            }
            if (Object.keys(patch).length > 0) {
              enriched = true;
              return { ...sheet, ...patch };
            }
            return sheet;
          });
          if (enriched) {
            await db.update(jobOrders)
              .set({ technicalSheets: technicalSheets as any })
              .where(eq(jobOrders.id, row.jobOrder.id));
          }
        }
      } catch {}
    }
  }

  res.json({
    ...row.jobOrder,
    lineTechnicalData,
    technicalSheets,
    customerName: row.customerName,
    offerRef: row.offerRef,
    offerSubject: row.offerSubject,
    offerStatus: row.offerStatus,
    offerTotalPrice: row.offerTotalPrice,
    offerVersion: row.offerVersion,
    offerSalesmanName: row.offerSalesmanName,
    documents: docs,
    contacts: contactRows,
    lastModifiedByName,
    facilities,
  });
}));

function isEmptyValue(v: any): boolean {
  if (v == null) return true;
  if (v === "" || v === 0 || v === false) return false;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && Object.keys(v).length === 0) return true;
  return false;
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  const na = a ?? null;
  const nb = b ?? null;
  if (na === null && nb === null) return true;
  if (na === null || nb === null) {
    if (isEmptyValue(na) && isEmptyValue(nb)) return true;
    return false;
  }
  if (typeof na !== typeof nb) {
    if (typeof na === "number" && typeof nb === "string") return String(na) === nb;
    if (typeof na === "string" && typeof nb === "number") return na === String(nb);
    return false;
  }
  if (Array.isArray(na) && Array.isArray(nb)) {
    if (na.length !== nb.length) return false;
    for (let i = 0; i < na.length; i++) {
      if (!deepEqual(na[i], nb[i])) return false;
    }
    return true;
  }
  if (Array.isArray(na) || Array.isArray(nb)) return false;
  if (typeof na === "object" && typeof nb === "object") {
    if (na instanceof Date && nb instanceof Date) return na.getTime() === nb.getTime();
    if (na instanceof Date || nb instanceof Date) {
      const da = na instanceof Date ? na.toISOString() : String(na);
      const db = nb instanceof Date ? nb.toISOString() : String(nb);
      return da === db;
    }
    const allKeys = new Set([...Object.keys(na), ...Object.keys(nb)]);
    for (const key of allKeys) {
      if (!deepEqual(na[key], nb[key])) return false;
    }
    return true;
  }
  return na === nb;
}

const TECH_SHEET_TRANSIENT_KEYS = new Set([
  "machineImageUrl", "isCustomMachine", "originalDescription", "currentDescription",
  "snapshotImageUrl", "snapshotMachineDescription", "snapshotMacroType",
]);

const TECH_SHEET_ARRAY_FIELDS = new Set(["optionals", "spareParts"]);
const TECH_SHEET_OBJECT_FIELDS = new Set(["lamps", "energySources", "performance", "automations", "commissioning"]);
const TECH_SHEET_CANONICAL_KEYS = [
  "machinePosition", "machineName", "sheetNumber",
  "controlSide", "workingWidth", "ralColor", "workingHeight",
  "regulations", "language", "speedRange", "workingSpeed",
  "optionals", "spareParts", "lamps",
  "energySources", "performance", "automations", "commissioning",
];

function normalizeTechSheet(sheet: any): Record<string, any> {
  if (sheet == null || typeof sheet !== "object") return {};
  const result: Record<string, any> = {};
  const allKeys = new Set([...TECH_SHEET_CANONICAL_KEYS, ...Object.keys(sheet)]);
  for (const k of allKeys) {
    if (TECH_SHEET_TRANSIENT_KEYS.has(k)) continue;
    const v = sheet[k];
    if (TECH_SHEET_ARRAY_FIELDS.has(k)) {
      result[k] = Array.isArray(v) ? v : [];
    } else if (TECH_SHEET_OBJECT_FIELDS.has(k)) {
      result[k] = (v != null && typeof v === "object" && !Array.isArray(v)) ? v : {};
    } else {
      result[k] = v == null ? "" : typeof v === "object" ? v : String(v).trim();
    }
  }
  return result;
}

function computeChangeSummary(oldData: Record<string, any>, newData: Record<string, any>): string[] {
  const changes: string[] = [];
  const norm = (v: any) => (v == null || String(v).trim() === "") ? "" : String(v).trim();
  const has = (obj: Record<string, any>, key: string) => key in obj;
  const changed = (key: string) => has(newData, key) && has(oldData, key) && norm(newData[key]) !== norm(oldData[key]);
  const jsonChanged = (key: string) => has(newData, key) && has(oldData, key) && !deepEqual(newData[key], oldData[key]);

  if (changed("jobNumber") && norm(newData.jobNumber) !== "")
    changes.push(`Nome commessa modificato: ${oldData.jobNumber ?? "—"} → ${newData.jobNumber}`);

  if (changed("status"))
    changes.push(`Stato cambiato: ${oldData.status ?? "—"} → ${newData.status}`);

  if (changed("settore"))
    changes.push(`Settore modificato: ${newData.settore}`);

  if (changed("jobCode"))
    changes.push(`Job/Responsabile modificato: ${newData.jobCode}`);

  if (has(newData, "responsibleUserId") && has(oldData, "responsibleUserId") && newData.responsibleUserId !== oldData.responsibleUserId)
    changes.push("Responsabile cambiato");

  if (jsonChanged("agentInfo")) {
    const oldA = oldData.agentInfo ?? {};
    const newA = newData.agentInfo ?? {};
    const aFields: [string, string][] = [["dealerCompanyName", "Azienda Agente"], ["dealerContactName", "Contatto Agente"], ["code", "Codice Agente"]];
    const aDetails: string[] = [];
    for (const [k, l] of aFields) { if (norm(newA[k]) !== norm(oldA[k])) aDetails.push(`${l}: ${norm(newA[k]) || "—"}`); }
    if (aDetails.length > 0) aDetails.forEach(d => changes.push(d));
    else changes.push("Dati agente modificati");
  }

  if (jsonChanged("billingInfo")) {
    const oldB = oldData.billingInfo ?? {};
    const newB = newData.billingInfo ?? {};
    const bFields: [string, string][] = [["companyName", "Ragione Sociale"], ["address", "Indirizzo"], ["city", "Città"], ["country", "Nazione"], ["vatId", "P.IVA"]];
    const bDetails: string[] = [];
    for (const [k, l] of bFields) { if (norm(newB[k]) !== norm(oldB[k])) bDetails.push(`${l}: ${norm(newB[k]) || "—"}`); }
    if (bDetails.length > 0) bDetails.forEach(d => changes.push(d));
    else changes.push("Dati fatturazione modificati");
  }

  if (jsonChanged("shippingInfo")) {
    const oldS = oldData.shippingInfo ?? {};
    const newS = newData.shippingInfo ?? {};
    const sFields: [string, string][] = [["companyName", "Destinazione"], ["address", "Indirizzo Dest."], ["city", "Città Dest."], ["country", "Nazione Dest."]];
    const sDetails: string[] = [];
    for (const [k, l] of sFields) { if (norm(newS[k]) !== norm(oldS[k])) sDetails.push(`${l}: ${norm(newS[k]) || "—"}`); }
    if (sDetails.length > 0) sDetails.forEach(d => changes.push(d));
    else changes.push("Dati destinazione modificati");
  }

  if (changed("bankName"))
    changes.push(`Banca modificata: ${newData.bankName || "rimossa"}`);

  if (jsonChanged("paymentTerms")) {
    const oldTerms: any[] = oldData.paymentTerms ?? [];
    const newTerms: any[] = newData.paymentTerms ?? [];
    if (newTerms.length > oldTerms.length) changes.push(`Aggiunte condizioni di pagamento (${newTerms.length})`);
    else if (newTerms.length < oldTerms.length) changes.push(`Rimosse condizioni di pagamento (da ${oldTerms.length} a ${newTerms.length})`);
    else changes.push("Condizioni di pagamento modificate");
  }

  if (jsonChanged("orderItems")) {
    const oldItems: any[] = oldData.orderItems ?? [];
    const newItems: any[] = newData.orderItems ?? [];

    if (newItems.length > oldItems.length) {
      for (let i = oldItems.length; i < newItems.length; i++) {
        const item = newItems[i];
        changes.push(`Aggiunta macchina Pos.${item.position ?? i + 1}: ${item.description || "—"}`);
      }
    } else if (newItems.length < oldItems.length) {
      for (let i = newItems.length; i < oldItems.length; i++) {
        const item = oldItems[i];
        changes.push(`Rimossa macchina Pos.${item.position ?? i + 1}: ${item.description || "—"}`);
      }
    }

    for (let i = 0; i < Math.min(oldItems.length, newItems.length); i++) {
      if (!deepEqual(oldItems[i], newItems[i])) {
        const desc = newItems[i].description || `Pos.${newItems[i].position ?? i + 1}`;
        const subChanges: string[] = [];
        if (newItems[i].unitPrice !== oldItems[i].unitPrice) subChanges.push("prezzo");
        if (newItems[i].description !== oldItems[i].description) subChanges.push("descrizione");
        if (!deepEqual(newItems[i].options, oldItems[i].options)) subChanges.push("opzioni");
        if (!deepEqual(newItems[i].spareParts, oldItems[i].spareParts)) subChanges.push("ricambi");
        if (newItems[i].position !== oldItems[i].position) subChanges.push("posizione");

        if (subChanges.length > 0) {
          changes.push(`Modificata macchina ${desc} (${subChanges.join(", ")})`);
        } else {
          changes.push(`Modificata macchina ${desc}`);
        }
      }
    }
  }

  if (jsonChanged("additionalItems")) {
    const oldAdd: any[] = oldData.additionalItems ?? [];
    const newAdd: any[] = newData.additionalItems ?? [];
    if (newAdd.length > oldAdd.length) changes.push(`Aggiunte voci aggiuntive (${newAdd.length - oldAdd.length})`);
    else if (newAdd.length < oldAdd.length) changes.push(`Rimosse voci aggiuntive (${oldAdd.length - newAdd.length})`);
    else changes.push("Voci aggiuntive modificate");
  }

  if (jsonChanged("priceSummary")) {
    const oldP = oldData.priceSummary ?? {};
    const newP = newData.priceSummary ?? {};
    const priceFields = [
      { key: "totalPrice", label: "Prezzo totale" },
      { key: "discount", label: "Sconto" },
      { key: "discountPercent", label: "Sconto %" },
      { key: "assemblyPrice", label: "Prezzo montaggio" },
    ];
    let priceChanged = false;
    for (const { key, label } of priceFields) {
      if (newP[key] !== oldP[key]) {
        changes.push(`${label} modificato`);
        priceChanged = true;
      }
    }
    if (!priceChanged && !deepEqual(oldP, newP)) changes.push("Riepilogo prezzi modificato");
  }

  if (jsonChanged("shippingTerms")) {
    const oldST = oldData.shippingTerms ?? {};
    const newST = newData.shippingTerms ?? {};
    const stDetails: string[] = [];
    if (String(newST.incoterms ?? "") !== String(oldST.incoterms ?? "")) stDetails.push(`incoterms: ${oldST.incoterms || "—"} → ${newST.incoterms || "—"}`);
    if (String(newST.packaging ?? "") !== String(oldST.packaging ?? "")) stDetails.push("imballo");
    if (String(newST.exchangeRate ?? "") !== String(oldST.exchangeRate ?? "")) stDetails.push("tasso di cambio");
    if (stDetails.length > 0) changes.push(`Termini di spedizione modificati (${stDetails.join(", ")})`);
    else changes.push("Termini di spedizione modificati");
  }

  if (jsonChanged("lineTechnicalData")) {
    const TECH_LABELS: Record<string, string> = {
      controlSide: "Lato Comandi", workingWidth: "Larghezza Lavoro", ralColor: "Colore RAL",
      workingHeight: "Altezza Piano Lavoro", speedRange: "Range Velocità", workingSpeed: "Velocità Lavoro",
      motorProtection: "Protezione Motori", electricalProtection: "Protezione Elettrica",
      rollerHardness: "Durezza Rulli", rubberThickness: "Spessore Gomma",
      transportType: "Tipo Trasporto", transportLength: "Lunghezza Trasporto",
      hoodLength: "Lunghezza Cappa", airSupply: "Alimentazione Aria",
      exhaustTower: "Torre Aspirazione", minMaxLength: "Lunghezza Min/Max Pezzi",
      minMaxThickness: "Spessore Min/Max", maxBow: "Arco Massimo",
      paint: "Vernice", substrate: "Substrato", finishing: "Finitura",
    };
    const NESTED_LABELS: Record<string, Record<string, string>> = {
      energySources: { heating: "Riscaldamento", electrical: "Alimentazione Elettrica", pneumatic: "Alimentazione Pneumatica" },
      performance: { speed: "Velocità", shifts: "Turni", minPieceDimensions: "Dim. Min Pezzi", maxPieceDimensions: "Dim. Max Pezzi", maxPieceWeight: "Peso Max Pezzi" },
      automations: { requested: "Automazioni Richieste", control: "Controllo", extraControl: "Controllo Extra" },
      commissioning: { assemblyStartDate: "Data Inizio Montaggio", productionStartDate: "Data Inizio Produzione", electricalWiring: "Cablaggio Elettrico", electricalCables: "Cavi Elettrici" },
    };
    const oldTech = oldData.lineTechnicalData ?? {};
    const newTech = newData.lineTechnicalData ?? {};
    let detailFound = false;
    for (const [key, label] of Object.entries(TECH_LABELS)) {
      if (norm(newTech[key]) !== norm(oldTech[key])) {
        const val = norm(newTech[key]) || "—";
        changes.push(`${label}: ${val}`);
        detailFound = true;
      }
    }
    for (const [group, fields] of Object.entries(NESTED_LABELS)) {
      const oldG = oldTech[group] ?? {};
      const newG = newTech[group] ?? {};
      for (const [key, label] of Object.entries(fields)) {
        if (norm(newG[key]) !== norm(oldG[key])) {
          const val = norm(newG[key]) || "—";
          changes.push(`${label}: ${val}`);
          detailFound = true;
        }
      }
    }
    if (!detailFound) changes.push("Dati tecnici generali modificati");
  }

  if (has(newData, "technicalSheets") && has(oldData, "technicalSheets")) {
    const oldSheetsRaw: any[] = oldData.technicalSheets ?? [];
    const newSheetsRaw: any[] = newData.technicalSheets ?? [];
    const oldSheets = oldSheetsRaw.map(normalizeTechSheet);
    const newSheets = newSheetsRaw.map(normalizeTechSheet);
    const sheetsChanged = !deepEqual(oldSheets, newSheets);
    if (sheetsChanged) {
      const SHEET_LABELS: Record<string, string> = {
        machineName: "Nome Macchina", machinePosition: "Posizione",
        controlSide: "Lato Comandi", workingWidth: "Larghezza Lavoro",
        ralColor: "Colore RAL", workingHeight: "Altezza Piano Lavoro",
        regulations: "Normative", language: "Lingua",
        sheetNumber: "N° Scheda", speedRange: "Range Velocità",
        workingSpeed: "Velocità di Lavoro",
      };
      if (newSheets.length > oldSheets.length) {
        for (let i = oldSheets.length; i < newSheets.length; i++) {
          changes.push(`Aggiunta scheda tecnica: ${newSheetsRaw[i]?.machineName || `Pos.${newSheetsRaw[i]?.machinePosition ?? i + 1}`}`);
        }
      } else if (newSheets.length < oldSheets.length) {
        for (let i = newSheets.length; i < oldSheets.length; i++) {
          changes.push(`Rimossa scheda tecnica: ${oldSheetsRaw[i]?.machineName || `Pos.${oldSheetsRaw[i]?.machinePosition ?? i + 1}`}`);
        }
      }
      for (let i = 0; i < Math.min(oldSheets.length, newSheets.length); i++) {
        if (!deepEqual(oldSheets[i], newSheets[i])) {
          const sheetName = newSheetsRaw[i]?.machineName || `Pos.${newSheetsRaw[i]?.machinePosition ?? i + 1}`;
          const subChanges: string[] = [];
          for (const [key, label] of Object.entries(SHEET_LABELS)) {
            if (norm(newSheets[i]?.[key]) !== norm(oldSheets[i]?.[key])) subChanges.push(`${label}: ${norm(newSheets[i]?.[key]) || "—"}`);
          }
          if (!deepEqual(newSheets[i]?.lamps, oldSheets[i]?.lamps)) subChanges.push("lampade");
          if (!deepEqual(newSheets[i]?.optionals, oldSheets[i]?.optionals)) {
            const oldOpt = (oldSheets[i]?.optionals ?? []).length;
            const newOpt = (newSheets[i]?.optionals ?? []).length;
            if (oldOpt !== newOpt) subChanges.push(`optionals (${oldOpt} → ${newOpt})`);
            else subChanges.push("optionals");
          }
          if (!deepEqual(newSheets[i]?.spareParts, oldSheets[i]?.spareParts)) {
            const oldSp = (oldSheets[i]?.spareParts ?? []).length;
            const newSp = (newSheets[i]?.spareParts ?? []).length;
            if (oldSp !== newSp) subChanges.push(`ricambi (${oldSp} → ${newSp})`);
            else subChanges.push("ricambi");
          }
          if (!deepEqual(newSheets[i]?.energySources, oldSheets[i]?.energySources)) subChanges.push("fonti energetiche");
          if (!deepEqual(newSheets[i]?.performance, oldSheets[i]?.performance)) subChanges.push("prestazioni");
          if (!deepEqual(newSheets[i]?.automations, oldSheets[i]?.automations)) subChanges.push("automazioni");
          if (!deepEqual(newSheets[i]?.commissioning, oldSheets[i]?.commissioning)) subChanges.push("messa in servizio");
          if (subChanges.length > 0) changes.push(`Scheda ${sheetName}: ${subChanges.join(", ")}`);
          else changes.push(`Scheda ${sheetName} modificata`);
        }
      }
    }
  }

  if (jsonChanged("logistics")) {
    const oldL = oldData.logistics ?? {};
    const newL = newData.logistics ?? {};
    if (norm(newL.contractualDeliveryDate) !== norm(oldL.contractualDeliveryDate)) changes.push("Data consegna contrattuale modificata");
    if (newL.hasPenalties !== oldL.hasPenalties) changes.push(newL.hasPenalties ? "Penali aggiunte" : "Penali rimosse");
    else if (norm(newL.penaltiesDescription) !== norm(oldL.penaltiesDescription)) changes.push("Descrizione penali modificata");
    if (!deepEqual(newL.shipments, oldL.shipments)) {
      const oldS = (oldL.shipments ?? []).length;
      const newS = (newL.shipments ?? []).length;
      if (newS > oldS) changes.push(`Aggiunte spedizioni (${newS - oldS})`);
      else if (newS < oldS) changes.push(`Rimosse spedizioni (${oldS - newS})`);
      else changes.push("Spedizioni modificate");
    }
    if (!deepEqual(newL.phases, oldL.phases)) {
      const oldP = (oldL.phases ?? []).length;
      const newP = (newL.phases ?? []).length;
      if (newP > oldP) changes.push(`Aggiunte fasi montaggio (${newP - oldP})`);
      else if (newP < oldP) changes.push(`Rimosse fasi montaggio (${oldP - newP})`);
      else changes.push("Fasi montaggio modificate");
    }
    if (!deepEqual(newL.timeline, oldL.timeline)) {
      if (!changes.some(c => c.includes("spedizioni") || c.includes("fasi montaggio") || c.includes("consegna") || c.includes("collaudo") || c.includes("montaggio"))) {
        changes.push("Timeline modificata");
      }
    }
    if (norm(newL.contractualAssemblyStartDate) !== norm(oldL.contractualAssemblyStartDate)) changes.push("Data inizio montaggio modificata");
    if (norm(newL.contractualTestingEndDate) !== norm(oldL.contractualTestingEndDate)) changes.push("Data fine collaudo modificata");
  }

  const normDate = (v: any) => {
    if (v == null) return "";
    if (v instanceof Date) return v.toISOString();
    return String(v).trim();
  };
  if (has(newData, "deliveryDate") && has(oldData, "deliveryDate") && normDate(newData.deliveryDate) !== normDate(oldData.deliveryDate))
    changes.push("Data consegna modificata");
  if (has(newData, "assemblyDate") && has(oldData, "assemblyDate") && normDate(newData.assemblyDate) !== normDate(oldData.assemblyDate))
    changes.push("Data montaggio modificata");
  if (has(newData, "testingDate") && has(oldData, "testingDate") && normDate(newData.testingDate) !== normDate(oldData.testingDate))
    changes.push("Data collaudo modificata");

  if (has(newData, "notes") && has(oldData, "notes") && norm(newData.notes) !== norm(oldData.notes))
    changes.push("Note modificate");

  if (jsonChanged("contactIds"))
    changes.push("Contatti modificati");

  if (changed("layoutPdfFilename"))
    changes.push(newData.layoutPdfFilename ? "Layout PDF caricato" : "Layout PDF rimosso");

  if (changed("orderConfirmationFilename"))
    changes.push(newData.orderConfirmationFilename ? "Conferma d'ordine caricata" : "Conferma d'ordine rimossa");

  if (jsonChanged("sectionComments"))
    changes.push("Commenti di sezione modificati");

  if (jsonChanged("productionProgress"))
    changes.push("Progresso produzione aggiornato");

  if (has(newData, "confirmationComment") && has(oldData, "confirmationComment") && norm(newData.confirmationComment) !== norm(oldData.confirmationComment))
    changes.push("Commento di conferma modificato");

  return changes;
}

function buildOrderSnapshot(order: any): Record<string, any> {
  return {
    jobNumber: order.jobNumber,
    status: order.status,
    notes: order.notes,
    settore: order.settore,
    jobCode: order.jobCode,
    agentInfo: order.agentInfo,
    billingInfo: order.billingInfo,
    shippingInfo: order.shippingInfo,
    deliveryDate: order.deliveryDate,
    assemblyDate: order.assemblyDate,
    testingDate: order.testingDate,
    paymentTerms: order.paymentTerms,
    bankName: order.bankName,
    orderItems: order.orderItems,
    additionalItems: order.additionalItems,
    priceSummary: order.priceSummary,
    shippingTerms: order.shippingTerms,
    lineTechnicalData: order.lineTechnicalData,
    technicalSheets: order.technicalSheets,
    logistics: order.logistics,
    contactIds: order.contactIds,
    responsibleUserId: order.responsibleUserId,
    layoutPdfFilename: order.layoutPdfFilename,
    layoutPdfOriginalName: order.layoutPdfOriginalName,
    orderConfirmationFilename: order.orderConfirmationFilename,
    orderConfirmationOriginalName: order.orderConfirmationOriginalName,
    offerId: order.offerId,
    offerHistory: order.offerHistory,
    manualFormData: order.manualFormData,
    sectionComments: order.sectionComments,
    productionProgress: order.productionProgress,
  };
}

async function appendAuditLog(orderId: number, action: string, performedBy: string, tx?: any): Promise<void> {
  const entry: AuditLogEntry = { action, timestamp: new Date().toISOString(), performedBy };
  const executor = tx || db;
  await executor.update(jobOrders)
    .set({ auditLog: sql`COALESCE(${jobOrders.auditLog}, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb` })
    .where(eq(jobOrders.id, orderId));
}

const createOrderSchema = z.object({
  offerId: z.number(),
  customerId: z.number(),
  contactIds: z.array(z.number()).optional(),
  notes: z.string().optional(),
  responsibleUserId: z.number().nullable().optional(),
});

function buildDefaultLogisticsWithTimeline(projectData: any): {
  timeline: TimelineEvent[];
  contractualDeliveryDate: string;
  contractualTestingEndDate: string;
} {
  const today = new Date().toISOString().slice(0, 10);
  const deliveryMode = projectData?.deliveryMode ?? "days";
  const deliveryDays = parseInt(projectData?.deliveryDays ?? "90", 10) || 90;
  const deliveryDateStr = projectData?.deliveryDate ?? "";

  let contractualDeliveryDate = "";
  if (deliveryMode === "date" && deliveryDateStr) {
    contractualDeliveryDate = deliveryDateStr;
  } else if (deliveryDays > 0) {
    const d = new Date();
    d.setDate(d.getDate() + deliveryDays);
    contractualDeliveryDate = d.toISOString().slice(0, 10);
  }

  let testingEndDate = "";

  const events: TimelineEvent[] = [
    { id: "evt-order", type: "order_date", label: "Data Ordine", plannedDate: today, actualDate: today, status: "completed", notes: "", autoCalculated: true },
    { id: "evt-contract-del", type: "contractual_delivery", label: "Consegna da Contratto", plannedDate: contractualDeliveryDate, actualDate: "", status: "pending", notes: "", autoCalculated: !!contractualDeliveryDate },
    { id: "evt-contract-test", type: "contractual_testing", label: "Collaudo da Contratto", plannedDate: testingEndDate, actualDate: "", status: "pending", notes: "", autoCalculated: !!testingEndDate },
  ];

  return { timeline: events, contractualDeliveryDate, contractualTestingEndDate: testingEndDate };
}

async function buildPrePopulatedOrder(offerId: number, customerId: number, companyId?: number) {
  const offerConditions = [eq(offers.id, offerId)];
  if (companyId) offerConditions.push(eq(offers.companyId, companyId));
  const [offer] = await db.select().from(offers).where(and(...offerConditions));
  if (!offer) throw AppError.notFound("Offer not found");

  const customerConditions = [eq(customers.id, customerId)];
  if (companyId) customerConditions.push(eq(customers.companyId, companyId));
  const [customer] = await db.select().from(customers).where(and(...customerConditions));
  if (!customer) throw AppError.notFound("Customer not found");

  const items = await db.select().from(offerItems).where(eq(offerItems.offerId, offerId));
  const allOptions = items.length > 0
    ? await db.select().from(offerItemOptions).where(
        sql`${offerItemOptions.offerItemId} IN (${sql.raw(items.map(i => i.id).join(","))})`
      )
    : [];

  const safeNum = (v: any, fallback = 0): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const pd: any = offer.projectData ?? {};
  const techSpecs: any = pd.technicalSpecs ?? {};

  const billingInfo: OrderBillingInfo = {
    name: customer?.name ?? "",
    city: customer?.city ?? "",
    address: customer?.address ?? "",
    country: customer?.country ?? "",
    vatId: customer?.vatNumber ?? customer?.fiscalCode ?? "",
    phone: customer?.officePhone ?? "",
    fax: customer?.fax ?? "",
  };

  const shippingInfo: OrderShippingInfo = {
    name: customer.name ?? "",
    city: customer.city ?? "",
    address: customer.address ?? "",
    country: customer.country ?? "",
    phone: customer.officePhone ?? "",
    fax: customer.fax ?? "",
  };

  const facilities = await db.select().from(productionFacilities).where(eq(productionFacilities.customerId, customer.id));

  const pricingData: any = pd.pricing ?? {};
  const itemComments: any[] = pricingData.itemComments ?? [];
  const itemDiscounts: any[] = pricingData.itemDiscounts ?? [];
  const globalDiscountPctSrc: number = safeNum(pricingData.discountPercent);

  const orderLineItems: OrderLineItem[] = items
    .sort((a, b) => a.position - b.position)
    .map((item, idx) => {
      const itemOpts = allOptions.filter(o => o.offerItemId === item.id);
      const ic = itemComments[idx] ?? {};
      const optHidden: Record<string, boolean> = ic.optionPriceHidden ?? {};
      const lineCfg: any = itemDiscounts[idx] ?? {};
      const optionDiscountsMap: Record<string, any> = lineCfg.optionDiscounts ?? {};
      const machineQty = (item as any).quantity ?? 1;
      const basePrice = safeNum(item.snapshotBasePrice);
      // Hidden options sum (rolled into base machine "list")
      const hiddenSumUnit = itemOpts.reduce((s, o) => {
        const moid = (o as any).machineOptionId;
        return optHidden[String(moid)] ? s + safeNum(o.snapshotPriceModifier) * ((o as any).quantity ?? 1) : s;
      }, 0);
      const machineListLine = (basePrice + hiddenSumUnit) * machineQty;
      const machineEffectivePct = lineCfg.isNet
        ? null
        : (lineCfg.discountOverridePercent != null ? Number(lineCfg.discountOverridePercent) : globalDiscountPctSrc);
      const options: OrderLineItemOption[] = itemOpts
        .filter(o => {
          const moid = (o as any).machineOptionId;
          const price = safeNum(o.snapshotPriceModifier);
          return price !== 0 && !optHidden[String(moid)];
        })
        .map(o => {
          const moid = (o as any).machineOptionId;
          const optQty = (o as any).quantity ?? 1;
          const optUnit = safeNum(o.snapshotPriceModifier);
          const optList = optUnit * optQty * machineQty;
          const optCfg: any = optionDiscountsMap[String(moid)] ?? {};
          return {
            name: o.snapshotOptionName,
            price: optUnit,
            listPrice: optList,
            discountPercent: optCfg.isNet ? null : (optCfg.discountOverridePercent ?? null),
            isNet: !!optCfg.isNet,
          };
        });
      return {
        position: item.position,
        description: item.snapshotMachineName,
        unitPrice: basePrice,
        options,
        listPrice: machineListLine,
        discountPercent: machineEffectivePct,
        isNet: !!lineCfg.isNet,
        globalDiscountPercent: globalDiscountPctSrc,
      };
    });

  const installConfig: any = pricingData.installationConfig ?? {};
  const servItems: any = pricingData.serviceItems ?? {};

  const interlockingPPP = pricingData.interlockingPricePerPosition ?? 0;
  const interlockingTotal = items.length * interlockingPPP;
  const additionalItems: OrderLineItem[] = [];
  if (interlockingTotal > 0) {
    additionalItems.push({
      position: 0,
      description: "Interlocking",
      unitPrice: interlockingTotal,
      listPrice: interlockingTotal,
      discountPercent: globalDiscountPctSrc,
      isNet: false,
      globalDiscountPercent: globalDiscountPctSrc,
    });
  }
  const extraItems: any[] = pricingData.extraItems ?? [];
  extraItems.forEach((ei: any, i: number) => {
    if (ei.name && safeNum(ei.price) !== 0) {
      const extraGross = safeNum(ei.price);
      const extraIsNet = !!ei.isNet;
      const extraEffectivePct = extraIsNet
        ? null
        : (ei.discountOverridePercent != null ? Number(ei.discountOverridePercent) : globalDiscountPctSrc);
      additionalItems.push({
        position: i + 1,
        description: ei.name,
        unitPrice: extraGross,
        listPrice: extraGross,
        discountPercent: extraEffectivePct,
        isNet: extraIsNet,
        globalDiscountPercent: globalDiscountPctSrc,
      });
    }
  });

  const itemsBaseTotal = orderLineItems.reduce((s, i) => s + i.unitPrice + (i.options ?? []).reduce((os, o) => os + o.price, 0), 0);
  const machinesTotal = itemsBaseTotal + additionalItems.reduce((s, i) => s + i.unitPrice, 0);
  const totalListPrice = safeNum(pricingData.totalListPrice, machinesTotal);

  const assemblyDailyRate = safeNum(installConfig.dailyFee);
  const travelDays = safeNum(installConfig.travelDays);
  const mechanicalDays = safeNum(installConfig.mechanicalDays);
  const electricalDays = safeNum(installConfig.electricalDays);
  const testingDaysVal = safeNum(installConfig.testingDays);
  const installTrainingDays = safeNum(installConfig.installTrainingDays);
  const assemblySoldDays = travelDays + mechanicalDays + electricalDays + testingDaysVal + installTrainingDays || safeNum(installConfig.totalDays);
  const assemblyPurePrice = assemblyDailyRate * assemblySoldDays;
  const installationIncluded = !!installConfig.included;
  const assemblyPrice = installationIncluded ? safeNum(installConfig.totalPrice) : 0;
  const assemblyServicesCost = Math.max(0, assemblyPrice - assemblyPurePrice);
  const travelIncluded = !!servItems.travelCosts;
  const hotelIncluded = !!servItems.boardLodging;
  const trainingIncluded = !!servItems.trainingIncluded;
  const trainingDays = servItems.trainingDays ?? "";
  const packagingIncluded = !!servItems.packaging;
  const transportIncluded = !!servItems.transportIncluded;
  const transportPrice = transportIncluded ? safeNum(servItems.transportPrice) : 0;
  const discountPct = pricingData.discountPercent ?? 0;
  const discountAmount = discountPct > 0 ? (machinesTotal * discountPct / 100) : 0;
  const grossTotal = safeNum(pricingData.grossTotal, machinesTotal + assemblyPrice + transportPrice);
  const netTotal = safeNum(pricingData.netTotal, grossTotal - discountAmount);
  const totalOrderPrice = netTotal;

  const assemblyNotes = installConfig.notes ?? (installationIncluded ? "" : "ESCLUSO");
  const transportNotes = servItems.transportNotes ?? (transportIncluded ? "" : "escluso da quotare");

  const priceSummary: OrderPriceSummary = {
    machinesTotal,
    assemblyPrice,
    assemblyNotes,
    transportPrice,
    transportNotes,
    totalOrderPrice,
    assemblyDailyRate,
    assemblySoldDays,
    assemblyPurePrice,
    assemblyServicesCost,
    travelIncluded,
    hotelIncluded,
    travelDays,
    mechanicalDays,
    electricalDays,
    testingDays: testingDaysVal,
    installTrainingDays,
    rentalCarDailyFee: safeNum(servItems.travelCostsDailyFee),
    rentalCarDays: safeNum(servItems.travelCostsDays),
    rentalCarTotal: safeNum(servItems.travelCostsDailyFee) * safeNum(servItems.travelCostsDays),
    flightTicketCost: safeNum(servItems.travelFlightTicket),
    interlockingTotal,
    totalListPrice,
    trainingIncluded,
    trainingDays,
    packagingIncluded,
    transportIncluded,
    installationIncluded,
    discountPercent: discountPct,
    discountAmount,
    grossTotal,
    netTotal,
    priceLabels: pricingData.priceLabels ?? {},
  };

  const shippingTerms: OrderShippingTerms = {
    incoterms: pricingData.incoterms ?? servItems.incoterms ?? "",
    exchangeRate: pricingData.exchangeRate ?? null,
    packaging: servItems.packaging ?? pricingData.packaging ?? "Incluso",
  };

  let dealerName = "";
  let dealerCompanyName = "";
  let dealerCompanyId: number | null = null;
  if (offer.dealerId) {
    const [dealer] = await db.select({
      name: dealerUsers.name, surname: dealerUsers.surname,
      dealerCompanyId: dealerUsers.dealerCompanyId,
    }).from(dealerUsers).where(eq(dealerUsers.id, offer.dealerId));
    if (dealer) {
      dealerName = [dealer.name, dealer.surname].filter(Boolean).join(" ");
      if (dealer.dealerCompanyId) {
        dealerCompanyId = dealer.dealerCompanyId;
        const [dc] = await db.select({ companyName: dealerCompanies.companyName }).from(dealerCompanies).where(eq(dealerCompanies.id, dealer.dealerCompanyId));
        if (dc) dealerCompanyName = dc.companyName;
      }
    }
  }

  const agentInfo: OrderAgentInfo = {
    code: dealerName || pd.agentCode || "",
    dealerId: dealerCompanyId,
    dealerCompanyName: dealerCompanyName || "",
    dealerContactName: dealerName || "",
  };

  const lineTechnicalData: OrderLineTechnicalData = {
    controlSide: techSpecs.controlSide ?? "",
    workingWidth: techSpecs.maxWidth ?? "",
    ralColor: techSpecs.ralColor ?? "",
    workingHeight: techSpecs.workingHeight ?? "",
    speedRange: techSpecs.speedRange ?? "",
    workingSpeed: techSpecs.averageLineSpeed ?? "",
    motorProtection: techSpecs.motorProtection ?? "",
    electricalProtection: techSpecs.electricalProtection ?? "",
    rollerHardness: techSpecs.rollerHardness ?? "",
    rubberThickness: techSpecs.rubberThickness ?? "",
    transportType: techSpecs.transportType ?? "",
    transportLength: techSpecs.transportLength ?? "",
    hoodLength: techSpecs.hoodLength ?? "",
    airSupply: techSpecs.airSupply ?? "",
    exhaustTower: techSpecs.exhaustTower ?? "",
    minMaxLength: techSpecs.minMaxLength ?? "",
    minMaxThickness: techSpecs.minMaxThickness ?? "",
    maxBow: techSpecs.maxBow ?? "",
    paint: techSpecs.paint ?? "",
    substrate: techSpecs.substrate ?? "",
    finishing: techSpecs.finishing ?? "",
    energySources: {
      heating: techSpecs.heating ?? "",
      electrical: techSpecs.electrical ?? "",
      pneumatic: techSpecs.pneumatic ?? "",
    },
    performance: {
      speed: techSpecs.averageLineSpeed ?? "",
      shifts: techSpecs.shifts ?? "",
      minPieceDimensions: techSpecs.minPieceDimensions ?? "",
      maxPieceDimensions: techSpecs.maxPieceDimensions ?? "",
      maxPieceWeight: techSpecs.maxPieceWeight ?? "",
    },
    automations: {
      requested: techSpecs.automationsRequested ?? "",
      control: techSpecs.automationsControl ?? "",
      extraControl: techSpecs.extraControl ?? "",
    },
    commissioning: {
      assemblyStartDate: "",
      productionStartDate: "",
      electricalWiring: techSpecs.electricalWiring ?? "",
      electricalCables: techSpecs.electricalCables ?? "",
    },
  };

  const originalMachineDescs: Record<string, string> = pd.originalMachineDescs ?? {};

  const technicalSheets: OrderTechnicalSheet[] = items
    .sort((a, b) => a.position - b.position)
    .map((item) => {
      const itemOpts = allOptions.filter(o => o.offerItemId === item.id);
      const origDesc = originalMachineDescs[String(item.machineId)] ?? "";
      const currDesc = item.snapshotMachineDescription ?? "";
      const hasDescChanges = origDesc && currDesc && origDesc !== currDesc;
      const isCustom = item.machineId === 0 || item.snapshotMacroType === "custom";
      return {
        machinePosition: item.position,
        machineName: item.snapshotMachineName,
        machineImageUrl: item.snapshotImageUrl ?? undefined,
        isCustomMachine: isCustom || undefined,
        lamps: {},
        optionals: itemOpts.map(o => o.snapshotOptionName),
        spareParts: [],
        ...(currDesc ? { currentDescription: currDesc } : {}),
        ...(hasDescChanges ? { originalDescription: origDesc } : {}),
      };
    });

  return {
    offer,
    customerName: customer?.name ?? "",
    billingInfo,
    shippingInfo,
    facilities,
    orderLineItems,
    additionalItems,
    priceSummary,
    shippingTerms,
    agentInfo,
    lineTechnicalData,
    technicalSheets,
  };
}

const uploadPdf = multer({ storage: multer.memoryStorage(), fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf"), limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/api/orders/extract-pdf", requireSalesmanOrMaster, uploadPdf.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest("PDF file required");

  const { execSync } = await import("child_process");
  const os = await import("os");

  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-vision-"));
  let imageContents: { type: "image_url"; image_url: { url: string; detail: "high" } }[] = [];
  let savedPreviewFiles: string[] = [];
  try {
    const pdfPath = path.join(tmpDir, "input.pdf");
    fs.writeFileSync(pdfPath, req.file.buffer);

    execSync(`pdftoppm -jpeg -r 200 "${pdfPath}" "${path.join(tmpDir, 'page')}"`, { timeout: 30000 });
    const pageFiles = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith("page-") && f.endsWith(".jpg"))
      .sort((a, b) => {
        const na = parseInt(a.match(/page-(\d+)/)?.[1] ?? "0");
        const nb = parseInt(b.match(/page-(\d+)/)?.[1] ?? "0");
        return na - nb;
      });

    if (pageFiles.length === 0) throw new Error("No pages");

    imageContents = pageFiles.map((f, idx) => {
      const buf = fs.readFileSync(path.join(tmpDir, f));
      const previewName = `${sessionId}-page-${idx + 1}.jpg`;
      fs.writeFileSync(path.join(PREVIEW_ASSETS, previewName), buf);
      savedPreviewFiles.push(previewName);
      return {
        type: "image_url" as const,
        image_url: { url: `data:image/jpeg;base64,${buf.toString("base64")}`, detail: "high" as const },
      };
    });
  } catch (convErr) {
    throw AppError.badRequest("Unable to convert PDF to images for analysis");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  if (!process.env.OPENAI_API_KEY) throw AppError.badRequest("OpenAI API key not configured");
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const visionPrompt = `Analyze these scanned pages of an Italian internal order document ("Ordine Interno") for industrial machinery.
Extract ALL data into this exact JSON structure. Read every field carefully from the images.

{
  "header": {
    "orderNumber": "e.g. 26A118",
    "orderDate": "YYYY-MM-DD format",
    "modifyDate": "YYYY-MM-DD format or empty",
    "settore": "e.g. Legno, Metallo, Plastica, Vetro, Altro",
    "job": "e.g. FG",
    "agent": "e.g. APT",
    "agentCommission": "e.g. 0,00",
    "agent2Commission": "e.g. 0,00"
  },
  "billing": {
    "customerName": "company name",
    "city": "",
    "address": "",
    "country": "",
    "phone": "",
    "fax": ""
  },
  "destination": "e.g. Da comunicare",
  "payment": {
    "deliveryDate": "YYYY-MM-DD format",
    "terms": ["line 1", "line 2"]
  },
  "orderItems": [
    { "description": "machine/item name", "price": "formatted price e.g. 11.078,00" }
  ],
  "totals": {
    "totalMachines": "e.g. 140.037,11",
    "assemblyAndTesting": "e.g. 4.500,00",
    "assemblyAndTestingNotes": "any notes about assembly, e.g. viaggio incluso, vitto e alloggio ESCLUSI",
    "transport": "e.g. 0,00",
    "totalOrder": "e.g. 144.537,11",
    "resa": "e.g. C&F Dubai da quotare",
    "packaging": "e.g. Incluso",
    "exchangeRate": "e.g. 1.936,27"
  },
  "technicalSheets": [
    {
      "sheetNumber": "e.g. 0016",
      "totalSheets": "e.g. 3",
      "machineName": "full machine name",
      "areaManager": "",
      "commandSide": "e.g. DX",
      "workWidth": "e.g. 1300",
      "colorRAL": "e.g. 7035",
      "regulations": "e.g. CE",
      "language": "e.g. Inglese",
      "sector": "e.g. Standard",
      "components": "e.g. Standard",
      "heatingEnergy": "e.g. Acqua 85°",
      "electricSupply": "e.g. 400/50+T+N",
      "pneumaticSupply": "e.g. 6 Atm.",
      "workSpeed": "e.g. 8-10 m/1'",
      "dailyShifts": "e.g. 1x8",
      "minPieceDimensions": "e.g. 300x20x3 mm",
      "maxPieceDimensions": "e.g. 3000x1280x90 mm",
      "maxPieceWeight": "",
      "requiredAutomations": "",
      "automationControl": "",
      "extraControl": "",
      "workPlaneHeight": "",
      "speedVariation": "",
      "motorProtection": "",
      "electricalProtection": "",
      "transportType": "",
      "transportLength": "",
      "rollerHardness": "",
      "rubberThickness": "",
      "optionals": ["optional 1", "optional 2"],
      "spareParts": ["part 1", "part 2"],
      "assemblyStartDate": "",
      "productionStartDate": "",
      "electricalCabling": "",
      "electricalCables": "",
      "notes": ""
    }
  ]
}

Rules:
- Extract EVERY piece of text visible in the images
- Keep Italian text as-is (don't translate)
- For prices use the exact format shown (Italian number format with dots and commas)
- If a field is empty or not found, use empty string ""
- For arrays (orderItems, optionals, spareParts, payment terms), include ALL items found
- The first page is always the main order, subsequent pages are technical sheets ("Scheda Tecnica")
- Each technical sheet corresponds to one machine - create a separate object in technicalSheets array
- Read carefully: optionals and spare parts may be numbered lists
- Return ONLY valid JSON, no markdown`;

  const visionResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: visionPrompt },
        ...imageContents,
      ],
    }],
    max_tokens: 8000,
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const content = visionResponse.choices[0]?.message?.content ?? "{}";
  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(content);
  } catch {
    throw AppError.badRequest("AI could not parse this document — try filling in fields manually");
  }

  const sheetSchema = z.object({
    sheetNumber: z.string().default(""),
    totalSheets: z.string().default(""),
    machineName: z.string().default(""),
    areaManager: z.string().default(""),
    commandSide: z.string().default(""),
    workWidth: z.string().default(""),
    colorRAL: z.string().default(""),
    regulations: z.string().default(""),
    language: z.string().default(""),
    sector: z.string().default(""),
    components: z.string().default(""),
    heatingEnergy: z.string().default(""),
    electricSupply: z.string().default(""),
    pneumaticSupply: z.string().default(""),
    workSpeed: z.string().default(""),
    dailyShifts: z.string().default(""),
    minPieceDimensions: z.string().default(""),
    maxPieceDimensions: z.string().default(""),
    maxPieceWeight: z.string().default(""),
    requiredAutomations: z.string().default(""),
    automationControl: z.string().default(""),
    extraControl: z.string().default(""),
    workPlaneHeight: z.string().default(""),
    speedVariation: z.string().default(""),
    motorProtection: z.string().default(""),
    electricalProtection: z.string().default(""),
    transportType: z.string().default(""),
    transportLength: z.string().default(""),
    rollerHardness: z.string().default(""),
    rubberThickness: z.string().default(""),
    optionals: z.array(z.string()).default([]),
    spareParts: z.array(z.string()).default([]),
    assemblyStartDate: z.string().default(""),
    productionStartDate: z.string().default(""),
    electricalCabling: z.string().default(""),
    electricalCables: z.string().default(""),
    notes: z.string().default(""),
  });

  const extractedSchema = z.object({
    header: z.object({
      orderNumber: z.string().default(""),
      orderDate: z.string().default(""),
      modifyDate: z.string().default(""),
      settore: z.string().default(""),
      job: z.string().default(""),
      agent: z.string().default(""),
      agentCommission: z.string().default(""),
      agent2Commission: z.string().default(""),
    }).default({}),
    billing: z.object({
      customerName: z.string().default(""),
      city: z.string().default(""),
      address: z.string().default(""),
      country: z.string().default(""),
      phone: z.string().default(""),
      fax: z.string().default(""),
    }).default({}),
    destination: z.string().default(""),
    payment: z.object({
      deliveryDate: z.string().default(""),
      terms: z.array(z.string()).default([]),
    }).default({}),
    orderItems: z.array(z.object({
      description: z.string().default(""),
      price: z.string().default(""),
    })).default([]),
    totals: z.object({
      totalMachines: z.string().default(""),
      assemblyAndTesting: z.string().default(""),
      transport: z.string().default(""),
      totalOrder: z.string().default(""),
      resa: z.string().default(""),
      packaging: z.string().default(""),
      exchangeRate: z.string().default(""),
    }).default({}),
    technicalSheets: z.array(sheetSchema).default([]),
  });

  const validated = extractedSchema.parse(rawParsed);
  res.json({ ...validated, previewPages: savedPreviewFiles });
}));

router.post("/api/orders/manual", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const schema = z.object({
    customerName: z.string().min(1),
    subject: z.string().optional(),
    totalPrice: z.number().optional(),
    status: z.string().optional(),
    notes: z.string().optional(),
    settore: z.string().optional(),
    year: z.number().optional(),
    jobCode: z.string().optional(),
    jobNumber: z.string().optional(),
    createdDate: z.string().optional(),
    previewPages: z.array(z.string()).optional(),
    manualFormData: z.record(z.any()).optional(),
  });
  const parsed = schema.parse(req.body);
  const year = parsed.year ?? new Date().getFullYear();
  const rawJobNumber = parsed.jobNumber?.trim() || parsed.jobCode?.trim() || await generateJobNumber(year);
  const jobNumber = await ensureUniqueJobNumber(rawJobNumber);

  let resolvedCustomerId: number | null = null;
  if (parsed.customerName) {
    const existing = await db.select({ id: customers.id }).from(customers)
      .where(and(ilike(customers.name, parsed.customerName), req.companyId ? eq(customers.companyId, req.companyId) : undefined))
      .limit(1);
    if (existing.length > 0) {
      resolvedCustomerId = existing[0].id;
    } else {
      const [newCust] = await db.insert(customers).values({
        name: parsed.customerName,
        companyId: req.companyId,
      }).returning();
      resolvedCustomerId = newCust.id;
    }
  }

  const priceSummary: OrderPriceSummary = {
    machinesTotal: parsed.totalPrice ?? 0,
    assemblyPrice: 0,
    assemblyNotes: "",
    transportPrice: 0,
    transportNotes: "",
    totalOrderPrice: parsed.totalPrice ?? 0,
    interlockingTotal: 0,
    totalListPrice: parsed.totalPrice ?? 0,
    discountPercent: 0,
  };

  const backofficeParentManual = getBackofficeParentId(req);
  const manualCreatorId = getSalesmanId(req);
  const manualCreatorName = await (async () => {
    if (!manualCreatorId) return "Sistema";
    const [u] = await db.select({ name: salesmanUsers.name, surname: salesmanUsers.surname }).from(salesmanUsers).where(eq(salesmanUsers.id, manualCreatorId));
    return u ? [u.name, u.surname].filter(Boolean).join(" ") : "Sistema";
  })();

  const order = await db.transaction(async (tx) => {
    const [created] = await tx.insert(jobOrders).values({
      companyId: req.companyId,
      jobNumber,
      offerId: null,
      customerId: resolvedCustomerId,
      status: parsed.status ?? "active",
      notes: [parsed.subject, parsed.notes].filter(Boolean).join("\n") || "",
      settore: parsed.settore ?? "Legno",
      jobCode: parsed.jobCode ?? "",
      orderItems: [],
      additionalItems: [],
      priceSummary,
      currentVersion: 1,
      lastModifiedByUserId: manualCreatorId,
      confirmationStatus: "pending",
      manualFormData: parsed.manualFormData ?? null,
      ...(backofficeParentManual ? { responsibleUserId: backofficeParentManual } : {}),
      ...(parsed.createdDate ? { createdAt: new Date(parsed.createdDate) } : {}),
    }).returning();
    await tx.insert(jobOrderVersions).values({
      jobOrderId: created.id,
      versionNumber: 0,
      snapshot: buildOrderSnapshot(created),
      modifiedByUserId: manualCreatorId,
      modifiedByName: manualCreatorName,
      changeNotes: "Creazione commessa manuale",
      changeSummary: ["Commessa creata manualmente"],
    });
    return created;
  });

  if (parsed.previewPages && parsed.previewPages.length > 0) {
    for (let i = 0; i < parsed.previewPages.length; i++) {
      const sessionFile = parsed.previewPages[i];
      const srcPath = path.join(PREVIEW_ASSETS, sessionFile);
      const destFile = `order-${order.id}-page-${i + 1}.jpg`;
      const destPath = path.join(PREVIEW_ASSETS, destFile);
      if (fs.existsSync(srcPath)) {
        fs.renameSync(srcPath, destPath);
      }
    }
  }

  res.status(201).json(order);
}));

router.patch("/api/orders/:id/manual", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, orderId);
  const schema = z.object({
    customerName: z.string().min(1),
    subject: z.string().optional(),
    totalPrice: z.number().optional(),
    status: z.string().optional(),
    notes: z.string().optional(),
    settore: z.string().optional(),
    jobCode: z.string().optional(),
    jobNumber: z.string().optional(),
    manualFormData: z.record(z.any()).optional(),
  });
  const parsed = schema.parse(req.body);

  const whereConditions = [eq(jobOrders.id, orderId)];
  if (req.companyId) whereConditions.push(eq(jobOrders.companyId, req.companyId));
  const [existing] = await db.select().from(jobOrders).where(and(...whereConditions));
  if (!existing) return res.status(404).json({ message: "Order not found" });
  if (existing.offerId) return res.status(400).json({ message: "Cannot edit offer-linked orders via this endpoint" });

  let resolvedCustomerId = existing.customerId;
  if (parsed.customerName && parsed.customerName.trim()) {
    const existingCust = await db.select({ id: customers.id }).from(customers)
      .where(and(ilike(customers.name, parsed.customerName), req.companyId ? eq(customers.companyId, req.companyId) : undefined))
      .limit(1);
    if (existingCust.length > 0) {
      resolvedCustomerId = existingCust[0].id;
    } else {
      const [newCust] = await db.insert(customers).values({
        name: parsed.customerName,
        companyId: req.companyId,
      }).returning();
      resolvedCustomerId = newCust.id;
    }
  }

  const priceSummary: OrderPriceSummary = {
    machinesTotal: parsed.totalPrice ?? 0,
    assemblyPrice: 0, assemblyNotes: "", transportPrice: 0, transportNotes: "",
    totalOrderPrice: parsed.totalPrice ?? 0,
    interlockingTotal: 0, totalListPrice: parsed.totalPrice ?? 0, discountPercent: 0,
  };

  const newJobNumber = parsed.jobNumber?.trim() || parsed.jobCode?.trim() || existing.jobNumber;

  const newVersion = existing.currentVersion + 1;
  const performedBy = await getPerformedBy(req);
  const setData: Record<string, any> = {
    jobNumber: newJobNumber,
    customerId: resolvedCustomerId,
    status: parsed.status ?? existing.status,
    notes: [parsed.subject, parsed.notes].filter(Boolean).join("\n") || existing.notes,
    settore: parsed.settore ?? existing.settore,
    jobCode: parsed.jobCode ?? existing.jobCode,
    priceSummary,
    manualFormData: parsed.manualFormData ?? existing.manualFormData,
    lastModifiedByUserId: getSalesmanId(req),
    lastModifiedByName: performedBy,
    currentVersion: newVersion,
    updatedAt: new Date(),
  };

  const [updated] = await db.transaction(async (tx) => {
    const fieldChanges = computeChangeSummary(existing as any, { ...existing, ...setData } as any);
    const pendingAudit: AuditLogEntry[] = (existing.auditLog as AuditLogEntry[] | null) ?? [];
    const auditActions = pendingAudit.map(e => e.action);
    const changeSummary = [...fieldChanges, ...auditActions];
    await tx.insert(jobOrderVersions).values({
      jobOrderId: orderId,
      versionNumber: existing.currentVersion,
      snapshot: buildOrderSnapshot(existing),
      modifiedByUserId: getSalesmanId(req),
      modifiedByName: performedBy,
      changeNotes: `Versione ${displayVersion(existing.currentVersion)}`,
      changeSummary: changeSummary.length > 0 ? changeSummary : null,
    });
    setData.auditLog = [];
    return tx.update(jobOrders)
      .set(setData)
      .where(eq(jobOrders.id, orderId))
      .returning();
  });

  res.json(updated);
}));

router.post("/api/orders", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const parsed = createOrderSchema.parse(req.body);
  const rawJobNumber = (req.body.jobNumber as string)?.trim() || await generateJobNumber(new Date().getFullYear());
  const jobNumber = await ensureUniqueJobNumber(rawJobNumber);

  const data = await buildPrePopulatedOrder(parsed.offerId, parsed.customerId, req.companyId);
  const { offer } = data;
  const pd: any = offer.projectData ?? {};

  const orderData = {
    status: req.body.status ?? "active",
    settore: req.body.settore ?? "Legno",
    jobCode: req.body.jobCode ?? offer.salesmanName ?? pd.jobCode ?? "",
    agentInfo: req.body.agentInfo ?? data.agentInfo,
    billingInfo: req.body.billingInfo ?? data.billingInfo,
    shippingInfo: req.body.shippingInfo ?? data.shippingInfo,
    deliveryDate: req.body.deliveryDate ? new Date(req.body.deliveryDate) : null,
    assemblyDate: req.body.assemblyDate ? new Date(req.body.assemblyDate) : null,
    testingDate: req.body.testingDate ? new Date(req.body.testingDate) : null,
    paymentTerms: req.body.paymentTerms ?? [],
    invoicing: req.body.invoicing ?? [],
    bankName: req.body.bankName ?? "",
    orderItems: req.body.orderItems ?? data.orderLineItems,
    additionalItems: req.body.additionalItems ?? data.additionalItems,
    priceSummary: req.body.priceSummary ?? data.priceSummary,
    shippingTerms: req.body.shippingTerms ?? data.shippingTerms,
    lineTechnicalData: req.body.lineTechnicalData ?? data.lineTechnicalData,
    technicalSheets: req.body.technicalSheets ?? data.technicalSheets,
    logistics: req.body.logistics ?? (() => {
      const tlData = buildDefaultLogisticsWithTimeline(pd);
      return { contractualDeliveryDate: tlData.contractualDeliveryDate, hasPenalties: false, penaltiesDescription: "", contractualAssemblyStartDate: "", contractualTestingEndDate: tlData.contractualTestingEndDate, shipments: [], phases: [], timeline: tlData.timeline };
    })(),
    notes: req.body.notes ?? parsed.notes ?? "",
  };

  const layoutDrawing = pd.layoutDrawing as { filename?: string; originalName?: string } | null | undefined;
  let layoutPdfFilename: string | null = null;
  let layoutPdfOriginalName: string | null = null;
  if (layoutDrawing?.filename) {
    const srcDir = path.join(process.cwd(), "server/assets/layout-drawings");
    const srcPath = path.join(srcDir, layoutDrawing.filename);
    if (fs.existsSync(srcPath)) {
      const ext = path.extname(layoutDrawing.filename);
      const destFilename = `layout-${jobNumber}-${Date.now()}${ext}`;
      const destPath = path.join(LAYOUT_ASSETS, destFilename);
      fs.copyFileSync(srcPath, destPath);
      layoutPdfFilename = destFilename;
      layoutPdfOriginalName = layoutDrawing.originalName ?? layoutDrawing.filename;
    }
  }

  const offerDocsToCarry = parsed.offerId
    ? await db.select().from(offerDocuments).where(eq(offerDocuments.offerId, parsed.offerId))
    : [];

  const backofficeParentCreate = getBackofficeParentId(req);
  const creatorId = getSalesmanId(req);
  const creatorPerformedBy = await (async () => {
    if (!creatorId) return "Sistema";
    const [u] = await db.select({ name: salesmanUsers.name, surname: salesmanUsers.surname }).from(salesmanUsers).where(eq(salesmanUsers.id, creatorId));
    return u ? [u.name, u.surname].filter(Boolean).join(" ") : "Sistema";
  })();

  const OFFER_DOCS_SRC = path.join(process.cwd(), "server/assets/offer-documents");

  const order = await db.transaction(async (tx) => {
    const [created] = await tx.insert(jobOrders).values({
      companyId: req.companyId,
      jobNumber,
      offerId: parsed.offerId,
      customerId: parsed.customerId,
      contactIds: parsed.contactIds ?? [],
      responsibleUserId: backofficeParentCreate ?? (parsed.responsibleUserId ?? offer.salesmanUserId),
      ...orderData,
      ...(layoutPdfFilename ? { layoutPdfFilename, layoutPdfOriginalName } : {}),
      currentVersion: 1,
      lastModifiedByUserId: creatorId,
      confirmationStatus: "pending",
      auditLog: [],
    }).returning();
    await tx.insert(jobOrderVersions).values({
      jobOrderId: created.id,
      versionNumber: 0,
      snapshot: buildOrderSnapshot(created),
      modifiedByUserId: creatorId,
      modifiedByName: creatorPerformedBy,
      changeNotes: "Creazione commessa",
      changeSummary: ["Commessa creata"],
    });
    for (const offerDoc of offerDocsToCarry) {
      const srcPath = path.join(OFFER_DOCS_SRC, offerDoc.filename);
      if (fs.existsSync(srcPath)) {
        const destFilename = `${Date.now()}-${offerDoc.originalName.replace(/\s+/g, "_")}`;
        const destPath = path.join(ORDERS_ASSETS, destFilename);
        fs.copyFileSync(srcPath, destPath);
        await tx.insert(jobOrderDocuments).values({
          jobOrderId: created.id,
          filename: destFilename,
          originalName: offerDoc.originalName,
          mimeType: offerDoc.mimeType,
          description: offerDoc.description,
        });
      }
    }

    return created;
  });

  res.status(201).json(order);
}));

router.patch("/api/orders/:id", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  const updateSchema = z.object({
    status: z.string().optional(),
    notes: z.string().optional(),
    contactIds: z.array(z.number()).optional(),
    responsibleUserId: z.number().nullable().optional(),
    settore: z.string().optional(),
    jobCode: z.string().optional(),
    jobNumber: z.string().optional(),
    agentInfo: z.any().optional(),
    billingInfo: z.any().optional(),
    shippingInfo: z.any().optional(),
    deliveryDate: z.string().nullable().optional(),
    assemblyDate: z.string().nullable().optional(),
    testingDate: z.string().nullable().optional(),
    paymentTerms: z.any().optional(),
    invoicing: z.any().optional(),
    bankName: z.string().optional(),
    orderItems: z.any().optional(),
    additionalItems: z.any().optional(),
    priceSummary: z.any().optional(),
    shippingTerms: z.any().optional(),
    lineTechnicalData: z.any().optional(),
    technicalSheets: z.any().optional(),
    logistics: z.any().optional(),
    sectionComments: z.any().optional(),
    _createVersion: z.boolean().optional(),
    _changeNotes: z.string().optional(),
  });
  const parsed = updateSchema.parse(req.body);
  const createVersion = parsed._createVersion ?? false;
  const changeNotes = parsed._changeNotes ?? "";
  delete (parsed as any)._createVersion;
  delete (parsed as any)._changeNotes;

  const SECTION_FIELDS: Record<string, string[]> = {
    overview: ["status", "settore", "jobCode", "jobNumber", "responsibleUserId", "agentInfo"],
    billing: ["billingInfo"],
    shipping: ["shippingInfo"],
    payments: ["paymentTerms", "bankName", "invoicing"],
    pricing: ["priceSummary", "orderItems", "additionalItems", "shippingTerms"],
    techData: ["lineTechnicalData"],
    techSheets: ["technicalSheets"],
    notes: ["notes"],
    documents: [],
    logistics: [],
    shipments: ["deliveryDate"],
    assembly: ["assemblyDate", "testingDate"],
    timeline: [],
  };

  const LOGISTICS_SUBKEYS: Record<string, string[]> = {
    shipments: ["shipments", "contractualDeliveryDate", "hasPenalties", "penaltiesDescription"],
    assembly: ["phases", "contractualAssemblyStartDate", "contractualTestingEndDate"],
    timeline: ["timeline"],
    logistics: ["shipments", "phases", "timeline", "contractualDeliveryDate", "hasPenalties", "penaltiesDescription", "contractualAssemblyStartDate", "contractualTestingEndDate"],
  };

  const userRole = isMaster(req) ? "master" as UserRole : (getUserRole(req) || "salesman" as UserRole);
  const allowedFields = new Set<string>(["_createVersion", "_changeNotes", "contactIds", "sectionComments"]);
  const allowedLogisticsKeys = new Set<string>();
  for (const [section, fields] of Object.entries(SECTION_FIELDS)) {
    if (canEditSection(section, userRole)) {
      fields.forEach(f => allowedFields.add(f));
      const logKeys = LOGISTICS_SUBKEYS[section];
      if (logKeys) logKeys.forEach(k => allowedLogisticsKeys.add(k));
    }
  }
  for (const key of Object.keys(parsed)) {
    if (key === "logistics") continue;
    if (!allowedFields.has(key) && (parsed as any)[key] !== undefined) {
      delete (parsed as any)[key];
    }
  }
  if (parsed.logistics && allowedLogisticsKeys.size > 0) {
    const incoming = parsed.logistics as Record<string, any>;
    const filtered: Record<string, any> = {};
    for (const key of Object.keys(incoming)) {
      if (allowedLogisticsKeys.has(key)) {
        filtered[key] = incoming[key];
      }
    }
    (parsed as any).logistics = filtered;
    allowedFields.add("logistics");
  } else {
    delete (parsed as any).logistics;
  }

  const conditions = [eq(jobOrders.id, id)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));
  const [existing] = await db.select().from(jobOrders).where(and(...conditions));
  if (!existing) throw AppError.notFound("Job order not found");

  const setData: any = { ...parsed, updatedAt: new Date() };
  if (parsed.deliveryDate !== undefined) setData.deliveryDate = parsed.deliveryDate ? new Date(parsed.deliveryDate) : null;
  if (parsed.assemblyDate !== undefined) setData.assemblyDate = parsed.assemblyDate ? new Date(parsed.assemblyDate) : null;
  if (parsed.testingDate !== undefined) setData.testingDate = parsed.testingDate ? new Date(parsed.testingDate) : null;
  setData.lastModifiedByUserId = getSalesmanId(req);
  if (createVersion) {
    setData.confirmationStatus = "pending";
    setData.confirmedByUserId = null;
    setData.confirmedAt = null;
  }

  if (parsed.logistics) {
    const existingLogistics = (existing.logistics as Record<string, any>) ?? {};
    const mergedLogistics = { ...existingLogistics, ...parsed.logistics };

    if (mergedLogistics.timeline && Array.isArray(mergedLogistics.timeline)) {
      const tl = mergedLogistics.timeline as any[];
      const findEvent = (type: string) => tl.find((e: any) => e.type === type);
      const deliveryEvt = findEvent("contractual_delivery");
      const testingEvt = findEvent("contractual_testing");
      const mechEvt = findEvent("mechanical_assembly");
      if (deliveryEvt) {
        mergedLogistics.contractualDeliveryDate = deliveryEvt.actualDate || deliveryEvt.plannedDate || "";
      }
      if (testingEvt) {
        mergedLogistics.contractualTestingEndDate = testingEvt.actualDate || testingEvt.plannedDate || "";
      }
      if (mechEvt) {
        mergedLogistics.contractualAssemblyStartDate = mechEvt.actualDate || mechEvt.plannedDate || "";
      }
    }
    setData.logistics = mergedLogistics;
  }

  if (createVersion) {
    const newVersion = existing.currentVersion + 1;
    setData.currentVersion = newVersion;

    const performedBy = await getPerformedBy(req);
    await db.transaction(async (tx) => {
      const mergedState = { ...existing, ...setData };
      const fieldChanges = computeChangeSummary(existing, mergedState);
      const pendingAudit: AuditLogEntry[] = (existing.auditLog as AuditLogEntry[] | null) ?? [];
      const auditActions = pendingAudit.map(e => e.action);
      const changeSummary = [...fieldChanges, ...auditActions];
      await tx.insert(jobOrderVersions).values({
        jobOrderId: id,
        versionNumber: existing.currentVersion,
        snapshot: buildOrderSnapshot(existing),
        modifiedByUserId: getSalesmanId(req),
        modifiedByName: performedBy,
        changeNotes: changeNotes || `Versione ${displayVersion(existing.currentVersion)}`,
        changeSummary: changeSummary.length > 0 ? changeSummary : null,
      });
      setData.auditLog = [];
      const [result] = await tx.update(jobOrders)
        .set(setData)
        .where(eq(jobOrders.id, id))
        .returning();
      if (!result) throw AppError.notFound("Job order not found");
      return result;
    });
  } else {
    const [result] = await db.update(jobOrders)
      .set(setData)
      .where(eq(jobOrders.id, id))
      .returning();
    if (!result) throw AppError.notFound("Job order not found");
  }

  const [updated] = await db.select().from(jobOrders).where(eq(jobOrders.id, id));
  res.json(updated);
}));

router.patch("/api/orders/:id/toggle-payment", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  const userRole = isMaster(req) ? "master" as UserRole : (getUserRole(req) || "salesman" as UserRole);
  if (!canEditSection("payments", userRole)) {
    throw AppError.forbidden("Non hai i permessi per modificare i pagamenti");
  }
  const { index, paid } = req.body as { index: number; paid: boolean };
  if (typeof index !== "number" || typeof paid !== "boolean") throw AppError.badRequest("index and paid required");

  const [order] = await db.select().from(jobOrders).where(eq(jobOrders.id, id));
  if (!order) throw AppError.notFound("Order");
  if (req.companyId && order.companyId !== req.companyId) throw AppError.notFound("Order");

  const terms: any[] = (order.paymentTerms as any[]) ?? [];
  if (index < 0 || index >= terms.length) throw AppError.badRequest("Invalid payment index");

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // Full ISO timestamp so the Recap can show the real time the payment
  // was registered (not midnight UTC, which would render as 02:00 in
  // Italian time during CEST).
  const nowIso = now.toISOString();
  terms[index] = { ...terms[index], paid, paidDate: paid ? today : "" };

  const logistics: any = (order.logistics as any) ?? {};
  const timeline: any[] = logistics.timeline ?? [];
  const payEvtId = `evt-payment-${index}`;

  if (paid) {
    const exists = timeline.find((e: any) => e.id === payEvtId);
    if (!exists) {
      timeline.push({
        id: payEvtId,
        type: "payment_received",
        label: `Pagamento: ${terms[index].condition}`,
        notes: "",
        status: "completed",
        actualDate: nowIso,
        plannedDate: nowIso,
        autoCalculated: false,
      });
    } else {
      Object.assign(exists, { status: "completed", actualDate: nowIso });
    }
  } else {
    const idx = timeline.findIndex((e: any) => e.id === payEvtId);
    if (idx >= 0) timeline.splice(idx, 1);
  }

  logistics.timeline = timeline;

  const payPerformedBy = await getPerformedBy(req);
  const [updated] = await db.transaction(async (tx) => {
    const [result] = await tx.update(jobOrders)
      .set({ paymentTerms: terms, logistics, updatedAt: new Date(), lastModifiedByUserId: getSalesmanId(req) })
      .where(eq(jobOrders.id, id))
      .returning();
    await appendAuditLog(id, paid ? `Pagamento segnato come pagato: ${terms[index].condition || `#${index + 1}`}` : `Pagamento segnato come non pagato: ${terms[index].condition || `#${index + 1}`}`, payPerformedBy, tx);
    return [result];
  });
  res.json(updated);
}));

router.patch("/api/orders/:id/production-progress", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  const role = isMaster(req) ? "master" as UserRole : (getUserRole(req) as UserRole);
  if (!canEditSection("production", role)) {
    throw AppError.forbidden("Only produzione and master roles can update production progress");
  }

  const progressSchema = z.object({
    positionIndex: z.number(),
    progressPercent: z.number().min(0).max(100),
    notes: z.string().optional(),
  });
  const parsed = progressSchema.parse(req.body);

  const conditions = [eq(jobOrders.id, id)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));
  const [order] = await db.select().from(jobOrders).where(and(...conditions));
  if (!order) throw AppError.notFound("Order not found");

  const items: any[] = (order.orderItems as any[]) ?? [];
  const matchedItem = items.find((it: any) => it.position === parsed.positionIndex);
  const machineName = matchedItem?.description ?? `Posizione ${parsed.positionIndex}`;

  const salesmanId = getSalesmanId(req);
  const performedBy = await getPerformedBy(req);

  const existing: ProductionProgressEntry[] = (order.productionProgress as ProductionProgressEntry[]) ?? [];
  const idx = existing.findIndex(e => e.positionIndex === parsed.positionIndex);
  const entry: ProductionProgressEntry = {
    positionIndex: parsed.positionIndex,
    machineName,
    progressPercent: parsed.progressPercent,
    notes: parsed.notes ?? (idx >= 0 ? existing[idx].notes : ""),
    lastUpdatedBy: salesmanId,
    lastUpdatedByName: performedBy,
    lastUpdatedAt: new Date().toISOString(),
  };

  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }

  const [updated] = await db.transaction(async (tx) => {
    const [result] = await tx.update(jobOrders)
      .set({ productionProgress: existing, updatedAt: new Date() })
      .where(eq(jobOrders.id, id))
      .returning();
    await appendAuditLog(id, `Progresso produzione aggiornato: ${machineName} → ${parsed.progressPercent}%`, performedBy, tx);
    return [result];
  });
  res.json(updated);
}));

router.patch("/api/orders/:id/confirm", requireMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [order] = await db.select().from(jobOrders).where(eq(jobOrders.id, id));
  if (!order) throw AppError.notFound("Order");

  const confirmPerformedBy = await getPerformedBy(req);
  const [updated] = await db.transaction(async (tx) => {
    const [result] = await tx.update(jobOrders)
      .set({
        confirmationStatus: "confirmed",
        confirmationComment: null,
        confirmedByUserId: getSalesmanId(req),
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobOrders.id, id))
      .returning();
    await appendAuditLog(id, `Ordine confermato (v${displayVersion(result.currentVersion)})`, confirmPerformedBy, tx);
    return [result];
  });
  res.json(updated);
}));

router.patch("/api/orders/:id/request-revision", requireMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { comment } = req.body as { comment?: string };
  const [order] = await db.select().from(jobOrders).where(eq(jobOrders.id, id));
  if (!order) throw AppError.notFound("Order");

  const revisionPerformedBy = await getPerformedBy(req);
  const [updated] = await db.transaction(async (tx) => {
    const [result] = await tx.update(jobOrders)
      .set({
        confirmationStatus: "revision_requested",
        confirmationComment: comment || null,
        confirmedByUserId: getSalesmanId(req),
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobOrders.id, id))
      .returning();
    await appendAuditLog(id, `Revisione richiesta${comment ? ': ' + comment : ''}`, revisionPerformedBy, tx);
    return [result];
  });
  res.json(updated);
}));

router.patch("/api/orders/:id/reject", requireMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { comment } = req.body as { comment?: string };
  const [order] = await db.select().from(jobOrders).where(eq(jobOrders.id, id));
  if (!order) throw AppError.notFound("Order");

  const rejectPerformedBy = await getPerformedBy(req);
  const [updated] = await db.transaction(async (tx) => {
    const [result] = await tx.update(jobOrders)
      .set({
        confirmationStatus: "rejected",
        confirmationComment: comment || null,
        confirmedByUserId: getSalesmanId(req),
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobOrders.id, id))
      .returning();
    await appendAuditLog(id, `Ordine rifiutato${comment ? ': ' + comment : ''}`, rejectPerformedBy, tx);
    return [result];
  });
  res.json(updated);
}));

router.get("/api/orders/:id/available-options", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  const [order] = await db.select({ offerId: jobOrders.offerId, companyId: jobOrders.companyId })
    .from(jobOrders).where(eq(jobOrders.id, id));
  if (!order) throw AppError.notFound("Order");
  if (req.companyId && order.companyId !== req.companyId) throw AppError.notFound("Order");

  if (!order.offerId) return res.json([]);

  const items = await db.select({
    position: offerItems.position,
    machineId: offerItems.machineId,
    machineName: offerItems.snapshotMachineName,
  }).from(offerItems).where(eq(offerItems.offerId, order.offerId)).orderBy(offerItems.position);

  const result: { position: number; machineName: string; options: { name: string; price: number }[] }[] = [];
  for (const item of items) {
    const opts = await db.select({
      name: machineOptions.name,
      price: machineOptions.priceModifier,
    }).from(machineOptions).where(eq(machineOptions.machineId, item.machineId));
    result.push({
      position: item.position,
      machineName: item.machineName,
      options: opts.map(o => ({ name: o.name, price: Number(o.price) || 0 })),
    });
  }
  res.json(result);
}));

router.get("/api/orders/:id/versions", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  const conditions = [eq(jobOrders.id, id)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));
  const [order] = await db.select({ id: jobOrders.id }).from(jobOrders).where(and(...conditions));
  if (!order) throw AppError.notFound("Job order not found");

  const versions = await db.select()
    .from(jobOrderVersions)
    .where(eq(jobOrderVersions.jobOrderId, id))
    .orderBy(desc(jobOrderVersions.versionNumber));

  const result = versions.map((v, idx) => ({
    ...v,
    isCurrent: idx === 0,
  }));
  res.json(result);
}));

router.get("/api/orders/:id/pdf", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  const conditions = [eq(jobOrders.id, id)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));
  const [row] = await db.select({
    order: jobOrders,
    customerName: customers.name,
  }).from(jobOrders)
    .leftJoin(customers, eq(jobOrders.customerId, customers.id))
    .where(and(...conditions));
  if (!row) throw AppError.notFound("Job order not found");
  const order = { ...row.order, customerName: row.customerName ?? "" };

  const versions = await db.select()
    .from(jobOrderVersions)
    .where(eq(jobOrderVersions.jobOrderId, id))
    .orderBy(desc(jobOrderVersions.versionNumber));

  const versionRows = versions.map((v, idx) => ({
    ...v,
    isCurrent: idx === 0,
  }));

  const hiddenSections = typeof req.query.hidden === "string" && req.query.hidden
    ? req.query.hidden.split(",").filter(Boolean)
    : [];
  const mergeLayout = req.query.mergeLayout === "0" ? false : true;
  const mergeDocuments = req.query.mergeDocuments === "1";

  const pdfBuffer = await generateOrderPdf(order, versionRows, { hiddenSections, mergeLayout, mergeDocuments });
  const filename = `${order.jobNumber.replace(/\s+/g, "_")}_Ordine_Interno.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(pdfBuffer);
}));

router.post("/api/orders/:id/layout", requireSalesmanOrMaster, uploadLayout.single("file"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  if (!req.file) throw AppError.badRequest("PDF file required");

  const [existing] = await db.select().from(jobOrders).where(eq(jobOrders.id, id));
  if (!existing) throw AppError.notFound("Job order not found");
  const isReplacement = !!existing.layoutPdfFilename;

  const layoutPerformedBy = await getPerformedBy(req);
  const layoutSalesmanId = getSalesmanId(req);
  const [updated] = await db.transaction(async (tx) => {
    const [result] = await tx.update(jobOrders).set({
      layoutPdfFilename: req.file!.filename,
      layoutPdfOriginalName: req.file!.originalname,
      updatedAt: new Date(),
    }).where(eq(jobOrders.id, id)).returning();
    if (!result) throw AppError.notFound("Job order not found");
    await appendAuditLog(
      id,
      `Layout PDF ${isReplacement ? "sostituito" : "caricato"}: ${req.file!.originalname}`,
      layoutPerformedBy,
      tx,
    );
    // Recap event emission (Task #109): track layout add vs change for the
    // weekly recap. Stored in the `interactions` table so the existing
    // owner/area filters apply transparently. Failure here aborts the whole
    // upload transaction — losing the recap event is not acceptable and
    // would silently violate the feature guarantee. We only skip the
    // emission for orphan orders (no customer); the recap loader itself
    // ignores customerless rows, so emitting one would never surface.
    if (existing.customerId != null) {
      await tx.insert(interactions).values({
        companyId: req.companyId,
        customerId: existing.customerId,
        salesmanUserId: layoutSalesmanId ?? undefined,
        date: new Date(),
        direction: "outbound",
        type: isReplacement ? "order_layout_changed" : "order_layout_added",
        notes: `Layout ${isReplacement ? "sostituito" : "caricato"}: ${req.file!.originalname}`,
        autoGenerated: true,
        linkedJobOrderId: id,
      });
    }
    return [result];
  });
  res.json(updated);
}));

router.post("/api/orders/:id/order-confirmation", requireSalesmanOrMaster, uploadConfirmation.single("file"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  if (!req.file) throw AppError.badRequest("PDF file required");

  const confPerformedBy = await getPerformedBy(req);
  const [updated] = await db.transaction(async (tx) => {
    const [result] = await tx.update(jobOrders).set({
      orderConfirmationFilename: req.file!.filename,
      orderConfirmationOriginalName: req.file!.originalname,
      updatedAt: new Date(),
    }).where(eq(jobOrders.id, id)).returning();
    if (!result) throw AppError.notFound("Job order not found");
    await appendAuditLog(id, `Conferma d'ordine caricata: ${req.file!.originalname}`, confPerformedBy, tx);
    return [result];
  });
  res.json(updated);
}));

router.post("/api/orders/:id/documents", requireSalesmanOrMaster, uploadDocument.single("file"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  if (!req.file) throw AppError.badRequest("File required");

  const [existingOrder] = await db.select().from(jobOrders).where(eq(jobOrders.id, id));
  if (!existingOrder) throw AppError.notFound("Job order not found");

  const docUploadPerformedBy = await getPerformedBy(req);
  const docSalesmanId = getSalesmanId(req);
  const doc = await db.transaction(async (tx) => {
    const [docResult] = await tx.insert(jobOrderDocuments).values({
      jobOrderId: id,
      filename: req.file!.filename,
      originalName: req.file!.originalname,
      mimeType: req.file!.mimetype,
      description: (req.body.description as string) || undefined,
    }).returning();
    await appendAuditLog(id, `Documento caricato: ${req.file!.originalname}`, docUploadPerformedBy, tx);
    // Recap event emission (Task #109): one event per uploaded document.
    // Failure here aborts the upload transaction — losing the recap event
    // is not acceptable and would silently violate the feature guarantee.
    // We only skip emission for orphan orders (no customer); the recap
    // loader itself ignores customerless rows, so emitting one would
    // never surface in the recap UI.
    if (existingOrder.customerId != null) {
      await tx.insert(interactions).values({
        companyId: req.companyId,
        customerId: existingOrder.customerId,
        salesmanUserId: docSalesmanId ?? undefined,
        date: new Date(),
        direction: "outbound",
        type: "order_document_added",
        notes: `Documento caricato: ${req.file!.originalname}`,
        autoGenerated: true,
        linkedJobOrderId: id,
      });
    }
    return docResult;
  });
  res.status(201).json(doc);
}));

router.delete("/api/orders/:orderId/documents/:docId", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const orderId = Number(req.params.orderId);
  await enforceBackofficeOrderAccess(req, orderId);
  const docId = Number(req.params.docId);
  const [doc] = await db.select().from(jobOrderDocuments).where(and(eq(jobOrderDocuments.id, docId), eq(jobOrderDocuments.jobOrderId, orderId)));
  if (!doc) throw AppError.notFound("Document not found");

  const filepath = path.join(ORDERS_ASSETS, doc.filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  const docDelPerformedBy = await getPerformedBy(req);
  await db.transaction(async (tx) => {
    await tx.delete(jobOrderDocuments).where(eq(jobOrderDocuments.id, docId));
    await appendAuditLog(orderId, `Documento eliminato: ${doc.originalName}`, docDelPerformedBy, tx);
  });
  res.json({ success: true });
}));

router.get("/api/orders-bin", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const conditions: any[] = [isNotNull(jobOrders.deletedAt)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));
  const backofficeParentBin = getBackofficeParentIds(req);
  if (backofficeParentBin.length > 0) conditions.push(inArray(jobOrders.responsibleUserId, backofficeParentBin));

  const rows = await db
    .select({
      jobOrder: jobOrders,
      customerName: customers.name,
      offerRef: offers.referenceNumber,
      offerSubject: offers.subject,
    })
    .from(jobOrders)
    .leftJoin(customers, eq(jobOrders.customerId, customers.id))
    .leftJoin(offers, eq(jobOrders.offerId, offers.id))
    .where(and(...conditions))
    .orderBy(desc(jobOrders.deletedAt));

  res.json(rows.map(r => ({
    ...r.jobOrder,
    customerName: r.customerName,
    offerRef: r.offerRef,
    offerSubject: r.offerSubject,
  })));
}));

router.delete("/api/orders/:id", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  const conditions = [eq(jobOrders.id, id), isNull(jobOrders.deletedAt)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));

  const [order] = await db.select({ id: jobOrders.id }).from(jobOrders).where(and(...conditions));
  if (!order) throw AppError.notFound("Job order not found");

  await db.update(jobOrders).set({ deletedAt: new Date() }).where(eq(jobOrders.id, id));
  res.json({ success: true });
}));

router.patch("/api/orders/:id/restore", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  await enforceBackofficeOrderAccess(req, Number(req.params.id));
  const id = Number(req.params.id);
  const conditions = [eq(jobOrders.id, id), isNotNull(jobOrders.deletedAt)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));

  const [order] = await db.select({ id: jobOrders.id }).from(jobOrders).where(and(...conditions));
  if (!order) throw AppError.notFound("Job order not found");

  await db.update(jobOrders).set({ deletedAt: null }).where(eq(jobOrders.id, id));
  res.json({ success: true });
}));

router.post("/api/orders/:id/change-offer", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  const schema = z.object({
    newOfferId: z.number(),
    reason: z.string().optional(),
  });
  const { newOfferId, reason } = schema.parse(req.body);

  const conditions = [eq(jobOrders.id, id), isNull(jobOrders.deletedAt)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));
  const [existing] = await db.select().from(jobOrders).where(and(...conditions));
  if (!existing) throw AppError.notFound("Job order not found");

  if (newOfferId === existing.offerId) throw AppError.badRequest("L'ordine è già collegato a questa offerta");

  const offerConds = [eq(offers.id, newOfferId), isNull(offers.deletedAt)];
  if (req.companyId) offerConds.push(eq(offers.companyId, req.companyId));
  const [newOffer] = await db.select({ id: offers.id, ref: offers.referenceNumber, customerId: offers.customerId }).from(offers).where(and(...offerConds));
  if (!newOffer) throw AppError.notFound("New offer not found");
  if (newOffer.customerId !== existing.customerId) throw AppError.badRequest("La nuova offerta deve appartenere allo stesso cliente dell'ordine");

  const [oldOffer] = await db.select({ ref: offers.referenceNumber }).from(offers).where(eq(offers.id, existing.offerId));
  const performedBy = await getPerformedBy(req);

  const historyEntry: OfferHistoryEntry = {
    offerId: existing.offerId,
    offerRef: oldOffer?.ref ?? `#${existing.offerId}`,
    replacedAt: new Date().toISOString(),
    replacedByUserId: getSalesmanId(req) ?? undefined,
    replacedByName: performedBy,
    reason: reason || undefined,
  };

  const currentHistory: OfferHistoryEntry[] = (existing.offerHistory as OfferHistoryEntry[] | null) ?? [];

  const newData = await buildPrePopulatedOrder(newOfferId, existing.customerId, req.companyId ?? undefined);

  const newVersion = existing.currentVersion + 1;
  await db.transaction(async (tx) => {
    const pendingAudit: AuditLogEntry[] = (existing.auditLog as AuditLogEntry[] | null) ?? [];
    const auditActions = pendingAudit.map(e => e.action);
    const offerChanges = [`Offerta sostituita: ${oldOffer?.ref ?? '#' + existing.offerId} → ${newOffer.ref}`, ...(reason ? [`Motivo: ${reason}`] : []), ...auditActions];
    await tx.insert(jobOrderVersions).values({
      jobOrderId: id,
      versionNumber: existing.currentVersion,
      snapshot: buildOrderSnapshot(existing),
      modifiedByUserId: getSalesmanId(req),
      modifiedByName: performedBy,
      changeNotes: `Cambio offerta: ${oldOffer?.ref ?? '#' + existing.offerId} → ${newOffer.ref}${reason ? ' — ' + reason : ''}`,
      changeSummary: offerChanges.length > 0 ? offerChanges : null,
    });

    await tx.update(jobOrders).set({
      offerId: newOfferId,
      orderItems: newData.orderItems,
      additionalItems: newData.additionalItems,
      priceSummary: newData.priceSummary,
      shippingTerms: newData.shippingTerms,
      lineTechnicalData: newData.lineTechnicalData,
      technicalSheets: newData.technicalSheets,
      offerHistory: [...currentHistory, historyEntry],
      currentVersion: newVersion,
      lastModifiedByUserId: getSalesmanId(req),
      updatedAt: new Date(),
      auditLog: [],
    }).where(eq(jobOrders.id, id));
  });

  const [updated] = await db.select().from(jobOrders).where(eq(jobOrders.id, id));
  res.json(updated);
}));

router.delete("/api/orders/:id/permanent", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  const conditions = [eq(jobOrders.id, id), isNotNull(jobOrders.deletedAt)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));

  const [order] = await db.select().from(jobOrders).where(and(...conditions));
  if (!order) throw AppError.notFound("Job order not found");

  if (order.layoutPdfFilename) {
    const layoutPath = path.join(LAYOUT_ASSETS, order.layoutPdfFilename);
    if (fs.existsSync(layoutPath)) fs.unlinkSync(layoutPath);
  }

  const docs = await db.select().from(jobOrderDocuments).where(eq(jobOrderDocuments.jobOrderId, id));
  for (const doc of docs) {
    const docPath = path.join(ORDERS_ASSETS, doc.filename);
    if (fs.existsSync(docPath)) fs.unlinkSync(docPath);
  }

  await db.delete(jobOrderVersions).where(eq(jobOrderVersions.jobOrderId, id));
  await db.delete(jobOrderDocuments).where(eq(jobOrderDocuments.jobOrderId, id));
  await db.delete(jobOrders).where(eq(jobOrders.id, id));
  res.json({ success: true });
}));

router.post("/api/orders/:id/certificates", requireSalesmanOrMaster, uploadCert.single("file"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  const conditions = [eq(jobOrders.id, id)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));
  const [existing] = await db.select().from(jobOrders).where(and(...conditions));
  if (!existing) throw AppError.notFound("Job order not found");
  if (!req.file) throw AppError.badRequest("No file uploaded");

  const certUpPerformedBy = await getPerformedBy(req);
  await appendAuditLog(id, `Certificato caricato: ${req.file.originalname}`, certUpPerformedBy);
  res.json({
    id: `cert-${Date.now()}`,
    filename: req.file.filename,
    originalName: req.file.originalname,
  });
}));

router.delete("/api/orders/:id/certificates/:filename", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  const conditions = [eq(jobOrders.id, id)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));
  const [existing] = await db.select().from(jobOrders).where(and(...conditions));
  if (!existing) throw AppError.notFound("Job order not found");

  const safeFilename = path.basename(String(req.params.filename));
  if (!safeFilename || safeFilename.startsWith(".")) throw AppError.badRequest("Invalid filename");
  const filePath = path.join(CERT_ASSETS, safeFilename);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(CERT_ASSETS))) throw AppError.badRequest("Invalid filename");
  if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
  const certDelPerformedBy = await getPerformedBy(req);
  await appendAuditLog(id, `Certificato eliminato: ${safeFilename}`, certDelPerformedBy);
  res.json({ success: true });
}));

router.post("/api/orders/:id/ddt", requireSalesmanOrMaster, uploadCert.single("file"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  const conditions = [eq(jobOrders.id, id)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));
  const [existing] = await db.select().from(jobOrders).where(and(...conditions));
  if (!existing) throw AppError.notFound("Job order not found");
  if (!req.file) throw AppError.badRequest("No file uploaded");

  const ddtPerformedBy = await getPerformedBy(req);
  await appendAuditLog(id, `DDT caricato: ${req.file.originalname}`, ddtPerformedBy);
  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
  });
}));

router.post("/api/orders/:id/cmr", requireSalesmanOrMaster, uploadCert.single("file"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeOrderAccess(req, id);
  const conditions = [eq(jobOrders.id, id)];
  if (req.companyId) conditions.push(eq(jobOrders.companyId, req.companyId));
  const [existing] = await db.select().from(jobOrders).where(and(...conditions));
  if (!existing) throw AppError.notFound("Job order not found");
  if (!req.file) throw AppError.badRequest("No file uploaded");

  const cmrPerformedBy = await getPerformedBy(req);
  await appendAuditLog(id, `CMR caricato: ${req.file.originalname}`, cmrPerformedBy);
  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
  });
}));

router.get("/api/orders/:id/previews", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) throw AppError.badRequest("Invalid order ID");
  await enforceBackofficeOrderAccess(req, orderId);

  const files = fs.readdirSync(PREVIEW_ASSETS)
    .filter(f => f.startsWith(`order-${orderId}-page-`) && f.endsWith(".jpg"))
    .sort((a, b) => {
      const na = parseInt(a.match(/page-(\d+)/)?.[1] ?? "0");
      const nb = parseInt(b.match(/page-(\d+)/)?.[1] ?? "0");
      return na - nb;
    });

  res.json({ pages: files.map(f => `/order-previews/${f}`) });
}));

router.use("/order-layouts", express.static(LAYOUT_ASSETS));
router.use("/order-documents", express.static(ORDERS_ASSETS));
router.use("/order-certificates", express.static(CERT_ASSETS));
router.use("/order-previews", express.static(PREVIEW_ASSETS));
router.use("/order-confirmations", express.static(CONFIRMATION_ASSETS));

export default router;
