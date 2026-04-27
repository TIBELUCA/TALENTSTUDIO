import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Loader2, ArrowLeft, Box, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { getMachineImageUrl, getBaseCode } from "@/lib/machineGrouping";
import { getLocalizedField } from "@/lib/i18n/localize";
import { CatalogLanguageSwitcher, useCatalogLanguage } from "@/components/CatalogLanguageSwitcher";

export default function MachineSubgroupView() {
  const [, params] = useRoute("/machines/family/:family/group/:prefix");
  const family = params?.family ? decodeURIComponent(params.family) : "";
  const prefix = params?.prefix ? decodeURIComponent(params.prefix) : "";
  const [catalogLang, setCatalogLang] = useCatalogLanguage();

  const { data: allMachines, isLoading } = useQuery<any[]>({
    queryKey: ["/api/machines/family", family],
    queryFn: () => fetch(`/api/machines/family/${encodeURIComponent(family)}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!family,
  });

  const machines = useMemo(() => {
    if (!allMachines || !prefix) return [];
    return allMachines.filter(m => getBaseCode(m.machineCode) === prefix.toUpperCase());
  }, [allMachines, prefix]);

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              <Layers className="w-6 h-6 text-primary/60" />
              {prefix}
            </span>
          }
          subtitle={`${machines.length} variant${machines.length !== 1 ? "s" : ""} in ${family}`}
          actions={
            <Link href={`/machines/family/${encodeURIComponent(family)}`}>
              <Button variant="outline" data-testid="button-back-family">
                <ArrowLeft className="mr-2 h-4 w-4" /> {family}
              </Button>
            </Link>
          }
        />

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        <CatalogLanguageSwitcher value={catalogLang} onChange={setCatalogLang} />

        {!isLoading && machines.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Box className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">No machines found in this group</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {machines.map((m: any) => (
            <Link key={m.id} href={`/machines/${m.id}/detail`}>
              <div
                className="group rounded-xl border bg-card shadow-sm overflow-hidden cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all duration-200"
                data-testid={`card-machine-${m.id}`}
              >
                <div className="aspect-[4/3] bg-muted/30 flex items-center justify-center overflow-hidden">
                  {getMachineImageUrl(m.imageUrl) ? (
                    <img
                      src={getMachineImageUrl(m.imageUrl)!}
                      alt={m.name}
                      className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-200"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <Box className="w-12 h-12 text-muted-foreground/30" />
                  )}
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm leading-tight">{getLocalizedField(m.titles, m.name, catalogLang)}</h3>
                    {m.source === "manual" && (
                      <Badge variant="outline" className="shrink-0 text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                        Special
                      </Badge>
                    )}
                  </div>
                  {m.machineCode && (
                    <p className="text-xs font-mono text-muted-foreground">{m.machineCode}</p>
                  )}
                  {(m.description || m.descriptions) && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{getLocalizedField(m.descriptions, m.description, catalogLang)}</p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm font-bold text-primary">
                      €{parseFloat(m.basePrice).toLocaleString()}
                    </span>
                    {m.options?.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {m.options.length} option{m.options.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
