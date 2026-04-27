import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2, ArrowLeft, BarChart3, TrendingUp, Layers,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

type StatsData = {
  byYear: { year: number; count: number }[];
  topMachines: { id: number; name: string; machine_code: string | null; macro_type: string | null; count: number }[];
  byFamily: { family: string; count: number }[];
  customers: { id: number; name: string }[];
};

export default function DrawingStatisticsPage() {
  const [yearFrom, setYearFrom] = useState<string>("");
  const [yearTo, setYearTo] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (yearFrom && yearFrom !== "all") params.set("yearFrom", yearFrom);
    if (yearTo && yearTo !== "all") params.set("yearTo", yearTo);
    if (customerId && customerId !== "all") params.set("customerId", customerId);
    return params.toString();
  }, [yearFrom, yearTo, customerId]);

  const { data, isLoading } = useQuery<StatsData>({
    queryKey: ["/api/drawing-machines/statistics", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/drawing-machines/statistics${queryParams ? "?" + queryParams : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch statistics");
      return res.json();
    },
  });

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 20 }, (_, i) => currentYear - i);

  const totalMachines = data?.byYear?.reduce((sum, y) => sum + y.count, 0) ?? 0;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/drawings">
              <Button variant="ghost" size="sm" data-testid="btn-back-drawings">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Disegni
              </Button>
            </Link>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Storico Macchine</h1>
          </div>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Da anno:</span>
                <Select value={yearFrom} onValueChange={setYearFrom}>
                  <SelectTrigger className="w-28 h-8 text-sm" data-testid="select-year-from">
                    <SelectValue placeholder="Tutti" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti</SelectItem>
                    {yearOptions.map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">A anno:</span>
                <Select value={yearTo} onValueChange={setYearTo}>
                  <SelectTrigger className="w-28 h-8 text-sm" data-testid="select-year-to">
                    <SelectValue placeholder="Tutti" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti</SelectItem>
                    {yearOptions.map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Cliente:</span>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="w-48 h-8 text-sm" data-testid="select-customer">
                    <SelectValue placeholder="Tutti" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti</SelectItem>
                    {(data?.customers ?? []).map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(yearFrom || yearTo || customerId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setYearFrom(""); setYearTo(""); setCustomerId(""); }}
                  data-testid="btn-clear-filters"
                >
                  Azzera filtri
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Caricamento...</span>
          </div>
        )}

        {!isLoading && data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card data-testid="card-by-year">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Macchine per anno
                  <Badge variant="secondary" className="ml-auto">{totalMachines} totali</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.byYear.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.byYear}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="year" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" name="Macchine" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Nessun dato disponibile</p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-top-machines">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Macchine più offerte
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topMachines.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {data.topMachines.map((m, idx) => (
                      <div key={m.id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted/50" data-testid={`row-top-machine-${m.id}`}>
                        <span className="text-xs text-muted-foreground w-6 text-right font-mono">{idx + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">{m.name}</span>
                          {m.machine_code && (
                            <span className="text-xs text-muted-foreground">{m.machine_code}</span>
                          )}
                        </div>
                        <Badge variant="secondary" className="shrink-0">{m.count}×</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Nessun dato disponibile</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2" data-testid="card-by-family">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  Ripartizione per famiglia
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.byFamily.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.byFamily} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis dataKey="family" type="category" width={150} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" name="Macchine" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Nessun dato disponibile</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
