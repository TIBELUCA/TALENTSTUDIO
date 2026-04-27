import { useMemo } from "react";
import { FileText } from "lucide-react";

interface CartItemMin {
  tempId: string;
  machineId: number;
  selectedOptionIds: number[];
  [key: string]: any;
}

interface PresetItem {
  id: number | string;
  title: string;
  [key: string]: any;
}

interface MachineMin {
  id: number;
  name: string;
  [key: string]: any;
}

interface Props {
  sectionOrder: string[];
  pageBreaks: string[];
  hiddenSections: string[];
  cartItems: CartItemMin[];
  machineOrder: string[];
  machinePageBreaks: string[];
  selectedPresets: PresetItem[];
  formatSettings: any | null;
  machines?: MachineMin[];
  subject?: string;
}

const DEFAULT_LABELS: Record<string, string> = {
  metadata:          "CUSTOMER & OFFER DETAILS",
  offer_title:       "OFFER TITLE",
  technical_specs:   "TECHNICAL SPECIFICATIONS",
  machine_line:      "DESCRIPTION OF THE MACHINE",
  utilities_summary: "UTILITIES SUMMARY",
  price_overview:    "PRICE OVERVIEW",
  terms_conditions:  "TERMS & CONDITIONS",
};

const DEFAULT_FILL: Record<string, string> = {
  metadata:          "#EEF2FF",
  offer_title:       "#FEFCE8",
  technical_specs:   "#EFF6FF",
  machine_line:      "#F0FDF4",
  utilities_summary: "#FFF1F2",
  price_overview:    "#FAF5FF",
  terms_conditions:  "#FFF7ED",
};

const DEFAULT_BORDER: Record<string, string> = {
  metadata:          "#C7D2FE",
  offer_title:       "#FEF08A",
  technical_specs:   "#BFDBFE",
  machine_line:      "#BBF7D0",
  utilities_summary: "#FECDD3",
  price_overview:    "#E9D5FF",
  terms_conditions:  "#FED7AA",
};

/* ── height model (abstract units; usable page = 820u) ──────────────── */
const U_PAGE = 820;
const U_GAP  = 16;

function unitH(secId: string, optCount = 0, cartLen = 0): number {
  switch (secId) {
    case "metadata":          return 115;
    case "offer_title":       return 70;
    case "technical_specs":   return 145;
    case "machine_line":      return Math.min(195 + optCount * 12, 370);
    case "utilities_summary": return 125;
    case "price_overview":    return Math.min(155 + cartLen * 10, 290);
    case "terms_conditions":  return 195;
    default:                  return 110;
  }
}

/* ── box descriptor ─────────────────────────────────────────────────── */
interface Box {
  id: string;
  secId: string;
  label: string;
  subLabel?: string;
  optionCount?: number;
  height: number;
  fill: string;
  border: string;
  forceBreak: boolean;
}

