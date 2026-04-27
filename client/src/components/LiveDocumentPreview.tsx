import { useMemo } from "react";
import { format } from "date-fns";
import { getLocalizedField } from "@/lib/i18n/localize";

/* ── Local types ──────────────────────────────────────────────────────── */
interface CartItemMin {
  tempId: string;
  machineId: number;
  quantity: number;
  selectedOptionIds: number[];
  optionQuantities?: Record<number, number>;
  basePrice?: number;
  optionPrices?: Record<number, number>;
  comment?: string;
  optionComments?: Record<number, string>;
  optionPriceHidden?: Record<number, boolean>;
  [key: string]: any;
}

interface PresetItem {
  id: number | string;
  title: string;
  content: string;
  [key: string]: any;
}

interface MachineMin {
  id: number;
  name: string;
  macroType?: string;
  description?: string;
  image_url?: string;
  installationDays?: string | number;
  options?: Array<{
    id: number;
    name: string;
    priceModifier?: string | number;
    [key: string]: any;
  }>;
  [key: string]: any;
}

interface HeaderInfo {
  date?: string;
  salesman?: { name?: string; email?: string; mobile?: string };
  customer?: { name?: string; contactPerson?: string; email?: string; address?: string };
}

export interface LiveDocumentPreviewProps {
  sectionOrder: string[];
  pageBreaks: string[];
  hiddenSections: string[];
  cartItems: CartItemMin[];
  machineOrder: string[];
  machinePageBreaks: string[];
  machineBreakPositions: number[];
  selectedPresets: PresetItem[];
  formatSettings: any | null;
  machines?: MachineMin[];
  subject?: string;
  layout?: string;
  technicalSpecs?: Record<string, string>;
  pricing?: any;
  headerInfo?: HeaderInfo;
  contentLanguage?: string;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
const toNum = (v: any) => parseFloat(String(v ?? "0")) || 0;

function machineImgSrc(filename: string | null | undefined): string {
  if (!filename) return "";
  const name = String(filename).toLowerCase();
  return `/machine-images/${name.includes(".") ? name : `${name}.png`}`;
}

function resolveSection(s: any) {
  const borderColor = s.borderColor ?? s.accentColor ?? "#E5E7EB";
  return {
    enabled: true,
    fontSize: 11,
    alignment: "justified",
    font: "Calibri",
    textColor: "#1F2937",
    fillColor: "#FFFFFF",
    ...s,
    borderColor,
  };
}

/* ── Dimensions (proportional to A4 at 896px width) ─────────────────────
   A4 = 210mm × 297mm. At 896px wide: 1mm = 896/210 = 4.267px
   Header margin in PDF: top 26mm  → 111px
   Footer margin in PDF: bottom 31mm → 132px
   Side padding in PDF:  14mm       → 60px
   A4 full height:       297mm      → 1267px
─────────────────────────────────────────────────────────────────────────── */
const DOC_W = 896;
const SCALE = 0.62;
const WRAPPER_W = Math.ceil(DOC_W * SCALE);
const MM = DOC_W / 210; // px per mm
const HDR_H = Math.round(26 * MM);  // 111px — matches PDF top margin
const FTR_H = Math.round(31 * MM);  // 132px — matches PDF bottom margin
const SIDE_PAD = Math.round(14 * MM); // 60px — matches PDF side margins

/* ── Local UI primitives ────────────────────────────────────────────────── */
function SectionCard({
  sec, children, style = {},
}: {
  sec: ReturnType<typeof resolveSection>;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        backgroundColor: sec.fillColor,
        border: `1px solid ${sec.borderColor}`,
        color: sec.textColor,
        fontFamily: sec.font,
        fontSize: `${sec.fontSize}pt`,
        borderRadius: 8,
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHead({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "16px 20px 8px" }}>{children}</div>;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "9pt", fontWeight: 600, opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
      {children}
    </div>
  );
}

function CardBody({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ padding: "0 20px 20px", ...style }}>{children}</div>;
}

