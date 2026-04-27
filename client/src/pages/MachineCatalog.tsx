import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { Loader2, Wrench, Sparkles, Box, Search, X, ArrowRight, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getLocalizedField } from "@/lib/i18n/localize";
import { CatalogLanguageSwitcher, useCatalogLanguage } from "@/components/CatalogLanguageSwitcher";

interface FamilyInfo {
  family: string;
  count: number;
}

interface MachineInfo {
  id: number;
  name: string;
  machineCode: string | null;
  macroType: string | null;
  basePrice: string;
  description: string;
  titles?: Record<string, string> | null;
  descriptions?: Record<string, string> | null;
}

const FAMILY_COLORS: Record<string, string> = {
  "SPECIAL": "from-amber-400 to-orange-600",
  "default": "from-slate-500 to-slate-700",
};

const FAMILY_GRADIENTS = [
  "from-blue-500 to-indigo-700",
  "from-emerald-500 to-teal-700",
  "from-violet-500 to-purple-700",
  "from-rose-500 to-pink-700",
  "from-sky-500 to-cyan-700",
  "from-orange-500 to-red-600",
  "from-lime-500 to-green-700",
  "from-fuchsia-500 to-purple-800",
];

function getFamilyGradient(family: string, index: number): string {
  if (FAMILY_COLORS[family]) return FAMILY_COLORS[family];
  return FAMILY_GRADIENTS[index % FAMILY_GRADIENTS.length];
}

export default function MachineCatalog() {
  const [catalogLang, setCatalogLang] = useCatalogLanguage();
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const { data: families, isLoading } = useQuery<FamilyInfo[]>({
    queryKey: ["/api/machines/families"],
  });

  const { data: allMachines } = useQuery<MachineInfo[]>({
    queryKey: ["/api/machines"],
    enabled: query.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const withSpecial = useMemo(() => {
    if (!families) return undefined;
    const hasSpecial = families.some(f => f.family === "SPECIAL");
    const list = hasSpecial ? [...families] : [...families, { family: "SPECIAL", count: 0 }];
    return list.sort((a, b) => {
      if (a.family === "SPECIAL") return 1;
      if (b.family === "SPECIAL") return -1;
      return a.family.localeCompare(b.family);
    });
  }, [families]);

  const filteredFamilies = useMemo(() => {
    if (!withSpecial) return undefined;
    if (!query) return withSpecial;
    return withSpecial.filter(f => f.family.toLowerCase().includes(query));
  }, [withSpecial, query]);

  const matchingMachines = useMemo(() => {
    if (!allMachines || query.length < 2) return [];
    return allMachines
      .filter(m => {
        const localName = getLocalizedField(m.titles, m.name, catalogLang).toLowerCase();
        const localDesc = getLocalizedField(m.descriptions, m.description, catalogLang).toLowerCase();
        return (
          m.name.toLowerCase().includes(query) ||
          localName.includes(query) ||
          (m.machineCode && m.machineCode.toLowerCase().includes(query)) ||
          localDesc.includes(query)
        );
      })
      .slice(0, 12);
  }, [allMachines, query, catalogLang]);

  const showMachineResults = query.length >= 2 && matchingMachines.length > 0;

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Machine Catalog"
          subtitle="Browse machines organized by family."
        />

        <div className="flex items-center gap-4 flex-wrap">
          <CatalogLanguageSwitcher value={catalogLang} onChange={setCatalogLang} />
        </div>

        <div className="relative max-w-md" data-testid="search-catalog">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search families or machines..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-9"
            data-testid="input-search-catalog"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-clear-search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {filteredFamilies && filteredFamilies.length === 0 && !showMachineResults && (
          <div className="text-center py-16 text-muted-foreground">
            <Box className="w-12 h-12 mx-auto mb-3 opacity-40" />
            {query ? (
              <>
                <p className="text-lg font-medium">No results for "{search.trim()}"</p>
                <p className="text-sm mt-1">Try a different search term.</p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium">No machines imported yet</p>
                <p className="text-sm mt-1">Import machines from an Excel file in the Machines admin page.</p>
              </>
            )}
          </div>
        )}

        {showMachineResults && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Matching machines ({matchingMachines.length}{matchingMachines.length === 12 ? "+" : ""})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {matchingMachines.map(m => (
                <Link key={m.id} href={`/machines/${m.id}/detail`}>
                  <div
                    className="group flex items-center gap-3 rounded-lg border bg-card p-3 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
                    data-testid={`card-machine-${m.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{getLocalizedField(m.titles, m.name, catalogLang)}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {m.machineCode && (
                          <span className="text-xs text-muted-foreground font-mono">{m.machineCode}</span>
                        )}
                        {m.macroType && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {m.macroType}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {filteredFamilies && filteredFamilies.length > 0 && (
          <div>
            {showMachineResults && (
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Families</h3>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredFamilies.map((f, i) => (
                <Link key={f.family} href={`/machines/family/${encodeURIComponent(f.family)}`}>
                  <div
                    className="group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:shadow-xl shadow-md"
                    data-testid={`card-family-${f.family.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <div className={`bg-gradient-to-br ${getFamilyGradient(f.family, i)} p-6 min-h-[140px] flex flex-col justify-between`}>
                      <div className="flex items-start justify-between">
                        {f.family === "SPECIAL" ? (
                          <Sparkles className="w-8 h-8 text-white/80" />
                        ) : (
                          <Wrench className="w-8 h-8 text-white/80" />
                        )}
                        <Badge className="bg-white/20 text-white border-0 backdrop-blur-sm text-xs font-bold">
                          {f.count}
                        </Badge>
                      </div>
                      <div className="mt-4">
                        <h3 className="text-white font-bold text-lg leading-tight group-hover:text-white/90 transition-colors">
                          {f.family}
                        </h3>
                        <p className="text-white/60 text-xs mt-0.5">
                          {f.count} {f.count === 1 ? "machine" : "machines"}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
              <Link href="/machines/custom">
                <div
                  className="group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:shadow-xl shadow-md"
                  data-testid="card-custom-machines"
                >
                  <div className="bg-gradient-to-br from-teal-500 to-emerald-700 p-6 min-h-[140px] flex flex-col justify-between border-2 border-dashed border-white/20">
                    <Package className="w-8 h-8 text-white/80" />
                    <div className="mt-4">
                      <h3 className="text-white font-bold text-lg leading-tight group-hover:text-white/90 transition-colors">
                        PERSONALIZZATE
                      </h3>
                      <p className="text-white/60 text-xs mt-0.5">
                        Macchine create manualmente
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
