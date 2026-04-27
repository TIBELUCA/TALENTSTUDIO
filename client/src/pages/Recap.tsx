import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, CalendarDays, Phone, Mail, MapPin, Video, MessageCircle,
  FileText, ClipboardList, Bell, UserCheck, Activity, ExternalLink, Filter, X,
  ArrowDownLeft, ArrowUpRight, FileDown, FileSpreadsheet, Search, Layers, Sparkles,
  Loader2, AlertTriangle, ChevronDown, Maximize2, Minimize2, RefreshCw, CheckCircle2,
  Paperclip, PencilRuler, ListTodo,
} from "lucide-react";
import {
  RECAP_EVENT_TYPE_LABELS, type RecapEvent, type RecapEventType, type RecapGranularity,
} from "@shared/recap";
import { DayAgenda } from "@/components/recap/DayAgenda";
import { DayCarousel } from "@/components/recap/DayCarousel";
import { WeekAgenda } from "@/components/recap/WeekAgenda";
import {
  format, addDays, addWeeks, addMonths, addYears, startOfDay, startOfWeek, startOfMonth, startOfYear,
  isSameDay, isToday as dfnsIsToday, parseISO,
  startOfISOWeek, endOfISOWeek, setISOWeek, setISOWeekYear, getISOWeek, getISOWeekYear,
  endOfMonth, endOfDay,
} from "date-fns";
import { it } from "date-fns/locale";

const ALL_TYPES: RecapEventType[] = [
  "interaction", "offer_created", "offer_close_forecast",
  "offer_status_changed", "offer_drawing_added", "offer_drawing_ready",
  "order_created", "order_milestone",
  "order_approved", "order_versioned", "order_email_link",
  "order_layout_added", "order_layout_changed", "order_document_added",
  "reminder", "contact_recall", "activity",
];

