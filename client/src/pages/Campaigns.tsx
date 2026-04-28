import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Search, Megaphone, Loader2, ChevronDown, ChevronRight, FileText, CalendarRange } from "lucide-react";
import { CAMPAIGN_STATUS_LABELS, type CampaignStatus, type Campaign } from "@shared/schema";

type Row = Campaign & { brandName: string | null; deliverablesCount: number; publishedCount: number };

const STATUS_BADGE: Record<CampaignStatus, string> = {
  briefing: "bg-amber-100 text-amber-800 border-amber-300",
  production: "bg-blue-100 text-blue-800 border-blue-300",
  publishing: "bg-purple-100 text-purple-800 border-purple-300",
  closed: "bg-green-100 text-green-800 border-green-300",
};

const STATUS_BAR: Record<CampaignStatus, string> = {
  briefing: "bg-amber-400 hover:bg-amber-500",
  production: "bg-blue-500 hover:bg-blue-600",
  publishing: "bg-purple-500 hover:bg-purple-600",
  closed: "bg-green-500 hover:bg-green-600",
};

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const DAY_MS = 86400000;

function formatEur(v: any) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v ?? 0));
}

export default function Campaigns() {
  const { data, isLoading } = useQuery<Row[]>({ queryKey: ["/api/campaigns"] });
  const [search, setSearch] = useState("");
  const currentYear = new Date().getFullYear();
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const filtered = useMemo(() => {
    const list = data ?? [];
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter(c =>
      c.name.toLowerCase().includes(s) ||
      c.code.toLowerCase().includes(s) ||
      (c.brandName ?? "").toLowerCase().includes(s)
    );
  }, [data, search]);

  const byYear = useMemo(() => {
    const m = new Map<number, Row[]>();
    for (const c of filtered) {
      const y = new Date(c.createdAt).getFullYear();
      const arr = m.get(y) ?? [];
      arr.push(c);
      m.set(y, arr);
    }
    return Array.from(m.entries()).sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-20">
        <PageHeader
          title="Campagne"
          subtitle="Esecuzione delle collaborazioni accettate"
          actions={
            <Link href="/quotes">
              <Button variant="outline" data-testid="button-go-quotes">
                <FileText className="mr-2 h-4 w-4" /> Vai ai preventivi
              </Button>
            </Link>
          }
        />

        <div className="text-xs text-muted-foreground bg-muted/30 border rounded-md px-3 py-2">
          Suggerimento: le campagne nascono da preventivi accettati. Apri un preventivo, segnalo come <strong>Accettato</strong> e clicca <strong>Crea campagna</strong>.
        </div>

        <CampaignsTimeline rows={data ?? []} isLoading={isLoading} />

        <Card className="bg-white/80 backdrop-blur-sm">
          <CardContent className="p-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca campagna, brand o codice…"
                className="pl-9"
                data-testid="input-search-campaigns"
              />
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : byYear.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Megaphone className="mx-auto h-10 w-10 mb-2 opacity-50" />
                <p>Nessuna campagna ancora.</p>
              </div>
            ) : (
              byYear.map(([year, rows]) => {
                const isCollapsed = collapsed[year] ?? (year !== currentYear);
                const yearTotal = rows.reduce((acc, r) => acc + Number(r.totalValueEur || 0), 0);
                return (
                  <div key={year} className="space-y-2">
                    <button
                      className="w-full flex items-center justify-between p-2 rounded hover:bg-muted/30"
                      onClick={() => setCollapsed(c => ({ ...c, [year]: !isCollapsed }))}
                      data-testid={`toggle-year-${year}`}
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {year} · {rows.length} campagne
                      </span>
                      <span className="text-sm text-muted-foreground">{formatEur(yearTotal)}</span>
                    </button>
                    {!isCollapsed && rows.map(c => {
                      const pct = c.deliverablesCount > 0
                        ? Math.round((c.publishedCount / c.deliverablesCount) * 100) : 0;
                      const status = c.status as CampaignStatus;
                      return (
                        <Link key={c.id} href={`/campaigns/${c.id}`}>
                          <div className="flex items-center gap-4 p-3 ml-6 border rounded-md hover-elevate cursor-pointer"
                            data-testid={`row-campaign-${c.id}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                                <Badge variant="outline" className={STATUS_BADGE[status]}>
                                  {CAMPAIGN_STATUS_LABELS[status]}
                                </Badge>
                              </div>
                              <div className="font-medium truncate" data-testid={`text-campaign-name-${c.id}`}>{c.name}</div>
                              <div className="text-sm text-muted-foreground truncate">
                                {c.brandName ?? "Brand?"} · {c.publishedCount}/{c.deliverablesCount} pubblicati
                              </div>
                              <Progress value={pct} className="h-1.5 mt-2" />
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-semibold">{formatEur(c.totalValueEur)}</div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

// =============== Horizontal timeline of active campaigns ===============
type TimelineRow = Row & { _start: Date; _end: Date };

function CampaignsTimeline({ rows, isLoading }: { rows: Row[]; isLoading: boolean }) {
  // "Active" = not closed and with both start + end dates set
  const active: TimelineRow[] = useMemo(() => {
    const out: TimelineRow[] = [];
    for (const r of rows) {
      if (r.status === "closed") continue;
      if (!r.startDate || !r.endDate) continue;
      const s = new Date(r.startDate);
      const e = new Date(r.endDate);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) continue;
      if (e.getTime() < s.getTime()) continue;
      out.push({ ...r, _start: s, _end: e });
    }
    out.sort((a, b) => a._start.getTime() - b._start.getTime());
    return out;
  }, [rows]);

  const skipped = useMemo(
    () => rows.filter(r => r.status !== "closed").length - active.length,
    [rows, active.length],
  );

  // Viewport: from start of earliest start month to end of latest end month, also include "today"
  const viewport = useMemo(() => {
    if (active.length === 0) return null;
    const starts = active.map(c => c._start.getTime());
    const ends = active.map(c => c._end.getTime());
    const today = Date.now();
    let minMs = Math.min(...starts, today);
    let maxMs = Math.max(...ends, today);
    const min = new Date(minMs);
    const max = new Date(maxMs);
    // snap to month boundaries
    const start = new Date(min.getFullYear(), min.getMonth(), 1);
    const end = new Date(max.getFullYear(), max.getMonth() + 1, 0); // last day of max month
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
    return { start, end, totalDays };
  }, [active]);

  if (isLoading) {
    return (
      <Card className="bg-white/80 backdrop-blur-sm">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }
  if (active.length === 0 || !viewport) {
    const totalNonClosed = rows.filter(r => r.status !== "closed").length;
    return (
      <Card className="bg-white/80 backdrop-blur-sm" data-testid="card-campaigns-timeline-empty">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-5 w-5 text-primary" />
            Timeline campagne attive
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          {totalNonClosed === 0 ? (
            <>Nessuna campagna attiva al momento.</>
          ) : (
            <>
              Hai {totalNonClosed} {totalNonClosed === 1 ? "campagna attiva" : "campagne attive"}, ma non
              {totalNonClosed === 1 ? " ha" : " hanno"} ancora <strong>data di inizio</strong> e <strong>data di fine</strong>.
              <br />
              Apri una campagna, clicca <strong>Modifica</strong> e imposta le date per vederla qui sulla timeline.
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // Build month tick list across viewport
  const months: { label: string; offsetDays: number; widthDays: number }[] = [];
  let cur = new Date(viewport.start);
  while (cur.getTime() <= viewport.end.getTime()) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const off = Math.round((cur.getTime() - viewport.start.getTime()) / DAY_MS);
    const wd = Math.round((Math.min(next.getTime(), viewport.end.getTime() + DAY_MS) - cur.getTime()) / DAY_MS);
    months.push({
      label: `${MESI[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}`,
      offsetDays: off,
      widthDays: wd,
    });
    cur = next;
  }

  // Pixel scale: roughly fit each month to 90px; minimum total width is the container.
  const PX_PER_DAY = 3;
  const totalPx = viewport.totalDays * PX_PER_DAY;
  const todayOffsetDays = Math.round((Date.now() - viewport.start.getTime()) / DAY_MS);
  const todayLeftPx = todayOffsetDays * PX_PER_DAY;
  const showToday = todayOffsetDays >= 0 && todayOffsetDays <= viewport.totalDays;

  const ROW_H = 36; // px

  return (
    <Card className="bg-white/80 backdrop-blur-sm" data-testid="card-campaigns-timeline">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="h-5 w-5 text-primary" />
          Timeline campagne attive
          <Badge variant="outline" className="ml-1">{active.length}</Badge>
          {skipped > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {skipped} senza date — non visibili
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto pb-3">
          <div className="relative" style={{ width: `${totalPx}px`, minWidth: "100%" }}>
            {/* Month header */}
            <div className="relative h-7 border-b bg-muted/20" style={{ width: `${totalPx}px` }}>
              {months.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full text-[11px] font-medium text-muted-foreground border-l border-border/60 pl-1.5 flex items-center"
                  style={{ left: `${m.offsetDays * PX_PER_DAY}px`, width: `${m.widthDays * PX_PER_DAY}px` }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* Rows */}
            <div className="relative" style={{ height: `${active.length * ROW_H}px` }}>
              {/* Month grid lines (vertical) */}
              {months.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-border/40"
                  style={{ left: `${m.offsetDays * PX_PER_DAY}px` }}
                />
              ))}

              {/* Today marker */}
              {showToday && (
                <div
                  className="absolute top-0 bottom-0 z-10 pointer-events-none"
                  style={{ left: `${todayLeftPx}px` }}
                  data-testid="timeline-today-marker"
                >
                  <div className="w-px h-full bg-red-500/70" />
                  <div className="absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded bg-red-500 text-white text-[10px] font-semibold whitespace-nowrap">
                    Oggi
                  </div>
                </div>
              )}

              {/* Bars */}
              {active.map((c, idx) => {
                const startOffDays = Math.max(
                  0,
                  Math.round((c._start.getTime() - viewport.start.getTime()) / DAY_MS),
                );
                const durationDays = Math.max(
                  1,
                  Math.round((c._end.getTime() - c._start.getTime()) / DAY_MS) + 1,
                );
                const left = startOffDays * PX_PER_DAY;
                const width = durationDays * PX_PER_DAY;
                const status = c.status as CampaignStatus;
                return (
                  <Link key={c.id} href={`/campaigns/${c.id}`}>
                    <div
                      className={`absolute rounded-md text-white text-xs px-2 flex items-center cursor-pointer shadow-sm transition-colors ${STATUS_BAR[status]}`}
                      style={{
                        left: `${left}px`,
                        width: `${Math.max(width, 28)}px`,
                        top: `${idx * ROW_H + 4}px`,
                        height: `${ROW_H - 8}px`,
                      }}
                      title={`${c.name}${c.brandName ? ` — ${c.brandName}` : ""} · ${formatDate(c._start)} → ${formatDate(c._end)}`}
                      data-testid={`timeline-bar-${c.id}`}
                    >
                      <span className="truncate font-medium">{c.name}</span>
                      {c.brandName && (
                        <span className="ml-1.5 truncate opacity-90 hidden sm:inline">· {c.brandName}</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-t text-xs text-muted-foreground">
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
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(d: Date) {
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
}