function PriceRow({
  label, value, bold = false, sub = false, red = false, badge,
}: {
  label: string; value?: string; bold?: boolean; sub?: boolean; red?: boolean;
  badge?: "included" | "excluded";
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "6px 0", borderBottom: "1px dashed rgba(0,0,0,0.1)",
      color: red ? "#EF4444" : "inherit",
    }}>
      <span style={{ fontSize: sub ? "8.5pt" : "9.5pt", paddingLeft: sub ? 16 : 0, fontWeight: bold ? 600 : 400, opacity: sub ? 0.65 : 1 }}>{label}</span>
      {badge ? (
        <span style={{
          marginLeft: 16, fontSize: "8pt", fontWeight: 600, padding: "2px 8px", borderRadius: 999,
          backgroundColor: badge === "included" ? "#DCFCE7" : "#FEE2E2",
          color: badge === "included" ? "#15803D" : "#DC2626",
        }}>
          {badge === "included" ? "INCLUDED" : "EXCLUDED"}
        </span>
      ) : (
        <span style={{ marginLeft: 16, fontSize: sub ? "8.5pt" : "9.5pt", fontWeight: bold ? 700 : 400, opacity: sub ? 0.65 : 1 }}>{value}</span>
      )}
    </div>
  );
}

/* ── Page header — mirrors PDF Puppeteer headerTemplate ─────────────────── */
function PreviewPageHeader({ date, logoSrc }: { date?: string; logoSrc?: string }) {
  return (
    <div style={{
      height: HDR_H,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      paddingLeft: SIDE_PAD,
      paddingRight: SIDE_PAD,
      borderBottom: "1px solid #E5E7EB",
      backgroundColor: "#FFFFFF",
      flexShrink: 0,
    }}>
      <img
        src="/api/logo"
        style={{ height: Math.round(42 * SCALE * (1 / SCALE)), objectFit: "contain" }}
        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
        alt=""
      />
      <div style={{ textAlign: "right", fontFamily: "Arial, sans-serif" }}>
        <div style={{ fontWeight: 700, fontSize: "9pt", color: "#111827" }}>PREVIEW</div>
        {date && <div style={{ fontSize: "7.5pt", color: "#9CA3AF" }}>{date}</div>}
      </div>
    </div>
  );
}

/* ── Page footer — mirrors PDF Puppeteer footerTemplate ─────────────────── */
function PreviewPageFooter({ pageNum, totalPages }: { pageNum: number; totalPages: number }) {
  return (
    <div style={{
      height: FTR_H,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      paddingLeft: SIDE_PAD,
      paddingRight: SIDE_PAD,
      paddingTop: Math.round(6 * MM / 10),
      borderTop: "1px solid #E5E7EB",
      backgroundColor: "#FFFFFF",
      flexShrink: 0,
    }}>
      <div style={{ fontFamily: "Arial, sans-serif" }} />
      <div style={{ fontSize: "7.5pt", color: "#6B7280", whiteSpace: "nowrap", paddingLeft: 14, paddingTop: 3, fontFamily: "Arial, sans-serif" }}>
        Page {pageNum} / {totalPages}
      </div>
    </div>
  );
}

