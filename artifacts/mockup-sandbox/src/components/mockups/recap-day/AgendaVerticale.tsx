import { Mail, FileText, Package, Phone, Bell, Layout as LayoutIcon, Sparkles } from "lucide-react";

type Ev = {
  id: string;
  hour: number;
  minute: number;
  type: "mail" | "offer" | "order" | "call" | "reminder" | "layout";
  title: string;
  meta: string;
  group?: number;
};

const EVENTS: Ev[] = [
  { id: "e1", hour: 8, minute: 15, type: "mail", title: "Mail in entrata — Rossi S.p.A.", meta: "Richiesta preventivo MX-220", group: 1 },
  { id: "e2", hour: 9, minute: 0, type: "offer", title: "Offerta #2026-0184 creata", meta: "Rossi S.p.A. · € 48.500", group: 1 },
  { id: "e3", hour: 9, minute: 5, type: "mail", title: "Mail in uscita — invio offerta", meta: "Allegato: 2026-0184.pdf", group: 1 },
  { id: "e4", hour: 10, minute: 30, type: "call", title: "Chiamata · Bianchi & Co.", meta: "Aggiornamento commessa #C-1042" },
  { id: "e5", hour: 11, minute: 45, type: "layout", title: "Layout firmato ricevuto", meta: "Offerta #2026-0177 · Verdi srl", group: 2 },
  { id: "e6", hour: 12, minute: 10, type: "order", title: "Ordine #C-1078 confermato", meta: "Verdi srl · da offerta #2026-0177", group: 2 },
  { id: "e7", hour: 14, minute: 0, type: "reminder", title: "Promemoria · richiamo Neri", meta: "Offerta ferma da 12 giorni" },
  { id: "e8", hour: 15, minute: 20, type: "mail", title: "Mail · Gialli SpA — variazione layout", meta: "Commessa #C-1065", group: 3 },
  { id: "e9", hour: 15, minute: 35, type: "layout", title: "Nuovo layout caricato", meta: "Commessa #C-1065 — rev. B", group: 3 },
  { id: "e10", hour: 17, minute: 5, type: "mail", title: "Mail · sollecito Rossi S.p.A.", meta: "Risposta offerta #2026-0184", group: 1 },
];

const TYPE_META: Record<Ev["type"], { icon: any; ring: string; bg: string; ic: string; label: string }> = {
  mail:     { icon: Mail,       ring: "ring-sky-200",    bg: "bg-sky-50",    ic: "text-sky-600",    label: "Mail" },
  offer:    { icon: FileText,   ring: "ring-violet-200", bg: "bg-violet-50", ic: "text-violet-600", label: "Offerta" },
  order:    { icon: Package,    ring: "ring-emerald-200",bg: "bg-emerald-50",ic: "text-emerald-600",label: "Ordine" },
  call:     { icon: Phone,      ring: "ring-amber-200",  bg: "bg-amber-50",  ic: "text-amber-600",  label: "Chiamata" },
  reminder: { icon: Bell,       ring: "ring-rose-200",   bg: "bg-rose-50",   ic: "text-rose-600",   label: "Promemoria" },
  layout:   { icon: LayoutIcon, ring: "ring-indigo-200", bg: "bg-indigo-50", ic: "text-indigo-600", label: "Layout" },
};

const START_H = 7;
const END_H = 19;
const PX_PER_HOUR = 78;
const TOTAL_H = (END_H - START_H) * PX_PER_HOUR;

function yFor(h: number, m: number) {
  return ((h - START_H) + m / 60) * PX_PER_HOUR;
}

