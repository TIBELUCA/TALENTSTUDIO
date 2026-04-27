import { Mail, FileText, Package, Phone, Bell, Layout as LayoutIcon } from "lucide-react";

type Ev = {
  id: string;
  hour: number;
  minute: number;
  type: "mail" | "offer" | "order" | "call" | "reminder" | "layout";
  title: string;
  meta: string;
  line?: number; // metro line id
};

const EVENTS: Ev[] = [
  { id: "e1", hour: 8, minute: 15, type: "mail", title: "Rossi S.p.A. — richiesta preventivo", meta: "Mail in entrata", line: 1 },
  { id: "e2", hour: 9, minute: 0, type: "offer", title: "Offerta #2026-0184", meta: "€ 48.500", line: 1 },
  { id: "e3", hour: 9, minute: 5, type: "mail", title: "Invio offerta a Rossi", meta: "Allegato 2026-0184.pdf", line: 1 },
  { id: "e4", hour: 10, minute: 30, type: "call", title: "Chiamata Bianchi & Co.", meta: "Commessa #C-1042" },
  { id: "e5", hour: 11, minute: 45, type: "layout", title: "Layout firmato Verdi srl", meta: "Offerta #2026-0177", line: 2 },
  { id: "e6", hour: 12, minute: 10, type: "order", title: "Ordine #C-1078 confermato", meta: "Verdi srl", line: 2 },
  { id: "e7", hour: 14, minute: 0, type: "reminder", title: "Richiamare Neri", meta: "Offerta ferma 12gg" },
  { id: "e8", hour: 15, minute: 20, type: "mail", title: "Gialli SpA — variazione layout", meta: "Commessa #C-1065", line: 3 },
  { id: "e9", hour: 15, minute: 35, type: "layout", title: "Layout rev. B caricato", meta: "Commessa #C-1065", line: 3 },
  { id: "e10", hour: 17, minute: 5, type: "mail", title: "Sollecito da Rossi S.p.A.", meta: "Offerta #2026-0184", line: 1 },
];

const TYPE_META: Record<Ev["type"], { icon: any; label: string }> = {
  mail:     { icon: Mail,       label: "Mail" },
  offer:    { icon: FileText,   label: "Offerta" },
  order:    { icon: Package,    label: "Ordine" },
  call:     { icon: Phone,      label: "Chiamata" },
  reminder: { icon: Bell,       label: "Promemoria" },
  layout:   { icon: LayoutIcon, label: "Layout" },
};

const LINE_COLORS: Record<number, string> = {
  1: "#dc2626", // red metro
  2: "#16a34a", // green metro
  3: "#2563eb", // blue metro
};

const START_H = 7;
const END_H = 19;
const PX_PER_HOUR = 78;
const TOTAL_H = (END_H - START_H) * PX_PER_HOUR;

function yFor(h: number, m: number) {
  return ((h - START_H) + m / 60) * PX_PER_HOUR;
}

export function LineaMetropolitana() {
  // Each "metro line" is assigned a vertical track (X coordinate).
  const trackX: Record<number | "loose", number> = { 1: 110, 2: 170, 3: 230, loose: 290 };

  return (
    <div className="min-h-screen bg-stone-950 p-6 font-['Inter'] text-stone-100">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-stone-500">Recap · Giorno</div>
          <h1 className="text-xl font-semibold">Martedì 21 aprile</h1>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <Legend color={LINE_COLORS[1]} label="Trattativa Rossi" />
          <Legend color={LINE_COLORS[2]} label="Verdi → Ordine" />
          <Legend color={LINE_COLORS[3]} label="Gialli · layout" />
        </div>
      </div>

      <div className="relative" style={{ height: TOTAL_H + 40 }}>
        {/* Hour ruler on the very left */}
        <div className="absolute top-0 bottom-0 left-0 w-16">
          {Array.from({ length: END_H - START_H + 1 }).map((_, i) => {
            const h = START_H + i;
            return (
              <div key={h} className="absolute -translate-y-1/2 text-right pr-3 w-full" style={{ top: i * PX_PER_HOUR }}>
                <span className="text-[11px] tabular-nums text-stone-500">{String(h).padStart(2, "0")}:00</span>
              </div>
            );
          })}
        </div>

        {/* Metro tracks (SVG): one thick colored vertical line per group, connecting its stops */}
        <svg className="absolute inset-0 pointer-events-none" width="100%" height={TOTAL_H + 40}>
          {[1, 2, 3].map(line => {
            const stops = EVENTS.filter(e => e.line === line).sort((a, b) => yFor(a.hour, a.minute) - yFor(b.hour, b.minute));
            if (stops.length === 0) return null;
            const x = trackX[line];
            const y1 = yFor(stops[0].hour, stops[0].minute) + 16;
            const y2 = yFor(stops[stops.length - 1].hour, stops[stops.length - 1].minute) + 16;
            return (
              <g key={line}>
                <line x1={x} y1={y1} x2={x} y2={y2} stroke={LINE_COLORS[line]} strokeWidth="6" strokeLinecap="round" opacity="0.85" />
                {stops.map(s => {
                  const y = yFor(s.hour, s.minute) + 16;
                  return (
                    <g key={s.id}>
                      <circle cx={x} cy={y} r="7" fill="#0c0a09" stroke={LINE_COLORS[line]} strokeWidth="3" />
                    </g>
                  );
                })}
              </g>
            );
          })}
          {/* loose events: single grey dot */}
          {EVENTS.filter(e => !e.line).map(e => {
            const y = yFor(e.hour, e.minute) + 16;
            return <circle key={e.id} cx={trackX.loose} cy={y} r="5" fill="#0c0a09" stroke="#78716c" strokeWidth="2" />;
          })}
        </svg>

        {/* Cards */}
        {EVENTS.map(e => {
          const meta = TYPE_META[e.type];
          const Icon = meta.icon;
          const top = yFor(e.hour, e.minute);
          const x = e.line ? trackX[e.line] : trackX.loose;
          const left = x + 24;
          const accent = e.line ? LINE_COLORS[e.line] : "#a8a29e";
          return (
            <div key={e.id} className="absolute group cursor-pointer" style={{ top, left, width: 230 }}>
              <div
                className="rounded-2xl bg-stone-900/80 backdrop-blur px-3 py-2 ring-1 ring-stone-800 hover:ring-stone-600 hover:bg-stone-900 transition"
                style={{ borderLeft: `3px solid ${accent}` }}
              >
                <div className="flex items-start gap-2">
                  <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: accent }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-stone-500">{meta.label}</span>
                      <span className="text-[10px] tabular-nums text-stone-400">{String(e.hour).padStart(2,"0")}:{String(e.minute).padStart(2,"0")}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[12.5px] font-medium text-stone-100">{e.title}</div>
                    <div className="mt-0.5 truncate text-[11px] text-stone-400">{e.meta}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-stone-400">
      <span className="block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}
