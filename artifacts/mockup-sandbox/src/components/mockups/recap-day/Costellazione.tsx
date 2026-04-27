import { Mail, FileText, Package, Phone, Bell, Layout as LayoutIcon } from "lucide-react";

type Ev = {
  id: string;
  hour: number;
  minute: number;
  type: "mail" | "offer" | "order" | "call" | "reminder" | "layout";
  title: string;
  meta: string;
  cluster?: number;
};

const EVENTS: Ev[] = [
  { id: "e1", hour: 8, minute: 15, type: "mail", title: "Rossi — richiesta preventivo", meta: "Mail in entrata", cluster: 1 },
  { id: "e2", hour: 9, minute: 0, type: "offer", title: "Offerta #2026-0184", meta: "Rossi · € 48.500", cluster: 1 },
  { id: "e3", hour: 9, minute: 5, type: "mail", title: "Invio offerta a Rossi", meta: "Allegato 2026-0184.pdf", cluster: 1 },
  { id: "e4", hour: 10, minute: 30, type: "call", title: "Chiamata Bianchi & Co.", meta: "Commessa #C-1042" },
  { id: "e5", hour: 11, minute: 45, type: "layout", title: "Layout firmato Verdi srl", meta: "Offerta #2026-0177", cluster: 2 },
  { id: "e6", hour: 12, minute: 10, type: "order", title: "Ordine #C-1078 confermato", meta: "Verdi srl", cluster: 2 },
  { id: "e7", hour: 14, minute: 0, type: "reminder", title: "Richiamare Neri", meta: "Offerta ferma 12gg" },
  { id: "e8", hour: 15, minute: 20, type: "mail", title: "Gialli — variazione layout", meta: "Commessa #C-1065", cluster: 3 },
  { id: "e9", hour: 15, minute: 35, type: "layout", title: "Layout rev. B caricato", meta: "Commessa #C-1065", cluster: 3 },
  { id: "e10", hour: 17, minute: 5, type: "mail", title: "Sollecito da Rossi", meta: "Offerta #2026-0184", cluster: 1 },
];

const TYPE_META: Record<Ev["type"], { icon: any; ring: string; halo: string; label: string; ic: string }> = {
  mail:     { icon: Mail,       ring: "ring-sky-300/50",    halo: "shadow-[0_0_24px_rgba(56,189,248,.35)]", ic: "text-sky-300",    label: "Mail" },
  offer:    { icon: FileText,   ring: "ring-fuchsia-300/50",halo: "shadow-[0_0_24px_rgba(232,121,249,.35)]",ic: "text-fuchsia-300",label: "Offerta" },
  order:    { icon: Package,    ring: "ring-emerald-300/50",halo: "shadow-[0_0_24px_rgba(110,231,183,.35)]",ic: "text-emerald-300",label: "Ordine" },
  call:     { icon: Phone,      ring: "ring-amber-300/50",  halo: "shadow-[0_0_24px_rgba(252,211,77,.30)]", ic: "text-amber-300",  label: "Chiamata" },
  reminder: { icon: Bell,       ring: "ring-rose-300/50",   halo: "shadow-[0_0_24px_rgba(253,164,175,.30)]",ic: "text-rose-300",   label: "Promemoria" },
  layout:   { icon: LayoutIcon, ring: "ring-indigo-300/50", halo: "shadow-[0_0_24px_rgba(165,180,252,.35)]",ic: "text-indigo-300", label: "Layout" },
};

const CLUSTER_COLOR: Record<number, string> = {
  1: "#e879f9",
  2: "#6ee7b7",
  3: "#a5b4fc",
};

const START_H = 7;
const END_H = 19;
const PX_PER_HOUR = 78;
const TOTAL_H = (END_H - START_H) * PX_PER_HOUR;

function yFor(h: number, m: number) {
  return ((h - START_H) + m / 60) * PX_PER_HOUR;
}

// Pseudo-random horizontal positions (deterministic) within a "sky" band
function xFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 110 + (h % 320);
}

