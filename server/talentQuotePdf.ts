import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { format as dfFormat } from "date-fns";
import { it } from "date-fns/locale";
import { talentQuoteRepository, computeItemTotal } from "./repositories/talentQuotes";
import { TALENT_DELIVERABLES } from "@shared/schema";

const TALENT_DELIVERABLE_LABELS_LOCAL: Record<string, string> = {
  post: "Post",
  reel: "Reel",
  story: "Story",
  video: "Video",
  event: "Evento",
};

function getChromiumPath(): string {
  try { return execSync("which chromium", { encoding: "utf-8" }).trim(); } catch { return "/usr/bin/chromium"; }
}

const HEADER_LOGO_PATH = path.join(process.cwd(), "server/assets/header-logo.png");
const LOGO_PATH = path.join(process.cwd(), "server/assets/logo.png");

function getLogoBase64(): string {
  try {
    if (fs.existsSync(HEADER_LOGO_PATH)) return fs.readFileSync(HEADER_LOGO_PATH).toString("base64");
    if (fs.existsSync(LOGO_PATH)) return fs.readFileSync(LOGO_PATH).toString("base64");
  } catch {}
  return "";
}

function esc(s: any): string {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtMoney(n: number): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dfFormat(dt, "dd MMM yyyy", { locale: it });
}

export async function generateTalentQuotePdf(quoteId: number, companyId?: number): Promise<{ buffer: Buffer; filename: string }> {
  const quote = await talentQuoteRepository.getById(quoteId, companyId);
  if (!quote) throw new Error("Preventivo non trovato");

  const logo = getLogoBase64();
  const logoTag = logo ? `<img src="data:image/png;base64,${logo}" style="height:42px"/>` : "";

  const itemsHtml = quote.items.map((it, idx) => {
    const total = computeItemTotal(it);
    const unit = parseFloat(String(it.unitPriceEur)) || 0;
    const disc = parseFloat(String(it.discountPct ?? 0)) || 0;
    return `
      <tr>
        <td style="text-align:center; padding:8px 6px;">${idx + 1}</td>
        <td style="padding:8px 6px;">
          <div style="font-weight:600;">${esc(it.talentName)}</div>
          <div style="color:#6B7280; font-size:9pt;">${esc(TALENT_DELIVERABLE_LABELS_LOCAL[it.deliverableType] ?? it.deliverableType)}</div>
          ${it.notes ? `<div style="color:#6B7280; font-size:8.5pt; margin-top:3px; white-space:pre-line;">${esc(it.notes)}</div>` : ""}
        </td>
        <td style="text-align:center; padding:8px 6px;">${it.quantity}</td>
        <td style="text-align:right; padding:8px 6px;">€ ${fmtMoney(unit)}</td>
        <td style="text-align:right; padding:8px 6px;">${disc > 0 ? `${disc.toFixed(0)}%` : "—"}</td>
        <td style="text-align:right; padding:8px 6px; font-weight:600;">€ ${fmtMoney(total)}</td>
      </tr>
    `;
  }).join("");

  const total = parseFloat(String(quote.totalEur)) || 0;

  const html = `<!doctype html>
  <html><head><meta charset="utf-8"/>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size:10pt; color:#111827; margin:0; padding:0; }
    h1 { font-size:18pt; margin:0 0 4px; }
    .muted { color:#6B7280; }
    .card { background:#F9FAFB; border:1px solid #E5E7EB; border-radius:8px; padding:14px 16px; margin-bottom:14px; }
    .grid-2 { display:grid; grid-template-columns: 1fr 1fr; gap:14px; }
    .label { font-size:7.5pt; color:#6B7280; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px; }
    table.items { width:100%; border-collapse:collapse; font-size:9.5pt; }
    table.items th { background:#F3F4F6; text-align:left; padding:8px 6px; font-weight:600; border-bottom:1px solid #E5E7EB; }
    table.items td { border-bottom:1px solid #F3F4F6; vertical-align:top; }
    .total-row { background:#111827; color:#fff; font-weight:700; font-size:11pt; }
    .total-row td { padding:10px 8px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px; padding-bottom:14px; border-bottom:2px solid #111827; }
    .ref-box { background:#111827; color:#fff; border-radius:6px; padding:8px 14px; font-weight:700; }
    .footer { color:#6B7280; font-size:8pt; margin-top:24px; padding-top:12px; border-top:1px solid #E5E7EB; }
  </style>
  </head><body>
    <div class="header">
      <div>
        ${logoTag}
        <h1 style="margin-top:8px;">Preventivo</h1>
        <div class="muted">${esc(quote.subject)}</div>
      </div>
      <div style="text-align:right;">
        <div class="ref-box">${esc(quote.referenceNumber)}</div>
        <div class="muted" style="margin-top:6px;">Data: ${fmtDate(quote.date)}</div>
        ${quote.validUntil ? `<div class="muted">Valido fino a: ${fmtDate(quote.validUntil)}</div>` : ""}
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="label">Brand</div>
        <div style="font-weight:600; font-size:11pt;">${esc(quote.brandName ?? "—")}</div>
        ${quote.brandContactName ? `<div class="muted">Referente: ${esc(quote.brandContactName)}</div>` : ""}
      </div>
      <div class="card">
        <div class="label">Riferimento</div>
        <div>${esc(quote.referenceNumber)}</div>
        <div class="muted">Stato: ${esc(quote.status)}</div>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th style="width:32px; text-align:center;">#</th>
          <th>Talent / Deliverable</th>
          <th style="width:60px; text-align:center;">Qtà</th>
          <th style="width:100px; text-align:right;">Prezzo unit.</th>
          <th style="width:60px; text-align:right;">Sconto</th>
          <th style="width:110px; text-align:right;">Totale</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml || `<tr><td colspan="6" style="text-align:center; padding:24px; color:#9CA3AF;">Nessun deliverable</td></tr>`}
        <tr class="total-row">
          <td colspan="5" style="text-align:right;">TOTALE</td>
          <td style="text-align:right;">€ ${fmtMoney(total)}</td>
        </tr>
      </tbody>
    </table>

    ${quote.paymentTerms ? `<div class="card" style="margin-top:14px;"><div class="label">Termini di pagamento</div><div style="white-space:pre-line;">${esc(quote.paymentTerms)}</div></div>` : ""}
    ${quote.notes ? `<div class="card"><div class="label">Note</div><div style="white-space:pre-line;">${esc(quote.notes)}</div></div>` : ""}

    <div class="footer">
      Documento generato il ${fmtDate(new Date())} — Talent Studio
    </div>
  </body></html>`;

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
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
    return {
      buffer: Buffer.from(pdf),
      filename: `Preventivo_${quote.referenceNumber}.pdf`,
    };
  } finally {
    await browser.close();
  }
}
