import { useParams } from "wouter";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Loader2, Printer, ArrowLeft, Building2, User, Calendar,
  FileText, Zap, Wind, Gauge, AirVent, Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_DOC_SECTIONS, DEFAULT_PAGE_BACKGROUND,
  type DocSection, type DocumentFormatSettings,
} from "@shared/schema";
import { useOffer } from "@/hooks/use-offers";
import { getLocalizedField } from "@/lib/i18n/localize";
import { tOffer } from "@shared/i18n/offerLabels";
import { displayVersion } from "@shared/version";
import { expandNumericImagePlaceholders } from "@shared/lib/imagePlaceholders";
import { format } from "date-fns";

const toNum = (v: any) => parseFloat(String(v ?? "0")) || 0;

function machineImgSrc(filename: string | null | undefined): string {
  if (!filename) return "";
  const name = filename.toLowerCase();
  return `/machine-images/${name.includes(".") ? name : `${name}.png`}`;
}

function resolveSection(s: any): DocSection {
  const borderColor = s.borderColor ?? s.accentColor ?? "#E5E7EB";
  return {
    enabled:   true,
    fontSize:  11,
    alignment: "justified",
    font:      "Calibri",
    textColor: "#1F2937",
    fillColor: "#FFFFFF",
    ...s,
    borderColor,
  };
}