function buildBoxes(props: Props): Box[] {
  const {
    sectionOrder, pageBreaks, hiddenSections,
    cartItems, machineOrder, machinePageBreaks,
    selectedPresets, formatSettings, machines, subject,
  } = props;

  const sections: any[] = formatSettings?.sections ?? [];
  const enabledIds = new Set(sections.filter((s: any) => s.enabled).map((s: any) => s.id));

  const enabledIdsArr = Array.from(enabledIds);
  const displayOrder = sectionOrder.length > 0
    ? [
        ...sectionOrder.filter(id => enabledIds.has(id)),
        ...enabledIdsArr.filter(id => !sectionOrder.includes(id)),
      ]
    : enabledIdsArr;

  const visible = displayOrder.filter(id => !hiddenSections.includes(id));

  const orderedCart: CartItemMin[] = machineOrder.length > 0
    ? machineOrder.map(tid => cartItems.find(c => c.tempId === tid)!).filter(Boolean)
    : cartItems;

  const boxes: Box[] = [];

  visible.forEach(secId => {
    const sec = sections.find((s: any) => s.id === secId);
    const fill   = sec?.fillColor   || DEFAULT_FILL[secId]   || "#F3F4F6";
    const border = sec?.borderColor || DEFAULT_BORDER[secId] || "#E5E7EB";
    const label  = sec?.label ? sec.label.toUpperCase() : (DEFAULT_LABELS[secId] || secId.toUpperCase());
    const inBreaks = pageBreaks.includes(secId);

    if (secId === "machine_line") {
      if (orderedCart.length === 0) {
        boxes.push({ id: "machine_placeholder", secId, label, height: 195, fill, border, forceBreak: inBreaks });
      } else {
        orderedCart.forEach((item, i) => {
          const machine = machines?.find(m => m.id === item.machineId);
          const optCount = item.selectedOptionIds?.length ?? 0;
          const machineName = machine?.name ?? `Machine`;
          const isFirst = i === 0;
          const machineBreak = machinePageBreaks.includes(item.tempId);
          boxes.push({
            id: `machine_${item.tempId}`,
            secId,
            label: `POS. ${i + 1}`,
            subLabel: machineName,
            optionCount: optCount,
            height: unitH("machine_line", optCount),
            fill,
            border,
            forceBreak: (inBreaks && isFirst) || (!isFirst && machineBreak),
          });
        });
      }
    } else if (secId === "terms_conditions") {
      if (selectedPresets.length === 0) {
        boxes.push({ id: "terms_placeholder", secId, label, height: 195, fill, border, forceBreak: inBreaks });
      } else {
        selectedPresets.forEach((preset, i) => {
          const isFirst = i === 0;
          boxes.push({
            id: `terms_${preset.id}`,
            secId,
            label: (preset.title || "TERMS").toUpperCase().slice(0, 26),
            height: 195,
            fill,
            border,
            forceBreak: inBreaks && isFirst,
          });
        });
      }
    } else {
      const h = unitH(secId, 0, cartItems.length);
      const subLabel = secId === "offer_title" && subject ? subject.slice(0, 36) : undefined;
      boxes.push({ id: `${secId}_0`, secId, label, subLabel, height: h, fill, border, forceBreak: inBreaks });
    }
  });

  return boxes;
}

/* ── paginator ─────────────────────────────────────────────────────── */
interface PageData {
  boxes: Array<Box & { px: number }>;
  emptyU: number;
}

function paginate(boxes: Box[]): PageData[] {
  if (boxes.length === 0) return [];
  const pages: PageData[] = [{ boxes: [], emptyU: U_PAGE }];

  boxes.forEach(box => {
    const cur = pages[pages.length - 1];
    const gap  = cur.boxes.length > 0 ? U_GAP : 0;
    const need = gap + box.height;

    if (box.forceBreak && cur.boxes.length > 0) {
      pages.push({ boxes: [], emptyU: U_PAGE });
    } else if (cur.emptyU < need && cur.boxes.length > 0) {
      pages.push({ boxes: [], emptyU: U_PAGE });
    }

    const page = pages[pages.length - 1];
    const actualGap = page.boxes.length > 0 ? U_GAP : 0;
    page.emptyU = Math.max(0, page.emptyU - actualGap - box.height);
    page.boxes.push({ ...box, px: 0 }); // px computed in render
  });

  return pages;
}

/* ── page thumbnail constants ───────────────────────────────────────── */
const PG_W  = 234;   // px — page card width
const PG_H  = 331;   // px — A4 proportion (297/210 * 234 ≈ 331)
const PG_PAD = 10;   // px — inner padding
const CONTENT_H = PG_H - PG_PAD * 2;  // usable height inside page

function uToPx(u: number): number {
  return Math.round((u / U_PAGE) * CONTENT_H);
}

