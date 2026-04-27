import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { format as dateFormat } from "date-fns";
import { PDFDocument } from "pdf-lib";
import { tOffer, normalizeOfferLang } from "../shared/i18n/offerLabels";
import { displayVersion } from "../shared/version";

function getChromiumPath(): string {
  try {
    return execSync("which chromium", { encoding: "utf-8" }).trim();
  } catch {
    return "/usr/bin/chromium";
  }
}

const LOGO_PATH        = path.join(process.cwd(), "server/assets/logo.png");
const HEADER_LOGO_PATH = path.join(process.cwd(), "server/assets/header-logo.png");
const FONTS_DIR        = path.join(process.cwd(), "server/assets/fonts");
const MACHINE_IMG_DIR  = path.join(process.cwd(), "server/assets/machine-images");

function getMachineImageBase64(filename: string): { b64: string; mime: string } | null {
  if (!filename) return null;
  try {
    const baseName = filename.toLowerCase();
    const hasExt = !!path.extname(baseName);
    const exts: Array<[string, string]> = [["png","image/png"],["jpg","image/jpeg"],["jpeg","image/jpeg"],["webp","image/webp"]];
    if (hasExt) {
      const fp = path.join(MACHINE_IMG_DIR, baseName);
      if (fs.existsSync(fp)) {
        const ext = path.extname(baseName).slice(1).toLowerCase();
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
        return { b64: fs.readFileSync(fp).toString("base64"), mime };
      }
    } else {
      for (const [ext, mime] of exts) {
        const fp = path.join(MACHINE_IMG_DIR, `${baseName}.${ext}`);
        if (fs.existsSync(fp)) return { b64: fs.readFileSync(fp).toString("base64"), mime };
      }
    }
  } catch {}
  return null;
}

function getFontBase64(filename: string): string {
  try {
    const p = path.join(FONTS_DIR, filename);
    if (fs.existsSync(p)) return fs.readFileSync(p).toString("base64");
  } catch {}
  return "";
}

function esc(s: any): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toNum(v: any): number {
  return parseFloat(String(v ?? "0")) || 0;
}

function fmtMoney(n: number): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function getLogoBase64(): string {
  try {
    if (fs.existsSync(HEADER_LOGO_PATH)) {
      return fs.readFileSync(HEADER_LOGO_PATH).toString("base64");
    }
    if (fs.existsSync(LOGO_PATH)) {
      return fs.readFileSync(LOGO_PATH).toString("base64");
    }
  } catch {}
  return "";
}

