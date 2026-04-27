import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  TrendingUp,
  Layers,
  Star,
  Brain,
  Activity,
} from "lucide-react";
import type {
  MachineUsageStat,
  OptionUsageStat,
  PricingDistribution,
  OfferPattern,
  SalesInsight,
  SalesBrainData,
} from "./types";

function ConfidenceBadge({ value }: { value: string | number | null }) {
  if (value == null) return null;
  const pct = Math.round(Number(value) * 100);
  const variant = pct >= 75 ? "default" : pct >= 50 ? "secondary" : "destructive";
  return (
    <Badge variant={variant} data-testid="badge-confidence">
      {pct}%
    </Badge>
  );
}

function formatCurrency(val: string | null | undefined): string {
  if (!val) return "-";
  const n = Number(val);
  if (isNaN(n)) return val;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function TopMachinesSection({ stats }: { stats: MachineUsageStat[] }) {
  if (stats.length === 0) {
    return (
      <Card data-testid="sales-brain-top-machines-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" />
            Top Machines
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" data-testid="text-empty-top-machines">
            No machine usage data available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...stats].sort((a, b) => b.usageCount - a.usageCount);
  const maxCount = sorted[0]?.usageCount ?? 1;

  return (
    <Card data-testid="sales-brain-top-machines-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4 text-primary" />
          Top Machines
          <Badge variant="secondary" className="ml-auto">{stats.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.slice(0, 10).map((stat, idx) => (
          <div key={stat.machineId} className="space-y-1" data-testid={`top-machine-${stat.machineId}`}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-xs text-muted-foreground w-4 shrink-0">{idx + 1}.</span>
                <span className="truncate font-medium" data-testid={`text-machine-name-${stat.machineId}`}>
                  {stat.machineName}
                </span>
                {stat.macroType && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {stat.macroType}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground" data-testid={`text-usage-count-${stat.machineId}`}>
                  {stat.usageCount}x
                </span>
                <span className="text-xs font-medium" data-testid={`text-avg-price-${stat.machineId}`}>
                  {formatCurrency(stat.avgPrice)}
                </span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${(stat.usageCount / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PricingRangeSection({ distributions }: { distributions: PricingDistribution[] }) {
  if (distributions.length === 0) {
    return (
      <Card data-testid="sales-brain-pricing-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" />
            Pricing Ranges
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" data-testid="text-empty-pricing">
            No pricing data available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="sales-brain-pricing-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-primary" />
          Pricing Ranges
          <Badge variant="secondary" className="ml-auto">{distributions.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {distributions.map((dist) => {
          const min = Number(dist.minPrice ?? 0);
          const max = Number(dist.maxPrice ?? 0);
          const avg = Number(dist.avgPrice ?? 0);
          const range = max - min || 1;
          const avgPosition = ((avg - min) / range) * 100;

          return (
            <div key={dist.machineId} className="border rounded-md p-2.5 space-y-2" data-testid={`pricing-dist-${dist.machineId}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate" data-testid={`text-pricing-machine-${dist.machineId}`}>
                  {dist.machineName}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0" data-testid={`text-sample-count-${dist.machineId}`}>
                  {dist.sampleCount} samples
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                <div className="absolute inset-y-0 bg-primary/30 rounded-full" style={{ left: '0%', right: '0%' }} />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary border border-background"
                  style={{ left: `${Math.min(Math.max(avgPosition, 5), 95)}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span data-testid={`text-min-price-${dist.machineId}`}>Min: {formatCurrency(dist.minPrice)}</span>
                <span className="font-medium text-foreground" data-testid={`text-avg-price-${dist.machineId}`}>
                  Avg: {formatCurrency(dist.avgPrice)}
                </span>
                <span data-testid={`text-max-price-${dist.machineId}`}>Max: {formatCurrency(dist.maxPrice)}</span>
              </div>
              {dist.medianPrice && (
                <div className="text-[10px] text-muted-foreground text-center" data-testid={`text-median-price-${dist.machineId}`}>
                  Median: {formatCurrency(dist.medianPrice)}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CommonConfigsSection({ patterns }: { patterns: OfferPattern[] }) {
  if (patterns.length === 0) {
    return (
      <Card data-testid="sales-brain-configs-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4 text-primary" />
            Common Configurations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" data-testid="text-empty-configs">
            No configuration patterns detected yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const typeLabels: Record<string, string> = {
    machine_combo: "Machine Combo",
    option_bundle: "Option Bundle",
    preset_group: "Preset Group",
  };

  const typeIcons: Record<string, string> = {
    machine_combo: "text-blue-500 dark:text-blue-400",
    option_bundle: "text-violet-500 dark:text-violet-400",
    preset_group: "text-emerald-500 dark:text-emerald-400",
  };

  const sorted = [...patterns].sort((a, b) => b.frequency - a.frequency);

  return (
    <Card data-testid="sales-brain-configs-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="h-4 w-4 text-primary" />
          Common Configurations
          <Badge variant="secondary" className="ml-auto">{patterns.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.slice(0, 8).map((pattern) => {
          const data = pattern.patternData;
          const names: string[] = (data.names as string[]) ?? (data.items as string[]) ?? [];
          const description = (data.description as string) ?? null;

          return (
            <div key={pattern.id} className="border rounded-md p-2.5 space-y-1.5" data-testid={`pattern-${pattern.id}`}>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className={`text-[10px] ${typeIcons[pattern.patternType] ?? ""}`}>
                  {typeLabels[pattern.patternType] ?? pattern.patternType}
                </Badge>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground" data-testid={`text-frequency-${pattern.id}`}>
                    {pattern.frequency}x seen
                  </span>
                  <ConfidenceBadge value={pattern.confidence} />
                </div>
              </div>
              {names.length > 0 && (
                <div className="flex flex-wrap gap-1" data-testid={`list-pattern-items-${pattern.id}`}>
                  {names.map((name, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {name}
                    </Badge>
                  ))}
                </div>
              )}
              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function OptionPopularitySection({ options }: { options: OptionUsageStat[] }) {
  if (options.length === 0) {
    return (
      <Card data-testid="sales-brain-options-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Star className="h-4 w-4 text-primary" />
            Option Popularity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" data-testid="text-empty-options">
            No option usage data available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...options].sort((a, b) => b.usageCount - a.usageCount);
  const maxCount = sorted[0]?.usageCount ?? 1;

  return (
    <Card data-testid="sales-brain-options-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Star className="h-4 w-4 text-primary" />
          Option Popularity
          <Badge variant="secondary" className="ml-auto">{options.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.slice(0, 10).map((opt) => (
          <div key={opt.id} className="space-y-1" data-testid={`option-stat-${opt.id}`}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium" data-testid={`text-option-name-${opt.id}`}>
                {opt.optionName}
              </span>
              <span className="text-xs text-muted-foreground shrink-0" data-testid={`text-option-usage-${opt.id}`}>
                {opt.usageCount}x
              </span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/60"
                style={{ width: `${(opt.usageCount / maxCount) * 100}%` }}
              />
            </div>
            {opt.coOccurrenceOptionIds && opt.coOccurrenceOptionIds.length > 0 && (
              <p className="text-[10px] text-muted-foreground" data-testid={`text-cooccurrence-${opt.id}`}>
                Often paired with {opt.coOccurrenceOptionIds.length} other option{opt.coOccurrenceOptionIds.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function InsightsSummarySection({ insights }: { insights: SalesInsight[] }) {
  if (insights.length === 0) {
    return (
      <Card data-testid="sales-brain-insights-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Brain className="h-4 w-4 text-primary" />
            Insights Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" data-testid="text-empty-insights">
            No insights computed yet. Run a refresh to generate insights.
          </p>
        </CardContent>
      </Card>
    );
  }

  const typeLabels: Record<string, string> = {
    top_machines: "Top Machines",
    pricing_trend: "Pricing Trend",
    common_configs: "Common Configs",
    sector_recommendation: "Sector Recommendation",
  };

  const typeColors: Record<string, string> = {
    top_machines: "text-blue-500 dark:text-blue-400",
    pricing_trend: "text-green-500 dark:text-green-400",
    common_configs: "text-violet-500 dark:text-violet-400",
    sector_recommendation: "text-amber-500 dark:text-amber-400",
  };

  return (
    <Card data-testid="sales-brain-insights-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Brain className="h-4 w-4 text-primary" />
          Insights Summary
          <Badge variant="secondary" className="ml-auto">{insights.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {insights.map((insight) => {
          const data = insight.insightData;
          const title = (data.title as string) ?? typeLabels[insight.insightType] ?? insight.insightType;
          const summary = (data.summary as string) ?? (data.description as string) ?? null;
          const bullets: string[] = (data.bullets as string[]) ?? (data.items as string[]) ?? [];

          return (
            <div key={insight.id} className="border rounded-md p-2.5 space-y-1.5" data-testid={`insight-${insight.id}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Activity className={`h-3.5 w-3.5 shrink-0 ${typeColors[insight.insightType] ?? "text-primary"}`} />
                  <span className="text-sm font-medium truncate" data-testid={`text-insight-title-${insight.id}`}>
                    {title}
                  </span>
                </div>
                <ConfidenceBadge value={insight.confidence} />
              </div>
              {summary && (
                <p className="text-xs text-muted-foreground" data-testid={`text-insight-summary-${insight.id}`}>
                  {summary}
                </p>
              )}
              {bullets.length > 0 && (
                <ul className="space-y-0.5" data-testid={`list-insight-bullets-${insight.id}`}>
                  {bullets.map((b, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="shrink-0 mt-1 h-1 w-1 rounded-full bg-muted-foreground/50" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
              {insight.validUntil && (
                <p className="text-[10px] text-muted-foreground">
                  Valid until: {new Date(insight.validUntil).toLocaleDateString()}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function SalesBrainLoadingSkeleton() {
  return (
    <div className="space-y-3" data-testid="sales-brain-loading">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SalesBrainEmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 p-6 text-center" data-testid="sales-brain-empty">
      <Brain className="h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground" data-testid="text-sales-brain-empty">
        No sales intelligence data available. Insights are generated as offers are created.
      </p>
    </div>
  );
}

export interface SalesBrainCardProps {
  data: SalesBrainData | null;
  isLoading?: boolean;
}

export function SalesBrainCard({ data, isLoading = false }: SalesBrainCardProps) {
  if (isLoading) {
    return <SalesBrainLoadingSkeleton />;
  }

  if (!data) {
    return <SalesBrainEmptyState />;
  }

  const hasAnyData =
    data.insights.length > 0 ||
    data.machineStats.length > 0 ||
    data.optionStats.length > 0 ||
    data.pricingDistributions.length > 0 ||
    data.patterns.length > 0;

  if (!hasAnyData) {
    return <SalesBrainEmptyState />;
  }

  return (
    <div className="space-y-3" data-testid="sales-brain-card">
      <InsightsSummarySection insights={data.insights} />
      <TopMachinesSection stats={data.machineStats} />
      <PricingRangeSection distributions={data.pricingDistributions} />
      <CommonConfigsSection patterns={data.patterns} />
      <OptionPopularitySection options={data.optionStats} />
    </div>
  );
}
