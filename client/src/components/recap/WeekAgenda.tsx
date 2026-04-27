import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addDays, differenceInCalendarDays, format, isToday as dfnsIsToday, parseISO, startOfDay, startOfWeek } from "date-fns";
import { it } from "date-fns/locale";
import {
  Phone, Mail, MailOpen, Send, MapPin, Video, MessageCircle, FileText, ClipboardList,
  Bell, UserCheck, Activity, ListTodo, Sparkles, Link2, AlertTriangle, ExternalLink, HelpCircle,
  Network, ArrowRight, ChevronRight, CornerDownLeft,
  RefreshCw, CheckCircle2, Layers, Paperclip, PencilRuler,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { RecapEvent, RecapEventType, RecapLinkKind, RecapTimePosition } from "@shared/recap";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  /** Any anchor inside the week to display. Will be normalised to Monday. */
  anchor: Date;
  /** Wide event window (≈ ±14 days around anchor) — already fetched by the page. */
  allEvents: RecapEvent[];
  onSelect: (e: RecapEvent) => void;
  isLoading?: boolean;
}

// ─── Visual config ──────────────────────────────────────────────────────
const AXIS_W = 84;            // Left day-axis gutter
const HOUR_AXIS_H = 28;       // Top hour-axis gutter
const ROW_H = 116;             // Vertical space per day row
const LANE_H = 30;             // Vertical space per lane within a row
const MAX_LANES = 3;           // After this we cluster overflow
const ICON_W = 26;             // Icon chip diameter
const MIN_GAP_PX = 6;          // Min horizontal gap before two icons collide
const CONNECT_INSET = ICON_W / 2;

const TYPE_STYLE: Record<RecapEventType, { bg: string; ic: string; ring: string; hex: string; label: string }> = {
  interaction:          { ring: "ring-emerald-300/70 dark:ring-emerald-700/40", bg: "bg-emerald-50 dark:bg-emerald-950/40", ic: "text-emerald-700 dark:text-emerald-300", hex: "#10b981", label: "Interazione" },
  offer_created:        { ring: "ring-violet-300/70 dark:ring-violet-700/40",   bg: "bg-violet-50 dark:bg-violet-950/40",   ic: "text-violet-700 dark:text-violet-300",   hex: "#8b5cf6", label: "Offerta" },
  offer_close_forecast: { ring: "ring-violet-300/50 dark:ring-violet-700/30",   bg: "bg-violet-50/60 dark:bg-violet-950/20",ic: "text-violet-600 dark:text-violet-300",   hex: "#a78bfa", label: "Chiusura prevista" },
  // Offer family — violet/fuchsia.
  offer_status_changed: { ring: "ring-violet-300/70 dark:ring-violet-700/40",   bg: "bg-violet-50 dark:bg-violet-950/30",   ic: "text-violet-700 dark:text-violet-300",   hex: "#8b5cf6", label: "Cambio stato offerta" },
  offer_drawing_added:  { ring: "ring-fuchsia-300/70 dark:ring-fuchsia-700/40", bg: "bg-fuchsia-50 dark:bg-fuchsia-950/40", ic: "text-fuchsia-700 dark:text-fuchsia-300", hex: "#d946ef", label: "Disegno offerta" },
  offer_drawing_ready:  { ring: "ring-fuchsia-300/50 dark:ring-fuchsia-700/30", bg: "bg-fuchsia-50/60 dark:bg-fuchsia-950/20",ic: "text-fuchsia-700 dark:text-fuchsia-300",hex: "#e879f9", label: "Disegno evaso" },
  // Order family — indigo/blue/sky.
  order_created:        { ring: "ring-indigo-300/70 dark:ring-indigo-700/40",   bg: "bg-indigo-50 dark:bg-indigo-950/40",   ic: "text-indigo-700 dark:text-indigo-300",   hex: "#6366f1", label: "Ordine" },
  order_milestone:      { ring: "ring-blue-300/70 dark:ring-blue-700/40",       bg: "bg-blue-50 dark:bg-blue-950/40",       ic: "text-blue-700 dark:text-blue-300",       hex: "#3b82f6", label: "Milestone" },
  order_approved:       { ring: "ring-indigo-400/80 dark:ring-indigo-600/50",   bg: "bg-indigo-50 dark:bg-indigo-950/40",   ic: "text-indigo-800 dark:text-indigo-200",   hex: "#4f46e5", label: "Approvazione ordine" },
  order_versioned:      { ring: "ring-indigo-300/60 dark:ring-indigo-700/30",   bg: "bg-indigo-50/70 dark:bg-indigo-950/25",ic: "text-indigo-700 dark:text-indigo-300",   hex: "#818cf8", label: "Versione ordine" },
  order_email_link:     { ring: "ring-blue-300/70 dark:ring-blue-700/40",       bg: "bg-blue-50 dark:bg-blue-950/40",       ic: "text-blue-700 dark:text-blue-300",       hex: "#60a5fa", label: "Email allegata a ordine" },
  order_layout_added:   { ring: "ring-sky-300/70 dark:ring-sky-700/40",         bg: "bg-sky-50 dark:bg-sky-950/40",         ic: "text-sky-700 dark:text-sky-300",         hex: "#0ea5e9", label: "Layout ordine caricato" },
  order_layout_changed: { ring: "ring-sky-300/60 dark:ring-sky-700/30",         bg: "bg-sky-50/70 dark:bg-sky-950/25",      ic: "text-sky-700 dark:text-sky-300",         hex: "#38bdf8", label: "Layout ordine sostituito" },
  order_document_added: { ring: "ring-blue-300/60 dark:ring-blue-700/30",       bg: "bg-blue-50/80 dark:bg-blue-950/30",    ic: "text-blue-700 dark:text-blue-300",       hex: "#3b82f6", label: "Documento ordine" },
  reminder:             { ring: "ring-amber-300/70 dark:ring-amber-700/40",     bg: "bg-amber-50 dark:bg-amber-950/40",     ic: "text-amber-700 dark:text-amber-300",     hex: "#f59e0b", label: "Promemoria" },
  contact_recall:       { ring: "ring-pink-300/70 dark:ring-pink-700/40",       bg: "bg-pink-50 dark:bg-pink-950/40",       ic: "text-pink-700 dark:text-pink-300",       hex: "#ec4899", label: "Recall" },
  activity:             { ring: "ring-slate-300/70 dark:ring-slate-700/40",     bg: "bg-slate-50 dark:bg-slate-900/60",     ic: "text-slate-700 dark:text-slate-300",     hex: "#64748b", label: "Attività" },
  // Talent Studio (Task #2): preventivi/campagne/pagamenti.
  quote_sent:            { ring: "ring-violet-300/70 dark:ring-violet-700/40",   bg: "bg-violet-50 dark:bg-violet-950/40",   ic: "text-violet-700 dark:text-violet-300",   hex: "#8b5cf6", label: "Preventivo inviato" },
  quote_accepted:        { ring: "ring-emerald-400/80 dark:ring-emerald-600/50", bg: "bg-emerald-50 dark:bg-emerald-950/40", ic: "text-emerald-800 dark:text-emerald-200", hex: "#059669", label: "Preventivo accettato" },
  deliverable_published: { ring: "ring-sky-300/70 dark:ring-sky-700/40",         bg: "bg-sky-50 dark:bg-sky-950/40",         ic: "text-sky-700 dark:text-sky-300",         hex: "#0ea5e9", label: "Deliverable pubblicato" },
  campaign_payment_in:   { ring: "ring-emerald-300/70 dark:ring-emerald-700/40", bg: "bg-emerald-50 dark:bg-emerald-950/40", ic: "text-emerald-700 dark:text-emerald-300", hex: "#10b981", label: "Pagamento in entrata" },
  campaign_payment_out:  { ring: "ring-rose-300/70 dark:ring-rose-700/40",       bg: "bg-rose-50 dark:bg-rose-950/40",       ic: "text-rose-700 dark:text-rose-300",       hex: "#f43f5e", label: "Pagamento in uscita" },
};

const GROUP_PALETTE = [
  "#8b5cf6", "#10b981", "#f59e0b", "#ec4899",
  "#3b82f6", "#ef4444", "#14b8a6", "#a855f7",
];

const HOT_RX = /(urgen|alert|critic|problem|scadut|in ritardo|non rispost|overdue|escalat|reclam)/i;

// User-toggleable link kinds in the week-agenda header. Persisted in
// localStorage so the user's choice survives reloads and view switches.
// Default: only strong links (offer/order) feed into networks/curves.
type LinkKindFlags = { offer: boolean; order: boolean; contact: boolean; customer: boolean; email: boolean };
// v3 (#115): `email` is now defaulted OFF. We bump the LS key so users who
// already persisted `email:true` under v2 (the short-lived buggy default)
// land back on the safer default; their offer/order/contact/customer
// preferences are migrated forward from v2/v1 if present.
const LINK_KIND_LS_KEY = "recap-week-link-kinds-v3";
const LEGACY_LINK_KIND_LS_KEYS = [
  "recap-week-link-kinds-v2",
  "recap-week-link-kinds-v1",
];
// `email` defaults to OFF: a single Gmail thread can produce up to 12 strong
// edges per event, and combined with the existing offer/order networks the
// resulting graph saturated the WeekAgenda curve renderer (see task #115).
// The toggle stays in the toolbar so the user can opt back in.
const DEFAULT_LINK_KINDS: LinkKindFlags = { offer: true, order: true, contact: false, customer: false, email: false };
function readLinkKindsFromStorage(): LinkKindFlags {
  if (typeof window === "undefined") return DEFAULT_LINK_KINDS;
  try {
    let raw = window.localStorage.getItem(LINK_KIND_LS_KEY);
    let isLegacy = false;
    if (!raw) {
      for (const k of LEGACY_LINK_KIND_LS_KEYS) {
        const v = window.localStorage.getItem(k);
        if (v) { raw = v; isLegacy = true; break; }
      }
    }
    if (!raw) return DEFAULT_LINK_KINDS;
    const parsed = JSON.parse(raw) as Partial<LinkKindFlags>;
    return {
      offer: typeof parsed.offer === "boolean" ? parsed.offer : DEFAULT_LINK_KINDS.offer,
      order: typeof parsed.order === "boolean" ? parsed.order : DEFAULT_LINK_KINDS.order,
      contact: typeof parsed.contact === "boolean" ? parsed.contact : DEFAULT_LINK_KINDS.contact,
      customer: typeof parsed.customer === "boolean" ? parsed.customer : DEFAULT_LINK_KINDS.customer,
      // When migrating from a legacy key, force the new safer default for
      // `email` rather than honouring whatever was persisted under v2.
      email: isLegacy
        ? DEFAULT_LINK_KINDS.email
        : (typeof parsed.email === "boolean" ? parsed.email : DEFAULT_LINK_KINDS.email),
    };
  } catch {
    return DEFAULT_LINK_KINDS;
  }
}