function SectionCard({
  sec,
  children,
  className = "",
  style = {},
}: {
  sec: DocSection;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-lg shadow-sm overflow-hidden ${className}`}
      style={{
        backgroundColor: sec.fillColor,
        border: `1px solid ${sec.borderColor}`,
        color: sec.textColor,
        fontFamily: sec.font,
        fontSize: `${sec.fontSize}pt`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHead({ children }: { children: React.ReactNode }) {
  return <div className="px-5 pt-4 pb-2">{children}</div>;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold mb-1 opacity-70 uppercase tracking-wide">
      {children}
    </div>
  );
}

function CardBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>;
}

function SpecRowsDisplay({ sec }: { sec: DocSection & { specRows?: { label: string; value: string }[] } }) {
  const rows = (sec.specRows ?? []).filter(r => r.label?.trim() || r.value?.trim());
  if (!rows.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-1">
      {rows.map((r, i) => (
        <div key={i} className="flex items-baseline gap-2 text-sm" style={{ fontFamily: sec.font, color: sec.textColor }}>
          {r.label?.trim() && <span className="font-semibold shrink-0">{r.label}:</span>}
          <span>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function PriceRow({
  label, value, bold = false, sub = false, red = false, badge, badgeIncluded, badgeExcluded,
}: {
  label: string; value?: string; bold?: boolean; sub?: boolean; red?: boolean;
  badge?: "included" | "excluded";
  badgeIncluded?: string; badgeExcluded?: string;
}) {
  return (
    <div className={`flex justify-between items-center py-1.5 border-b border-dashed border-black/10 last:border-0 ${red ? "text-red-500" : ""}`}>
      <span className={`${sub ? "text-xs pl-4 opacity-60" : "text-sm"} ${bold ? "font-semibold" : ""}`}>{label}</span>
      {badge ? (
        <span className={`shrink-0 ml-4 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
          badge === "included"
            ? "bg-green-100 text-green-700"
            : "bg-red-100 text-red-600"
        }`}>
          {badge === "included" ? (badgeIncluded ?? "INCLUDED") : (badgeExcluded ?? "EXCLUDED")}
        </span>
      ) : (
        <span className={`shrink-0 ml-4 ${sub ? "text-xs opacity-60" : "text-sm"} ${bold ? "font-bold" : ""}`}>{value}</span>
      )}
    </div>
  );
}

export default function OfferPrint() {
  const params = useParams<{ id: string }>();
  const offerId = parseInt(params.id || "0");

  const { data: offer, isLoading: offerLoading } = useOffer(offerId);
  const { data: formatData, isLoading: formatLoading } = useQuery<DocumentFormatSettings>({
    queryKey: ["/api/settings/document-format"],
  });

  // Fetch source machines so legacy [[IMGn]] placeholders can be resolved.
  // Hooks must run unconditionally; build the id list defensively.
  const uniqueMachineIds = Array.from(new Set(
    ((offer as any)?.items ?? [])
      .map((it: any) => Number(it.machineId))
      .filter((id: number) => Number.isFinite(id) && id > 0)
  )) as number[];
  const machineQueries = useQueries({
    queries: uniqueMachineIds.map((id) => ({ queryKey: ["/api/machines", id] as const, enabled: id > 0 })),
  });
  const machineDetailImagesById: Record<number, string[]> = {};
  machineQueries.forEach((q, idx) => {
    const m = q.data as any;
    if (m && Array.isArray(m.detailImages)) {
      machineDetailImagesById[uniqueMachineIds[idx]] = m.detailImages;
    }
  });

  const rawSections = formatData?.sections?.length ? formatData.sections : DEFAULT_DOC_SECTIONS;
  const sections = rawSections.map(resolveSection);
  const pageBackground = formatData?.pageBackground ?? DEFAULT_PAGE_BACKGROUND;

  useEffect(() => {
    if (offer?.referenceNumber) {
      document.title = offer.referenceNumber;
      return () => { document.title = "Talent Studio"; };
    }
  }, [offer?.referenceNumber]);

  if (offerLoading || formatLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-gray-50">
        <p className="text-gray-500">Offer not found</p>
        <Button variant="outline" onClick={() => window.close()}>Close</Button>
      </div>
    );
  }

  const contentLang = (offer as any).language ?? "it";
  const localizedItems = offer.items.map((item: any) => ({
    ...item,
    snapshotMachineName: getLocalizedField(item.snapshotTitles, item.snapshotMachineName, contentLang),
    snapshotMachineDescription: getLocalizedField(item.snapshotDescriptions, item.snapshotMachineDescription, contentLang),
    options: (item.options ?? []).map((opt: any) => ({
      ...opt,
      snapshotOptionName: getLocalizedField(opt.snapshotOptionTitles, opt.snapshotOptionName, contentLang),
    })),
  }));

  // Apply image-placeholder resolution using the machines fetched up-top.
  const expandedItems = localizedItems.map((item: any) => ({
    ...item,
    snapshotMachineDescription: expandNumericImagePlaceholders(
      item.snapshotMachineDescription,
      machineDetailImagesById[Number(item.machineId)] ?? [],
    ),
  }));

  const projectData = offer.projectData as any;
  const pricing = projectData?.pricing as any;
  const selectedPresets: Array<{ id: number; title: string; content: string }> =
    projectData?.selectedPresets || [];

  const utilitiesTotal = localizedItems.reduce(
    (acc: any, item: any) => {
      const qty = item.quantity;
      acc.electricalPower  += toNum(item.snapshotElectricalPower) * qty  + item.options.reduce((s: number, o: any) => s + toNum(o.snapshotElectricalPower) * (o.quantity ?? 1), 0);
      acc.compressedAir    += toNum(item.snapshotCompressedAir)   * qty  + item.options.reduce((s: number, o: any) => s + toNum(o.snapshotCompressedAir)   * (o.quantity ?? 1), 0);
      acc.exhaustedAir     += toNum(item.snapshotExhaustedAir)    * qty  + item.options.reduce((s: number, o: any) => s + toNum(o.snapshotExhaustedAir)    * (o.quantity ?? 1), 0);
      acc.airIntroduced    += toNum(item.snapshotAirIntroduced)   * qty  + item.options.reduce((s: number, o: any) => s + toNum(o.snapshotAirIntroduced)   * (o.quantity ?? 1), 0);
      acc.installationDays += toNum(item.snapshotInstallationDays)* qty;
      return acc;
    },
    { electricalPower: 0, compressedAir: 0, exhaustedAir: 0, airIntroduced: 0, installationDays: 0 }
  );
  const hasUtilities = Object.values(utilitiesTotal).some((v: any) => v > 0);

  const statusColors: Record<string, string> = {
    Draft:    "bg-blue-50   text-blue-700   border-blue-200",
    Sent:     "bg-yellow-50 text-yellow-700 border-yellow-200",
    Accepted: "bg-green-50  text-green-700  border-green-200",
    Rejected: "bg-red-50    text-red-700    border-red-200",
    Expired:  "bg-gray-50   text-gray-700   border-gray-200",
  };

  const perOfferHidden: string[] = projectData?.hiddenSections ?? [];
  const perOfferOrder: string[] | undefined = projectData?.sectionOrder?.length ? projectData.sectionOrder : undefined;
  const perOfferBreaks: string[] = projectData?.pageBreaks ?? [];
  const machineBreakPositions: number[] = projectData?.machineBreakPositions ?? [];

  const orderedSections: DocSection[] = perOfferOrder
    ? perOfferOrder.map((id: string) => sections.find(s => s.id === id)).filter(Boolean) as DocSection[]
    : sections;

  const renderSection = (sec: DocSection) => {
    if (!sec.enabled) return null;
    if (perOfferHidden.includes(sec.id)) return null;

    switch (sec.id) {

      // ── Header — Date, Salesman, Customer ────────────────────────────────────
      case "metadata": {
        const lbl = (key: string, fallback?: string) =>
          (sec as any).labels?.[key] || tOffer(key, contentLang) || fallback || key;
        const hi = projectData?.headerInfo ?? {};
        const displayDate = (() => {
          const src = hi.date || offer.date;
          try { return format(new Date(src), "MMMM d, yyyy"); } catch { return String(src); }
        })();
        const salesmanName   = hi.salesman?.name   || offer.salesmanName   || "";
        const salesmanEmail  = hi.salesman?.email  || (offer as any).salesmanEmail  || "";
        const salesmanMobile = hi.salesman?.mobile || (offer as any).salesmanMobile || "";
        const custName    = hi.customer?.name          || offer.customer?.name          || "";
        const custContact = hi.customer?.contactPerson || offer.customer?.contactPerson || "";
        const custEmail   = hi.customer?.email         || offer.customer?.email         || "";
        const custAddress = hi.customer?.address       || offer.customer?.address       || "";
        const metaCardStyle: React.CSSProperties = {
          flex: "1 1 0",
          minWidth: 0,
          backgroundColor: sec.fillColor,
          border: `1px solid ${sec.borderColor}`,
          color: sec.textColor,
          fontFamily: sec.font,
          fontSize: `${sec.fontSize}pt`,
          borderRadius: "8px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          padding: "16px 20px",
        };
        return (
          <div key={sec.id}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
              {[
                {
                  icon: <Calendar className="w-4 h-4" />,
                  label: lbl("dateBox", "DATE"),
                  content: (
                    <>
                      <p className="font-semibold">{displayDate}</p>
                      <p className="text-sm opacity-60">{lbl("refPrefix", "Ref.")} {offer.referenceNumber} &nbsp; V{displayVersion(offer.version)}</p>
                    </>
                  ),
                },
                {
                  icon: <User className="w-4 h-4" />,
                  label: lbl("salesmanBox", "SALESMAN"),
                  content: (
                    <>
                      <p className="font-semibold">{salesmanName}</p>
                      {salesmanEmail  && <p className="text-sm opacity-70">{salesmanEmail}</p>}
                      {salesmanMobile && <p className="text-sm opacity-70">{salesmanMobile}</p>}
                    </>
                  ),
                },
                {
                  icon: <Building2 className="w-4 h-4" />,
                  label: lbl("customerBox", "CUSTOMER"),
                  content: (
                    <>
                      <p className="font-semibold">{custName}</p>
                      {custContact && <p className="text-sm opacity-70">{custContact}</p>}
                      {custEmail   && <p className="text-sm opacity-70">{custEmail}</p>}
                      {custAddress && <p className="text-sm opacity-70">{custAddress}</p>}
                    </>
                  ),
                },
              ].map(({ icon, label, content }) => (
                <div key={label} style={metaCardStyle}>
                  <div className="flex items-center gap-2 text-xs font-semibold mb-2 opacity-60 uppercase tracking-wide pb-2" style={{ borderBottom: `1px solid ${sec.borderColor}` }}>
                    {icon}{label}
                  </div>
                  <div className="space-y-0.5">{content}</div>
                </div>
              ))}
            </div>
            <SpecRowsDisplay sec={sec as any} />
          </div>
        );
      }

      // ── Offer Title ───────────────────────────────────────────────────────────
      case "offer_title": {
        const intro = (sec as any).labels?.intro;
        const layoutVal = projectData?.layout ?? "";
        return (
          <SectionCard key={sec.id} sec={sec}>
            <CardBody className="py-5">
              {intro && <p className="text-sm italic opacity-70 mb-3 leading-relaxed">{intro}</p>}
              <p className="text-2xl font-bold">{offer.subject || "—"}</p>
              {layoutVal && (
                <p className="text-sm opacity-60 mt-2"><span className="font-semibold">{tOffer("layout", contentLang)}:</span> {layoutVal}</p>
              )}
              <SpecRowsDisplay sec={sec as any} />
            </CardBody>
          </SectionCard>
        );
      }

      // ── Technical Specifications ──────────────────────────────────────────────
      case "technical_specs": {
        const specs = projectData?.technicalSpecs as Record<string, string> | undefined;
        if (!specs) return null;
        const tsLbl = (key: string) => (sec as any).labels?.[key] || tOffer(key, contentLang);
        const intro = (sec as any).labels?.intro;
        const perOfferFields = ([
          [tsLbl("minMaxLength"),     specs.minMaxLength],
          [tsLbl("maxWidth"),         specs.maxWidth],
          [tsLbl("minMaxThickness"),  specs.minMaxThickness],
          [tsLbl("averageLineSpeed"), specs.averageLineSpeed],
          [tsLbl("controlSide"),      specs.controlSide],
          [tsLbl("maxBow"),           specs.maxBow],
          [tsLbl("paint"),            specs.paint],
          [tsLbl("substrate"),        specs.substrate],
          [tsLbl("finishing"),        specs.finishing],
        ] as [string, string][]).filter(([, v]) => v?.trim());

        const customSpecRows: { label: string; value: string }[] = (sec as any).specRows ?? [];
        const standardFields: [string, string][] = customSpecRows.length > 0
          ? customSpecRows.filter(r => r.value?.trim()).map(r => [r.label, r.value] as [string, string])
          : ([
              [tsLbl("standardVoltage"), specs.standardVoltage],
              [tsLbl("standardColors"),  specs.standardColors],
              [tsLbl("components"),      specs.components],
              [tsLbl("precautions"),     specs.precautions],
              [tsLbl("airIntake"),       specs.airIntake],
              [tsLbl("commissioning"),   specs.commissioning],
            ] as [string, string][]).filter(([, v]) => v?.trim());

        if (!perOfferFields.length && !standardFields.length) return null;
        return (
          <SectionCard key={sec.id} sec={sec}>
            <CardHead><CardTitle><FileText className="w-4 h-4" />{tOffer("projectData", contentLang)}</CardTitle></CardHead>
            <CardBody>
              {intro && <p className="text-sm italic opacity-70 mb-3 leading-relaxed">{intro}</p>}
              <div className="space-y-4">
                {perOfferFields.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {perOfferFields.map(([label, value]) => (
                      <div key={label} className="rounded-lg p-3" style={{ backgroundColor: "rgba(0,0,0,0.04)" }}>
                        <p className="text-xs font-medium uppercase tracking-wide opacity-50 mb-1">{label}</p>
                        <p className="text-sm font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
                {standardFields.length > 0 && (
                  <div className="space-y-3">
                    {perOfferFields.length > 0 && <div className="border-t border-black/10" />}
                    {standardFields.map(([label, value]) => (
                      <div key={label}>
                        <p className="text-xs font-medium uppercase tracking-wide opacity-50 mb-0.5">{label}</p>
                        <p className="text-sm whitespace-pre-wrap">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardBody>
          </SectionCard>
        );
      }

      // ── Utilities Summary ─────────────────────────────────────────────────────
      case "utilities_summary": {
        const uLbl = (key: string, fallback?: string) =>
          (sec as any).labels?.[key] || tOffer(key, contentLang) || fallback || key;
        return (
          <SectionCard key={sec.id} sec={sec} className="no-top-margin" style={{ breakAfter: "avoid", pageBreakAfter: "avoid" }}>
            <CardHead><CardTitle><Zap className="w-4 h-4" />{tOffer("utilitiesSummary", contentLang)}</CardTitle></CardHead>
            <CardBody>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: <Zap     className="w-3.5 h-3.5" />, label: uLbl("electricalPower"), val: `${utilitiesTotal.electricalPower.toFixed(1)}`, unit: uLbl("electricalPowerUnit", "kW")    },
                  { icon: <Gauge   className="w-3.5 h-3.5" />, label: uLbl("compressedAir"),   val: `${utilitiesTotal.compressedAir.toFixed(1)}`,   unit: uLbl("compressedAirUnit",   "Nl/min") },
                  { icon: <Wind    className="w-3.5 h-3.5" />, label: uLbl("exhaustedAir"),    val: `${utilitiesTotal.exhaustedAir.toFixed(1)}`,    unit: uLbl("exhaustedAirUnit",    "m³/h")  },
                  { icon: <AirVent className="w-3.5 h-3.5" />, label: uLbl("airIntroduced"),   val: `${utilitiesTotal.airIntroduced.toFixed(1)}`,   unit: uLbl("airIntroducedUnit",   "m³/h")  },
                ].map(r => (
                  <div key={r.label} className="flex flex-col gap-1 p-3 rounded-lg" style={{ backgroundColor: "rgba(0,0,0,0.04)" }}>
                    <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide opacity-50">
                      {r.icon}{r.label}
                    </div>
                    <p className="text-xl font-bold">{r.val} <span className="text-sm font-normal opacity-60">{r.unit}</span></p>
                  </div>
                ))}
              </div>
              <SpecRowsDisplay sec={sec as any} />
            </CardBody>
          </SectionCard>
        );
      }

      // ── Machine Cards — one per machine ──────────────────────────────────────
      case "machine_line": {
        const mlLbl = (key: string, fallback?: string) =>
          (sec as any).labels?.[key] || tOffer(key, contentLang) || fallback || key;
        const posPrefix = mlLbl("machinePosPrefix", "Machine — Pos.");
        const inclOptsLabel = mlLbl("includedOptions", "Included Options:");
        const bullet = (sec as any).labels?.optionBullet || "›";
        return (
          <>
            {expandedItems.map((item: any, index: number) => (
              <SectionCard key={item.id} sec={sec} style={machineBreakPositions.includes(index) ? { breakBefore: "page", pageBreakBefore: "always" } as React.CSSProperties : undefined}>
                <CardHead>
                  <CardTitle><FileText className="w-4 h-4" />{posPrefix} {item.position || index + 1}</CardTitle>
                </CardHead>
                <CardBody>
                  {item.snapshotImageUrl && (
                    <div className="mb-4">
                      <img
                        src={machineImgSrc(item.snapshotImageUrl)}
                        alt={item.snapshotMachineName}
                        style={{ width: "480px", maxWidth: "100%", height: "auto", maxHeight: "360px", objectFit: "contain", borderRadius: "8px", backgroundColor: "rgba(0,0,0,0.03)" }}
                        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <p className="text-base font-bold">{item.snapshotMachineName}</p>
                    {item.quantity > 1 && (
                      <Badge variant="secondary" className="text-xs">×{item.quantity}</Badge>
                    )}
                    {item.snapshotMacroType && (
                      <Badge variant="outline" className="text-xs">{item.snapshotMacroType}</Badge>
                    )}
                  </div>
                  {item.snapshotImageUrl && (
                    <div className="mb-3">
                      <img
                        src={`/machine-images/${item.snapshotImageUrl.includes(".") ? item.snapshotImageUrl : `${item.snapshotImageUrl}.png`}`}
                        alt={item.snapshotMachineName}
                        className="max-w-full h-auto max-h-[300px] object-contain"
                      />
                    </div>
                  )}
                  {item.snapshotMachineDescription && (
                    <div className="text-sm opacity-70 mb-4 space-y-2">
                      {item.snapshotMachineDescription.split(/\[\[IMG:([^\]]+)\]\]/).map((part: string, pi: number) =>
                        pi % 2 === 0 ? (
                          part.trim() ? <p key={pi} className="whitespace-pre-wrap">{part}</p> : null
                        ) : (
                          <div key={pi} className="my-2">
                            <img
                              src={`/machine-images/${part}`}
                              alt={`${tOffer("detail", contentLang)} ${Math.ceil(pi / 2)}`}
                              className="max-w-full h-auto max-h-[260px] object-contain"
                            />
                          </div>
                        )
                      )}
                    </div>
                  )}
                  {item.options.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-50 mb-1">{inclOptsLabel}</p>
                      {item.options.map((opt: any) => {
                        const optQty = opt.quantity ?? 1;
                        return (
                          <div key={opt.id} className="flex items-start gap-1.5">
                            <span className="text-xs opacity-40 shrink-0 mt-0.5">{bullet}</span>
                            <span className="text-sm opacity-80">
                              {opt.snapshotOptionName}{optQty > 1 ? ` ×${optQty}` : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardBody>
              </SectionCard>
            ))}
            <SpecRowsDisplay sec={sec as any} />
          </>
        );
      }

      // ── Price Overview ────────────────────────────────────────────────────────
      case "price_overview": {
        if (!pricing) return null;
        const items: { label: string; value?: string; bold?: boolean; sub?: boolean; red?: boolean; badge?: "included" | "excluded" }[] = [];

        expandedItems.forEach((item: any, index: number) => {
          const basePrice   = toNum(item.snapshotBasePrice);
          const machineQty  = item.quantity ?? 1;
          const comment     = pricing?.itemComments?.[index]?.machineComment;
          const hiddenMap   = pricing?.itemComments?.[index]?.optionPriceHidden;
          const hiddenUnitTotal = (item.options ?? []).reduce((s: number, opt: any) => {
            if (!hiddenMap?.[opt.machineOptionId]) return s;
            return s + toNum(opt.snapshotPriceModifier) * (opt.quantity ?? 1);
          }, 0);
          const displayedUnit = basePrice + hiddenUnitTotal;

          items.push({
            label: `${tOffer("positionPrefix", contentLang)} ${item.position || index + 1} — ${item.snapshotMachineName}${machineQty > 1 ? ` ×${machineQty}` : ""}${comment ? ` (${comment})` : ""}`,
            value: `€${(displayedUnit * machineQty).toLocaleString()}`,
          });

          item.options.forEach((opt: any) => {
            const optQty    = opt.quantity ?? 1;
            const optPrice  = toNum(opt.snapshotPriceModifier);
            const isHidden  = pricing?.itemComments?.[index]?.optionPriceHidden?.[opt.machineOptionId];
            const totalOptPrice = optPrice * optQty * machineQty;
            items.push({
              label: `${opt.snapshotOptionName}${optQty > 1 ? ` ×${optQty}` : ""}${machineQty > 1 ? ` (×${machineQty})` : ""}`,
              value: isHidden ? tOffer("incl", contentLang) : `+€${totalOptPrice.toLocaleString()}`,
              sub: true,
            });
          });
        });

        const pl = {
          ...{
            interlocking:    tOffer("interlocking",    contentLang),
            totalListPrice:  tOffer("totalListPrice",  contentLang),
            installation:    tOffer("installation",    contentLang),
            travelCosts:     tOffer("travelCosts",     contentLang),
            boardLodging:    tOffer("boardLodging",    contentLang),
            training:        tOffer("training",        contentLang),
            packaging:       tOffer("packaging",       contentLang),
            transport:       tOffer("transport",       contentLang),
            grossTotal:      tOffer("grossTotal",      contentLang),
            netTotal:        tOffer("netTotal",        contentLang),
          },
          ...(pricing.priceLabels ?? {}),
        };

        if (pricing.interlockingTotal > 0) {
          items.push({ label: pl.interlocking, value: `€${Number(pricing.interlockingTotal).toLocaleString()}` });
        }

        if ((pricing.extraItems || []).length > 0) {
          (pricing.extraItems as any[]).forEach((ex: any) => {
            if (ex.description) items.push({ label: ex.description, value: `€${Number(ex.price).toLocaleString()}` });
          });
        }

        const totalListPrice = toNum(pricing.totalListPrice ?? pricing.grossTotal);
        items.push({ label: pl.totalListPrice, value: `€${totalListPrice.toLocaleString()}`, bold: true });

        items.push({ label: "", value: "", separator: true } as any);
        items.push({ label: tOffer("netServicePrices", contentLang), value: "", sectionHeader: true } as any);

        const inst = pricing.installationConfig;
        {
          const instLabel = [
            pl.installation,
            !inst?.hideTotalDays && inst?.totalDays ? `${inst.totalDays} ${tOffer("days", contentLang)}` : "",
            !inst?.hideDailyFee && inst?.dailyFee   ? `€${inst.dailyFee}${tOffer("perDay", contentLang)}` : "",
          ].filter(Boolean).join(" · ");
          if (inst?.included) {
            items.push({ label: instLabel, value: !inst.hideTotalPrice ? `€${inst.totalPrice.toLocaleString()}` : tOffer("tbd", contentLang) });
          } else {
            items.push({ label: instLabel, badge: "excluded" as const });
          }
        }

        const si = pricing.serviceItems ?? {};
        items.push({ label: pl.travelCosts, badge: si.travelCosts ? "included" as const : "excluded" as const });
        items.push({ label: pl.boardLodging, badge: si.boardLodging ? "included" as const : "excluded" as const });
        items.push({
          label: `${pl.training} (${si.trainingDays || 0} ${tOffer("days", contentLang)})`,
          badge: (si.trainingIncluded !== false) ? "included" as const : "excluded" as const,
        });
        items.push({ label: pl.packaging,   badge: si.packaging ? "included" as const : "excluded" as const });
        if (si.transportIncluded) {
          items.push({ label: pl.transport, value: `€${Number(si.transportPrice ?? 0).toLocaleString()}` });
        } else {
          items.push({ label: pl.transport, badge: "excluded" as const });
        }

        const grossTotal = toNum(pricing.grossTotal || pricing.netTotal);
        items.push({ label: pl.grossTotal, value: `€${grossTotal.toLocaleString()}`, bold: true });

        if (pricing.discountAmount > 0) {
          items.push({ label: `${tOffer("discount", contentLang)} (${pricing.discountPercent}%)`, value: `-€${Number(pricing.discountAmount).toLocaleString()}`, red: true });
        }

        const netTotal = toNum(pricing.netTotal);
        items.push({ label: pl.netTotal, value: `€${netTotal.toLocaleString()}`, bold: true });

        return (
          <SectionCard key={sec.id} sec={sec}>
            <CardHead><CardTitle><Receipt className="w-4 h-4" />{tOffer("priceOverview", contentLang)}</CardTitle></CardHead>
            <CardBody>
              <div className="space-y-0">
                {items.map((row: any, i: number) => {
                  if (row.separator) return <div key={i} className="py-2" />;
                  if (row.sectionHeader) return (
                    <div key={i} className="text-xs font-bold uppercase tracking-wide opacity-50 pt-1 pb-2">{row.label}</div>
                  );
                  return <PriceRow key={i} label={row.label} value={row.value} bold={row.bold} sub={row.sub} red={row.red} badge={row.badge} badgeIncluded={tOffer("included", contentLang)} badgeExcluded={tOffer("excluded", contentLang)} />;
                })}
              </div>
              <SpecRowsDisplay sec={sec as any} />
            </CardBody>
          </SectionCard>
        );
      }

      // ── Terms & Conditions — one card per preset, each on a new page ─────────
      case "terms_conditions": {
        if (!selectedPresets.length) return null;
        const intro = (sec as any).labels?.intro;
        return (
          <>
            {selectedPresets.map((preset, i) => (
              <div key={i} style={{ breakBefore: "page", pageBreakBefore: "always" }}>
                <SectionCard sec={sec}>
                  {preset.title && (
                    <CardHead>
                      {i === 0 && intro && <p className="text-sm italic opacity-70 mb-2 leading-relaxed">{intro}</p>}
                      <CardTitle>{preset.title}</CardTitle>
                    </CardHead>
                  )}
                  <CardBody className={preset.title ? "" : "pt-5"}>
                    {!preset.title && i === 0 && intro && <p className="text-sm italic opacity-70 mb-2 leading-relaxed">{intro}</p>}
                    <p className="text-sm whitespace-pre-wrap opacity-80 leading-relaxed">{preset.content}</p>
                  </CardBody>
                </SectionCard>
              </div>
            ))}
            <SpecRowsDisplay sec={sec as any} />
          </>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: pageBackground }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 22mm 14mm 18mm 14mm; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

          /* Header repeats on every page */
          .pdf-page-header {
            position: fixed;
            top: 0; left: 0; right: 0;
            height: 18mm;
            display: flex !important;
            align-items: center;
            justify-content: space-between;
            padding: 0 0mm;
            background: white;
            border-bottom: 1px solid #E5E7EB;
            z-index: 1000;
          }

          /* Footer repeats on every page */
          .pdf-page-footer {
            position: fixed;
            bottom: 0; left: 0; right: 0;
            height: 13mm;
            display: flex !important;
            align-items: center;
            justify-content: space-between;
            padding: 0 0mm;
            background: white;
            border-top: 1px solid #E5E7EB;
            z-index: 1000;
          }

          .print-doc { padding-top: 0 !important; padding-bottom: 0 !important; }

  .section:first-child {
    margin-top: 0 !important;
  }
  .section {
    margin-top: 14px;
  }
  .section.no-top-margin {
    margin-top: 0 !important;
  }
        }

        /* Screen only: show header inline, not fixed */
        @media screen {
          .pdf-page-header { display: none; }
          .pdf-page-footer { display: none; }
        }
      `}</style>

      {/* ── Fixed print header (logo + ref) — shows on every PDF page ── */}
      <div className="pdf-page-header">
        <img
          src="/api/logo"
          style={{ height: 29, objectFit: "contain" }}
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          alt=""
        />
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-700">{offer.referenceNumber}</span>
          <span className="text-xs text-gray-400">V{displayVersion(offer.version)}</span>
        </div>
      </div>

      {/* ── Fixed print footer — shows on every PDF page ── */}
      <div className="pdf-page-footer" />

      {/* ── Screen toolbar ── */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => window.close()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Close
        </Button>
        <span className="font-semibold text-sm text-gray-600">
          {offer.referenceNumber} — PDF Preview
        </span>
        <Button size="sm" onClick={() => window.print()} data-testid="button-print">
          <Printer className="w-4 h-4 mr-2" />
          Print / Save as PDF
        </Button>
      </div>

      {/* ── Document body ── */}
      <div className="print-doc pt-16 pb-10">
        <div className="max-w-6xl mx-auto px-4 space-y-5">

          {/* Screen-only inline header: logo + ref */}
          <div className="flex items-start justify-between pt-2">
            <img
              src="/api/logo"
              style={{ height: 44, objectFit: "contain" }}
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
              alt=""
            />
            <div className="flex items-center gap-2 justify-end">
              <span className="text-xl font-bold">{offer.referenceNumber}</span>
              <Badge variant="secondary" className="font-mono">V{displayVersion(offer.version)}</Badge>
              <Badge variant="outline" className={statusColors[offer.status] ?? "bg-gray-50 text-gray-700 border-gray-200"}>
                {offer.status}
              </Badge>
            </div>
          </div>

          {/* Sections in configured order */}
          {orderedSections.map((sec) => {
            const rendered = renderSection(sec);
            if (!rendered) return null;
            if (perOfferBreaks.includes(sec.id)) {
              return (
                <div key={`pb-${sec.id}`} style={{ breakBefore: "page", pageBreakBefore: "always" }}>
                  {rendered}
                </div>
              );
            }
            return rendered;
          })}

        </div>
      </div>
    </div>
  );
}