/* ── Single A4 page wrapper ──────────────────────────────────────────────── */
function PreviewPage({
  children, pageNum, totalPages, pageBackground, date,
}: {
  children: React.ReactNode;
  pageNum: number;
  totalPages: number;
  pageBackground: string;
  date?: string;
}) {
  return (
    <div style={{
      width: DOC_W,
      backgroundColor: "#FFFFFF",
      boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
      display: "flex",
      flexDirection: "column",
      marginBottom: pageNum < totalPages ? 20 : 0,
    }}>
      <PreviewPageHeader date={date} />
      <div style={{
        flex: "1 0 auto",
        backgroundColor: pageBackground,
        padding: `20px ${SIDE_PAD}px`,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}>
        {children}
      </div>
      <PreviewPageFooter pageNum={pageNum} totalPages={totalPages} />
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */
export function LiveDocumentPreview(props: LiveDocumentPreviewProps) {
  const {
    sectionOrder, pageBreaks, hiddenSections,
    cartItems, machineOrder, machineBreakPositions,
    selectedPresets, formatSettings, machines,
    subject, layout, technicalSpecs, pricing, headerInfo,
    contentLanguage = "it",
  } = props;

  const pageBackground = formatSettings?.pageBackground ?? "#F9FAFB";

  const displayDate = useMemo(() => {
    const src = headerInfo?.date;
    if (!src) return "";
    try { return format(new Date(src), "MMMM d, yyyy"); } catch { return src; }
  }, [headerInfo?.date]);

  /* ── Compute ordered cart ──────────────────────────────────────────── */
  const orderedCart: CartItemMin[] = useMemo(() => {
    if (machineOrder.length > 0) {
      return machineOrder.map(tid => cartItems.find(c => c.tempId === tid)!).filter(Boolean);
    }
    return cartItems;
  }, [cartItems, machineOrder]);

  /* ── Build mock offer items from cart + machine lookup ─────────────── */
  const mockItems: any[] = useMemo(() => {
    return orderedCart.map((item, idx) => {
      const m = machines?.find(m => m.id === item.machineId);
      const options = (item.selectedOptionIds ?? []).map(optId => {
        const opt = m?.options?.find(o => o.id === optId);
        const qty = item.optionQuantities?.[optId] ?? 1;
        const price = item.optionPrices?.[optId] ?? toNum(opt?.priceModifier);
        return {
          id: optId,
          machineOptionId: optId,
          snapshotOptionName: getLocalizedField(opt?.titles, opt?.name ?? `Option ${optId}`, contentLanguage),
          quantity: qty,
          snapshotPriceModifier: price,
        };
      });
      return {
        id: idx + 1,
        position: idx + 1,
        quantity: item.quantity ?? 1,
        snapshotMachineName: getLocalizedField(m?.titles, m?.name ?? "—", contentLanguage),
        snapshotMacroType: m?.macroType ?? "",
        snapshotMachineDescription: getLocalizedField(m?.descriptions, m?.description ?? "", contentLanguage),
        snapshotImageUrl: m?.image_url ?? "",
        snapshotBasePrice: item.basePrice ?? toNum(m?.basePrice),
        options,
      };
    });
  }, [orderedCart, machines, contentLanguage]);

  /* ── Effective section list ────────────────────────────────────────── */
  const effectiveSections = useMemo(() => {
    const raw: any[] = formatSettings?.sections ?? [];
    const enabled = raw.filter(s => s.enabled && !hiddenSections.includes(s.id)).map(resolveSection);
    if (!sectionOrder.length) return enabled;
    const ordered = sectionOrder.map(id => enabled.find(s => s.id === id)).filter(Boolean) as ReturnType<typeof resolveSection>[];
    const extra = enabled.filter(s => !sectionOrder.includes(s.id));
    return [...ordered, ...extra];
  }, [formatSettings, hiddenSections, sectionOrder]);

  /* ── Utilities totals (zero at wizard time — snapshots not yet created) */
  const utilitiesTotal = { electricalPower: 0, compressedAir: 0, exhaustedAir: 0, airIntroduced: 0, installationDays: 0 };

  /* ── Render a single machine card ──────────────────────────────────── */
  function renderMachineCard(item: any, sec: ReturnType<typeof resolveSection>) {
    const mlLbl = (key: string, fallback: string) => sec.labels?.[key] || fallback;
    const posPrefix = mlLbl("positionPrefix", "Machine — Pos.");
    const inclOptsLabel = mlLbl("includedOptions", "Included Options:");
    const bullet = mlLbl("optionBullet", "›");
    const imgSrc = machineImgSrc(item.snapshotImageUrl);
    return (
      <SectionCard sec={sec}>
        <CardHead>
          <CardTitle>📄 {posPrefix} {item.position}</CardTitle>
        </CardHead>
        <CardBody>
          {imgSrc && (
            <div style={{ marginBottom: 16 }}>
              <img
                src={imgSrc}
                alt={item.snapshotMachineName}
                style={{ width: 480, maxWidth: "100%", height: "auto", maxHeight: 280, objectFit: "contain", borderRadius: 8, backgroundColor: "rgba(0,0,0,0.03)", display: "block" }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = "none"; }}
              />
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ fontSize: "11pt", fontWeight: 700 }}>{item.snapshotMachineName}</span>
            {item.quantity > 1 && (
              <span style={{ fontSize: "8pt", padding: "2px 8px", borderRadius: 4, backgroundColor: "rgba(0,0,0,0.08)", fontWeight: 600 }}>×{item.quantity}</span>
            )}
            {item.snapshotMacroType && (
              <span style={{ fontSize: "8pt", padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)" }}>{item.snapshotMacroType}</span>
            )}
          </div>
          {item.snapshotImageUrl && (
            <div style={{ marginBottom: 12 }}>
              <img
                src={`/machine-images/${item.snapshotImageUrl.includes(".") ? item.snapshotImageUrl : `${item.snapshotImageUrl}.png`}`}
                alt={item.snapshotMachineName}
                style={{ maxWidth: "100%", height: "auto", maxHeight: 250, objectFit: "contain" }}
              />
            </div>
          )}
          {item.snapshotMachineDescription && (
            <div style={{ fontSize: "9pt", opacity: 0.65, marginBottom: 16, lineHeight: 1.6 }}>
              {item.snapshotMachineDescription.split(/\[\[IMG:([^\]]+)\]\]/).map((part: string, pi: number) =>
                pi % 2 === 0 ? (
                  part.trim() ? <p key={pi} style={{ whiteSpace: "pre-wrap", margin: "0 0 4px 0" }}>{part}</p> : null
                ) : (
                  <div key={pi} style={{ margin: "8px 0" }}>
                    <img
                      src={`/machine-images/${part}`}
                      alt={`Detail ${Math.ceil(pi / 2)}`}
                      style={{ maxWidth: "100%", height: "auto", maxHeight: 220, objectFit: "contain" }}
                    />
                  </div>
                )
              )}
            </div>
          )}
          {item.options.length > 0 && (
            <div>
              <p style={{ fontSize: "7.5pt", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.45, marginBottom: 6 }}>{inclOptsLabel}</p>
              {item.options.map((opt: any) => (
                <div key={opt.id} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 3 }}>
                  <span style={{ opacity: 0.35, fontSize: "9.5pt", flexShrink: 0 }}>{bullet}</span>
                  <span style={{ fontSize: "9.5pt", opacity: 0.75 }}>{opt.snapshotOptionName}{opt.quantity > 1 ? ` ×${opt.quantity}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </SectionCard>
    );
  }

  /* ── Section node renderer (excludes machine_line — handled separately) */
  function renderSectionNode(sec: ReturnType<typeof resolveSection>): React.ReactNode {
    const id = sec.id;
    const lbl = (key: string, fallback: string) => sec.labels?.[key] || fallback;

    switch (id) {
      case "metadata": {
        const hi = headerInfo ?? {};
        const cardStyle: React.CSSProperties = {
          flex: "1 1 0", minWidth: 0,
          backgroundColor: sec.fillColor, border: `1px solid ${sec.borderColor}`,
          color: sec.textColor, fontFamily: sec.font, fontSize: `${sec.fontSize}pt`,
          borderRadius: 8, boxShadow: "0 1px 2px rgba(0,0,0,0.06)", padding: "16px 20px",
        };
        const labelStyle: React.CSSProperties = {
          display: "flex", alignItems: "center", gap: 6, fontSize: "8pt", fontWeight: 600,
          opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.05em",
          paddingBottom: 8, borderBottom: `1px solid ${sec.borderColor}`, marginBottom: 8,
        };
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <div style={cardStyle}>
              <div style={labelStyle}>📅 {lbl("dateBox", "DATE")}</div>
              <p style={{ fontWeight: 600, fontSize: `${sec.fontSize}pt`, margin: 0 }}>{displayDate || "—"}</p>
              <p style={{ fontSize: "8.5pt", opacity: 0.55, margin: "2px 0 0" }}>PREVIEW</p>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>👤 {lbl("salesmanBox", "SALESMAN")}</div>
              <p style={{ fontWeight: 600, fontSize: `${sec.fontSize}pt`, margin: 0 }}>{hi.salesman?.name || "—"}</p>
              {hi.salesman?.email && <p style={{ fontSize: "8.5pt", opacity: 0.65, margin: "2px 0 0" }}>{hi.salesman.email}</p>}
              {hi.salesman?.mobile && <p style={{ fontSize: "8.5pt", opacity: 0.65, margin: "2px 0 0" }}>{hi.salesman.mobile}</p>}
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>🏢 {lbl("customerBox", "CUSTOMER")}</div>
              <p style={{ fontWeight: 600, fontSize: `${sec.fontSize}pt`, margin: 0 }}>{hi.customer?.name || "—"}</p>
              {hi.customer?.contactPerson && <p style={{ fontSize: "8.5pt", opacity: 0.65, margin: "2px 0 0" }}>{hi.customer.contactPerson}</p>}
              {hi.customer?.email && <p style={{ fontSize: "8.5pt", opacity: 0.65, margin: "2px 0 0" }}>{hi.customer.email}</p>}
              {hi.customer?.address && <p style={{ fontSize: "8.5pt", opacity: 0.65, margin: "2px 0 0" }}>{hi.customer.address}</p>}
            </div>
          </div>
        );
      }

      case "offer_title": {
        const intro = sec.labels?.intro;
        return (
          <SectionCard sec={sec}>
            <CardBody style={{ padding: "20px" }}>
              {intro && <p style={{ fontSize: "9pt", fontStyle: "italic", opacity: 0.65, marginBottom: 12, lineHeight: 1.6 }}>{intro}</p>}
              <p style={{ fontSize: "18pt", fontWeight: 700, margin: 0 }}>{subject || "—"}</p>
              {layout && <p style={{ fontSize: "9pt", opacity: 0.55, marginTop: 8 }}><strong>LAYOUT:</strong> {layout}</p>}
            </CardBody>
          </SectionCard>
        );
      }

      case "technical_specs": {
        const specs = technicalSpecs;
        if (!specs) return null;
        const tsLbl = (key: string, fallback: string) => sec.labels?.[key] || fallback;
        const intro = sec.labels?.intro;
        const perOfferFields = ([
          [tsLbl("minMaxLength", "Min/Max. length of pieces (mm)"), specs.minMaxLength],
          [tsLbl("maxWidth", "Max. width of pieces (mm)"), specs.maxWidth],
          [tsLbl("minMaxThickness", "Min/Max. thickness (mm)"), specs.minMaxThickness],
          [tsLbl("averageLineSpeed", "Average line speed (mt/min)"), specs.averageLineSpeed],
          [tsLbl("controlSide", "Control side"), specs.controlSide],
          [tsLbl("maxBow", "Max. bow of panel"), specs.maxBow],
          [tsLbl("paint", "Paint"), specs.paint],
          [tsLbl("substrate", "Substrate"), specs.substrate],
          [tsLbl("finishing", "Finishing level"), specs.finishing],
        ] as [string, string][]).filter(([, v]) => v?.trim());
        const customSpecRows: { label: string; value: string }[] = sec.specRows ?? [];
        const standardFields: [string, string][] = customSpecRows.length > 0
          ? customSpecRows.filter((r: any) => r.value?.trim()).map((r: any) => [r.label, r.value] as [string, string])
          : ([
              [tsLbl("standardVoltage", "Standard voltage"), specs.standardVoltage],
              [tsLbl("standardColors", "Standard colors"), specs.standardColors],
              [tsLbl("components", "Components"), specs.components],
              [tsLbl("precautions", "Precautions"), specs.precautions],
              [tsLbl("airIntake", "Air intake"), specs.airIntake],
              [tsLbl("commissioning", "Commissioning"), specs.commissioning],
            ] as [string, string][]).filter(([, v]) => v?.trim());
        if (!perOfferFields.length && !standardFields.length) return null;
        return (
          <SectionCard sec={sec}>
            <CardHead><CardTitle>📋 {tsLbl("sectionTitle", "Project Data & Technical Specifications")}</CardTitle></CardHead>
            <CardBody>
              {intro && <p style={{ fontSize: "9pt", fontStyle: "italic", opacity: 0.65, marginBottom: 12, lineHeight: 1.6 }}>{intro}</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {perOfferFields.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {perOfferFields.map(([label, value]) => (
                      <div key={label} style={{ borderRadius: 8, padding: 12, backgroundColor: "rgba(0,0,0,0.04)" }}>
                        <p style={{ fontSize: "8pt", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.45, margin: "0 0 4px" }}>{label}</p>
                        <p style={{ fontSize: "9pt", fontWeight: 600, margin: 0 }}>{value}</p>
                      </div>
                    ))}
                  </div>
                )}
                {standardFields.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {perOfferFields.length > 0 && <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)" }} />}
                    {standardFields.map(([label, value]) => (
                      <div key={label}>
                        <p style={{ fontSize: "8pt", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.45, margin: "0 0 2px" }}>{label}</p>
                        <p style={{ fontSize: "9pt", whiteSpace: "pre-wrap", margin: 0 }}>{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardBody>
          </SectionCard>
        );
      }

      case "utilities_summary": {
        const uLbl = (key: string, fallback: string) => sec.labels?.[key] || fallback;
        return (
          <SectionCard sec={sec}>
            <CardHead><CardTitle>⚡ {uLbl("sectionTitle", "Utilities Summary")}</CardTitle></CardHead>
            <CardBody>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {[
                  { label: uLbl("electricalPower", "Electrical Power"), val: utilitiesTotal.electricalPower.toFixed(1), unit: uLbl("electricalPowerUnit", "kW") },
                  { label: uLbl("compressedAir", "Compressed Air"), val: utilitiesTotal.compressedAir.toFixed(1), unit: uLbl("compressedAirUnit", "Nl/min") },
                  { label: uLbl("exhaustedAir", "Exhausted Air"), val: utilitiesTotal.exhaustedAir.toFixed(1), unit: uLbl("exhaustedAirUnit", "m³/h") },
                  { label: uLbl("airIntroduced", "Air Introduced"), val: utilitiesTotal.airIntroduced.toFixed(1), unit: uLbl("airIntroducedUnit", "m³/h") },
                ].map(r => (
                  <div key={r.label} style={{ padding: 12, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.04)" }}>
                    <p style={{ fontSize: "8pt", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.45, margin: "0 0 4px" }}>{r.label}</p>
                    <p style={{ fontSize: "14pt", fontWeight: 700, margin: 0 }}>{r.val} <span style={{ fontSize: "8.5pt", fontWeight: 400, opacity: 0.55 }}>{r.unit}</span></p>
                  </div>
                ))}
              </div>
            </CardBody>
          </SectionCard>
        );
      }

      case "price_overview": {
        if (!pricing) return null;
        const pl = {
          interlocking: "Interlocking",
          totalListPrice: "TOTAL LIST PRICE (ex works, installation excluded)",
          installation: "Installation and start-up",
          travelCosts: "Travel and flight costs",
          boardLodging: "Board and lodging",
          training: "Training",
          packaging: "Packaging",
          transport: "Transport",
          grossTotal: "Gross Total",
          netTotal: "NET TOTAL",
          ...(pricing.priceLabels ?? {}),
        };
        const items: any[] = [];
        mockItems.forEach((item, index) => {
          const basePrice = toNum(item.snapshotBasePrice);
          const machineQty = item.quantity ?? 1;
          const comment = pricing?.itemComments?.[index]?.machineComment;
          const hiddenMap = pricing?.itemComments?.[index]?.optionPriceHidden;
          const hiddenUnitTotal = (item.options ?? []).reduce((s: number, opt: any) => {
            if (!hiddenMap?.[opt.machineOptionId]) return s;
            return s + toNum(opt.snapshotPriceModifier) * (opt.quantity ?? 1);
          }, 0);
          const displayedUnit = basePrice + hiddenUnitTotal;
          items.push({ label: `Pos. ${item.position} — ${item.snapshotMachineName}${machineQty > 1 ? ` ×${machineQty}` : ""}${comment ? ` (${comment})` : ""}`, value: `€${(displayedUnit * machineQty).toLocaleString()}` });
          item.options.forEach((opt: any) => {
            const optQty = opt.quantity ?? 1;
            const optPrice = toNum(opt.snapshotPriceModifier);
            const isHidden = pricing?.itemComments?.[index]?.optionPriceHidden?.[opt.machineOptionId];
            items.push({ label: `${opt.snapshotOptionName}${optQty > 1 ? ` ×${optQty}` : ""}${machineQty > 1 ? ` (×${machineQty})` : ""}`, value: isHidden ? "Incl." : `+€${(optPrice * optQty * machineQty).toLocaleString()}`, sub: true });
          });
        });
        const interlocking = toNum(pricing.interlockingTotal);
        if (interlocking > 0) items.push({ label: pl.interlocking, value: `€${interlocking.toLocaleString()}` });
        (pricing.extraItems || []).forEach((ex: any) => {
          if (ex.description) items.push({ label: ex.description, value: `€${Number(ex.price).toLocaleString()}` });
        });
        const totalListPrice = toNum(pricing.totalListPrice ?? pricing.grossTotal);
        items.push({ label: pl.totalListPrice, value: `€${totalListPrice.toLocaleString()}`, bold: true });
        items.push({ separator: true });
        items.push({ sectionHeader: "NET SERVICE PRICES" });
        const inst = pricing.installationConfig;
        const instLabel = [
          pl.installation,
          !inst?.hideTotalDays && inst?.totalDays ? `${inst.totalDays} days` : "",
          !inst?.hideDailyFee && inst?.dailyFee ? `€${inst.dailyFee}/day` : "",
        ].filter(Boolean).join(" · ");
        if (inst?.included) {
          items.push({ label: instLabel, value: !inst.hideTotalPrice ? `€${inst.totalPrice?.toLocaleString()}` : "TBD" });
        } else {
          items.push({ label: instLabel, badge: "excluded" });
        }
        const si = pricing.serviceItems ?? {};
        items.push({ label: pl.travelCosts, badge: si.travelCosts ? "included" : "excluded" });
        items.push({ label: pl.boardLodging, badge: si.boardLodging ? "included" : "excluded" });
        items.push({ label: `${pl.training} (${si.trainingDays || 0} days)`, badge: (si.trainingIncluded !== false) ? "included" : "excluded" });
        items.push({ label: pl.packaging, badge: si.packaging ? "included" : "excluded" });
        if (si.transportIncluded) {
          items.push({ label: pl.transport, value: `€${Number(si.transportPrice ?? 0).toLocaleString()}` });
        } else {
          items.push({ label: pl.transport, badge: "excluded" });
        }
        const grossTotal = toNum(pricing.grossTotal || pricing.netTotal);
        items.push({ label: pl.grossTotal, value: `€${grossTotal.toLocaleString()}`, bold: true });
        if (pricing.discountAmount > 0) {
          items.push({ label: `Discount (${pricing.discountPercent}%)`, value: `-€${Number(pricing.discountAmount).toLocaleString()}`, red: true });
        }
        const netTotal = toNum(pricing.netTotal);
        items.push({ label: pl.netTotal, value: `€${netTotal.toLocaleString()}`, bold: true });
        return (
          <SectionCard sec={sec}>
            <CardHead><CardTitle>💶 {lbl("sectionTitle", "Price Overview")}</CardTitle></CardHead>
            <CardBody>
              <div>
                {items.map((row: any, i: number) => {
                  if (row.separator) return <div key={i} style={{ padding: "6px 0" }} />;
                  if (row.sectionHeader) return (
                    <div key={i} style={{ fontSize: "8pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.45, padding: "4px 0 8px" }}>{row.sectionHeader}</div>
                  );
                  return <PriceRow key={i} label={row.label} value={row.value} bold={row.bold} sub={row.sub} red={row.red} badge={row.badge} />;
                })}
              </div>
            </CardBody>
          </SectionCard>
        );
      }

      case "terms_conditions":
        return null;

      default:
        return null;
    }
  }

  /* ── Build page segments ─────────────────────────────────────────────── */
  type PageItem = { key: string; node: React.ReactNode };
  const pages: PageItem[][] = useMemo(() => {
    const result: PageItem[][] = [[]];
    const push = (key: string, node: React.ReactNode) => result[result.length - 1].push({ key, node });
    const newPage = () => result.push([]);

    for (const sec of effectiveSections) {
      if (pageBreaks.includes(sec.id) && result[result.length - 1].length > 0) {
        newPage();
      }

      if (sec.id === "machine_line") {
        if (mockItems.length === 0) {
          push("machine_empty", (
            <SectionCard sec={sec}>
              <CardBody><p style={{ fontSize: "9pt", opacity: 0.4, fontStyle: "italic" }}>No machines added yet.</p></CardBody>
            </SectionCard>
          ));
        } else {
          mockItems.forEach((item, index) => {
            if (machineBreakPositions.includes(index) && index > 0) newPage();
            push(`machine_${item.id}`, renderMachineCard(item, sec));
          });
        }
      } else if (sec.id === "terms_conditions") {
        if (selectedPresets.length > 0) {
          selectedPresets.forEach((preset, i) => {
            if (i > 0) newPage();
            const intro = sec.labels?.intro;
            push(`preset_${preset.id}`, (
              <SectionCard sec={sec}>
                {preset.title && (
                  <CardHead>
                    {i === 0 && intro && <p style={{ fontSize: "9pt", fontStyle: "italic", opacity: 0.65, marginBottom: 8, lineHeight: 1.6 }}>{intro}</p>}
                    <CardTitle>{preset.title}</CardTitle>
                  </CardHead>
                )}
                <CardBody style={preset.title ? {} : { paddingTop: 20 }}>
                  {!preset.title && i === 0 && intro && <p style={{ fontSize: "9pt", fontStyle: "italic", opacity: 0.65, marginBottom: 8, lineHeight: 1.6 }}>{intro}</p>}
                  <p style={{ fontSize: "9pt", whiteSpace: "pre-wrap", opacity: 0.75, lineHeight: 1.6, margin: 0 }}>
                    {preset.content.length > 500 ? preset.content.slice(0, 500) + "…" : preset.content}
                  </p>
                </CardBody>
              </SectionCard>
            ));
          });
        }
      } else {
        const node = renderSectionNode(sec);
        if (node) push(sec.id, node);
      }
    }

    return result.filter(p => p.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSections, mockItems, machineBreakPositions, pageBreaks, selectedPresets, displayDate, headerInfo, subject, layout, technicalSpecs, pricing]);

  const totalPages = pages.length;

  return (
    <div style={{
      width: WRAPPER_W,
      overflow: "hidden",
      borderRadius: 8,
      border: "1px solid #D1D5DB",
    }}>
      <div style={{
        width: DOC_W,
        transform: `scale(${SCALE})`,
        transformOrigin: "top left",
        backgroundColor: "#E5E7EB",
        padding: "16px 0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>
        {totalPages === 0 ? (
          <PreviewPage pageNum={1} totalPages={1} pageBackground={pageBackground} date={displayDate}>
            <p style={{ fontSize: "9pt", opacity: 0.4, fontStyle: "italic" }}>No content to preview.</p>
          </PreviewPage>
        ) : (
          pages.map((pageItems, pageIdx) => (
            <PreviewPage
              key={pageIdx}
              pageNum={pageIdx + 1}
              totalPages={totalPages}
              pageBackground={pageBackground}
              date={displayDate}
            >
              {pageItems.map(({ key, node }) => (
                <div key={key}>{node}</div>
              ))}
            </PreviewPage>
          ))
        )}
      </div>
    </div>
  );
}
