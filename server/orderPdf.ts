import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { PDFDocument } from "pdf-lib";
import { displayVersion } from "../shared/version";
import type {
  OrderBillingInfo, OrderShippingInfo, OrderLineItem, OrderPriceSummary,
  OrderShippingTerms, OrderAgentInfo, OrderPaymentTerm, OrderTechnicalSheet,
  OrderLogistics, OrderShipment, AssemblyPhase, TimelineEvent, OrderInvoiceEntry,
  ProductionProgressEntry,
} from "@shared/schema";

function getChromiumPath(): string {
  try { return execSync("which chromium", { encoding: "utf-8" }).trim(); } catch { return "/usr/bin/chromium"; }
}

const LOGO_PATH = path.join(process.cwd(), "server/assets/logo.png");
const HEADER_LOGO_PATH = path.join(process.cwd(), "server/assets/header-logo.png");
const FONTS_DIR = path.join(process.cwd(), "server/assets/fonts");
const MACHINE_IMG_DIR = path.join(process.cwd(), "server/assets/machine-images");

function getFontBase64(filename: string): string {
  try { const p = path.join(FONTS_DIR, filename); if (fs.existsSync(p)) return fs.readFileSync(p).toString("base64"); } catch {} return "";
}

function getMachineImageBase64(filename: string): { b64: string; mime: string } | null {
  if (!filename) return null;
  try {
    const safeName = path.basename(filename).toLowerCase();
    if (!safeName || safeName === "." || safeName === "..") return null;
    const hasExt = !!path.extname(safeName);
    const exts: Array<[string, string]> = [["png","image/png"],["jpg","image/jpeg"],["jpeg","image/jpeg"],["webp","image/webp"]];
    const resolvedDir = path.resolve(MACHINE_IMG_DIR);
    const tryFile = (fp: string): { b64: string; mime: string } | null => {
      const resolved = path.resolve(fp);
      if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) return null;
      if (!fs.existsSync(resolved)) return null;
      const ext = path.extname(resolved).slice(1).toLowerCase();
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
      return { b64: fs.readFileSync(resolved).toString("base64"), mime };
    };
    if (hasExt) {
      return tryFile(path.join(MACHINE_IMG_DIR, safeName));
    } else {
      for (const [ext] of exts) {
        const result = tryFile(path.join(MACHINE_IMG_DIR, `${safeName}.${ext}`));
        if (result) return result;
      }
    }
  } catch {}
  return null;
}

function getLogoBase64(): string {
  try {
    if (fs.existsSync(HEADER_LOGO_PATH)) return fs.readFileSync(HEADER_LOGO_PATH).toString("base64");
    if (fs.existsSync(LOGO_PATH)) return fs.readFileSync(LOGO_PATH).toString("base64");
  } catch {} return "";
}

function esc(s: any): string {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface DiffSegment { type: "equal" | "added" | "removed"; text: string; }

function tokenize(text: string): string[] {
  return text.match(/\S+|\s+/g) || [];
}

function longestCommonSubsequence(a: string[], b: string[]): [number, number][] {
  const m = a.length;
  const n = b.length;
  if (m * n > 500000) {
    const bMap = new Map<string, number[]>();
    for (let j = 0; j < n; j++) {
      if (!bMap.has(b[j])) bMap.set(b[j], []);
      bMap.get(b[j])!.push(j);
    }
    const result: [number, number][] = [];
    let lastJ = -1;
    for (let i = 0; i < m; i++) {
      const positions = bMap.get(a[i]);
      if (!positions) continue;
      const pos = positions.find(j => j > lastJ);
      if (pos !== undefined) { result.push([i, pos]); lastJ = pos; }
    }
    return result;
  }
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result: [number, number][] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { result.push([i, j]); i++; j++; }
    else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) i++;
    else j++;
  }
  return result;
}

function computeWordDiff(original: string, modified: string): DiffSegment[] {
  if (original === modified) return [{ type: "equal", text: modified }];
  if (!original) return [{ type: "added", text: modified }];
  if (!modified) return [{ type: "removed", text: original }];
  const origWords = tokenize(original);
  const modWords = tokenize(modified);
  const lcs = longestCommonSubsequence(origWords, modWords);
  const segments: DiffSegment[] = [];
  let oi = 0, mi = 0;
  for (const [lo, lm] of lcs) {
    if (oi < lo) segments.push({ type: "removed", text: origWords.slice(oi, lo).join("") });
    if (mi < lm) segments.push({ type: "added", text: modWords.slice(mi, lm).join("") });
    segments.push({ type: "equal", text: origWords[lo] });
    oi = lo + 1; mi = lm + 1;
  }
  if (oi < origWords.length) segments.push({ type: "removed", text: origWords.slice(oi).join("") });
  if (mi < modWords.length) segments.push({ type: "added", text: modWords.slice(mi).join("") });
  const merged: DiffSegment[] = [];
  for (const seg of segments) {
    if (seg.text === "") continue;
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type) last.text += seg.text;
    else merged.push({ ...seg });
  }
  return merged;
}

function renderLineContentWithImages(text: string, style?: string): string {
  const parts = text.split(/\[\[IMG:([^\]]+)\]\]/);
  const rendered = parts.map((part, pi) => {
    if (pi % 2 === 0) {
      return part ? `<span${style ? ` style="${style}"` : ""}>${esc(part)}</span>` : "";
    }
    const imgData = getMachineImageBase64(part);
    return imgData
      ? `<img src="data:${imgData.mime};base64,${imgData.b64}" style="width:400px;max-width:100%;height:auto;max-height:260px;object-fit:contain;border-radius:4px;display:inline-block;vertical-align:middle;margin:4px 0;" />`
      : `<span${style ? ` style="${style}"` : ""}>[${esc(part)}]</span>`;
  }).join("");
  return rendered;
}

function renderDescriptionDiffHtml(original: string, modified: string): string {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  const lcs = longestCommonSubsequence(origLines, modLines);
  const lineDiffs: { type: string; oldLine?: string; newLine?: string; text?: string }[] = [];
  let oi = 0, mi = 0;
  for (const [lo, lm] of lcs) {
    const removed = origLines.slice(oi, lo);
    const added = modLines.slice(mi, lm);
    const pairCount = Math.min(removed.length, added.length);
    for (let p = 0; p < pairCount; p++) lineDiffs.push({ type: "modified", oldLine: removed[p], newLine: added[p] });
    for (let p = pairCount; p < removed.length; p++) lineDiffs.push({ type: "removed", oldLine: removed[p] });
    for (let p = pairCount; p < added.length; p++) lineDiffs.push({ type: "added", newLine: added[p] });
    lineDiffs.push({ type: "equal", text: origLines[lo] });
    oi = lo + 1; mi = lm + 1;
  }
  const removedTail = origLines.slice(oi);
  const addedTail = modLines.slice(mi);
  const tc = Math.min(removedTail.length, addedTail.length);
  for (let p = 0; p < tc; p++) lineDiffs.push({ type: "modified", oldLine: removedTail[p], newLine: addedTail[p] });
  for (let p = tc; p < removedTail.length; p++) lineDiffs.push({ type: "removed", oldLine: removedTail[p] });
  for (let p = tc; p < addedTail.length; p++) lineDiffs.push({ type: "added", newLine: addedTail[p] });

  return lineDiffs.map(ld => {
    if (ld.type === "equal") return `<div style="font-size:8.5pt;line-height:1.5;">${renderLineContentWithImages(ld.text ?? "")}</div>`;
    if (ld.type === "removed") return `<div style="font-size:8.5pt;line-height:1.5;">${renderLineContentWithImages(ld.oldLine ?? "", "color:#DC2626;text-decoration:line-through;")}</div>`;
    if (ld.type === "added") return `<div style="font-size:8.5pt;line-height:1.5;">${renderLineContentWithImages(ld.newLine ?? "", "color:#16A34A;text-decoration:underline;")}</div>`;
    const wordSegs = computeWordDiff(ld.oldLine ?? "", ld.newLine ?? "");
    const html = wordSegs.map(seg => {
      if (seg.type === "equal") return renderLineContentWithImages(seg.text);
      if (seg.type === "removed") return renderLineContentWithImages(seg.text, "color:#DC2626;text-decoration:line-through;");
      return renderLineContentWithImages(seg.text, "color:#16A34A;text-decoration:underline;");
    }).join("");
    return `<div style="font-size:8.5pt;line-height:1.5;">${html}</div>`;
  }).join("");
}

