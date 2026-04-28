import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
            <div className="flex items-center gap-2">
              <Link href="/campaigns/timeline">
                <Button variant="outline" data-testid="button-open-timeline">
                  <CalendarRange className="mr-2 h-4 w-4" /> Apri timeline
                </Button>
              </Link>
              <Link href="/quotes">
                <Button variant="outline" data-testid="button-go-quotes">
                  <FileText className="mr-2 h-4 w-4" /> Vai ai preventivi
                </Button>
              </Link>
            </div>
          }
        />

        <div className="text-xs text-muted-foreground bg-muted/30 border rounded-md px-3 py-2">
          Suggerimento: le campagne nascono da preventivi accettati. Apri un preventivo, segnalo come <strong>Accettato</strong> e clicca <strong>Crea campagna</strong>.
        </div>

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

