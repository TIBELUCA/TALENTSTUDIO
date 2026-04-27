import type { OfferWithDetails, OfferDocument, OfferCrmInfo, OfferCrmCompetitor } from "@shared/schema";
import { stripAllImagePlaceholders } from "../../shared/lib/imagePlaceholders";

function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : Number(n ?? 0);
  if (!isFinite(v)) return "—";
  return v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function num(v: any): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v ?? 0);
  return isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function str(v: any): string {
  if (v == null) return "";
  return String(v);
}

function bool(v: any): boolean {
  return !!v;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!deepEqual((a as any)[k], (b as any)[k])) return false;
  }
  return true;
}

const TECH_SPEC_LABELS: Record<string, string> = {
  minMaxLength: "Lunghezza min/max",
  maxWidth: "Larghezza max",
  minMaxThickness: "Spessore min/max",
  averageLineSpeed: "Velocità media linea",
  controlSide: "Lato controllo",
  maxBow: "Bombatura max",
  paint: "Vernice",
  substrate: "Substrato",
  finishing: "Finitura",
  standardVoltage: "Tensione standard",
  standardColors: "Colori standard",
  components: "Componenti",
  precautions: "Precauzioni",
  airIntake: "Presa d'aria",
  commissioning: "Messa in servizio",
};

const SERVICE_LABELS: Record<string, string> = {
  travelCosts: "Spese di viaggio incluse",
  travelCostsDailyFee: "Tariffa giornaliera viaggio",
  travelCostsDays: "Giorni di viaggio",
  travelFlightTicket: "Biglietto aereo",
  boardLodging: "Vitto/alloggio incluso",
  boardLodgingDailyFee: "Tariffa giornaliera vitto/alloggio",
  trainingDays: "Giorni di formazione",
  trainingIncluded: "Formazione inclusa",
  packaging: "Imballaggio incluso",
  transportPrice: "Prezzo trasporto",
  transportIncluded: "Trasporto incluso",
};

const INSTALL_LABELS: Record<string, string> = {
  dailyFee: "Tariffa giornaliera installazione",
  travelDays: "Giorni viaggio installazione",
  mechanicalDays: "Giorni montaggio meccanico",
  electricalDays: "Giorni montaggio elettrico",
  testingDays: "Giorni collaudo",
  installTrainingDays: "Giorni formazione installazione",
  totalDays: "Giorni totali installazione",
  totalPrice: "Prezzo totale installazione",
  included: "Installazione inclusa",
  hideDailyFee: "Nascondi tariffa giornaliera",
  hideTotalDays: "Nascondi giorni totali",
  hideTotalPrice: "Nascondi prezzo totale",
  hideBreakdownTravel: "Nascondi voce viaggio",
  hideBreakdownMechanical: "Nascondi voce meccanica",
  hideBreakdownElectrical: "Nascondi voce elettrica",
  hideBreakdownTesting: "Nascondi voce collaudo",
  hideBreakdownTraining: "Nascondi voce formazione",
};

const PRICE_LABEL_NAMES: Record<string, string> = {
  interlocking: "Etichetta Interlocking",
  totalListPrice: "Etichetta Totale listino",
  installation: "Etichetta Installazione",
  travelCosts: "Etichetta Spese viaggio",
  boardLodging: "Etichetta Vitto/alloggio",
  training: "Etichetta Formazione",
  packaging: "Etichetta Imballaggio",
  transport: "Etichetta Trasporto",
  grossTotal: "Etichetta Totale lordo",
  netTotal: "Etichetta Totale netto",
};

const PRICE_COMMENT_NAMES: Record<string, string> = {
  interlocking: "Commento Interlocking",
  installation: "Commento Installazione",
  travel: "Commento Viaggio",
  boardLodging: "Commento Vitto/alloggio",
  training: "Commento Formazione",
  packaging: "Commento Imballaggio",
  transport: "Commento Trasporto",
};

