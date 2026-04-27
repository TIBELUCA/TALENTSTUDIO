import { Layout } from "@/components/Layout";
import { PdfViewer } from "@/components/PdfViewer";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Ruler, Plus, FileText, Package, Trash2, Loader2, AlertCircle, Clock, CheckCircle2,
  ChevronDown, ChevronRight, Paperclip, Building2, Search, Eye, Download, X,
  Cog, BarChart3, CheckSquare,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useState, useMemo } from "react";
import type { Drawing, DrawingRequest } from "@shared/schema";

type DrawingWithCustomer = Drawing & { customerName?: string };
type DrawingRequestWithDetails = DrawingRequest & {
  customerName?: string;
  offerRef?: string | null;
  offerSubject?: string | null;
  machineSummary?: { machineName: string; quantity: number }[];
};

export default function DrawingsPage() {
  const { toast } = useToast();
  const { role, isMaster } = useAuth();
  const isTecnico = role === "tecnico_commerciale" || isMaster;

  const [expandedRequests, setExpandedRequests] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewDrawingId, setPreviewDrawingId] = useState<number | null>(null);
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set());

  const { data: drawings = [], isLoading: drawingsLoading } = useQuery<DrawingWithCustomer[]>({
    queryKey: ["/api/drawings"],
  });

  const { data: requests = [], isLoading: requestsLoading } = useQuery<DrawingRequestWithDetails[]>({
    queryKey: ["/api/drawing-requests"],
  });

  const deleteDrawing = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/drawings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drawings"] });
      toast({ title: "Disegno eliminato" });
    },
    onError: () => {
      toast({ title: "Errore durante l'eliminazione", variant: "destructive" });
    },
  });

  const extractMachines = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/drawings/${id}/extract-machines`);
      return res.json();
    },
    onSuccess: (data: { extracted: number; matched: number }) => {
      toast({ title: `Estratte ${data.extracted} macchine, ${data.matched} associate` });
    },
    onError: () => {
      toast({ title: "Errore durante l'estrazione", variant: "destructive" });
    },
  });

  const pendingRequests = requests.filter(r => r.status === "pending");

  const filteredDrawings = useMemo(() => {
    if (!searchQuery.trim()) return drawings;
    const q = searchQuery.toLowerCase().trim();
    return drawings.filter(d => {
      const name = (d.pdfOriginalName ?? d.dwgOriginalName ?? "").toLowerCase();
      const customer = (d.customerName ?? "").toLowerCase();
      const notes = (d.notes ?? "").toLowerCase();
      return name.includes(q) || customer.includes(q) || notes.includes(q) || String(d.id).includes(q);
    });
  }, [drawings, searchQuery]);

  const drawingsByYear = useMemo(() => {
    const groups: Record<number, DrawingWithCustomer[]> = {};
    for (const d of filteredDrawings) {
      const year = new Date(d.createdAt).getFullYear();
      if (!groups[year]) groups[year] = [];
      groups[year].push(d);
    }
    return Object.entries(groups)
      .map(([year, items]) => ({ year: Number(year), items }))
      .sort((a, b) => b.year - a.year);
  }, [filteredDrawings]);

  const supersededBy = useMemo(() => {
    const map = new Map<number, number>();
    for (const d of drawings) {
      if (d.replacesDrawingId) map.set(d.replacesDrawingId, d.id);
    }
    return map;
  }, [drawings]);

  const toggleYear = (year: number) => {
    setCollapsedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const drawingName = (d: Drawing) =>
    d.pdfOriginalName ? d.pdfOriginalName.replace(/\.[^.]+$/, "") :
    d.dwgOriginalName ? d.dwgOriginalName.replace(/\.[^.]+$/, "") :
    `Disegno #${d.id}`;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Ruler className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Disegni Tecnici</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/drawings/verify">
              <Button variant="outline" size="sm" data-testid="btn-verify-page">
                <CheckSquare className="w-4 h-4 mr-1" />
                Verifica Associazioni
              </Button>
            </Link>
            <Link href="/drawings/statistics">
              <Button variant="outline" size="sm" data-testid="btn-stats-page">
                <BarChart3 className="w-4 h-4 mr-1" />
                Storico
              </Button>
            </Link>
            {isTecnico && (
              <Link href="/drawings/new">
                <Button data-testid="btn-new-drawing">
                  <Plus className="w-4 h-4 mr-1" />
                  Nuovo Disegno
                </Button>
              </Link>
            )}
          </div>
        </div>

        {isTecnico && (requests.length > 0 || requestsLoading) && (
          <div className="space-y-3">
            <button
              className="flex items-center gap-2 font-semibold text-base w-full text-left"
              onClick={() => setExpandedRequests(v => !v)}
              data-testid="toggle-requests"
            >
              {expandedRequests ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Richieste di Disegno
              {pendingRequests.length > 0 && (
                <Badge variant="destructive" className="ml-1">{pendingRequests.length} in attesa</Badge>
              )}
            </button>
            {expandedRequests && (
              <div className="space-y-2">
                {requestsLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Caricamento...</span>
                  </div>
                )}
                {!requestsLoading && requests.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nessuna richiesta.</p>
                )}
                {requests.map(req => (
                  <Card key={req.id} className="border" data-testid={`card-request-${req.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {req.offerRef ? `Offerta ${req.offerRef}` : req.offerId ? `Offerta #${req.offerId}` : "Offerta in bozza"}
                            </span>
                            {req.customerName && (
                              <span className="text-xs text-muted-foreground">— {req.customerName}</span>
                            )}
                            <Badge
                              variant={req.status === "pending" ? "outline" : "secondary"}
                              className={req.status === "pending" ? "border-amber-400 text-amber-600" : ""}
                              data-testid={`badge-status-${req.id}`}
                            >
                              {req.status === "pending" ? (
                                <><Clock className="w-3 h-3 mr-1" />In attesa</>
                              ) : (
                                <><CheckCircle2 className="w-3 h-3 mr-1" />Evaso</>
                              )}
                            </Badge>
                          </div>
                          {req.offerSubject && (
                            <p className="text-xs font-medium">{req.offerSubject}</p>
                          )}
                          {req.machineSummary && req.machineSummary.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              <p className="text-xs text-muted-foreground font-medium">Distinta macchine:</p>
                              {req.machineSummary.map((m, i) => (
                                <p key={i} className="text-xs text-muted-foreground">
                                  {m.quantity}× {m.machineName}
                                </p>
                              ))}
                            </div>
                          )}
                          {req.notes && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{req.notes}</p>
                          )}
                          {req.attachmentFilename && (
                            <a
                              href={`/drawing-attachments/${req.attachmentFilename}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              data-testid={`link-attachment-${req.id}`}
                            >
                              <Paperclip className="w-3 h-3" />
                              {req.attachmentOriginalName ?? "Allegato"}
                            </a>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(req.createdAt), "dd/MM/yyyy HH:mm")}
                          </p>
                        </div>
                        {isTecnico && req.status === "pending" && (
                          <Link href={`/drawings/new?requestId=${req.id}${req.offerId ? `&offerId=${req.offerId}` : ""}&customerId=${req.customerId}`}>
                            <Button size="sm" variant="outline" data-testid={`btn-fulfill-${req.id}`}>
                              <Plus className="w-3.5 h-3.5 mr-1" />
                              Evadi
                            </Button>
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-base shrink-0">Archivio Disegni</h2>
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca per nome, cliente..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-search-drawings"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {searchQuery && (
              <span className="text-xs text-muted-foreground shrink-0">
                {filteredDrawings.length} risultat{filteredDrawings.length === 1 ? "o" : "i"}
              </span>
            )}
          </div>

          {drawingsLoading && (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Caricamento...</span>
            </div>
          )}
          {!drawingsLoading && drawings.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Ruler className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nessun disegno trovato.</p>
              {isTecnico && (
                <Link href="/drawings/new">
                  <Button variant="outline" className="mt-4" data-testid="btn-new-drawing-empty">
                    <Plus className="w-4 h-4 mr-1" />
                    Carica il primo disegno
                  </Button>
                </Link>
              )}
            </div>
          )}
          {!drawingsLoading && drawings.length > 0 && filteredDrawings.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nessun risultato per "{searchQuery}"</p>
          )}

          {drawingsByYear.map(({ year, items }) => {
            const isCollapsed = collapsedYears.has(year);
            return (
              <div key={year} className="space-y-1.5">
                <button
                  className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground w-full text-left py-1"
                  onClick={() => toggleYear(year)}
                  data-testid={`toggle-year-${year}`}
                >
                  {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {year}
                  <Badge variant="secondary" className="text-xs ml-1">{items.length}</Badge>
                </button>
                {!isCollapsed && (
                  <div className="space-y-1">
                    {items.map(d => {
                      const isPreviewOpen = previewDrawingId === d.id;
                      const supersededById = supersededBy.get(d.id);
                      const isPreviousVersion = supersededById !== undefined;
                      return (
                        <div key={d.id} className="space-y-0" data-testid={`card-drawing-${d.id}`}>
                          <div className={`flex items-center gap-3 px-3 py-2 rounded-md border transition-colors group ${
                            isPreviousVersion
                              ? "bg-muted/40 border-dashed opacity-80 hover:opacity-100"
                              : "bg-card hover:bg-muted/50"
                          }`}>
                            <Ruler className={`w-3.5 h-3.5 shrink-0 ${isPreviousVersion ? "text-muted-foreground" : "text-teal-600"}`} />
                            <span className={`font-medium text-sm truncate min-w-0 flex-shrink ${isPreviousVersion ? "line-through text-muted-foreground" : ""}`} title={drawingName(d)}>
                              {drawingName(d)}
                            </span>
                            {isPreviousVersion && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 shrink-0 border-amber-500 text-amber-700 dark:text-amber-400"
                                title={`Sostituito dal disegno #${supersededById}`}
                                data-testid={`badge-previous-version-${d.id}`}
                              >
                                Versione precedente · sostituito da #{supersededById}
                              </Badge>
                            )}
                            {d.customerName && (
                              <span className="text-xs text-muted-foreground truncate hidden sm:inline-flex items-center gap-1 shrink-0 max-w-[180px]" title={d.customerName}>
                                <Building2 className="w-3 h-3 shrink-0" />
                                {d.customerName}
                              </span>
                            )}
                            <div className="inline-flex items-center gap-1.5 shrink-0">
                              {d.pdfFilename && (
                                <span title="PDF presente" className="text-red-500">
                                  <FileText className="w-3.5 h-3.5" />
                                </span>
                              )}
                              {d.dwgFilename && (
                                <a
                                  href={`/drawings-files/${d.dwgFilename}?download=1&name=${encodeURIComponent(d.dwgOriginalName ?? "drawing.dwg")}`}
                                  title="Scarica DWG"
                                  className="text-blue-500 hover:text-blue-700"
                                  data-testid={`link-dwg-${d.id}`}
                                >
                                  <Package className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                            {d.offerId && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 hidden md:inline-flex">Off. #{d.offerId}</Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground shrink-0 hidden lg:inline">
                              {format(new Date(d.createdAt), "dd/MM/yyyy")}
                            </span>
                            <div className="flex items-center gap-1 ml-auto shrink-0">
                              {d.pdfFilename && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => extractMachines.mutate(d.id)}
                                  disabled={extractMachines.isPending}
                                  title="Estrai macchine dal PDF"
                                  data-testid={`btn-extract-machines-${d.id}`}
                                >
                                  <Cog className={`w-3.5 h-3.5 mr-1 ${extractMachines.isPending ? "animate-spin" : ""}`} />
                                  <span className="text-xs hidden xl:inline">Estrai Macchine</span>
                                </Button>
                              )}
                              {d.pdfFilename && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => setPreviewDrawingId(isPreviewOpen ? null : d.id)}
                                  data-testid={`btn-preview-pdf-${d.id}`}
                                >
                                  {isPreviewOpen ? <X className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
                                  <span className="text-xs">{isPreviewOpen ? "Chiudi" : "Apri"}</span>
                                </Button>
                              )}
                              {d.pdfFilename && (
                                <a
                                  href={`/drawings-files/${d.pdfFilename}`}
                                  download={d.pdfOriginalName ?? "drawing.pdf"}
                                  title="Scarica PDF"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                                  data-testid={`btn-download-pdf-${d.id}`}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              )}
                              {isTecnico && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => deleteDrawing.mutate(d.id)}
                                  disabled={deleteDrawing.isPending}
                                  data-testid={`btn-delete-drawing-${d.id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {isPreviewOpen && d.pdfFilename && (
                            <PdfViewer
                              src={`/drawings-files/${d.pdfFilename}`}
                              title={d.pdfOriginalName ?? "PDF"}
                              testId={`pdf-viewer-${d.id}`}
                              className="mt-1"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
