import { useMemo, useRef, useState, useEffect } from "react";
import { parseISO, format, isToday as dfnsIsToday, isSameDay, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import {
  Phone, Mail, MailOpen, Send, MapPin, Video, MessageCircle, FileText, ClipboardList,
  Bell, UserCheck, Activity, ListTodo, Sparkles, Link2, ExternalLink, ArrowUpRight,
  RefreshCw, CheckCircle2, Paperclip, PencilRuler, Layers,
} from "lucide-react";
import type { RecapEvent, RecapEventType } from "@shared/recap";

interface Props {
  events: RecapEvent[];
  /** Optional wider event window (other days too) used to resolve cross-day
   *  satellite events when a card is expanded. Falls back to `events`. */
  allEvents?: RecapEvent[];
  day: Date;
  onSelect: (e: RecapEvent) => void;
  /** Called when the user clicks a satellite chip belonging to another day. */
  onNavigateToDay?: (d: Date) => void;
  isLoading?: boolean;
  /** When true, never enable the inner horizontal scroll on narrow viewports
   *  (used inside <DayCarousel/> to avoid nested swipe conflicts on touch). */
  forbidInnerHorizontalScroll?: boolean;
}

// ─── Visual config ──────────────────────────────────────────────────────
const PX_PER_HOUR = 120;
const MIN_START_HOUR = 7;
const MAX_END_HOUR = 21;
const AXIS_W = 72;            // Width of the left hour-axis gutter.
const MIN_CARD_W = 124;       // Floor for compact cards before we cluster overflow.
const MAX_CARD_W = 208;       // Ceiling so cards stay reasonable on wide screens.
const EXPANDED_BONUS = 132;   // Extra width an expanded card claims (capped to container).
const LANE_GAP = 12;
const CARD_MIN_DY = 38;       // Minimum vertical separation before pushing to next lane.
const CONNECT_X_PAD = 10;     // Horizontal indent before card where curves anchor.
const CLUSTER_BUCKET_PX = 28; // Y-tolerance grouping for overflow stack cards.
// Time window (ms) used to merge linked events into a single agenda card.
// When two related events (same offer / order / customer / contact via the
// `links` graph) fall within this window, they collapse into one expandable
// stack so the timeline stays readable. Tweak here if product asks to change
// the threshold (#84).
const TEMPORAL_GROUP_WINDOW_MS = 10 * 60 * 1000;

// Per-type styling — matches the rest of the app's palette but tuned for
// rounded "capsule" cards on a soft canvas.
const TYPE_STYLE: Record<RecapEventType, { ring: string; bg: string; ic: string; hex: string; label: string }> = {
  interaction:          { ring: "ring-emerald-200/70 dark:ring-emerald-700/40", bg: "bg-emerald-50 dark:bg-emerald-950/40", ic: "text-emerald-700 dark:text-emerald-300", hex: "#10b981", label: "Interazione" },
  offer_created:        { ring: "ring-violet-200/70 dark:ring-violet-700/40",   bg: "bg-violet-50 dark:bg-violet-950/40",   ic: "text-violet-700 dark:text-violet-300",   hex: "#8b5cf6", label: "Offerta" },
  offer_close_forecast: { ring: "ring-violet-200/50 dark:ring-violet-700/30",   bg: "bg-violet-50/60 dark:bg-violet-950/20",ic: "text-violet-600 dark:text-violet-300",   hex: "#a78bfa", label: "Chiusura prevista" },
  // Task #109 — offer family extensions (violet/fuchsia palette).
  offer_status_changed: { ring: "ring-violet-300/70 dark:ring-violet-700/40",   bg: "bg-violet-50 dark:bg-violet-950/30",   ic: "text-violet-700 dark:text-violet-300",   hex: "#8b5cf6", label: "Cambio stato offerta" },
  offer_drawing_added:  { ring: "ring-fuchsia-200/70 dark:ring-fuchsia-700/40", bg: "bg-fuchsia-50 dark:bg-fuchsia-950/40", ic: "text-fuchsia-700 dark:text-fuchsia-300", hex: "#d946ef", label: "Disegno offerta" },
  offer_drawing_ready:  { ring: "ring-fuchsia-200/50 dark:ring-fuchsia-700/30", bg: "bg-fuchsia-50/60 dark:bg-fuchsia-950/20",ic: "text-fuchsia-700 dark:text-fuchsia-300",hex: "#e879f9", label: "Disegno evaso" },
  order_created:        { ring: "ring-indigo-200/70 dark:ring-indigo-700/40",   bg: "bg-indigo-50 dark:bg-indigo-950/40",   ic: "text-indigo-700 dark:text-indigo-300",   hex: "#6366f1", label: "Ordine" },
  order_milestone:      { ring: "ring-blue-200/70 dark:ring-blue-700/40",       bg: "bg-blue-50 dark:bg-blue-950/40",       ic: "text-blue-700 dark:text-blue-300",       hex: "#3b82f6", label: "Milestone" },
  // Task #109 — order family extensions (indigo/blue/sky palette).
  order_approved:       { ring: "ring-indigo-300/80 dark:ring-indigo-600/50",   bg: "bg-indigo-50 dark:bg-indigo-950/40",   ic: "text-indigo-800 dark:text-indigo-200",   hex: "#4f46e5", label: "Approvazione ordine" },
  order_versioned:      { ring: "ring-indigo-200/60 dark:ring-indigo-700/30",   bg: "bg-indigo-50/70 dark:bg-indigo-950/25",ic: "text-indigo-700 dark:text-indigo-300",   hex: "#818cf8", label: "Versione ordine" },
  order_email_link:     { ring: "ring-blue-200/70 dark:ring-blue-700/40",       bg: "bg-blue-50 dark:bg-blue-950/40",       ic: "text-blue-700 dark:text-blue-300",       hex: "#60a5fa", label: "Email allegata a ordine" },
  order_layout_added:   { ring: "ring-sky-200/70 dark:ring-sky-700/40",         bg: "bg-sky-50 dark:bg-sky-950/40",         ic: "text-sky-700 dark:text-sky-300",         hex: "#0ea5e9", label: "Layout ordine caricato" },
  order_layout_changed: { ring: "ring-sky-200/60 dark:ring-sky-700/30",         bg: "bg-sky-50/70 dark:bg-sky-950/25",      ic: "text-sky-700 dark:text-sky-300",         hex: "#38bdf8", label: "Layout ordine sostituito" },
  order_document_added: { ring: "ring-blue-200/60 dark:ring-blue-700/30",       bg: "bg-blue-50/80 dark:bg-blue-950/30",    ic: "text-blue-700 dark:text-blue-300",       hex: "#3b82f6", label: "Documento ordine" },
  reminder:             { ring: "ring-amber-200/70 dark:ring-amber-700/40",     bg: "bg-amber-50 dark:bg-amber-950/40",     ic: "text-amber-700 dark:text-amber-300",     hex: "#f59e0b", label: "Promemoria" },
  contact_recall:       { ring: "ring-pink-200/70 dark:ring-pink-700/40",       bg: "bg-pink-50 dark:bg-pink-950/40",       ic: "text-pink-700 dark:text-pink-300",       hex: "#ec4899", label: "Recall" },
  activity:             { ring: "ring-slate-200/70 dark:ring-slate-700/40",     bg: "bg-slate-50 dark:bg-slate-900/60",     ic: "text-slate-700 dark:text-slate-300",     hex: "#64748b", label: "Attività" },
  // Talent Studio (Task #2): preventivi/campagne/pagamenti.
  quote_sent:            { ring: "ring-violet-200/70 dark:ring-violet-700/40",   bg: "bg-violet-50 dark:bg-violet-950/40",   ic: "text-violet-700 dark:text-violet-300",   hex: "#8b5cf6", label: "Preventivo inviato" },
  quote_accepted:        { ring: "ring-emerald-300/80 dark:ring-emerald-600/50", bg: "bg-emerald-50 dark:bg-emerald-950/40", ic: "text-emerald-800 dark:text-emerald-200", hex: "#059669", label: "Preventivo accettato" },
  deliverable_published: { ring: "ring-sky-200/70 dark:ring-sky-700/40",         bg: "bg-sky-50 dark:bg-sky-950/40",         ic: "text-sky-700 dark:text-sky-300",         hex: "#0ea5e9", label: "Deliverable pubblicato" },
  campaign_payment_in:   { ring: "ring-emerald-200/70 dark:ring-emerald-700/40", bg: "bg-emerald-50 dark:bg-emerald-950/40", ic: "text-emerald-700 dark:text-emerald-300", hex: "#10b981", label: "Pagamento in entrata" },
  campaign_payment_out:  { ring: "ring-rose-200/70 dark:ring-rose-700/40",       bg: "bg-rose-50 dark:bg-rose-950/40",       ic: "text-rose-700 dark:text-rose-300",       hex: "#f43f5e", label: "Pagamento in uscita" },
};

// Defensive lookup so future RecapEventType additions never crash the
// day-view renderer at runtime — the visual falls back to the neutral
// "activity" capsule if the type is missing from TYPE_STYLE.
function styleFor(t: RecapEventType) {
  return TYPE_STYLE[t] ?? TYPE_STYLE.activity;
}

function emailIcon(e: RecapEvent) {
  // Differentiate sent vs received: rely on subtype tags first
  // (`email:outbound:*` / `email:inbound:*`), then fall back to the
  // arrow markers we put in the title (→ sent, ← received).
  const sub = (e.subtype || "").toLowerCase();
  const title = e.title || "";
  const isOutbound = sub.includes("outbound") || sub.includes("sent") || title.includes("→");
  const isInbound = sub.includes("inbound") || sub.includes("received") || title.includes("←");
  if (isOutbound) return <Send className="w-3.5 h-3.5" />;
  if (isInbound) return <MailOpen className="w-3.5 h-3.5" />;
  return <Mail className="w-3.5 h-3.5" />;
}

function eventIcon(e: RecapEvent) {
  if (e.type === "interaction") {
    const sub = (e.subtype || "").split(":")[0];
    if (sub === "phone_call") return <Phone className="w-3.5 h-3.5" />;
    if (sub === "email") return emailIcon(e);
    if (sub === "visit") return <MapPin className="w-3.5 h-3.5" />;
    if (sub === "video_call") return <Video className="w-3.5 h-3.5" />;
    if (sub === "whatsapp") return <MessageCircle className="w-3.5 h-3.5" />;
    if (sub === "offer_created" || sub === "offer_versioned") return <FileText className="w-3.5 h-3.5" />;
    if (sub === "todo") return <ListTodo className="w-3.5 h-3.5" />;
    return <Mail className="w-3.5 h-3.5" />;
  }
  if (e.type === "activity" && (e.subtype || "").toLowerCase().startsWith("email")) {
    return emailIcon(e);
  }
  if (e.type === "offer_created" || e.type === "offer_close_forecast") return <FileText className="w-3.5 h-3.5" />;
  if (e.type === "order_created" || e.type === "order_milestone") return <ClipboardList className="w-3.5 h-3.5" />;
  // Task #109 — offer family extensions.
  if (e.type === "offer_status_changed") return <RefreshCw className="w-3.5 h-3.5" />;
  if (e.type === "offer_drawing_added") return <PencilRuler className="w-3.5 h-3.5" />;
  if (e.type === "offer_drawing_ready") return <CheckCircle2 className="w-3.5 h-3.5" />;
  // Task #109 — order family extensions.
  if (e.type === "order_approved") return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (e.type === "order_versioned") return <Layers className="w-3.5 h-3.5" />;
  if (e.type === "order_email_link") return <Paperclip className="w-3.5 h-3.5" />;
  if (e.type === "order_layout_added") return <FileText className="w-3.5 h-3.5" />;
  if (e.type === "order_layout_changed") return <RefreshCw className="w-3.5 h-3.5" />;
  if (e.type === "order_document_added") return <FileText className="w-3.5 h-3.5" />;
  if (e.type === "reminder") return <Bell className="w-3.5 h-3.5" />;
  if (e.type === "contact_recall") return <UserCheck className="w-3.5 h-3.5" />;
  return <Activity className="w-3.5 h-3.5" />;
}

interface Placed {
  ev: RecapEvent;
  date: Date;
  y: number;       // top in px relative to timeline area
  lane: number;    // 0,1,2…
}

// Compute connected-component groups using union-find on event ids.
function computeGroups(events: RecapEvent[]): Map<string, number> {
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let cur = a;
    while (parent.get(cur) && parent.get(cur) !== cur) cur = parent.get(cur)!;
    parent.set(a, cur);
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const e of events) {
    if (!parent.has(e.id)) parent.set(e.id, e.id);
    for (const l of e.links ?? []) {
      if (!parent.has(l.targetId)) parent.set(l.targetId, l.targetId);
      union(e.id, l.targetId);
    }
  }
  // Map root → groupIndex (only for groups with ≥2 members)
  const rootCount = new Map<string, number>();
  for (const e of events) {
    const r = find(e.id);
    rootCount.set(r, (rootCount.get(r) ?? 0) + 1);
  }
  const rootIndex = new Map<string, number>();
  let next = 0;
  rootCount.forEach((count, root) => {
    if (count >= 2) rootIndex.set(root, next++);
  });
  const out = new Map<string, number>();
  for (const e of events) {
    const r = find(e.id);
    const gi = rootIndex.get(r);
    if (gi != null) out.set(e.id, gi);
  }
  return out;
}