const HEADER_CUST_LABELS: Record<string, string> = {
  name: "Nome cliente (intestazione)",
  contactPerson: "Referente cliente",
  email: "Email cliente (intestazione)",
  address: "Indirizzo cliente (intestazione)",
  phone: "Telefono cliente (intestazione)",
  vatNumber: "Partita IVA (intestazione)",
};

const HEADER_SALES_LABELS: Record<string, string> = {
  name: "Nome venditore (intestazione)",
  email: "Email venditore (intestazione)",
  mobile: "Cellulare venditore (intestazione)",
};

function formatScalar(v: any): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "sì" : "no";
  if (typeof v === "number") return String(v);
  return String(v);
}

function compareScalarMap(
  prev: Record<string, any> | undefined | null,
  curr: Record<string, any> | undefined | null,
  labels: Record<string, string>,
  out: string[],
  prefix: string = "",
) {
  const p = prev ?? {};
  const c = curr ?? {};
  const keys = new Set([...Object.keys(labels), ...Object.keys(p), ...Object.keys(c)]);
  for (const k of keys) {
    const label = labels[k];
    if (!label) continue;
    const pv = p[k];
    const cv = c[k];
    if (typeof pv === "boolean" || typeof cv === "boolean") {
      if (bool(pv) !== bool(cv)) {
        out.push(`${prefix}${label}: ${formatScalar(pv)} → ${formatScalar(cv)}`);
      }
      continue;
    }
    if (typeof pv === "number" || typeof cv === "number") {
      if (round2(num(pv)) !== round2(num(cv))) {
        out.push(`${prefix}${label}: ${formatScalar(pv)} → ${formatScalar(cv)}`);
      }
      continue;
    }
    if (str(pv) !== str(cv)) {
      out.push(`${prefix}${label}: ${formatScalar(pv)} → ${formatScalar(cv)}`);
    }
  }
}

function arraysAsSet<T>(arr: T[] | null | undefined): Set<string> {
  return new Set((arr ?? []).map(v => String(v)));
}

function compareIdLists(
  prev: any[] | null | undefined,
  curr: any[] | null | undefined,
  label: string,
  out: string[],
) {
  const ps = arraysAsSet(prev);
  const cs = arraysAsSet(curr);
  const added: string[] = [];
  const removed: string[] = [];
  cs.forEach(v => { if (!ps.has(v)) added.push(v); });
  ps.forEach(v => { if (!cs.has(v)) removed.push(v); });
  if (added.length || removed.length) {
    const parts: string[] = [];
    if (added.length) parts.push(`+ ${added.join(", ")}`);
    if (removed.length) parts.push(`− ${removed.join(", ")}`);
    out.push(`${label}: ${parts.join("; ")}`);
  } else if ((prev ?? []).length === (curr ?? []).length) {
    // Same content, check order
    const prevArr = (prev ?? []).map(String);
    const currArr = (curr ?? []).map(String);
    if (prevArr.join("|") !== currArr.join("|")) {
      out.push(`${label}: ordine modificato`);
    }
  }
}