function LinkKindToggle({
  label,
  enabled,
  onToggle,
  testId,
  title,
}: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  testId: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      title={title}
      className={[
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors select-none",
        enabled
          ? "bg-foreground/10 text-foreground border-foreground/35 hover:bg-foreground/15"
          : "bg-transparent text-muted-foreground border-border opacity-55 hover:opacity-90",
      ].join(" ")}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

// ─── Email body preview helpers ───────────────────────────────────────
// Email-type recap events (subtype starts with "email:") are surfaced
// from three sources (interactions table, email_send_log, gmail inbox
// index) and currently show only the subject in the popover. To give the
// user actual content context we fetch the body snippet from the live
// Gmail API on-demand when the popover is opened. The Gmail provider
// message id is parsed from `event.href` ("/email?messageId=...") which
// is already populated server-side for both inbound and sent rows.

function isEmailRecapEvent(ev: RecapEvent): boolean {
  // All three email sources serialise as id prefix + email subtype.
  if (ev.id.startsWith("email_inbox:") || ev.id.startsWith("email_send:")) return true;
  if (ev.subtype && /^email:/.test(ev.subtype)) return true;
  return false;
}

function extractGmailMessageId(ev: RecapEvent): string | null {
  if (!ev.href) return null;
  // href is always a relative path in this codebase, so synthesize a base
  // for the URL parser; we only care about the search params.
  try {
    const u = new URL(ev.href, "https://placeholder.local");
    const id = u.searchParams.get("messageId");
    return id && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

// Inline preview of an email body, fetched lazily via the same endpoint
// the live mailbox uses (`/api/email/messages/:id`). The component only
// triggers a network call when it actually mounts — i.e. when the
// containing popover is opened — and quietly stays empty if the user
// has no Gmail connection or the message has been deleted upstream.
function EmailBodyPreview({ messageId }: { messageId: string }) {
  const { data, isLoading, isError } = useQuery<{
    snippet?: string;
    bodyText?: string;
  }>({
    queryKey: ["/api/email/messages", messageId],
    queryFn: async () => {
      const res = await fetch(
        `/api/email/messages/${encodeURIComponent(messageId)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <p
        className="text-[11px] italic text-muted-foreground"
        data-testid={`text-email-preview-loading-${messageId}`}
      >
        Caricamento anteprima…
      </p>
    );
  }
  if (isError || !data) return null;
  // Prefer the Gmail-provided snippet (~200 char text preview, already
  // stripped of HTML); fall back to the first chunk of the plain-text
  // body if for some reason the snippet is empty.
  const raw = (data.snippet || data.bodyText || "").trim();
  if (!raw) return null;
  const preview = raw.length > 320 ? `${raw.slice(0, 320)}…` : raw;
  return (
    <p
      className="text-[11.5px] leading-snug italic text-foreground/75 line-clamp-3 border-l-2 border-border/60 pl-2"
      data-testid={`text-email-preview-${messageId}`}
    >
      {preview}
    </p>
  );
}

// Slot wrapper consumed by the popover. We use a stable named component
// rather than an inline IIFE so that React's hook-call detector treats the
// rendered EmailBodyPreview as a normal child whose hook order stays
// consistent across re-renders, even when the parent toggles
// `expandedId` quickly (#115).
function EmailPreviewSlot({ ev }: { ev: RecapEvent }) {
  if (!isEmailRecapEvent(ev)) return null;
  const gmailId = extractGmailMessageId(ev);
  if (!gmailId) return null;
  return <EmailBodyPreview messageId={gmailId} />;
}

// Visual-only toggle for the SVG connection curves between linked events
// in the week-agenda. Defaults to OFF (curves hidden) because dense weeks
// produce many overlapping bezier arcs whose accumulated halos make the
// grid hard to read. The colored "link present" dot on each icon stays
// visible regardless — it's driven by `links` data, not by this flag.
const SHOW_LINK_CURVES_LS_KEY = "recap-week-show-link-curves-v1";
const DEFAULT_SHOW_LINK_CURVES = false;
function readShowLinkCurvesFromStorage(): boolean {
  if (typeof window === "undefined") return DEFAULT_SHOW_LINK_CURVES;
  try {
    const raw = window.localStorage.getItem(SHOW_LINK_CURVES_LS_KEY);
    if (raw == null) return DEFAULT_SHOW_LINK_CURVES;
    const parsed = JSON.parse(raw);
    return typeof parsed === "boolean" ? parsed : DEFAULT_SHOW_LINK_CURVES;
  } catch {
    return DEFAULT_SHOW_LINK_CURVES;
  }
}

type EventIconShape = Pick<RecapEvent, "type" | "subtype" | "title">;

function emailIcon(e: Pick<RecapEvent, "subtype" | "title">) {
  const sub = (e.subtype || "").toLowerCase();
  const t = e.title || "";
  const out = sub.includes("outbound") || sub.includes("sent") || t.includes("→");
  const inb = sub.includes("inbound") || sub.includes("received") || t.includes("←");
  if (out) return <Send className="w-3 h-3" />;
  if (inb) return <MailOpen className="w-3 h-3" />;
  return <Mail className="w-3 h-3" />;
}

function eventIcon(e: EventIconShape) {
  if (e.type === "interaction") {
    const sub = (e.subtype || "").split(":")[0];
    if (sub === "phone_call") return <Phone className="w-3 h-3" />;
    if (sub === "email") return emailIcon(e);
    if (sub === "visit") return <MapPin className="w-3 h-3" />;
    if (sub === "video_call") return <Video className="w-3 h-3" />;
    if (sub === "whatsapp") return <MessageCircle className="w-3 h-3" />;
    if (sub === "offer_created" || sub === "offer_versioned") return <FileText className="w-3 h-3" />;
    if (sub === "todo") return <ListTodo className="w-3 h-3" />;
    return <Mail className="w-3 h-3" />;
  }
  if (e.type === "activity" && (e.subtype || "").toLowerCase().startsWith("email")) return emailIcon(e);
  if (e.type === "offer_created" || e.type === "offer_close_forecast") return <FileText className="w-3 h-3" />;
  if (e.type === "offer_status_changed") return <RefreshCw className="w-3 h-3" />;
  if (e.type === "offer_drawing_added") return <PencilRuler className="w-3 h-3" />;
  if (e.type === "offer_drawing_ready") return <CheckCircle2 className="w-3 h-3" />;
  if (e.type === "order_created" || e.type === "order_milestone") return <ClipboardList className="w-3 h-3" />;
  if (e.type === "order_approved") return <CheckCircle2 className="w-3 h-3" />;
  if (e.type === "order_versioned") return <Layers className="w-3 h-3" />;
  if (e.type === "order_email_link") return <Paperclip className="w-3 h-3" />;
  if (e.type === "order_layout_added") return <FileText className="w-3 h-3" />;
  if (e.type === "order_layout_changed") return <RefreshCw className="w-3 h-3" />;
  if (e.type === "order_document_added") return <FileText className="w-3 h-3" />;
  if (e.type === "reminder") return <Bell className="w-3 h-3" />;
  if (e.type === "contact_recall") return <UserCheck className="w-3 h-3" />;
  return <Activity className="w-3 h-3" />;
}

function isHot(e: RecapEvent, now: Date): boolean {
  // Past-due reminders / recalls = hot
  if ((e.type === "reminder" || e.type === "contact_recall") && +parseISO(e.date) < +now) return true;
  // Keyword markers in subtype/title
  const probe = `${e.subtype || ""} ${e.title || ""}`;
  if (HOT_RX.test(probe)) return true;
  return false;
}

// Union-find for connected components (events linked together).
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
  const rootCount = new Map<string, number>();
  for (const e of events) {
    const r = find(e.id);
    rootCount.set(r, (rootCount.get(r) ?? 0) + 1);
  }
  const rootIndex = new Map<string, number>();
  let next = 0;
  rootCount.forEach((c, r) => { if (c >= 2) rootIndex.set(r, next++); });
  const out = new Map<string, number>();
  for (const e of events) {
    const r = find(e.id);
    const gi = rootIndex.get(r);
    if (gi != null) out.set(e.id, gi);
  }
  return out;
}

interface PlacedItem {
  ev: RecapEvent;
  date: Date;
  dayIdx: number;     // 0..6 (Monday..Sunday)
  hourFrac: number;   // 0..24
  lane: number;       // 0..MAX_LANES-1
  overflow: boolean;
}

interface Cluster {
  id: string;
  dayIdx: number;
  hourFrac: number;   // representative hour
  events: PlacedItem[];
}

// ─── Legend ──────────────────────────────────────────────────────────────
const INTERACTION_SUBTYPES: Array<{ subtype: string; label: string }> = [
  { subtype: "phone_call", label: "Telefonata" },
  { subtype: "email:outbound", label: "Email inviata" },
  { subtype: "email:inbound", label: "Email ricevuta" },
  { subtype: "visit", label: "Visita" },
  { subtype: "video_call", label: "Video call" },
  { subtype: "whatsapp", label: "WhatsApp" },
  { subtype: "todo", label: "To‑do" },
];

function LegendIconChip({ ev }: { ev: EventIconShape }) {
  const st = TYPE_STYLE[ev.type];
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full ring-1 ${st.bg} ${st.ic} ${st.ring}`}
      aria-hidden
    >
      {eventIcon(ev)}
    </span>
  );
}

function WeekAgendaLegend() {
  const types = Object.keys(TYPE_STYLE) as RecapEventType[];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium border border-border/70 bg-background/60 text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
          data-testid="button-week-legend"
          aria-label="Mostra legenda icone"
        >
          <HelpCircle className="w-3 h-3" />
          Legenda
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-h-[70vh] overflow-y-auto p-0"
        data-testid="popover-week-legend"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2.5 border-b">
          <div className="text-xs font-semibold text-foreground">Legenda</div>
          <div className="text-[10.5px] text-muted-foreground">Cosa rappresentano icone e indicatori</div>
        </div>

        <div className="px-3 py-2.5 border-b">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Tipi di evento
          </div>
          <ul className="grid grid-cols-1 gap-1.5">
            {types.map((t) => {
              const synthetic: EventIconShape = { type: t, subtype: "", title: "" };
              return (
                <li key={t} className="flex items-center gap-2 text-[11.5px] text-foreground">
                  <LegendIconChip ev={synthetic} />
                  <span>{TYPE_STYLE[t].label}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="px-3 py-2.5 border-b">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Sottotipi di interazione
          </div>
          <ul className="grid grid-cols-1 gap-1.5">
            {INTERACTION_SUBTYPES.map((s) => {
              const synthetic: EventIconShape = { type: "interaction", subtype: s.subtype, title: "" };
              return (
                <li key={s.subtype} className="flex items-center gap-2 text-[11.5px] text-foreground">
                  <LegendIconChip ev={synthetic} />
                  <span>{s.label}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="px-3 py-2.5">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Indicatori
          </div>
          <ul className="grid grid-cols-1 gap-2 text-[11.5px] text-foreground">
            <li className="flex items-center gap-2">
              <span className="relative inline-flex w-5 h-5 items-center justify-center">
                <span className="w-3.5 h-3.5 rounded-full bg-muted ring-1 ring-border" />
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500 ring-1 ring-background" />
              </span>
              <span>Puntino rosso: evento da gestire (urgente o scaduto)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="relative inline-flex w-5 h-5 items-center justify-center">
                <span className="w-3.5 h-3.5 rounded-full bg-muted ring-1 ring-border" />
                <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-violet-500 ring-1 ring-background" />
              </span>
              <span>Puntino colorato: evento collegato ad altri (stessa rete)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-foreground/80 text-[9px] font-semibold text-background">
                +N
              </span>
              <span>Eventi sovrapposti raggruppati: clicca per espanderli</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-flex w-5 h-5 items-center justify-center">
                <span className="w-4 h-[2px] bg-red-500 rounded-full" />
              </span>
              <span>Linea rossa verticale: ora corrente</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-flex w-5 h-5 items-center justify-center">
                <span className="w-4 h-2 rounded-sm bg-amber-200/70 dark:bg-amber-900/50 ring-1 ring-amber-300/70 dark:ring-amber-700/40" />
              </span>
              <span>Riga ambrata: giorno corrente</span>
            </li>
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Continuous-scroll range bounds (relative to weekStart). The user can scroll
// up/down to reveal more days without changing the anchor; the navigation
// arrows still re-center the view by changing `anchor`.
const MIN_OFFSET = -130;  // ~18-19 weeks back (≥ 4 months)
const MAX_OFFSET = 96;    // ~13 weeks forward (exclusive of last endOffset+1)
const SCROLL_EDGE_PX = 220;
const EXTEND_DAYS = 7;
const VIEWPORT_MAX_H = 720;

// ─── Focus-mode timeline view ───────────────────────────────────────────
// While "Raggruppa collegamenti" is active, the week grid is hidden and we
// render this dedicated horizontal-timeline view instead. It uses the full
// width of the Recap area, lays the focused event + every (filtered)
// satellite as full popover-style cards left→right in chronological order
// (oldest → newest), and connects them with a colored timeline so the
// sequence is unmistakable. The anchor card gets a colored border + a
// "Selezionato" pill but stays in its real chronological slot — it does
// *not* jump to the centre.
type FocusTimelineItem = { ev: RecapEvent; date: Date; isAnchor: boolean };

const CARD_MIN_W = 260;
const CARD_GAP = 24;
const MARKER_W = 14;
// Min height keeps every card on the same row aligned vertically even when
// the data is uneven (one event has a long description, another has only a
// title). Picked empirically so a card with 1 line of text + the metadata
// rows still fills the slot without looking padded.
const CARD_MIN_H = 230;

// Translate a raw interaction subtype like "phone_call" or
// "email:inbound:received" into the user-facing italian label that the
// legend uses ("Telefonata", "Email ricevuta", …). Returns null if the
// subtype doesn't match anything known so the caller can hide the chip.
function focusSubtypeLabel(subtype?: string | null): string | null {
  if (!subtype) return null;
  const low = subtype.toLowerCase();
  for (const s of INTERACTION_SUBTYPES) {
    if (low.startsWith(s.subtype)) return s.label;
  }
  return null;
}

// Format a number as a euro amount (italian locale, no decimals when round).
function focusFormatEur(n: number): string {
  const hasCents = Math.round(n * 100) % 100 !== 0;
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(n);
}

// Tiny "where in time" pill — past / future / projection.
const FOCUS_TIME_POSITION_META: Record<RecapTimePosition, { label: string; cls: string }> = {
  past: {
    label: "Già accaduto",
    cls: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200",
  },
  future: {
    label: "In arrivo",
    cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
  },
  projection: {
    label: "Previsto",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  },
};

function FocusTimelineCard({
  item,
  color,
  now,
  onOpen,
  showChevronAfter = false,
  showWrapToNextRow = false,
}: {
  item: FocusTimelineItem;
  color: string;
  now: Date;
  onOpen: (e: RecapEvent) => void;
  /** When true, draw a small chevron `›` on the right edge of the card to
   * indicate the chronological direction toward the next card on the same row.
   * Hidden for cards that are last on their row (or last overall) so we don't
   * leave an arrow pointing into empty space after a row break. */
  showChevronAfter?: boolean;
  /** When true, draw a small "down-left" wrap arrow at the right edge of
   * the card to signal that the chronological sequence continues on the
   * next row (start of the row below). Used for cards that are the last on
   * their row but NOT the last overall, replacing the hidden chevron with
   * an explicit row-break connector so the reader doesn't lose the thread. */
  showWrapToNextRow?: boolean;
}) {
  const { ev, date, isAnchor } = item;
  const style = TYPE_STYLE[ev.type];
  const linksCount = ev.links?.filter(l => l.strong).length ?? 0;
  const hot = isHot(ev, now);
  return (
    <div
      className="relative flex flex-col items-center shrink-0"
      data-id={ev.id}
      data-focus-item-id={ev.id}
      data-testid={`focus-timeline-item-${ev.id}`}
      // `maxWidth: 100%` lets the card shrink on viewports narrower than
      // CARD_MIN_W so the section's `overflow-x-hidden` never clips content.
      style={{ width: CARD_MIN_W, maxWidth: "100%" }}
    >
      {/* Marker on the timeline line */}
      <span
        className="relative z-10 inline-flex items-center justify-center rounded-full ring-4 ring-background"
        style={{
          width: MARKER_W,
          height: MARKER_W,
          background: color,
          boxShadow: isAnchor ? `0 0 0 3px ${color}55` : undefined,
        }}
        aria-hidden
      />
      {/* Date label under the marker */}
      <div className="tabular-nums text-foreground/85 mt-2 text-[13px] font-bold">
        {format(date, "d MMM yyyy", { locale: it })}
      </div>
      <div className="text-[10px] tabular-nums mb-2 text-[#000000] font-semibold">
        {format(date, "EEE 'alle' HH:mm", { locale: it })}
      </div>
      {/* Card body — extended version of the standard hover popover.
          Adds: subtype/area/timePosition mini chips, offer total in EUR,
          longer description preview, info-rich metadata grid. min-height
          keeps cards on the same row aligned. */}
      <div
        className={[
          "relative w-full rounded-xl bg-card shadow-lg p-3.5 flex flex-col gap-2.5 transition-shadow",
          isAnchor ? "border-2" : "border hover:shadow-xl",
        ].join(" ")}
        style={{
          minHeight: CARD_MIN_H,
          borderColor: isAnchor ? color : `${color}55`,
          ...(isAnchor ? { boxShadow: `0 10px 24px -10px ${color}aa` } : {}),
        }}
      >
        {/* Chevron `›` between this card and the next one on the same row.
            Hidden when the next card wraps to a new row (or this is the last
            card overall) so we never leave a dangling arrow pointing into
            empty space. Sits half-way into the gap between cards. */}
        {showChevronAfter && (
          <span
            className="absolute pointer-events-none z-10"
            aria-hidden
            style={{
              right: -CARD_GAP / 2 - 10,
              top: "50%",
              transform: "translateY(-50%)",
              color,
            }}
            data-testid={`focus-timeline-chevron-${ev.id}`}
          >
            <ChevronRight className="w-5 h-5" strokeWidth={3} />
          </span>
        )}
        {/* Row-wrap connector: when this is the last card on its row (but
            not the last overall), the right-side chevron is hidden — we
            replace it with a small "down-left" arrow that hangs into the
            row gap below to signal the timeline continues on the next row. */}
        {showWrapToNextRow && (
          <span
            className="absolute pointer-events-none z-10 inline-flex items-center justify-center rounded-full bg-background border"
            aria-label="La sequenza prosegue sulla riga successiva"
            title="La sequenza prosegue sulla riga successiva"
            style={{
              right: -10,
              bottom: -14,
              width: 22,
              height: 22,
              color,
              borderColor: `${color}66`,
              boxShadow: `0 2px 6px -2px ${color}80`,
            }}
            data-testid={`focus-timeline-wrap-${ev.id}`}
          >
            <CornerDownLeft className="w-3.5 h-3.5" strokeWidth={2.75} />
          </span>
        )}
        {/* Header: icon + title + date + Da gestire / Selezionato pills */}
        <div className="flex items-start gap-2.5">
          <span
            className={`inline-flex w-9 h-9 shrink-0 rounded-lg items-center justify-center ${style.bg} ${style.ic} border`}
            style={{ borderColor: `${color}55` }}
          >
            {eventIcon(ev)}
          </span>
          <div className="flex-1 min-w-0">
            <div
              className="text-[13.5px] font-semibold leading-snug line-clamp-2"
              data-testid={`focus-timeline-title-${ev.id}`}
            >
              {ev.title}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {format(date, "EEEE d MMMM 'alle' HH:mm", { locale: it })}
            </div>
          </div>
          {hot && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-semibold px-1.5 py-0.5 shrink-0">
              <AlertTriangle className="w-3 h-3" />
              Da gestire
            </span>
          )}
        </div>

        {/* Mini-chip row: time-position / interaction subtype / area.
            Each chip is conditional, the whole row hides if all are empty. */}
        {(() => {
          const tp = FOCUS_TIME_POSITION_META[ev.timePosition];
          const subLabel = focusSubtypeLabel(ev.subtype);
          const chips: ReactNode[] = [];
          if (isAnchor) {
            chips.push(
              <span
                key="anchor"
                className="inline-flex items-center gap-1 rounded-full text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5"
                style={{ background: `${color}1f`, color }}
              >
                <Network className="w-3 h-3" />
                Selezionato
              </span>
            );
          }
          if (tp) {
            chips.push(
              <span
                key="tp"
                className={`inline-flex items-center rounded-full text-[10px] font-medium px-1.5 py-0.5 ${tp.cls}`}
              >
                {tp.label}
              </span>
            );
          }
          if (subLabel) {
            chips.push(
              <span
                key="sub"
                className="inline-flex items-center rounded-full text-[10px] font-medium px-1.5 py-0.5 bg-muted text-foreground/80"
              >
                {subLabel}
              </span>
            );
          }
          if (ev.area) {
            chips.push(
              <span
                key="area"
                className="inline-flex items-center gap-0.5 rounded-full text-[10px] font-medium px-1.5 py-0.5 bg-muted text-foreground/80"
              >
                <MapPin className="w-2.5 h-2.5" />
                {ev.area}
              </span>
            );
          }
          if (chips.length === 0) return null;
          return <div className="flex flex-wrap items-center gap-1.5">{chips}</div>;
        })()}

        {/* Description preview — longer than the standard popover so the
            user can actually read the gist of the email/note/visit
            without opening it. For order_versioned events we instead
            render a structured bullet list of the actual diff sourced
            from `changeSummary` (Task #109 follow-up). */}
        {ev.changeSummary && ev.changeSummary.length > 0 ? (
          <ul
            className="text-[12px] leading-relaxed text-foreground/85 list-disc pl-4 space-y-0.5"
            data-testid={`focus-timeline-changes-${ev.id}`}
          >
            {ev.changeSummary.slice(0, 5).map((c, i) => (
              <li key={i} className="line-clamp-1">{c}</li>
            ))}
            {ev.changeSummary.length > 5 && (
              <li className="text-muted-foreground italic list-none">
                +{ev.changeSummary.length - 5} altre modifiche
              </li>
            )}
          </ul>
        ) : ev.description && (
          <p className="text-[12px] leading-relaxed line-clamp-5 text-foreground/85">
            {ev.description}
          </p>
        )}

        {/* Offer total — shown prominently when present, in italian EUR.
            Number.isFinite guards against NaN/Infinity coming from the
            API so we never render literal "NaN €". */}
        {typeof ev.offerTotal === "number" && Number.isFinite(ev.offerTotal) && (
          <div
            className="rounded-md px-2 py-1 text-[11.5px] inline-flex items-center justify-between gap-2 self-start"
            style={{ background: `${color}14`, color }}
            data-testid={`text-focus-timeline-total-${ev.id}`}
          >
            <span className="font-medium opacity-80">Totale offerta</span>
            <span className="font-bold tabular-nums">{focusFormatEur(ev.offerTotal)}</span>
          </div>
        )}

        {/* Metadata grid — cliente / contatto / offerta / ordine */}
        <div className="text-[11px] flex flex-col gap-0.5">
          {ev.customerName && (
            <div className="truncate" title={ev.customerName}>
              <span className="text-muted-foreground">Cliente: </span>
              <span className="font-medium">{ev.customerName}</span>
            </div>
          )}
          {ev.contactName && (
            <div className="truncate" title={ev.contactName}>
              <span className="text-muted-foreground">Contatto: </span>
              <span className="font-medium">{ev.contactName}</span>
            </div>
          )}
          {ev.offerReference && (
            <div className="truncate">
              <span className="text-muted-foreground">Offerta: </span>
              <span className="font-medium">{ev.offerReference}</span>
              {ev.offerStatus && (
                <span className="ml-1 text-muted-foreground">({ev.offerStatus})</span>
              )}
            </div>
          )}
          {ev.jobOrderReference && (
            <div className="truncate">
              <span className="text-muted-foreground">Ordine: </span>
              <span className="font-medium">{ev.jobOrderReference}</span>
              {ev.orderStatus && (
                <span className="ml-1 text-muted-foreground">({ev.orderStatus})</span>
              )}
            </div>
          )}
        </div>

        {/* Footer pinned to the bottom (mt-auto) so the action button is
            always at the same vertical position regardless of how much
            content the card carries above. */}
        <div className="mt-auto flex items-center gap-2 pt-1">
          {linksCount > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full text-[10px] px-1.5 py-0.5 font-medium"
              style={{ background: `${color}1f`, color }}
            >
              <Link2 className="w-3 h-3" />
              {linksCount} {linksCount === 1 ? "collegato" : "collegati"}
            </span>
          )}
          <button
            type="button"
            onClick={() => onOpen(ev)}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            data-testid={`button-focus-timeline-open-${ev.id}`}
          >
            Apri scheda <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function FocusTimelineSection({
  items,
  color,
  now,
  onOpen,
  maxH,
}: {
  items: FocusTimelineItem[];
  color: string;
  now: Date;
  onOpen: (e: RecapEvent) => void;
  maxH: number;
}) {
  // Layout a capo automatico: le card vanno a sinistra→destra e quando finisce
  // lo spazio passano alla riga sotto. Per evitare di lasciare un chevron
  // "appeso" alla fine di una riga (o sull'ultima card in assoluto),
  // misuriamo dopo il layout quali card sono l'ultima della propria riga
  // confrontando l'`offsetTop` con quello della card successiva, e per quelle
  // nascondiamo il connettore di destra.
  const gridRef = useRef<HTMLDivElement>(null);
  const [lastOnRowIds, setLastOnRowIds] = useState<Set<string>>(() => new Set());
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const compute = () => {
      const kids = Array.from(
        el.querySelectorAll<HTMLElement>("[data-focus-item-id]"),
      );
      const next = new Set<string>();
      for (let i = 0; i < kids.length; i++) {
        const id = kids[i].dataset.focusItemId;
        if (!id) continue;
        const nxt = kids[i + 1];
        // Last in DOM, or next card has a higher offsetTop ⇒ row break ⇒
        // chevron pointing right would dangle into empty space, so hide it.
        if (!nxt || nxt.offsetTop > kids[i].offsetTop) next.add(id);
      }
      setLastOnRowIds(prev => {
        if (prev.size === next.size) {
          let same = true;
          next.forEach(v => { if (!prev.has(v)) same = false; });
          if (same) return prev;
        }
        return next;
      });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items]);

  return (
    <div
      className="w-full overflow-y-auto overflow-x-hidden bg-gradient-to-b from-emerald-50/40 to-transparent dark:from-emerald-950/15"
      style={{ maxHeight: maxH }}
      data-testid="focus-timeline-section"
    >
      <div className="px-6 py-5">
        <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-3">
          <ArrowRight className="w-3.5 h-3.5" />
          Ordine temporale — dal più vecchio al più recente
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100/70 dark:bg-emerald-900/40 px-2 py-0.5 normal-case tracking-normal font-semibold text-emerald-800 dark:text-emerald-200">
            {items.length} {items.length === 1 ? "evento" : "eventi"}
          </span>
        </div>
        <div
          ref={gridRef}
          className="flex flex-wrap items-stretch"
          style={{ gap: CARD_GAP, paddingTop: 0, paddingBottom: 4 }}
          data-testid="focus-timeline-scroller"
        >
          {items.map((it, idx) => {
            // `lastOnRowIds` contains every card that is the last on its
            // visual row — including the very last card overall. We split
            // the two cases here so that:
            //  - "last on row, not last overall" ⇒ show the wrap arrow
            //    that hangs into the row gap and points down-left to
            //    signal the sequence continues on the next row.
            //  - "last overall" ⇒ no connector at all (sequence ends).
            //  - "not last on row" ⇒ keep the inter-card chevron `›`.
            const isLastOnRow = lastOnRowIds.has(it.ev.id);
            const isLastOverall = idx === items.length - 1;
            return (
              <FocusTimelineCard
                key={it.ev.id}
                item={it}
                color={color}
                now={now}
                onOpen={onOpen}
                showChevronAfter={!isLastOnRow}
                showWrapToNextRow={isLastOnRow && !isLastOverall}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function WeekAgenda({ anchor, allEvents, onSelect, isLoading, viewportMaxH }: Props & { viewportMaxH?: number }) {
  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor]);

  // Which kinds of cross-event links should feed into the recap "networks"
  // (curves, group colors, focus burst, header counter). Defaults to only
  // strong links (offer/order); contact/customer are off until the user
  // explicitly turns them on. Persisted in localStorage.
  const [linkKinds, setLinkKinds] = useState<LinkKindFlags>(() => readLinkKindsFromStorage());
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(LINK_KIND_LS_KEY, JSON.stringify(linkKinds)); } catch {}
  }, [linkKinds]);

  // Visual-only switch for the SVG connection curves between linked
  // events. Defaults to OFF so dense weeks are readable; the per-icon
  // colored dot at bottom-right keeps signaling the presence of links
  // even when curves are hidden.
  const [showLinkCurves, setShowLinkCurves] = useState<boolean>(() => readShowLinkCurvesFromStorage());
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(SHOW_LINK_CURVES_LS_KEY, JSON.stringify(showLinkCurves)); } catch {}
  }, [showLinkCurves]);

  // Derived view of allEvents whose `links` array is filtered to the
  // currently enabled kinds. Used for every link-driven computation
  // downstream so that toggling a kind off makes the corresponding
  // network/curve/satellite disappear consistently across the view.
  const filteredEvents = useMemo(() => {
    const enabled = new Set<RecapLinkKind>();
    if (linkKinds.offer) enabled.add("same-offer");
    if (linkKinds.order) enabled.add("same-order");
    if (linkKinds.contact) enabled.add("same-contact");
    if (linkKinds.customer) enabled.add("same-customer");
    if (linkKinds.email) enabled.add("same-email-thread");
    // Fast path: when all kinds are enabled, hand back the original array
    // so that downstream memos don't invalidate unnecessarily.
    if (enabled.size === 5) return allEvents;
    return allEvents.map(e => {
      const original = e.links ?? [];
      if (original.length === 0) return e;
      const ls = original.filter(l => enabled.has(l.kind));
      return ls.length === original.length ? e : { ...e, links: ls };
    });
  }, [allEvents, linkKinds]);

  // Per-event "focus burst" mode: the user activates this from a single
  // event's popover. When active, all events linked to the focused one are
  // pulled visually next to it on a small ring around its real position.
  // The timeline does NOT move and other events stay where they are.
  const [focusGroupId, setFocusGroupId] = useState<string | null>(null);
  // Optional per-type filter applied to the burst — null = "tutti i tipi".
  // Lets the user skim a noisy network down to (for example) only offers.
  const [focusTypeFilter, setFocusTypeFilter] = useState<Set<RecapEventType> | null>(null);
  useEffect(() => {
    setFocusTypeFilter(null);
    setHoverId(null);
    setExpandedId(null);
  }, [focusGroupId]);

  // Visible day-range relative to weekStart (inclusive). Initially [0..6] —
  // the canonical Mon..Sun for the anchor's week. Scroll near the edges
  // expands the range; week navigation re-resets it.
  const [range, setRange] = useState<{ startOffset: number; endOffset: number }>({ startOffset: 0, endOffset: 6 });
  // Epoch-guard: any pending scroll-extension/rAF queued before a week change
  // must be ignored, so the reset wins cleanly and we don't see stale
  // extensions or scroll jumps after navigating with the arrows.
  const rangeEpochRef = useRef(0);
  const pendingRafRef = useRef<number | null>(null);
  useEffect(() => {
    rangeEpochRef.current += 1;
    if (pendingRafRef.current != null) {
      cancelAnimationFrame(pendingRafRef.current);
      pendingRafRef.current = null;
    }
    setRange({ startOffset: 0, endOffset: 6 });
    // Reset scroll to top so the user sees the new week's Monday.
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [+weekStart]);

  const days = useMemo(
    () => Array.from(
      { length: range.endOffset - range.startOffset + 1 },
      (_, i) => addDays(weekStart, range.startOffset + i),
    ),
    [weekStart, range.startOffset, range.endOffset],
  );

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Tiny delay before clearing the hover so the user can move the cursor
  // from the icon onto the floating popover without it flickering away.
  const hoverHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHoverHide = () => {
    if (hoverHideTimer.current) {
      clearTimeout(hoverHideTimer.current);
      hoverHideTimer.current = null;
    }
  };
  const scheduleHoverHide = (id: string) => {
    cancelHoverHide();
    hoverHideTimer.current = setTimeout(() => {
      setHoverId(h => (h === id ? null : h));
    }, 160);
  };
  useEffect(() => () => cancelHoverHide(), []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Esc closes any expanded popover; if no popover is open but a focus
  // burst is active, Esc exits focus mode instead.
  useEffect(() => {
    if (!expandedId && !focusGroupId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (expandedId) setExpandedId(null);
      else if (focusGroupId) setFocusGroupId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedId, focusGroupId]);

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

  // Grid geometry
  const innerW = Math.max(640, containerW || 640);
  const gridW = Math.max(360, innerW - AXIS_W);
  const gridH = ROW_H * days.length;
  const xForHour = (h: number) => AXIS_W + (h / 24) * gridW;
  const yForRow = (idx: number) => HOUR_AXIS_H + idx * ROW_H;

  // Filter events to the visible day range + place them
  const weekEvents = useMemo(() => {
    const startMs = +addDays(weekStart, range.startOffset);
    const endMs = +addDays(weekStart, range.endOffset + 1);
    return filteredEvents.filter(e => {
      const t = +parseISO(e.date);
      return t >= startMs && t < endMs;
    });
  }, [filteredEvents, weekStart, range.startOffset, range.endOffset]);

  // Lane assignment per day-row. dayIdx is local to the visible range
  // (0 == first visible day), so it indexes directly into the days array.
  const { placed, clusters } = useMemo(() => {
    type Pre = { ev: RecapEvent; date: Date; dayIdx: number; hourFrac: number };
    const dayCount = days.length;
    const pre: Pre[] = weekEvents
      .map(e => {
        const d = parseISO(e.date);
        // Calendar-day diff (DST-safe) instead of fixed 86_400_000 ms math.
        const dayIdx = differenceInCalendarDays(d, weekStart) - range.startOffset;
        const hourFrac = d.getHours() + d.getMinutes() / 60;
        return { ev: e, date: d, dayIdx, hourFrac };
      })
      .filter(p => p.dayIdx >= 0 && p.dayIdx < dayCount)
      .sort((a, b) => a.dayIdx - b.dayIdx || a.hourFrac - b.hourFrac);

    const placed: PlacedItem[] = [];
    const overflow: PlacedItem[] = [];
    const minGapHours = ((ICON_W + MIN_GAP_PX) / gridW) * 24;
    const laneLastHour: number[][] = Array.from({ length: dayCount }, () => Array(MAX_LANES).fill(-Infinity));

    for (const p of pre) {
      let lane = -1;
      for (let l = 0; l < MAX_LANES; l++) {
        if (p.hourFrac - laneLastHour[p.dayIdx][l] >= minGapHours) { lane = l; break; }
      }
      if (lane < 0) {
        overflow.push({ ...p, lane: MAX_LANES - 1, overflow: true });
      } else {
        laneLastHour[p.dayIdx][lane] = p.hourFrac;
        placed.push({ ...p, lane, overflow: false });
      }
    }

    // Cluster overflows by (day, nearby hour)
    const clusters: Cluster[] = [];
    const overflowGap = ((ICON_W * 1.4) / gridW) * 24;
    for (const o of overflow) {
      const last = clusters[clusters.length - 1];
      if (last && last.dayIdx === o.dayIdx && o.hourFrac - last.hourFrac < overflowGap) {
        last.events.push(o);
      } else {
        clusters.push({ id: `wcl-${o.dayIdx}-${clusters.length}`, dayIdx: o.dayIdx, hourFrac: o.hourFrac, events: [o] });
      }
    }
    return { placed, clusters };
  }, [weekEvents, weekStart, range.startOffset, gridW, days.length]);

  // Group / network metadata — computed across the entire (filtered) event
  // window so that the focus-burst feature can pull in linked events that
  // live outside the current viewport (the whole point: when collegamenti
  // are weeks/months apart they're not on the visible rows). Filtering
  // by link kind is applied upstream in `filteredEvents`.
  const groupOf = useMemo(() => computeGroups(filteredEvents), [filteredEvents]);
  const colorOf = (id: string): string | null => {
    const gi = groupOf.get(id);
    return gi == null ? null : GROUP_PALETTE[gi % GROUP_PALETTE.length];
  };
  const eventById = useMemo(() => {
    const m = new Map<string, RecapEvent>();
    for (const e of filteredEvents) m.set(e.id, e);
    return m;
  }, [filteredEvents]);

  // When the visible week shifts so that the focused event no longer exists
  // in our dataset, drop focus to avoid orphaned curves and ghost icons.
  // Also drop focus when the user toggles off every link kind that
  // connected the focused event — once `groupOf` no longer assigns it any
  // group, the burst banner would otherwise hang around with zero
  // satellites visible. Defined here (after `groupOf`) to avoid a TDZ
  // reference in its dependency array.
  useEffect(() => {
    if (!focusGroupId) return;
    if (!filteredEvents.some(e => e.id === focusGroupId)) setFocusGroupId(null);
    else if (groupOf.get(focusGroupId) == null) setFocusGroupId(null);
  }, [focusGroupId, filteredEvents, groupOf]);

  // Real anchor centres (icons + cluster cards) — derived from the actual
  // placement on the timeline. These are the "true" positions; focus mode
  // adds an override layer on top of them.
  const realAnchorById = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const p of placed) {
      const cx = xForHour(p.hourFrac);
      const cy = yForRow(p.dayIdx) + 12 + p.lane * LANE_H + ICON_W / 2;
      m.set(p.ev.id, { x: cx, y: cy });
    }
    for (const cl of clusters) {
      const cx = xForHour(cl.hourFrac);
      const cy = yForRow(cl.dayIdx) + 12 + (MAX_LANES - 1) * LANE_H + ICON_W / 2;
      for (const p of cl.events) m.set(p.ev.id, { x: cx, y: cy });
    }
    return m;
  }, [placed, clusters, gridW]);

  // Set of event ids linked to the focused event (the whole connected
  // component, except the focused one itself). Pulled from groupOf which is
  // computed on allEvents, so satellites outside the visible viewport are
  // included too — they'll be rendered as ghost icons inside the burst.
  const focusedSatelliteIds = useMemo(() => {
    if (!focusGroupId) return null;
    const myGi = groupOf.get(focusGroupId);
    if (myGi == null) return null;
    const ids = new Set<string>();
    groupOf.forEach((gi, id) => {
      if (gi === myGi && id !== focusGroupId) ids.add(id);
    });
    return ids;
  }, [focusGroupId, groupOf]);

  // Type counts among the focused satellites — used to render filter chips
  // in the banner. Sorted by descending count so the most common types
  // surface first.
  const focusTypeCounts = useMemo(() => {
    if (!focusedSatelliteIds) return null;
    const counts = new Map<RecapEventType, number>();
    focusedSatelliteIds.forEach(id => {
      const ev = eventById.get(id);
      if (!ev) return;
      counts.set(ev.type, (counts.get(ev.type) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [focusedSatelliteIds, eventById]);

  // Apply the optional type filter — when null, every satellite passes.
  const effectiveSatelliteIds = useMemo(() => {
    if (!focusedSatelliteIds) return null;
    if (!focusTypeFilter || focusTypeFilter.size === 0) return focusedSatelliteIds;
    const filtered = new Set<string>();
    focusedSatelliteIds.forEach(id => {
      const ev = eventById.get(id);
      if (ev && focusTypeFilter.has(ev.type)) filtered.add(id);
    });
    return filtered;
  }, [focusedSatelliteIds, focusTypeFilter, eventById]);

  // Chronologically ordered list (anchor + filtered satellites) used by the
  // dedicated "timeline" view that replaces the week grid while focus mode
  // is active. Sorted ascending so the oldest event sits on the far left
  // and the newest on the far right, regardless of which one is the anchor.
  const focusTimelineItems = useMemo(() => {
    if (!focusGroupId || !effectiveSatelliteIds) return null;
    type Item = { ev: RecapEvent; date: Date; isAnchor: boolean };
    const items: Item[] = [];
    const anchorEv = eventById.get(focusGroupId);
    if (anchorEv) items.push({ ev: anchorEv, date: parseISO(anchorEv.date), isAnchor: true });
    effectiveSatelliteIds.forEach(id => {
      const ev = eventById.get(id);
      if (ev) items.push({ ev, date: parseISO(ev.date), isAnchor: false });
    });
    items.sort((a, b) => +a.date - +b.date);
    return items;
  }, [focusGroupId, effectiveSatelliteIds, eventById]);

  // Burst positions for the satellites of the focused event. The layout
  // is a 3-row temporal "braid" centred on the anchor: events older than
  // the anchor flow leftward (oldest furthest left), events newer flow
  // rightward (newest furthest right). Each side fills three rows
  // (top / middle / bottom) round-robin so density is balanced and the
  // chronology is readable left→right exactly as in the user's sketch.
  // Positions are clamped to the visible viewport so satellites never
  // disappear behind the gutter or below the canvas.
  const focusBurst = useMemo(() => {
    if (!focusGroupId || !effectiveSatelliteIds) return null;
    const anchor = realAnchorById.get(focusGroupId);
    if (!anchor) return null;
    const anchorEv = eventById.get(focusGroupId);
    if (!anchorEv) return null;
    const anchorTime = +parseISO(anchorEv.date);
    type Sat = { id: string; time: number };
    const sats: Sat[] = [];
    effectiveSatelliteIds.forEach(id => {
      const ev = eventById.get(id);
      if (!ev) return;
      sats.push({ id, time: +parseISO(ev.date) });
    });
    if (sats.length === 0) return null;
    sats.sort((a, b) => a.time - b.time);
    // Older = strictly before the anchor; newer = at-or-after (events
    // sharing the anchor's exact timestamp flow to the right so they
    // don't visually compete with the anchor itself).
    const olderAsc = sats.filter(s => s.time < anchorTime);
    const newer = sats.filter(s => s.time >= anchorTime); // already asc
    // For the left side we want the OLDEST farthest from the anchor, so
    // we walk the older list from most-recent inward and place columns
    // outward — keeps the closest-to-anchor column temporally closest.
    const olderInward = [...olderAsc].reverse();

    // Row count grows with the busier side so a 4-link burst stays on a
    // single line while a 50-link burst spreads across more lanes; column
    // and row spacing breathe wider for small networks and tighten for
    // dense ones, keeping the whole braid inside the viewport without
    // ever piling icons on top of each other.
    const sideMax = Math.max(olderInward.length, newer.length);
    const ROWS =
      sideMax <= 3 ? 1
      : sideMax <= 8 ? 2
      : sideMax <= 18 ? 3
      : sideMax <= 32 ? 4
      : sideMax <= 50 ? 5
      : 6;
    const COL_SPACING = ICON_W + (
      ROWS === 1 ? 34
      : ROWS === 2 ? 30
      : ROWS === 3 ? 26
      : ROWS === 4 ? 22
      : 18
    );
    const ROW_SPACING = ICON_W + (
      ROWS === 1 ? 0
      : ROWS === 2 ? 24
      : ROWS === 3 ? 18
      : ROWS === 4 ? 14
      : 12
    );
    const visibleTop = containerRef.current?.scrollTop ?? 0;
    const visibleH = containerRef.current?.clientHeight ?? VIEWPORT_MAX_H;
    const minX = AXIS_W + ICON_W;
    const maxX = innerW - ICON_W;
    const minY = HOUR_AXIS_H + ICON_W + visibleTop;
    const maxY = HOUR_AXIS_H + visibleH + visibleTop - ICON_W;
    const positions = new Map<string, { x: number; y: number }>();
    const placeSide = (list: Sat[], dir: -1 | 1) => {
      list.forEach((s, i) => {
        const row = i % ROWS;          // 0 top, 1 middle, 2 bottom
        const col = Math.floor(i / ROWS) + 1; // first column is 1 step from anchor
        let x = anchor.x + dir * col * COL_SPACING;
        let y = anchor.y + (row - 1) * ROW_SPACING;
        x = Math.max(minX, Math.min(maxX, x));
        y = Math.max(minY, Math.min(maxY, y));
        positions.set(s.id, { x, y });
      });
    };
    placeSide(olderInward, -1);
    placeSide(newer, +1);
    return positions;
  }, [focusGroupId, effectiveSatelliteIds, realAnchorById, eventById, innerW]);

  // Effective anchor map = real positions + focus-mode overrides for the
  // satellites of the focused event. Used by curves and overlay rendering.
  const anchorById = useMemo(() => {
    if (!focusBurst) return realAnchorById;
    const m = new Map(realAnchorById);
    focusBurst.forEach((pos, id) => m.set(id, pos));
    return m;
  }, [realAnchorById, focusBurst]);

  type Curve = { d: string; color: string; from: string; to: string; strong: boolean };
  const curves: Curve[] = useMemo(() => {
    // Per-pair we keep the strongest link kind so that an offer/order edge
    // wins over a customer/contact edge between the same two events (#85).
    const seen = new Map<string, Curve>();
    const buildCurve = (a: string, b: string, color: string, strong: boolean) => {
      const key = a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`;
      const prev = seen.get(key);
      if (prev && prev.strong) return;
      const ap = anchorById.get(a);
      const bp = anchorById.get(b);
      if (!ap || !bp) return;
      if (ap.x === bp.x && ap.y === bp.y) return;
      const my = (ap.y + bp.y) / 2;
      seen.set(key, {
        d: `M ${ap.x} ${ap.y} C ${ap.x} ${my}, ${bp.x} ${my}, ${bp.x} ${bp.y}`,
        color, from: a, to: b, strong,
      });
    };
    // Cap the curves emitted per source event so a noisy email thread (or
    // any other very dense network) can't generate hundreds of overlapping
    // béziers and freeze the SVG layer (#115). The link badge counter and
    // focus-burst connections still see the full `links` array — only the
    // visualised curve set is bounded.
    const PER_EVENT_CURVE_BUDGET = 8;
    for (const p of placed) {
      const color = colorOf(p.ev.id);
      if (!color) continue;
      const links = p.ev.links ?? [];
      // Render strong links first so that, when the budget bites, the
      // edges most likely to surface a meaningful chain (offer/order/
      // email-thread) win out over weak same-customer/contact ones.
      const ordered = links.length > PER_EVENT_CURVE_BUDGET
        ? [...links].sort((x, y) => Number(y.strong) - Number(x.strong))
        : links;
      const limit = Math.min(ordered.length, PER_EVENT_CURVE_BUDGET);
      for (let i = 0; i < limit; i++) {
        const l = ordered[i];
        buildCurve(p.ev.id, l.targetId, color, l.strong);
      }
    }
    // Focus burst: guarantee every (filtered) satellite is connected to the
    // anchor with a visible (strong) curve, even if (a) the link was only
    // recorded on the satellite's side, or (b) the satellite is not in
    // `placed` because its real date sits outside the visible day range.
    if (focusGroupId && effectiveSatelliteIds) {
      const color = colorOf(focusGroupId) ?? GROUP_PALETTE[0];
      effectiveSatelliteIds.forEach(sid => buildCurve(focusGroupId, sid, color, true));
    }
    return Array.from(seen.values());
  }, [placed, anchorById, groupOf, focusGroupId, effectiveSatelliteIds]);

  // Hovered network — highlight just the linked events
  const highlightedIds = useMemo(() => {
    if (!hoverId) return null;
    const set = new Set<string>([hoverId]);
    const ev = weekEvents.find(e => e.id === hoverId);
    if (ev?.links) for (const l of ev.links) set.add(l.targetId);
    return set;
  }, [hoverId, weekEvents]);

  // When focus mode is on, only the focused event + its (filtered)
  // satellites should visually pop; everything else gets dimmed. This
  // overrides the hover-driven highlight (focus is the stronger signal).
  const focusVisibleIds = useMemo(() => {
    if (!focusGroupId || !effectiveSatelliteIds) return null;
    const s = new Set<string>([focusGroupId]);
    effectiveSatelliteIds.forEach(id => s.add(id));
    return s;
  }, [focusGroupId, effectiveSatelliteIds]);
  const activeHighlight = focusVisibleIds ?? highlightedIds;

  // Hot events count for the header chip — only counts visible events.
  const hotEvents = useMemo(() => weekEvents.filter(e => isHot(e, now)), [weekEvents, now]);
  const visibleGroupCount = useMemo(() => {
    const s = new Set<number>();
    for (const e of weekEvents) {
      const gi = groupOf.get(e.id);
      if (gi != null) s.add(gi);
    }
    return s.size;
  }, [weekEvents, groupOf]);

  // Now indicator on today's row
  const todayIdx = useMemo(() => {
    const idx = days.findIndex(d => dfnsIsToday(d));
    return idx >= 0 ? idx : -1;
  }, [days]);
  const nowX = todayIdx >= 0
    ? xForHour(now.getHours() + now.getMinutes() / 60)
    : null;

  // Even hour ticks (0,2,...,22) + half ticks at odd hours
  const evenHours = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
  const oddHours = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];

  return (
    <div className="relative" data-testid="recap-week-agenda">
      {/* Header strip */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span data-testid="text-week-stats">
              <span className="font-medium text-foreground">{weekEvents.length}</span> eventi
              {visibleGroupCount > 0 && (
                <> · <span className="text-foreground font-medium">{visibleGroupCount}</span> {visibleGroupCount === 1 ? "rete" : "reti"} di collegamenti</>
              )}
            </span>
          </span>
          {hotEvents.length > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200/70 dark:border-red-800/40"
              data-testid="badge-hot-events-count"
              title="Eventi urgenti, scaduti o non ancora gestiti"
            >
              <AlertTriangle className="w-3 h-3" />
              {hotEvents.length} da gestire
            </span>
          )}
          <WeekAgendaLegend />
          <span
            className="flex items-center gap-1 flex-wrap"
            data-testid="group-link-kind-toggles"
          >
            <span className="text-[10px] uppercase tracking-wider opacity-70 mr-0.5">
              Collega per:
            </span>
            <LinkKindToggle
              label="Offerta"
              enabled={linkKinds.offer}
              onToggle={() => setLinkKinds(k => ({ ...k, offer: !k.offer }))}
              testId="button-toggle-link-offer"
              title="Mostra collegamenti tra eventi della stessa offerta"
            />
            <LinkKindToggle
              label="Ordine"
              enabled={linkKinds.order}
              onToggle={() => setLinkKinds(k => ({ ...k, order: !k.order }))}
              testId="button-toggle-link-order"
              title="Mostra collegamenti tra eventi dello stesso ordine"
            />
            <LinkKindToggle
              label="Contatto"
              enabled={linkKinds.contact}
              onToggle={() => setLinkKinds(k => ({ ...k, contact: !k.contact }))}
              testId="button-toggle-link-contact"
              title="Mostra collegamenti tra eventi dello stesso contatto"
            />
            <LinkKindToggle
              label="Cliente"
              enabled={linkKinds.customer}
              onToggle={() => setLinkKinds(k => ({ ...k, customer: !k.customer }))}
              testId="button-toggle-link-customer"
              title="Mostra collegamenti tra eventi dello stesso cliente"
            />
            <LinkKindToggle
              label="Email"
              enabled={linkKinds.email}
              onToggle={() => setLinkKinds(k => ({ ...k, email: !k.email }))}
              testId="button-toggle-link-email"
              title="Mostra collegamenti tra inviata e risposte dello stesso thread email"
            />
            <span className="mx-1 h-3 w-px bg-border/70" aria-hidden />
            <LinkKindToggle
              label={showLinkCurves ? "Curve: ON" : "Curve: OFF"}
              enabled={showLinkCurves}
              onToggle={() => setShowLinkCurves(v => !v)}
              testId="button-toggle-link-curves"
              title={
                showLinkCurves
                  ? "Nascondi le curve di collegamento (gli eventi con link continueranno a mostrare il pallino colorato)"
                  : "Mostra le curve di collegamento tra gli eventi correlati"
              }
            />
          </span>
        </div>
        {isLoading && <span className="text-[11px] text-muted-foreground">Caricamento…</span>}
      </div>
      {/* Focus-burst banner — appears when the user activates "Raggruppa
          collegamenti" from a single event's popover. Includes per-type
          filter chips so the user can skim a noisy network down (e.g.
          "show only the offers" out of 50 linked events) and a one-click
          way to leave the mode entirely. */}
      {focusGroupId && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-1.5 border-b bg-emerald-50/70 dark:bg-emerald-950/30"
          data-testid="banner-focus-burst-active"
        >
          <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            <Network className="w-3.5 h-3.5" />
            Raggruppa collegamenti attivo
          </div>
          {focusTypeCounts && focusTypeCounts.length > 1 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 mr-0.5">Filtra:</span>
              <button
                type="button"
                onClick={() => setFocusTypeFilter(null)}
                className={[
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors",
                  !focusTypeFilter
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-background/80 text-emerald-800 dark:text-emerald-200 border-emerald-300/70 dark:border-emerald-700/50 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40",
                ].join(" ")}
                data-testid="button-focus-filter-all"
              >
                Tutti ({focusedSatelliteIds?.size ?? 0})
              </button>
              {focusTypeCounts.map(([t, n]) => {
                const active = focusTypeFilter?.has(t) ?? false;
                const tStyle = TYPE_STYLE[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setFocusTypeFilter(prev => {
                        const next = new Set(prev ?? []);
                        if (next.has(t)) next.delete(t);
                        else next.add(t);
                        return next.size === 0 ? null : next;
                      });
                    }}
                    className={[
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors",
                      active
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-background/80 text-foreground/80 border-border/70 hover:bg-accent",
                    ].join(" ")}
                    title={`${tStyle.label}: ${n}`}
                    data-testid={`button-focus-filter-${t}`}
                  >
                    <span className={active ? "" : tStyle.ic.replace(/^text-/, "text-")}>•</span>
                    {tStyle.label}({n})
                                                          </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => setFocusGroupId(null)}
            className="ml-auto text-[10.5px] font-semibold text-emerald-800 dark:text-emerald-200 hover:underline"
            data-testid="button-disable-focus-burst"
          >
            Disattiva
          </button>
        </div>
      )}
      {/* Focus-mode timeline view — replaces the week grid while
          "Raggruppa collegamenti" is active. We render this *instead of*
          the grid (the grid stays mounted but hidden via CSS so vertical
          scroll position and day range are preserved when the user exits). */}
      {focusGroupId && focusTimelineItems && (
        <FocusTimelineSection
          items={focusTimelineItems}
          color={colorOf(focusGroupId) ?? GROUP_PALETTE[0]}
          now={now}
          onOpen={onSelect}
          maxH={viewportMaxH ?? VIEWPORT_MAX_H}
        />
      )}
      {/* Grid wrapper — on narrow viewports we let the grid scroll horizontally
          so each event keeps a readable position; otherwise it fits exactly.
          Vertically the wrapper is a continuous scroll surface: scrolling near
          the top/bottom edge extends the visible day range (clamped between
          MIN_OFFSET and MAX_OFFSET). Week-navigation arrows reset the range. */}
      <div
        ref={containerRef}
        className={[
          "w-full overflow-y-auto",
          containerW > 0 && containerW < 640 ? "overflow-x-auto" : "overflow-x-hidden",
        ].join(" ")}
        style={{ maxHeight: viewportMaxH ?? VIEWPORT_MAX_H, display: focusGroupId ? "none" : undefined }}
        onScroll={(e) => {
          const el = e.currentTarget;
          const top = el.scrollTop;
          const max = el.scrollHeight - el.clientHeight;
          // Snapshot the epoch at the time the scroll event fires; if the
          // user navigates to another week before the rAF runs, we discard
          // the stale extension so the reset wins cleanly.
          const epoch = rangeEpochRef.current;
          if (top < SCROLL_EDGE_PX) {
            setRange(r => {
              if (rangeEpochRef.current !== epoch) return r;
              if (r.startOffset <= MIN_OFFSET) return r;
              const newStart = Math.max(MIN_OFFSET, r.startOffset - EXTEND_DAYS);
              const added = r.startOffset - newStart;
              if (added <= 0) return r;
              if (pendingRafRef.current != null) cancelAnimationFrame(pendingRafRef.current);
              pendingRafRef.current = requestAnimationFrame(() => {
                pendingRafRef.current = null;
                if (rangeEpochRef.current !== epoch) return;
                if (containerRef.current) {
                  containerRef.current.scrollTop = top + added * ROW_H;
                }
              });
              return { ...r, startOffset: newStart };
            });
          } else if (max - top < SCROLL_EDGE_PX) {
            setRange(r => {
              if (rangeEpochRef.current !== epoch) return r;
              if (r.endOffset >= MAX_OFFSET) return r;
              const newEnd = Math.min(MAX_OFFSET, r.endOffset + EXTEND_DAYS);
              if (newEnd <= r.endOffset) return r;
              return { ...r, endOffset: newEnd };
            });
          }
        }}
      >
        <div
          className="relative"
          style={{
            width: innerW,
            height: HOUR_AXIS_H + gridH + 16,
            background:
              "radial-gradient(900px 520px at 18% 8%, rgba(139,92,246,0.06), transparent 60%), radial-gradient(700px 480px at 90% 100%, rgba(16,185,129,0.05), transparent 60%)",
          }}
          onClick={() => setExpandedId(null)}
        >
          {/* SVG layer: grid lines, now line, connections */}
          <svg className="absolute inset-0 pointer-events-none" width={innerW} height={HOUR_AXIS_H + gridH + 16}>
            <defs>
              {GROUP_PALETTE.map((c, i) => (
                <linearGradient key={i} id={`wgrp-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={c} stopOpacity="0.85" />
                  <stop offset="100%" stopColor={c} stopOpacity="0.45" />
                </linearGradient>
              ))}
            </defs>

            {/* Day-row separators */}
            {days.map((_, i) => (
              <line
                key={`row-${i}`}
                x1={AXIS_W} y1={yForRow(i) + 0.5}
                x2={innerW} y2={yForRow(i) + 0.5}
                stroke="currentColor" className="text-border" strokeWidth="1" opacity="0.4"
              />
            ))}
            <line
              x1={AXIS_W} y1={yForRow(days.length) + 0.5}
              x2={innerW} y2={yForRow(days.length) + 0.5}
              stroke="currentColor" className="text-border" strokeWidth="1" opacity="0.4"
            />

            {/* Hour columns: solid for even hours, dashed faint for odd hours */}
            {evenHours.map(h => (
              <line
                key={`h-${h}`}
                x1={xForHour(h) + 0.5} y1={HOUR_AXIS_H}
                x2={xForHour(h) + 0.5} y2={HOUR_AXIS_H + gridH}
                stroke="currentColor" className="text-border" strokeWidth="1" opacity="0.32"
              />
            ))}
            {oddHours.map(h => (
              <line
                key={`oh-${h}`}
                x1={xForHour(h) + 0.5} y1={HOUR_AXIS_H}
                x2={xForHour(h) + 0.5} y2={HOUR_AXIS_H + gridH}
                stroke="currentColor" className="text-border" strokeWidth="1" strokeDasharray="2 6" opacity="0.18"
              />
            ))}
            {/* Vertical axis line */}
            <line x1={AXIS_W - 0.5} y1={HOUR_AXIS_H} x2={AXIS_W - 0.5} y2={HOUR_AXIS_H + gridH} stroke="currentColor" className="text-border" strokeWidth="1" />

            {/* Today row tint */}
            {todayIdx >= 0 && (
              <rect
                x={AXIS_W} y={yForRow(todayIdx)}
                width={innerW - AXIS_W} height={ROW_H}
                fill="#f59e0b" opacity="0.05"
              />
            )}

            {/* Connection curves — weak (same-customer/same-contact) edges
                are rendered tenue + dashed so the eye prioritizes strong
                chains (offer/order). Highlighted dim still wins (#85).
                Hidden by default via the toolbar toggle so dense weeks
                stay readable; the per-icon colored dot keeps signaling
                the existence of links. Focus mode (focusGroupId) forces
                them on regardless because the satellite curves anchor
                the burst icons to the focused event — hiding them would
                break the focus interaction. */}
            {(showLinkCurves || !!focusGroupId) && curves.map((c, i) => {
              const dim = activeHighlight && !(activeHighlight.has(c.from) && activeHighlight.has(c.to));
              const weak = !c.strong;
              const palIdx = GROUP_PALETTE.indexOf(c.color);
              const haloW = dim ? 4 : (weak ? 4 : 7);
              const haloOp = dim ? 0.04 : (weak ? 0.06 : 0.14);
              const lineW = dim ? 1 : (weak ? 1.1 : 1.8);
              const lineOp = dim ? 0.35 : (weak ? 0.4 : 0.95);
              const dash = dim ? "3 4" : (weak ? "3 3" : undefined);
              return (
                <g key={i}>
                  <path d={c.d} stroke={c.color} strokeWidth={haloW} fill="none" opacity={haloOp} strokeLinecap="round" />
                  <path
                    d={c.d}
                    stroke={palIdx >= 0 ? `url(#wgrp-${palIdx})` : c.color}
                    strokeWidth={lineW}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={dash}
                    opacity={lineOp}
                  />
                </g>
              );
            })}

            {/* Now indicator */}
            {nowX != null && (
              <g>
                <line x1={nowX} y1={HOUR_AXIS_H} x2={nowX} y2={HOUR_AXIS_H + gridH} stroke="#ef4444" strokeWidth="1.2" opacity="0.55" />
                <line
                  x1={nowX} y1={yForRow(todayIdx)}
                  x2={nowX} y2={yForRow(todayIdx) + ROW_H}
                  stroke="#ef4444" strokeWidth="2" opacity="0.95"
                />
                <circle cx={nowX} cy={yForRow(todayIdx) + ROW_H / 2} r="4.5" fill="#ef4444">
                  <animate attributeName="opacity" values="1;0.35;1" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <circle cx={nowX} cy={yForRow(todayIdx) + ROW_H / 2} r="2.2" fill="#fff" />
              </g>
            )}
          </svg>

          {/* Top hour labels (only even hours) */}
          <div className="absolute top-0 left-0 right-0" style={{ height: HOUR_AXIS_H }}>
            {evenHours.map(h => (
              <div
                key={h}
                className="absolute -translate-x-1/2 flex flex-col items-center"
                style={{ left: xForHour(h), top: 4 }}
                data-testid={`week-hour-${h}`}
              >
                <span className="tabular-nums text-[10.5px] font-semibold text-muted-foreground">
                  {String(h).padStart(2, "0")}
                </span>
              </div>
            ))}
          </div>

          {/* Left day labels */}
          <div className="absolute top-0 left-0" style={{ width: AXIS_W, top: HOUR_AXIS_H }}>
            {days.map((d, i) => {
              const isToday = dfnsIsToday(d);
              return (
                <div
                  key={i}
                  className={[
                    "absolute flex flex-col items-end justify-center pr-2.5 text-right",
                    isToday ? "text-amber-700 dark:text-amber-300" : "text-foreground/85",
                  ].join(" ")}
                  style={{ top: i * ROW_H, height: ROW_H, width: AXIS_W }}
                  data-testid={`week-day-label-${format(d, "yyyy-MM-dd")}`}
                >
                  <span className={`text-[11.5px] uppercase tracking-wide ${isToday ? "font-bold" : "font-semibold"}`}>
                    {format(d, "EEE", { locale: it })}
                  </span>
                  <span className="tabular-nums text-[10.5px] text-muted-foreground mt-0.5">
                    {format(d, "d MMM", { locale: it })}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Empty state */}
          {weekEvents.length === 0 && !isLoading && (
            <div className="absolute" style={{ left: AXIS_W + 16, top: HOUR_AXIS_H + 16, right: 16, bottom: 16 }}>
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Nessun evento per questa settimana.
              </div>
            </div>
          )}

          {/* Event icons */}
          {placed.map(p => {
            const style = TYPE_STYLE[p.ev.type];
            const groupColor = colorOf(p.ev.id);
            const hot = isHot(p.ev, now);
            const isFaded = activeHighlight ? !activeHighlight.has(p.ev.id) : false;
            const isHovered = hoverId === p.ev.id;
            const isExpanded = expandedId === p.ev.id;
            // Focus mode: when this event is a satellite of the focused
            // event, the burst override pulls it onto the ring around the
            // anchor instead of leaving it on its real lane position.
            const burstPos = focusBurst?.get(p.ev.id);
            const cx = burstPos ? burstPos.x : xForHour(p.hourFrac);
            const cy = burstPos ? burstPos.y : yForRow(p.dayIdx) + 12 + p.lane * LANE_H + ICON_W / 2;
            return (
              <button
                key={p.ev.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedId(id => (id === p.ev.id ? null : p.ev.id));
                }}
                onMouseEnter={() => { cancelHoverHide(); setHoverId(p.ev.id); }}
                onMouseLeave={() => scheduleHoverHide(p.ev.id)}
                onFocus={() => { cancelHoverHide(); setHoverId(p.ev.id); }}
                onBlur={() => scheduleHoverHide(p.ev.id)}
                className={[
                  "absolute -translate-x-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-full border shadow-sm",
                  "transition-all duration-150 will-change-transform",
                  style.bg, style.ic,
                  hot ? "ring-2 ring-red-500/70 dark:ring-red-400/60" : `ring-1 ${style.ring}`,
                  isFaded && !isExpanded ? "opacity-30 saturate-50" : "opacity-100",
                  isExpanded ? "z-30 scale-125 shadow-lg" : isHovered ? "z-20 scale-110 shadow-md" : "z-10 hover:scale-110",
                ].join(" ")}
                style={{
                  left: cx,
                  top: cy,
                  width: ICON_W,
                  height: ICON_W,
                  borderColor: groupColor ? `${groupColor}77` : undefined,
                  boxShadow: isExpanded && groupColor
                    ? `0 8px 22px -8px ${groupColor}99`
                    : isHovered && groupColor
                    ? `0 6px 18px -8px ${groupColor}66`
                    : undefined,
                }}
                data-testid={`week-event-icon-${p.ev.id}`}
                aria-expanded={isExpanded}
                aria-label={p.ev.title}
              >
                {eventIcon(p.ev)}
                {hot && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background"
                    aria-hidden
                  />
                )}
                {p.ev.links?.some(l => l.strong) && !hot && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-background"
                    style={{ background: groupColor ?? "#64748b" }}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}

          {/* Focus burst: ghost icons for satellites of the focused event
              that are NOT currently in `placed` (because their real date
              sits outside the visible day range or they live inside an
              overflow cluster card). Rendered at the burst position so the
              user can see and reach the entire connected group at once.
              These react to hover/click exactly like real placed icons —
              the popover renderer below resolves them via `eventById`. */}
          {focusBurst && effectiveSatelliteIds && Array.from(effectiveSatelliteIds).map(sid => {
            // Skip ids already rendered above as regular placed icons.
            if (placed.some(p => p.ev.id === sid)) return null;
            const ev = eventById.get(sid);
            if (!ev) return null;
            const pos = focusBurst.get(sid);
            if (!pos) return null;
            const style = TYPE_STYLE[ev.type];
            const groupColor = colorOf(ev.id);
            const evDate = parseISO(ev.date);
            const isHovered = hoverId === ev.id;
            const isExpanded = expandedId === ev.id;
            return (
              <button
                key={`burst-${sid}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedId(id => (id === ev.id ? null : ev.id));
                }}
                onMouseEnter={() => { cancelHoverHide(); setHoverId(ev.id); }}
                onMouseLeave={() => scheduleHoverHide(ev.id)}
                onFocus={() => { cancelHoverHide(); setHoverId(ev.id); }}
                onBlur={() => scheduleHoverHide(ev.id)}
                className={[
                  "absolute -translate-x-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-full border shadow-md",
                  "transition-all duration-150 will-change-transform",
                  style.bg, style.ic, "ring-1", style.ring,
                  isExpanded ? "z-30 scale-125 shadow-lg" : isHovered ? "z-20 scale-110 shadow-md" : "z-10 hover:scale-110",
                ].join(" ")}
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: ICON_W,
                  height: ICON_W,
                  borderColor: groupColor ? `${groupColor}aa` : undefined,
                  boxShadow: isExpanded && groupColor
                    ? `0 8px 22px -8px ${groupColor}cc`
                    : groupColor
                    ? `0 6px 16px -6px ${groupColor}88`
                    : undefined,
                }}
                data-testid={`week-event-burst-icon-${ev.id}`}
                aria-expanded={isExpanded}
                aria-label={`${ev.title} (evento collegato fuori vista)`}
              >
                {eventIcon(ev)}
                {groupColor && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-background"
                    style={{ background: groupColor }}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}

          {/* Overflow clusters: shown as small numbered chips */}
          {clusters.map(cl => {
            const isExpanded = expandedId === cl.id;
            const cx = xForHour(cl.hourFrac);
            const cy = yForRow(cl.dayIdx) + 12 + (MAX_LANES - 1) * LANE_H + ICON_W / 2 + LANE_H * 0.7;
            const anyHot = cl.events.some(p => isHot(p.ev, now));
            return (
              <button
                key={cl.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedId(id => (id === cl.id ? null : cl.id));
                }}
                className={[
                  "absolute -translate-x-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-full border shadow-sm",
                  "bg-card text-foreground transition-all duration-150 will-change-transform",
                  anyHot ? "ring-2 ring-red-500/70" : "ring-1 ring-slate-300/70 dark:ring-slate-600/40",
                  isExpanded ? "z-30 scale-125 shadow-lg" : "z-10 hover:scale-110 hover:shadow-md",
                ].join(" ")}
                style={{ left: cx, top: cy, width: ICON_W, height: ICON_W }}
                title={`${cl.events.length} eventi vicini`}
                data-testid={`week-cluster-${cl.id}`}
                aria-expanded={isExpanded}
              >
                <span className="text-[10.5px] font-bold tabular-nums">+{cl.events.length}</span>
              </button>
            );
          })}

          {/* Event popover — shown when the icon is clicked (sticky) OR when
              the cursor hovers over it. Hover-keep handlers on the popover
              prevent it from disappearing while the cursor moves onto it.
              Works in focus mode too: ghost satellites (events outside the
              visible day range) are looked up in `eventById` and anchored
              to their burst position. */}
          {(() => {
            const targetId = expandedId ?? hoverId;
            if (!targetId) return null;
            const placedHit = placed.find(x => x.ev.id === targetId);
            // Resolve event + on-screen anchor for both placed and
            // focus-burst-only satellites.
            const ev = placedHit?.ev ?? eventById.get(targetId);
            if (!ev) return null;
            const burstPos = focusBurst?.get(ev.id);
            const evDate = placedHit?.date ?? parseISO(ev.date);
            const cx = burstPos
              ? burstPos.x
              : placedHit
                ? xForHour(placedHit.hourFrac)
                : null;
            const cy = burstPos
              ? burstPos.y
              : placedHit
                ? yForRow(placedHit.dayIdx) + 12 + placedHit.lane * LANE_H + ICON_W / 2
                : null;
            if (cx == null || cy == null) return null;
            const p = { ev, date: evDate };
            const style = TYPE_STYLE[ev.type];
            const groupColor = colorOf(ev.id);
            // Counter badge surfaces only strong (offer/order) chains —
            // weak customer/contact links remain visible as faint curves
            // but don't bump this number (#85).
            const linksCount = ev.links?.filter(l => l.strong).length ?? 0;
            const hot = isHot(ev, now);
            const popW = 280;
            // Clamp against the *visible* viewport width (containerW), not innerW —
            // on narrow viewports the grid is wider than the visible area.
            const visibleW = containerW > 0 ? containerW : innerW;
            const placeRight = cx + ICON_W + 16 + popW <= visibleW - 8;
            const rawLeft = placeRight ? cx + ICON_W : cx - ICON_W - popW;
            const left = Math.max(8, Math.min(visibleW - popW - 8, rawLeft));
            const top = Math.max(HOUR_AXIS_H + 4, Math.min(HOUR_AXIS_H + gridH - 200, cy - 90));
            return (
              <div
                className="absolute z-40 rounded-xl border bg-card shadow-2xl p-3 space-y-2"
                style={{ left, top, width: popW, borderColor: groupColor ? `${groupColor}66` : undefined }}
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => { cancelHoverHide(); setHoverId(p.ev.id); }}
                onMouseLeave={() => scheduleHoverHide(p.ev.id)}
                data-testid={`week-event-popover-${p.ev.id}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`inline-flex w-7 h-7 shrink-0 rounded-md items-center justify-center ${style.bg} ${style.ic} border`} style={{ borderColor: groupColor ? `${groupColor}55` : undefined }}>
                    {eventIcon(p.ev)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold leading-tight">{p.ev.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {format(p.date, "EEEE d MMMM 'alle' HH:mm", { locale: it })}
                    </div>
                  </div>
                  {hot && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-semibold px-1.5 py-0.5">
                      <AlertTriangle className="w-3 h-3" />
                      Da gestire
                    </span>
                  )}
                </div>
                {p.ev.changeSummary && p.ev.changeSummary.length > 0 ? (
                  <ul className="text-[12px] leading-relaxed text-foreground/85 list-disc pl-4 space-y-0.5">
                    {p.ev.changeSummary.slice(0, 3).map((c, i) => (
                      <li key={i} className="line-clamp-1">{c}</li>
                    ))}
                    {p.ev.changeSummary.length > 3 && (
                      <li className="text-muted-foreground italic list-none">
                        +{p.ev.changeSummary.length - 3} altre modifiche
                      </li>
                    )}
                  </ul>
                ) : p.ev.description && (
                  <p className="text-[12px] leading-relaxed line-clamp-3 text-foreground/85">{p.ev.description}</p>
                )}
                {/* Email body preview — only for inbound/sent email events
                    that have a Gmail provider message id we can resolve
                    from the href. Gated on `expandedId === p.ev.id` so
                    we hit the Gmail API only after an explicit click,
                    never on hover (which also opens this same popover).
                    Renders nothing (silently) for any other event type
                    or when the user has no Gmail connection configured. */}
                {expandedId === p.ev.id && (
                  <EmailPreviewSlot ev={p.ev} />
                )}
                <div className="text-[11px] grid grid-cols-1 gap-0.5">
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
                {(() => {
                  // Total satellites across the *entire* dataset — not just
                  // the visible viewport — since that's what the burst CTA
                  // actually pulls near the anchor.
                  const myGi = groupOf.get(p.ev.id);
                  let totalSatellites = 0;
                  if (myGi != null) {
                    groupOf.forEach((gi, id) => {
                      if (gi === myGi && id !== p.ev.id) totalSatellites += 1;
                    });
                  }
                  const isFocused = focusGroupId === p.ev.id;
                  return (
                    <>
                      <div className="flex items-center gap-2 pt-1">
                        {linksCount > 0 && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full text-[10px] px-1.5 py-0.5 font-medium"
                            style={{ background: `${groupColor ?? "#64748b"}1f`, color: groupColor ?? "#64748b" }}
                          >
                            <Link2 className="w-3 h-3" />
                            {linksCount} {linksCount === 1 ? "collegato" : "collegati"}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onSelect(p.ev); }}
                          className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                          data-testid={`button-week-open-event-${p.ev.id}`}
                        >
                          Apri scheda <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                      {totalSatellites > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFocusGroupId(isFocused ? null : p.ev.id);
                            // Close the popover so the burst around the
                            // anchor is fully visible (the popover would
                            // otherwise cover the satellites).
                            setExpandedId(null);
                          }}
                          className={[
                            "w-full inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold border transition-colors",
                            isFocused
                              ? "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700/50"
                              : "bg-background hover:bg-accent border-border/70 text-foreground",
                          ].join(" ")}
                          data-testid={`button-focus-burst-${p.ev.id}`}
                          title={isFocused
                            ? "Disattiva: gli eventi collegati tornano alle loro posizioni"
                            : `Richiama vicino qui i ${totalSatellites} eventi collegati`}
                        >
                          <Network className="w-3.5 h-3.5" />
                          {isFocused
                            ? "Disattiva raggruppamento"
                            : `Raggruppa collegamenti (${totalSatellites})`}
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            );
          })()}

          {/* Expanded cluster popover */}
          {expandedId && (() => {
            const cl = clusters.find(c => c.id === expandedId);
            if (!cl) return null;
            const cx = xForHour(cl.hourFrac);
            const cy = yForRow(cl.dayIdx) + ROW_H / 2;
            const popW = 280;
            const visibleW = containerW > 0 ? containerW : innerW;
            const placeRight = cx + ICON_W + 16 + popW <= visibleW - 8;
            const rawLeft = placeRight ? cx + ICON_W : cx - ICON_W - popW;
            const left = Math.max(8, Math.min(visibleW - popW - 8, rawLeft));
            const top = Math.max(HOUR_AXIS_H + 4, Math.min(HOUR_AXIS_H + gridH - 220, cy - 100));
            return (
              <div
                className="absolute z-40 rounded-xl border bg-card shadow-2xl p-2 max-h-[260px] overflow-y-auto"
                style={{ left, top, width: popW }}
                onClick={(e) => e.stopPropagation()}
                data-testid={`week-cluster-popover-${cl.id}`}
              >
                <div className="px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {cl.events.length} eventi vicini
                </div>
                <ul className="space-y-1">
                  {cl.events.map(p => {
                    const s = TYPE_STYLE[p.ev.type];
                    const hot = isHot(p.ev, now);
                    return (
                      <li key={p.ev.id}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onSelect(p.ev); }}
                          className="w-full text-left rounded-md px-1.5 py-1 flex items-center gap-2 hover-elevate"
                          data-testid={`button-week-cluster-item-${p.ev.id}`}
                        >
                          <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${s.bg} ${s.ic} ${hot ? "ring-2 ring-red-500/70" : ""}`}>
                            {eventIcon(p.ev)}
                          </span>
                          <span className="tabular-nums text-[11px] font-semibold text-foreground/80 shrink-0">
                            {format(p.date, "HH:mm")}
                          </span>
                          <span className="truncate text-[11.5px] flex-1">{p.ev.title}</span>
                          {p.ev.links?.some(l => l.strong) && (
                            <Link2 className="w-3 h-3 text-muted-foreground shrink-0" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