const GROUP_PALETTE = [
  "#8b5cf6", // violet
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#3b82f6", // blue
  "#ef4444", // red
  "#14b8a6", // teal
  "#a855f7", // purple
];

export function DayAgenda({ events, allEvents, day, onSelect, onNavigateToDay, isLoading, forbidInnerHorizontalScroll = false }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Esc closes the expanded card (and so dismisses the satellites overlay).
  useEffect(() => {
    if (!expandedId) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setExpandedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedId]);
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Track the available width so layout adapts and we never need horizontal scroll.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Derive hour bounds from events but clamp so the axis stays roomy.
  const { startHour, endHour } = useMemo(() => {
    let lo = MIN_START_HOUR, hi = MAX_END_HOUR;
    if (events.length > 0) {
      const hours = events.map(e => parseISO(e.date).getHours());
      lo = Math.min(MIN_START_HOUR, Math.min(...hours));
      hi = Math.max(MAX_END_HOUR, Math.max(...hours) + 1);
    }
    return { startHour: lo, endHour: Math.min(24, hi) };
  }, [events]);

  const totalH = (endHour - startHour) * PX_PER_HOUR;

  // Lane layout that ALWAYS fits within `containerW`:
  // 1. Greedy lane assignment based on vertical proximity.
  // 2. Compute how many lanes the available width can host at MIN_CARD_W.
  // 3. Events that would land beyond that lane budget are marked `overflow`
  //    and later grouped into "stack cards" within the last visible lane,
  //    so the agenda never needs to scroll horizontally.
  // On narrow viewports (phones) we relax the "no horizontal scroll" rule:
  // the agenda becomes horizontally scrollable so each event keeps a readable
  // card instead of being collapsed into overflow clusters.
  const isMobile = containerW > 0 && containerW < 640;

  type PlacedEx = Placed & { overflow: boolean };
  const layout = useMemo(() => {
    // Effective available width for the lane area (subtract axis + a small inner pad).
    const avail = Math.max(MIN_CARD_W + 16, containerW - AXIS_W - 16);
    // On mobile we don't constrain lanes — instead the wrapper scrolls
    // horizontally. On desktop we cap lanes to what fits at MIN_CARD_W.
    const maxLanes = isMobile
      ? 999
      : Math.max(1, Math.floor((avail + LANE_GAP) / (MIN_CARD_W + LANE_GAP)));

    const sorted: PlacedEx[] = events
      .map(ev => {
        const date = parseISO(ev.date);
        const h = date.getHours() + date.getMinutes() / 60;
        const y = (h - startHour) * PX_PER_HOUR;
        return { ev, date, y, lane: 0, overflow: false };
      })
      .filter(p => p.y >= -PX_PER_HOUR && p.y <= totalH + PX_PER_HOUR)
      .sort((a, b) => a.y - b.y);

    const laneBottoms: number[] = [];
    for (const p of sorted) {
      let lane = 0;
      while (lane < laneBottoms.length && laneBottoms[lane] > p.y - 8) lane++;
      if (lane >= maxLanes) {
        // This event doesn't fit in any visible lane — it goes into the
        // overflow bucket of the last visible lane.
        p.lane = maxLanes - 1;
        p.overflow = true;
      } else {
        p.lane = lane;
        laneBottoms[lane] = p.y + CARD_MIN_DY;
      }
    }

    const lanesNeeded = Math.max(1, ...sorted.map(p => p.lane + 1));
    // Card width fills the lane area equally so we maximise readability.
    const rawCardW = (avail - (lanesNeeded - 1) * LANE_GAP) / lanesNeeded;
    const cardW = Math.max(MIN_CARD_W, Math.min(MAX_CARD_W, rawCardW));

    return { placed: sorted, lanesUsed: lanesNeeded, cardW, maxLanes, avail };
  }, [events, startHour, totalH, containerW]);

  const placed = layout.placed;
  const lanesUsed = layout.lanesUsed;
  const cardW = layout.cardW;
  const overflowLane = layout.maxLanes - 1;

  // Cluster the overflow events by Y-bucket inside the overflow lane so we
  // can render a single "stack card" per cluster rather than overlapping cards.
  type Cluster = { id: string; lane: number; y: number; events: PlacedEx[] };
  const overflowClusters: Cluster[] = useMemo(() => {
    const overflowed = placed.filter(p => p.overflow);
    if (overflowed.length === 0) return [];
    overflowed.sort((a, b) => a.y - b.y);
    const out: Cluster[] = [];
    for (const p of overflowed) {
      const last = out[out.length - 1];
      if (last && p.y - last.y < CLUSTER_BUCKET_PX) {
        last.events.push(p);
      } else {
        out.push({ id: `cluster-${overflowLane}-${out.length}`, lane: overflowLane, y: p.y, events: [p] });
      }
    }
    return out;
  }, [placed, overflowLane]);

  // Temporal clustering: collapse non-overflow events that are STRONGLY
  // linked (same offer or same order) AND happen within
  // `TEMPORAL_GROUP_WINDOW_MS` of each other into a single expandable card,
  // reusing the cluster UI used for overflow stacks (#84).
  // Weak links (same-customer / same-contact) are intentionally ignored
  // here so two unrelated activities for the same customer don't fuse (#85).
  const temporalClusters: Cluster[] = useMemo(() => {
    const considered = placed.filter(p => !p.overflow);
    if (considered.length < 2) return [];
    const byId = new Map<string, PlacedEx>();
    for (const p of considered) byId.set(p.ev.id, p);

    const parent = new Map<string, string>();
    const find = (a: string): string => {
      let cur = a;
      while (parent.get(cur) && parent.get(cur) !== cur) cur = parent.get(cur)!;
      parent.set(a, cur);
      return cur;
    };
    const union = (a: string, b: string) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };
    for (const p of considered) parent.set(p.ev.id, p.ev.id);

    for (const p of considered) {
      const tA = p.date.getTime();
      for (const l of p.ev.links ?? []) {
        // Only strong (offer/order) links can collapse two cards together —
        // sharing only a customer or contact is too weak to justify a merge (#85).
        if (!l.strong) continue;
        const other = byId.get(l.targetId);
        if (!other) continue;
        if (Math.abs(other.date.getTime() - tA) <= TEMPORAL_GROUP_WINDOW_MS) {
          union(p.ev.id, other.ev.id);
        }
      }
    }

    const groups = new Map<string, PlacedEx[]>();
    for (const p of considered) {
      const r = find(p.ev.id);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r)!.push(p);
    }

    const out: Cluster[] = [];
    groups.forEach((items, root) => {
      if (items.length < 2) return;
      items.sort((a, b) => a.date.getTime() - b.date.getTime());
      out.push({
        id: `temporal-${root}`,
        lane: items[0].lane,
        y: items[0].y,
        events: items,
      });
    });
    return out;
  }, [placed]);

  const temporalClusterMemberIds = useMemo(() => {
    const s = new Set<string>();
    for (const cl of temporalClusters) for (const p of cl.events) s.add(p.ev.id);
    return s;
  }, [temporalClusters]);

  // Inner area width: on desktop we exactly fill the container (no horizontal
  // scroll). On mobile we let the inner content grow with the number of lanes
  // so the wrapper can scroll horizontally for a readable layout.
  const innerW = isMobile
    ? Math.max(containerW, AXIS_W + lanesUsed * cardW + (lanesUsed - 1) * LANE_GAP + 16)
    : Math.max(AXIS_W + MIN_CARD_W + 32, containerW || (AXIS_W + cardW + 32));

  // Group / network metadata
  const groupOf = useMemo(() => computeGroups(events), [events]);
  const colorOf = (id: string): string | null => {
    const gi = groupOf.get(id);
    return gi == null ? null : GROUP_PALETTE[gi % GROUP_PALETTE.length];
  };

  // Pre-index placed by id for fast lookup when drawing curves
  const byId = useMemo(() => {
    const m = new Map<string, Placed>();
    placed.forEach(p => m.set(p.ev.id, p));
    return m;
  }, [placed]);

  // Connected ids relative to current hover (for highlighting)
  const highlightedIds = useMemo(() => {
    if (!hoverId) return null;
    const set = new Set<string>([hoverId]);
    const ev = events.find(e => e.id === hoverId);
    if (ev?.links) for (const l of ev.links) set.add(l.targetId);
    return set;
  }, [hoverId, events]);

  // Map every event id (including overflowed ones) to an anchor point on the
  // canvas. For overflowed events the anchor is the cluster card's Y so the
  // visual link is preserved even when the event is collapsed inside a stack.
  const anchorById = useMemo(() => {
    const m = new Map<string, { x: number; y: number; lane: number }>();
    for (const p of placed) {
      if (!p.overflow) {
        m.set(p.ev.id, {
          x: AXIS_W + p.lane * (cardW + LANE_GAP) + CONNECT_X_PAD,
          y: p.y + 18,
          lane: p.lane,
        });
      }
    }
    for (const cl of overflowClusters) {
      for (const p of cl.events) {
        m.set(p.ev.id, {
          x: AXIS_W + cl.lane * (cardW + LANE_GAP) + CONNECT_X_PAD,
          y: cl.y + 18,
          lane: cl.lane,
        });
      }
    }
    // Re-anchor temporal-cluster members to the cluster card so link curves
    // collapse into the stack instead of pointing at empty coordinates (#84).
    for (const cl of temporalClusters) {
      for (const p of cl.events) {
        m.set(p.ev.id, {
          x: AXIS_W + cl.lane * (cardW + LANE_GAP) + CONNECT_X_PAD,
          y: cl.y + 18,
          lane: cl.lane,
        });
      }
    }
    return m;
  }, [placed, overflowClusters, temporalClusters, cardW]);

  // Build SVG curves between linked events. We deduplicate by normalized
  // pair key so each undirected edge is drawn exactly once.
  type Curve = { d: string; color: string; from: string; to: string; strong: boolean };
  const curves: Curve[] = useMemo(() => {
    // Per-pair we keep the strongest known link kind so that a strong edge
    // (offer/order) wins over a weak edge (customer/contact) even if we see
    // the weak one first while iterating.
    const seenPairs = new Map<string, Curve>();
    for (const p of placed) {
      const links = p.ev.links ?? [];
      const color = colorOf(p.ev.id);
      if (!color) continue;
      for (const l of links) {
        const a = p.ev.id, b = l.targetId;
        const key = a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`;
        const prev = seenPairs.get(key);
        if (prev && prev.strong) continue; // already a strong curve, skip
        const ap = anchorById.get(a);
        const bp = anchorById.get(b);
        if (!ap || !bp) continue;
        // Don't draw a self-loop when both events collapsed into the same cluster.
        if (ap.x === bp.x && ap.y === bp.y) continue;
        const mx = (ap.x + bp.x) / 2;
        const c1x = mx - 40, c1y = ap.y;
        const c2x = mx + 40, c2y = bp.y;
        seenPairs.set(key, {
          d: `M ${ap.x} ${ap.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${bp.x} ${bp.y}`,
          color,
          from: a,
          to: b,
          strong: l.strong,
        });
      }
    }
    return Array.from(seenPairs.values());
  }, [placed, anchorById, groupOf]);

  // ─── Cross-day satellites ──────────────────────────────────────────────
  // When a card is expanded, surface its linked events that live on OTHER
  // days (resolved from the wider `allEvents` payload) as floating
  // "satellite" chips. They stay visible until the user collapses the card.
  type Satellite = {
    ev: RecapEvent;
    date: Date;
    color: string;
    panelY: number;        // top within the satellite panel
  };
  const SAT_PANEL_W = 220;
  const SAT_CARD_H = 60;
  const SAT_GAP = 8;

  const satelliteState = useMemo(() => {
    if (!expandedId) return null;
    // Find the focused event in `placed` (covers both regular and overflowed
    // events — anchorById gives the right attachment point in either case).
    const parent = placed.find(p => p.ev.id === expandedId);
    if (!parent) return null;
    const pAnchor = anchorById.get(expandedId);
    if (!pAnchor) return null;
    const links = parent.ev.links ?? [];
    if (links.length === 0) return null;
    const dayIds = new Set(events.map(e => e.id));
    const pool = allEvents ?? events;
    const poolById = new Map(pool.map(e => [e.id, e] as const));
    const sats: { ev: RecapEvent; date: Date }[] = [];
    const seen = new Set<string>();
    for (const l of links) {
      // Cross-day satellites only for strong (offer/order) chains. Sharing
      // just a customer or contact is too weak to surface as a chip (#85).
      if (!l.strong) continue;
      if (seen.has(l.targetId)) continue;
      seen.add(l.targetId);
      if (dayIds.has(l.targetId)) continue;        // same-day links already drawn
      const ev = poolById.get(l.targetId);
      if (!ev) continue;                            // not in window
      sats.push({ ev, date: parseISO(ev.date) });
    }
    if (sats.length === 0) return null;
    sats.sort((a, b) => +a.date - +b.date);
    const color = colorOf(parent.ev.id) ?? "#64748b";

    // Try to put the panel to the right of the focused card (or cluster); if
    // it would overflow the inner area, place it on the left instead.
    const parentLane = pAnchor.lane;
    const cardLeft = AXIS_W + parentLane * (cardW + LANE_GAP);
    const expandedW = Math.min(cardW + EXPANDED_BONUS, Math.max(cardW, layout.avail - parentLane * (cardW + LANE_GAP)));
    const cardRight = cardLeft + expandedW;
    const onRight = cardRight + 16 + SAT_PANEL_W <= innerW - 8;
    const panelLeft = onRight
      ? cardRight + 16
      : Math.max(8, cardLeft - SAT_PANEL_W - 16);

    // If the full stack would exceed the canvas height, fall back to a
    // scrollable panel that caps its height and still centres on the anchor.
    const canvasH = (endHour - startHour) * PX_PER_HOUR;
    const fullH = sats.length * SAT_CARD_H + (sats.length - 1) * SAT_GAP;
    const panelH = Math.min(fullH, Math.max(SAT_CARD_H * 2, canvasH - 40));
    const scrollable = fullH > panelH;
    const desiredTop = pAnchor.y - panelH / 2;
    const panelTop = Math.max(8, Math.min(canvasH - panelH - 8, desiredTop));

    // When rendered inline (not scrollable) each chip has its own absolute Y.
    // When scrollable, all chips render inside a scroll container that starts
    // at `panelTop` — individual `panelY` values are only used for the SVG
    // connector, which we anchor to the scroll-container's edge midpoint.
    const items: Satellite[] = sats.map((s, i) => ({
      ev: s.ev,
      date: s.date,
      color,
      panelY: panelTop + i * (SAT_CARD_H + SAT_GAP),
    }));

    const parentAnchor = {
      x: onRight ? cardRight - 4 : cardLeft + 4,
      y: pAnchor.y,
    };
    const panelAnchorX = onRight ? panelLeft + 6 : panelLeft + SAT_PANEL_W - 6;

    return { parent, items, panelLeft, panelTop, panelH, scrollable, panelAnchorX, parentAnchor, color, onRight };
  }, [expandedId, placed, anchorById, events, allEvents, cardW, layout.avail, innerW, endHour, startHour]);

  // SVG curves connecting the expanded card to each satellite chip.
  const satelliteCurves = useMemo(() => {
    if (!satelliteState) return [];
    const { parentAnchor, panelAnchorX, items, color } = satelliteState;
    return items.map(s => {
      const ay = parentAnchor.y;
      const by = s.panelY + SAT_CARD_H / 2;
      const ax = parentAnchor.x;
      const bx = panelAnchorX;
      const mx = (ax + bx) / 2;
      const c1x = mx, c1y = ay;
      const c2x = mx, c2y = by;
      return {
        d: `M ${ax} ${ay} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${bx} ${by}`,
        color,
        id: s.ev.id,
      };
    });
  }, [satelliteState]);

  // Now-line (only if today)
  const isTodayView = dfnsIsToday(day);
  const nowY = isTodayView
    ? Math.max(0, Math.min(totalH, ((now.getHours() + now.getMinutes() / 60) - startHour) * PX_PER_HOUR))
    : null;

  // Stats badge
  const groupCount = new Set(Array.from(groupOf.values())).size;

  return (
    <div className="relative" data-testid="recap-day-agenda">
      {/* Header strip */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span data-testid="text-day-stats">
            {placed.length} eventi
            {groupCount > 0 && (
              <> · <span className="text-foreground font-medium">{groupCount} {groupCount === 1 ? "rete" : "reti"}</span> di eventi correlati</>
            )}
          </span>
        </div>
        {isLoading && <span className="text-[11px] text-muted-foreground">Caricamento…</span>}
      </div>
      {/* Agenda area — on desktop the layout adapts to fit (no horizontal
          scroll); on mobile we allow horizontal scrolling so each event
          keeps a readable card. */}
      <div
        ref={containerRef}
        className={isMobile && !forbidInnerHorizontalScroll ? "w-full overflow-x-auto" : "w-full overflow-x-hidden"}
      >
        <div
          className="relative"
          style={{
            width: innerW,
            height: totalH + 40,
            background:
              "radial-gradient(900px 520px at 18% 8%, rgba(139,92,246,0.06), transparent 60%), radial-gradient(700px 480px at 90% 100%, rgba(16,185,129,0.05), transparent 60%)",
          }}
        >
          {/* Hour grid lines (full width, very faint) */}
          <svg className="absolute inset-0 pointer-events-none" width={innerW} height={totalH + 40}>
            <defs>
              {GROUP_PALETTE.map((c, i) => (
                <linearGradient key={i} id={`grp-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={c} stopOpacity="0.85" />
                  <stop offset="100%" stopColor={c} stopOpacity="0.45" />
                </linearGradient>
              ))}
            </defs>
            {Array.from({ length: endHour - startHour }).map((_, i) => (
              <g key={i}>
                <line
                  x1={AXIS_W} y1={i * PX_PER_HOUR + 0.5}
                  x2={innerW} y2={i * PX_PER_HOUR + 0.5}
                  stroke="currentColor" className="text-border" strokeWidth="1" opacity="0.35"
                />
                <line
                  x1={AXIS_W} y1={i * PX_PER_HOUR + PX_PER_HOUR / 2 + 0.5}
                  x2={innerW} y2={i * PX_PER_HOUR + PX_PER_HOUR / 2 + 0.5}
                  stroke="currentColor" className="text-border" strokeWidth="1" strokeDasharray="2 6" opacity="0.25"
                />
              </g>
            ))}
            {/* Vertical axis line */}
            <line x1={AXIS_W - 0.5} y1={0} x2={AXIS_W - 0.5} y2={totalH} stroke="currentColor" className="text-border" strokeWidth="1" />

            {/* Connection curves — weak (same-customer/same-contact) edges are
                rendered tenue + dashed so the eye prioritizes strong chains
                (offer/order). Highlighted dim still wins over the weak style. */}
            {curves.map((c, i) => {
              const dim = highlightedIds && !(highlightedIds.has(c.from) && highlightedIds.has(c.to));
              const weak = !c.strong;
              const palIdx = GROUP_PALETTE.indexOf(c.color);
              const haloW = dim ? 4 : (weak ? 4 : 7);
              const haloOp = dim ? 0.04 : (weak ? 0.06 : 0.12);
              const lineW = dim ? 1 : (weak ? 1.1 : 1.8);
              const lineOp = dim ? 0.35 : (weak ? 0.4 : 0.95);
              const dash = dim ? "3 4" : (weak ? "3 3" : undefined);
              return (
                <g key={i}>
                  {/* halo */}
                  <path d={c.d} stroke={c.color} strokeWidth={haloW} fill="none" opacity={haloOp} strokeLinecap="round" />
                  <path
                    d={c.d}
                    stroke={palIdx >= 0 ? `url(#grp-${palIdx})` : c.color}
                    strokeWidth={lineW}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={dash}
                    opacity={lineOp}
                  />
                </g>
              );
            })}

            {/* Satellite curves — rendered above the regular link curves so
                the active selection stays visually anchored. */}
            {satelliteCurves.map((c, i) => (
              <g key={`sat-${i}`}>
                <path d={c.d} stroke={c.color} strokeWidth={6} fill="none" opacity={0.18} strokeLinecap="round" />
                <path d={c.d} stroke={c.color} strokeWidth={1.6} fill="none" opacity={0.95} strokeLinecap="round" strokeDasharray="4 3" />
              </g>
            ))}

            {/* Now line */}
            {nowY != null && (
              <g>
                <line x1={AXIS_W} y1={nowY} x2={innerW} y2={nowY} stroke="#ef4444" strokeWidth="1.5" opacity="0.85" />
                <circle cx={AXIS_W} cy={nowY} r="5" fill="#ef4444">
                  <animate attributeName="opacity" values="1;0.35;1" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <circle cx={AXIS_W} cy={nowY} r="3" fill="#fff" />
              </g>
            )}
          </svg>

          {/* Hour labels (left axis) — hour + quarter-hour ticks */}
          <div className="absolute top-0 left-0" style={{ width: AXIS_W, height: totalH }}>
            {Array.from({ length: (endHour - startHour) * 4 + 1 }).map((_, i) => {
              const totalMin = i * 15;
              const h = startHour + Math.floor(totalMin / 60);
              const m = totalMin % 60;
              const isHour = m === 0;
              const isHalf = m === 30;
              return (
                <div
                  key={`${h}-${m}`}
                  className="absolute -translate-y-1/2 flex items-center justify-end pr-2 w-full gap-1"
                  style={{ top: (totalMin / 60) * PX_PER_HOUR }}
                  data-testid={isHour ? `hour-${h}` : `quarter-${h}-${m}`}
                >
                  <span
                    className={[
                      "tabular-nums",
                      isHour
                        ? "text-[11px] font-bold text-foreground"
                        : isHalf
                        ? "text-[10px] font-medium text-muted-foreground/70 italic"
                        : "text-[9px] font-normal text-muted-foreground/50 italic",
                    ].join(" ")}
                  >
                    {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}
                  </span>
                  <span
                    className={[
                      "block bg-border",
                      isHour ? "h-px w-2.5" : isHalf ? "h-px w-1.5 opacity-70" : "h-px w-1 opacity-50",
                    ].join(" ")}
                    aria-hidden
                  />
                </div>
              );
            })}
          </div>

          {/* Now badge in axis gutter */}
          {nowY != null && (
            <div
              className="absolute -translate-y-1/2 right-0 mr-1 flex items-center gap-1 rounded-full bg-red-500 text-white text-[10px] font-semibold px-1.5 py-0.5 shadow-sm"
              style={{ top: nowY, left: AXIS_W - 56, zIndex: 5 }}
              data-testid="badge-now"
            >
              <span>Ora</span>
              <span className="tabular-nums opacity-90">{format(now, "HH:mm")}</span>
            </div>
          )}

          {/* Empty state */}
          {placed.length === 0 && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center pl-24">
              <div className="text-center text-sm text-muted-foreground">
                <CalendarEmpty />
                <div className="mt-3">Nessun evento per questo giorno.</div>
              </div>
            </div>
          )}

          {/* Cards (non-overflowed events) */}
          {placed.filter(p => !p.overflow && !temporalClusterMemberIds.has(p.ev.id)).map(p => {
            const style = styleFor(p.ev.type);
            const groupColor = colorOf(p.ev.id);
            const isFaded = highlightedIds ? !highlightedIds.has(p.ev.id) : false;
            const isHovered = hoverId === p.ev.id;
            const isExpanded = expandedId === p.ev.id;
            const left = AXIS_W + p.lane * (cardW + LANE_GAP);
            // Counter badge surfaces only strong (offer/order) chains — weak
            // customer/contact links are still drawn as faint same-day curves
            // but don't bump this number (#85).
            const linksCount = p.ev.links?.filter(l => l.strong).length ?? 0;
            const subline = p.ev.customerName ?? p.ev.contactName ?? p.ev.offerReference ?? p.ev.jobOrderReference ?? "";
            // Expanded cards grow but stay within the container — clamp to remaining width.
            const expandedW = Math.min(cardW + EXPANDED_BONUS, Math.max(cardW, layout.avail - p.lane * (cardW + LANE_GAP)));
            return (
              <div
                key={p.ev.id}
                onMouseEnter={() => setHoverId(p.ev.id)}
                onMouseLeave={() => setHoverId(h => (h === p.ev.id ? null : h))}
                className={[
                  "absolute text-left rounded-xl border bg-card shadow-sm",
                  "ring-1 transition-all duration-200 will-change-transform overflow-hidden",
                  style.ring,
                  p.ev.timePosition === "projection" ? "border-dashed" : "",
                  isFaded && !isExpanded ? "opacity-35 saturate-50" : "opacity-100",
                  isExpanded ? "z-30 shadow-xl" : isHovered ? "z-20 shadow-md" : "z-10 hover:shadow-md",
                ].join(" ")}
                style={{
                  top: p.y,
                  left,
                  width: isExpanded ? expandedW : cardW,
                  boxShadow: isExpanded && groupColor
                    ? `0 12px 36px -10px ${groupColor}80`
                    : isHovered && groupColor
                    ? `0 6px 24px -8px ${groupColor}66`
                    : undefined,
                }}
                data-testid={`recap-event-${p.ev.id}`}
              >
                {/* Group accent bar */}
                {groupColor && (
                  <span
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
                    style={{ background: groupColor, boxShadow: `0 0 8px ${groupColor}80` }}
                    aria-hidden
                  />
                )}
                {/* Compact header — always visible, click to toggle */}
                <button
                  type="button"
                  onClick={() => setExpandedId(id => (id === p.ev.id ? null : p.ev.id))}
                  onFocus={() => setHoverId(p.ev.id)}
                  onBlur={() => setHoverId(h => (h === p.ev.id ? null : h))}
                  className="w-full text-left px-2.5 py-1.5 hover-elevate active-elevate-2"
                  data-testid={`button-toggle-event-${p.ev.id}`}
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${style.bg} ${style.ic}`}>
                      {eventIcon(p.ev)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="tabular-nums text-[11px] font-semibold text-foreground/80">
                          {format(p.date, "HH:mm")}
                        </span>
                        <span className="truncate text-[12px] font-medium leading-tight">
                          {p.ev.title}
                        </span>
                      </div>
                      {!isExpanded && subline && (
                        <div className="truncate text-[10.5px] text-muted-foreground leading-tight mt-px">
                          {subline}
                        </div>
                      )}
                    </div>
                    {linksCount > 0 && !isExpanded && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full text-[9.5px] px-1 py-px font-semibold shrink-0"
                        style={{ background: `${groupColor ?? "#64748b"}22`, color: groupColor ?? "#64748b" }}
                        data-testid={`badge-links-${p.ev.id}`}
                        title={`${linksCount} eventi collegati`}
                      >
                        <Link2 className="w-2.5 h-2.5" />
                        {linksCount}
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div
                    className="px-3 pb-3 pt-1 space-y-2 border-t bg-muted/20"
                    data-testid={`recap-event-expanded-${p.ev.id}`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                      <span>{style.label}</span>
                      {p.ev.subtype && <span className="opacity-70">· {p.ev.subtype}</span>}
                    </div>
                    {p.ev.changeSummary && p.ev.changeSummary.length > 0 ? (
                      <ul className="text-[12px] leading-relaxed text-foreground/85 list-disc pl-4 space-y-0.5">
                        {p.ev.changeSummary.slice(0, 4).map((c, i) => (
                          <li key={i} className="line-clamp-1">{c}</li>
                        ))}
                        {p.ev.changeSummary.length > 4 && (
                          <li className="text-muted-foreground italic list-none">
                            +{p.ev.changeSummary.length - 4} altre modifiche
                          </li>
                        )}
                      </ul>
                    ) : p.ev.description && (
                      <p className="text-[12px] leading-relaxed text-foreground/85 line-clamp-4">
                        {p.ev.description}
                      </p>
                    )}
                    <div className="grid grid-cols-1 gap-0.5 text-[11px]">
                      {p.ev.customerName && (
                        <div><span className="text-muted-foreground">Cliente: </span><span className="font-medium">{p.ev.customerName}</span></div>
                      )}
                      {p.ev.contactName && (
                        <div><span className="text-muted-foreground">Contatto: </span><span className="font-medium">{p.ev.contactName}</span></div>
                      )}
                      {p.ev.offerReference && (
                        <div><span className="text-muted-foreground">Offerta: </span><span className="font-medium">{p.ev.offerReference}{p.ev.offerStatus ? ` (${p.ev.offerStatus})` : ""}</span></div>
                      )}
                      {p.ev.jobOrderReference && (
                        <div><span className="text-muted-foreground">Ordine: </span><span className="font-medium">{p.ev.jobOrderReference}{p.ev.orderStatus ? ` (${p.ev.orderStatus})` : ""}</span></div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {linksCount > 0 && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full text-[10px] px-1.5 py-0.5 font-medium"
                          style={{ background: `${groupColor ?? "#64748b"}1f`, color: groupColor ?? "#64748b" }}
                          title={`${linksCount} eventi collegati`}
                        >
                          <Link2 className="w-2.5 h-2.5" />
                          {linksCount} collegati
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onSelect(p.ev); }}
                        className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                        data-testid={`button-open-event-${p.ev.id}`}
                      >
                        Apri scheda <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Overflow cluster cards — used when too many events would force
              extra lanes beyond the available width. Each cluster groups the
              overflowed events at a similar Y and exposes them on click. */}
          {overflowClusters.map(cl => {
            const isExpanded = expandedId === cl.id;
            const left = AXIS_W + cl.lane * (cardW + LANE_GAP);
            const expandedW = Math.min(cardW + EXPANDED_BONUS, Math.max(cardW, layout.avail - cl.lane * (cardW + LANE_GAP)));
            const count = cl.events.length;
            const firstTime = cl.events[0]?.date;
            const lastTime = cl.events[count - 1]?.date;
            const sameMinute = firstTime && lastTime && format(firstTime, "HH:mm") === format(lastTime, "HH:mm");
            const timeLabel = !firstTime ? "" : sameMinute
              ? format(firstTime, "HH:mm")
              : `${format(firstTime, "HH:mm")} – ${format(lastTime!, "HH:mm")}`;
            // Aggregate group color: use the first overflowed event that belongs to a group.
            const accentColor = cl.events.map(e => colorOf(e.ev.id)).find(Boolean) as string | undefined;
            const isHighlighted = highlightedIds && cl.events.some(e => highlightedIds.has(e.ev.id));
            const isFaded = highlightedIds && !isHighlighted;
            return (
              <div
                key={cl.id}
                className={[
                  "absolute text-left rounded-xl border bg-card shadow-sm",
                  "ring-1 ring-slate-300/70 dark:ring-slate-600/40",
                  "transition-all duration-200 will-change-transform overflow-hidden",
                  isFaded && !isExpanded ? "opacity-35 saturate-50" : "opacity-100",
                  isExpanded ? "z-30 shadow-xl" : "z-10 hover:shadow-md",
                ].join(" ")}
                style={{
                  top: cl.y,
                  left,
                  width: isExpanded ? expandedW : cardW,
                  background:
                    "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--card)) 60%, hsl(var(--muted)/0.5) 100%)",
                  boxShadow: !isExpanded
                    ? `0 6px 0 -3px hsl(var(--card)), 0 6px 0 -3px hsl(var(--border)), 0 12px 0 -6px hsl(var(--card)), 0 12px 0 -6px hsl(var(--border))`
                    : undefined,
                }}
                data-testid={`recap-cluster-${cl.id}`}
              >
                {accentColor && (
                  <span
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
                    style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}80` }}
                    aria-hidden
                  />
                )}
                <button
                  type="button"
                  onClick={() => setExpandedId(id => (id === cl.id ? null : cl.id))}
                  className="w-full text-left px-2.5 py-1.5 hover-elevate active-elevate-2"
                  data-testid={`button-toggle-cluster-${cl.id}`}
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[11px] tabular-nums">
                      {count}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="tabular-nums text-[11px] font-semibold text-foreground/80">
                          {timeLabel}
                        </span>
                        <span className="truncate text-[12px] font-medium leading-tight">
                          {count} eventi insieme
                        </span>
                      </div>
                      {!isExpanded && (
                        <div className="truncate text-[10.5px] text-muted-foreground leading-tight mt-px">
                          Clicca per espandere
                        </div>
                      )}
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-2 pb-2 pt-1 border-t bg-muted/20" data-testid={`recap-cluster-expanded-${cl.id}`}>
                    <ul className="space-y-1">
                      {cl.events.map(p => {
                        const s = styleFor(p.ev.type);
                        return (
                          <li key={p.ev.id}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Focus the event so cross-day satellites can
                                // appear — only meaningful when there is a
                                // strong (offer/order) link (#85).
                                if (p.ev.links?.some(l => l.strong)) {
                                  setExpandedId(id => (id === p.ev.id ? null : p.ev.id));
                                }
                                onSelect(p.ev);
                              }}
                              onMouseEnter={() => setHoverId(p.ev.id)}
                              onMouseLeave={() => setHoverId(h => (h === p.ev.id ? null : h))}
                              className="w-full text-left rounded-md px-1.5 py-1 flex items-center gap-2 hover-elevate"
                              data-testid={`button-cluster-item-${p.ev.id}`}
                            >
                              <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${s.bg} ${s.ic}`}>
                                {eventIcon(p.ev)}
                              </span>
                              <span className="tabular-nums text-[11px] font-semibold text-foreground/80 shrink-0">
                                {format(p.date, "HH:mm")}
                              </span>
                              <span className="truncate text-[11.5px] flex-1">
                                {p.ev.title}
                              </span>
                              {p.ev.links?.some(l => l.strong) && (
                                <Link2 className="w-3 h-3 text-muted-foreground shrink-0" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          {/* Temporal cluster cards — collapse linked events that happen
              within `TEMPORAL_GROUP_WINDOW_MS` of each other into a single
              expandable stack, mirroring the overflow cluster UI (#84). */}
          {temporalClusters.map(cl => {
            const isExpanded = expandedId === cl.id;
            const left = AXIS_W + cl.lane * (cardW + LANE_GAP);
            const expandedW = Math.min(cardW + EXPANDED_BONUS, Math.max(cardW, layout.avail - cl.lane * (cardW + LANE_GAP)));
            const count = cl.events.length;
            const firstTime = cl.events[0]?.date;
            const lastTime = cl.events[count - 1]?.date;
            const sameMinute = firstTime && lastTime && format(firstTime, "HH:mm") === format(lastTime, "HH:mm");
            const timeLabel = !firstTime ? "" : sameMinute
              ? format(firstTime, "HH:mm")
              : `${format(firstTime, "HH:mm")} – ${format(lastTime!, "HH:mm")}`;
            const accentColor = cl.events.map(e => colorOf(e.ev.id)).find(Boolean) as string | undefined;
            const isHighlighted = highlightedIds && cl.events.some(e => highlightedIds.has(e.ev.id));
            const isFaded = highlightedIds && !isHighlighted;
            return (
              <div
                key={cl.id}
                className={[
                  "absolute text-left rounded-xl border bg-card shadow-sm",
                  "ring-1 ring-slate-300/70 dark:ring-slate-600/40",
                  "transition-all duration-200 will-change-transform overflow-hidden",
                  isFaded && !isExpanded ? "opacity-35 saturate-50" : "opacity-100",
                  isExpanded ? "z-30 shadow-xl" : "z-10 hover:shadow-md",
                ].join(" ")}
                style={{
                  top: cl.y,
                  left,
                  width: isExpanded ? expandedW : cardW,
                  background:
                    "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--card)) 60%, hsl(var(--muted)/0.5) 100%)",
                  boxShadow: !isExpanded
                    ? `0 6px 0 -3px hsl(var(--card)), 0 6px 0 -3px hsl(var(--border)), 0 12px 0 -6px hsl(var(--card)), 0 12px 0 -6px hsl(var(--border))`
                    : undefined,
                }}
                data-testid={`recap-temporal-cluster-${cl.id}`}
              >
                {accentColor && (
                  <span
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
                    style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}80` }}
                    aria-hidden
                  />
                )}
                <button
                  type="button"
                  onClick={() => setExpandedId(id => (id === cl.id ? null : cl.id))}
                  className="w-full text-left px-2.5 py-1.5 hover-elevate active-elevate-2"
                  data-testid={`button-toggle-temporal-cluster-${cl.id}`}
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-bold text-[11px] tabular-nums"
                      style={{ background: `${accentColor ?? "hsl(var(--primary))"}1f`, color: accentColor ?? undefined }}
                    >
                      {count}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="tabular-nums text-[11px] font-semibold text-foreground/80">
                          {timeLabel}
                        </span>
                        <span className="truncate text-[12px] font-medium leading-tight">
                          {count} eventi correlati
                        </span>
                      </div>
                      {!isExpanded && (
                        <div className="truncate text-[10.5px] text-muted-foreground leading-tight mt-px inline-flex items-center gap-1">
                          <Link2 className="w-2.5 h-2.5" /> Clicca per espandere
                        </div>
                      )}
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-2 pb-2 pt-1 border-t bg-muted/20" data-testid={`recap-temporal-cluster-expanded-${cl.id}`}>
                    <ul className="space-y-1">
                      {cl.events.map(p => {
                        const s = styleFor(p.ev.type);
                        return (
                          <li key={p.ev.id}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Focus the event only when there is a strong
                                // (offer/order) link, so satellites stay
                                // consistent with the new hierarchy (#85).
                                if (p.ev.links?.some(l => l.strong)) {
                                  setExpandedId(id => (id === p.ev.id ? null : p.ev.id));
                                }
                                onSelect(p.ev);
                              }}
                              onMouseEnter={() => setHoverId(p.ev.id)}
                              onMouseLeave={() => setHoverId(h => (h === p.ev.id ? null : h))}
                              className="w-full text-left rounded-md px-1.5 py-1 flex items-center gap-2 hover-elevate"
                              data-testid={`button-temporal-cluster-item-${p.ev.id}`}
                            >
                              <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${s.bg} ${s.ic}`}>
                                {eventIcon(p.ev)}
                              </span>
                              <span className="tabular-nums text-[11px] font-semibold text-foreground/80 shrink-0">
                                {format(p.date, "HH:mm")}
                              </span>
                              <span className="truncate text-[11.5px] flex-1">
                                {p.ev.title}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          {/* ─── Satellite chips (cross-day correlated events) ───
              Visible while a card is expanded. Each chip belongs to a
              different day and clicking it jumps the Recap to that day. */}
          {satelliteState && (
            <div
              className="absolute z-30 pointer-events-none"
              style={{ left: 0, top: 0, right: 0, bottom: 0 }}
              data-testid="recap-satellites"
            >
              {/* Heading pill */}
              <div
                className="absolute pointer-events-auto rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm border bg-card flex items-center gap-1"
                style={{
                  left: satelliteState.panelLeft,
                  top: Math.max(0, satelliteState.panelTop - 24),
                  color: satelliteState.color,
                  borderColor: `${satelliteState.color}55`,
                }}
              >
                <Link2 className="w-3 h-3" />
                Eventi correlati · altri giorni
                {satelliteState.scrollable && (
                  <span className="opacity-70 normal-case font-normal">({satelliteState.items.length})</span>
                )}
              </div>
              {satelliteState.scrollable ? (
                <div
                  className="absolute pointer-events-auto overflow-y-auto rounded-xl"
                  style={{
                    left: satelliteState.panelLeft,
                    top: satelliteState.panelTop,
                    width: SAT_PANEL_W,
                    height: satelliteState.panelH,
                  }}
                  data-testid="recap-satellites-scroll"
                >
                  <div className="flex flex-col gap-2">
                    {satelliteState.items.map(s => {
                      const style = styleFor(s.ev.type);
                      const isPast = +s.date < +startOfDay(day);
                      const dayLabel = isSameDay(s.date, day)
                        ? "oggi"
                        : format(s.date, "EEE d MMM", { locale: it });
                      return (
                        <button
                          key={s.ev.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onNavigateToDay) onNavigateToDay(startOfDay(s.date));
                            else onSelect(s.ev);
                          }}
                          className="rounded-xl border bg-card shadow-md hover-elevate active-elevate-2 text-left overflow-hidden relative"
                          style={{
                            height: SAT_CARD_H,
                            borderColor: `${s.color}66`,
                            boxShadow: `0 6px 18px -8px ${s.color}66`,
                          }}
                          data-testid={`satellite-${s.ev.id}`}
                          title={`Vai al ${dayLabel}: ${s.ev.title}`}
                        >
                          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: s.color }} aria-hidden />
                          <div className="px-2.5 py-1.5 h-full flex flex-col justify-center gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full text-[9.5px] px-1.5 py-px font-semibold" style={{ background: `${s.color}22`, color: s.color }}>
                                {isPast ? "← " : "→ "}{dayLabel}
                              </span>
                              <span className="tabular-nums text-[10.5px] font-medium text-muted-foreground">
                                {format(s.date, "HH:mm")}
                              </span>
                              <ArrowUpRight className="w-3 h-3 text-muted-foreground ml-auto shrink-0" />
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${style.bg} ${style.ic}`}>
                                {eventIcon(s.ev)}
                              </span>
                              <span className="truncate text-[12px] font-medium leading-tight">
                                {s.ev.title}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : satelliteState.items.map(s => {
                const style = styleFor(s.ev.type);
                const isPast = +s.date < +startOfDay(day);
                const dayLabel = isSameDay(s.date, day)
                  ? "oggi"
                  : format(s.date, "EEE d MMM", { locale: it });
                return (
                  <button
                    key={s.ev.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onNavigateToDay) onNavigateToDay(startOfDay(s.date));
                      else onSelect(s.ev);
                    }}
                    onMouseEnter={() => setHoverId(s.ev.id)}
                    onMouseLeave={() => setHoverId(h => (h === s.ev.id ? null : h))}
                    className="absolute pointer-events-auto rounded-xl border bg-card shadow-md hover-elevate active-elevate-2 text-left overflow-hidden"
                    style={{
                      left: satelliteState.panelLeft,
                      top: s.panelY,
                      width: SAT_PANEL_W,
                      height: SAT_CARD_H,
                      borderColor: `${s.color}66`,
                      boxShadow: `0 6px 18px -8px ${s.color}66`,
                    }}
                    data-testid={`satellite-${s.ev.id}`}
                    title={`Vai al ${dayLabel}: ${s.ev.title}`}
                  >
                    <span
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
                      style={{ background: s.color }}
                      aria-hidden
                    />
                    <div className="px-2.5 py-1.5 h-full flex flex-col justify-center gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-flex items-center gap-1 rounded-full text-[9.5px] px-1.5 py-px font-semibold"
                          style={{ background: `${s.color}22`, color: s.color }}
                        >
                          {isPast ? "← " : "→ "}{dayLabel}
                        </span>
                        <span className="tabular-nums text-[10.5px] font-medium text-muted-foreground">
                          {format(s.date, "HH:mm")}
                        </span>
                        <ArrowUpRight className="w-3 h-3 text-muted-foreground ml-auto shrink-0" />
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${style.bg} ${style.ic}`}>
                          {eventIcon(s.ev)}
                        </span>
                        <span className="truncate text-[12px] font-medium leading-tight">
                          {s.ev.title}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarEmpty() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="mx-auto opacity-50">
      <rect x="8" y="14" width="48" height="42" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="8" y1="24" x2="56" y2="24" stroke="currentColor" strokeWidth="2" />
      <line x1="20" y1="10" x2="20" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="44" y1="10" x2="44" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