function renderDescriptionWithImages(desc: string): string {
  const parts = desc.split(/\[\[IMG:([^\]]+)\]\]/);
  return parts.map((part, pi) => {
    if (pi % 2 === 0) {
      return part.trim() ? `<div style="font-size:8.5pt;line-height:1.5;white-space:pre-wrap;">${esc(part)}</div>` : "";
    }
    const imgData = getMachineImageBase64(part);
    return imgData
      ? `<div style="margin:8px 0;"><img src="data:${imgData.mime};base64,${imgData.b64}" style="width:480px;max-width:100%;height:auto;max-height:300px;object-fit:contain;border-radius:6px;display:block;" /></div>`
      : "";
  }).join("");
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "0,00";
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "€ 0,00";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  try { const dt = new Date(d); return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`; } catch { return ""; }
}

function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "";
  try {
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  } catch { return ""; }
}

function field(label: string, value: any): string {
  if (!value || (typeof value === "string" && !value.trim())) return "";
  return `<div><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`;
}

function card(title: string, content: string): string {
  return `<div class="card"><div class="card-header">${title}</div><div class="card-body">${content}</div></div>`;
}

function statusBadge(text: string, color: string): string {
  const colors: Record<string, string> = {
    green: "background:#DCFCE7;color:#166534;border:1px solid #BBF7D0;",
    amber: "background:#FEF3C7;color:#92400E;border:1px solid #FDE68A;",
    orange: "background:#FFEDD5;color:#9A3412;border:1px solid #FED7AA;",
    red: "background:#FEE2E2;color:#991B1B;border:1px solid #FECACA;",
    blue: "background:#DBEAFE;color:#1E40AF;border:1px solid #BFDBFE;",
    gray: "background:#F3F4F6;color:#374151;border:1px solid #D1D5DB;",
    purple: "background:#F3E8FF;color:#7C3AED;border:1px solid #C4B5FD;",
  };
  return `<span style="display:inline-block;font-size:7.5pt;font-weight:600;padding:2px 8px;border-radius:4px;${colors[color] || colors.gray}">${esc(text)}</span>`;
}

function includedBadge(included: boolean, label: string): string {
  return included
    ? `<span style="display:inline-block;font-size:7pt;font-weight:600;padding:1px 6px;border-radius:3px;background:#DCFCE7;color:#166534;border:1px solid #BBF7D0;">INCLUSO</span>`
    : `<span style="font-size:8.5pt;font-family:monospace;">€ 0,00</span>`;
}

export const ORDER_PDF_SECTIONS = [
  { id: "header", label: "Intestazione Commessa" },
  { id: "confirmation", label: "Stato Conferma" },
  { id: "versions", label: "Storico Versioni" },
  { id: "timeline", label: "Timeline Progetto" },
  { id: "overview", label: "Panoramica Ordine" },
  { id: "addresses", label: "Fatturazione & Destinazione" },
  { id: "delivery", label: "Consegna" },
  { id: "assembly", label: "Montaggio" },
  { id: "payments", label: "Condizioni di Pagamento" },
  { id: "invoicing", label: "Fatturazione Emessa" },
  { id: "priceOverview", label: "Price Overview" },
  { id: "techData", label: "Dati Tecnici Generali della Linea" },
  { id: "techSheets", label: "Schede Tecniche" },
  { id: "notes", label: "Note" },
  { id: "production", label: "Avanzamento Produzione" },
] as const;

export type OrderPdfSectionId = (typeof ORDER_PDF_SECTIONS)[number]["id"];

export interface OrderPdfOptions {
  hiddenSections?: string[];
  mergeLayout?: boolean;
  mergeDocuments?: boolean;
}

export function buildOrderHtml(order: any, versions?: any[], options?: OrderPdfOptions): string {
  const hidden = new Set(options?.hiddenSections ?? []);
  const show = (id: string) => !hidden.has(id);
  const outfit400 = getFontBase64("Outfit-400.ttf");
  const outfit600 = getFontBase64("Outfit-600.ttf");
  const outfit700 = getFontBase64("Outfit-700.ttf");

  const billing: OrderBillingInfo = order.billingInfo ?? {};
  const shipping: OrderShippingInfo = order.shippingInfo ?? {};
  const payments: OrderPaymentTerm[] = order.paymentTerms ?? [];
  const items: OrderLineItem[] = order.orderItems ?? [];
  const additional: OrderLineItem[] = order.additionalItems ?? [];
  const pricing: OrderPriceSummary = order.priceSummary ?? {};
  const shipTerms: OrderShippingTerms = order.shippingTerms ?? {};
  const agent: OrderAgentInfo = order.agentInfo ?? {};
  const sheets: OrderTechnicalSheet[] = order.technicalSheets ?? [];
  const bankName = order.bankName ?? "";
  const logistics: OrderLogistics = order.logistics ?? { contractualDeliveryDate: "", hasPenalties: false, penaltiesDescription: "", contractualAssemblyStartDate: "", contractualTestingEndDate: "", shipments: [], phases: [] };
  const invoicing: OrderInvoiceEntry[] = order.invoicing ?? [];
  const productionProgress: ProductionProgressEntry[] = order.productionProgress ?? [];
  const timeline: TimelineEvent[] = logistics.timeline ?? [];

  const fontFaces = `
    @font-face { font-family:'Outfit'; src:url(data:font/ttf;base64,${outfit400}); font-weight:400; }
    @font-face { font-family:'Outfit'; src:url(data:font/ttf;base64,${outfit600}); font-weight:600; }
    @font-face { font-family:'Outfit'; src:url(data:font/ttf;base64,${outfit700}); font-weight:700; }
  `;

  const css = `
    ${fontFaces}
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Outfit',Arial,Helvetica,sans-serif; font-size:9pt; color:#111827; line-height:1.4; }
    .page-break { page-break-before:always; }
    table { width:100%; border-collapse:collapse; }

    .card { border:1px solid #E5E7EB; border-radius:8px; margin-bottom:12px; overflow:hidden; page-break-inside:avoid; }
    .card-header { font-size:10pt; font-weight:700; padding:8px 12px; background:#F9FAFB; border-bottom:1px solid #E5E7EB; display:flex; align-items:center; gap:6px; }
    .card-body { padding:10px 12px; }

    .section { margin-bottom:14px; }
    .section-title { font-size:10pt; font-weight:700; text-transform:uppercase; color:#1F2937; border-bottom:2px solid #1F2937; padding-bottom:3px; margin-bottom:8px; letter-spacing:0.5px; }
    .sub-title { font-size:9pt; font-weight:600; color:#374151; margin-bottom:4px; }
    .label { font-size:7.5pt; font-weight:600; color:#6B7280; text-transform:uppercase; letter-spacing:0.3px; }
    .value { font-size:9pt; color:#111827; }
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; }
    .grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px 16px; }
    .grid-4 { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:6px 16px; }
    .addr-box { border:1px solid #D1D5DB; border-radius:4px; padding:10px; }
    .addr-box .addr-title { font-size:8pt; font-weight:700; text-transform:uppercase; color:#6B7280; margin-bottom:6px; letter-spacing:0.5px; }

    .items-table th { text-align:left; font-size:7.5pt; font-weight:700; text-transform:uppercase; color:#6B7280; padding:5px 6px; border-bottom:2px solid #1F2937; }
    .items-table td { padding:5px 6px; border-bottom:1px solid #E5E7EB; font-size:9pt; }
    .items-table .pos { width:40px; text-align:center; font-family:monospace; }
    .items-table .price { text-align:right; white-space:nowrap; font-family:monospace; }
    .total-row td { font-weight:700; border-top:2px solid #1F2937; border-bottom:none; padding-top:6px; }
    .grand-total td { font-weight:700; font-size:10pt; color:#1D4ED8; border-top:2px solid #1D4ED8; padding-top:8px; }

    .tech-header { background:#F3F4F6; padding:8px 10px; font-weight:700; font-size:9.5pt; border:1px solid #D1D5DB; border-radius:4px 4px 0 0; }
    .tech-body { border:1px solid #D1D5DB; border-top:none; padding:10px; border-radius:0 0 4px 4px; }
    .tech-section-title { font-size:8pt; font-weight:700; text-transform:uppercase; color:#6B7280; margin-top:8px; margin-bottom:4px; letter-spacing:0.3px; }
    .opt-list { list-style:decimal; padding-left:18px; }
    .opt-list li { font-size:8.5pt; margin-bottom:2px; }

    .status-box { border-radius:8px; padding:10px 14px; margin-bottom:12px; display:flex; align-items:center; gap:10px; }
    .timeline-row { display:flex; align-items:flex-start; margin-bottom:0; }
    .timeline-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; margin-top:2px; }
    .timeline-line { height:2px; flex:1; margin-top:6px; }

    .progress-bar { height:6px; border-radius:3px; background:#E5E7EB; overflow:hidden; }
    .progress-fill { height:100%; border-radius:3px; }

    .version-row { border:1px solid #E5E7EB; border-radius:6px; padding:8px 10px; margin-bottom:6px; }
    .version-current { border:2px solid #3B82F6; background:#EFF6FF; }
    .version-badge { display:inline-block; font-family:monospace; font-size:8pt; font-weight:600; padding:2px 8px; border-radius:4px; }

    .phase-card { border:1px solid #E5E7EB; border-radius:6px; overflow:hidden; margin-bottom:8px; }
    .phase-header { background:#F9FAFB; border-bottom:1px solid #E5E7EB; padding:6px 10px; display:flex; align-items:center; gap:8px; }
    .phase-body { padding:8px 10px; }

    .info-box { background:#F9FAFB; border:1px solid #E5E7EB; border-radius:6px; padding:8px 10px; }
    .highlight-box { background:#EFF6FF; border:1px solid #BFDBFE; border-radius:6px; padding:8px 10px; }

    .payment-row { display:flex; align-items:center; gap:8px; padding:4px 0; }
    .payment-paid { background:#F0FDF4; border:1px solid #BBF7D0; border-radius:6px; padding:4px 8px; }
    .invoice-row { display:flex; align-items:center; gap:12px; padding:4px 0; border-bottom:1px solid #F3F4F6; }
  `;

  const currentStatus = order.status ?? "active";
  const statusLabels: Record<string, string> = { active: "Attiva", completed: "Completata", cancelled: "Annullata", on_hold: "Sospesa" };
  const statusColors: Record<string, string> = { active: "green", completed: "blue", cancelled: "red", on_hold: "amber" };

  const headerRow = `
    <div style="margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-size:11pt; font-weight:700; color:#000;">COMMESSA: <span style="font-family:monospace; font-size:14pt; color:#DC2626;">${esc(order.jobNumber)}</span>
            <span style="font-size:10pt; font-weight:700; color:#000; margin-left:4px;">v${displayVersion(order.currentVersion)}</span>
          </div>
          ${order.customerName ? `<div style="font-size:10pt; font-weight:600; color:#374151; margin-top:2px;">${esc(order.customerName)}</div>` : ""}
        </div>
        <div style="text-align:right;">
          ${statusBadge(statusLabels[currentStatus] || currentStatus, statusColors[currentStatus] || "gray")}
        </div>
      </div>
    </div>
  `;

  const confStatus = order.confirmationStatus ?? "pending";
  const confConfig: Record<string, { bg: string; border: string; color: string; text: string }> = {
    confirmed: { bg: "#F0FDF4", border: "#86EFAC", color: "#166534", text: "Confermato" },
    revision_requested: { bg: "#FFF7ED", border: "#FDBA74", color: "#9A3412", text: "Revisione Richiesta" },
    rejected: { bg: "#FEF2F2", border: "#FCA5A5", color: "#991B1B", text: "Rifiutato" },
    pending: { bg: "#FFFBEB", border: "#FCD34D", color: "#92400E", text: "In attesa di conferma" },
  };
  const cc = confConfig[confStatus] || confConfig.pending;
  const confirmationHtml = `
    <div class="status-box" style="background:${cc.bg}; border:1px solid ${cc.border};">
      <span style="font-size:9.5pt; font-weight:700; color:${cc.color};">${cc.text}</span>
      ${confStatus === "confirmed" && order.confirmedAt ? `<span style="font-size:8pt; color:${cc.color}; margin-left:auto;">${fmtDateTime(order.confirmedAt)}</span>` : ""}
    </div>
    ${(confStatus === "revision_requested" || confStatus === "rejected") && order.confirmationComment ? `
      <div style="background:${confStatus === "revision_requested" ? "#FFF7ED" : "#FEF2F2"}; border:1px solid ${confStatus === "revision_requested" ? "#FDBA74" : "#FCA5A5"}; border-radius:6px; padding:8px 10px; margin-bottom:12px;">
        <div style="font-size:7pt; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:${confStatus === "revision_requested" ? "#EA580C" : "#DC2626"}; margin-bottom:4px;">
          ${confStatus === "revision_requested" ? "Commento revisione" : "Motivo rifiuto"}
        </div>
        <div style="font-size:8.5pt; white-space:pre-line;">${esc(order.confirmationComment)}</div>
        ${order.confirmedAt ? `<div style="font-size:7pt; color:#9CA3AF; margin-top:4px;">${fmtDateTime(order.confirmedAt)}</div>` : ""}
      </div>
    ` : ""}
  `;

  const sortedTimeline = [...timeline].sort((a, b) => {
    const da = a.plannedDate || a.actualDate || "9999";
    const db2 = b.plannedDate || b.actualDate || "9999";
    if (da === db2) return 0;
    if (da === "9999") return 1;
    if (db2 === "9999") return -1;
    return da.localeCompare(db2);
  });
  const dotColors: Record<string, string> = { pending: "#D1D5DB", in_progress: "#3B82F6", completed: "#22C55E", skipped: "#F59E0B" };
  const timelineHtml = sortedTimeline.length > 0 ? card("Timeline Progetto", `
    <div style="display:flex; align-items:flex-start; gap:0; overflow:hidden;">
      ${sortedTimeline.map((evt, idx) => {
        const isLast = idx === sortedTimeline.length - 1;
        const dotColor = dotColors[evt.status] || dotColors.pending;
        const displayDate = evt.actualDate || evt.plannedDate;
        const lineColor = evt.status === "completed" && sortedTimeline[idx + 1]?.status === "completed" ? "#22C55E" : "#E5E7EB";
        return `
          <div style="display:flex; flex-direction:column; align-items:center; flex:1; min-width:0;">
            <div style="display:flex; align-items:center; width:100%;">
              ${idx > 0 ? `<div style="height:2px; flex:1; background:${idx > 0 && sortedTimeline[idx - 1]?.status === "completed" && evt.status === "completed" ? "#22C55E" : "#E5E7EB"};"></div>` : `<div style="flex:1;"></div>`}
              <div style="width:10px; height:10px; border-radius:50%; background:${dotColor}; flex-shrink:0;"></div>
              ${!isLast ? `<div style="height:2px; flex:1; background:${lineColor};"></div>` : `<div style="flex:1;"></div>`}
            </div>
            <div style="text-align:center; margin-top:4px; padding:0 2px; width:100%;">
              <div style="font-size:7pt; font-weight:600; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(evt.label)}</div>
              ${displayDate ? `<div style="font-size:6.5pt; font-family:monospace; color:#6B7280;">${fmtDate(displayDate)}</div>` : `<div style="font-size:6.5pt; color:#9CA3AF;">—</div>`}
              ${evt.actualDate && evt.plannedDate && evt.actualDate !== evt.plannedDate ? `<div style="font-size:6pt; color:#9CA3AF; text-decoration:line-through;">${fmtDate(evt.plannedDate)}</div>` : ""}
            </div>
          </div>`;
      }).join("")}
    </div>
  `) : "";

  const overviewHtml = card("Panoramica Ordine", `
    <div class="grid-4">
      ${field("Settore", order.settore || "Legno")}
      ${field("Job", order.jobCode)}
      ${field("Data Ordine", fmtDate(order.createdAt))}
      ${field("Ultimo Aggiornamento", fmtDateTime(order.updatedAt))}
    </div>
    ${(agent.dealerCompanyName || agent.dealerContactName || agent.code) ? `
      <div style="border-top:1px solid #E5E7EB; margin-top:8px; padding-top:8px;">
        <div class="label" style="margin-bottom:6px;">Agente</div>
        <div class="grid-3">
          ${field("Azienda", agent.dealerCompanyName)}
          ${field("Contatto", agent.dealerContactName)}
          ${field("Codice / Nome", agent.code)}
        </div>
      </div>
    ` : ""}
  `);

  const billingShippingSame =
    (billing.name || "").trim() === (shipping.name || "").trim() &&
    (billing.address || "").trim() === (shipping.address || "").trim() &&
    (billing.city || "").trim() === (shipping.city || "").trim() &&
    (billing.country || "").trim() === (shipping.country || "").trim();

  const addressBlock = card("Fatturazione & Destinazione", `
    <div class="grid-2">
      <div class="addr-box">
        <div class="addr-title">Fatturazione</div>
        <div class="value" style="font-weight:600;">${esc(billing.name)}</div>
        ${billing.address ? `<div class="value">${esc(billing.address)}</div>` : ""}
        <div class="value">${[esc(billing.city), esc(billing.country)].filter(Boolean).join(" — ")}</div>
        ${billing.vatId ? `<div class="value" style="font-size:8pt; color:#6B7280;">P.IVA/C.F.: ${esc(billing.vatId)}</div>` : ""}
        ${billing.phone ? `<div class="value" style="font-size:8pt;">Tel: ${esc(billing.phone)}</div>` : ""}
        ${billing.fax ? `<div class="value" style="font-size:8pt;">Fax: ${esc(billing.fax)}</div>` : ""}
      </div>
      <div class="addr-box">
        <div class="addr-title">Destinazione</div>
        ${billingShippingSame && (billing.name || billing.address) ? `
          <div style="display:flex; align-items:center; gap:6px; color:#6B7280; font-size:8.5pt; font-style:italic; padding:8px 0;">
            <span style="color:#22C55E;">✓</span> Uguale alla fatturazione
          </div>
        ` : `
          <div class="value" style="font-weight:600;">${esc(shipping.name || billing.name)}</div>
          ${shipping.address ? `<div class="value">${esc(shipping.address)}</div>` : ""}
          <div class="value">${[esc(shipping.city || billing.city), esc(shipping.country || billing.country)].filter(Boolean).join(" — ")}</div>
          ${shipping.phone ? `<div class="value" style="font-size:8pt;">Tel: ${esc(shipping.phone)}</div>` : ""}
          ${shipping.fax ? `<div class="value" style="font-size:8pt;">Fax: ${esc(shipping.fax)}</div>` : ""}
        `}
      </div>
    </div>
  `);

  const shipments: OrderShipment[] = logistics.shipments ?? [];
  const deliveryHtml = card("Consegna", `
    <div style="margin-bottom:8px;">
      <div class="label">Data Consegna Contrattuale</div>
      <div class="value" style="font-weight:600;">${logistics.contractualDeliveryDate ? fmtDate(logistics.contractualDeliveryDate) : "Non definita"}</div>
    </div>
    ${logistics.hasPenalties ? `
      <div style="background:#FFFBEB; border:1px solid #FDE68A; border-radius:6px; padding:8px 10px; margin-bottom:8px;">
        <div style="font-size:7.5pt; font-weight:700; color:#B45309; text-transform:uppercase; margin-bottom:2px;">⚠ Penali contrattuali</div>
        <div class="value">${esc(logistics.penaltiesDescription || "Sì")}</div>
      </div>
    ` : ""}
    ${shipments.length > 0 ? `
      <div style="border-top:1px solid #E5E7EB; padding-top:8px; margin-top:8px;">
        <div class="label" style="margin-bottom:6px;">Spedizioni Effettuate</div>
        <table class="items-table">
          <thead>
            <tr><th>Data</th><th>DDT</th><th>Descrizione</th></tr>
          </thead>
          <tbody>
            ${shipments.map(s => `
              <tr>
                <td style="white-space:nowrap;">${fmtDate(s.date)}</td>
                <td>${esc(s.ddtNumber)}</td>
                <td>${esc(s.description)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : ""}
  `);

  const phases: AssemblyPhase[] = logistics.phases ?? [];
  const phaseLabels: Record<string, string> = { mechanical: "Meccanico", electrical: "Elettrico", testing: "Collaudo" };
  const daysBreakdown = [
    ["Viaggio", pricing.travelDays],
    ["Montaggio Meccanico", pricing.mechanicalDays],
    ["Montaggio Elettrico", pricing.electricalDays],
    ["Collaudo", pricing.testingDays],
    ["Training", pricing.installTrainingDays],
  ].filter(([, v]) => (v as number ?? 0) > 0);

  const assemblyHtml = card("Montaggio", `
    <div class="grid-2" style="margin-bottom:8px;">
      <div>
        <div class="label">Data Inizio Montaggio (Contratto)</div>
        <div class="value" style="font-weight:600;">${logistics.contractualAssemblyStartDate ? fmtDate(logistics.contractualAssemblyStartDate) : "Non definita"}</div>
      </div>
      <div>
        <div class="label">Data Fine Collaudo (Contratto)</div>
        <div class="value" style="font-weight:600;">${logistics.contractualTestingEndDate ? fmtDate(logistics.contractualTestingEndDate) : "Non definita"}</div>
      </div>
    </div>

    <div style="border-top:1px solid #E5E7EB; padding-top:8px; margin-top:8px;">
      <div class="label" style="margin-bottom:6px;">Giorni di Montaggio Venduti</div>
      <div class="grid-2">
        <div class="info-box">
          <div class="label" style="margin-bottom:4px;">Suddivisione Giorni</div>
          <div style="font-size:11pt; font-weight:700;">${pricing.assemblySoldDays ?? 0} giorni totali</div>
          <div style="font-size:8pt; color:#6B7280;">Tariffa giornaliera: ${fmtCurrency(pricing.assemblyDailyRate ?? 0)}</div>
          ${daysBreakdown.length > 0 ? `
            <div style="border-top:1px solid #E5E7EB; margin-top:6px; padding-top:6px;">
              ${daysBreakdown.map(([label, val]) => `
                <div style="display:flex; justify-content:space-between; font-size:8pt; margin-bottom:2px;">
                  <span style="color:#6B7280;">${label}</span>
                  <span style="font-family:monospace; font-weight:600;">${val} gg</span>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>
        <div>
          <div class="info-box" style="margin-bottom:8px;">
            <div class="label" style="margin-bottom:2px;">Montaggio Puro</div>
            <div style="font-size:11pt; font-weight:700; font-family:monospace;">${fmtCurrency(pricing.assemblyPurePrice ?? 0)}</div>
            <div style="font-size:8pt; color:#6B7280;">${fmtCurrency(pricing.assemblyDailyRate ?? 0)} × ${pricing.assemblySoldDays ?? 0} giorni</div>
          </div>
          <div class="info-box">
            <div class="label" style="margin-bottom:2px;">Spese Viaggio & Servizi</div>
            <div style="font-size:11pt; font-weight:700; font-family:monospace;">${fmtCurrency(pricing.assemblyServicesCost ?? 0)}</div>
            <div style="display:flex; gap:6px; margin-top:4px; flex-wrap:wrap;">
              ${statusBadge(`Viaggi: ${pricing.travelIncluded ? "INCLUSI" : "ESCLUSI"}`, pricing.travelIncluded ? "green" : "red")}
              ${statusBadge(`Hotel: ${pricing.hotelIncluded ? "INCLUSO" : "ESCLUSO"}`, pricing.hotelIncluded ? "green" : "red")}
            </div>
            ${((pricing.rentalCarDailyFee ?? 0) > 0 || (pricing.flightTicketCost ?? 0) > 0) ? `
              <div style="border-top:1px solid #E5E7EB; margin-top:6px; padding-top:6px;">
                ${(pricing.rentalCarDailyFee ?? 0) > 0 ? `<div style="display:flex; justify-content:space-between; font-size:8pt;"><span style="color:#6B7280;">Rental Car</span><span style="font-family:monospace;">${fmtCurrency(pricing.rentalCarDailyFee ?? 0)} × ${pricing.rentalCarDays ?? 0} gg = ${fmtCurrency(pricing.rentalCarTotal ?? 0)}</span></div>` : ""}
                ${(pricing.flightTicketCost ?? 0) > 0 ? `<div style="display:flex; justify-content:space-between; font-size:8pt;"><span style="color:#6B7280;">Biglietto Aereo</span><span style="font-family:monospace;">${fmtCurrency(pricing.flightTicketCost ?? 0)}</span></div>` : ""}
              </div>
            ` : ""}
          </div>
        </div>
      </div>
      <div class="highlight-box" style="margin-top:8px; display:flex; align-items:center; gap:8px;">
        <span style="font-size:8pt; font-weight:700; color:#1D4ED8;">TOTALE MONTAGGIO VENDUTO:</span>
        <span style="font-size:10pt; font-weight:700; font-family:monospace; color:#1D4ED8;">${fmtCurrency(pricing.assemblyPrice)}</span>
      </div>
    </div>

    <div style="border-top:1px solid #E5E7EB; padding-top:8px; margin-top:8px;">
      <div class="label" style="margin-bottom:6px;">Fasi di Montaggio</div>
    ${phases.length > 0 ? `
        ${phases.map(phase => {
          const pct = phase.progressPercent ?? 0;
          const pctColor = pct >= 100 ? "#16A34A" : pct >= 50 ? "#2563EB" : pct > 0 ? "#D97706" : "#9CA3AF";
          return `
            <div class="phase-card">
              <div class="phase-header">
                ${statusBadge(phaseLabels[phase.phaseType] || phase.phaseType, phase.phaseType === "mechanical" ? "blue" : phase.phaseType === "electrical" ? "purple" : "gray")}
                ${pct > 0 ? `<span style="margin-left:auto; font-size:8pt; font-family:monospace; font-weight:700; color:${pctColor};">${pct}%</span>` : ""}
              </div>
              <div class="phase-body">
                <div class="grid-4">
                  ${field("Inizio", fmtDate(phase.startDate))}
                  ${field("Durata Prevista", phase.expectedDurationDays ? `${phase.expectedDurationDays} gg` : "")}
                  ${field("Fine", fmtDate(phase.endDate))}
                  ${field("Progresso", `${pct}%`)}
                </div>
                ${pct > 0 ? `
                  <div class="progress-bar" style="margin-top:6px;">
                    <div class="progress-fill" style="width:${Math.min(pct, 100)}%; background:${pctColor};"></div>
                  </div>
                ` : ""}
                ${phase.workers && phase.workers.length > 0 ? `
                  <div style="margin-top:6px;">
                    <div class="label">Personale</div>
                    <div class="value">${phase.workers.map(w => esc(w)).join(", ")}</div>
                  </div>
                ` : ""}
                ${phase.notes ? `
                  <div style="margin-top:4px;">
                    <div class="label">Note</div>
                    <div class="value" style="font-size:8.5pt;">${esc(phase.notes)}</div>
                  </div>
                ` : ""}
              </div>
            </div>
          `;
        }).join("")}
    ` : `<div class="value" style="color:#9CA3AF; font-size:8.5pt;">Nessuna fase registrata.</div>`}
    </div>
  `);

  const paymentBlock = card("Condizioni di Pagamento", `
    ${payments.length > 0 ? payments.map((p, i) => `
      <div class="${p.paid ? "payment-paid" : "payment-row"}">
        <span style="flex-shrink:0; font-size:10pt; color:${p.paid ? "#16A34A" : "#D1D5DB"};">${p.paid ? "●" : "○"}</span>
        <span class="value" style="${p.paid ? "font-weight:600; color:#166534;" : ""} flex:1;">${i + 1}. ${esc(p.condition || "—")}</span>
        ${p.paid && p.paidDate ? `<span style="font-size:7.5pt; font-family:monospace; color:#16A34A; font-weight:600; flex-shrink:0;">${fmtDate(p.paidDate)}</span>` : ""}
      </div>
    `).join("") : `<div class="value" style="color:#6B7280;">Nessuna condizione inserita.</div>`}
    ${bankName ? `<div style="margin-top:6px;"><div class="label">Banca</div><div class="value">${esc(bankName)}</div></div>` : ""}
  `);

  const totalInvoiced = invoicing.reduce((s, e) => s + (e.amount || 0), 0);
  const orderTotal = pricing.totalOrderPrice || 0;
  const invoicePct = orderTotal > 0 ? Math.min(100, Math.round((totalInvoiced / orderTotal) * 100)) : 0;
  const invoicingHtml = card("Fatturazione Emessa", `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
      <div style="position:relative; width:40px; height:40px;">
        <svg viewBox="0 0 36 36" width="40" height="40">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#E5E7EB" stroke-width="3" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#3B82F6" stroke-width="3" stroke-dasharray="${invoicePct}, 100" stroke-linecap="round" />
        </svg>
        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:7pt; font-weight:700;">${invoicePct}%</div>
      </div>
      <div>
        <div class="value" style="font-weight:600;">${fmtCurrency(totalInvoiced)} / ${fmtCurrency(orderTotal)}</div>
        <div style="font-size:8pt; color:#6B7280;">${invoicePct}% fatturato</div>
      </div>
    </div>
    ${invoicing.length === 0 ? `<div class="value" style="color:#6B7280;">Nessuna fattura registrata.</div>` : `
      <table class="items-table">
        <thead>
          <tr><th>N. Fattura</th><th>Data</th><th style="text-align:right;">Importo</th><th>Note</th></tr>
        </thead>
        <tbody>
          ${invoicing.map(inv => `
            <tr>
              <td style="font-family:monospace; font-weight:600;">${esc(inv.invoiceNumber || "—")}</td>
              <td>${inv.date ? fmtDate(inv.date) : "—"}</td>
              <td style="text-align:right; font-family:monospace; font-weight:600;">${fmtCurrency(inv.amount)}</td>
              <td style="font-size:8pt; color:#6B7280;">${esc(inv.notes || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `}
  `);

  const labels = pricing.priceLabels ?? {};
  const priceOverviewHtml = card("Price Overview", `
    <table class="items-table">
      <tbody>
        ${items.map(it => {
          const opts = it.options ?? [];
          return `
            <tr style="border-bottom:1px dashed #E5E7EB;">
              <td style="padding:4px 6px; font-weight:600;">Pos. ${it.position}: ${esc(it.description)}</td>
              <td class="price">${fmtCurrency(it.unitPrice)}</td>
            </tr>
            ${opts.map(opt => `
              <tr>
                <td style="padding:2px 6px 2px 24px; font-size:8pt; color:#6B7280;">↳ ${esc(opt.name)}</td>
                <td class="price" style="font-size:8pt; color:#6B7280;">+${fmtCurrency(opt.price)}</td>
              </tr>
            `).join("")}
          `;
        }).join("")}

        ${(pricing.interlockingTotal ?? 0) > 0 ? `
          <tr style="border-bottom:1px dashed #E5E7EB;">
            <td style="padding:4px 6px;">Interlocking</td>
            <td class="price">${fmtCurrency(pricing.interlockingTotal)}</td>
          </tr>
        ` : ""}

        ${additional.filter(a => a.description !== "Interlocking").map(it => `
          <tr style="border-bottom:1px dashed #E5E7EB;">
            <td style="padding:4px 6px;">${esc(it.description)}</td>
            <td class="price">${fmtCurrency(it.unitPrice)}</td>
          </tr>
        `).join("")}

        <tr class="total-row">
          <td style="padding:6px;">${esc(labels.totalListPrice || "TOTAL LIST PRICE (ex works, installation excluded)")}</td>
          <td class="price">${fmtCurrency(pricing.totalListPrice)}</td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:10px;">
      <div class="label" style="margin-bottom:6px;">NET SERVICE PRICES</div>
      <table class="items-table">
        <tbody>
          <tr style="border-bottom:1px dashed #E5E7EB;">
            <td style="padding:4px 6px;">
              ${esc(labels.installation || "Installation and start-up")}
              ${(pricing.assemblySoldDays ?? 0) > 0 ? `<span style="font-size:7.5pt; color:#6B7280; margin-left:4px;">(${pricing.assemblySoldDays} days × ${fmtCurrency(pricing.assemblyDailyRate ?? 0)}/day)</span>` : ""}
            </td>
            <td class="price">${pricing.installationIncluded ? fmtCurrency(pricing.assemblyPrice) : "EXCLUDED"}</td>
          </tr>
          <tr style="border-bottom:1px dashed #E5E7EB;">
            <td style="padding:4px 6px;">${esc(labels.travelCosts || "Travel and flight costs for our engineers")}</td>
            <td class="price">${pricing.travelIncluded ? includedBadge(true, "travel") : fmtCurrency(0)}</td>
          </tr>
          <tr style="border-bottom:1px dashed #E5E7EB;">
            <td style="padding:4px 6px;">${esc(labels.boardLodging || "Board and lodging for the engineers")}</td>
            <td class="price">${pricing.hotelIncluded ? includedBadge(true, "hotel") : fmtCurrency(0)}</td>
          </tr>
          <tr style="border-bottom:1px dashed #E5E7EB;">
            <td style="padding:4px 6px;">
              ${esc(labels.training || "Training time after first start-up")}
              ${pricing.trainingDays ? `<span style="font-size:7.5pt; color:#6B7280; margin-left:4px;">(${pricing.trainingDays} days)</span>` : ""}
            </td>
            <td class="price">${pricing.trainingIncluded ? includedBadge(true, "training") : fmtCurrency(0)}</td>
          </tr>
          <tr style="border-bottom:1px dashed #E5E7EB;">
            <td style="padding:4px 6px;">${esc(labels.packaging || "Package where necessary")}</td>
            <td class="price">${pricing.packagingIncluded ? includedBadge(true, "packaging") : fmtCurrency(0)}</td>
          </tr>
          <tr style="border-bottom:1px dashed #E5E7EB;">
            <td style="padding:4px 6px;">${esc(labels.transport || "Transport")}</td>
            <td class="price">${(pricing.transportPrice ?? 0) > 0 ? fmtCurrency(pricing.transportPrice) : (pricing.transportIncluded ? includedBadge(true, "transport") : "EXCLUDED")}</td>
          </tr>
          <tr style="border-top:2px solid #1F2937; border-bottom:1px dashed #E5E7EB;">
            <td style="padding:6px; font-weight:700;">TOTAL GROSS PRICE</td>
            <td class="price" style="font-weight:700;">${fmtCurrency(pricing.grossTotal)}</td>
          </tr>
          ${(pricing.discountPercent ?? 0) > 0 ? `
            <tr style="border-bottom:1px dashed #E5E7EB;">
              <td style="padding:4px 6px; color:#DC2626;">Sconto (${pricing.discountPercent}%)</td>
              <td class="price" style="color:#DC2626;">-${fmtCurrency(pricing.discountAmount)}</td>
            </tr>
          ` : ""}
          <tr style="border-top:2px solid #1D4ED8;">
            <td style="padding:6px; font-weight:700; color:#1D4ED8;">TOTAL NET PRICE</td>
            <td class="price" style="font-weight:700; color:#1D4ED8;">${fmtCurrency(pricing.netTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="grid-2" style="margin-top:8px; border-top:1px solid #E5E7EB; padding-top:8px;">
      ${field("Resa (Incoterms)", shipTerms.incoterms)}
      ${field("Imballo", shipTerms.packaging)}
    </div>
  `);

  const ltd: any = order.lineTechnicalData ?? {};
  const techSheetsHtml = sheets.length > 0 ? sheets.map((sheet: any, si: number) => {

    const machineImgUrl = sheet.machineImageUrl || "";
    const machineImgData = machineImgUrl ? getMachineImageBase64(machineImgUrl) : null;
    const machinePhotoHtml = machineImgData ? `
      <div style="margin-bottom:10px;">
        <img src="data:${machineImgData.mime};base64,${machineImgData.b64}" style="width:480px;max-width:100%;height:auto;max-height:300px;object-fit:contain;border-radius:6px;display:block;" />
      </div>` : "";

    const origDesc = (sheet.originalDescription ?? "").replace(/\r\n/g, "\n");
    const currDesc = (sheet.currentDescription ?? "").replace(/\r\n/g, "\n");
    const isModified = origDesc !== "" && origDesc !== currDesc;
    const hasContent = !!currDesc.trim() || (isModified && !!origDesc.trim());
    const descriptionHtml = hasContent ? (() => {
      const badge = sheet.isCustomMachine
        ? `<span style="display:inline-block;font-size:7pt;font-weight:600;padding:1px 6px;border-radius:3px;background:#F3E8FF;color:#7C3AED;border:1px solid #C4B5FD;margin-left:8px;">Speciale</span>`
        : isModified
        ? `<span style="display:inline-block;font-size:7pt;font-weight:600;padding:1px 6px;border-radius:3px;background:#FFFBEB;color:#B45309;border:1px solid #FCD34D;margin-left:8px;">Modificata</span>`
        : "";
      const descContent = isModified
        ? renderDescriptionDiffHtml(origDesc, currDesc)
        : renderDescriptionWithImages(currDesc);
      return `
        <div style="margin-bottom:10px;">
          <div class="tech-section-title" style="margin-top:0;">Descrizione${badge}</div>
          ${descContent}
        </div>`;
    })() : "";

    return `
      ${si > 0 ? '<div class="page-break"></div>' : ""}
      <div class="section" style="margin-top:0;">
        <div class="tech-header">Pos. ${sheet.machinePosition} — ${esc(sheet.machineName)}</div>
        <div class="tech-body">
          ${machinePhotoHtml}
          ${descriptionHtml}

          ${sheet.optionals && sheet.optionals.length > 0 ? `
            <div class="tech-section-title">Optionals Richiesti</div>
            <ol class="opt-list">
              ${sheet.optionals.map((o: string) => `<li>${esc(o)}</li>`).join("")}
            </ol>
          ` : ""}

          ${sheet.spareParts && sheet.spareParts.length > 0 ? `
            <div class="tech-section-title">Ricambi Richiesti</div>
            <ol class="opt-list">
              ${sheet.spareParts.map((s: any) => `<li>${esc(typeof s === "string" ? s : s.description || "")}</li>`).join("")}
            </ol>
          ` : ""}

          ${Object.keys(sheet.lamps ?? {}).length > 0 ? `
            <div class="tech-section-title">Lampade</div>
            <div class="grid-4">
              ${Object.entries(sheet.lamps).map(([k, v]) => `<div><div class="label">${esc(k)}</div><div class="value">${esc(v)}</div></div>`).join("")}
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }).join("") : "";

  const dash = "—";
  const tv = (v: any) => (v && String(v).trim()) ? esc(String(v)) : dash;

  const projectFields: [string, string][] = [
    ["Min/Max. Lunghezza (mm)", tv(ltd.minMaxLength)],
    ["Max. Larghezza (mm)", tv(ltd.workingWidth)],
    ["Min/Max. Spessore (mm)", tv(ltd.minMaxThickness)],
    ["Velocità Media Linea (mt/min)", tv(ltd.workingSpeed)],
    ["Lato Comandi", tv(ltd.controlSide)],
    ["Max. Arco Pannello", tv(ltd.maxBow)],
    ["Verniciatura", tv(ltd.paint)],
    ["Substrato", tv(ltd.substrate)],
    ["Livello Finitura", tv(ltd.finishing)],
  ];

  const energyFields: [string, string][] = [
    ["Energia per Riscaldamento", tv(ltd.energySources?.heating)],
    ["Aliment. Elettrica", tv(ltd.energySources?.electrical)],
    ["Aliment. Pneumatica", tv(ltd.energySources?.pneumatic)],
  ];

  const perfFields: [string, string][] = [
    ["Velocità m/1'", tv(ltd.performance?.speed)],
    ["Turni Lavoro", tv(ltd.performance?.shifts)],
    ["Dim. Minime Pezzi mm", tv(ltd.performance?.minPieceDimensions)],
    ["Dim. Massime Pezzi mm", tv(ltd.performance?.maxPieceDimensions)],
    ["Peso Massimo KG", tv(ltd.performance?.maxPieceWeight)],
  ];

  const autoFields: [string, string][] = [
    ["Automatismi", tv(ltd.automations?.requested)],
    ["Controllo", tv(ltd.automations?.control)],
    ["Controllo Extra", tv(ltd.automations?.extraControl)],
  ];

  const commFields: [string, string][] = [
    ["Data Inizio Montaggio", tv(ltd.commissioning?.assemblyStartDate)],
    ["Data Inizio Produzione", tv(ltd.commissioning?.productionStartDate)],
    ["Cablaggi Elettrici", tv(ltd.commissioning?.electricalWiring)],
    ["Cavi Elettrici", tv(ltd.commissioning?.electricalCables)],
  ];

  const hasLineTechData = order.lineTechnicalData != null;
  const lineTechHtml = hasLineTechData ? card("Dati Tecnici Generali della Linea", `
    <div class="tech-section-title" style="margin-top:0;">Dati Progetto</div>
    <div class="grid-3">
      ${projectFields.map(([l, v]) => `<div><div class="label">${l}</div><div class="value">${v}</div></div>`).join("")}
    </div>
    <div class="tech-section-title">Fonti di Energia</div>
    <div class="grid-3">
      ${energyFields.map(([l, v]) => `<div><div class="label">${l}</div><div class="value">${v}</div></div>`).join("")}
    </div>
    <div class="tech-section-title">Prestazioni Richieste</div>
    <div class="grid-3">
      ${perfFields.map(([l, v]) => `<div><div class="label">${l}</div><div class="value">${v}</div></div>`).join("")}
    </div>
    <div class="tech-section-title">Automatismi Richiesti</div>
    <div class="grid-3">
      ${autoFields.map(([l, v]) => `<div><div class="label">${l}</div><div class="value">${v}</div></div>`).join("")}
    </div>
    <div class="tech-section-title">Montaggio e Messa in Funzione</div>
    <div class="grid-4">
      ${commFields.map(([l, v]) => `<div><div class="label">${l}</div><div class="value">${v}</div></div>`).join("")}
    </div>
  `) : "";

  const notesHtml = card("Note", `
    <div class="value" style="white-space:pre-wrap;">${order.notes ? esc(order.notes) : `<span style="color:#9CA3AF;">Nessuna nota.</span>`}</div>
  `);

  const productionHtml = items.length > 0 ? card("Avanzamento Produzione", `
    ${items.map(item => {
      const entry = productionProgress.find(p => p.positionIndex === item.position);
      const pct = entry?.progressPercent ?? 0;
      const pctColor = pct >= 100 ? "#16A34A" : pct >= 50 ? "#2563EB" : pct > 0 ? "#D97706" : "#9CA3AF";
      return `
        <div style="border:1px solid #E5E7EB; border-radius:6px; padding:8px 10px; margin-bottom:6px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <div style="flex:1; min-width:0;">
              <div class="label">Pos. ${item.position}</div>
              <div class="value" style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(item.description || "—")}</div>
            </div>
            <span style="font-size:9pt; font-weight:700; font-family:monospace; color:${pctColor}; flex-shrink:0;">${pct}%</span>
          </div>
          <div class="progress-bar" style="margin-top:6px;">
            <div class="progress-fill" style="width:${Math.min(pct, 100)}%; background:${pctColor};"></div>
          </div>
          ${entry?.lastUpdatedByName ? `<div style="font-size:7pt; color:#9CA3AF; margin-top:4px;">Aggiornato da ${esc(entry.lastUpdatedByName)} — ${fmtDateTime(entry.lastUpdatedAt)}</div>` : ""}
          ${entry?.notes ? `<div style="font-size:8pt; color:#6B7280; margin-top:3px; font-style:italic;">Note: ${esc(entry.notes)}</div>` : ""}
        </div>
      `;
    }).join("")}
  `) : "";

  const versionsHtml = versions && versions.length > 0 ? card("Storico Versioni", `
    ${versions.map((v: any) => {
      const isCurrent = v.isCurrent;
      const changeSummary: string[] = v.changeSummary ?? [];
      return `
        <div class="version-row ${isCurrent ? "version-current" : ""}">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="version-badge" style="background:${isCurrent ? "#3B82F6" : "#F3F4F6"}; color:${isCurrent ? "#FFFFFF" : "#374151"};">
              v${displayVersion(v.versionNumber)}${isCurrent ? " — Attuale" : ""}
            </span>
            <div style="flex:1; min-width:0;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:8.5pt; font-weight:600;">${esc(v.modifiedByName || "—")}</span>
                <span style="font-size:7.5pt; color:#6B7280;">${fmtDateTime(v.createdAt)}</span>
              </div>
              ${isCurrent
                ? `<div style="font-size:7.5pt; color:#6B7280; margin-top:2px;">Stato corrente della commessa</div>`
                : v.changeNotes ? `<div style="font-size:7.5pt; color:#6B7280; margin-top:2px;">${esc(v.changeNotes)}</div>` : ""
              }
            </div>
          </div>
          ${changeSummary.length > 0 ? `
            <div style="margin-top:6px; margin-left:16px;">
              ${changeSummary.map(c => `
                <div style="font-size:7.5pt; color:#6B7280; display:flex; align-items:flex-start; gap:4px; margin-bottom:1px;">
                  <span style="color:#3B82F6; margin-top:1px; flex-shrink:0;">•</span>
                  <span>${esc(c)}</span>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>
      `;
    }).join("")}
  `) : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${css}</style></head>
<body>
  ${show("header") ? headerRow : ""}
  ${show("confirmation") ? confirmationHtml : ""}
  ${show("versions") && versionsHtml ? versionsHtml : ""}
  ${show("timeline") ? timelineHtml : ""}
  ${show("overview") ? overviewHtml : ""}
  ${show("addresses") ? addressBlock : ""}
  ${show("delivery") ? deliveryHtml : ""}
  ${show("assembly") ? assemblyHtml : ""}
  ${show("payments") ? paymentBlock : ""}
  ${show("invoicing") ? invoicingHtml : ""}
  ${show("priceOverview") ? priceOverviewHtml : ""}
  ${(show("techSheets") || show("techData")) ? `<div class="page-break"></div>${show("techData") ? lineTechHtml : ""}${show("techSheets") ? techSheetsHtml : ""}` : ""}
  ${show("notes") ? notesHtml : ""}
  ${show("production") ? productionHtml : ""}
</body>
</html>`;
}

export async function generateOrderPdf(order: any, versions?: any[], options?: OrderPdfOptions): Promise<Buffer> {
  const html = buildOrderHtml(order, versions, options);
  const logoBase64 = getLogoBase64();

  const detectLogoMime = (b64: string): string => {
    const head = Buffer.from(b64.slice(0, 16), "base64");
    if (head[0] === 0xFF && head[1] === 0xD8) return "image/jpeg";
    return "image/png";
  };
  const logoMime = logoBase64 ? detectLogoMime(logoBase64) : "image/png";
  const logoImgHtml = logoBase64
    ? `<img src="data:${logoMime};base64,${logoBase64}" style="height:36px;object-fit:contain;" />`
    : ``;

  const headerTemplate = `
    <div style="width:100%;padding:7px 14mm 7px 14mm;display:flex;align-items:center;justify-content:space-between;font-family:Arial,sans-serif;box-sizing:border-box;">
      <div style="display:flex;align-items:center;">${logoImgHtml}</div>
      <div style="text-align:right;">
        <div style="font-weight:700;font-size:9pt;color:#111827;">${esc(order.jobNumber)}</div>
        <div style="font-size:7.5pt;color:#9CA3AF;">${fmtDate(order.createdAt)}</div>
      </div>
    </div>`;

  const footerTemplate = `
    <div style="width:100%;padding:6px 14mm 4px 14mm;font-family:Arial,sans-serif;box-sizing:border-box;">
      <div style="display:flex;align-items:flex-start;justify-content:flex-end;">
        <div style="font-size:7.5pt;color:#6B7280;white-space:nowrap;padding-top:3px;">
          Pag. <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      </div>
    </div>`;

  const browser = await puppeteer.launch({
    executablePath: getChromiumPath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1122, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: { top: "26mm", bottom: "31mm", left: "14mm", right: "14mm" },
    });

    let finalBuffer = Buffer.from(pdfBuffer);

    const shouldMergeLayout = options?.mergeLayout !== false;
    if (shouldMergeLayout && order.layoutPdfFilename) {
      const layoutPath = path.join(process.cwd(), "server/assets/order-layouts", order.layoutPdfFilename);
      if (fs.existsSync(layoutPath)) {
        try {
          const mainDoc = await PDFDocument.load(finalBuffer);
          const drawingDoc = await PDFDocument.load(fs.readFileSync(layoutPath));
          const copiedPages = await mainDoc.copyPages(drawingDoc, drawingDoc.getPageIndices());
          for (const pg of copiedPages) mainDoc.addPage(pg);
          finalBuffer = Buffer.from(await mainDoc.save());
        } catch {}
      }
    }

    if (options?.mergeDocuments) {
      const { db, eq } = await import("./repositories/base");
      const { jobOrderDocuments } = await import("@shared/schema");
      const docs = await db.select().from(jobOrderDocuments).where(eq(jobOrderDocuments.jobOrderId, order.id));
      const docDir = path.join(process.cwd(), "server/assets/order-documents");
      for (const doc of docs) {
        if (!doc.filename) continue;
        const mime = (doc.mimeType ?? "").toLowerCase();
        if (mime !== "application/pdf" && !doc.filename.toLowerCase().endsWith(".pdf")) continue;
        const docPath = path.join(docDir, doc.filename);
        if (!fs.existsSync(docPath)) continue;
        try {
          const mainDoc = await PDFDocument.load(finalBuffer);
          const attachDoc = await PDFDocument.load(fs.readFileSync(docPath));
          const copiedPages = await mainDoc.copyPages(attachDoc, attachDoc.getPageIndices());
          for (const pg of copiedPages) mainDoc.addPage(pg);
          finalBuffer = Buffer.from(await mainDoc.save());
        } catch {}
      }
    }

    return finalBuffer;
  } finally {
    await browser.close();
  }
}
