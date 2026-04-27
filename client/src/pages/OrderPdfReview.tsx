import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Printer, FileText, Eye, EyeOff, Loader2,
  ChevronUp, ChevronDown, Paperclip, FileImage, File,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface OrderPdfSection {
  id: string;
  label: string;
}

const ALL_SECTIONS: OrderPdfSection[] = [
  { id: "header", label: "Intestazione Commessa" },
  { id: "confirmation", label: "Stato Conferma" },
  { id: "versions", label: "Storico Versioni" },
  { id: "timeline", label: "Timeline Progetto" },
  { id: "overview", label: "Panoramica Ordine" },
  { id: "addresses", label: "Fatturazione & Destinazione" },
  { id: "delivery", label: "Consegna" },
  { id: "assembly", label: "Montaggio" },
  { id: "payments", label: "Condizioni di Pagamento" },
  { id: "invoicing", label: "Fatturazione Emessa" },
  { id: "priceOverview", label: "Price Overview" },
  { id: "techData", label: "Dati Tecnici Generali della Linea" },
  { id: "techSheets", label: "Schede Tecniche" },
  { id: "notes", label: "Note" },
  { id: "production", label: "Avanzamento Produzione" },
];

const SECTION_ICONS: Record<string, string> = {
  header: "📋", confirmation: "✅", timeline: "📅", overview: "📊",
  addresses: "🏢", delivery: "🚚", assembly: "🔧", payments: "💳",
  invoicing: "🧾", priceOverview: "💰", notes: "📝", production: "⚙️",
  techData: "📐", techSheets: "📄", versions: "📜",
};

const SECTION_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  header:       { border: "border-slate-300",  bg: "bg-slate-50 dark:bg-slate-950/20",   text: "text-slate-800 dark:text-slate-300" },
  confirmation: { border: "border-green-300",  bg: "bg-green-50 dark:bg-green-950/20",   text: "text-green-800 dark:text-green-300" },
  timeline:     { border: "border-blue-300",   bg: "bg-blue-50 dark:bg-blue-950/20",     text: "text-blue-800 dark:text-blue-300" },
  overview:     { border: "border-violet-300", bg: "bg-violet-50 dark:bg-violet-950/20", text: "text-violet-800 dark:text-violet-300" },
  addresses:    { border: "border-teal-300",   bg: "bg-teal-50 dark:bg-teal-950/20",     text: "text-teal-800 dark:text-teal-300" },
  delivery:     { border: "border-orange-300", bg: "bg-orange-50 dark:bg-orange-950/20", text: "text-orange-800 dark:text-orange-300" },
  assembly:     { border: "border-amber-300",  bg: "bg-amber-50 dark:bg-amber-950/20",   text: "text-amber-800 dark:text-amber-300" },
  payments:     { border: "border-indigo-300", bg: "bg-indigo-50 dark:bg-indigo-950/20", text: "text-indigo-800 dark:text-indigo-300" },
  invoicing:    { border: "border-cyan-300",   bg: "bg-cyan-50 dark:bg-cyan-950/20",     text: "text-cyan-800 dark:text-cyan-300" },
  priceOverview:{ border: "border-emerald-300",bg: "bg-emerald-50 dark:bg-emerald-950/20",text: "text-emerald-800 dark:text-emerald-300" },
  notes:        { border: "border-gray-300",   bg: "bg-gray-50 dark:bg-gray-950/20",     text: "text-gray-800 dark:text-gray-300" },
  production:   { border: "border-rose-300",   bg: "bg-rose-50 dark:bg-rose-950/20",     text: "text-rose-800 dark:text-rose-300" },
  techData:     { border: "border-sky-300",    bg: "bg-sky-50 dark:bg-sky-950/20",       text: "text-sky-800 dark:text-sky-300" },
  techSheets:   { border: "border-pink-300",   bg: "bg-pink-50 dark:bg-pink-950/20",     text: "text-pink-800 dark:text-pink-300" },
  versions:     { border: "border-purple-300", bg: "bg-purple-50 dark:bg-purple-950/20", text: "text-purple-800 dark:text-purple-300" },
};