// Compact "X minuti fa" used in the Gmail-archive freshness indicator. Kept
// short on purpose because it sits inside the Recap toolbar next to other
// chips and we don't want it to wrap.
function formatRecapRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "mai sincronizzato";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "mai sincronizzato";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.max(0, Math.round(diffMs / 1000));
  if (sec < 45) return "ora";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min fa`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h fa`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}g fa`;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

const TYPE_COLORS: Record<RecapEventType, string> = {
  interaction: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
  offer_created: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800",
  offer_close_forecast: "bg-violet-50 text-violet-600 border-violet-200 border-dashed dark:bg-violet-900/15 dark:text-violet-300",
  // Offer family — violet shades to keep the visual cue consistent.
  offer_status_changed: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800",
  offer_drawing_added: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 dark:border-fuchsia-800",
  offer_drawing_ready: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/20 dark:text-fuchsia-300 dark:border-fuchsia-800",
  // Order family — indigo/blue shades.
  order_created: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800",
  order_milestone: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  order_approved: "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-700",
  order_versioned: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-800",
  order_email_link: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
  order_layout_added: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800",
  order_layout_changed: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800",
  order_document_added: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
  reminder: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  contact_recall: "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800",
  activity: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  // Talent / campaign family — rose / teal shades.
  quote_sent: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
  quote_accepted: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800",
  deliverable_published: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800",
  campaign_payment_in: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800",
  campaign_payment_out: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800",
};

function eventIcon(e: RecapEvent) {
  if (e.type === "interaction") {
    const sub = (e.subtype || "").split(":")[0];
    if (sub === "phone_call") return <Phone className="w-3.5 h-3.5" />;
    if (sub === "email") return <Mail className="w-3.5 h-3.5" />;
    if (sub === "visit") return <MapPin className="w-3.5 h-3.5" />;
    if (sub === "video_call") return <Video className="w-3.5 h-3.5" />;
    if (sub === "whatsapp") return <MessageCircle className="w-3.5 h-3.5" />;
    if (sub === "offer_created" || sub === "offer_versioned") return <FileText className="w-3.5 h-3.5" />;
    if (sub === "todo") return <ListTodo className="w-3.5 h-3.5" />;
    return <Mail className="w-3.5 h-3.5" />;
  }
  if (e.type === "offer_created" || e.type === "offer_close_forecast") return <FileText className="w-3.5 h-3.5" />;
  if (e.type === "offer_status_changed") return <RefreshCw className="w-3.5 h-3.5" />;
  if (e.type === "offer_drawing_added") return <PencilRuler className="w-3.5 h-3.5" />;
  if (e.type === "offer_drawing_ready") return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (e.type === "order_created" || e.type === "order_milestone") return <ClipboardList className="w-3.5 h-3.5" />;
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

const GRAN_TO_COLS: Record<RecapGranularity, number> = {
  day: 1, week: 12, month: 12, year: 6,
};

function startOfBucket(d: Date, g: RecapGranularity): Date {
  if (g === "day") return startOfDay(d);
  if (g === "week") return startOfWeek(d, { weekStartsOn: 1 });
  if (g === "month") return startOfMonth(d);
  return startOfYear(d);
}
function addBucket(d: Date, g: RecapGranularity, n: number): Date {
  if (g === "day") return addDays(d, n);
  if (g === "week") return addWeeks(d, n);
  if (g === "month") return addMonths(d, n);
  return addYears(d, n);
}
function bucketLabel(d: Date, g: RecapGranularity): string {
  if (g === "day") return `${format(d, "EEEE d MMMM yyyy", { locale: it })} (sett. ${format(d, "w", { locale: it })})`;
  if (g === "week") {
    const end = addDays(d, 6);
    const sameMonth = d.getMonth() === end.getMonth() && d.getFullYear() === end.getFullYear();
    const sameYear = d.getFullYear() === end.getFullYear();
    const startFmt = sameMonth ? format(d, "d", { locale: it }) : sameYear ? format(d, "d MMM", { locale: it }) : format(d, "d MMM yyyy", { locale: it });
    const endFmt = format(end, "d MMM yyyy", { locale: it });
    return `Sett. ${format(d, "w", { locale: it })} · ${startFmt} – ${endFmt}`;
  }
  if (g === "month") return format(d, "MMMM yyyy", { locale: it });
  return `Anno ${format(d, "yyyy")}`;
}
function inBucket(eventDate: Date, bucketStart: Date, g: RecapGranularity): boolean {
  if (g === "day") return isSameDay(eventDate, bucketStart);
  const next = addBucket(bucketStart, g, 1);
  return eventDate.getTime() >= bucketStart.getTime() && eventDate.getTime() < next.getTime();
}

interface UrlState {
  granularity: RecapGranularity;
  anchor: string; // ISO yyyy-mm-dd
  types: RecapEventType[];
  customerId?: string;
  contactId?: string;
  area?: string;
  offerStatus?: string;
  orderStatus?: string;
}

function readUrlState(): UrlState {
  const sp = new URLSearchParams(window.location.search);
  const granularity = (sp.get("g") as RecapGranularity) || "day";
  const anchor = sp.get("anchor") || format(new Date(), "yyyy-MM-dd");
  const typesStr = sp.get("types");
  const types = typesStr ? (typesStr.split(",").filter(Boolean) as RecapEventType[]) : ALL_TYPES;
  return {
    granularity,
    anchor,
    types,
    customerId: sp.get("customerId") || undefined,
    contactId: sp.get("contactId") || undefined,
    area: sp.get("area") || undefined,
    offerStatus: sp.get("offerStatus") || undefined,
    orderStatus: sp.get("orderStatus") || undefined,
  };
}

function writeUrlState(s: UrlState, setLocation: (to: string, opts?: any) => void) {
  const sp = new URLSearchParams();
  sp.set("g", s.granularity);
  sp.set("anchor", s.anchor);
  if (s.types.length !== ALL_TYPES.length) sp.set("types", s.types.join(","));
  if (s.customerId) sp.set("customerId", s.customerId);
  if (s.contactId) sp.set("contactId", s.contactId);
  if (s.area) sp.set("area", s.area);
  if (s.offerStatus) sp.set("offerStatus", s.offerStatus);
  if (s.orderStatus) sp.set("orderStatus", s.orderStatus);
  setLocation(`/recap?${sp.toString()}`, { replace: true });
}

const OFFER_STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];
const ORDER_STATUSES = ["active", "completed", "on_hold", "cancelled"];

export default function Recap() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<UrlState>(() => readUrlState());
  const [selected, setSelected] = useState<RecapEvent | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  // The Recap page currently only exposes the weekly continuous-scroll
  // view; the rest of the toolbar (search, group-by, filters, types,
  // export) is collapsed behind a single toggle so the page header stays
  // visually minimal. Other granularities (day/month/year) are kept in the
  // codebase but intentionally hidden from the UI.
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Saved panel state captured when entering fullscreen, restored on exit.
  const fullscreenPrevRef = useRef<{
    briefingOpen: boolean;
    toolbarOpen: boolean;
    showFilters: boolean;
    showTypes: boolean;
  } | null>(null);

  // ESC exits fullscreen for parity with the browser fullscreen UX.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    // Lock background scroll while the recap covers the whole viewport.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState<"none" | "customer" | "offer">("none");
  const [briefingOpen, setBriefingOpen] = useState(false);

  // Available height for the WeekAgenda inner scroll surface, computed from
  // the timeline container's actual size so the agenda fills the visible
  // viewport in fullscreen without pushing content below the fold.
  const [timelineH, setTimelineH] = useState<number | null>(null);

  // When entering fullscreen, snapshot panel state and collapse everything
  // that would steal vertical space from the agenda. Restore on exit.
  useEffect(() => {
    if (fullscreen) {
      if (!fullscreenPrevRef.current) {
        fullscreenPrevRef.current = {
          briefingOpen, toolbarOpen, showFilters, showTypes,
        };
      }
      setBriefingOpen(false);
      setToolbarOpen(false);
      setShowFilters(false);
      setShowTypes(false);
    } else if (fullscreenPrevRef.current) {
      const prev = fullscreenPrevRef.current;
      setBriefingOpen(prev.briefingOpen);
      setToolbarOpen(prev.toolbarOpen);
      setShowFilters(prev.showFilters);
      setShowTypes(prev.showTypes);
      fullscreenPrevRef.current = null;
    }
  }, [fullscreen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track the actual rendered height of the timeline container so the
  // WeekAgenda's inner scroll area fills the available space (especially
  // in fullscreen, where collapsing other panels frees up real estate).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setTimelineH(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullscreen]);

  // ─── Briefing time scope ────────────────────────────────────────────
  // Lets the user choose the period the AI briefing should cover.
  type BriefingScopeMode = "week_current" | "week_iso" | "month" | "custom";
  const today = new Date();
  const [briefingScopeMode, setBriefingScopeMode] = useState<BriefingScopeMode>("week_current");
  const [briefingIsoYear, setBriefingIsoYear] = useState<number>(getISOWeekYear(today));
  const [briefingIsoWeek, setBriefingIsoWeek] = useState<number>(getISOWeek(today));
  const [briefingMonth, setBriefingMonth] = useState<string>(format(today, "yyyy-MM"));
  const [briefingFrom, setBriefingFrom] = useState<string>(format(today, "yyyy-MM-dd"));
  const [briefingTo, setBriefingTo] = useState<string>(format(addDays(today, 6), "yyyy-MM-dd"));

  // ─── PDF export scope ───────────────────────────────────────────────
  // The PDF export uses a separate period selector (mirroring the AI
  // briefing UX): the user chooses the range and only then hits "Genera PDF".
  const [pdfPopoverOpen, setPdfPopoverOpen] = useState(false);
  const [pdfScopeMode, setPdfScopeMode] = useState<BriefingScopeMode>("week_current");
  const [pdfIsoYear, setPdfIsoYear] = useState<number>(getISOWeekYear(today));
  const [pdfIsoWeek, setPdfIsoWeek] = useState<number>(getISOWeek(today));
  const [pdfMonth, setPdfMonth] = useState<string>(format(today, "yyyy-MM"));
  const [pdfFrom, setPdfFrom] = useState<string>(format(today, "yyyy-MM-dd"));
  const [pdfTo, setPdfTo] = useState<string>(format(addDays(today, 6), "yyyy-MM-dd"));
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Persist URL whenever state changes
  useEffect(() => {
    writeUrlState(state, setLocation);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock the visible view to "week" for now. Other granularities are kept
  // in the codebase (DayCarousel/month/year columns) but hidden from the
  // UI. If a deep-link arrives with ?g=day|month|year we silently coerce
  // the state back to week.
  useEffect(() => {
    if (state.granularity !== "week") {
      setState(s => ({ ...s, granularity: "week" }));
    }
  }, [state.granularity]);

  const anchorDate = useMemo(() => parseISO(state.anchor), [state.anchor]);
  const cols = GRAN_TO_COLS[state.granularity];
  const windowStart = useMemo(() => startOfBucket(anchorDate, state.granularity), [anchorDate, state.granularity]);
  const windowEnd = useMemo(() => addBucket(windowStart, state.granularity, cols), [windowStart, state.granularity, cols]);

  // Fetch with a buffer on each side. In day view we deliberately enlarge
  // the buffer to ±14 days so that "satellite" events linked to the
  // currently shown day (mail ↔ offerta ↔ ordine) but happening on other
  // days are present in the payload and can be rendered on demand.
  // Week view is rendered as a continuously scrollable agenda (the user can
  // scroll up/down to reveal previous/next days without changing the anchor),
  // so we pre-fetch a much wider window than the visible 7 days. The buffer
  // here must cover WeekAgenda's MIN_OFFSET..MAX_OFFSET (currently -130..+96
  // days from weekStart) so scrolled-into rows are never falsely empty.
  const fetchFrom = useMemo(
    () => state.granularity === "week"
      ? addDays(windowStart, -135)
      : addBucket(windowStart, state.granularity, state.granularity === "day" ? -14 : -1),
    [windowStart, state.granularity],
  );
  const fetchTo = useMemo(
    () => state.granularity === "week"
      ? addDays(windowStart, 100)
      : addBucket(windowEnd, state.granularity, state.granularity === "day" ? 14 : 1),
    [windowStart, windowEnd, state.granularity],
  );

  const queryParams = new URLSearchParams();
  queryParams.set("from", fetchFrom.toISOString());
  queryParams.set("to", fetchTo.toISOString());
  if (state.types.length !== ALL_TYPES.length) queryParams.set("types", state.types.join(","));
  if (state.customerId) queryParams.set("customerId", state.customerId);
  if (state.contactId) queryParams.set("contactId", state.contactId);
  if (state.area) queryParams.set("area", state.area);
  if (state.offerStatus) queryParams.set("offerStatus", state.offerStatus);
  if (state.orderStatus) queryParams.set("orderStatus", state.orderStatus);
  const queryString = queryParams.toString();

  const { data, isLoading } = useQuery<{
    events: RecapEvent[];
    count: number;
    inboundTruncated?: boolean;
    inboundLimit?: number | null;
  }>({
    queryKey: ["/api/recap/events", queryString],
    queryFn: async () => {
      const r = await fetch(`/api/recap/events?${queryString}`, { credentials: "include" });
      if (!r.ok) throw new Error("Errore caricamento");
      return r.json();
    },
  });
  const events = data?.events ?? [];
  const inboundTruncated = data?.inboundTruncated === true;
  const inboundLimit = data?.inboundLimit ?? null;

  // ─── Gmail archive freshness indicator (next to the toolbar) ─────────
  // We piggy-back on the same /api/email/connections payload the Account
  // page uses, so the cache is shared across pages and only one request is
  // needed. The indicator is purely informational — clicking the refresh
  // icon fires an on-demand sync and refetches the connections + recap so
  // the timeline picks up any newly indexed messages.
  type GmailSyncConn = {
    id: number;
    provider: string;
    isDefault: boolean;
    gmailIndexLastSyncedAt?: string | null;
    gmailIndexLastError?: string | null;
  };
  const queryClient = useQueryClient();
  const { data: emailConnections } = useQuery<GmailSyncConn[]>({
    queryKey: ["/api/email/connections"],
  });
  const gmailConn = useMemo(() => {
    if (!emailConnections) return null;
    const gmails = emailConnections.filter(c => c.provider === "gmail");
    if (gmails.length === 0) return null;
    return gmails.find(c => c.isDefault) ?? gmails[0];
  }, [emailConnections]);
  const recapSyncMutation = useMutation({
    mutationFn: async (id: number) => {
      const resp = await fetch(`/api/email/connections/${id}/sync`, {
        method: "POST",
        credentials: "include",
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body?.error || "Sincronizzazione fallita");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recap/events"] });
      toast({ title: "Archivio email aggiornato" });
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/connections"] });
      toast({
        title: "Sincronizzazione fallita",
        description: err?.message || "Riprova più tardi.",
        variant: "destructive",
      });
    },
  });

  // Client-side text search across the visible window.
  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return events;
    return events.filter(e => {
      const hay = [
        e.title, e.description, e.customerName, e.contactName,
        e.offerReference, e.jobOrderReference, e.area, e.subtype,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [events, searchQuery]);

  // Bucket events by column
  const buckets = useMemo(() => {
    const arr: { start: Date; events: RecapEvent[] }[] = [];
    for (let i = 0; i < cols; i++) {
      const start = addBucket(windowStart, state.granularity, i);
      arr.push({ start, events: [] });
    }
    for (const e of filteredEvents) {
      const ed = parseISO(e.date);
      const idx = arr.findIndex(b => inBucket(ed, b.start, state.granularity));
      if (idx >= 0) arr[idx].events.push(e);
    }
    return arr;
  }, [filteredEvents, cols, windowStart, state.granularity]);

  // Group events within a bucket (used when groupBy !== "none").
  const groupBucket = (evs: RecapEvent[]): { key: string; label: string; events: RecapEvent[] }[] => {
    if (groupBy === "none") return [{ key: "_all", label: "", events: evs }];
    const map = new Map<string, { key: string; label: string; events: RecapEvent[] }>();
    for (const e of evs) {
      let key: string;
      let label: string;
      if (groupBy === "customer") {
        key = e.customerId ? `c:${e.customerId}` : "c:none";
        label = e.customerName ?? "(senza cliente)";
      } else {
        key = e.offerId ? `o:${e.offerId}` : "o:none";
        label = e.offerReference ?? "(senza offerta)";
      }
      if (!map.has(key)) map.set(key, { key, label, events: [] });
      map.get(key)!.events.push(e);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  };

  // ─── AI Briefing ────────────────────────────────────────────────────
  // Send the SAME visible-window filters as the GET (not the buffered fetch
  // range), so the AI input mirrors exactly what the user sees on screen.
  // The server is authoritative: it re-loads scoped events from these params.
  // We support cancellation via AbortController so the user can dismiss a
  // long generation without leaving the request hanging.
  const briefingAbortRef = useRef<AbortController | null>(null);
  type BriefingArgs = { from?: Date; to?: Date; scopeKind?: "daily" | "weekly" | "monthly" | "custom"; forceRefresh?: boolean } | void;
  const briefingMutation = useMutation<any, Error, BriefingArgs>({
    mutationFn: async (override) => {
      // Cancel any in-flight request before starting a new one.
      if (briefingAbortRef.current) briefingAbortRef.current.abort();
      const ac = new AbortController();
      briefingAbortRef.current = ac;
      const fromDate = override?.from ?? windowStart;
      const toDate = override?.to ?? new Date(windowEnd.getTime() - 1);
      // Reference date: if "now" falls inside the period, use now (so the AI
      // bucketizes ieri/oggi/prossimi correctly). Otherwise pin it to the END
      // of the period — this fixes the bug where historical periods produced
      // empty "ieri/oggi" buckets.
      const now = new Date();
      const inRange = now.getTime() >= fromDate.getTime() && now.getTime() <= toDate.getTime();
      const refDate = inRange ? now : toDate;
      const r = await fetch("/api/recap/ai/briefing", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
          types: state.types.length !== ALL_TYPES.length ? state.types.join(",") : undefined,
          customerId: state.customerId,
          contactId: state.contactId,
          area: state.area,
          offerStatus: state.offerStatus,
          orderStatus: state.orderStatus,
          search: searchQuery.trim() || undefined,
          referenceDate: refDate.toISOString(),
          scopeKind: override?.scopeKind,
          forceRefresh: override?.forceRefresh === true,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as any));
        throw new Error(j?.message ?? "Errore generazione briefing");
      }
      return r.json();
    },
    onError: (err) => {
      // Don't show a toast for user-initiated aborts.
      if (err.name === "AbortError") return;
      toast({ title: "Briefing AI non disponibile", description: err.message, variant: "destructive" });
    },
  });
  const briefing = briefingMutation.data;
  const cancelBriefing = () => {
    briefingAbortRef.current?.abort();
    briefingAbortRef.current = null;
  };

  // Compute the [from, to] date range to send to the briefing endpoint
  // based on the chosen scope mode.
  const briefingRange = useMemo<{ from: Date; to: Date; label: string }>(() => {
    if (briefingScopeMode === "week_iso") {
      const ref = setISOWeek(setISOWeekYear(new Date(), briefingIsoYear), briefingIsoWeek);
      const from = startOfISOWeek(ref);
      const to = endOfISOWeek(ref);
      return { from, to, label: `Settimana ${briefingIsoWeek} · ${format(from, "d MMM", { locale: it })} – ${format(to, "d MMM yyyy", { locale: it })}` };
    }
    if (briefingScopeMode === "month") {
      const m = parseISO(`${briefingMonth}-01`);
      const from = startOfMonth(m);
      const to = endOfMonth(m);
      return { from, to, label: format(m, "LLLL yyyy", { locale: it }) };
    }
    if (briefingScopeMode === "custom") {
      const from = startOfDay(parseISO(briefingFrom));
      const to = endOfDay(parseISO(briefingTo));
      return { from, to, label: `${format(from, "d MMM yyyy", { locale: it })} – ${format(to, "d MMM yyyy", { locale: it })}` };
    }
    // week_current: use the page's current visible window
    return {
      from: windowStart,
      to: new Date(windowEnd.getTime() - 1),
      label: `${format(windowStart, "d MMM", { locale: it })} – ${format(addDays(windowStart, 6), "d MMM yyyy", { locale: it })}`,
    };
  }, [briefingScopeMode, briefingIsoYear, briefingIsoWeek, briefingMonth, briefingFrom, briefingTo, windowStart, windowEnd]);

  // Map the UI scope mode to the server-side scopeKind taxonomy.
  // weekly = current week / specific ISO week, monthly = full calendar month,
  // custom = arbitrary [from, to]. We don't expose "daily" from the UI yet.
  const briefingScopeKind: "weekly" | "monthly" | "custom" =
    briefingScopeMode === "month" ? "monthly"
      : briefingScopeMode === "custom" ? "custom"
      : "weekly";

  const generateBriefing = (forceRefresh = false) => briefingMutation.mutate({
    from: briefingRange.from,
    to: briefingRange.to,
    scopeKind: briefingScopeKind,
    forceRefresh,
  });

  // Same shape as briefingRange but driven by the PDF popover state.
  const pdfRange = useMemo<{ from: Date; to: Date; label: string }>(() => {
    if (pdfScopeMode === "week_iso") {
      const ref = setISOWeek(setISOWeekYear(new Date(), pdfIsoYear), pdfIsoWeek);
      const from = startOfISOWeek(ref);
      const to = endOfISOWeek(ref);
      return { from, to, label: `Settimana ${pdfIsoWeek} · ${format(from, "d MMM", { locale: it })} – ${format(to, "d MMM yyyy", { locale: it })}` };
    }
    if (pdfScopeMode === "month") {
      const m = parseISO(`${pdfMonth}-01`);
      return { from: startOfMonth(m), to: endOfMonth(m), label: format(m, "LLLL yyyy", { locale: it }) };
    }
    if (pdfScopeMode === "custom") {
      const from = startOfDay(parseISO(pdfFrom));
      const to = endOfDay(parseISO(pdfTo));
      return { from, to, label: `${format(from, "d MMM yyyy", { locale: it })} – ${format(to, "d MMM yyyy", { locale: it })}` };
    }
    // week_current: visible window
    return {
      from: windowStart,
      to: new Date(windowEnd.getTime() - 1),
      label: `${format(windowStart, "d MMM", { locale: it })} – ${format(addDays(windowStart, 6), "d MMM yyyy", { locale: it })}`,
    };
  }, [pdfScopeMode, pdfIsoYear, pdfIsoWeek, pdfMonth, pdfFrom, pdfTo, windowStart, windowEnd]);

  const goPrev = () => setState(s => ({ ...s, anchor: format(addBucket(parseISO(s.anchor), s.granularity, -Math.max(1, Math.floor(cols / 2))), "yyyy-MM-dd") }));
  const goNext = () => setState(s => ({ ...s, anchor: format(addBucket(parseISO(s.anchor), s.granularity, Math.max(1, Math.floor(cols / 2))), "yyyy-MM-dd") }));
  const goToday = () => setState(s => ({ ...s, anchor: format(new Date(), "yyyy-MM-dd") }));

  const toggleType = (t: RecapEventType) => {
    setState(s => {
      const has = s.types.includes(t);
      const next = has ? s.types.filter(x => x !== t) : [...s.types, t];
      return { ...s, types: next.length ? next : [t] };
    });
  };

  const isDayView = state.granularity === "day";
  const colWidth = isDayView ? 0 : state.granularity === "week" ? 300 : state.granularity === "month" ? 260 : 220;

  const buildExportUrl = (
    format: "pdf" | "xlsx",
    range?: { from: Date; to: Date },
  ) => {
    const sp = new URLSearchParams();
    // Export uses the visible window bounds by default (so the exported file
    // matches what's on screen). PDF can override with a user-chosen range
    // via the dedicated period popover.
    const fromDate = range?.from ?? windowStart;
    const toDate = range?.to ?? new Date(windowEnd.getTime() - 1);
    sp.set("from", fromDate.toISOString());
    sp.set("to", toDate.toISOString());
    if (state.types.length !== ALL_TYPES.length) sp.set("types", state.types.join(","));
    if (state.customerId) sp.set("customerId", state.customerId);
    if (state.contactId) sp.set("contactId", state.contactId);
    if (state.area) sp.set("area", state.area);
    if (state.offerStatus) sp.set("offerStatus", state.offerStatus);
    if (state.orderStatus) sp.set("orderStatus", state.orderStatus);
    if (format === "pdf") sp.set("granularity", state.granularity);
    return `/api/recap/export.${format}?${sp.toString()}`;
  };
  const exportPdf = () => {
    window.location.href = buildExportUrl("pdf", { from: pdfRange.from, to: pdfRange.to });
    setPdfPopoverOpen(false);
  };
  const exportXlsx = () => { window.location.href = buildExportUrl("xlsx"); };

  return (
    <Layout>
      <div
        className={
          fullscreen
            ? "fixed inset-0 z-50 bg-background overflow-hidden p-4 md:p-6 flex flex-col gap-4"
            : "space-y-4"
        }
        data-testid="recap-root"
      >
        <PageHeader
          title="Recap"
          subtitle="Timeline unificata di tutte le attività commerciali"
        />

        {/* Toolbar — minimale: data visibile, Briefing AI compatto e
            "Strumenti" collassato. La navigazione settimana è gestita dallo
            scroll continuo della WeekAgenda, quindi prev/today/next sono
            stati rimossi. Il selettore di granularità è nascosto: in questa
            fase Recap espone solo la vista settimanale scrollabile. */}
        {(() => {
          const activeFilterCount = [
            state.customerId, state.contactId, state.area, state.offerStatus, state.orderStatus,
          ].filter(Boolean).length;
          const activeTypeCount = state.types.length === ALL_TYPES.length ? 0 : state.types.length;
          const hasActiveExtras = activeFilterCount > 0 || activeTypeCount > 0 || searchQuery.trim().length > 0 || groupBy !== "none";
          return (
            <div className="flex items-center gap-1.5 flex-wrap text-sm" data-testid="recap-toolbar">
              {/* Discreet Gmail-archive freshness indicator. Tells the user
                  how stale the locally cached mailbox is (the Recap timeline
                  reads inbound emails from this cache) and lets them trigger
                  an on-demand sync. Hidden when no Gmail account is linked. */}
              {gmailConn && (() => {
                const isSyncing = recapSyncMutation.isPending;
                const lastSyncIso = gmailConn.gmailIndexLastSyncedAt ?? null;
                const hasError = !!gmailConn.gmailIndexLastError;
                const lastSyncTitle = lastSyncIso
                  ? new Date(lastSyncIso).toLocaleString("it-IT")
                  : "L'archivio non è ancora stato sincronizzato.";
                return (
                  <button
                    type="button"
                    onClick={() => recapSyncMutation.mutate(gmailConn.id)}
                    disabled={isSyncing}
                    title={hasError
                      ? `Ultima sincronizzazione fallita: ${gmailConn.gmailIndexLastError}`
                      : `Archivio email aggiornato il ${lastSyncTitle}. Clicca per sincronizzare.`}
                    className={`inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] tabular-nums hover-elevate transition-colors ${
                      hasError
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="recap-gmail-sync-indicator"
                  >
                    {isSyncing
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : hasError
                        ? <AlertTriangle className="w-3 h-3" />
                        : <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                    <span className="hidden sm:inline">Archivio email:</span>
                    <span className="font-medium text-foreground">
                      {formatRecapRelativeTime(lastSyncIso)}
                    </span>
                    <RefreshCw className={`w-3 h-3 ml-0.5 opacity-60 ${isSyncing ? "animate-spin" : ""}`} />
                  </button>
                );
              })()}

              <div className="flex-1" />

              {/* Briefing AI compatto: toggle + azione Genera/Rigenera. Il
                  pannello esteso con i 4 box (Oggi/Prossime/Promemoria/
                  Segnali) appare sotto la toolbar se aperto. */}
              <Button
                variant={briefingOpen ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setBriefingOpen(o => !o)}
                data-testid="button-toggle-briefing"
                aria-expanded={briefingOpen}
                title={briefingOpen ? "Nascondi briefing" : "Mostra briefing"}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1 text-primary" />
                Briefing AI
                {briefing?.generatedAt && (
                  <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">
                    {format(parseISO(briefing.generatedAt), "HH:mm", { locale: it })}
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${briefingOpen ? "rotate-180" : ""}`} />
              </Button>

              <span className="mx-1 h-5 w-px bg-border" aria-hidden />

              <Button
                variant={fullscreen ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setFullscreen(f => !f)}
                data-testid="button-toggle-fullscreen"
                title={fullscreen ? "Esci da schermo intero (Esc)" : "Schermo intero"}
                aria-pressed={fullscreen}
              >
                {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </Button>

              <Button
                variant={toolbarOpen || hasActiveExtras ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setToolbarOpen(o => !o)}
                data-testid="button-toggle-toolbar"
                title={toolbarOpen ? "Nascondi strumenti" : "Mostra strumenti"}
                aria-expanded={toolbarOpen}
              >
                <Filter className="w-3.5 h-3.5 mr-1" />
                Strumenti
                {hasActiveExtras && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                    {activeFilterCount + activeTypeCount + (searchQuery.trim() ? 1 : 0) + (groupBy !== "none" ? 1 : 0)}
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${toolbarOpen ? "rotate-180" : ""}`} />
              </Button>
            </div>
          );
        })()}

        {/* Briefing AI — pannello esteso visibile solo se richiesto */}
        {briefingOpen && (
          <div className="space-y-3" data-testid="recap-ai-briefing-body">
            {/* Period selector card: lets the user choose the time window
                the AI briefing should cover. Always visible. */}
            <div
              className="rounded-lg border bg-card p-3 space-y-2.5"
              data-testid="briefing-scope-card"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <CalendarDays className="w-3.5 h-3.5" />
                Periodo da analizzare
                <span className="ml-auto text-[11px] font-normal text-foreground tabular-nums" data-testid="text-briefing-range">
                  {briefingRange.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  ["week_current", "Settimana corrente"],
                  ["week_iso", "Settimana N°"],
                  ["month", "Mese"],
                  ["custom", "Intervallo"],
                ] as [BriefingScopeMode, string][]).map(([mode, label]) => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={briefingScopeMode === mode ? "secondary" : "ghost"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setBriefingScopeMode(mode)}
                    data-testid={`button-briefing-scope-${mode}`}
                  >
                    {label}
                  </Button>
                ))}
                <div className="flex-1" />
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => generateBriefing(briefing != null)}
                  disabled={briefingMutation.isPending || isLoading}
                  data-testid="button-briefing-scope-generate"
                  title={briefing ? "Forza una nuova generazione (ignora cache)" : "Genera briefing AI"}
                >
                  {briefingMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                  )}
                  {briefing ? "Rigenera" : "Genera"}
                </Button>
              </div>

              {briefingScopeMode === "week_iso" && (
                <div className="flex items-center gap-2 text-xs">
                  <label className="text-muted-foreground">Anno</label>
                  <Input
                    type="number"
                    value={briefingIsoYear}
                    onChange={e => setBriefingIsoYear(Number(e.target.value) || briefingIsoYear)}
                    className="h-8 w-24"
                    data-testid="input-briefing-iso-year"
                  />
                  <label className="text-muted-foreground ml-2">Settimana</label>
                  <Input
                    type="number"
                    min={1}
                    max={53}
                    value={briefingIsoWeek}
                    onChange={e => {
                      const v = Number(e.target.value);
                      if (v >= 1 && v <= 53) setBriefingIsoWeek(v);
                    }}
                    className="h-8 w-20"
                    data-testid="input-briefing-iso-week"
                  />
                </div>
              )}

              {briefingScopeMode === "month" && (
                <div className="flex items-center gap-2 text-xs">
                  <label className="text-muted-foreground">Mese</label>
                  <Input
                    type="month"
                    value={briefingMonth}
                    onChange={e => setBriefingMonth(e.target.value || briefingMonth)}
                    className="h-8 w-44"
                    data-testid="input-briefing-month"
                  />
                </div>
              )}

              {briefingScopeMode === "custom" && (
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <label className="text-muted-foreground">Da</label>
                  <Input
                    type="date"
                    value={briefingFrom}
                    onChange={e => setBriefingFrom(e.target.value || briefingFrom)}
                    className="h-8 w-40"
                    data-testid="input-briefing-from"
                  />
                  <label className="text-muted-foreground">a</label>
                  <Input
                    type="date"
                    value={briefingTo}
                    min={briefingFrom}
                    onChange={e => setBriefingTo(e.target.value || briefingTo)}
                    className="h-8 w-40"
                    data-testid="input-briefing-to"
                  />
                </div>
              )}
            </div>

            {briefingMutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="briefing-pending">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sto analizzando gli eventi e preparando il briefing…
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px] ml-1"
                  onClick={cancelBriefing}
                  data-testid="button-briefing-cancel"
                >
                  <X className="w-3 h-3 mr-1" /> Annulla
                </Button>
              </div>
            )}
            {briefing && (() => {
              // Adaptive labels: in "monthly"/"custom" the day-centric titles
              // ("Oggi · cosa contare", "Prossime azioni") don't fit. Switch
              // to period-centric phrasing.
              const sk = briefing.scopeKind ?? briefingScopeKind;
              const isPeriod = sk === "monthly" || sk === "custom";
              const labels = isPeriod
                ? {
                    summary: "Sintesi del periodo",
                    highlights: "Cose principali",
                    upcoming: "Azioni consigliate",
                  }
                : {
                    summary: "Ieri",
                    highlights: "Oggi · cosa contare",
                    upcoming: "Prossime azioni",
                  };
              return (
                <>
                  {/* Status bar: analyzed/total + duration + cache + facts. */}
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground tabular-nums" data-testid="briefing-status-bar">
                    <span data-testid="text-briefing-analyzed">
                      Analizzati <strong className="text-foreground">{briefing.analyzedCount}</strong>
                      {typeof briefing.totalCount === "number" && briefing.totalCount !== briefing.analyzedCount && (
                        <> / {briefing.totalCount}</>
                      )} eventi
                    </span>
                    {briefing.truncated && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        title="Il periodo contiene più eventi del massimo analizzabile: ho selezionato i più vicini alla data di riferimento."
                        data-testid="badge-briefing-truncated"
                      >
                        <AlertTriangle className="w-3 h-3" /> parziale
                      </span>
                    )}
                    {typeof briefing.factsUsed === "number" && briefing.factsUsed > 0 && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary"
                        title="Segnali deterministici (offerte ferme, promemoria scaduti, milestone in ritardo) calcolati prima della chiamata AI."
                        data-testid="badge-briefing-facts"
                      >
                        <Sparkles className="w-3 h-3" /> {briefing.factsUsed} segnali
                      </span>
                    )}
                    {briefing.cached && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-muted text-muted-foreground"
                        title="Risultato servito dalla cache del server (stesso periodo entro 1 ora)."
                        data-testid="badge-briefing-cached"
                      >
                        cache
                      </span>
                    )}
                    <span className="ml-auto" data-testid="text-briefing-duration">
                      {typeof briefing.durationMs === "number" && `${(briefing.durationMs / 1000).toFixed(1)}s`}
                      {briefing.generatedAt && (
                        <span className="ml-2">· {format(parseISO(briefing.generatedAt), "HH:mm:ss", { locale: it })}</span>
                      )}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-in fade-in duration-300">
                    {briefing.yesterdaySummary && (
                      <div className="md:col-span-2 text-xs leading-relaxed bg-muted/30 rounded-md p-2.5" data-testid="briefing-yesterday">
                        <span className="font-semibold mr-1">{labels.summary}:</span>{briefing.yesterdaySummary}
                      </div>
                    )}
                    <BriefingSection
                      title={labels.highlights}
                      icon={<Sparkles className="w-3.5 h-3.5 text-primary" />}
                      items={briefing.todayHighlights}
                      testid="briefing-today"
                    />
                    <BriefingSection
                      title={labels.upcoming}
                      icon={<CalendarDays className="w-3.5 h-3.5 text-blue-600" />}
                      items={briefing.upcomingActions}
                      testid="briefing-upcoming"
                    />
                    <BriefingSection
                      title="Promemoria"
                      icon={<Bell className="w-3.5 h-3.5 text-amber-600" />}
                      items={briefing.reminders}
                      testid="briefing-reminders"
                    />
                    <BriefingSection
                      title="Segnali di attenzione"
                      icon={<AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                      items={briefing.warnings}
                      testid="briefing-warnings"
                    />
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Strumenti estesi — visibili solo on-demand */}
        {toolbarOpen && (() => {
          const activeFilterCount = [
            state.customerId, state.contactId, state.area, state.offerStatus, state.orderStatus,
          ].filter(Boolean).length;
          const activeTypeCount = state.types.length === ALL_TYPES.length ? 0 : state.types.length;
          return (
            <div className="flex items-center gap-2 flex-wrap p-2.5 border rounded-lg bg-muted/20" data-testid="recap-toolbar-extras">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Cerca eventi…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 w-48"
                  data-testid="input-search"
                />
              </div>

              <Select value={groupBy} onValueChange={(v: "none" | "customer" | "offer") => setGroupBy(v)}>
                <SelectTrigger className="w-44 h-9" data-testid="select-group-by">
                  <Layers className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Senza raggruppamento</SelectItem>
                  <SelectItem value="customer">Per cliente</SelectItem>
                  <SelectItem value="offer">Per offerta</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant={showFilters || activeFilterCount > 0 ? "default" : "outline"}
                size="sm"
                onClick={() => setShowFilters(v => !v)}
                data-testid="button-toggle-filters"
                title="Mostra/nascondi filtri"
              >
                <Filter className="w-4 h-4 mr-1" />
                Filtri{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </Button>
              <Button
                variant={showTypes || activeTypeCount > 0 ? "default" : "outline"}
                size="sm"
                onClick={() => setShowTypes(v => !v)}
                data-testid="button-toggle-types"
                title="Mostra/nascondi tipi di evento"
              >
                <Filter className="w-4 h-4 mr-1" />
                Tipi{activeTypeCount > 0 ? ` (${activeTypeCount}/${ALL_TYPES.length})` : ""}
              </Button>

              <div className="flex-1" />

              <Popover open={pdfPopoverOpen} onOpenChange={setPdfPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="button-export-pdf"
                    title="Scegli il periodo e genera il PDF"
                  >
                    <FileDown className="w-4 h-4 mr-1" />PDF
                    <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${pdfPopoverOpen ? "rotate-180" : ""}`} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[360px] p-3 space-y-2.5" data-testid="pdf-scope-card">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <CalendarDays className="w-3.5 h-3.5" />
                    Periodo da esportare
                    <span className="ml-auto text-[11px] font-normal text-foreground tabular-nums" data-testid="text-pdf-range">
                      {pdfRange.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {([
                      ["week_current", "Settimana corrente"],
                      ["week_iso", "Settimana N°"],
                      ["month", "Mese"],
                      ["custom", "Intervallo"],
                    ] as [BriefingScopeMode, string][]).map(([mode, label]) => (
                      <Button
                        key={mode}
                        type="button"
                        size="sm"
                        variant={pdfScopeMode === mode ? "secondary" : "ghost"}
                        className="h-7 px-2 text-xs"
                        onClick={() => setPdfScopeMode(mode)}
                        data-testid={`button-pdf-scope-${mode}`}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>

                  {pdfScopeMode === "week_iso" && (
                    <div className="flex items-center gap-2 text-xs">
                      <label className="text-muted-foreground">Anno</label>
                      <Input
                        type="number"
                        value={pdfIsoYear}
                        onChange={e => setPdfIsoYear(Number(e.target.value) || pdfIsoYear)}
                        className="h-8 w-24"
                        data-testid="input-pdf-iso-year"
                      />
                      <label className="text-muted-foreground ml-2">Settimana</label>
                      <Input
                        type="number"
                        min={1}
                        max={53}
                        value={pdfIsoWeek}
                        onChange={e => {
                          const v = Number(e.target.value);
                          if (v >= 1 && v <= 53) setPdfIsoWeek(v);
                        }}
                        className="h-8 w-20"
                        data-testid="input-pdf-iso-week"
                      />
                    </div>
                  )}

                  {pdfScopeMode === "month" && (
                    <div className="flex items-center gap-2 text-xs">
                      <label className="text-muted-foreground">Mese</label>
                      <Input
                        type="month"
                        value={pdfMonth}
                        onChange={e => setPdfMonth(e.target.value || pdfMonth)}
                        className="h-8 w-44"
                        data-testid="input-pdf-month"
                      />
                    </div>
                  )}

                  {pdfScopeMode === "custom" && (
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <label className="text-muted-foreground">Da</label>
                      <Input
                        type="date"
                        value={pdfFrom}
                        onChange={e => setPdfFrom(e.target.value || pdfFrom)}
                        className="h-8 w-40"
                        data-testid="input-pdf-from"
                      />
                      <label className="text-muted-foreground">a</label>
                      <Input
                        type="date"
                        value={pdfTo}
                        min={pdfFrom}
                        onChange={e => setPdfTo(e.target.value || pdfTo)}
                        className="h-8 w-40"
                        data-testid="input-pdf-to"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-8 px-3 text-xs"
                      onClick={exportPdf}
                      data-testid="button-pdf-generate"
                    >
                      <FileDown className="w-3.5 h-3.5 mr-1" />
                      Genera PDF
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="sm"
                onClick={exportXlsx}
                data-testid="button-export-excel"
                title="Esporta gli eventi in Excel"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1" />Excel
              </Button>
            </div>
          );
        })()}

        {/* Filters (collapsible) */}
        {showFilters && (
          <div className="flex items-center gap-2 flex-wrap p-3 border rounded-lg bg-muted/30" data-testid="recap-filters">
            <Input
              placeholder="ID cliente"
              value={state.customerId ?? ""}
              onChange={e => setState(s => ({ ...s, customerId: e.target.value || undefined }))}
              className="w-32"
              data-testid="input-customer-id"
            />
            <Input
              placeholder="ID contatto"
              value={state.contactId ?? ""}
              onChange={e => setState(s => ({ ...s, contactId: e.target.value || undefined }))}
              className="w-32"
              data-testid="input-contact-id"
            />
            <Input
              placeholder="Area (paese)"
              value={state.area ?? ""}
              onChange={e => setState(s => ({ ...s, area: e.target.value || undefined }))}
              className="w-36"
              data-testid="input-area"
            />
            <Select value={state.offerStatus ?? "all"} onValueChange={v => setState(s => ({ ...s, offerStatus: v === "all" ? undefined : v }))}>
              <SelectTrigger className="w-36" data-testid="select-offer-status">
                <SelectValue placeholder="Stato offerta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati offerta</SelectItem>
                {OFFER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={state.orderStatus ?? "all"} onValueChange={v => setState(s => ({ ...s, orderStatus: v === "all" ? undefined : v }))}>
              <SelectTrigger className="w-36" data-testid="select-order-status">
                <SelectValue placeholder="Stato ordine" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati ordine</SelectItem>
                {ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {(state.customerId || state.contactId || state.area || state.offerStatus || state.orderStatus) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setState(s => ({ ...s, customerId: undefined, contactId: undefined, area: undefined, offerStatus: undefined, orderStatus: undefined }))}
                data-testid="button-clear-filters"
              >
                <X className="w-4 h-4 mr-1" />Pulisci
              </Button>
            )}
          </div>
        )}

        {/* Type pills (collapsible) */}
        {showTypes && (
          <div className="flex items-center gap-2 flex-wrap p-3 border rounded-lg bg-muted/30" data-testid="recap-type-pills">
            <Filter className="w-4 h-4 text-muted-foreground" />
            {ALL_TYPES.map(t => {
              const active = state.types.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? TYPE_COLORS[t] : "bg-transparent text-muted-foreground border-border hover:bg-muted"}`}
                  data-testid={`pill-type-${t}`}
                >
                  {RECAP_EVENT_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
        )}

        {/* Inbound mailbox truncation banner.
            Heavy mailboxes (lots of newsletters) can have more inbound
            messages in the visible window than the soft cap; older ones are
            silently missing. We only show this when no customer/contact
            filter is active — those filters bypass the cap server-side. */}
        {inboundTruncated && !state.customerId && !state.contactId && (
          <div
            className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
            data-testid="banner-inbox-truncated"
          >
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div>
              Mostrate solo le {inboundLimit ?? 1000} email più recenti del periodo selezionato.
              Filtra per cliente o restringi l'intervallo per vedere il resto.
            </div>
          </div>
        )}

        {/* Timeline */}
        <div
          ref={scrollRef}
          className={`relative border rounded-xl bg-card ${isDayView || state.granularity === "week" ? "overflow-hidden" : "overflow-x-auto overflow-y-hidden"} ${fullscreen ? "flex-1 min-h-0" : ""}`}
          style={fullscreen ? undefined : { minHeight: 480 }}
          data-testid="recap-timeline"
        >
          {isLoading && !isDayView && (
            <div className="absolute top-2 right-2 text-xs text-muted-foreground">Caricamento…</div>
          )}
          {isDayView ? (
            <DayCarousel
              anchor={windowStart}
              allEvents={filteredEvents}
              onAnchorChange={(d) => setState(s => ({ ...s, anchor: format(d, "yyyy-MM-dd") }))}
              onSelect={setSelected}
              isLoading={isLoading}
            />
          ) : state.granularity === "week" ? (
            <WeekAgenda
              anchor={windowStart}
              allEvents={filteredEvents}
              onSelect={setSelected}
              isLoading={isLoading}
              viewportMaxH={fullscreen && timelineH != null ? Math.max(320, timelineH - 56) : undefined}
            />
          ) : (
          <div className="flex" style={{ width: cols * colWidth }}>
            {buckets.map((b, idx) => {
              const isCurrent = state.granularity === "day"
                ? dfnsIsToday(b.start)
                : (Date.now() >= b.start.getTime() && Date.now() < addBucket(b.start, state.granularity, 1).getTime());
              const isPastBucket = addBucket(b.start, state.granularity, 1).getTime() < Date.now();
              return (
                <div
                  key={idx}
                  className={`${isDayView ? "flex-1 w-full" : "shrink-0"} border-r last:border-r-0 ${isCurrent ? "bg-amber-50/40 dark:bg-amber-900/10" : ""} ${isPastBucket ? "bg-slate-50/40 dark:bg-slate-900/20" : ""}`}
                  style={isDayView ? undefined : { width: colWidth }}
                  data-testid={`recap-col-${idx}`}
                >
                  <div className={`sticky top-0 z-10 px-3 py-2 border-b backdrop-blur bg-background/85 text-xs font-semibold flex items-center justify-between ${isCurrent ? "text-amber-700 dark:text-amber-300" : ""}`}>
                    <span>{bucketLabel(b.start, state.granularity)}</span>
                    {b.events.length > 0 && <span className="text-muted-foreground font-normal">{b.events.length}</span>}
                  </div>
                  <div className="p-2 space-y-1.5">
                    {b.events.length === 0 && (
                      <div className="text-[11px] text-muted-foreground/60 text-center py-6 select-none">·</div>
                    )}
                    {groupBucket(b.events).map((grp, gi) => (
                      <div key={grp.key} className="space-y-1">
                        {groupBy !== "none" && (
                          <div
                            className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 pt-1 truncate flex items-center gap-1"
                            data-testid={`recap-group-${grp.key}`}
                          >
                            <Layers className="w-3 h-3 opacity-60" />
                            <span className="truncate">{grp.label}</span>
                            <span className="ml-auto opacity-60">{grp.events.length}</span>
                          </div>
                        )}
                        {grp.events.map((ev, ei) => (
                          <HoverCard key={ev.id} openDelay={200} closeDelay={100}>
                            <HoverCardTrigger asChild>
                              <button
                                onClick={() => setSelected(ev)}
                                style={{ animationDelay: `${Math.min(ei + gi * 4, 12) * 25}ms` }}
                                className={`animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-both w-full text-left text-xs px-2 py-1.5 rounded-md border ${TYPE_COLORS[ev.type]} ${ev.timePosition === "projection" ? "opacity-90 italic" : ""} ${ev.timePosition === "future" ? "ring-1 ring-offset-0 ring-current/20" : ""} hover-elevate transition-transform hover:-translate-y-0.5`}
                                data-testid={`recap-event-${ev.id}`}
                              >
                                <div className="flex items-start gap-1.5">
                                  {eventIcon(ev)}
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{ev.title}</div>
                                    <div className="text-[10px] opacity-80 truncate">
                                      {format(parseISO(ev.date), state.granularity === "day" ? "HH:mm" : state.granularity === "year" ? "d MMM yyyy" : "d MMM yyyy HH:mm", { locale: it })}
                                      {ev.customerName ? ` · ${ev.customerName}` : ""}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            </HoverCardTrigger>
                            <HoverCardContent side="right" align="start" className="w-80 p-3 space-y-2" data-testid={`recap-event-preview-${ev.id}`}>
                              <div className="flex items-start gap-2">
                                <span className={`inline-flex w-7 h-7 rounded-md items-center justify-center border ${TYPE_COLORS[ev.type]}`}>
                                  {eventIcon(ev)}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-sm leading-tight">{ev.title}</div>
                                  <div className="text-[11px] text-muted-foreground mt-0.5">
                                    {RECAP_EVENT_TYPE_LABELS[ev.type]}
                                    {ev.subtype ? ` · ${ev.subtype}` : ""}
                                  </div>
                                </div>
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {format(parseISO(ev.date), "EEEE d MMMM yyyy 'alle' HH:mm", { locale: it })}
                              </div>
                              {ev.changeSummary && ev.changeSummary.length > 0 ? (
                                <ul className="text-xs leading-relaxed list-disc pl-4 space-y-0.5">
                                  {ev.changeSummary.slice(0, 4).map((c, i) => (
                                    <li key={i} className="line-clamp-1">{c}</li>
                                  ))}
                                  {ev.changeSummary.length > 4 && (
                                    <li className="text-muted-foreground italic list-none">
                                      +{ev.changeSummary.length - 4} altre modifiche
                                    </li>
                                  )}
                                </ul>
                              ) : ev.description && (
                                <p className="text-xs leading-relaxed line-clamp-4">{ev.description}</p>
                              )}
                              <div className="grid grid-cols-1 gap-1 text-[11px]">
                                {ev.customerName && (
                                  <div><span className="text-muted-foreground">Cliente: </span><span className="font-medium">{ev.customerName}</span></div>
                                )}
                                {ev.contactName && (
                                  <div><span className="text-muted-foreground">Contatto: </span><span className="font-medium">{ev.contactName}</span></div>
                                )}
                                {ev.offerReference && (
                                  <div><span className="text-muted-foreground">Offerta: </span><span className="font-medium">{ev.offerReference}{ev.offerStatus ? ` (${ev.offerStatus})` : ""}</span></div>
                                )}
                                {ev.jobOrderReference && (
                                  <div><span className="text-muted-foreground">Ordine: </span><span className="font-medium">{ev.jobOrderReference}{ev.orderStatus ? ` (${ev.orderStatus})` : ""}</span></div>
                                )}
                                {ev.area && (
                                  <div><span className="text-muted-foreground">Area: </span><span className="font-medium">{ev.area}</span></div>
                                )}
                              </div>
                              {ev.href && (
                                <Link
                                  href={ev.href}
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline pt-1"
                                  data-testid={`recap-event-preview-open-${ev.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Apri scheda <ExternalLink className="w-3 h-3" />
                                </Link>
                              )}
                            </HoverCardContent>
                          </HoverCard>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground" data-testid="recap-summary">
          {events.length} eventi nella finestra · proiezioni in corsivo, eventi futuri evidenziati.
        </div>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="max-w-md" data-testid="dialog-recap-detail">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md border ${TYPE_COLORS[selected.type]}`}>
                    {eventIcon(selected)}
                  </span>
                  {selected.title}
                </DialogTitle>
                <DialogDescription>
                  {format(parseISO(selected.date), "EEEE d MMMM yyyy, HH:mm", { locale: it })}
                </DialogDescription>
                {/* Badges live OUTSIDE DialogDescription because shadcn/Radix
                    renders that as a <p> and Badge is a <div> — nesting a
                    block element inside <p> tripped React's
                    validateDOMNesting and contributed to the recap render
                    instability (#115). */}
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <Badge variant="outline" className="text-[10px]">{RECAP_EVENT_TYPE_LABELS[selected.type]}</Badge>
                  {selected.timePosition === "projection" && <Badge variant="outline" className="text-[10px]">Proiezione</Badge>}
                  {selected.timePosition === "future" && <Badge variant="outline" className="text-[10px]">Futuro</Badge>}
                </div>
              </DialogHeader>

              <div className="space-y-2 text-sm">
                {selected.changeSummary && selected.changeSummary.length > 0 ? (
                  <ul
                    className="text-sm text-muted-foreground list-disc pl-5 space-y-1"
                    data-testid="list-event-change-summary"
                  >
                    {selected.changeSummary.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                ) : selected.description && (
                  <p className="whitespace-pre-wrap text-muted-foreground" data-testid="text-event-description">{selected.description}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {selected.customerName && (
                    <div><span className="text-muted-foreground">Cliente: </span><span className="font-medium">{selected.customerName}</span></div>
                  )}
                  {selected.contactName && (
                    <div><span className="text-muted-foreground">Contatto: </span><span className="font-medium">{selected.contactName}</span></div>
                  )}
                  {selected.offerReference && (
                    <div><span className="text-muted-foreground">Offerta: </span><span className="font-medium">{selected.offerReference}</span></div>
                  )}
                  {selected.jobOrderReference && (
                    <div><span className="text-muted-foreground">Ordine: </span><span className="font-medium">{selected.jobOrderReference}</span></div>
                  )}
                  {selected.area && (
                    <div><span className="text-muted-foreground">Area: </span><span className="font-medium">{selected.area}</span></div>
                  )}
                  {selected.offerStatus && (
                    <div><span className="text-muted-foreground">Stato: </span><span className="font-medium">{selected.offerStatus}</span></div>
                  )}
                </div>
              </div>

              <DialogFooter>
                {selected.href && (
                  <Link href={selected.href}>
                    <Button data-testid="button-open-source"><ExternalLink className="w-4 h-4 mr-2" />Apri</Button>
                  </Link>
                )}
                <Button variant="outline" onClick={() => setSelected(null)} data-testid="button-close-detail">Chiudi</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

// ─── Briefing helpers ────────────────────────────────────────────────────
interface BriefingItem {
  title: string;
  detail?: string;
  link?: string | null;
  priority?: "alta" | "media" | "bassa";
}

function priorityBadgeClass(p?: string): string {
  if (p === "alta") return "bg-destructive/15 text-destructive border-destructive/30";
  if (p === "media") return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
  if (p === "bassa") return "bg-muted text-muted-foreground border-transparent";
  return "bg-muted text-muted-foreground border-transparent";
}

function BriefingSection({
  title, icon, items, testid,
}: { title: string; icon: React.ReactNode; items: BriefingItem[]; testid: string }) {
  return (
    <div className="rounded-md border bg-card/60 p-2.5" data-testid={testid}>
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
        {icon}
        <span>{title}</span>
        <span className="ml-auto text-[10px] text-muted-foreground font-normal">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic">Nessun elemento.</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => {
            const inner = (
              <div className="text-xs leading-snug">
                <div className="flex items-start gap-1.5">
                  <span className="text-muted-foreground mt-0.5">•</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      {it.title}
                      {it.priority && (
                        <span className={`ml-1.5 inline-block text-[9px] uppercase tracking-wide px-1 py-px rounded border ${priorityBadgeClass(it.priority)}`}>
                          {it.priority}
                        </span>
                      )}
                    </div>
                    {it.detail && <div className="text-[11px] text-muted-foreground mt-0.5">{it.detail}</div>}
                  </div>
                </div>
              </div>
            );
            return (
              <li key={i} data-testid={`${testid}-item-${i}`}>
                {it.link ? (
                  <Link href={it.link} className="block hover-elevate rounded px-1 -mx-1">
                    {inner}
                  </Link>
                ) : inner}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
