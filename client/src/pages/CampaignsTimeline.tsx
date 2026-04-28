import { useMemo, useState, useRef, useLayoutEffect, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CalendarRange, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { CAMPAIGN_STATUS_LABELS, type CampaignStatus, type Campaign } from "@shared/schema";

type TimelineCampaign = Campaign & {
  brandName: string | null;
  talents: { id: number; name: string }[];
};

const STATUS_BAR: Record<CampaignStatus, string> = {
  briefing: "bg-amber-400 hover:bg-amber-500",
  production: "bg-blue-500 hover:bg-blue-600",
  publishing: "bg-purple-500 hover:bg-purple-600",
  closed: "bg-green-500 hover:bg-green-600",
};

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const DAY_MS = 86400000;

type Zoom = "month" | "week" | "day";

const ZOOM_PX_PER_DAY: Record<Zoom, number> = {
  month: 4,
  week: 14,
  day: 36,
};

const ZOOM_LABEL: Record<Zoom, string> = {
  month: "Mese",
  week: "Settimana",
  day: "Giorno",
};

const TALENT_COL_PX = 200;
const ROW_H = 56;
const HEADER_H_MONTHS = 26;
const HEADER_H_SUB = 22;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

function startOfWeek(d: Date) {
  // ISO week: Monday as start
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // 0=Mon
  x.setDate(x.getDate() - day);
  return x;
}

function isoWeekNumber(d: Date) {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 4 - ((x.getDay() + 6) % 7 + 1));
  const yearStart = new Date(x.getFullYear(), 0, 1);
  return Math.ceil(((x.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
}

export default function CampaignsTimelinePage() {
  const { data, isLoading } = useQuery<TimelineCampaign[]>({ queryKey: ["/api/campaigns/timeline"] });
  const [zoom, setZoom] = useState<Zoom>("week");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));

  // Active campaigns with both dates
  const active = useMemo(() => {
    return (data ?? [])
      .filter(c => c.status !== "closed" && c.startDate && c.endDate)
      .map(c => ({
        ...c,
        _start: startOfDay(new Date(c.startDate as any)),
        _end: startOfDay(new Date(c.endDate as any)),
      }));
  }, [data]);

  const skipped = useMemo(() => {
    return (data ?? []).filter(c => c.status !== "closed" && (!c.startDate || !c.endDate)).length;
  }, [data]);

  // Build the talent rows: every distinct talent that appears in any active campaign
  const talentRows = useMemo(() => {
    const m = new Map<number, { id: number; name: string; campaigns: typeof active }>();
    for (const c of active) {
      const talents = c.talents.length > 0 ? c.talents : [{ id: -1, name: "— Nessun talent —" }];
      for (const t of talents) {
        const cur = m.get(t.id) ?? { id: t.id, name: t.name, campaigns: [] };
        cur.campaigns.push(c);
        m.set(t.id, cur);
      }
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [active]);

  // Viewport: anchor in the middle, span based on zoom
  const viewport = useMemo(() => {
    let spanDays: number;
    let start: Date;
    if (zoom === "month") {
      // Show ~6 months centered roughly on anchor's month
      const s = startOfMonth(anchor);
      s.setMonth(s.getMonth() - 1);
      start = s;
      const end = new Date(start);
      end.setMonth(end.getMonth() + 6);
      spanDays = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    } else if (zoom === "week") {
      // ~8 weeks starting from week of anchor - 1
      const s = startOfWeek(anchor);
      s.setDate(s.getDate() - 7);
      start = s;
      spanDays = 8 * 7;
    } else {
      // ~21 days centered roughly on anchor
      const s = startOfDay(anchor);
      s.setDate(s.getDate() - 7);
      start = s;
      spanDays = 21;
    }
    return { start, spanDays };
  }, [anchor, zoom]);

  // Dynamic px-per-day: stretch to fill the available container width.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState<number>(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setContainerW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const basePxPerDay = ZOOM_PX_PER_DAY[zoom];
  const fitPxPerDay = containerW > 0 ? (containerW - TALENT_COL_PX - 2) / viewport.spanDays : basePxPerDay;
  const pxPerDay = Math.max(basePxPerDay, fitPxPerDay);
  const totalPx = viewport.spanDays * pxPerDay;

  // Build month header segments
  const monthSegs = useMemo(() => {
    const segs: { label: string; offsetDays: number; widthDays: number }[] = [];
    let cur = startOfMonth(viewport.start);
    while (cur < addDays(viewport.start, viewport.spanDays)) {
      const next = new Date(cur);
      next.setMonth(next.getMonth() + 1);
      const segStart = cur < viewport.start ? viewport.start : cur;
      const segEnd = next > addDays(viewport.start, viewport.spanDays) ? addDays(viewport.start, viewport.spanDays) : next;
      const offsetDays = Math.round((segStart.getTime() - viewport.start.getTime()) / DAY_MS);
      const widthDays = Math.round((segEnd.getTime() - segStart.getTime()) / DAY_MS);
      segs.push({
        label: `${MESI[cur.getMonth()]} ${String(cur.getFullYear()).slice(-2)}`,
        offsetDays,
        widthDays,
      });
      cur = next;
    }
    return segs;
  }, [viewport]);

  // Sub-header segments depending on zoom
  const subSegs = useMemo(() => {
    const segs: { label: string; offsetDays: number; widthDays: number; muted?: boolean }[] = [];
    if (zoom === "month") {
      // Show weeks (W14 etc) every 7 days
      let cur = startOfWeek(viewport.start);
      while (cur < addDays(viewport.start, viewport.spanDays)) {
        const next = addDays(cur, 7);
        const segStart = cur < viewport.start ? viewport.start : cur;
        const segEnd = next > addDays(viewport.start, viewport.spanDays) ? addDays(viewport.start, viewport.spanDays) : next;
        const offsetDays = Math.round((segStart.getTime() - viewport.start.getTime()) / DAY_MS);
        const widthDays = Math.round((segEnd.getTime() - segStart.getTime()) / DAY_MS);
        segs.push({ label: `W${isoWeekNumber(cur)}`, offsetDays, widthDays });
        cur = next;
      }
    } else if (zoom === "week") {
      // Show day numbers
      for (let i = 0; i < viewport.spanDays; i++) {
        const d = addDays(viewport.start, i);
        const dow = (d.getDay() + 6) % 7;
        segs.push({
          label: String(d.getDate()),
          offsetDays: i,
          widthDays: 1,
          muted: dow >= 5,
        });
      }
    } else {
      // day zoom — show day name + number
      for (let i = 0; i < viewport.spanDays; i++) {
        const d = addDays(viewport.start, i);
        const dow = (d.getDay() + 6) % 7;
        segs.push({
          label: `${GIORNI[dow]} ${d.getDate()}`,
          offsetDays: i,
          widthDays: 1,
          muted: dow >= 5,
        });
      }
    }
    return segs;
  }, [viewport, zoom]);

  // Today marker offset
  const today = startOfDay(new Date());
  const todayOffsetDays = Math.round((today.getTime() - viewport.start.getTime()) / DAY_MS);
  const showToday = todayOffsetDays >= 0 && todayOffsetDays <= viewport.spanDays;

  function panBy(deltaDays: number) {
    setAnchor(prev => addDays(prev, deltaDays));
  }
  const panUnit = zoom === "month" ? 30 : zoom === "week" ? 7 : 1;

  return (
    <Layout>
      <div className="w-[94%] mx-auto py-4 space-y-4 min-h-[calc(100vh-3.5rem)] flex flex-col">
        <PageHeader
          title="Timeline campagne"
          subtitle="Vista per talent — chi sta lavorando su cosa, quando"
          actions={
            <div className="flex items-center gap-2">
              <Link href="/campaigns">
                <Button variant="outline" data-testid="button-back-campaigns">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Torna alle campagne
                </Button>
              </Link>
            </div>
          }
        />

        <Card className="bg-white/80 backdrop-blur-sm flex-1 flex flex-col">
          <CardContent className="p-3 space-y-3 flex-1 flex flex-col">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 px-1">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-primary" />
                <span className="font-medium">{active.length} {active.length === 1 ? "campagna attiva" : "campagne attive"}</span>
                <span className="text-muted-foreground text-sm">su {talentRows.length} {talentRows.length === 1 ? "talent" : "talent"}</span>
              </div>

              <div className="flex items-center gap-1 ml-auto">
                <Button size="sm" variant="ghost" onClick={() => panBy(-panUnit)} data-testid="button-pan-prev"><ChevronLeft className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" onClick={() => setAnchor(startOfDay(new Date()))} data-testid="button-pan-today">Oggi</Button>
                <Button size="sm" variant="ghost" onClick={() => panBy(panUnit)} data-testid="button-pan-next"><ChevronRight className="h-4 w-4" /></Button>
              </div>

              <div className="inline-flex rounded-md border bg-muted/30 p-0.5" role="group">
                {(["month", "week", "day"] as Zoom[]).map(z => (
                  <button
                    key={z}
                    onClick={() => setZoom(z)}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${zoom === z ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    data-testid={`button-zoom-${z}`}
                  >
                    {ZOOM_LABEL[z]}
                  </button>
                ))}
              </div>
            </div>

            {skipped > 0 && (
              <div className="text-xs text-muted-foreground bg-muted/30 border rounded px-2 py-1 mx-1">
                {skipped} campagn{skipped === 1 ? "a" : "e"} attiv{skipped === 1 ? "a" : "e"} {skipped === 1 ? "non è" : "non sono"} visibil{skipped === 1 ? "e" : "i"}: manca data di inizio o di fine.
              </div>
            )}

            {/* Timeline grid */}
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : talentRows.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                Nessuna campagna attiva con date impostate.<br />
                Apri una campagna, clicca <strong>Modifica</strong> e imposta data di inizio e fine per vederla qui.
              </div>
            ) : (
              <div className="border rounded-md overflow-hidden flex-1 flex flex-col">
                <div ref={scrollRef} className="overflow-x-auto flex-1">
                  <div style={{ width: `${TALENT_COL_PX + totalPx}px`, minWidth: "100%" }}>
                    {/* Header row: months */}
                    <div className="flex border-b bg-muted/30 sticky top-0 z-20">
                      <div
                        style={{ width: `${TALENT_COL_PX}px` }}
                        className="shrink-0 px-3 py-1 text-xs font-semibold text-muted-foreground border-r flex items-center"
                      >
                        Talent
                      </div>
                      <div className="relative" style={{ width: `${totalPx}px`, height: `${HEADER_H_MONTHS + HEADER_H_SUB}px` }}>
                        {/* Month strip */}
                        <div className="absolute left-0 top-0 right-0" style={{ height: `${HEADER_H_MONTHS}px` }}>
                          {monthSegs.map((m, i) => (
                            <div
                              key={i}
                              className="absolute top-0 h-full text-[11px] font-semibold text-foreground border-l border-border/60 pl-1.5 flex items-center bg-muted/20"
                              style={{ left: `${m.offsetDays * pxPerDay}px`, width: `${m.widthDays * pxPerDay}px` }}
                            >
                              {m.label}
                            </div>
                          ))}
                        </div>
                        {/* Sub strip */}
                        <div
                          className="absolute left-0 right-0 border-t"
                          style={{ top: `${HEADER_H_MONTHS}px`, height: `${HEADER_H_SUB}px` }}
                        >
                          {subSegs.map((s, i) => (
                            <div
                              key={i}
                              className={`absolute top-0 h-full text-[10px] border-l border-border/40 flex items-center justify-center overflow-hidden ${s.muted ? "bg-muted/30 text-muted-foreground/60" : "text-muted-foreground"}`}
                              style={{ left: `${s.offsetDays * pxPerDay}px`, width: `${s.widthDays * pxPerDay}px` }}
                            >
                              {s.widthDays * pxPerDay >= 16 ? s.label : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Talent rows */}
                    {talentRows.map((tr, rowIdx) => (
                      <div key={tr.id} className="flex border-b last:border-b-0 hover:bg-muted/10">
                        <div
                          style={{ width: `${TALENT_COL_PX}px`, minHeight: `${ROW_H}px` }}
                          className="shrink-0 px-3 py-2 border-r flex items-center"
                          data-testid={`timeline-talent-${tr.id}`}
                        >
                          <Link href={tr.id > 0 ? `/talents/${tr.id}` : "#"}>
                            <span className={`text-sm font-medium truncate ${tr.id > 0 ? "hover:underline cursor-pointer" : "text-muted-foreground italic"}`}>
                              {tr.name}
                            </span>
                          </Link>
                        </div>
                        <div className="relative" style={{ width: `${totalPx}px`, height: `${ROW_H}px` }}>
                          {/* Vertical grid lines */}
                          {monthSegs.map((m, i) => (
                            <div
                              key={`m-${i}`}
                              className="absolute top-0 bottom-0 border-l border-border/30"
                              style={{ left: `${m.offsetDays * pxPerDay}px` }}
                            />
                          ))}
                          {/* Weekend shading on day/week zoom */}
                          {(zoom === "day" || zoom === "week") && subSegs.map((s, i) => s.muted ? (
                            <div
                              key={`wk-${i}`}
                              className="absolute top-0 bottom-0 bg-muted/20 pointer-events-none"
                              style={{ left: `${s.offsetDays * pxPerDay}px`, width: `${s.widthDays * pxPerDay}px` }}
                            />
                          ) : null)}
                          {/* Today marker */}
                          {showToday && rowIdx === 0 && (
                            <div
                              className="absolute top-0 z-10 pointer-events-none"
                              style={{ left: `${todayOffsetDays * pxPerDay}px`, height: `${ROW_H * talentRows.length}px` }}
                            >
                              <div className="w-px h-full bg-red-500/70" />
                              <div className="absolute -top-5 -translate-x-1/2 px-1.5 py-0.5 rounded bg-red-500 text-white text-[10px] font-semibold whitespace-nowrap">
                                Oggi
                              </div>
                            </div>
                          )}
                          {showToday && rowIdx > 0 && (
                            <div
                              className="absolute top-0 bottom-0 w-px bg-red-500/40 pointer-events-none z-10"
                              style={{ left: `${todayOffsetDays * pxPerDay}px` }}
                            />
                          )}
                          {/* Campaign bars for this talent */}
                          {tr.campaigns.map((c, ci) => {
                            const startDays = Math.round((c._start.getTime() - viewport.start.getTime()) / DAY_MS);
                            const endDays = Math.round((c._end.getTime() - viewport.start.getTime()) / DAY_MS) + 1;
                            // Skip if completely outside viewport
                            if (endDays < 0 || startDays > viewport.spanDays) return null;
                            const clampedStart = Math.max(0, startDays);
                            const clampedEnd = Math.min(viewport.spanDays, endDays);
                            const left = clampedStart * pxPerDay;
                            const width = Math.max(6, (clampedEnd - clampedStart) * pxPerDay);
                            const status = c.status as CampaignStatus;
                            const overflowL = startDays < 0;
                            const overflowR = endDays > viewport.spanDays;
                            return (
                              <Link key={`${c.id}-${ci}`} href={`/campaigns/${c.id}`}>
                                <div
                                  className={`absolute text-white px-2 py-1 flex flex-col justify-center cursor-pointer shadow-sm transition-colors leading-tight ${STATUS_BAR[status]} ${overflowL ? "rounded-l-none" : "rounded-l-md"} ${overflowR ? "rounded-r-none" : "rounded-r-md"}`}
                                  style={{
                                    left: `${left}px`,
                                    width: `${width}px`,
                                    top: `6px`,
                                    height: `${ROW_H - 12}px`,
                                  }}
                                  title={`${c.brandName ? `${c.brandName} — ` : ""}${c.name} · ${formatDate(c._start)} → ${formatDate(c._end)}`}
                                  data-testid={`timeline-bar-${c.id}-talent-${tr.id}`}
                                >
                                  {c.brandName && (
                                    <span className="text-[11px] font-bold uppercase tracking-wide break-words leading-tight">
                                      {c.brandName}
                                    </span>
                                  )}
                                  <span className="text-[11px] font-medium opacity-95 break-words leading-tight">
                                    {c.name}
                                  </span>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 px-2 pt-1 text-xs text-muted-foreground">
              <span>Legenda:</span>
              {(["briefing", "production", "publishing"] as CampaignStatus[]).map(s => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className={`inline-block w-3 h-3 rounded-sm ${STATUS_BAR[s]}`} />
                  {CAMPAIGN_STATUS_LABELS[s]}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-px h-3 bg-red-500" />
                Oggi
              </span>
              <span className="ml-auto">
                Le campagne <strong>chiuse</strong> non vengono mostrate.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