export default function OrderPdfReview() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: order, isLoading } = useQuery<any>({
    queryKey: ["/api/orders", id],
  });

  const [hiddenSections, setHiddenSections] = useState<Set<string>>(new Set());
  const [mergeLayout, setMergeLayout] = useState(true);
  const [mergeDocuments, setMergeDocuments] = useState(false);
  const [generating, setGenerating] = useState(false);

  const toggleSection = (sectionId: string) => {
    setHiddenSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const selectAll = () => setHiddenSections(new Set());
  const deselectAll = () => setHiddenSections(new Set(ALL_SECTIONS.map(s => s.id)));

  const visibleCount = ALL_SECTIONS.length - hiddenSections.size;

  const buildPdfUrl = () => {
    const params = new URLSearchParams();
    if (hiddenSections.size > 0) {
      params.set("hidden", Array.from(hiddenSections).join(","));
    }
    if (!mergeLayout) params.set("mergeLayout", "0");
    if (mergeDocuments) params.set("mergeDocuments", "1");
    const qs = params.toString();
    return `/api/orders/${id}/pdf${qs ? `?${qs}` : ""}`;
  };

  const handleGenerate = () => {
    setGenerating(true);
    const url = buildPdfUrl();
    window.open(url, "_blank");
    setTimeout(() => setGenerating(false), 2000);
  };

  const hasLayout = !!order?.layoutPdfFilename;
  const documents: any[] = order?.documents ?? [];
  const pdfDocuments = documents.filter((d: any) =>
    (d.mimeType ?? "").toLowerCase() === "application/pdf" ||
    (d.filename ?? "").toLowerCase().endsWith(".pdf") ||
    (d.originalName ?? "").toLowerCase().endsWith(".pdf")
  );
  const hasDocuments = pdfDocuments.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Commessa non trovata</p>
        <Link href="/orders">
          <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-1.5" /> Torna alle Commesse</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/orders/${id}`}>
              <Button variant="ghost" size="sm" data-testid="btn-back-to-order">
                <ArrowLeft className="w-4 h-4 mr-1.5" /> Torna alla Commessa
              </Button>
            </Link>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating || visibleCount === 0}
            className="gap-2"
            data-testid="btn-generate-pdf"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Genera PDF
          </Button>
        </div>

        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Anteprima Sezioni PDF
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Commessa <span className="font-mono font-bold text-foreground">{order.jobNumber}</span> — Seleziona le sezioni da includere nel documento PDF
          </p>
        </div>

        <Card data-testid="card-section-selector">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Sezioni del Documento</span>
                <Badge variant="secondary" className="text-xs font-mono">
                  {visibleCount}/{ALL_SECTIONS.length}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={selectAll}
                  data-testid="btn-select-all"
                >
                  Seleziona Tutto
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={deselectAll}
                  data-testid="btn-deselect-all"
                >
                  Deseleziona Tutto
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              {ALL_SECTIONS.map((section) => {
                const isVisible = !hiddenSections.has(section.id);
                const sc = SECTION_COLORS[section.id] ?? { border: "border-gray-300", bg: "bg-gray-50 dark:bg-gray-950/20", text: "text-gray-800 dark:text-gray-300" };

                return (
                  <div
                    key={section.id}
                    className={`flex items-center gap-3 p-2.5 border rounded-md transition-colors cursor-pointer ${
                      isVisible ? `${sc.border} ${sc.bg}` : "border-gray-200 dark:border-gray-800 bg-muted/30 opacity-50"
                    }`}
                    onClick={() => toggleSection(section.id)}
                    data-testid={`section-row-${section.id}`}
                  >
                    <Checkbox
                      id={`section-${section.id}`}
                      checked={isVisible}
                      onCheckedChange={() => toggleSection(section.id)}
                      data-testid={`checkbox-section-${section.id}`}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-base shrink-0">{SECTION_ICONS[section.id] ?? "📄"}</span>
                    <label
                      htmlFor={`section-${section.id}`}
                      className={`font-medium text-sm flex-1 cursor-pointer select-none ${isVisible ? sc.text : "text-muted-foreground"}`}
                    >
                      {section.label}
                    </label>
                    {isVisible ? (
                      <Eye className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {(hasLayout || hasDocuments) && (
          <Card data-testid="card-attachments">
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Allegati PDF</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Scegli se unire i documenti PDF allegati al documento generato.
              </p>

              {hasLayout && (
                <div className="flex items-center justify-between p-3 border rounded-md bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-3">
                    <FileImage className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Layout Drawing</p>
                      <p className="text-xs text-muted-foreground">{order.layoutPdfOriginalName || order.layoutPdfFilename}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="merge-layout" className="text-xs text-muted-foreground cursor-pointer">Unisci</Label>
                    <Switch
                      id="merge-layout"
                      checked={mergeLayout}
                      onCheckedChange={setMergeLayout}
                      data-testid="switch-merge-layout"
                    />
                  </div>
                </div>
              )}

              {hasDocuments && (
                <div className="flex items-center justify-between p-3 border rounded-md bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-3">
                    <File className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Documenti Allegati</p>
                      <p className="text-xs text-muted-foreground">
                        {pdfDocuments.length} PDF{pdfDocuments.length !== 1 ? "" : ""} allegat{pdfDocuments.length !== 1 ? "i" : "o"}
                        {pdfDocuments.length <= 4 && (
                          <span className="block mt-0.5">
                            {pdfDocuments.map((d: any) => d.originalName || d.filename).join(", ")}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="merge-documents" className="text-xs text-muted-foreground cursor-pointer">Unisci</Label>
                    <Switch
                      id="merge-documents"
                      checked={mergeDocuments}
                      onCheckedChange={setMergeDocuments}
                      data-testid="switch-merge-documents"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between pt-2 pb-8">
          <Link href={`/orders/${id}`}>
            <Button variant="outline" data-testid="btn-cancel-pdf">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Annulla
            </Button>
          </Link>
          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={generating || visibleCount === 0}
            className="gap-2"
            data-testid="btn-generate-pdf-bottom"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Genera PDF ({visibleCount} sezion{visibleCount === 1 ? "e" : "i"})
          </Button>
        </div>
      </div>
    </div>
  );
}
