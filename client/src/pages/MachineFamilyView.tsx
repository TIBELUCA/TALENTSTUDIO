import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Loader2, ArrowLeft, Plus, Box, Sparkles, Layers, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useMemo } from "react";
import { getMachineImageUrl, computeSubgroups } from "@/lib/machineGrouping";
import { getLocalizedField } from "@/lib/i18n/localize";
import { CatalogLanguageSwitcher, useCatalogLanguage } from "@/components/CatalogLanguageSwitcher";

const SUBGROUP_GRADIENTS = [
  "from-blue-500/80 to-indigo-600/80",
  "from-emerald-500/80 to-teal-600/80",
  "from-violet-500/80 to-purple-600/80",
  "from-rose-500/80 to-pink-600/80",
  "from-sky-500/80 to-cyan-600/80",
  "from-orange-500/80 to-amber-600/80",
  "from-lime-500/80 to-green-600/80",
  "from-fuchsia-500/80 to-purple-700/80",
];

export default function MachineFamilyView() {
  const [, params] = useRoute("/machines/family/:family");
  const family = params?.family ? decodeURIComponent(params.family) : "";
  const { isMaster, features } = useAuth();
  const [catalogLang, setCatalogLang] = useCatalogLanguage();

  const { data: machines, isLoading } = useQuery<any[]>({
    queryKey: ["/api/machines/family", family],
    queryFn: () => fetch(`/api/machines/family/${encodeURIComponent(family)}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!family,
  });

  const { subgroups, ungrouped } = useMemo(() => {
    if (!machines) return { subgroups: [], ungrouped: [] };
    return computeSubgroups(machines);
  }, [machines]);

  const isSpecial = family === "SPECIAL";
  const totalCount = machines?.length ?? 0;

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              {isSpecial && <Sparkles className="w-6 h-6 text-amber-500" />}
              {family}
            </span>
          }
          subtitle={`${totalCount} machine${totalCount !== 1 ? "s" : ""} in this family`}
          actions={
            <div className="flex gap-2">
              <Link href="/machines/catalog">
                <Button variant="outline" data-testid="button-back-catalog">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Catalog
                </Button>
              </Link>
              {isSpecial && (isMaster || features?.canManageSpecialMachines) && (
                <Link href="/machines/special/new">
                  <Button data-testid="button-add-special">
                    <Plus className="mr-2 h-4 w-4" /> Add Special Machine
                  </Button>
                </Link>
              )}
            </div>
          }
        />

        <CatalogLanguageSwitcher value={catalogLang} onChange={setCatalogLang} />

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {machines && machines.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Box className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">No machines in this family</p>
            {isSpecial && isMaster && (
              <p className="text-sm mt-1">Click "Add Special Machine" to create one.</p>
            )}
          </div>
        )}

        {subgroups.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              Model Groups
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {subgroups.map((sg, i) => (
                <Link key={sg.prefix} href={`/machines/family/${encodeURIComponent(family)}/group/${encodeURIComponent(sg.prefix)}`}>
                  <div
                    className="group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:shadow-xl shadow-md"
                    data-testid={`card-subgroup-${sg.prefix.toLowerCase()}`}
                  >
                    <div className="relative min-h-[130px] flex flex-col justify-between">
                      {sg.representativeImage && getMachineImageUrl(sg.representativeImage) ? (
                        <div className="absolute inset-0">
                          <img
                            src={getMachineImageUrl(sg.representativeImage)!}
                            alt={sg.prefix}
                            className="w-full h-full object-cover opacity-25"
                          />
                        </div>
                      ) : null}
                      <div className={`absolute inset-0 bg-gradient-to-br ${SUBGROUP_GRADIENTS[i % SUBGROUP_GRADIENTS.length]}`} />
                      <div className="relative p-4 flex flex-col justify-between h-full min-h-[130px]">
                        <div className="flex items-start justify-between">
                          <Layers className="w-6 h-6 text-white/70" />
                          <Badge className="bg-white/20 text-white border-0 backdrop-blur-sm text-xs font-bold">
                            {sg.machines.length}
                          </Badge>
                        </div>
                        <div className="mt-auto">
                          <h3 className="text-white font-bold text-lg leading-tight">{sg.prefix}</h3>
                          <p className="text-white/60 text-xs mt-0.5 flex items-center gap-1">
                            {sg.machines.length} variant{sg.machines.length !== 1 ? "s" : ""}
                            <ChevronRight className="w-3 h-3" />
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {ungrouped.length > 0 && (
          <div>
            {subgroups.length > 0 && (
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Individual Machines
              </h3>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {ungrouped.map((m: any) => (
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
        )}

      </div>
    </Layout>
  );
}
