import { useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { GripVertical, FileText, Save, RotateCcw, ChevronDown, ChevronRight, Plus, Minus, Trash2, Bold, Italic, Upload, Image, Hash, Calendar, Building2, Eye, EyeOff, RefreshCw, Loader2, Type } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  type DocSection, type DocumentFormatSettings, type HeaderConfig, type FooterConfig, type SectionPart, type HeaderTextStyle,
  type OfferReferenceFormatConfig,
  DEFAULT_DOC_SECTIONS, DEFAULT_PAGE_BACKGROUND, DEFAULT_BORDER_RADIUS, DEFAULT_BORDER_WIDTH,
  DEFAULT_SECTION_LABELS, DEFAULT_HEADER_CONFIG, DEFAULT_FOOTER_CONFIG, DEFAULT_SECTION_PARTS,
  DEFAULT_OFFER_NUMBER_STYLE, DEFAULT_DATE_STYLE,
  DEFAULT_OFFER_REFERENCE_FORMAT,
  buildOfferReferenceCore, buildOfferReferenceVersionSuffix,
} from "@shared/schema";

const ALIGNMENT_OPTIONS = [
  { value: "justified", label: "Justified" },
  { value: "left",      label: "Left" },
  { value: "center",    label: "Center" },
  { value: "right",     label: "Right" },
];

const PARTS_ONLY_SECTIONS = new Set(["metadata", "offer_title", "technical_specs", "utilities_summary", "machine_line", "price_overview", "terms_conditions"]);

