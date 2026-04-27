import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronLeft, Send, Loader2, Mail, Paperclip, AlertTriangle, Users,
} from "lucide-react";

interface EmailConnection {
  id: number;
  provider: string;
  providerAccountEmail: string | null;
  isDefault: boolean;
  senderDisplayName: string | null;
  signature: string | null;
}

interface LinkedDrawing {
  id: number;
  pdfFilename: string | null;
  pdfOriginalName: string | null;
  dwgFilename: string | null;
  dwgOriginalName: string | null;
}

interface OfferData {
  offerId: number;
  referenceNumber: string;
  status: string;
  totalPrice: number;
  subject: string | null;
  customerId: number | null;
  customerName: string | null;
  customerEmail: string | null;
  dealerCompanyId: number | null;
  dealerName: string | null;
  dealerEmail: string | null;
  salesScenario: "direct" | "with_dealer" | "to_dealer";
  recipientEmail: string;
  linkedDrawingId: number | null;
  linkedDrawing: LinkedDrawing | null;
}

export default function SendOfferEmail() {
  const params = useParams<{ id?: string; offerId?: string }>();
  const offerId = params.id || params.offerId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: connections, isLoading: loadingConnections } = useQuery<EmailConnection[]>({
    queryKey: ["/api/email/connections"],
  });

  const { data: offerData, isLoading: loadingOffer } = useQuery<OfferData>({
    queryKey: ["/api/email/offer-data", offerId],
    enabled: !!offerId,
    retry: 1,
    refetchOnMount: "always",
  });

  const { data: customerContacts } = useQuery<any[]>({
    queryKey: ["/api/contacts", { customerId: offerData?.customerId }],
    queryFn: () => fetch(`/api/contacts?customerId=${offerData?.customerId}`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: !!offerData?.customerId,
  });

  const { data: dealerContacts } = useQuery<any[]>({
    queryKey: ["/api/dealers", offerData?.dealerCompanyId, "contacts"],
    queryFn: () => fetch(`/api/dealers/${offerData?.dealerCompanyId}/contacts`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: !!offerData?.dealerCompanyId,
  });

  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [attachPdf, setAttachPdf] = useState(true);
  const [attachDrawing, setAttachDrawing] = useState(true);

  useEffect(() => {
    if (connections && connections.length > 0 && !selectedConnectionId) {
      const defaultConn = connections.find(c => c.isDefault) || connections[0];
      setSelectedConnectionId(String(defaultConn.id));
    }
  }, [connections, selectedConnectionId]);

  useEffect(() => {
    if (offerData) {
      // Use backend-computed recipient as authoritative; no customer-email fallback
      // (important for "to_dealer" where customer email must NOT be used).
      setTo(offerData.recipientEmail || "");
      setSubject(offerData.subject || `Offerta ${offerData.referenceNumber} — ${offerData.customerName || ""}`);
      const greetName = offerData.salesScenario === "to_dealer"
        ? (offerData.dealerName || "Partner")
        : (offerData.customerName || "Cliente");
      setBodyHtml(
        `<p>Gentile ${greetName},</p>` +
        `<p>in allegato trova la nostra offerta <strong>${offerData.referenceNumber}</strong>.</p>` +
        `<p>Restiamo a disposizione per qualsiasi chiarimento.</p>` +
        `<p>Cordiali saluti</p>`
      );
    }
  }, [offerData]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/email/send", {
        connectionId: selectedConnectionId ? Number(selectedConnectionId) : undefined,
        to,
        cc: cc || undefined,
        subject,
        bodyHtml,
        offerId: attachPdf ? Number(offerId) : undefined,
        customerId: offerData?.customerId || undefined,
        attachLinkedDrawingId: attachDrawing && offerData?.linkedDrawingId ? offerData.linkedDrawingId : undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Email inviata", description: `Inviata a ${to}. Offerta aggiornata a "Inviata" e interazione CRM registrata.` });
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/offers", offerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/interactions"] });
      setLocation(`/offers/${offerId}`);
    },
    onError: (err: any) => {
      toast({ title: "Errore invio email", description: err.message || "Errore sconosciuto", variant: "destructive" });
    },
  });

  const selectedConn = connections?.find(c => c.id === Number(selectedConnectionId));
  const isLoading = loadingConnections || loadingOffer;
  const noConnections = !loadingConnections && (!connections || connections.length === 0);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5 pb-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/offers/${offerId}`)} data-testid="btn-back-offer">
            <ChevronLeft className="w-4 h-4 mr-1" /> Torna all'offerta
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Mail className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Invia Offerta via Email</h1>
          {offerData && (
            <Badge variant="outline" className="font-mono">{offerData.referenceNumber}</Badge>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {noConnections && (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span className="font-semibold text-amber-700 dark:text-amber-300">Nessun account email collegato</span>
              </div>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Per inviare email devi prima collegare il tuo account Gmail o Outlook nella pagina del profilo.
              </p>
              <Button variant="outline" onClick={() => setLocation("/account")} data-testid="btn-goto-account">
                Vai alle impostazioni account
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && !noConnections && (
          <Card data-testid="card-compose-email">
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Provider</Label>
                  <Select value={selectedConnectionId} onValueChange={setSelectedConnectionId}>
                    <SelectTrigger data-testid="select-provider">
                      <SelectValue placeholder="Seleziona provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {connections?.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.provider === "gmail" ? "Gmail" : "Outlook"} — {c.providerAccountEmail || "N/D"}
                          {c.isDefault ? " (predefinito)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Da</Label>
                  <Input
                    value={selectedConn ? `${selectedConn.senderDisplayName || ""} <${selectedConn.providerAccountEmail || ""}>` : ""}
                    disabled
                    className="bg-muted/30"
                    data-testid="input-from"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destinatario</Label>
                <Input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="email@esempio.com"
                  data-testid="input-to"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CC</Label>
                <Input
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="cc@esempio.com (opzionale)"
                  data-testid="input-cc"
                />
                {(() => {
                  const ccEmails = cc.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
                  const toEmails = to.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
                  const toggleCc = (email: string) => {
                    const norm = email.trim().toLowerCase();
                    if (!norm) return;
                    const current = cc.split(",").map(e => e.trim()).filter(Boolean);
                    if (current.some(e => e.toLowerCase() === norm)) {
                      setCc(current.filter(e => e.toLowerCase() !== norm).join(", "));
                    } else {
                      setCc([...current, email.trim()].join(", "));
                    }
                  };
                  const custRows = (customerContacts || [])
                    .filter((c: any) => c?.email)
                    .map((c: any) => ({
                      key: `cust-${c.id}`,
                      email: String(c.email),
                      label: `${c.firstName || ""} ${c.lastName || ""}`.trim() || String(c.email),
                      source: "Cliente",
                    }));
                  const dealRows = (dealerContacts || [])
                    .filter((c: any) => c?.email)
                    .map((c: any) => ({
                      key: `deal-${c.id}`,
                      email: String(c.email),
                      label: `${c.name || ""} ${c.surname || ""}`.trim() || String(c.email),
                      source: "Dealer",
                    }));
                  const rows = [...custRows, ...dealRows];
                  if (rows.length === 0) return null;
                  return (
                    <div className="mt-2 p-3 rounded-md border bg-muted/20 space-y-2" data-testid="cc-contacts-picker">
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <Users className="w-3.5 h-3.5" />
                        Aggiungi contatti in CC
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                        {rows.map(r => {
                          const inCc = ccEmails.includes(r.email.toLowerCase());
                          const inTo = toEmails.includes(r.email.toLowerCase());
                          return (
                            <label
                              key={r.key}
                              className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded hover-elevate cursor-pointer ${inTo ? "opacity-50" : ""}`}
                              data-testid={`cc-contact-${r.key}`}
                            >
                              <Checkbox
                                checked={inCc}
                                disabled={inTo}
                                onCheckedChange={() => toggleCc(r.email)}
                              />
                              <span className="flex-1 min-w-0 truncate">
                                <span className="font-medium">{r.label}</span>
                                <span className="text-muted-foreground"> — {r.email}</span>
                              </span>
                              <Badge variant="outline" className="text-[10px] shrink-0">{r.source}</Badge>
                              {inTo && <span className="text-[10px] text-muted-foreground shrink-0">(già in A)</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Oggetto</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  data-testid="input-subject"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Messaggio</Label>
                <Textarea
                  value={bodyHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}
                  onChange={(e) => setBodyHtml(`<p>${e.target.value.replace(/\n/g, "</p><p>")}</p>`)}
                  className="min-h-[150px]"
                  data-testid="textarea-body"
                />
              </div>

              {offerId && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted/30 border">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">
                    Allegato: <strong>Offerta PDF ({offerData?.referenceNumber})</strong>
                  </span>
                  <div className="flex-1" />
                  <Button
                    variant={attachPdf ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAttachPdf(!attachPdf)}
                    data-testid="btn-toggle-attachment"
                  >
                    {attachPdf ? "Allegato incluso" : "Senza allegato"}
                  </Button>
                </div>
              )}

              {offerData?.linkedDrawing && (offerData.linkedDrawing.pdfFilename || offerData.linkedDrawing.dwgFilename) && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted/30 border" data-testid="row-drawing-attachment">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">
                    Disegno tecnico: <strong>
                      {[
                        offerData.linkedDrawing.pdfOriginalName || offerData.linkedDrawing.pdfFilename,
                        offerData.linkedDrawing.dwgOriginalName || offerData.linkedDrawing.dwgFilename,
                      ].filter(Boolean).join(" + ")}
                    </strong>
                  </span>
                  <div className="flex-1" />
                  <Button
                    variant={attachDrawing ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAttachDrawing(!attachDrawing)}
                    data-testid="btn-toggle-drawing-attachment"
                  >
                    {attachDrawing ? "Disegno incluso" : "Senza disegno"}
                  </Button>
                </div>
              )}

              {selectedConn?.signature && (
                <div className="p-3 rounded-md bg-muted/20 border text-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Firma</p>
                  <p className="whitespace-pre-line text-muted-foreground">{selectedConn.signature}</p>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={() => sendMutation.mutate()}
                  disabled={!to || !subject || sendMutation.isPending}
                  className="gap-2"
                  data-testid="btn-send-email"
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Invia Email
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation(`/offers/${offerId}`)}
                  data-testid="btn-cancel-send"
                >
                  Annulla
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