function compareKeyedOverrides(
  prev: Record<string, any> | null | undefined,
  curr: Record<string, any> | null | undefined,
  label: string,
  out: string[],
) {
  const p = prev ?? {};
  const c = curr ?? {};
  const keys = new Set([...Object.keys(p), ...Object.keys(c)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (!deepEqual(p[k], c[k])) changed.push(k);
  }
  if (changed.length > 0) {
    if (changed.length <= 3) {
      out.push(`${label} modificat${changed.length === 1 ? "o" : "i"} (${changed.join(", ")})`);
    } else {
      out.push(`${label} modificati (${changed.length} voci)`);
    }
  }
}

function fmtCrmCompetitors(list: OfferCrmCompetitor[] | undefined | null): string {
  if (!list || list.length === 0) return "—";
  return list.map(c => c.name + (c.notes ? ` (${c.notes})` : "")).join(", ");
}

function compareCrmInfo(prev: OfferCrmInfo | null | undefined, curr: OfferCrmInfo | null | undefined, out: string[]) {
  const p = prev ?? {};
  const c = curr ?? {};
  if (str(p.expectedCloseDate) !== str(c.expectedCloseDate)) {
    out.push(`CRM — Data prevista chiusura: ${p.expectedCloseDate || "—"} → ${c.expectedCloseDate || "—"}`);
  }
  if (num(p.winProbability ?? null) !== num(c.winProbability ?? null) || (p.winProbability == null) !== (c.winProbability == null)) {
    const pv = p.winProbability == null ? "—" : `${p.winProbability}%`;
    const cv = c.winProbability == null ? "—" : `${c.winProbability}%`;
    out.push(`CRM — Probabilità: ${pv} → ${cv}`);
  }
  if (num(p.budget ?? null) !== num(c.budget ?? null) || (p.budget == null) !== (c.budget == null)) {
    const pv = p.budget == null ? "—" : `€ ${fmtMoney(p.budget)}`;
    const cv = c.budget == null ? "—" : `€ ${fmtMoney(c.budget)}`;
    out.push(`CRM — Budget: ${pv} → ${cv}`);
  }
  if (str(p.decisionMaker) !== str(c.decisionMaker)) {
    out.push(`CRM — Decision maker: ${p.decisionMaker || "—"} → ${c.decisionMaker || "—"}`);
  }
  if (!deepEqual(p.competitors ?? [], c.competitors ?? [])) {
    out.push(`CRM — Competitor: ${fmtCrmCompetitors(p.competitors)} → ${fmtCrmCompetitors(c.competitors)}`);
  }
  if (str(p.nextSteps) !== str(c.nextSteps)) {
    out.push(`CRM — Prossimi passi modificati`);
  }
  if (str(p.notes) !== str(c.notes)) {
    out.push(`CRM — Note interne modificate`);
  }
}

function summarizeDocs(docs: OfferDocument[] | null | undefined): Map<string, OfferDocument> {
  const m = new Map<string, OfferDocument>();
  (docs ?? []).forEach(d => {
    m.set(d.originalName, d);
  });
  return m;
}

export function computeOfferChangeSummary(
  prev: OfferWithDetails | null | undefined,
  curr: OfferWithDetails,
  prevDocs?: OfferDocument[] | null,
  currDocs?: OfferDocument[] | null,
): string[] {
  const out: string[] = [];
  if (!prev) return out;

  // ─── Top-level offer fields ──────────────────────────────────────────
  if (str(prev.subject) !== str(curr.subject)) {
    out.push(`Titolo modificato: "${prev.subject ?? ""}" → "${curr.subject ?? ""}"`);
  }
  if (str(prev.status) !== str(curr.status)) {
    out.push(`Stato: ${prev.status} → ${curr.status}`);
  }
  if (prev.customerId !== curr.customerId) {
    const prevName = (prev as any).customer?.name ?? `#${prev.customerId}`;
    const currName = (curr as any).customer?.name ?? `#${curr.customerId}`;
    out.push(`Cliente: ${prevName} → ${currName}`);
  }
  if (str(prev.salesmanName) !== str(curr.salesmanName)) {
    out.push(`Venditore: ${prev.salesmanName ?? "—"} → ${curr.salesmanName ?? "—"}`);
  }
  if (str(prev.language ?? "it") !== str(curr.language ?? "it")) {
    out.push(`Lingua: ${prev.language ?? "it"} → ${curr.language ?? "it"}`);
  }
  if (str((prev as any).dealerId) !== str((curr as any).dealerId)) {
    out.push(`Dealer assegnato modificato`);
  }

  // ─── Total ───────────────────────────────────────────────────────────
  const prevTotal = round2(num(prev.totalPrice));
  const currTotal = round2(num(curr.totalPrice));
  if (prevTotal !== currTotal) {
    const diff = currTotal - prevTotal;
    const sign = diff >= 0 ? "+" : "−";
    out.push(`Totale: € ${fmtMoney(prevTotal)} → € ${fmtMoney(currTotal)} (${sign}€ ${fmtMoney(Math.abs(diff))})`);
  }

  // ─── Items (machines + options) by position ──────────────────────────
  const prevItems = (prev.items ?? []) as any[];
  const currItems = (curr.items ?? []) as any[];
  if (prevItems.length !== currItems.length) {
    out.push(`Numero macchine: ${prevItems.length} → ${currItems.length}`);
  }
  const prevByPos = new Map<number, any>();
  prevItems.forEach(it => prevByPos.set(it.position ?? 0, it));
  const currByPos = new Map<number, any>();
  currItems.forEach(it => currByPos.set(it.position ?? 0, it));
  const allPositions = new Set<number>([...Array.from(prevByPos.keys()), ...Array.from(currByPos.keys())]);
  for (const pos of Array.from(allPositions).sort((a, b) => a - b)) {
    const p = prevByPos.get(pos);
    const c = currByPos.get(pos);
    if (p && !c) { out.push(`Rimossa pos. ${pos}: ${p.snapshotMachineName}`); continue; }
    if (!p && c) { out.push(`Aggiunta pos. ${pos}: ${c.snapshotMachineName}`); continue; }
    if (!p || !c) continue;

    const tag = `Pos. ${pos} (${c.snapshotMachineName})`;

    if (p.machineId !== c.machineId) {
      out.push(`Pos. ${pos}: macchina catalogo cambiata (${p.snapshotMachineName} → ${c.snapshotMachineName})`);
    } else if (str(p.snapshotMachineName) !== str(c.snapshotMachineName)) {
      out.push(`Pos. ${pos}: nome macchina "${p.snapshotMachineName}" → "${c.snapshotMachineName}"`);
    }
    if (num(p.quantity ?? 1) !== num(c.quantity ?? 1)) {
      out.push(`${tag}: quantità ${p.quantity ?? 1} → ${c.quantity ?? 1}`);
    }
    const pPrice = round2(num(p.snapshotBasePrice));
    const cPrice = round2(num(c.snapshotBasePrice));
    if (pPrice !== cPrice) {
      out.push(`${tag}: prezzo base € ${fmtMoney(pPrice)} → € ${fmtMoney(cPrice)}`);
    }
    if (stripAllImagePlaceholders(str(p.snapshotMachineDescription)) !== stripAllImagePlaceholders(str(c.snapshotMachineDescription))) {
      out.push(`${tag}: descrizione modificata`);
    }
    if (!deepEqual(p.snapshotTitles ?? null, c.snapshotTitles ?? null)) {
      out.push(`${tag}: titoli tradotti modificati`);
    }
    const stripDescDict = (d: any) => {
      if (!d || typeof d !== "object") return d;
      const out: Record<string, string> = {};
      for (const k of Object.keys(d)) out[k] = stripAllImagePlaceholders(String(d[k] ?? ""));
      return out;
    };
    if (!deepEqual(stripDescDict(p.snapshotDescriptions ?? null), stripDescDict(c.snapshotDescriptions ?? null))) {
      out.push(`${tag}: descrizioni tradotte modificate`);
    }

    // Options matched by machineOptionId when it refers to a real catalog
    // option (>0). Custom options (machineOptionId=0) are matched by their
    // snapshotOptionName + sequential index so multiple custom options don't
    // collapse to the same key.
    const pOpts = (p.options ?? []) as any[];
    const cOpts = (c.options ?? []) as any[];
    const optKeyOf = (o: any, customSeq: number): string => {
      const id = Number(o?.machineOptionId ?? 0);
      if (id > 0) return `id:${id}`;
      return `custom:${customSeq}:${str(o?.snapshotOptionName)}`;
    };
    const pOptByKey = new Map<string, any>();
    let pCustomSeq = 0;
    pOpts.forEach(o => {
      const id = Number(o?.machineOptionId ?? 0);
      const key = optKeyOf(o, id > 0 ? 0 : pCustomSeq++);
      pOptByKey.set(key, o);
    });
    const cOptByKey = new Map<string, any>();
    let cCustomSeq = 0;
    cOpts.forEach(o => {
      const id = Number(o?.machineOptionId ?? 0);
      const key = optKeyOf(o, id > 0 ? 0 : cCustomSeq++);
      cOptByKey.set(key, o);
    });
    const optKeys = new Set<string>([...Array.from(pOptByKey.keys()), ...Array.from(cOptByKey.keys())]);
    for (const k of Array.from(optKeys)) {
      const po = pOptByKey.get(k);
      const co = cOptByKey.get(k);
      if (po && !co) {
        out.push(`${tag}: rimossa opzione "${po.snapshotOptionName}"`);
        continue;
      }
      if (!po && co) {
        out.push(`${tag}: aggiunta opzione "${co.snapshotOptionName}"`);
        continue;
      }
      if (!po || !co) continue;
      if (str(po.snapshotOptionName) !== str(co.snapshotOptionName)) {
        out.push(`${tag}: opzione rinominata "${po.snapshotOptionName}" → "${co.snapshotOptionName}"`);
      }
      const pop = round2(num(po.snapshotPriceModifier));
      const cop = round2(num(co.snapshotPriceModifier));
      if (pop !== cop) {
        out.push(`${tag}: opzione "${co.snapshotOptionName}" prezzo € ${fmtMoney(pop)} → € ${fmtMoney(cop)}`);
      }
      if (num(po.quantity ?? 1) !== num(co.quantity ?? 1)) {
        out.push(`${tag}: opzione "${co.snapshotOptionName}" qtà ${po.quantity ?? 1} → ${co.quantity ?? 1}`);
      }
      if (!deepEqual(po.snapshotOptionDescriptions ?? null, co.snapshotOptionDescriptions ?? null)) {
        out.push(`${tag}: opzione "${co.snapshotOptionName}" descrizione modificata`);
      }
    }
  }

  const pPd: any = (prev as any).projectData ?? {};
  const cPd: any = (curr as any).projectData ?? {};
  const pPricing = pPd.pricing ?? {};
  const cPricing = cPd.pricing ?? {};

  // ─── Pricing ─────────────────────────────────────────────────────────
  if (round2(num(pPricing.discountPercent)) !== round2(num(cPricing.discountPercent))) {
    out.push(`Sconto: ${num(pPricing.discountPercent)}% → ${num(cPricing.discountPercent)}%`);
  }
  if (round2(num(pPricing.interlockingPricePerPosition)) !== round2(num(cPricing.interlockingPricePerPosition))) {
    out.push(`Interlocking €/posizione: € ${fmtMoney(pPricing.interlockingPricePerPosition)} → € ${fmtMoney(cPricing.interlockingPricePerPosition)}`);
  }
  if (bool(pPricing.showDetailedPrices) !== bool(cPricing.showDetailedPrices)) {
    out.push(`Dettaglio prezzi: ${bool(pPricing.showDetailedPrices) ? "visibile" : "nascosto"} → ${bool(cPricing.showDetailedPrices) ? "visibile" : "nascosto"}`);
  }

  // Service items
  compareScalarMap(pPricing.serviceItems, cPricing.serviceItems, SERVICE_LABELS, out, "Servizi — ");

  // Installation config
  compareScalarMap(pPricing.installationConfig, cPricing.installationConfig, INSTALL_LABELS, out, "");

  // Extra items: detail by id/description
  const pExtras = (pPricing.extraItems ?? []) as any[];
  const cExtras = (cPricing.extraItems ?? []) as any[];
  {
    const pById = new Map<string, any>();
    pExtras.forEach(e => pById.set(String(e.id ?? e.description), e));
    const cById = new Map<string, any>();
    cExtras.forEach(e => cById.set(String(e.id ?? e.description), e));
    const keys = new Set<string>([...Array.from(pById.keys()), ...Array.from(cById.keys())]);
    for (const k of Array.from(keys)) {
      const pe = pById.get(k); const ce = cById.get(k);
      if (pe && !ce) out.push(`Voce extra rimossa: "${pe.description}" (€ ${fmtMoney(pe.price)})`);
      else if (!pe && ce) out.push(`Voce extra aggiunta: "${ce.description}" (€ ${fmtMoney(ce.price)})`);
      else if (pe && ce) {
        if (str(pe.description) !== str(ce.description)) {
          out.push(`Voce extra rinominata: "${pe.description}" → "${ce.description}"`);
        }
        if (round2(num(pe.price)) !== round2(num(ce.price))) {
          out.push(`Voce extra "${ce.description}": € ${fmtMoney(pe.price)} → € ${fmtMoney(ce.price)}`);
        }
      }
    }
  }

  // Price labels & comments
  compareScalarMap(pPricing.priceLabels, cPricing.priceLabels, PRICE_LABEL_NAMES, out, "");
  compareScalarMap(pPricing.priceComments, cPricing.priceComments, PRICE_COMMENT_NAMES, out, "");
  if (!deepEqual(pPricing.priceComments?.extras ?? {}, cPricing.priceComments?.extras ?? {})) {
    out.push(`Commenti voci extra modificati`);
  }

  // Per-machine comments / per-option comments / option price hidden flags
  // (pricing.itemComments is ordered to match the saved cart, so index i → position i+1)
  {
    const pIC = (pPricing.itemComments ?? []) as any[];
    const cIC = (cPricing.itemComments ?? []) as any[];
    const maxLen = Math.max(pIC.length, cIC.length);
    for (let i = 0; i < maxLen; i++) {
      const pe = pIC[i];
      const ce = cIC[i];
      const pos = i + 1;
      const machineName = currByPos.get(pos)?.snapshotMachineName
        ?? prevByPos.get(pos)?.snapshotMachineName
        ?? "?";
      const tag = `Pos. ${pos} (${machineName})`;
      if (str(pe?.machineComment) !== str(ce?.machineComment)) {
        out.push(`${tag}: commento macchina modificato`);
      }
      if (!deepEqual(pe?.optionComments ?? {}, ce?.optionComments ?? {})) {
        out.push(`${tag}: commenti opzioni modificati`);
      }
      if (!deepEqual(pe?.optionPriceHidden ?? {}, ce?.optionPriceHidden ?? {})) {
        out.push(`${tag}: visibilità prezzi opzioni modificata`);
      }
    }
  }

  // ─── Technical specs (per-field) ─────────────────────────────────────
  const pSpecs = pPd.technicalSpecs ?? {};
  const cSpecs = cPd.technicalSpecs ?? {};
  {
    const keys = new Set([...Object.keys(pSpecs), ...Object.keys(cSpecs)]);
    for (const k of keys) {
      const label = TECH_SPEC_LABELS[k] ?? `Specifica "${k}"`;
      if (str(pSpecs[k]) !== str(cSpecs[k])) {
        out.push(`${label}: "${pSpecs[k] ?? ""}" → "${cSpecs[k] ?? ""}"`);
      }
    }
  }

  // ─── Header info ─────────────────────────────────────────────────────
  const pHi = pPd.headerInfo ?? {};
  const cHi = cPd.headerInfo ?? {};
  if (str(pHi.date) !== str(cHi.date)) out.push(`Data intestazione: ${pHi.date || "—"} → ${cHi.date || "—"}`);
  compareScalarMap(pHi.customer, cHi.customer, HEADER_CUST_LABELS, out, "");
  compareScalarMap(pHi.salesman, cHi.salesman, HEADER_SALES_LABELS, out, "");

  // ─── Commercial / scenario ───────────────────────────────────────────
  const pComm = pPd.commercial ?? {};
  const cComm = cPd.commercial ?? {};
  if (str(pComm.endCustomerName) !== str(cComm.endCustomerName)) {
    out.push(`Cliente finale: ${pComm.endCustomerName || "—"} → ${cComm.endCustomerName || "—"}`);
  }
  if (str(pComm.dealerCompanyId) !== str(cComm.dealerCompanyId)) {
    out.push(`Dealer associato: ${pComm.dealerCompanyId || "—"} → ${cComm.dealerCompanyId || "—"}`);
  }
  const pScenario = pPd.salesScenario ?? pPd.offerScenario ?? pComm.salesScenario;
  const cScenario = cPd.salesScenario ?? cPd.offerScenario ?? cComm.salesScenario;
  if (str(pScenario) !== str(cScenario)) {
    out.push(`Scenario vendita: ${pScenario || "—"} → ${cScenario || "—"}`);
  }

  // ─── Delivery ────────────────────────────────────────────────────────
  if (str(pPd.deliveryMode) !== str(cPd.deliveryMode)) {
    out.push(`Modalità consegna: ${pPd.deliveryMode || "—"} → ${cPd.deliveryMode || "—"}`);
  }
  if (str(pPd.deliveryDays) !== str(cPd.deliveryDays)) {
    out.push(`Giorni consegna: ${pPd.deliveryDays || "—"} → ${cPd.deliveryDays || "—"}`);
  }
  if (str(pPd.deliveryDescription) !== str(cPd.deliveryDescription)) {
    out.push(`Descrizione consegna modificata`);
  }
  if (str(pPd.deliveryDate) !== str(cPd.deliveryDate)) {
    out.push(`Data consegna: ${pPd.deliveryDate || "—"} → ${cPd.deliveryDate || "—"}`);
  }
  if (str(pPd.deliveryTerms) !== str(cPd.deliveryTerms)) {
    out.push(`Termini consegna modificati`);
  }

  // ─── Payment ─────────────────────────────────────────────────────────
  if (str(pPd.paymentMode) !== str(cPd.paymentMode)) {
    out.push(`Modalità pagamento: ${pPd.paymentMode || "—"} → ${cPd.paymentMode || "—"}`);
  }
  const pSched = pPd.paymentSchedule ?? pPd.paymentTerms ?? pPd.payment ?? null;
  const cSched = cPd.paymentSchedule ?? cPd.paymentTerms ?? cPd.payment ?? null;
  if (!deepEqual(pSched, cSched)) {
    if (Array.isArray(pSched) && Array.isArray(cSched)) {
      if (pSched.length !== cSched.length) {
        out.push(`Piano pagamento: ${pSched.length} → ${cSched.length} voci`);
      } else {
        out.push(`Piano pagamento modificato (${cSched.length} voci)`);
      }
    } else {
      out.push(`Termini di pagamento modificati`);
    }
  }

  // ─── Sections ordering / visibility / page breaks ────────────────────
  compareIdLists(pPd.hiddenSections, cPd.hiddenSections, "Sezioni nascoste", out);
  compareIdLists(pPd.sectionOrder, cPd.sectionOrder, "Ordine sezioni", out);
  compareIdLists(pPd.pageBreaks, cPd.pageBreaks, "Interruzioni di pagina", out);
  compareIdLists(pPd.machineOrder, cPd.machineOrder, "Ordine macchine", out);
  // Page-break fields actually persisted in projectData payload:
  compareIdLists(pPd.machineBreakPositions, cPd.machineBreakPositions, "Interruzioni pagina macchine", out);
  compareIdLists(pPd.termsBreakPositions, cPd.termsBreakPositions, "Interruzioni pagina termini", out);
  // Legacy keys (kept for backward compatibility with older offers):
  if (pPd.machineBreakPositions === undefined && cPd.machineBreakPositions === undefined) {
    compareIdLists(pPd.machinePageBreaks, cPd.machinePageBreaks, "Interruzioni pagina macchine", out);
  }
  if (pPd.termsBreakPositions === undefined && cPd.termsBreakPositions === undefined) {
    compareIdLists(pPd.termsPageBreaks, cPd.termsPageBreaks, "Interruzioni pagina termini", out);
  }

  // ─── Per-section / per-machine overrides ─────────────────────────────
  compareKeyedOverrides(pPd.sectionTextOverrides, cPd.sectionTextOverrides, "Testo introduzione sezione", out);
  compareKeyedOverrides(pPd.machineDescOverrides, cPd.machineDescOverrides, "Descrizione macchina (override)", out);
  compareKeyedOverrides(pPd.lineSpeedOverrides, cPd.lineSpeedOverrides, "Velocità linea (override)", out);

  // ─── Family / drawings / layout ──────────────────────────────────────
  if (str(pPd.family) !== str(cPd.family)) {
    out.push(`Famiglia prodotto: ${pPd.family || "—"} → ${cPd.family || "—"}`);
  }
  if (str(pPd.layout) !== str(cPd.layout)) {
    out.push(`Note layout modificate`);
  }
  const pDrawId = pPd.selectedDrawingId ?? pPd.linkedDrawingId ?? null;
  const cDrawId = cPd.selectedDrawingId ?? cPd.linkedDrawingId ?? null;
  if (str(pDrawId) !== str(cDrawId)) {
    out.push(`Disegno collegato: ${pDrawId ?? "—"} → ${cDrawId ?? "—"}`);
  }
  if (bool(pPd.includeLayoutInPdf) !== bool(cPd.includeLayoutInPdf)) {
    out.push(`Layout in PDF: ${bool(pPd.includeLayoutInPdf) ? "incluso" : "escluso"} → ${bool(cPd.includeLayoutInPdf) ? "incluso" : "escluso"}`);
  }
  const pLayout = pPd.layoutDrawing ?? null;
  const cLayout = cPd.layoutDrawing ?? null;
  if (!deepEqual(pLayout, cLayout)) {
    if (!pLayout && cLayout) out.push(`Aggiunto layout: ${cLayout.originalName ?? ""}`);
    else if (pLayout && !cLayout) out.push(`Rimosso layout: ${pLayout.originalName ?? ""}`);
    else out.push(`Layout PDF modificato`);
  }
  const pLayoutDwg = pPd.layoutDwg ?? null;
  const cLayoutDwg = cPd.layoutDwg ?? null;
  if (!deepEqual(pLayoutDwg, cLayoutDwg)) {
    if (!pLayoutDwg && cLayoutDwg) out.push(`Aggiunto layout DWG: ${cLayoutDwg.originalName ?? ""}`);
    else if (pLayoutDwg && !cLayoutDwg) out.push(`Rimosso layout DWG: ${pLayoutDwg.originalName ?? ""}`);
    else out.push(`Layout DWG modificato`);
  }

  // ─── Terms & conditions text ─────────────────────────────────────────
  const pTerms = pPd.terms ?? pPd.termsAndConditions ?? pPd.generalConditions ?? "";
  const cTerms = cPd.terms ?? cPd.termsAndConditions ?? cPd.generalConditions ?? "";
  const pTermsStr = typeof pTerms === "string" ? pTerms : JSON.stringify(pTerms);
  const cTermsStr = typeof cTerms === "string" ? cTerms : JSON.stringify(cTerms);
  if (pTermsStr !== cTermsStr) {
    out.push(`Termini e condizioni modificati`);
  }

  // ─── CRM info (offer top-level column) ───────────────────────────────
  compareCrmInfo((prev as any).crmInfo, (curr as any).crmInfo, out);

  // ─── Documents ───────────────────────────────────────────────────────
  if (prevDocs !== undefined || currDocs !== undefined) {
    const pMap = summarizeDocs(prevDocs);
    const cMap = summarizeDocs(currDocs);
    const names = new Set<string>([...Array.from(pMap.keys()), ...Array.from(cMap.keys())]);
    const added: string[] = [];
    const removed: string[] = [];
    for (const n of Array.from(names)) {
      const inPrev = pMap.has(n);
      const inCurr = cMap.has(n);
      if (inPrev && !inCurr) removed.push(n);
      else if (!inPrev && inCurr) added.push(n);
    }
    if (added.length) out.push(`Documenti aggiunti: ${added.join(", ")}`);
    if (removed.length) out.push(`Documenti rimossi: ${removed.join(", ")}`);
  }

  return out;
}
