import { Layout } from "@/components/Layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  Search, ArrowLeft, Check, Ban,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
type CatalogMachine = {
  id: number;
  name: string;
  machineCode: string | null;
  macroType: string | null;
};

type DrawingMachineEntry = {
  id: number;
  drawingId: number;
  positionLabel: string | null;
  extractedText: string;
  matchedMachineId: number | null;
  confidence: string | null;
  verified: boolean;
  notInCatalog: boolean;
  matchedMachineName: string | null;
  matchedMachineCode: string | null;
};

type DrawingGroup = {
  drawing: {
    id: number;
    pdfOriginalName: string | null;
    dwgOriginalName: string | null;
    customerId: number;
    createdAt: string;
  };
  machines: DrawingMachineEntry[];
};

function confidenceBadge(confidence: string | null, verified: boolean, notInCatalog: boolean) {
  if (notInCatalog) return <Badge variant="secondary" className="text-xs" data-testid="badge-not-catalog"><Ban className="w-3 h-3 mr-1" />Non in catalogo</Badge>;
  if (verified) return <Badge className="bg-green-600 text-white text-xs" data-testid="badge-verified"><CheckCircle2 className="w-3 h-3 mr-1" />Verificato</Badge>;
  if (!confidence) return <Badge variant="outline" className="text-xs text-muted-foreground" data-testid="badge-no-match"><XCircle className="w-3 h-3 mr-1" />Nessun match</Badge>;

  const score = parseFloat(confidence);
  if (score >= 0.8) return <Badge className="bg-green-100 text-green-800 text-xs" data-testid="badge-high"><CheckCircle2 className="w-3 h-3 mr-1" />{Math.round(score * 100)}%</Badge>;
  if (score >= 0.6) return <Badge className="bg-yellow-100 text-yellow-800 text-xs" data-testid="badge-medium"><AlertTriangle className="w-3 h-3 mr-1" />{Math.round(score * 100)}%</Badge>;
  return <Badge className="bg-red-100 text-red-800 text-xs" data-testid="badge-low"><XCircle className="w-3 h-3 mr-1" />{Math.round(score * 100)}%</Badge>;
}

function drawingName(d: { pdfOriginalName: string | null; dwgOriginalName: string | null; id: number }) {
  return d.pdfOriginalName?.replace(/\.[^.]+$/, "") ||
    d.dwgOriginalName?.replace(/\.[^.]+$/, "") ||
    `Disegno #${d.id}`;
}