const FONT_OPTIONS = [
  { value: "Outfit",          label: "Outfit" },
  { value: "Inter",           label: "Inter" },
  { value: "Calibri",         label: "Calibri" },
  { value: "Arial",           label: "Arial" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Georgia",         label: "Georgia" },
  { value: "Cambria",         label: "Cambria" },
  { value: "Garamond",        label: "Garamond" },
];

function resolveSection(s: any): DocSection {
  const borderColor = s.borderColor ?? s.accentColor ?? "#E5E7EB";
  const mergedLabels = { ...(DEFAULT_SECTION_LABELS[s.id] ?? {}), ...(s.labels ?? {}) };

  // Migrate technical_specs list rows from old per-key labels to specRows array
  let specRows = s.specRows as DocSection["specRows"] | undefined;
  if (s.id === "technical_specs" && !specRows) {
    const L = mergedLabels as any;
    specRows = [
      { label: L.standardVoltage ?? "Standard voltage", value: L.standardVoltageVal ?? "" },
      { label: L.standardColors  ?? "Standard colors",  value: L.standardColorsVal  ?? "" },
      { label: L.components      ?? "Components",       value: L.componentsVal      ?? "" },
      { label: L.precautions     ?? "Precautions",      value: L.precautionsVal     ?? "" },
      { label: L.airIntake       ?? "Air intake",       value: L.airIntakeVal       ?? "" },
      { label: L.commissioning   ?? "Commissioning",    value: L.commissioningVal   ?? "" },
    ];
  }

  let parts = s.parts as SectionPart[] | undefined;
  if (s.id === "metadata" && parts) {
    const hasContentA = parts.some((p: SectionPart) => p.id === "contentA");
    if (!hasContentA) {
      const oldDetail = parts.find((p: SectionPart) => p.id === "detailRows");
      const defaults = DEFAULT_SECTION_PARTS.metadata;
      parts = [
        parts.find((p: SectionPart) => p.id === "sectionTitle") ?? defaults[0],
        oldDetail ? { ...oldDetail, id: "contentA", label: "Content A" } : defaults[1],
        defaults[2],
      ];
    }
  }

  const sectionDefaults = DEFAULT_SECTION_PARTS[s.id as keyof typeof DEFAULT_SECTION_PARTS];
  if (sectionDefaults && parts) {
    const expectedIds = sectionDefaults.map((d: SectionPart) => d.id);
    const hasExpected = expectedIds.every((id: string) => parts!.some((p: SectionPart) => p.id === id));
    if (!hasExpected) {
      parts = sectionDefaults;
    }
  }

  return {
    enabled:        true,
    fontSize:       11,
    alignment:      "justified",
    font:           "Calibri",
    textColor:      "#1F2937",
    fillColor:      "#FFFFFF",
    lineHeight:     1.45,
    titleFont:      "Calibri",
    titleFontSize:  7.5,
    titleTextColor: "#9CA3AF",
    titleFillColor: "",
    titleAlignment: "left",
    titleBold:      true,
    ...s,
    borderColor,
    labels: mergedLabels,
    specRows,
    ...(parts ? { parts } : {}),
  };
}

function CustomSectionEditor({ sec, onUpdate }: { sec: DocSection; onUpdate: (c: Partial<DocSection>) => void }) {
  const rows = sec.rows ?? [];
  const setRows = (next: DocSection["rows"]) => onUpdate({ rows: next });

  const addRow    = () => setRows([...rows, { text: "", bold: false }]);
  const removeRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<(typeof rows)[0]>) =>
    setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const bodyStyle: CSSProperties = {
    fontFamily: sec.font ?? "Calibri",
    fontSize: `${sec.fontSize}pt`,
    color: sec.textColor,
    padding: "10px 12px",
  };
  const cardStyle: CSSProperties = {
    backgroundColor: sec.fillColor,
    border: `1px solid ${sec.borderColor}`,
    borderRadius: "6px",
    overflow: "hidden",
    marginTop: "10px",
  };
  const titleStyle: CSSProperties = {
    fontFamily: sec.titleFont ?? "Calibri",
    fontSize: `${sec.titleFontSize ?? 7.5}pt`,
    color: sec.titleTextColor ?? "#9CA3AF",
    backgroundColor: sec.titleFillColor || "transparent",
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: "6px 12px 5px",
    borderBottom: `1px solid ${sec.borderColor}`,
  };

  return (
    <div style={cardStyle}>
      <div style={titleStyle}>{sec.label ?? sec.name}</div>
      <div style={bodyStyle}>
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground italic mb-2">No rows yet — click "Add row" below.</p>
        )}
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-1.5 mb-1.5">
            <input
              value={row.text}
              onChange={e => updateRow(i, { text: e.target.value })}
              placeholder="Row text..."
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                borderBottom: "1px dashed rgba(0,0,0,0.18)",
                outline: "none",
                fontFamily: sec.font,
                fontSize: `${sec.fontSize}pt`,
                fontWeight: row.bold ? 700 : 400,
                color: sec.textColor,
                padding: "1px 4px",
              }}
            />
            <button
              type="button"
              onClick={() => updateRow(i, { bold: !row.bold })}
              title="Toggle bold"
              className={`p-1 rounded text-xs border transition-colors ${row.bold ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}
            >
              <Bold className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => removeRow(i)}
              title="Remove row"
              className="p-1 rounded text-xs border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="mt-2 flex items-center gap-1 text-[10px] text-primary hover:underline"
        >
          <Plus className="w-3 h-3" /> Add row
        </button>
      </div>
    </div>
  );
}

function SpecRowsEditor({ sec, onUpdate }: {
  sec: DocSection;
  onUpdate: (changes: Partial<DocSection>) => void;
}) {
  const rows = sec.specRows ?? [];
  const setRows = (next: typeof rows) => onUpdate({ specRows: next });
  const addRow = () => setRows([...rows, { label: "", value: "" }]);
  const removeRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i));
  const patchRow = (i: number, patch: Partial<typeof rows[0]>) =>
    setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const inputStyle: CSSProperties = {
    background: "transparent", border: "none",
    borderBottom: "1px dashed rgba(0,0,0,0.18)", outline: "none",
    fontFamily: sec.font, fontSize: `${sec.fontSize}pt`,
    color: sec.textColor, padding: "1px 2px",
  };

  return (
    <div style={{ marginTop: rows.length > 0 ? 8 : 2 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <input
              value={row.label}
              onChange={e => patchRow(i, { label: e.target.value })}
              placeholder="Label..."
              style={{ ...inputStyle, width: "42%", flexShrink: 0, fontWeight: 600 }}
            />
            <span style={{ color: "#D1D5DB", flexShrink: 0 }}>:</span>
            <input
              value={row.value}
              onChange={e => patchRow(i, { value: e.target.value })}
              placeholder="Value..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              style={{ flexShrink: 0, padding: "0 4px", background: "none", border: "none", cursor: "pointer", color: "#EF4444", fontSize: 15, lineHeight: 1 }}
              title="Remove row"
            >×</button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-1 flex items-center gap-1 text-[10px] text-primary hover:underline"
      >
        <Plus className="w-3 h-3" /> Add row
      </button>
    </div>
  );
}

function SectionPreview({ sec, onUpdate }: {
  sec: DocSection;
  onUpdate: (changes: Partial<DocSection>) => void;
}) {
  const updateLabel = (key: string, value: string) =>
    onUpdate({ labels: { ...(sec.labels ?? {}), [key]: value } });

  if (sec.type === "custom") return <CustomSectionEditor sec={sec} onUpdate={onUpdate} />;

  const lbl = (key: string) => sec.labels?.[key] ?? DEFAULT_SECTION_LABELS[sec.id]?.[key] ?? key;

  const titleStyle: CSSProperties = {
    fontFamily: sec.titleFont ?? "Calibri",
    fontSize: `${(sec.titleFontSize ?? 7.5)}pt`,
    color: sec.titleTextColor ?? "#9CA3AF",
    backgroundColor: sec.titleFillColor || "transparent",
    fontWeight: sec.titleBold !== false ? "bold" : "normal",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: "6px 12px 5px",
    borderBottom: `1px solid ${sec.borderColor}`,
  };
  const bodyStyle: CSSProperties = {
    fontFamily: sec.font ?? "Calibri",
    fontSize: `${sec.fontSize}pt`,
    color: sec.textColor,
    padding: "10px 12px",
  };
  const cardStyle: CSSProperties = {
    backgroundColor: sec.fillColor,
    border: `1px solid ${sec.borderColor}`,
    borderRadius: "6px",
    overflow: "hidden",
    marginTop: "10px",
  };

  const editField = (k: string, style: CSSProperties = {}, multiline: boolean = false) => {
    const sharedStyle: CSSProperties = {
      background: "transparent",
      border: "none",
      borderBottom: "1px dashed rgba(0,0,0,0.18)",
      outline: "none",
      width: "100%",
      fontFamily: sec.font,
      fontSize: `${sec.fontSize}pt`,
      color: sec.textColor,
      lineHeight: 1.4,
      ...style,
    };
    if (multiline) return (
      <textarea
        value={lbl(k)}
        onChange={e => updateLabel(k, e.target.value)}
        rows={2}
        placeholder="(optional intro text)"
        style={{ ...sharedStyle, resize: "vertical", borderRadius: 4, padding: "2px 4px", borderBottom: "none", border: "1px dashed rgba(0,0,0,0.18)" }}
        className="w-full"
      />
    );
    return (
      <input
        value={lbl(k)}
        onChange={e => updateLabel(k, e.target.value)}
        style={{ ...sharedStyle, padding: "1px 2px" }}
      />
    );
  };

  // Auto-filled badge — shows for data that comes from the offer at runtime
  const auto = (label: string, block: boolean = false) => (
    <span style={{
      display: block ? "block" : "inline-flex",
      alignItems: "center",
      padding: "1px 6px",
      borderRadius: 3,
      background: "#F3F4F6",
      border: "1px dashed #D1D5DB",
      fontSize: "0.78em",
      color: "#9CA3AF",
      fontStyle: "normal",
      fontWeight: 400,
      marginTop: block ? 2 : 0,
      whiteSpace: "nowrap",
    }}>
      ⚙ {label}
    </span>
  );

  // Inline unit input — small editable unit label
  const unitField = (k: string) => (
    <input
      value={lbl(k)}
      onChange={e => updateLabel(k, e.target.value)}
      style={{
        background: "transparent", border: "none",
        borderBottom: "1px dashed rgba(0,0,0,0.15)", outline: "none",
        width: `${Math.max(lbl(k).length + 1, 4)}ch`,
        fontFamily: sec.font, fontSize: `${sec.fontSize * 0.82}pt`,
        color: sec.textColor, opacity: 0.65, padding: "0 2px",
      }}
    />
  );

  switch (sec.id) {
    case "metadata": {
      const resolvedParts = sec.parts ?? DEFAULT_SECTION_PARTS.metadata ?? [];
      const partA = resolvedParts.find((p: SectionPart) => p.id === "contentA");
      const partB = resolvedParts.find((p: SectionPart) => p.id === "contentB");
      const contentAStyle: CSSProperties = {
        fontFamily: (partA?.fontFamily && partA.fontFamily !== "inherit") ? partA.fontFamily : (sec.font ?? "Calibri"),
        fontSize: `${partA?.fontSize ?? 11}pt`,
        fontWeight: partA?.fontWeight === "bold" ? 700 : 400,
        color: partA?.color ?? "#111827",
        textAlign: (partA?.alignment === "justified" ? "justify" : partA?.alignment ?? "left") as CSSProperties["textAlign"],
      };
      const contentBStyle: CSSProperties = {
        fontFamily: (partB?.fontFamily && partB.fontFamily !== "inherit") ? partB.fontFamily : (sec.font ?? "Calibri"),
        fontSize: `${partB?.fontSize ?? 8.5}pt`,
        fontWeight: partB?.fontWeight === "bold" ? 700 : 400,
        color: partB?.color ?? "#6B7280",
        textAlign: (partB?.alignment === "justified" ? "justify" : partB?.alignment ?? "left") as CSSProperties["textAlign"],
        marginTop: 2,
      };
      const aEnabled = partA?.enabled !== false;
      const bEnabled = partB?.enabled !== false;
      const autoA = (label: string, block: boolean = false) => aEnabled ? (
        <span style={{
          display: block ? "block" : "inline-flex",
          alignItems: "center",
          padding: "1px 6px",
          borderRadius: 3,
          background: "#F3F4F6",
          border: "1px dashed #D1D5DB",
          whiteSpace: "nowrap",
          ...contentAStyle,
          fontStyle: "normal",
          marginTop: block ? 2 : 0,
        }}>
          ⚙ {label}
        </span>
      ) : null;
      const autoB = (label: string, block: boolean = false) => bEnabled ? (
        <span style={{
          display: block ? "block" : "inline-flex",
          alignItems: "center",
          padding: "1px 6px",
          borderRadius: 3,
          background: "#F3F4F6",
          border: "1px dashed #D1D5DB",
          whiteSpace: "nowrap",
          ...contentBStyle,
          fontStyle: "normal",
          marginTop: block ? 2 : 0,
        }}>
          ⚙ {label}
        </span>
      ) : null;
      return (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 10 }}>
            {(["dateBox", "salesmanBox", "customerBox"] as const).map((key, i) => (
              <div key={key} style={cardStyle}>
                <div style={titleStyle}>
                  {editField(key, { fontSize: `${sec.titleFontSize ?? 7.5}pt`, color: sec.titleTextColor ?? "#9CA3AF", fontFamily: sec.titleFont ?? "Calibri" })}
                </div>
                <div style={{ padding: "10px 12px" }}>
                  {i === 0 && (
                    <>
                      {autoA("offer date", true)}
                      <div style={{ ...contentBStyle, display: "flex", alignItems: "center", gap: 4 }}>
                        {editField("refPrefix", { ...contentBStyle, width: "3.5em" })}
                        {autoB("reference no.")}
                      </div>
                    </>
                  )}
                  {i === 1 && (
                    <>
                      {autoA("salesman name", true)}
                      {autoB("salesman email", true)}
                    </>
                  )}
                  {i === 2 && (
                    <>
                      {autoA("customer name", true)}
                      {autoB("contact person", true)}
                      {autoB("customer email", true)}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ ...bodyStyle, paddingTop: 6, paddingBottom: 4 }}>
            <SpecRowsEditor sec={sec} onUpdate={onUpdate} />
          </div>
        </>
      );
    }

    case "offer_title":
      return (
        <div style={cardStyle}>
          <div style={titleStyle}>{sec.label ?? sec.name}</div>
          <div style={bodyStyle}>
            {editField("intro", {}, true)}
            <div style={{ marginTop: 8, marginBottom: 4 }}>{auto("offer subject / title")}</div>
            <SpecRowsEditor sec={sec} onUpdate={onUpdate} />
          </div>
        </div>
      );

    case "technical_specs": {
      const gridFields: string[] = [
        "minMaxLength", "maxWidth", "minMaxThickness",
        "averageLineSpeed", "controlSide", "maxBow",
        "paint", "substrate", "finishing",
      ];
      return (
        <div style={cardStyle}>
          <div style={titleStyle}>{sec.label ?? sec.name}</div>
          <div style={bodyStyle}>
            <div style={{ marginBottom: 8 }}>
              {editField("intro", {}, true)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
              {gridFields.map((key) => (
                <div key={key} style={{ border: `1px solid ${sec.borderColor}`, borderRadius: 4, padding: "6px 8px" }}>
                  {editField(key, { fontSize: "0.75em", opacity: 0.7, fontWeight: 600 })}
                  {editField(key + "Val", { fontWeight: 600, marginTop: 2 })}
                </div>
              ))}
            </div>
            <SpecRowsEditor sec={sec} onUpdate={onUpdate} />
          </div>
        </div>
      );
    }

    case "utilities_summary": {
      const utilRows: [string, string][] = [
        ["electricalPower", "electricalPowerUnit"],
        ["compressedAir",   "compressedAirUnit"],
        ["exhaustedAir",    "exhaustedAirUnit"],
        ["airIntroduced",   "airIntroducedUnit"],
        ["installationDays","installationDaysUnit"],
      ];
      return (
        <div style={cardStyle}>
          <div style={titleStyle}>{sec.label ?? sec.name}</div>
          <div style={bodyStyle}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
              {utilRows.map(([labelKey, unitKey]) => (
                <div key={labelKey}>
                  {editField(labelKey, { fontSize: "0.8em", opacity: 0.7 })}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 2 }}>
                    {auto("total")}
                    {unitField(unitKey)}
                  </div>
                </div>
              ))}
            </div>
            <SpecRowsEditor sec={sec} onUpdate={onUpdate} />
          </div>
        </div>
      );
    }

    case "machine_line":
      return (
        <div style={cardStyle}>
          <div style={{ ...titleStyle, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            {editField("positionPrefix", { fontSize: `${sec.titleFontSize ?? 7.5}pt`, color: sec.titleTextColor ?? "#9CA3AF", fontFamily: sec.titleFont ?? "Calibri", width: "auto" })}
            {auto("pos. no.")}
            <span style={{ color: sec.titleTextColor ?? "#9CA3AF", opacity: 0.5 }}>–</span>
            {auto("machine name")}
          </div>
          <div style={bodyStyle}>
            {auto("machine image", true)}
            {auto("machine description", true)}
            <div style={{ marginTop: 8, marginBottom: 4, opacity: 0.7 }}>
              {editField("includedOptions", { fontSize: "0.8em", fontWeight: 600 })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 4 }}>
              {[1, 2].map(n => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.85em" }}>
                  {editField("optionBullet", { width: "1.2em", textAlign: "center", fontSize: "0.85em" })}
                  {auto(`option ${n} name`)}
                </div>
              ))}
            </div>
            <SpecRowsEditor sec={sec} onUpdate={onUpdate} />
          </div>
        </div>
      );

    case "price_overview": {
      const priceRows = [
        { key: "totalListPrice", bold: true, divider: true },
        { key: "installation" },
        { key: "travelCosts" },
        { key: "boardLodging" },
        { key: "training" },
        { key: "packaging" },
        { key: "transport" },
        { key: "interlocking" },
        { key: "discount", italic: true },
        { key: "grossTotal", bold: true, divider: true },
        { key: "netTotal", bold: true, blue: true },
      ];
      return (
        <div style={cardStyle}>
          <div style={titleStyle}>{sec.label ?? sec.name}</div>
          <div style={{ ...bodyStyle, padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr style={{ borderBottom: `1px dashed ${sec.borderColor}` }}>
                  <td style={{ padding: "4px 12px", fontSize: `${sec.fontSize * 0.85}pt` }}>
                    {auto("Pos. 1: machine name")}
                  </td>
                  <td style={{ padding: "4px 12px", textAlign: "right" }}>{auto("price")}</td>
                </tr>
                {priceRows.map(({ key, bold, divider, blue, italic }: any) => (
                  <tr key={key} style={{ borderTop: divider ? `2px solid ${sec.borderColor}` : undefined, borderBottom: `1px dashed ${sec.borderColor}` }}>
                    <td style={{ padding: "4px 12px" }}>
                      {editField(key, { fontWeight: bold ? 700 : 400, fontStyle: italic ? "italic" : "normal", color: blue ? "#2563EB" : sec.textColor })}
                    </td>
                    <td style={{ padding: "4px 12px", textAlign: "right" }}>
                      {auto(bold ? "total" : "value")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "6px 12px 10px" }}>
            <SpecRowsEditor sec={sec} onUpdate={onUpdate} />
          </div>
        </div>
      );
    }

    case "terms_conditions":
      return (
        <div style={cardStyle}>
          <div style={titleStyle}>{sec.label ?? sec.name}</div>
          <div style={bodyStyle}>
            <div style={{ marginBottom: 10 }}>
              {editField("intro", {}, true)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 }}>
              {[1, 2].map(n => (
                <div key={n} style={{ border: `1px solid ${sec.borderColor}`, borderRadius: 4, padding: "6px 10px" }}>
                  {auto(`preset title ${n}`, true)}
                  {auto(`preset content ${n}`, true)}
                </div>
              ))}
            </div>
            <SpecRowsEditor sec={sec} onUpdate={onUpdate} />
          </div>
        </div>
      );

    default:
      return null;
  }
}

function ColorPicker({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground whitespace-nowrap">{label}</Label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-border p-0.5"
          data-testid={testId}
        />
        <span className="text-xs font-mono text-muted-foreground w-16">{value}</span>
      </div>
    </div>
  );
}

const HEADER_FONT_FAMILIES = [
  { value: "Arial", label: "Arial" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Georgia", label: "Georgia" },
  { value: "Verdana", label: "Verdana" },
  { value: "Trebuchet MS", label: "Trebuchet MS" },
  { value: "Courier New", label: "Courier New" },
  { value: "Outfit", label: "Outfit" },
];

function TextStyleToolbar({
  label, style, defaultStyle, onChange, testIdPrefix,
}: {
  label: string;
  style: HeaderTextStyle;
  defaultStyle: HeaderTextStyle;
  onChange: (s: HeaderTextStyle) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Select value={style.fontFamily} onValueChange={(v) => onChange({ ...style, fontFamily: v })}>
          <SelectTrigger className="w-[130px] h-7 text-xs" data-testid={`select-${testIdPrefix}-font`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HEADER_FONT_FAMILIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-0.5 border rounded-md px-1 h-7">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onChange({ ...style, fontSize: Math.max(5, style.fontSize - 0.5) })}
            data-testid={`button-${testIdPrefix}-size-down`}
          >
            <Minus className="w-3 h-3" />
          </Button>
          <span className="text-xs w-8 text-center tabular-nums" data-testid={`text-${testIdPrefix}-size`}>{style.fontSize}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onChange({ ...style, fontSize: Math.min(24, style.fontSize + 0.5) })}
            data-testid={`button-${testIdPrefix}-size-up`}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        <Button
          variant={style.bold ? "default" : "outline"}
          size="icon"
          className="h-7 w-7"
          onClick={() => onChange({ ...style, bold: !style.bold })}
          data-testid={`button-${testIdPrefix}-bold`}
        >
          <Bold className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant={style.italic ? "default" : "outline"}
          size="icon"
          className="h-7 w-7"
          onClick={() => onChange({ ...style, italic: !style.italic })}
          data-testid={`button-${testIdPrefix}-italic`}
        >
          <Italic className="w-3.5 h-3.5" />
        </Button>
        <div className="flex items-center gap-1">
          <input
            type="color"
            value={style.color}
            onChange={(e) => onChange({ ...style, color: e.target.value })}
            className="w-6 h-6 rounded cursor-pointer border-0 p-0"
            data-testid={`input-${testIdPrefix}-color`}
          />
        </div>
      </div>
    </div>
  );
}

function HeaderConfigPanel({
  header, onChange, logoUploadUrl = "/api/settings/document-format/logo", logoPreviewUrl = "/api/header-logo",
}: { header: HeaderConfig; onChange: (h: HeaderConfig) => void; logoUploadUrl?: string; logoPreviewUrl?: string }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoKey, setLogoKey] = useState(0);
  const [uploading, setUploading] = useState(false);

  const logoSize = header.logoSize ?? 42;
  const onStyle = header.offerNumberStyle ?? { ...DEFAULT_OFFER_NUMBER_STYLE };
  const dtStyle = header.dateStyle ?? { ...DEFAULT_DATE_STYLE };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch(logoUploadUrl, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      setLogoKey(k => k + 1);
      toast({ title: "Logo uploaded", description: "Header logo has been updated." });
    } catch {
      toast({ title: "Upload failed", description: "Could not upload logo.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card data-testid="card-header-config">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Image className="w-4 h-4 text-primary" />
          Document Header
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-6">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-3">
              <Switch
                checked={header.logoEnabled}
                onCheckedChange={(v) => onChange({ ...header, logoEnabled: v })}
                data-testid="switch-header-logo"
              />
              <Label className="text-sm">Show Logo</Label>
            </div>
            {header.logoEnabled && (
              <div className="pl-10 space-y-2">
                <Label className="text-xs text-muted-foreground">Logo Size ({logoSize}px)</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onChange({ ...header, logoSize: Math.max(20, logoSize - 4) })}
                    data-testid="button-logo-size-down"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </Button>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${((logoSize - 20) / 80) * 100}%` }}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onChange({ ...header, logoSize: Math.min(100, logoSize + 4) })}
                    data-testid="button-logo-size-up"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Switch
                checked={header.offerNumberEnabled}
                onCheckedChange={(v) => onChange({ ...header, offerNumberEnabled: v })}
                data-testid="switch-header-offer-number"
              />
              <Label className="text-sm flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" /> Show Offer Number</Label>
            </div>
            {header.offerNumberEnabled && (
              <div className="pl-10">
                <TextStyleToolbar
                  label="Offer Number Style"
                  style={onStyle}
                  defaultStyle={DEFAULT_OFFER_NUMBER_STYLE}
                  onChange={(s) => onChange({ ...header, offerNumberStyle: s })}
                  testIdPrefix="offer-number"
                />
              </div>
            )}
            <div className="flex items-center gap-3">
              <Switch
                checked={header.dateEnabled}
                onCheckedChange={(v) => onChange({ ...header, dateEnabled: v })}
                data-testid="switch-header-date"
              />
              <Label className="text-sm flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Show Date</Label>
            </div>
            {header.dateEnabled && (
              <div className="pl-10">
                <TextStyleToolbar
                  label="Date Style"
                  style={dtStyle}
                  defaultStyle={DEFAULT_DATE_STYLE}
                  onChange={(s) => onChange({ ...header, dateStyle: s })}
                  testIdPrefix="date"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Layout</Label>
              <Select value={header.layout} onValueChange={(v) => onChange({ ...header, layout: v as HeaderConfig["layout"] })}>
                <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-header-layout">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="logo-left">Logo Left</SelectItem>
                  <SelectItem value="logo-right">Logo Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-40 h-20 border rounded-md bg-muted/50 flex items-center justify-center overflow-hidden">
              {header.logoEnabled ? (
                <img
                  key={logoKey}
                  src={`${logoPreviewUrl}?t=${logoKey}`}
                  alt="Header logo"
                  style={{ maxHeight: `${Math.min(logoSize, 72)}px` }}
                  className="max-w-36 object-contain transition-all"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  data-testid="img-header-logo-preview"
                />
              ) : (
                <span className="text-xs text-muted-foreground">Logo hidden</span>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              data-testid="button-upload-logo"
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              {uploading ? "Uploading…" : "Upload Logo"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FooterConfigPanel({
  footer, onChange,
}: { footer: FooterConfig; onChange: (f: FooterConfig) => void }) {
  const addLine = () => onChange({ ...footer, companyLines: [...footer.companyLines, ""] });
  const removeLine = (i: number) => onChange({ ...footer, companyLines: footer.companyLines.filter((_, idx) => idx !== i) });
  const updateLine = (i: number, val: string) => onChange({ ...footer, companyLines: footer.companyLines.map((l, idx) => idx === i ? val : l) });

  return (
    <Card data-testid="card-footer-config">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          Document Footer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <Switch
              checked={footer.companyDataEnabled}
              onCheckedChange={(v) => onChange({ ...footer, companyDataEnabled: v })}
              data-testid="switch-footer-company-data"
            />
            <Label className="text-sm">Show Company Data</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={footer.pageNumberEnabled}
              onCheckedChange={(v) => onChange({ ...footer, pageNumberEnabled: v })}
              data-testid="switch-footer-page-number"
            />
            <Label className="text-sm">Show Page Number</Label>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Font</Label>
            <Select value={footer.fontFamily ?? "Arial"} onValueChange={(v) => onChange({ ...footer, fontFamily: v })}>
              <SelectTrigger className="w-[130px] h-8 text-sm" data-testid="select-footer-font">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEADER_FONT_FAMILIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Font size</Label>
            <Input
              type="number" min={4} max={12} step={0.5}
              value={footer.fontSize}
              onChange={(e) => onChange({ ...footer, fontSize: Number(e.target.value) })}
              className="w-14 h-8 text-sm"
              data-testid="input-footer-font-size"
            />
            <span className="text-xs text-muted-foreground">pt</span>
          </div>
        </div>

        {footer.companyDataEnabled && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Company Lines</p>
            {footer.companyLines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={line}
                  onChange={(e) => updateLine(i, e.target.value)}
                  className="flex-1 h-8 text-sm"
                  placeholder="Company info line..."
                  data-testid={`input-footer-line-${i}`}
                />
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                  data-testid={`button-remove-footer-line-${i}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addLine} data-testid="button-add-footer-line">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
            </Button>
          </div>
        )}

      </CardContent>
    </Card>
  );
}

function SectionPartsEditor({
  sec, onUpdate,
}: { sec: DocSection; onUpdate: (changes: Partial<DocSection>) => void }) {
  const defaults = DEFAULT_SECTION_PARTS[sec.id] ?? [];
  if (defaults.length === 0) return null;

  const parts: SectionPart[] = sec.parts ?? defaults;
  const visibleParts = PARTS_ONLY_SECTIONS.has(sec.id)
    ? parts.filter(p => p.id !== "sectionTitle")
    : parts;
  const updatePart = (partId: string, patch: Partial<SectionPart>) => {
    const updated = parts.map(p => p.id === partId ? { ...p, ...patch } : p);
    onUpdate({ parts: updated });
  };

  if (visibleParts.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Section Parts</p>
      <div className="space-y-1.5">
        {visibleParts.map((part) => (
          <div key={part.id} className="flex flex-wrap items-center gap-3 p-2 rounded border bg-muted/20" data-testid={`part-row-${sec.id}-${part.id}`}>
            <Switch
              checked={part.enabled}
              onCheckedChange={(v) => updatePart(part.id, { enabled: v })}
              data-testid={`switch-part-${sec.id}-${part.id}`}
            />
            <span className={`text-sm font-medium min-w-[120px] ${!part.enabled ? "text-muted-foreground line-through" : ""}`}>
              {part.label}
            </span>
            {part.enabled && (
              <>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">Font</Label>
                  <Select value={part.fontFamily ?? ""} onValueChange={(v) => updatePart(part.id, { fontFamily: v || undefined })}>
                    <SelectTrigger className="w-[110px] h-7 text-xs" data-testid={`select-part-font-${sec.id}-${part.id}`}>
                      <SelectValue placeholder="Inherit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">Inherit</SelectItem>
                      {HEADER_FONT_FAMILIES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">Size</Label>
                  <Input
                    type="number" min={6} max={24} step={0.5}
                    value={part.fontSize ?? 11}
                    onChange={(e) => updatePart(part.id, { fontSize: Number(e.target.value) })}
                    className="w-14 h-7 text-xs"
                    data-testid={`input-part-fontsize-${sec.id}-${part.id}`}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">Weight</Label>
                  <Select value={part.fontWeight ?? "normal"} onValueChange={(v) => updatePart(part.id, { fontWeight: v as SectionPart["fontWeight"] })}>
                    <SelectTrigger className="w-24 h-7 text-xs" data-testid={`select-part-weight-${sec.id}-${part.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="bold">Bold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">Align</Label>
                  <Select value={part.alignment ?? "left"} onValueChange={(v) => updatePart(part.id, { alignment: v as SectionPart["alignment"] })}>
                    <SelectTrigger className="w-24 h-7 text-xs" data-testid={`select-part-align-${sec.id}-${part.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALIGNMENT_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">Color</Label>
                  <input
                    type="color"
                    value={part.color ?? "#1F2937"}
                    onChange={(e) => updatePart(part.id, { color: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-border p-0.5"
                    data-testid={`input-part-color-${sec.id}-${part.id}`}
                  />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OfferReferenceFormatCard({
  value,
  onChange,
  allowInherit = false,
}: {
  value: OfferReferenceFormatConfig | null;
  onChange: (cfg: OfferReferenceFormatConfig | null) => void;
  allowInherit?: boolean;
}) {
  const inheriting = allowInherit && value === null;
  const effective = value ?? DEFAULT_OFFER_REFERENCE_FORMAT;
  const year = new Date().getFullYear();
  const sampleSeq = 106;
  const sampleVersion = effective.versionInitial;
  const core = buildOfferReferenceCore(year, sampleSeq, effective);
  const versionSuffix = buildOfferReferenceVersionSuffix(sampleVersion, effective);
  const preview = `${core}${versionSuffix}`;
  const nextVersionPreview = effective.versionEnabled
    ? `${core}${buildOfferReferenceVersionSuffix(sampleVersion + 1, effective)}`
    : preview;

  const update = (patch: Partial<OfferReferenceFormatConfig>) => onChange({ ...effective, ...patch });
  const setInherit = (inherit: boolean) => onChange(inherit ? null : { ...DEFAULT_OFFER_REFERENCE_FORMAT });

  return (
    <Card data-testid="card-offer-reference-format">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Hash className="h-4 w-4" />
          Numero di riferimento offerta
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Configura il formato del numero di riferimento usato per le offerte. Il progressivo si resetta automaticamente a inizio anno.
        </p>
        {allowInherit && (
          <div className="flex items-center justify-between rounded border px-3 py-2 mb-4">
            <div>
              <Label htmlFor="ref-inherit" className="cursor-pointer">Eredita dal formato azienda</Label>
              <p className="text-xs text-muted-foreground">Usa lo stesso formato configurato dal fornitore. Disattiva per personalizzare.</p>
            </div>
            <Switch
              id="ref-inherit"
              data-testid="switch-ref-inherit"
              checked={inheriting}
              onCheckedChange={(checked) => setInherit(checked)}
            />
          </div>
        )}
        <div className={inheriting ? "opacity-50 pointer-events-none" : ""}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="ref-prefix">Prefisso</Label>
            <Input
              id="ref-prefix"
              data-testid="input-ref-prefix"
              value={effective.prefix}
              onChange={(e) => update({ prefix: e.target.value.slice(0, 20) })}
              placeholder="OFF"
              disabled={inheriting}
            />
            <p className="text-xs text-muted-foreground mt-1">Es. OFF, QUO, PRJ</p>
          </div>
          <div>
            <Label htmlFor="ref-separator">Separatore</Label>
            <Input
              id="ref-separator"
              data-testid="input-ref-separator"
              value={effective.separator}
              onChange={(e) => update({ separator: e.target.value.slice(0, 5) })}
              placeholder="-"
              disabled={inheriting}
            />
            <p className="text-xs text-muted-foreground mt-1">Tra prefisso, anno e progressivo</p>
          </div>
          <div>
            <Label htmlFor="ref-padding">Lunghezza progressivo</Label>
            <Input
              id="ref-padding"
              data-testid="input-ref-padding"
              type="number"
              min={1}
              max={8}
              value={effective.progressivePadding}
              onChange={(e) => update({ progressivePadding: Math.max(1, Math.min(8, parseInt(e.target.value) || 4)) })}
              disabled={inheriting}
            />
            <p className="text-xs text-muted-foreground mt-1">Numero di cifre (es. 4 → 0001)</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="flex items-center justify-between md:col-span-1 rounded border px-3 py-2">
            <div>
              <Label htmlFor="ref-version-enabled" className="cursor-pointer">Suffisso di versione</Label>
              <p className="text-xs text-muted-foreground">Aggiunge la versione al riferimento</p>
            </div>
            <Switch
              id="ref-version-enabled"
              data-testid="switch-ref-version-enabled"
              checked={effective.versionEnabled}
              onCheckedChange={(checked) => update({ versionEnabled: checked })}
              disabled={inheriting}
            />
          </div>
          <div>
            <Label htmlFor="ref-version-separator">Separatore versione</Label>
            <Input
              id="ref-version-separator"
              data-testid="input-ref-version-separator"
              value={effective.versionSeparator}
              onChange={(e) => update({ versionSeparator: e.target.value.slice(0, 5) || "-v" })}
              placeholder="-v"
              disabled={inheriting || !effective.versionEnabled}
            />
            <p className="text-xs text-muted-foreground mt-1">Es. -v, -V, _r</p>
          </div>
          <div>
            <Label htmlFor="ref-version-initial">Versione iniziale</Label>
            <Select
              value={String(effective.versionInitial)}
              onValueChange={(v) => update({ versionInitial: parseInt(v, 10) as 0 | 1 })}
              disabled={inheriting || !effective.versionEnabled}
            >
              <SelectTrigger id="ref-version-initial" data-testid="select-ref-version-initial">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Inizia da 0 (es. v0)</SelectItem>
                <SelectItem value="1">Inizia da 1 (es. v1)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Numero di partenza della versione</p>
          </div>
        </div>
        </div>
        <div className="mt-4 pt-3 border-t flex items-center gap-6 text-sm flex-wrap">
          <div>
            <span className="text-muted-foreground">{inheriting ? "Anteprima (formato azienda di default): " : "Anteprima nuova offerta: "}</span>
            <span className="font-mono font-medium" data-testid="text-ref-preview">{preview}</span>
          </div>
          {effective.versionEnabled && (
            <div>
              <span className="text-muted-foreground">Versione successiva: </span>
              <span className="font-mono font-medium" data-testid="text-ref-preview-next">{nextVersionPreview}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface FormatPageProps {
  apiBase?: string;
  logoUploadUrl?: string;
  logoPreviewUrl?: string;
  previewUrl?: string;
  layoutWrapper?: React.ComponentType<{ children: React.ReactNode }>;
  extraTopContent?: React.ReactNode;
  /**
   * When true, the offer-reference-format card exposes an
   * "Inherit from company" toggle and persists `null` to clear the override.
   */
  allowOfferReferenceInherit?: boolean;
}

export function FormatEditor({
  apiBase = "/api/settings/document-format",
  logoUploadUrl = "/api/settings/document-format/logo",
  logoPreviewUrl = "/api/header-logo",
  previewUrl = "/api/settings/document-format/preview",
  layoutWrapper: LayoutWrapper = Layout,
  extraTopContent,
  allowOfferReferenceInherit = false,
}: FormatPageProps) {
  const { toast } = useToast();
  const [sections, setSections] = useState<DocSection[]>(DEFAULT_DOC_SECTIONS.map(resolveSection));
  const [pageBackground, setPageBackground] = useState<string>(DEFAULT_PAGE_BACKGROUND);
  const [borderRadius, setBorderRadius] = useState<number>(DEFAULT_BORDER_RADIUS);
  const [borderWidth, setBorderWidth] = useState<number>(DEFAULT_BORDER_WIDTH);
  const [header, setHeader] = useState<HeaderConfig>({ ...DEFAULT_HEADER_CONFIG });
  const [footer, setFooter] = useState<FooterConfig>({ ...DEFAULT_FOOTER_CONFIG });
  const [offerReferenceFormat, setOfferReferenceFormat] = useState<OfferReferenceFormatConfig | null>(
    allowOfferReferenceInherit ? null : { ...DEFAULT_OFFER_REFERENCE_FORMAT },
  );

  const { data, isLoading } = useQuery<DocumentFormatSettings>({
    queryKey: [apiBase],
  });

  useEffect(() => {
    if (data) {
      if (data.sections?.length) setSections(data.sections.map(resolveSection));
      if (data.pageBackground)   setPageBackground(data.pageBackground);
      if (data.borderRadius != null) setBorderRadius(data.borderRadius);
      if (data.borderWidth  != null) setBorderWidth(data.borderWidth);
      if (data.header) setHeader({
        ...DEFAULT_HEADER_CONFIG,
        ...data.header,
        offerNumberStyle: { ...DEFAULT_OFFER_NUMBER_STYLE, ...(data.header.offerNumberStyle ?? {}) },
        dateStyle: { ...DEFAULT_DATE_STYLE, ...(data.header.dateStyle ?? {}) },
      });
      if (data.footer) setFooter({ ...DEFAULT_FOOTER_CONFIG, ...data.footer });
      if (data.offerReferenceFormat) {
        setOfferReferenceFormat({ ...DEFAULT_OFFER_REFERENCE_FORMAT, ...data.offerReferenceFormat });
      } else if (allowOfferReferenceInherit) {
        setOfferReferenceFormat(null);
      }
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", apiBase, { sections, pageBackground, borderRadius, borderWidth, header, footer, offerReferenceFormat }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiBase] });
      toast({ title: "Format saved", description: "Document format settings have been updated." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save format settings.", variant: "destructive" });
    },
  });

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(sections);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setSections(reordered);
  };

  const updateSection = (id: string, changes: Partial<DocSection>) =>
    setSections(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));

  const updateLabel = (secId: string, key: string, value: string) =>
    setSections(prev => prev.map(s => s.id === secId
      ? { ...s, labels: { ...(s.labels ?? {}), [key]: value } }
      : s
    ));

  const addCustomSection = () => {
    const id = `custom_${Date.now()}`;
    setSections(prev => [...prev, resolveSection({
      id, name: "Custom Section", label: "Custom Section", type: "custom", rows: [], enabled: true,
    })]);
    setExpandedPreviews(prev => ({ ...prev, [id]: true }));
  };

  const deleteSection = (id: string) =>
    setSections(prev => prev.filter(s => s.id !== id));

  const [expandedPreviews, setExpandedPreviews] = useState<Record<string, boolean>>({});
  const togglePreview = (id: string) =>
    setExpandedPreviews(prev => ({ ...prev, [id]: !prev[id] }));

  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const prevPdfBlobUrl = useRef<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generateFormatPreview = useCallback(async () => {
    setIsPdfGenerating(true);
    try {
      const res = await fetch(previewUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sections, pageBackground, borderRadius, borderWidth, header, footer, offerReferenceFormat }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (prevPdfBlobUrl.current) URL.revokeObjectURL(prevPdfBlobUrl.current);
      prevPdfBlobUrl.current = url;
      setPdfBlobUrl(url);
    } catch {
      // silent
    } finally {
      setIsPdfGenerating(false);
    }
  }, [sections, pageBackground, borderRadius, borderWidth, header, footer, offerReferenceFormat, previewUrl]);

  const debouncedPreview = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      generateFormatPreview();
    }, 1500);
  }, [generateFormatPreview]);

  useEffect(() => {
    if (!isLoading && showPreview) {
      debouncedPreview();
    }
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [sections, pageBackground, borderRadius, borderWidth, header, footer, offerReferenceFormat, showPreview, isLoading]);

  useEffect(() => {
    return () => {
      if (prevPdfBlobUrl.current) URL.revokeObjectURL(prevPdfBlobUrl.current);
    };
  }, []);

  const resetToDefaults = () => {
    setSections(DEFAULT_DOC_SECTIONS.map(resolveSection));
    setPageBackground(DEFAULT_PAGE_BACKGROUND);
    setBorderRadius(DEFAULT_BORDER_RADIUS);
    setBorderWidth(DEFAULT_BORDER_WIDTH);
    setHeader({ ...DEFAULT_HEADER_CONFIG });
    setFooter({ ...DEFAULT_FOOTER_CONFIG });
    toast({ title: "Reset to defaults", description: "Drag and save to apply." });
  };

  return (
    <LayoutWrapper>
      <div className="space-y-6">
        {extraTopContent}
        <OfferReferenceFormatCard
          value={offerReferenceFormat}
          onChange={setOfferReferenceFormat}
          allowInherit={allowOfferReferenceInherit}
        />
        <PageHeader
          title="Document Format"
          subtitle="Set the look of each section in the PDF. Drag to reorder. Machine and Terms cards repeat for each item."
          icon={<FileText className="w-6 h-6 text-primary" />}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={resetToDefaults} data-testid="button-reset-defaults">
                <RotateCcw className="w-4 h-4 mr-2" />Reset
              </Button>
              <Button variant="outline" size="sm" onClick={addCustomSection} data-testid="button-add-section">
                <Plus className="w-4 h-4 mr-2" />New Section
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(p => !p)}
                data-testid="button-toggle-preview"
              >
                {showPreview ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {showPreview ? "Hide Preview" : "Show Preview"}
              </Button>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-format">
                <Save className="w-4 h-4 mr-2" />
                {saveMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </>
          }
        />

        <div className={showPreview ? "flex flex-col lg:flex-row gap-6" : ""}>
        <div className={showPreview ? "lg:w-1/2 xl:w-3/5 space-y-6" : "max-w-6xl mx-auto space-y-6"}>

        {/* Global — page settings */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Global Settings</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex flex-wrap items-center gap-6">
              <ColorPicker
                label="Page background"
                value={pageBackground}
                onChange={setPageBackground}
                testId="input-page-background"
              />
              <div
                className="flex-1 h-8 rounded-md border text-xs flex items-center justify-center text-gray-400 font-medium min-w-24"
                style={{ backgroundColor: pageBackground }}
              >
                Page background
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Corner radius</Label>
                <Input
                  type="number" min={0} max={20}
                  value={borderRadius}
                  onChange={(e) => setBorderRadius(Number(e.target.value))}
                  className="w-16 h-8 text-sm"
                  data-testid="input-border-radius"
                />
                <span className="text-xs text-muted-foreground">px</span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Border width</Label>
                <Input
                  type="number" min={0} max={4}
                  value={borderWidth}
                  onChange={(e) => setBorderWidth(Number(e.target.value))}
                  className="w-16 h-8 text-sm"
                  data-testid="input-border-width"
                />
                <span className="text-xs text-muted-foreground">px</span>
              </div>
              {/* live preview card */}
              <div
                className="flex-1 h-8 text-xs flex items-center px-3 font-medium text-gray-500 min-w-24"
                style={{
                  backgroundColor: "#FFFFFF",
                  border: `${borderWidth}px solid #E5E7EB`,
                  borderRadius: `${borderRadius}px`,
                }}
              >
                Card shape preview
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Header config */}
        <HeaderConfigPanel header={header} onChange={setHeader} logoUploadUrl={logoUploadUrl} logoPreviewUrl={logoPreviewUrl} />

        {/* Footer config */}
        <FooterConfigPanel footer={footer} onChange={setFooter} />

        {/* Sections list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="sections">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="space-y-3"
                  data-testid="section-list"
                >
                  {sections.map((sec, index) => (
                    <Draggable key={sec.id} draggableId={sec.id} index={index}>
                      {(drag, snapshot) => (
                        <Card
                          ref={drag.innerRef}
                          {...drag.draggableProps}
                          className={`transition-shadow ${snapshot.isDragging ? "shadow-lg ring-2 ring-primary/30" : ""} ${!sec.enabled ? "opacity-60" : ""}`}
                          data-testid={`card-section-${sec.id}`}
                        >
                          <CardContent className="p-4 space-y-3">
                            {/* Row 1: drag + toggle + editable label */}
                            <div className="flex items-center gap-3">
                              <div
                                {...drag.dragHandleProps}
                                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
                                data-testid={`drag-handle-${sec.id}`}
                              >
                                <GripVertical className="w-5 h-5" />
                              </div>
                              <Badge variant="outline" className="w-7 h-7 flex items-center justify-center text-xs font-mono p-0 shrink-0">
                                {index + 1}
                              </Badge>
                              <Switch
                                checked={sec.enabled}
                                onCheckedChange={(v) => updateSection(sec.id, { enabled: v })}
                                data-testid={`switch-${sec.id}`}
                              />
                              <div className="flex-1 flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wide leading-none">Section title in document</span>
                                <Input
                                  value={sec.label ?? sec.name}
                                  onChange={(e) => updateSection(sec.id, { label: e.target.value })}
                                  placeholder={sec.name}
                                  className={`h-7 text-sm font-medium border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:border-b focus-visible:border-primary rounded-none ${sec.enabled ? "" : "text-muted-foreground line-through"}`}
                                  data-testid={`input-label-${sec.id}`}
                                />
                              </div>
                              {sec.type === "custom" && (
                                <button
                                  type="button"
                                  onClick={() => deleteSection(sec.id)}
                                  className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                                  title="Delete this custom section"
                                  data-testid={`button-delete-${sec.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            {/* ── TITLE styling ── */}
                            <div className="pl-10 space-y-2">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Title</p>
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Font</Label>
                                  <Select value={sec.titleFont ?? "Calibri"} onValueChange={(v) => updateSection(sec.id, { titleFont: v })}>
                                    <SelectTrigger className="w-36 h-8 text-sm" data-testid={`select-title-font-${sec.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {FONT_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Size</Label>
                                  <Input
                                    type="number" min={6} max={20} step={0.5}
                                    value={sec.titleFontSize ?? 7.5}
                                    onChange={(e) => updateSection(sec.id, { titleFontSize: Number(e.target.value) })}
                                    className="w-14 h-8 text-sm"
                                    data-testid={`input-title-fontsize-${sec.id}`}
                                  />
                                  <span className="text-xs text-muted-foreground">pt</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs text-muted-foreground">Align</Label>
                                  <Select value={sec.titleAlignment ?? "left"} onValueChange={(v) => updateSection(sec.id, { titleAlignment: v as DocSection["titleAlignment"] })}>
                                    <SelectTrigger className="w-28 h-8 text-sm" data-testid={`select-title-align-${sec.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {ALIGNMENT_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <ColorPicker
                                  label="Color"
                                  value={sec.titleTextColor ?? "#9CA3AF"}
                                  onChange={(v) => updateSection(sec.id, { titleTextColor: v })}
                                  testId={`input-title-text-color-${sec.id}`}
                                />
                                <ColorPicker
                                  label="Fill"
                                  value={sec.titleFillColor || "#ffffff"}
                                  onChange={(v) => updateSection(sec.id, { titleFillColor: v === "#ffffff" ? "" : v })}
                                  testId={`input-title-fill-color-${sec.id}`}
                                />
                                {/* Title preview */}
                                <div
                                  className="flex-1 h-7 rounded-sm text-xs flex items-center px-2 font-bold uppercase tracking-wide min-w-20"
                                  style={{
                                    backgroundColor: sec.titleFillColor || "transparent",
                                    color: sec.titleTextColor ?? "#9CA3AF",
                                    fontFamily: sec.titleFont ?? "Calibri",
                                    fontSize: `${sec.titleFontSize ?? 7.5}pt`,
                                    textAlign: sec.titleAlignment === "justified" ? "left" : (sec.titleAlignment ?? "left") as any,
                                  }}
                                >
                                  {(sec.label ?? sec.name)}
                                </div>
                              </div>
                            </div>

                            {/* ── DESCRIPTION / BODY styling ── */}
                            {!PARTS_ONLY_SECTIONS.has(sec.id) && <div className="pl-10 space-y-2 border-t pt-2">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Description</p>
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Font</Label>
                                  <Select value={sec.font} onValueChange={(v) => updateSection(sec.id, { font: v })}>
                                    <SelectTrigger className="w-36 h-8 text-sm" data-testid={`select-font-${sec.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {FONT_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Size</Label>
                                  <Input
                                    type="number" min={7} max={20}
                                    value={sec.fontSize}
                                    onChange={(e) => updateSection(sec.id, { fontSize: Number(e.target.value) })}
                                    className="w-14 h-8 text-sm"
                                    data-testid={`input-fontsize-${sec.id}`}
                                  />
                                  <span className="text-xs text-muted-foreground">pt</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs text-muted-foreground">Align</Label>
                                  <Select value={sec.alignment} onValueChange={(v) => updateSection(sec.id, { alignment: v as DocSection["alignment"] })}>
                                    <SelectTrigger className="w-28 h-8 text-sm" data-testid={`select-align-${sec.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {ALIGNMENT_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Line height</Label>
                                  <Input
                                    type="number" min={1.0} max={2.5} step={0.05}
                                    value={sec.lineHeight ?? 1.45}
                                    onChange={(e) => updateSection(sec.id, { lineHeight: Number(e.target.value) })}
                                    className="w-16 h-8 text-sm"
                                    data-testid={`input-lineheight-${sec.id}`}
                                  />
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-4">
                                <ColorPicker
                                  label="Text"
                                  value={sec.textColor}
                                  onChange={(v) => updateSection(sec.id, { textColor: v })}
                                  testId={`input-text-color-${sec.id}`}
                                />
                                <ColorPicker
                                  label="Border"
                                  value={sec.borderColor}
                                  onChange={(v) => updateSection(sec.id, { borderColor: v })}
                                  testId={`input-border-color-${sec.id}`}
                                />
                                <ColorPicker
                                  label="Fill"
                                  value={sec.fillColor}
                                  onChange={(v) => updateSection(sec.id, { fillColor: v })}
                                  testId={`input-fill-color-${sec.id}`}
                                />
                                {/* Body preview */}
                                <div
                                  className="flex-1 h-7 rounded-sm text-xs flex items-center px-2"
                                  style={{
                                    backgroundColor: sec.fillColor,
                                    border: `1px solid ${sec.borderColor}`,
                                    color: sec.textColor,
                                    fontFamily: sec.font,
                                  }}
                                >
                                  Body text preview
                                </div>
                              </div>
                            </div>}

                            {/* ── SECTION PARTS ── */}
                            {sec.type !== "custom" && DEFAULT_SECTION_PARTS[sec.id] && (
                              <div className="pl-10 border-t pt-2">
                                <SectionPartsEditor sec={sec} onUpdate={(changes) => updateSection(sec.id, changes)} />
                              </div>
                            )}

                            {/* ── CONTENT LABELS & PREVIEW ── */}
                            {!PARTS_ONLY_SECTIONS.has(sec.id) && <div className="pl-10 border-t pt-2">
                              <button
                                type="button"
                                onClick={() => togglePreview(sec.id)}
                                className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                                data-testid={`toggle-preview-${sec.id}`}
                              >
                                {expandedPreviews[sec.id]
                                  ? <ChevronDown className="w-3 h-3" />
                                  : <ChevronRight className="w-3 h-3" />}
                                Content Labels &amp; Preview
                              </button>
                              {expandedPreviews[sec.id] && (
                                <div className="mt-1">
                                  <p className="text-[10px] text-muted-foreground mb-1">
                                    {sec.type === "custom"
                                      ? "Add rows, type the text, and use the B button to make a row bold."
                                      : "Edit the static text labels directly in the preview below. Gray italic text is filled automatically from offer data."}
                                  </p>
                                  <SectionPreview
                                    sec={sec}
                                    onUpdate={(changes) => updateSection(sec.id, changes)}
                                  />
                                </div>
                              )}
                            </div>}
                          </CardContent>
                        </Card>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}

        <Card className="bg-muted/30 border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">How it works</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>Each section has two styling groups: <strong>Title</strong> (the small label bar at the top of the card) and <strong>Description</strong> (the body content below it).</p>
            <p>The <strong>section title in document</strong> field lets you rename the heading that appears in the PDF — e.g. change "Price Overview" to "Commercial Summary".</p>
            <p><strong>Machine Cards</strong> and <strong>Terms &amp; Conditions</strong> generate one box per item — each shares the same styling.</p>
            <p>Use <strong>Fill color</strong> (Description) for the card background, <strong>Border color</strong> for the card edge, and <strong>Fill color</strong> (Title) for a colored header strip.</p>
            <p><strong>Corner radius</strong> and <strong>Border width</strong> control the shape of every card globally.</p>
            <p>Click <strong>Save Changes</strong> to apply your settings to all PDF exports.</p>
          </CardContent>
        </Card>
        </div>

        {showPreview && (
          <div className="lg:w-1/2 xl:w-2/5">
            <div className="sticky top-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Live Preview
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateFormatPreview}
                  disabled={isPdfGenerating}
                  data-testid="button-refresh-preview"
                >
                  {isPdfGenerating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                  Refresh
                </Button>
              </div>
              <div className="rounded-lg border bg-card overflow-hidden shadow-sm" style={{ minHeight: "70vh" }}>
                {isPdfGenerating && !pdfBlobUrl && (
                  <div className="flex flex-col items-center justify-center h-[70vh] gap-3 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p className="text-sm">Generating preview…</p>
                  </div>
                )}
                {pdfBlobUrl && (
                  <div className="relative w-full h-[80vh]">
                    {isPdfGenerating && (
                      <div className="absolute top-2 right-2 z-10 bg-background/80 backdrop-blur-sm rounded-full p-1.5 shadow-sm">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      </div>
                    )}
                    <iframe
                      src={pdfBlobUrl}
                      className="w-full h-full border-0"
                      title="Format Preview"
                      data-testid="format-preview-iframe"
                    />
                  </div>
                )}
                {!isPdfGenerating && !pdfBlobUrl && (
                  <div className="flex flex-col items-center justify-center h-[70vh] gap-3 text-muted-foreground">
                    <FileText className="w-8 h-8" />
                    <p className="text-sm">Preview will appear here</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </LayoutWrapper>
  );
}

export default function Format() {
  return <FormatEditor />;
}
