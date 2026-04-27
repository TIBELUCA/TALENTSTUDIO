import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Search, FileText, Loader2 } from "lucide-react";
import {
  QUOTE_STATUS_LABELS, type QuoteStatus,
  type TalentQuoteWithItems,
} from "@shared/schema";

const STATUS_BADGE: Record<QuoteStatus, string> = {
  draft: "bg-gray-100 text-gray-800 border-gray-300",
  sent: "bg-blue-100 text-blue-800 border-blue-300",
  accepted: "bg-green-100 text-green-800 border-green-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
};

function formatEur(v: string | number | null | undefined) {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

export default function Quotes() {
  const { data, isLoading } = useQuery<TalentQuoteWithItems[]>({
    queryKey: ["/api/quotes"],
  });
  const [tab, setTab] = useState<"all" | QuoteStatus>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const list = data ?? [];
    return list.filter(q => {
      if (tab !== "all" && q.status !== tab) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          q.referenceNumber.toLowerCase().includes(s) ||
          q.subject.toLowerCase().includes(s) ||
          (q.brandName ?? "").toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [data, tab, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, draft: 0, sent: 0, accepted: 0, rejected: 0 };
    for (const q of (data ?? [])) {
      c.all++;
      c[q.status] = (c[q.status] ?? 0) + 1;
    }
    return c;
  }, [data]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-20">
        <PageHeader
          title="Preventivi"
          subtitle="Proposte commerciali ai brand"
          actions={
            <Link href="/quotes/new">
              <Button data-testid="button-new-quote">
                <Plus className="mr-2 h-4 w-4" /> Nuovo preventivo
              </Button>
            </Link>
          }
        />

        <Card className="bg-white/80 backdrop-blur-sm">
          <CardContent className="p-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca per riferimento, oggetto o brand…"
                className="pl-9"
                data-testid="input-search-quotes"
              />
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="grid grid-cols-5">
                <TabsTrigger value="all" data-testid="tab-quote-all">Tutti ({counts.all ?? 0})</TabsTrigger>
                <TabsTrigger value="draft" data-testid="tab-quote-draft">Bozza ({counts.draft ?? 0})</TabsTrigger>
                <TabsTrigger value="sent" data-testid="tab-quote-sent">Inviato ({counts.sent ?? 0})</TabsTrigger>
                <TabsTrigger value="accepted" data-testid="tab-quote-accepted">Accettato ({counts.accepted ?? 0})</TabsTrigger>
                <TabsTrigger value="rejected" data-testid="tab-quote-rejected">Rifiutato ({counts.rejected ?? 0})</TabsTrigger>
              </TabsList>

              <TabsContent value={tab} className="mt-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="mx-auto h-10 w-10 mb-2 opacity-50" />
                    <p>Nessun preventivo trovato.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filtered.map(q => (
                      <Link key={q.id} href={`/quotes/${q.id}`}>
                        <div
                          className="flex items-center gap-4 p-3 border rounded-md hover-elevate cursor-pointer"
                          data-testid={`row-quote-${q.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs text-muted-foreground">{q.referenceNumber}</span>
                              <Badge variant="outline" className={STATUS_BADGE[q.status as QuoteStatus]}>
                                {QUOTE_STATUS_LABELS[q.status as QuoteStatus]}
                              </Badge>
                            </div>
                            <div className="font-medium truncate" data-testid={`text-quote-subject-${q.id}`}>{q.subject}</div>
                            <div className="text-sm text-muted-foreground truncate">
                              {q.brandName ?? "Brand?"} · {formatDate(q.date)} · {q.itemsCount ?? 0} voci
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold" data-testid={`text-quote-total-${q.id}`}>{formatEur(q.totalEur)}</div>
                            {q.campaignId && (
                              <Link href={`/campaigns/${q.campaignId}`}>
                                <span className="text-xs text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                                  Vai a campagna →
                                </span>
                              </Link>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