export function AgendaVerticale() {
  // Lane assignment (left/right of axis), grouped events stay near each other.
  const placed = EVENTS.map((e, i) => ({ ...e, lane: i % 2 === 0 ? "L" : "R" as "L" | "R" }));

  // Build group chains: connecting lines per group (curve right-to-left across the axis)
  const groups = Array.from(new Set(placed.filter(e => e.group).map(e => e.group)));

  const AXIS_X = 96; // x of vertical axis inside the canvas
  const CARD_W = 220;

  return (
    <div className="min-h-screen bg-[#fafaf7] p-6 font-['Inter']">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-stone-400">Recap · Giorno</div>
          <h1 className="text-xl font-semibold text-stone-900">Martedì 21 aprile</h1>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
          <Sparkles className="h-3.5 w-3.5" />
          <span>10 eventi · 3 reti</span>
        </div>
      </div>

      <div className="relative" style={{ height: TOTAL_H + 40 }}>
        {/* Vertical hour axis */}
        <div className="absolute top-0 bottom-0" style={{ left: AXIS_X }}>
          <div className="absolute top-0 bottom-0 w-px bg-stone-200" />
          {Array.from({ length: END_H - START_H + 1 }).map((_, i) => {
            const h = START_H + i;
            return (
              <div key={h} className="absolute -translate-y-1/2 flex items-center" style={{ top: i * PX_PER_HOUR, left: -64 }}>
                <span className="w-12 text-right text-[11px] tabular-nums text-stone-400">{String(h).padStart(2, "0")}:00</span>
                <span className="ml-2 h-px w-3 bg-stone-300" />
              </div>
            );
          })}
          {/* half hour ticks */}
          {Array.from({ length: END_H - START_H }).map((_, i) => (
            <div key={"hh"+i} className="absolute -translate-y-1/2" style={{ top: i * PX_PER_HOUR + PX_PER_HOUR / 2, left: -8 }}>
              <span className="block h-px w-2 border-t border-dashed border-stone-300" />
            </div>
          ))}
        </div>

        {/* SVG connection lines for groups */}
        <svg className="absolute inset-0 pointer-events-none" width="100%" height={TOTAL_H + 40}>
          {groups.map(g => {
            const items = placed.filter(e => e.group === g).sort((a, b) => yFor(a.hour, a.minute) - yFor(b.hour, b.minute));
            if (items.length < 2) return null;
            const color = g === 1 ? "#7c3aed" : g === 2 ? "#059669" : "#0284c7";
            let path = "";
            items.forEach((e, idx) => {
              const y = yFor(e.hour, e.minute) + 24;
              const x = e.lane === "L" ? AXIS_X - 16 : AXIS_X + 16;
              if (idx === 0) path += `M ${x} ${y}`;
              else {
                const prev = items[idx - 1];
                const py = yFor(prev.hour, prev.minute) + 24;
                const px = prev.lane === "L" ? AXIS_X - 16 : AXIS_X + 16;
                const midY = (py + y) / 2;
                path += ` C ${px} ${midY}, ${x} ${midY}, ${x} ${y}`;
              }
            });
            return (
              <g key={g}>
                <path d={path} stroke={color} strokeWidth="1.5" strokeDasharray="3 3" fill="none" opacity="0.55" />
                {items.map(e => {
                  const y = yFor(e.hour, e.minute) + 24;
                  const x = e.lane === "L" ? AXIS_X - 16 : AXIS_X + 16;
                  return <circle key={e.id} cx={x} cy={y} r="3.5" fill={color} />;
                })}
              </g>
            );
          })}
        </svg>

        {/* Event cards */}
        {placed.map(e => {
          const meta = TYPE_META[e.type];
          const Icon = meta.icon;
          const top = yFor(e.hour, e.minute);
          const left = e.lane === "L" ? AXIS_X - 16 - 12 - CARD_W : AXIS_X + 16 + 12;
          return (
            <div
              key={e.id}
              className={`absolute group cursor-pointer transition-all hover:scale-[1.02]`}
              style={{ top, left, width: CARD_W }}
            >
              <div className={`rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 shadow-sm ring-1 ${meta.ring} hover:shadow-md`}>
                <div className="flex items-start gap-2.5">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${meta.ic}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-stone-400">{meta.label}</span>
                      <span className="text-[10px] tabular-nums text-stone-500">{String(e.hour).padStart(2,"0")}:{String(e.minute).padStart(2,"0")}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[13px] font-medium text-stone-900">{e.title}</div>
                    <div className="mt-0.5 truncate text-[11px] text-stone-500">{e.meta}</div>
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