export default function DrawingVerifyPage() {
  const { toast } = useToast();
  const [searchMachine, setSearchMachine] = useState<Record<number, string>>({});

  const { data: groups = [], isLoading } = useQuery<DrawingGroup[]>({
    queryKey: ["/api/drawing-machines/by-drawing"],
  });

  const { data: allMachines = [] } = useQuery<CatalogMachine[]>({
    queryKey: ["/api/drawing-machines/catalog"],
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, ...body }: { id: number; matchedMachineId?: number | null; verified?: boolean; notInCatalog?: boolean }) => {
      await apiRequest("PATCH", `/api/drawing-machines/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drawing-machines/by-drawing"] });
    },
    onError: () => {
      toast({ title: "Errore nell'aggiornamento", variant: "destructive" });
    },
  });

  const reExtract = useMutation({
    mutationFn: async (drawingId: number) => {
      await apiRequest("POST", `/api/drawings/${drawingId}/extract-machines`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drawing-machines/by-drawing"] });
      toast({ title: "Rielaborazione completata" });
    },
    onError: () => {
      toast({ title: "Errore durante la rielaborazione", variant: "destructive" });
    },
  });

  const getFilteredMachines = (entryId: number) => {
    const search = (searchMachine[entryId] ?? "").trim().toLowerCase();
    if (!search) return allMachines.slice(0, 50);
    return allMachines.filter(m =>
      m.name.toLowerCase().includes(search) ||
      (m.machineCode ?? "").toLowerCase().includes(search)
    ).slice(0, 50);
  };

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
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Verifica Associazioni</h1>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Caricamento...</span>
          </div>
        )}

        {!isLoading && groups.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p data-testid="text-no-data">Nessuna estrazione trovata. Usa il pulsante "Estrai Macchine" su un disegno per iniziare.</p>
          </div>
        )}

        {groups.map(group => (
          <Card key={group.drawing.id} className="border" data-testid={`card-drawing-group-${group.drawing.id}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm" data-testid={`text-drawing-name-${group.drawing.id}`}>
                    {drawingName(group.drawing)}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {group.machines.length} macchine estratte
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => reExtract.mutate(group.drawing.id)}
                  disabled={reExtract.isPending}
                  data-testid={`btn-reextract-${group.drawing.id}`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${reExtract.isPending ? "animate-spin" : ""}`} />
                  Rielabora
                </Button>
              </div>

              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium w-16">Pos.</th>
                      <th className="text-left px-3 py-2 font-medium">Testo estratto</th>
                      <th className="text-left px-3 py-2 font-medium">Macchina associata</th>
                      <th className="text-center px-3 py-2 font-medium w-28">Confidenza</th>
                      <th className="text-center px-3 py-2 font-medium w-36">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.machines.map(entry => (
                      <tr key={entry.id} className="border-t" data-testid={`row-machine-${entry.id}`}>
                        <td className="px-3 py-2 text-muted-foreground" data-testid={`text-position-${entry.id}`}>
                          {entry.positionLabel ?? "-"}
                        </td>
                        <td className="px-3 py-2 font-medium" data-testid={`text-extracted-${entry.id}`}>
                          {entry.extractedText}
                        </td>
                        <td className="px-3 py-2">
                          {entry.notInCatalog ? (
                            <span className="text-muted-foreground italic text-xs">Non in catalogo</span>
                          ) : (
                            <Select
                              value={entry.matchedMachineId ? String(entry.matchedMachineId) : "none"}
                              onValueChange={(val) => {
                                if (val === "none") {
                                  updateEntry.mutate({ id: entry.id, matchedMachineId: null });
                                } else {
                                  updateEntry.mutate({ id: entry.id, matchedMachineId: Number(val) });
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs" data-testid={`select-machine-${entry.id}`}>
                                <SelectValue placeholder="Seleziona macchina">
                                  {entry.matchedMachineName
                                    ? `${entry.matchedMachineCode ? entry.matchedMachineCode + " - " : ""}${entry.matchedMachineName}`
                                    : "Nessuna"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <div className="px-2 py-1">
                                  <Input
                                    placeholder="Cerca macchina..."
                                    value={searchMachine[entry.id] ?? ""}
                                    onChange={e => setSearchMachine(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                    className="h-7 text-xs"
                                    data-testid={`input-search-machine-${entry.id}`}
                                  />
                                </div>
                                <SelectItem value="none">Nessuna</SelectItem>
                                {getFilteredMachines(entry.id).map(m => (
                                  <SelectItem key={m.id} value={String(m.id)}>
                                    {m.machineCode ? `${m.machineCode} - ` : ""}{m.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {confidenceBadge(entry.confidence, entry.verified, entry.notInCatalog)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center gap-1 justify-center">
                            {!entry.verified && !entry.notInCatalog && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-green-600 hover:text-green-700"
                                onClick={() => updateEntry.mutate({ id: entry.id, verified: true })}
                                disabled={updateEntry.isPending}
                                title="Conferma"
                                data-testid={`btn-verify-${entry.id}`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {entry.verified && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-muted-foreground"
                                onClick={() => updateEntry.mutate({ id: entry.id, verified: false })}
                                disabled={updateEntry.isPending}
                                title="Annulla verifica"
                                data-testid={`btn-unverify-${entry.id}`}
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {!entry.notInCatalog && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-orange-600 hover:text-orange-700"
                                onClick={() => updateEntry.mutate({ id: entry.id, notInCatalog: true })}
                                disabled={updateEntry.isPending}
                                title="Non in catalogo"
                                data-testid={`btn-not-catalog-${entry.id}`}
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {entry.notInCatalog && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-muted-foreground"
                                onClick={() => updateEntry.mutate({ id: entry.id, notInCatalog: false })}
                                disabled={updateEntry.isPending}
                                title="Ripristina"
                                data-testid={`btn-restore-catalog-${entry.id}`}
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </Layout>
  );
}
