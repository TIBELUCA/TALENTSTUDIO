import { Layout } from "@/components/Layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Ruler, Upload, Loader2, X, FileText, Package, ArrowLeft, Search,
} from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useRef, useState } from "react";
import type { Customer, Drawing } from "@shared/schema";

export default function DrawingFormPage() {
  const { toast } = useToast();
  const { role, isMaster } = useAuth();
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;

  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const presetRequestId = searchParams.get("requestId");
  const presetOfferId = searchParams.get("offerId");
  const presetCustomerId = searchParams.get("customerId");

  const [customerId, setCustomerId] = useState(presetCustomerId ?? "");
  const [customerSearch, setCustomerSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [offerId, setOfferId] = useState(presetOfferId ?? "");

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [dwgFile, setDwgFile] = useState<File | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingDwg, setUploadingDwg] = useState(false);

  const pdfRef = useRef<HTMLInputElement>(null);
  const dwgRef = useRef<HTMLInputElement>(null);

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: presetCustomer } = useQuery<Customer>({
    queryKey: ["/api/customers", presetCustomerId],
    enabled: !!presetCustomerId && customers.length === 0,
  });

  const customerList = customers.length > 0
    ? customers
    : presetCustomer
      ? [presetCustomer]
      : [];

  const filteredCustomers = customerSearch.trim()
    ? customerList.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
    : customerList;

  const { data: existingDrawing } = useQuery<Drawing>({
    queryKey: ["/api/drawings", id],
    enabled: isEdit && !!id,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Seleziona un cliente");
      if (!presetRequestId && !pdfFile) throw new Error("Il file PDF è obbligatorio");

      const formData = new FormData();
      formData.append("customerId", customerId);
      formData.append("notes", notes);
      if (offerId) formData.append("offerId", offerId);
      if (presetRequestId) formData.append("requestId", presetRequestId);
      if (pdfFile) formData.append("pdf", pdfFile);
      if (dwgFile) formData.append("dwg", dwgFile);

      const res = await fetch("/api/drawings", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Errore" }));
        throw new Error(err.message ?? "Errore");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drawings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/drawing-requests"] });
      toast({ title: "Disegno salvato con successo" });
      setLocation("/drawings");
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Errore durante il salvataggio", variant: "destructive" });
    },
  });

  const isTecnico = role === "tecnico_commerciale" || isMaster;

  if (!isTecnico) {
    return (
      <Layout>
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground">Non hai i permessi per caricare disegni.</p>
          <Link href="/drawings">
            <Button variant="outline" className="mt-4">Torna ai Disegni</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/drawings">
            <Button variant="ghost" size="sm" data-testid="btn-back-drawings">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Disegni
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">
              {presetRequestId ? "Evadi Richiesta" : isEdit ? "Modifica Disegno" : "Nuovo Disegno"}
            </h1>
          </div>
        </div>

        {presetRequestId && (
          <Card className="border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
            <CardContent className="p-3">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Stai evadendo la richiesta #{presetRequestId}
                {presetOfferId && ` per l'offerta #${presetOfferId}`}.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="customer-select">Cliente *</Label>
              <Select
                value={customerId}
                onValueChange={(val) => { setCustomerId(val); setCustomerSearch(""); }}
                disabled={!!presetCustomerId}
                onOpenChange={(open) => { if (!open) setCustomerSearch(""); }}
              >
                <SelectTrigger id="customer-select" data-testid="select-customer">
                  <SelectValue placeholder="Seleziona cliente…" />
                </SelectTrigger>
                <SelectContent>
                  <div className="flex items-center gap-2 px-2 pb-2 sticky top-0 bg-popover">
                    <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      className="flex-1 bg-transparent border-b text-sm py-1 outline-none placeholder:text-muted-foreground"
                      placeholder="Cerca cliente…"
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      onKeyDown={e => e.stopPropagation()}
                      data-testid="input-search-customer"
                    />
                  </div>
                  {filteredCustomers.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-3">Nessun risultato</p>
                  )}
                  {filteredCustomers.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="offer-id">ID Offerta (opzionale)</Label>
              <Input
                id="offer-id"
                placeholder="es. 123"
                value={offerId}
                onChange={e => setOfferId(e.target.value)}
                disabled={!!presetOfferId}
                data-testid="input-offer-id"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Note</Label>
              <Textarea
                id="notes"
                placeholder="Descrizione del disegno…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                data-testid="input-notes"
              />
            </div>

            <div className="space-y-3">
              <Label>File</Label>
              <input
                ref={pdfRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
                data-testid="input-pdf"
              />
              <input
                ref={dwgRef}
                type="file"
                accept=".dwg,.dxf"
                className="hidden"
                onChange={e => setDwgFile(e.target.files?.[0] ?? null)}
                data-testid="input-dwg"
              />

              <div className="flex items-center gap-2">
                {pdfFile ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm flex-1">
                    <FileText className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="truncate flex-1">{pdfFile.name}</span>
                    <Button
                      variant="ghost" size="sm" type="button"
                      className="h-6 w-6 p-0 text-destructive shrink-0"
                      onClick={() => setPdfFile(null)}
                      data-testid="btn-remove-pdf"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline" size="sm" type="button"
                    onClick={() => pdfRef.current?.click()}
                    data-testid="btn-upload-pdf"
                  >
                    <Upload className="w-3.5 h-3.5 mr-1" />
                    Allega PDF
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {dwgFile ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm flex-1">
                    <Package className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="truncate flex-1">{dwgFile.name}</span>
                    <Button
                      variant="ghost" size="sm" type="button"
                      className="h-6 w-6 p-0 text-destructive shrink-0"
                      onClick={() => setDwgFile(null)}
                      data-testid="btn-remove-dwg"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline" size="sm" type="button"
                    onClick={() => dwgRef.current?.click()}
                    data-testid="btn-upload-dwg"
                  >
                    <Upload className="w-3.5 h-3.5 mr-1" />
                    Allega DWG
                  </Button>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/drawings">
                <Button variant="outline" type="button" data-testid="btn-cancel">
                  Annulla
                </Button>
              </Link>
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending || !customerId}
                data-testid="btn-save-drawing"
              >
                {submitMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-1" />Salvataggio...</>
                ) : (
                  "Salva Disegno"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