export function Costellazione() {
  return (
    <div className="min-h-screen p-6 font-['Inter'] text-slate-100"
         style={{ background: "radial-gradient(1200px 800px at 30% 10%, #1e1b4b 0%, #0b1020 60%, #050816 100%)" }}>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-slate-400">Recap · Giorno</div>
          <h1 className="text-xl font-semibold">Martedì 21 aprile</h1>
        </div>
        <div className="text-[11px] text-slate-400">3 costellazioni di eventi</div>
      </div>

      <div className="relative rounded-2xl ring-1 ring-white/5"
           style={{ height: TOTAL_H + 40, background: "radial-gradient(800px 600px at 70% 30%, rgba(99,102,241,.08), transparent 60%)" }}>
        {/* Star dust */}
        <svg className="absolute inset-0 pointer-events-none opacity-60" width="100%" height={TOTAL_H + 40}>
          {Array.from({ length: 80 }).map((_, i) => {
            const x = (i * 53) % 480 + 60;
            const y = (i * 89) % (TOTAL_H);
            const r = (i % 3) * 0.4 + 0.4;
            return <circle key={i} cx={x} cy={y} r={r} fill="white" opacity={0.25 + (i % 5) * 0.1} />;
          })}
        </svg>

        {/* Hour axis (left, faint) */}
        <div className="absolute top-0 bottom-0 left-0 w-16">
          <div className="absolute top-0 bottom-0 left-14 w-px bg-white/10" />
          {Array.from({ length: END_H - START_H + 1 }).map((_, i) => {
            const h = START_H + i;
            return (
              <div key={h} className="absolute -translate-y-1/2 text-right pr-3 w-full" style={{ top: i * PX_PER_HOUR }}>
                <span className="text-[11px] tabular-nums text-slate-500">{String(h).padStart(2, "0")}:00</span>
              </div>
            );
          })}
        </div>

        {/* Constellation lines */}
        <svg className="absolute inset-0 pointer-events-none" width="100%" height={TOTAL_H + 40}>
          {[1, 2, 3].map(c => {
            const stars = EVENTS.filter(e => e.cluster === c).sort((a, b) => yFor(a.hour, a.minute) - yFor(b.hour, b.minute));
            if (stars.length < 2) return null;
            const color = CLUSTER_COLOR[c];
            return (
              <g key={c}>
                {stars.slice(1).map((s, i) => {
                  const prev = stars[i];
                  const x1 = xFor(prev.id), y1 = yFor(prev.hour, prev.minute) + 22;
                  const x2 = xFor(s.id),    y2 = yFor(s.hour, s.minute) + 22;
                  return <line key={s.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1" opacity="0.65" />;
                })}
                {stars.map(s => {
                  const x = xFor(s.id), y = yFor(s.hour, s.minute) + 22;
                  return (
                    <g key={s.id}>
                      <circle cx={x} cy={y} r="10" fill={color} opacity="0.15" />
                      <circle cx={x} cy={y} r="3" fill={color} />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        {/* Event "stars" with floating labels */}
        {EVENTS.map(e => {
          const meta = TYPE_META[e.type];
          const Icon = meta.icon;
          const x = xFor(e.id);
          const y = yFor(e.hour, e.minute);
          const flipLeft = x > 320;
          return (
            <div key={e.id} className="absolute" style={{ top: y, left: x }}>
              {/* Star node */}
              <div className={`relative -translate-x-1/2 -translate-y-0 z-10`}>
                <div className={`flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/90 ring-2 ${meta.ring} ${meta.halo} backdrop-blur`}>
                  <Icon className={`h-3.5 w-3.5 ${meta.ic}`} />
                </div>
              </div>
              {/* Label card */}
              <div
                className="absolute top-0 -translate-y-2 w-[200px] rounded-xl bg-white/5 backdrop-blur px-3 py-2 ring-1 ring-white/10 hover:bg-white/10 transition cursor-pointer"
                style={ flipLeft ? { right: 22 } : { left: 22 } }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">{meta.label}</span>
                  <span className="text-[10px] tabular-nums text-slate-300">{String(e.hour).padStart(2,"0")}:{String(e.minute).padStart(2,"0")}</span>
                </div>
                <div className="mt-0.5 truncate text-[12.5px] font-medium text-slate-100">{e.title}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-400">{e.meta}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