export function buildOfferHtml(offer: any, formatSettings: any): string {
  const lang = normalizeOfferLang(offer.language);
  const outfit400b64 = getFontBase64("Outfit-400.ttf");
  const outfit600b64 = getFontBase64("Outfit-600.ttf");
  const outfit700b64 = getFontBase64("Outfit-700.ttf");

  const projectData = offer.projectData ?? {};
  const pricing = projectData.pricing ?? null;
  const technicalSpecs = projectData.technicalSpecs ?? null;
  const selectedPresets: any[] = projectData.selectedPresets ?? [];
  const deliveryMode: string = projectData.deliveryMode ?? "days";
  const deliveryDays: string = projectData.deliveryDays ?? "";
  const deliveryDescription: string = projectData.deliveryDescription ?? "";
  const deliveryDate: string = projectData.deliveryDate ?? "";
  const deliveryTerms: string = projectData.deliveryTerms ?? (deliveryMode === "days" ? `${deliveryDays} ${tOffer("days", lang)} ${deliveryDescription}`.trim() : deliveryDate);
  const paymentMode: string = projectData.paymentMode ?? "percentage";
  const paymentSchedule: any[] = projectData.paymentSchedule ?? [];
  const headerInfo = projectData.headerInfo ?? {};

  const rawSections: any[] = formatSettings?.sections ?? [];
  const perOfferHidden: string[] = projectData.hiddenSections ?? [];
  const perOfferOrder: string[] | undefined = projectData.sectionOrder?.length ? projectData.sectionOrder : undefined;
  const perOfferBreaks: string[] | undefined = projectData.pageBreaks;
  const enabledSections = rawSections.filter((s: any) => s.enabled && !perOfferHidden.includes(s.id));
  const orderedSections = perOfferOrder
    ? perOfferOrder.map((id: string) => enabledSections.find((s: any) => s.id === id)).filter(Boolean)
    : enabledSections;
  const pageBackground = formatSettings?.pageBackground ?? "#F9FAFB";
  const globalBorderRadius = formatSettings?.borderRadius ?? 6;
  const globalBorderWidth  = formatSettings?.borderWidth  ?? 1;

  const offerDate = (() => {
    const src = headerInfo.date || offer.date;
    try { return dateFormat(new Date(src), "MMMM d, yyyy"); } catch { return String(src); }
  })();

  // Utilities totals
  const utils = (offer.items ?? []).reduce((acc: any, item: any) => {
    const qty = item.quantity ?? 1;
    acc.electricalPower += toNum(item.snapshotElectricalPower) * qty + (item.options ?? []).reduce((s: number, o: any) => s + toNum(o.snapshotElectricalPower) * (o.quantity ?? 1), 0);
    acc.compressedAir   += toNum(item.snapshotCompressedAir)   * qty + (item.options ?? []).reduce((s: number, o: any) => s + toNum(o.snapshotCompressedAir)   * (o.quantity ?? 1), 0);
    acc.exhaustedAir    += toNum(item.snapshotExhaustedAir)    * qty + (item.options ?? []).reduce((s: number, o: any) => s + toNum(o.snapshotExhaustedAir)    * (o.quantity ?? 1), 0);
    acc.airIntroduced   += toNum(item.snapshotAirIntroduced)   * qty + (item.options ?? []).reduce((s: number, o: any) => s + toNum(o.snapshotAirIntroduced)   * (o.quantity ?? 1), 0);
    acc.installationDays += toNum(item.snapshotInstallationDays) * qty;
    return acc;
  }, { electricalPower: 0, compressedAir: 0, exhaustedAir: 0, airIntroduced: 0, installationDays: 0 });

  // ── Section builders ──────────────────────────────────────────────────────

  function sectionStyle(sec: any, extra: Record<string, string> = {}): string {
    const bg      = sec?.fillColor   ?? "#FFFFFF";
    const border  = sec?.borderColor ?? "#E5E7EB";
    const color   = sec?.textColor   ?? "#1F2937";
    const font    = sec?.font        ?? "Outfit";
    const fs      = sec?.fontSize    ?? 11;
    const lh      = sec?.lineHeight  ?? 1.45;
    const align   = sec?.alignment === "justified" ? "justify" : (sec?.alignment ?? "left");
    const radius  = globalBorderRadius;
    const bwidth  = globalBorderWidth;
    const extras  = Object.entries(extra).map(([k, v]) => `${k}:${v}`).join(";");
    return `background:${bg};border:${bwidth}px solid ${border};border-radius:${radius}px;` +
           `color:${color};font-family:'${font}','Outfit',Arial,sans-serif;` +
           `font-size:${fs}pt;text-align:${align};line-height:${lh};` + extras;
  }

  function titleStyle(sec?: any): string {
    if (!sec) return "";
    const parts: string[] = [];
    if (sec.titleFont) parts.push(`font-family:'${sec.titleFont}','Outfit',Arial,sans-serif`);
    if (sec.titleFontSize) parts.push(`font-size:${sec.titleFontSize}pt`);
    if (sec.titleTextColor) parts.push(`color:${sec.titleTextColor}`);
    if (sec.titleFillColor) parts.push(`background:${sec.titleFillColor};padding:4px 8px;margin:-2px -4px 10px -4px;border-radius:3px 3px 0 0`);
    if (sec.titleAlignment && sec.titleAlignment !== "justified") parts.push(`text-align:${sec.titleAlignment}`);
    if (sec.titleBold === false) parts.push(`font-weight:normal`);
    return parts.join(";");
  }

  function sectionWrap(fallbackLabel: string, inner: string, sec?: any, extraClass = "", extraStyle = ""): string {
    const style = sectionStyle(sec) + extraStyle;
    const heading = (sec?.label ?? "").trim() || fallbackLabel;
    const tStyle = titleStyle(sec);
    return `<div class="section ${extraClass}" style="${style}"><div class="section-label"${tStyle ? ` style="${tStyle}"` : ""}>${heading}</div>${inner}</div>`;
  }

  function buildOfferTitle(sec?: any): string {
    if (!offer.subject) return "";
    const intro = sec?.labels?.intro;
    const introHtml = intro ? `<div style="margin-bottom:8px;line-height:1.5;">${esc(intro)}</div>` : "";
    const layoutVal = projectData.layout ?? "";

    const aStyle = partInlineStyle(sec, 'contentA');
    const bStyle = partInlineStyle(sec, 'contentB');
    const aEnabled = getPartStyle(sec, 'contentA').enabled;
    const bEnabled = getPartStyle(sec, 'contentB').enabled;

    const subjectHtml = aEnabled ? `<div class="offer-title-text" style="${aStyle}">${esc(offer.subject)}</div>` : "";
    const layoutHtml = (layoutVal && bEnabled) ? `<div style="${bStyle};margin-top:8px;"><strong>${esc(tOffer("layout", lang))}:</strong> ${esc(layoutVal)}</div>` : "";
    return sectionWrap(tOffer("offerTitle", lang), `${introHtml}${subjectHtml}${layoutHtml}${specRowsHtml(sec)}`, sec);
  }

  function getPartStyle(sec: any, partId: string): { fontSize: number; fontWeight: string; color: string; fontFamily: string; alignment: string; enabled: boolean } {
    const defaults: Record<string, { fontSize: number; fontWeight: string; color: string }> = {
      sectionTitle: { fontSize: 7.5, fontWeight: 'bold', color: '#9CA3AF' },
      boxTitle:     { fontSize: 7.5, fontWeight: 'bold', color: '#9CA3AF' },
      boxValue:     { fontSize: 14,  fontWeight: 'bold', color: '#111827' },
      unit:         { fontSize: 10,  fontWeight: 'normal', color: '#9CA3AF' },
      contentA:     { fontSize: 11,  fontWeight: 'bold', color: '#111827' },
      contentB:     { fontSize: 8.5, fontWeight: 'normal', color: '#6B7280' },
      contentC:     { fontSize: 9.5, fontWeight: 'normal', color: '#374151' },
      machineName:  { fontSize: 11,  fontWeight: 'bold', color: '#1F2937' },
      machinePrice: { fontSize: 11,  fontWeight: 'bold', color: '#1F2937' },
      optionName:   { fontSize: 9,   fontWeight: 'normal', color: '#6B7280' },
      optionPrice:  { fontSize: 9,   fontWeight: 'normal', color: '#6B7280' },
      totalList:    { fontSize: 11,  fontWeight: 'bold', color: '#1F2937' },
      servicesTitle:{ fontSize: 9,   fontWeight: 'bold', color: '#9CA3AF' },
      serviceName:  { fontSize: 10,  fontWeight: 'normal', color: '#1F2937' },
      servicePrice: { fontSize: 10,  fontWeight: 'normal', color: '#1F2937' },
      discount:     { fontSize: 10,  fontWeight: 'normal', color: '#DC2626' },
      totalGross:   { fontSize: 13,  fontWeight: 'bold', color: '#1F2937' },
      totalNet:     { fontSize: 13,  fontWeight: 'bold', color: '#2563EB' },
    };
    const fallback = defaults[partId] ?? defaults.contentB;
    const parts: any[] = sec?.parts ?? [];
    let part = parts.find((p: any) => p.id === partId);
    if (!part && partId === 'detailRows') {
      return getPartStyle(sec, 'contentA');
    }
    if (!part && (partId === 'contentA' || partId === 'contentB')) {
      part = parts.find((p: any) => p.id === 'detailRows');
    }
    const rawFont = part?.fontFamily;
    const fontFamily = (rawFont && rawFont !== 'inherit') ? rawFont : (sec?.font || 'Outfit');
    const alignment = part?.alignment ?? sec?.alignment ?? 'left';
    return {
      fontSize:   part?.fontSize   ?? fallback.fontSize,
      fontWeight: part?.fontWeight === 'bold' ? '700' : (part?.fontWeight === 'normal' ? '400' : (fallback.fontWeight === 'bold' ? '700' : '400')),
      color:      part?.color      ?? fallback.color,
      fontFamily,
      alignment:  alignment === 'justified' ? 'justify' : alignment,
      enabled:    part?.enabled !== false,
    };
  }

  function partInlineStyle(sec: any, partId: string): string {
    const s = getPartStyle(sec, partId);
    return `font-size:${s.fontSize}pt;font-weight:${s.fontWeight};color:${s.color};font-family:'${s.fontFamily}','Outfit',Arial,sans-serif;text-align:${s.alignment};`;
  }

  function buildMetadata(sec?: any): string {
    const customer = offer.customer ?? {};
    const lbl = (key: string, fallback: string) => sec?.labels?.[key] || tOffer(key, lang) || fallback;
    const cardGrid = (heading: string, inner: string) => {
      const style = sectionStyle(sec) + "margin-bottom:0;height:100%;box-sizing:border-box;";
      const tStyle = titleStyle(sec);
      const labelHtml = `<div class="section-label"${tStyle ? ` style="${tStyle}"` : ""}>${heading}</div>`;
      return `<div class="section" style="${style}">${labelHtml}${inner}</div>`;
    };
    const salesmanName   = headerInfo.salesman?.name   || offer.salesmanName   || "";
    const salesmanEmail  = headerInfo.salesman?.email  || offer.salesmanEmail  || "";
    const salesmanMobile = headerInfo.salesman?.mobile || offer.salesmanMobile || "";
    const custName    = headerInfo.customer?.name          || customer.name          || "";
    const custContact = headerInfo.customer?.contactPerson || customer.contactPerson || "";
    const custEmail   = headerInfo.customer?.email         || customer.email         || "";
    const custAddress = headerInfo.customer?.address       || customer.address       || "";

    const aStyle = partInlineStyle(sec, 'contentA');
    const bStyle = partInlineStyle(sec, 'contentB');
    const aEnabled = getPartStyle(sec, 'contentA').enabled;
    const bEnabled = getPartStyle(sec, 'contentB').enabled;

    const metaA = (text: string) => aEnabled ? `<div style="${aStyle}">${esc(text)}</div>` : "";
    const metaB = (text: string) => text && bEnabled ? `<div style="${bStyle};margin-top:2px;">${esc(text)}</div>` : "";

    return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;align-items:stretch;">
      <div style="min-width:0;">${cardGrid(lbl("dateBox", "DATE"), `
        ${metaA(offerDate)}
        ${metaB(`${lbl("refPrefix","Ref.")} ${offer.referenceNumber}${offer.version && offer.version > 1 && !offer.projectData?.dealerVersionOf ? `  V${displayVersion(offer.version)}` : ""}`)}
      `)}</div>
      <div style="min-width:0;">${cardGrid(lbl("salesmanBox", "SALESMAN"), `
        ${metaA(salesmanName)}
        ${metaB(salesmanEmail)}
        ${metaB(salesmanMobile)}
      `)}</div>
      <div style="min-width:0;">${cardGrid(lbl("customerBox", "CUSTOMER"), `
        ${metaA(custName)}
        ${metaB(custContact)}
        ${metaB(custEmail)}
        ${metaB(custAddress)}
      `)}</div>
    </div>${specRowsHtml(sec)}`;
  }

  function buildMachineLine(sec?: any): string {
    const items: any[] = offer.items ?? [];
    const machineBreakPositions: number[] = projectData.machineBreakPositions ?? [];
    const mlLbl = (key: string, fallback: string) => sec?.labels?.[key] || tOffer(key, lang) || fallback;

    const contentAStyle = partInlineStyle(sec, 'contentA');
    const contentBStyle = partInlineStyle(sec, 'contentB');
    const contentCStyle = partInlineStyle(sec, 'contentC');

    return items.map((item: any, index: number) => {
      const optsList = (item.options ?? []).length > 0 ? `
        <div style="margin-top:10px;">
          <div style="${contentBStyle};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">${mlLbl("includedOptions", "Included Options")}</div>
          ${(item.options ?? []).map((opt: any) => {
            const optQty = opt.quantity ?? 1;
            return `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:2px;">
              <span style="color:#9CA3AF;font-size:9pt;flex-shrink:0;">${esc(mlLbl("optionBullet","›"))}</span>
              <span style="${contentCStyle}">${esc(opt.snapshotOptionName)}${optQty > 1 ? ` <span class="qty-tag">×${optQty}</span>` : ""}</span>
            </div>`;
          }).join("")}
        </div>` : "";

      const imgData = item.snapshotImageUrl ? getMachineImageBase64(item.snapshotImageUrl) : null;
      const imageHtml = imgData ? `
        <div style="margin-bottom:14px;">
          <img src="data:${imgData.mime};base64,${imgData.b64}" style="width:480px;max-width:100%;height:auto;max-height:360px;object-fit:contain;border-radius:6px;display:block;" />
        </div>` : "";

      const descHtml = item.snapshotMachineDescription ? (() => {
        const parts = (item.snapshotMachineDescription as string).split(/\[\[IMG:([^\]]+)\]\]/);
        const rendered = parts.map((p: string, pi: number) => {
          if (pi % 2 === 0) {
            return p.trim() ? `<div style="${contentAStyle};white-space:pre-wrap;width:100%;">${esc(p)}</div>` : "";
          }
          const dImg = getMachineImageBase64(p);
          return dImg ? `<div style="margin:8px 0;"><img src="data:${dImg.mime};base64,${dImg.b64}" style="width:480px;max-width:100%;height:auto;max-height:300px;object-fit:contain;border-radius:6px;display:block;" /></div>` : "";
        }).join("");
        return `<div style="margin-top:8px;">${rendered}</div>`;
      })() : "";

      const qtyBadge = (item.quantity ?? 1) > 1 ? ` ×${item.quantity}` : "";
      const typeBadge = item.snapshotMacroType ? ` — ${esc(item.snapshotMacroType)}` : "";

      const inner = `<div>
        ${imageHtml}
        ${descHtml}
        ${optsList}
      </div>`;

      const posPrefix = sec?.labels?.machinePosPrefix || tOffer("machinePosPrefix", lang) || "MACHINE \u2014 POS.";
      const machineName = esc(item.snapshotMachineName) + qtyBadge + typeBadge;
      const titleStr = `${posPrefix} ${item.position || index + 1} &nbsp;–&nbsp; ${machineName}`;
      const cardHtml = sectionWrap(titleStr, inner, { ...sec, label: "" }, "machine-card-wrapper");
      const needsBreak = machineBreakPositions.includes(index);
      return needsBreak ? `<div style="break-before:page;page-break-before:always;">${cardHtml}</div>` : cardHtml;
    }).join("\n") + specRowsHtml(sec);
  }

  function buildTechnicalSpecs(sec?: any): string {
    if (!technicalSpecs) return "";
    const tsLbl = (key: string, fallback: string) => sec?.labels?.[key] || tOffer(key, lang) || fallback;

    const stdDefaults: Record<string, string> = {
      standardVoltage: "Working tension 400V/50 Hz. Commands 24V. Max. allowed oscillation +/- 5%",
      standardColors: "Light Grey RAL 7035",
      components: "Prices are based on the use of our standard mechanical (Bonfiglioli), electrical and electronic (Schneider Telemecanique) components. Requests for other manufactures equipment to be supplied instead of our standard components can be evaluated for performance, reliability and any extra costs that may be incurred",
      precautions: "Do not place near the machine substances which may cause danger of inflammability. User must foresee an adequate technical ventilation in the working environment in order to prevent any risk of inflammability. User must verify that the zone in which the machine or installation will be positioned is right for the purpose.",
      airIntake: "Air intake is always considered with environmental temperature above +4 \u00B0C; in case of air intake from the outside of the work environment or temperatures below +4 \u00B0C, the user will have to foresee motorized shutters or request additional antifreeze systems, so as to prevent damage to the installation",
      commissioning: "For single machines shipped when already assembled, commissioning and start-up are carried out at our premises. For disassembled machines or groups of machines, start-up will be carried out after commissioning.",
    };
    const ts = (key: string) => technicalSpecs[key] || stdDefaults[key] || "";

    const perOffer: [string, string][] = [
      [tsLbl("minMaxLength",     "Min/Max. length (mm)"),    technicalSpecs.minMaxLength    || tsLbl("minMaxLengthVal",     "")],
      [tsLbl("maxWidth",         "Max. width (mm)"),          technicalSpecs.maxWidth         || tsLbl("maxWidthVal",         "")],
      [tsLbl("minMaxThickness",  "Min/Max. thickness (mm)"),  technicalSpecs.minMaxThickness  || tsLbl("minMaxThicknessVal",  "")],
      [tsLbl("averageLineSpeed", "Avg. line speed (mt/min)"), technicalSpecs.averageLineSpeed || tsLbl("averageLineSpeedVal", "")],
      [tsLbl("controlSide",      "Control side"),              technicalSpecs.controlSide      || tsLbl("controlSideVal",      "")],
      [tsLbl("maxBow",           "Max. bow of panel"),         technicalSpecs.maxBow           || tsLbl("maxBowVal",           "")],
      [tsLbl("paint",            "Paint"),                     technicalSpecs.paint    || tsLbl("paintVal",     "")],
      [tsLbl("substrate",        "Substrate"),                  technicalSpecs.substrate || tsLbl("substrateVal", "")],
      [tsLbl("finishing",        "Finishing"),                  technicalSpecs.finishing || tsLbl("finishingVal", "")],
    ].filter(([, v]) => v?.trim()) as [string, string][];

    const standard: [string, string][] = (sec?.specRows && sec.specRows.length > 0)
      ? (sec.specRows as { label: string; value: string }[])
          .filter(r => r.label?.trim() || r.value?.trim())
          .map(r => [r.label, r.value] as [string, string])
          .filter(([, v]) => v?.trim())
      : [
          [tsLbl("standardVoltage", "Standard voltage"), ts("standardVoltage") || tsLbl("standardVoltageVal", "")],
          [tsLbl("standardColors",  "Standard colors"),  ts("standardColors")  || tsLbl("standardColorsVal",  "")],
          [tsLbl("components",      "Components"),        ts("components")       || tsLbl("componentsVal",      "")],
          [tsLbl("precautions",     "Precautions"),       ts("precautions")      || tsLbl("precautionsVal",     "")],
          [tsLbl("airIntake",       "Air intake"),         ts("airIntake")        || tsLbl("airIntakeVal",        "")],
          [tsLbl("commissioning",   "Commissioning"),      ts("commissioning")    || tsLbl("commissioningVal",   "")],
        ].filter(([, v]) => v?.trim()) as [string, string][];

    const boxTitleStyle = partInlineStyle(sec, 'boxTitle');
    const boxValueStyle = partInlineStyle(sec, 'boxValue');
    const contentAStyle = partInlineStyle(sec, 'contentA');
    const contentBStyle = partInlineStyle(sec, 'contentB');

    const gridHtml = perOffer.length ? `
      <div class="specs-grid">
        ${perOffer.map(([l, v]) => `
          <div class="spec-box">
            <div class="spec-label" style="${boxTitleStyle};text-transform:uppercase;letter-spacing:0.05em;">${esc(l)}</div>
            <div class="spec-value" style="${boxValueStyle}">${esc(v)}</div>
          </div>`).join("")}
      </div>` : "";

    const listHtml = standard.length ? `
      <div class="std-specs${perOffer.length ? " std-specs-bordered" : ""}">
        ${standard.map(([l, v]) => `
          <div class="std-row">
            <span class="std-label" style="${contentAStyle}">${esc(l)}:</span>
            <span class="std-value" style="${contentBStyle}">${esc(v)}</span>
          </div>`).join("")}
      </div>` : "";

    const intro = sec?.labels?.intro;
    const introHtml = intro ? `<div style="margin-bottom:10px;line-height:1.5;">${esc(intro)}</div>` : "";
    return sectionWrap(tOffer("projectData", lang), introHtml + gridHtml + listHtml, sec);
  }

  function buildPriceOverview(sec?: any): string {
    if (!pricing) return "";
    const items: any[] = offer.items ?? [];
    const si = pricing.serviceItems ?? {};
    const ic = pricing.installationConfig ?? {};

    const ps = (id: string) => partInlineStyle(sec, id);
    const machineNameS = ps('machineName');
    const machinePriceS = ps('machinePrice');
    const optionNameS = ps('optionName');
    const optionPriceS = ps('optionPrice');
    const totalListS = ps('totalList');
    const servicesTitleS = ps('servicesTitle');
    const serviceNameS = ps('serviceName');
    const servicePriceS = ps('servicePrice');
    const discountS = ps('discount');
    const totalGrossS = ps('totalGross');
    const totalNetS = ps('totalNet');

    const showNetOnly = !!pricing.showNetOnly;
    const globalPct = Number(pricing.discountPercent ?? 0);
    const itemDiscountsArr: any[] = pricing.itemDiscounts ?? [];
    const effPct = (override: any, isNet: any): number => {
      if (isNet) return 0;
      const p = override != null ? Number(override) : globalPct;
      return p > 0 ? p : 0;
    };
    const applyNet = (subtotal: number, override: any, isNet: any): number =>
      subtotal * (1 - effPct(override, isNet) / 100);

    const itemRows = items.map((item: any, index: number) => {
      const base = toNum(item.snapshotBasePrice);
      const machineQty = item.quantity ?? 1;
      const hiddenMap = pricing?.itemComments?.[index]?.optionPriceHidden;
      const lineCfg = itemDiscountsArr[index] ?? {};
      const hiddenUnitTotal = (item.options ?? []).reduce((s: number, opt: any) => {
        if (!hiddenMap?.[opt.machineOptionId]) return s;
        return s + toNum(opt.snapshotPriceModifier) * (opt.quantity ?? 1);
      }, 0);
      const displayedUnit = base + hiddenUnitTotal;
      const machineGross = displayedUnit * machineQty;
      const machineShown = showNetOnly
        ? applyNet(machineGross, lineCfg?.discountOverridePercent ?? null, lineCfg?.isNet ?? false)
        : machineGross;
      const optRows = (item.options ?? []).map((opt: any) => {
        const optQty = opt.quantity ?? 1;
        const optPrice = toNum(opt.snapshotPriceModifier);
        const isHidden = hiddenMap?.[opt.machineOptionId];
        const totalOptPrice = optPrice * optQty * machineQty;
        const optCfg = lineCfg?.optionDiscounts?.[opt.machineOptionId];
        const optShown = showNetOnly
          ? applyNet(totalOptPrice, optCfg?.discountOverridePercent ?? null, optCfg?.isNet ?? false)
          : totalOptPrice;
        const label = `${esc(opt.snapshotOptionName)}${optQty > 1 ? ` ×${optQty}` : ""}${machineQty > 1 ? ` (×${machineQty})` : ""}`;
        const optNetBadge = optCfg?.isNet ? ` <span style="display:inline-block;font-size:8px;font-weight:700;padding:1px 4px;border:1px solid #FCD34D;background:#FEF3C7;color:#92400E;border-radius:3px;vertical-align:middle;">NETTO</span>` : "";
        return `<tr class="opt-row">
          <td style="padding-left:24px;${optionNameS}">&#8627; ${label}${optNetBadge}</td>
          <td class="money-cell" style="${optionPriceS}">${isHidden ? tOffer("incl", lang) : `+€${fmtMoney(optShown)}`}</td>
        </tr>`;
      }).join("");
      const machineNetBadge = lineCfg?.isNet ? ` <span style="display:inline-block;font-size:8px;font-weight:700;padding:1px 4px;border:1px solid #FCD34D;background:#FEF3C7;color:#92400E;border-radius:3px;vertical-align:middle;">NETTO</span>` : "";
      return `<tr>
        <td style="${machineNameS}">${esc(tOffer("positionPrefix", lang))}&nbsp;${item.position || index + 1}: ${esc(item.snapshotMachineName)}${machineQty > 1 ? ` ×${machineQty}` : ""}${machineNetBadge}</td>
        <td class="money-cell" style="${machinePriceS}">€${fmtMoney(machineShown)}</td>
      </tr>${optRows}`;
    }).join("");

    const secLbls = sec?.labels ?? {};
    const pl = {
      interlocking:    secLbls.interlocking    || tOffer("interlocking",   lang),
      totalListPrice:  secLbls.totalListPrice  || tOffer("totalListPrice", lang),
      installation:    secLbls.installation    || tOffer("installation",   lang),
      travelCosts:     secLbls.travelCosts     || tOffer("travelCosts",    lang),
      boardLodging:    secLbls.boardLodging    || tOffer("boardLodging",   lang),
      training:        secLbls.training        || tOffer("training",       lang),
      packaging:       secLbls.packaging       || tOffer("packaging",      lang),
      transport:       secLbls.transport       || tOffer("transport",      lang),
      grossTotal:      secLbls.grossTotal      || tOffer("grossTotal",     lang),
      netTotal:        secLbls.netTotal        || tOffer("netTotal",       lang),
      discount:        secLbls.discount        || tOffer("discount",       lang),
      ...(pricing.priceLabels ?? {}),
    };

    const interlockingRow = (pricing.interlockingTotal ?? 0) > 0 ? `<tr>
      <td style="${serviceNameS}">${esc(pl.interlocking)}</td>
      <td class="money-cell" style="${servicePriceS}">€${fmtMoney(showNetOnly ? applyNet(Number(pricing.interlockingTotal), null, false) : Number(pricing.interlockingTotal))}</td>
    </tr>` : "";

    const extraRows = (pricing.extraItems ?? []).map((e: any) => {
      const gross = Number(e.price ?? 0);
      const shown = showNetOnly
        ? applyNet(gross, e.discountOverridePercent ?? null, e.isNet ?? false)
        : gross;
      const extraNetBadge = e?.isNet ? ` <span style="display:inline-block;font-size:8px;font-weight:700;padding:1px 4px;border:1px solid #FCD34D;background:#FEF3C7;color:#92400E;border-radius:3px;vertical-align:middle;">NETTO</span>` : "";
      return `<tr>
        <td style="${serviceNameS}">${esc(e.description || "Extra item")}${extraNetBadge}</td>
        <td class="money-cell" style="${servicePriceS}">€${fmtMoney(shown)}</td>
      </tr>`;
    }).join("");

    // Recompute discount per-line so PDF totals match the on-screen logic.
    let computedDiscount = 0;
    items.forEach((item: any, index: number) => {
      const base = toNum(item.snapshotBasePrice);
      const machineQty = item.quantity ?? 1;
      const hiddenMap = pricing?.itemComments?.[index]?.optionPriceHidden;
      const lineCfg = itemDiscountsArr[index] ?? {};
      const hiddenUnitTotal = (item.options ?? []).reduce((s: number, opt: any) => {
        if (!hiddenMap?.[opt.machineOptionId]) return s;
        return s + toNum(opt.snapshotPriceModifier) * (opt.quantity ?? 1);
      }, 0);
      const machineGross = (base + hiddenUnitTotal) * machineQty;
      computedDiscount += machineGross * (effPct(lineCfg?.discountOverridePercent ?? null, lineCfg?.isNet ?? false) / 100);
      for (const opt of (item.options ?? [])) {
        if (hiddenMap?.[opt.machineOptionId]) continue;
        const optQty = opt.quantity ?? 1;
        const optPrice = toNum(opt.snapshotPriceModifier);
        const subtotal = optPrice * optQty * machineQty;
        const optCfg = lineCfg?.optionDiscounts?.[opt.machineOptionId];
        computedDiscount += subtotal * (effPct(optCfg?.discountOverridePercent ?? null, optCfg?.isNet ?? false) / 100);
      }
    });
    for (const e of (pricing.extraItems ?? [])) {
      computedDiscount += Number(e.price ?? 0) * (effPct(e.discountOverridePercent ?? null, e.isNet ?? false) / 100);
    }
    computedDiscount += Number(pricing.interlockingTotal ?? 0) * (effPct(null, false) / 100);

    const totalListPrice = pricing.totalListPrice ?? (pricing.grossTotal - (pricing.serviceItems?.transportIncluded ? (pricing.serviceItems?.transportPrice ?? 0) : 0) - (pricing.installationConfig?.included ? (pricing.installationConfig?.totalPrice ?? 0) : 0));
    const totalListPriceRow = showNetOnly ? "" : `<tr style="border-top:2px solid #E5E7EB;">
      <td style="padding-top:10px;padding-bottom:8px;${totalListS}">${esc(pl.totalListPrice)}</td>
      <td class="money-cell" style="padding-top:10px;padding-bottom:8px;${totalListS}">€${fmtMoney(totalListPrice)}</td>
    </tr>`;

    const hasPerLineDiscountOverrides = (() => {
      for (const d of itemDiscountsArr) {
        if (d?.discountOverridePercent != null || d?.isNet) return true;
        if (d?.optionDiscounts) {
          for (const k of Object.keys(d.optionDiscounts)) {
            const od = d.optionDiscounts[k];
            if (od?.discountOverridePercent != null || od?.isNet) return true;
          }
        }
      }
      for (const e of (pricing.extraItems ?? [])) {
        if (e?.discountOverridePercent != null || e?.isNet) return true;
      }
      return false;
    })();
    const discountAmount = computedDiscount;
    const discountLabelSuffix = !hasPerLineDiscountOverrides && globalPct > 0
      ? ` (${globalPct}%)` : "";
    const discountRow = (!showNetOnly && discountAmount > 0) ? `<tr class="discount-row">
      <td style="${discountS}">${esc(pl.discount ?? "Discount")}${discountLabelSuffix}</td>
      <td class="money-cell" style="${discountS}">-€${fmtMoney(discountAmount)}</td>
    </tr>` : "";

    const included = (v: boolean) => v
      ? `<span style="display:inline-block;background:#DCFCE7;color:#15803D;padding:1px 8px;border-radius:999px;font-size:8.5pt;font-weight:600;">${esc(tOffer("included", lang))}</span>`
      : `<span style="display:inline-block;background:#FEE2E2;color:#DC2626;padding:1px 8px;border-radius:999px;font-size:8.5pt;font-weight:600;">${esc(tOffer("excluded", lang))}</span>`;

    const grossTotal = pricing.grossTotal ?? toNum(offer.totalPrice);
    const netTotalValue = grossTotal - discountAmount;
    const grossTotalRow = showNetOnly ? "" : `<tr class="grand-total-row" style="break-before:avoid;page-break-before:avoid;">
      <td style="${totalGrossS}">${esc(pl.grossTotal)}</td>
      <td class="money-cell" style="${totalGrossS}">€${fmtMoney(grossTotal)}</td>
    </tr>`;
    const netTotalRow = (showNetOnly || discountAmount > 0) ? `<tr class="net-total-row" style="break-before:avoid;page-break-before:avoid;">
      <td style="${totalNetS}">${esc(pl.netTotal)}${(!showNetOnly && !hasPerLineDiscountOverrides && globalPct > 0) ? ` ${esc(tOffer("afterDiscount", lang).replace("{pct}", String(globalPct)))}` : ""}</td>
      <td class="money-cell" style="${totalNetS}">€${fmtMoney(netTotalValue)}</td>
    </tr>` : "";

    const trainingIncluded = si.trainingIncluded !== false;
    return sectionWrap(tOffer("priceOverview", lang), `
      <table class="data-table">
        <tbody>
          ${itemRows}
          ${interlockingRow}
          ${extraRows}
          ${totalListPriceRow}
          <tr><td colspan="2" style="padding:6px 0;"></td></tr>
          <tr><td colspan="2" style="${servicesTitleS};letter-spacing:.05em;text-transform:uppercase;padding-bottom:4px;">${esc(tOffer("netServicePrices", lang))}</td></tr>
          <tr class="svc-row"><td style="${serviceNameS}">${esc(pl.installation)}</td>
            <td class="money-cell" style="${servicePriceS}">${ic.included ? `€${fmtMoney(ic.totalPrice ?? 0)}` : included(false)}</td></tr>
          <tr class="svc-row"><td style="${serviceNameS}">${esc(pl.travelCosts)}</td><td class="money-cell" style="${servicePriceS}">${included(si.travelCosts)}</td></tr>
          <tr class="svc-row"><td style="${serviceNameS}">${esc(pl.boardLodging)}</td><td class="money-cell" style="${servicePriceS}">${included(si.boardLodging)}</td></tr>
          <tr class="svc-row"><td style="${serviceNameS}">${esc(pl.training)} (${si.trainingDays || "0"} ${esc(tOffer("days", lang))})</td><td class="money-cell" style="${servicePriceS}">${included(trainingIncluded)}</td></tr>
          <tr class="svc-row"><td style="${serviceNameS}">${esc(pl.packaging)}</td><td class="money-cell" style="${servicePriceS}">${included(si.packaging)}</td></tr>
          <tr class="svc-row"><td style="${serviceNameS}">${esc(pl.transport)}</td>
            <td class="money-cell" style="${servicePriceS}">${si.transportIncluded ? `€${fmtMoney(si.transportPrice ?? 0)}` : included(false)}</td></tr>
          ${discountRow}
          ${grossTotalRow}
          ${netTotalRow}
        </tbody>
      </table>${specRowsHtml(sec)}`, sec);
  }

  function buildUtilities(sec?: any): string {
    const uLbl = (key: string, fallback: string) => sec?.labels?.[key] || tOffer(key, lang) || fallback;
    const utilRows: [string, string, string][] = [
      [uLbl("electricalPower", "Electrical Power"), utils.electricalPower.toFixed(1), uLbl("electricalPowerUnit","kW")],
      [uLbl("compressedAir",   "Compressed Air"),   utils.compressedAir.toFixed(1),  uLbl("compressedAirUnit","Nl/min")],
      [uLbl("exhaustedAir",    "Exhausted Air"),    utils.exhaustedAir.toFixed(1),   uLbl("exhaustedAirUnit","m³/h")],
      [uLbl("airIntroduced",   "Air Introduced"),   utils.airIntroduced.toFixed(1),  uLbl("airIntroducedUnit","m³/h")],
    ];
    const boxTitleStyle = partInlineStyle(sec, 'boxTitle');
    const boxValueStyle = partInlineStyle(sec, 'boxValue');
    const unitStyle = partInlineStyle(sec, 'unit');
    return sectionWrap(tOffer("utilitiesSummary", lang), `
      <div class="utils-grid">
        ${utilRows.map(([label, val, unit]) => `
          <div class="util-box">
            <div class="util-label" style="${boxTitleStyle};text-transform:uppercase;letter-spacing:0.05em;">${label}</div>
            <div class="util-value"><span style="${boxValueStyle}">${val}</span> <span style="${unitStyle}">${unit}</span></div>
          </div>`).join("")}
      </div>${specRowsHtml(sec)}`, sec, "no-top-margin", "break-after:avoid;page-break-after:avoid;");
  }

  function buildTerms(sec?: any): string {
    const hasDelivery = !!deliveryTerms.trim();
    const hasPayment = paymentSchedule.length > 0;
    const hasPresets = selectedPresets.length > 0;
    if (!hasDelivery && !hasPayment && !hasPresets) return "";

    const intro = sec?.labels?.intro;
    const introHtml = intro ? `<div style="margin-bottom:10px;line-height:1.5;">${esc(intro)}</div>` : "";
    const contentStyle = partInlineStyle(sec, 'contentA');
    const parts: string[] = [];

    if (hasDelivery) {
      parts.push(sectionWrap(
        tOffer("delivery", lang).toUpperCase(),
        `<div style="${contentStyle};line-height:1.6;">${esc(deliveryTerms)}</div>`,
        sec,
        "terms-section"
      ));
    }

    if (hasPayment) {
      const rowsHtml = paymentSchedule.map((row: any) => {
        const valueStr = paymentMode === "percentage"
          ? `${row.percentage ?? 0}%`
          : `€ ${(row.amount ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`;
        return `<div style="display:flex;align-items:baseline;gap:12px;padding:5px 0;border-bottom:0.5px solid #E5E7EB;">
          <span style="font-weight:600;font-style:italic;white-space:nowrap;min-width:40px;">${valueStr}</span>
          <span style="font-style:italic;">${esc(row.description || "")}</span>
        </div>`;
      }).join("");

      const listHtml = `<div style="${contentStyle}">${rowsHtml}</div>`;
      parts.push(sectionWrap(tOffer("payment", lang).toUpperCase(), listHtml, sec, "terms-section"));
    }

    if (hasPresets) {
      const termsBreakPositions: number[] = projectData.termsBreakPositions ?? [];
      const termsBreakIds: Set<number> = new Set(termsBreakPositions);
      const presetsHtml = selectedPresets.map((p: any, i: number) => {
        const shouldBreak = i > 0 && termsBreakIds.has(p.id);
        const inner = sectionWrap(
          p.title ? esc(p.title) : tOffer("termsConditions", lang).toUpperCase(),
          `${i === 0 ? introHtml : ""}<div class="preset-body" style="${contentStyle}">${esc(p.content).replace(/\n/g, "<br>")}</div>`,
          sec,
          "terms-section"
        );
        return shouldBreak
          ? `<div style="page-break-before:always;break-before:page;">${inner}</div>`
          : inner;
      }).join("\n");
      parts.push(presetsHtml);
    }

    const extra = specRowsHtml(sec);
    if (extra) parts.push(`<div>${extra}</div>`);
    return parts.join("\n");
  }

  function buildCustomSection(sec: any): string {
    const rows: { text: string; bold?: boolean }[] = sec.rows ?? [];
    if (!rows.length) return "";
    const inner = rows
      .map(r => r.bold
        ? `<p style="font-weight:700;margin:3px 0;line-height:1.5;">${esc(r.text)}</p>`
        : `<p style="margin:3px 0;line-height:1.5;">${esc(r.text)}</p>`)
      .join("");
    return sectionWrap(esc(sec.label ?? sec.name ?? "Section"), inner, sec);
  }

  function specRowsHtml(sec: any): string {
    const rows: { label: string; value: string }[] = sec?.specRows ?? [];
    const filtered = rows.filter((r: any) => r.label?.trim() || r.value?.trim());
    if (!filtered.length) return "";
    const font = sec?.font ?? "Calibri";
    const size = sec?.fontSize ?? 10;
    const color = sec?.textColor ?? "#1F2937";
    return `<div style="margin-top:12px;display:flex;flex-direction:column;gap:4px;">
      ${filtered.map((r: any) => `<div style="display:flex;align-items:baseline;gap:8px;font-family:${font};font-size:${size}pt;color:${color};">
        ${r.label?.trim() ? `<span style="font-weight:600;flex-shrink:0;">${esc(r.label)}:</span>` : ""}
        <span>${esc(r.value)}</span>
      </div>`).join("")}
    </div>`;
  }

  const sectionBuilders: Record<string, (sec?: any) => string> = {
    offer_title:       buildOfferTitle,
    metadata:          buildMetadata,
    machine_line:      buildMachineLine,
    technical_specs:   buildTechnicalSpecs,
    price_overview:    buildPriceOverview,
    utilities_summary: buildUtilities,
    terms_conditions:  buildTerms,
  };

  const bodyHtml = orderedSections
    .map((s: any) => {
      const content = s.type === "custom"
        ? buildCustomSection(s)
        : (sectionBuilders[s.id] ?? (() => ""))(s);
      if (!content) return "";
      if (perOfferBreaks !== undefined && perOfferBreaks.includes(s.id)) {
        return `<div style="break-before:page;page-break-before:always;">${content}</div>`;
      }
      return content;
    })
    .filter(Boolean)
    .join("\n");

  const outfitFaces = [
    outfit400b64 ? `@font-face { font-family:'Outfit'; font-weight:400; font-style:normal; src:url('data:font/truetype;base64,${outfit400b64}') format('truetype'); }` : "",
    outfit600b64 ? `@font-face { font-family:'Outfit'; font-weight:600; font-style:normal; src:url('data:font/truetype;base64,${outfit600b64}') format('truetype'); }` : "",
    outfit700b64 ? `@font-face { font-family:'Outfit'; font-weight:700; font-style:normal; src:url('data:font/truetype;base64,${outfit700b64}') format('truetype'); }` : "",
  ].filter(Boolean).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(offer.referenceNumber)}</title>
<style>
  ${outfitFaces}

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Outfit', 'Calibri', Arial, sans-serif;
    font-size: 11pt;
    color: #1F2937;
    background: ${pageBackground};
    line-height: 1.45;
  }

  .page-content {
    padding: 0 0 12px 0;
  }

  /* ── Section card ── */
  .section {
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 6px;
    padding: 16px 20px;
    margin-bottom: 14px;
  }

  .section-label {
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.07em;
    color: #9CA3AF;
    text-transform: uppercase;
    margin-bottom: 12px;
    padding-bottom: 7px;
    border-bottom: 1px solid #F3F4F6;
    break-after: avoid;
    page-break-after: avoid;
  }

  .section:first-child {
    margin-top: 0px !important;
  }
  .section:last-child {
    margin-bottom: 0px;
  }
  .section.no-top-margin {
    margin-top: 0px !important;
  }

  /* ── Offer title ── */
  .offer-title-text {
    font-size: 18pt;
    font-weight: 700;
    color: #111827;
    line-height: 1.2;
  }

  /* ── Metadata 3-col grid ── */
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .meta-box {
    background: #F9FAFB;
    border-radius: 4px;
    padding: 10px 14px;
  }
  .meta-label {
    font-size: 7.5pt;
    font-weight: 700;
    color: #9CA3AF;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }
  .meta-value { font-size: 11pt; font-weight: 600; color: #111827; }
  .meta-sub { font-size: 8.5pt; color: #6B7280; margin-top: 2px; }

  /* ── Tables ── */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
  }
  .data-table th {
    background: #F9FAFB;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9CA3AF;
    padding: 7px 10px;
    border-bottom: 1.5px solid #E5E7EB;
    text-align: left;
  }
  .data-table td {
    padding: 6px 10px;
    border-bottom: 1px dashed #F3F4F6;
    vertical-align: top;
  }
  .data-table tfoot td {
    border-top: 2px solid #E5E7EB;
    border-bottom: none;
    padding-top: 10px;
    padding-bottom: 8px;
  }
  .machine-row td { font-weight: 600; color: #111827; background: #FAFAFA; }
  .opt-row td { color: #6B7280; font-size: 9pt; }
  .opt-name { padding-left: 8px !important; }
  .pos-cell { color: #9CA3AF; font-size: 9pt; white-space: nowrap; }
  .machine-name { font-weight: 600; }
  .money-cell { text-align: right; white-space: nowrap; }
  .qty-tag { background: #E5E7EB; border-radius: 3px; padding: 1px 5px; font-size: 8.5pt; font-weight: 400; }
  .grand-total-row td { background: #F9FAFB; }
  .net-total-row td { }
  .discount-row td { }
  .svc-row td { }
  .excluded { color: #EF4444; font-weight: 600; }

  /* ── Technical specs ── */
  .specs-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }
  .spec-box {
    background: #F9FAFB;
    border-radius: 4px;
    padding: 8px 12px;
  }
  .spec-label { font-size: 7pt; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
  .spec-value { font-size: 10.5pt; font-weight: 600; color: #111827; }
  .std-specs { display: flex; flex-direction: column; gap: 7px; }
  .std-specs-bordered { border-top: 1px solid #F3F4F6; padding-top: 10px; }
  .std-row { font-size: 9.5pt; }
  .std-label { font-weight: 700; color: #374151; margin-right: 5px; }
  .std-value { color: #1F2937; }

  /* ── Utilities ── */
  .utils-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .util-box { background: #F9FAFB; border-radius: 4px; padding: 10px 10px; text-align: center; }
  .util-label { font-size: 7pt; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
  .util-value { font-size: 13pt; font-weight: 700; color: #111827; }
  .util-unit { font-size: 8pt; font-weight: 400; color: #9CA3AF; }

  /* ── Terms ── */
  .preset-block { margin-bottom: 16px; }
  .preset-block:last-child { margin-bottom: 0; }
  .preset-title { font-weight: 700; font-size: 10.5pt; color: #111827; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #F3F4F6; }
  .preset-body { font-size: 9pt; color: #4B5563; line-height: 1.65; white-space: pre-wrap; }

  @page { size: A4; margin: 26mm 14mm 31mm 14mm; }
</style>
</head>
<body>
<div class="page-content">
${bodyHtml}
</div>
</body>
</html>`;
}

export async function generatePdf(offer: any, formatSettings: any, logoBase64Override?: string): Promise<Buffer> {
  const html = buildOfferHtml(offer, formatSettings);
  const logoBase64 = logoBase64Override || getLogoBase64();
  const offerDate = (() => { try { return dateFormat(new Date(offer.date), "MMMM d, yyyy"); } catch { return offer.date; } })();

  const headerCfg = formatSettings?.header ?? {
    logoEnabled: true,
    offerNumberEnabled: true,
    dateEnabled: true,
    layout: 'logo-left',
  };

  const footerCfg = formatSettings?.footer ?? {
    companyDataEnabled: true,
    companyLines: [],
    pageNumberEnabled: true,
    fontSize: 6,
  };

  const logoHeight = headerCfg.logoSize ?? 42;
  const detectLogoMime = (b64: string): string => {
    const head = Buffer.from(b64.slice(0, 16), "base64");
    if (head[0] === 0xFF && head[1] === 0xD8) return "image/jpeg";
    if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return "image/gif";
    if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46) return "image/webp";
    return "image/png";
  };
  const logoMime = logoBase64 ? detectLogoMime(logoBase64) : "image/png";
  const logoImgHtml = (headerCfg.logoEnabled !== false && logoBase64)
    ? `<img src="data:${logoMime};base64,${logoBase64}" style="height:${logoHeight}px;object-fit:contain;" />`
    : ``;

  const onStyle = headerCfg.offerNumberStyle ?? { fontSize: 9, fontFamily: 'Arial', bold: true, italic: false, color: '#111827' };
  const offerNumberHtml = headerCfg.offerNumberEnabled !== false
    ? `<div style="font-weight:${onStyle.bold ? '700' : '400'};font-size:${onStyle.fontSize}pt;color:${onStyle.color};font-family:${onStyle.fontFamily},sans-serif;${onStyle.italic ? 'font-style:italic;' : ''}">${esc(offer.referenceNumber)}</div>` : "";
  const dtStyle = headerCfg.dateStyle ?? { fontSize: 7.5, fontFamily: 'Arial', bold: false, italic: false, color: '#9CA3AF' };
  const offerDateHtml = headerCfg.dateEnabled !== false
    ? `<div style="font-weight:${dtStyle.bold ? '700' : '400'};font-size:${dtStyle.fontSize}pt;color:${dtStyle.color};font-family:${dtStyle.fontFamily},sans-serif;${dtStyle.italic ? 'font-style:italic;' : ''}">${esc(offerDate)}</div>` : "";
  const rightInfoHtml = (offerNumberHtml || offerDateHtml)
    ? `<div style="text-align:right;">${offerNumberHtml}${offerDateHtml}</div>` : "";

  const isLogoRight = headerCfg.layout === 'logo-right';
  const leftContent = isLogoRight ? rightInfoHtml : `<div style="display:flex;align-items:center;">${logoImgHtml}</div>`;
  const rightContent = isLogoRight ? `<div style="display:flex;align-items:center;">${logoImgHtml}</div>` : rightInfoHtml;

  const headerTemplate = `
    <div style="width:100%;padding:7px 14mm 7px 14mm;display:flex;align-items:center;justify-content:space-between;font-family:Arial,sans-serif;box-sizing:border-box;">
      ${leftContent}
      ${rightContent}
    </div>`;

  const footerFontSize = footerCfg.fontSize ?? 6;
  const footerFontFamily = footerCfg.fontFamily ? `'${footerCfg.fontFamily}',` : "'Outfit',";
  const companyLines: string[] = footerCfg.companyLines ?? [];
  const companyLinesHtml = (footerCfg.companyDataEnabled !== false && companyLines.length > 0)
    ? `<div style="font-size:${footerFontSize}pt;color:#6B7280;line-height:1.6;font-family:${footerFontFamily}Arial,sans-serif;">
        ${companyLines.map((line: string, i: number) =>
          `<div${i === 0 ? ` style="font-weight:600;color:#374151;"` : ""}>${esc(line)}</div>`
        ).join("")}
      </div>`
    : "";
  const pageNumberHtml = footerCfg.pageNumberEnabled !== false
    ? `<div style="font-size:7.5pt;color:#6B7280;white-space:nowrap;padding-left:14px;padding-top:3px;font-family:${footerFontFamily}Arial,sans-serif;">
        Page <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>`
    : "";

  const footerTemplate = `
    <div style="width:100%;padding:6px 14mm 4px 14mm;font-family:Arial,sans-serif;box-sizing:border-box;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;">
        ${companyLinesHtml}
        ${pageNumberHtml}
      </div>
    </div>`;

  const browser = await puppeteer.launch({
    executablePath: getChromiumPath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    // Set viewport to A4 width (794px ≈ 210mm at 96dpi) so element heights match print layout
    await page.setViewport({ width: 794, height: 1122, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    // Switch to print media so @media print rules apply before measuring
    await page.emulateMediaType("print");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: {
        top: "26mm",
        bottom: "31mm",
        left: "14mm",
        right: "14mm",
      },
    });

    let finalBuffer = Buffer.from(pdfBuffer);

    if (offer.projectData?.includeLayoutInPdf) {
      let drawingPath: string | null = null;
      const layoutDrawing = offer.projectData?.layoutDrawing;
      if (layoutDrawing?.filename && !layoutDrawing.filename.includes("..") && !layoutDrawing.filename.includes("/") && !layoutDrawing.filename.includes("\\")) {
        const baseDir = path.resolve(process.cwd(), "server/assets/layout-drawings");
        const candidate = path.resolve(baseDir, layoutDrawing.filename);
        if (candidate.startsWith(baseDir) && fs.existsSync(candidate)) {
          drawingPath = candidate;
        }
      }
      if (!drawingPath && offer.projectData?.linkedDrawingId && offer.companyId) {
        try {
          const { db: drizzleDb } = await import("./repositories/base");
          const { drawings } = await import("@shared/schema");
          const { eq, and } = await import("drizzle-orm");
          const [linkedDraw] = await drizzleDb.select().from(drawings).where(and(eq(drawings.id, offer.projectData.linkedDrawingId), eq(drawings.companyId, offer.companyId)));
          if (linkedDraw?.pdfFilename) {
            const drawingsDir = path.resolve(process.cwd(), "server/assets/drawings");
            const candidate = path.resolve(drawingsDir, linkedDraw.pdfFilename);
            if (candidate.startsWith(drawingsDir) && fs.existsSync(candidate)) {
              drawingPath = candidate;
            }
          }
        } catch {}
      }
      if (drawingPath) {
        try {
          const A4_WIDTH = 595.28;
          const A4_HEIGHT = 841.89;
          const MARGIN = 36;
          const mainDoc = await PDFDocument.load(finalBuffer);
          const drawingBytes = fs.readFileSync(drawingPath);
          const drawingDoc = await PDFDocument.load(drawingBytes);
          for (const idx of drawingDoc.getPageIndices()) {
            const [embeddedPage] = await mainDoc.embedPdf(drawingDoc, [idx]);
            const srcWidth = embeddedPage.width;
            const srcHeight = embeddedPage.height;
            const availW = A4_WIDTH - 2 * MARGIN;
            const availH = A4_HEIGHT - 2 * MARGIN;
            const scale = Math.min(availW / srcWidth, availH / srcHeight, 1);
            const drawW = srcWidth * scale;
            const drawH = srcHeight * scale;
            const x = (A4_WIDTH - drawW) / 2;
            const y = (A4_HEIGHT - drawH) / 2;
            const newPage = mainDoc.addPage([A4_WIDTH, A4_HEIGHT]);
            newPage.drawPage(embeddedPage, { x, y, width: drawW, height: drawH });
          }
          finalBuffer = Buffer.from(await mainDoc.save());
        } catch {}
      }
    }

    return finalBuffer;
  } finally {
    await browser.close();
  }
}
