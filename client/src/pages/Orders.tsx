import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search, ClipboardList, Building2, FileText, Loader2, ChevronRight,
  Trash2, ShieldCheck, FolderOpen, FolderClosed, RotateCcw, XCircle, Info,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format } from "date-fns";
import { Link } from "wouter";
import { useLanguage } from "@/lib/i18n/LanguageContext";

function MiniTimeline({ timeline }: { timeline: any[] | undefined | null }) {
  const { t } = useLanguage();
  if (!timeline || timeline.length === 0) return null;

  const sorted = [...timeline].sort((a, b) => {
    const da = a.plannedDate || a.actualDate || "9999";
    const db2 = b.plannedDate || b.actualDate || "9999";
    if (da === db2) return 0;
    if (da === "9999") return 1;
    if (db2 === "9999") return -1;
    return da.localeCompare(db2);
  });

  const total = sorted.length;
  const completed = sorted.filter(e => e.status === "completed").length;

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return format(new Date(d), "dd/MM/yy"); } catch { return "—"; }
  };

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-[2px] h-[6px] rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
          {sorted.map((evt, idx) => {
            const isCompleted = evt.status === "completed";
            const isInProgress = evt.status === "in_progress";
            return (
              <div
                key={evt.id || idx}
                className={`flex-1 h-full ${
                  isCompleted ? "bg-green-500" : isInProgress ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"
                }`}
                title={evt.label}
              />
            );
          })}
        </div>
        <span className="text-[10px] text-muted-foreground font-mono shrink-0">{completed}/{total}</span>
      </div>
      <div className="flex gap-[2px]">
        {sorted.map((evt, idx) => {
          const dateStr = evt.actualDate || evt.plannedDate;
          return (
            <div key={evt.id || idx} className="flex-1 min-w-0 text-center">
              <p className="text-[9px] leading-tight truncate text-muted-foreground font-bold">{evt.label || `${t("orders.phase")} ${idx + 1}`}</p>
              <p className="font-mono text-[#000000] font-extrabold text-[10px]">{fmtDate(dateStr)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmationBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  const conf = status ?? "pending";
  if (conf === "confirmed") {
    return (
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <ShieldCheck className="w-3 h-3 mr-0.5" /> {t("orders.confirmed")}
      </Badge>
    );
  }
  if (conf === "revision_requested") {
    return (
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
        <RotateCcw className="w-3 h-3 mr-0.5" /> {t("orders.revision")}
      </Badge>
    );
  }
  if (conf === "rejected") {
    return (
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <XCircle className="w-3 h-3 mr-0.5" /> {t("orders.rejected")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      <ShieldCheck className="w-3 h-3 mr-0.5" /> {t("orders.pending")}
    </Badge>
  );
}

function OrderCard({ order }: { order: any }) {
  const timeline = order.logistics?.timeline;
  return (
    <Link href={`/orders/${order.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer border-border" data-testid={`card-order-${order.id}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-mono text-[20px] font-extrabold" data-testid={`text-job-number-${order.id}`}>{order.jobNumber}</span>
                <ConfirmationBadge status={order.confirmationStatus} />
              </div>
              <div className="flex items-center gap-3 text-sm text-[#2d323b]">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="truncate" data-testid={`text-customer-${order.id}`}>{order.customerName || "—"}</span>
                </span>
                {order.offerRef && (
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    <span className="truncate">{order.offerRef}</span>
                  </span>
                )}
                {(order.offerSubject || (!order.offerRef && order.notes)) && (
                  <span className="hidden md:inline truncate max-w-xs">{order.offerSubject || order.notes}</span>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right flex flex-col items-end gap-0.5 mr-1">
              {order.priceSummary?.totalOrderPrice != null && order.priceSummary.totalOrderPrice > 0 && (
                <span className="font-mono font-extrabold text-[18px]" data-testid={`text-total-${order.id}`}>
                  {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(order.priceSummary.totalOrderPrice)}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{format(new Date(order.createdAt), "dd/MM/yyyy")}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
          <MiniTimeline timeline={timeline} />
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Orders() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const currentYear = new Date().getFullYear();

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: allOrders, isLoading } = useQuery<any[]>({
    queryKey: ["/api/orders", { q: searchQuery }],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (searchQuery) p.set("q", searchQuery);
      const res = await fetch(`/api/orders?${p.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
  });

  const yearGroups = useMemo(() => {
    if (!allOrders) return [];
    const groups: Record<number, any[]> = {};
    for (const order of allOrders) {
      const jobYear = order.jobNumber?.match(/JOB-(\d{4})/)?.[1];
      const year = jobYear ? parseInt(jobYear, 10) : new Date(order.createdAt).getFullYear();
      if (!groups[year]) groups[year] = [];
      groups[year].push(order);
    }
    return Object.entries(groups)
      .map(([year, orders]) => ({ year: Number(year), orders }))
      .sort((a, b) => b.year - a.year);
  }, [allOrders]);

  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>(() => {
    return { [currentYear]: true };
  });

  const toggleYear = (year: number) => {
    setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }));
  };

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
    if (searchInput.trim()) {
      const allYears: Record<number, boolean> = {};
      yearGroups.forEach(g => { allYears[g.year] = true; });
      setExpandedYears(allYears);
    }
  }

  function handleSearchClear() {
    setSearchInput("");
    setSearchQuery("");
    setExpandedYears({ [currentYear]: true });
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-20">
        <div className="flex items-center justify-between">
          <PageHeader
            title={t("orders.title")}
            subtitle={t("orders.subtitle")}
          />
          <div className="flex items-center gap-2">
            <Link href="/orders/manual">
              <Button size="sm" className="gap-1.5" data-testid="link-add-manual-order">
                <ClipboardList className="w-4 h-4" /> {t("orders.addOrder")}
              </Button>
            </Link>
            <Link href="/orders/bin">
              <Button variant="outline" size="sm" className="gap-1.5" data-testid="link-order-bin">
                <Trash2 className="w-4 h-4" /> {t("common.bin")}
              </Button>
            </Link>
          </div>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t("orders.searchPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              data-testid="input-search-orders"
            />
          </div>
          <Button type="submit" variant="outline" data-testid="btn-search-orders">{t("common.search")}</Button>
          {searchQuery && (
            <Button type="button" variant="ghost" size="sm" onClick={handleSearchClear} data-testid="btn-clear-search">{t("common.cancel")}</Button>
          )}
        </form>

        {searchQuery && (
          <p className="text-sm text-muted-foreground">
            {t("orders.resultsFor")} "<span className="font-medium text-foreground">{searchQuery}</span>"
          </p>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : yearGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <ClipboardList className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-lg font-medium">{t("orders.noOrders")}</p>
            <p className="text-sm">
              {searchQuery
                ? t("orders.tryDifferentSearch")
                : t("orders.ordersCreatedWhen")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {yearGroups.map(({ year, orders }) => {
              const isOpen = expandedYears[year] ?? false;
              return (
                <div key={year} data-testid={`folder-year-${year}`}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                    onClick={() => toggleYear(year)}
                    data-testid={`btn-toggle-folder-${year}`}
                  >
                    {isOpen
                      ? <FolderOpen className="w-5 h-5 text-primary shrink-0" />
                      : <FolderClosed className="w-5 h-5 text-muted-foreground shrink-0" />
                    }
                    <span className="font-bold text-lg">{year}</span>
                    <Badge variant="secondary" className="text-xs px-2 py-0">{orders.length}</Badge>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground ml-auto transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="grid gap-3 mt-3 ml-4 border-l-2 border-primary/20 pl-4">
                      {orders.map((order: any) => (
                        <OrderCard key={order.id} order={order} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
