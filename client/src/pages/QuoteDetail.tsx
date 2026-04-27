import { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Pencil, Copy, Trash2, Mail, FileDown, Send, Check, X, Megaphone,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  QUOTE_STATUS_LABELS, type QuoteStatus,
  TALENT_DELIVERABLE_LABELS, type TalentDeliverable,
  type TalentQuoteWithItems,
} from "@shared/schema";

const STATUS_BADGE: Record<QuoteStatus, string> = {
  draft: "bg-gray-100 text-gray-800 border-gray-300",
  sent: "bg-blue-100 text-blue-800 border-blue-300",
  accepted: "bg-green-100 text-green-800 border-green-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
};
function formatEur(v: any) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v ?? 0));
}
function formatDate(d: any) { return d ? new Date(d).toLocaleDateString("it-IT") : "—"; }

export default function QuoteDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [pdfOpen, setPdfOpen] = useState(false);

  const { data: quote, isLoading } = useQuery<TalentQuoteWithItems>({
    queryKey: ["/api/quotes", id],
    queryFn: () => fetch(`/api/quotes/${id}`, { credentials: "include" }).then(r => r.json()),
  });

  const statusMutation = useMutation({
    mutationFn: (status: QuoteStatus) =>
      apiRequest("PATCH", `/api/quotes/${id}/status`, { status }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Stato aggiornato" });
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/quotes/${id}/duplicate`).then(r => r.json()),
    onSuccess: (q: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Preventivo duplicato" });
      navigate(`/quotes/${q.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/quotes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: "Preventivo eliminato" });
      navigate("/quotes");
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/quotes/${id}/create-campaign`).then(r => r.json()),
    onSuccess: (c: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campagna creata", description: c.code });
      navigate(`/campaigns/${c.id}`);
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <Layout><div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div></Layout>;
  }
  if (!quote) {
    return <Layout><div className="max-w-3xl mx-auto p-6"><Card><CardContent className="py-10 text-center">Preventivo non trovato</CardContent></Card></div></Layout>;
  }

  const status = quote.status as QuoteStatus;
  const composeBody = encodeURIComponent(
    `Ciao,\n\nIn allegato trovi il preventivo ${quote.referenceNumber} per "${quote.subject}".\n\nGrazie,\nGiovanna`
  );
  const composeSubject = encodeURIComponent(`Preventivo ${quote.referenceNumber} — ${quote.subject}`);
  const emailHref = `/email?compose=1&subject=${composeSubject}&body=${composeBody}&quoteId=${quote.id}`;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6 pb-20">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <span className="font-mono text-base text-muted-foreground">{quote.referenceNumber}</span>
              <Badge variant="outline" className={STATUS_BADGE[status]}>{QUOTE_STATUS_LABELS[status]}</Badge>
            </span>
          }
          subtitle={quote.subject}
          actions={
            <div className="flex flex-wrap gap-2">
              <a href={`/api/quotes/${id}/pdf?inline=1`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" data-testid="button-view-pdf">
                  <FileDown className="mr-1 h-4 w-4" /> PDF
                </Button>
              </a>
              <Link href={emailHref}>
                <Button variant="outline" size="sm" data-testid="button-compose-email">
                  <Mail className="mr-1 h-4 w-4" /> Componi email
                </Button>
              </Link>
              <Link href={`/quotes/${id}/edit`}>
                <Button variant="outline" size="sm" data-testid="button-edit-quote">
                  <Pencil className="mr-1 h-4 w-4" /> Modifica
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={() => duplicateMutation.mutate()}
                disabled={duplicateMutation.isPending} data-testid="button-duplicate">
                <Copy className="mr-1 h-4 w-4" /> Duplica
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-delete-quote">
                    <Trash2 className="mr-1 h-4 w-4 text-red-600" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminare il preventivo?</AlertDialogTitle>
                    <AlertDialogDescription>Operazione non reversibile.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate()}>Elimina</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          }
        />

        {/* Status actions row */}
        <div className="flex flex-wrap items-center gap-2">
          {status === "draft" && (
            <Button size="sm" onClick={() => statusMutation.mutate("sent")} data-testid="button-mark-sent">
              <Send className="mr-1 h-4 w-4" /> Segna come Inviato
            </Button>
          )}
          {status === "sent" && (
            <>
              <Button size="sm" onClick={() => statusMutation.mutate("accepted")} data-testid="button-mark-accepted">
                <Check className="mr-1 h-4 w-4" /> Accettato
              </Button>
              <Button size="sm" variant="outline" onClick={() => statusMutation.mutate("rejected")} data-testid="button-mark-rejected">
                <X className="mr-1 h-4 w-4" /> Rifiutato
              </Button>
            </>
          )}
          {status === "accepted" && !quote.campaignId && (
            <Button size="sm" onClick={() => createCampaignMutation.mutate()}
              disabled={createCampaignMutation.isPending} data-testid="button-create-campaign">
              <Megaphone className="mr-1 h-4 w-4" /> Crea campagna
            </Button>
          )}
          {quote.campaignId && (
            <Link href={`/campaigns/${quote.campaignId}`}>
              <Button size="sm" variant="outline" data-testid="button-go-campaign">
                <Megaphone className="mr-1 h-4 w-4" /> Vai alla campagna
              </Button>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Brand</CardTitle></CardHeader>
            <CardContent>
              <div className="font-semibold">{quote.brandName ?? "—"}</div>
              {quote.brandContactName && <div className="text-sm text-muted-foreground">{quote.brandContactName}</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Date</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>Creato: {formatDate(quote.date)}</div>
              {quote.sentAt && <div>Inviato: {formatDate(quote.sentAt)}</div>}
              {quote.acceptedAt && <div>Accettato: {formatDate(quote.acceptedAt)}</div>}
              {quote.rejectedAt && <div>Rifiutato: {formatDate(quote.rejectedAt)}</div>}
              {quote.validUntil && <div>Scadenza: {formatDate(quote.validUntil)}</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Totale</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-quote-total">{formatEur(quote.totalEur)}</div>
              {quote.paymentTerms && <div className="text-xs text-muted-foreground mt-1">{quote.paymentTerms}</div>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Voci ({quote.items.length})</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b">
                <tr>
                  <th className="py-2">Talent</th>
                  <th>Tipo</th>
                  <th className="text-center">Qtà</th>
                  <th className="text-right">€/cad</th>
                  <th className="text-right">Sconto</th>
                  <th className="text-right">Totale</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map(it => {
                  const u = Number(it.unitPriceEur || 0);
                  const d = Number(it.discountPct || 0);
                  const gross = it.quantity * u;
                  const tot = gross - (gross * d) / 100;
                  return (
                    <tr key={it.id} className="border-b last:border-0" data-testid={`row-item-${it.id}`}>
                      <td className="py-2 font-medium">{it.talentName}</td>
                      <td>{TALENT_DELIVERABLE_LABELS[it.deliverableType as TalentDeliverable] ?? it.deliverableType}</td>
                      <td className="text-center">{it.quantity}</td>
                      <td className="text-right">{formatEur(u)}</td>
                      <td className="text-right">{Number(d).toFixed(0)}%</td>
                      <td className="text-right font-semibold">{formatEur(tot)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {(quote.notes || quote.internalNotes) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quote.notes && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Note al brand</CardTitle></CardHeader>
                <CardContent className="whitespace-pre-wrap text-sm">{quote.notes}</CardContent>
              </Card>
            )}
            {quote.internalNotes && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Note interne</CardTitle></CardHeader>
                <CardContent className="whitespace-pre-wrap text-sm">{quote.internalNotes}</CardContent>
              </Card>
            )}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center justify-between">
              Anteprima PDF
              <Button variant="outline" size="sm" onClick={() => setPdfOpen(o => !o)} data-testid="button-toggle-pdf">
                {pdfOpen ? "Nascondi" : "Mostra"}
              </Button>
            </CardTitle>
          </CardHeader>
          {pdfOpen && (
            <CardContent>
              <iframe
                src={`/api/quotes/${id}/pdf?inline=1`}
                className="w-full h-[800px] border rounded"
                title="PDF preventivo"
                data-testid="iframe-pdf-preview"
              />
            </CardContent>
          )}
        </Card>
      </div>
    </Layout>
  );
}