/* ── component ─────────────────────────────────────────────────────── */
export function PageLayoutPreview(props: Props) {
  const { cartItems, selectedPresets, sectionOrder, formatSettings } = props;

  const pages = useMemo(() => {
    const boxes = buildBoxes(props);
    return paginate(boxes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.sectionOrder, props.pageBreaks, props.hiddenSections,
    props.cartItems, props.machineOrder, props.machinePageBreaks,
    props.selectedPresets, props.formatSettings, props.machines, props.subject,
  ]);

  const hasAnything = cartItems.length > 0 || selectedPresets.length > 0 || sectionOrder.length > 0 || formatSettings?.sections?.length;

  if (!hasAnything) {
    return (
      <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg text-muted-foreground gap-2">
        <FileText className="w-8 h-8 opacity-40" />
        <p className="text-sm text-center px-4">Add machines and terms in earlier steps to see the layout preview</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto pb-3">
        <div className="flex gap-4 min-w-0" style={{ minHeight: PG_H + 4 }}>
          {pages.map((page, pageIdx) => (
            <PageCard key={pageIdx} page={page} pageIdx={pageIdx} total={pages.length} />
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Estimated {pages.length} page{pages.length !== 1 ? "s" : ""} — actual layout may vary with real content length
      </p>
    </div>
  );
}

function PageCard({ page, pageIdx, total }: { page: PageData; pageIdx: number; total: number }) {
  return (
    <div
      className="relative bg-white border border-gray-300 rounded shadow-md shrink-0 overflow-hidden"
      style={{ width: PG_W, height: PG_H, padding: PG_PAD }}
      data-testid={`preview-page-${pageIdx}`}
    >
      {/* Subtle header line mimicking PDF header */}
      <div className="absolute top-0 left-0 right-0 h-[5px] bg-gray-100 border-b border-gray-200" />

      <div className="flex flex-col gap-0 mt-[5px] h-full">
        {page.boxes.map((box, bi) => {
          const heightPx = uToPx(box.height);
          const gapPx   = bi > 0 ? uToPx(U_GAP) : 0;
          return (
            <SectionBox key={box.id} box={box} heightPx={heightPx} gapPx={gapPx} />
          );
        })}

        {/* Empty space indicator */}
        {page.emptyU > U_GAP * 2 && (
          <div
            className="flex-1 mt-1 border border-dashed border-gray-200 rounded-sm"
            style={{ minHeight: uToPx(Math.min(page.emptyU, U_PAGE * 0.15)) }}
          />
        )}
      </div>

      {/* Page number badge */}
      <div className="absolute bottom-1.5 right-2 flex items-center gap-0.5">
        <span className="text-gray-400" style={{ fontSize: 7 }}>{pageIdx + 1}/{total}</span>
      </div>
    </div>
  );
}

function SectionBox({ box, heightPx, gapPx }: { box: Box & { px: number }; heightPx: number; gapPx: number }) {
  const MIN_H = 18;
  const h = Math.max(heightPx, MIN_H);

  return (
    <div style={{ marginTop: gapPx }}>
      <div
        className="rounded-sm overflow-hidden"
        style={{
          height: h,
          backgroundColor: box.fill,
          border: `1px solid ${box.border}`,
        }}
        title={`${box.label}${box.subLabel ? ` — ${box.subLabel}` : ""}`}
      >
        {/* Section header bar */}
        <div
          className="flex items-center px-1.5"
          style={{
            height: Math.min(11, h * 0.35),
            backgroundColor: box.border,
          }}
        >
          <span
            className="font-bold tracking-wide truncate text-gray-600 leading-none"
            style={{ fontSize: 6 }}
          >
            {box.label}
          </span>
        </div>

        {/* Content area */}
        {h > 22 && (
          <div className="px-1.5 py-0.5 flex flex-col gap-0.5 overflow-hidden">
            {box.subLabel && (
              <span
                className="text-gray-700 font-medium truncate leading-none"
                style={{ fontSize: 7 }}
              >
                {box.subLabel}
              </span>
            )}

            {/* Option/content dots */}
            {box.secId === "machine_line" && box.optionCount !== undefined && box.optionCount > 0 && h > 35 && (
              <div className="flex flex-col gap-px mt-0.5 overflow-hidden">
                {Array.from({ length: Math.min(box.optionCount, 4) }).map((_, i) => (
                  <div key={i} className="flex items-center gap-0.5">
                    <div className="w-1 h-px rounded-full" style={{ backgroundColor: box.border }} />
                    <div className="rounded-sm" style={{ height: 3, width: `${40 + (i % 3) * 15}%`, backgroundColor: box.border, opacity: 0.6 }} />
                  </div>
                ))}
                {box.optionCount > 4 && (
                  <span className="text-gray-400 leading-none" style={{ fontSize: 5 }}>+{box.optionCount - 4} more</span>
                )}
              </div>
            )}

            {/* Generic content lines for non-machine sections */}
            {box.secId !== "machine_line" && h > 30 && (
              <div className="flex flex-col gap-px mt-0.5 overflow-hidden">
                {Array.from({ length: Math.min(3, Math.floor((h - 24) / 7)) }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-sm"
                    style={{
                      height: 3,
                      width: i === 0 ? "75%" : i === 1 ? "55%" : "65%",
                      backgroundColor: box.border,
                      opacity: 0.5,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
