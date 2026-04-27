import { useState, useMemo, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, ChevronLeft, ChevronRight, Loader2, Save, Building2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  TALENT_DELIVERABLES, TALENT_DELIVERABLE_LABELS,
  type TalentListItem, type TalentQuoteWithItems, type TalentRate,
} from "@shared/schema";

type Customer = { id: number; name: string };
type Contact = { id: number; firstName: string; lastName: string };

interface ItemRow {
  talentId: number | null;
  talentName: string;
  deliverableType: typeof TALENT_DELIVERABLES[number];
  quantity: number;
  unitPriceEur: string;
  discountPct: string;
  notes: string;
}

const newItem = (): ItemRow => ({
  talentId: null, talentName: "", deliverableType: "post",
  quantity: 1, unitPriceEur: "0", discountPct: "0", notes: "",
});

function formatEur(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function computeRowTotal(it: ItemRow): number {
  const u = Number(it.unitPriceEur || 0);
  const d = Number(it.discountPct || 0);
  const gross = it.quantity * u;
  return Math.round((gross - (gross * d) / 100) * 100) / 100;
}

interface Props { mode: "create" | "edit"; }

export default function QuoteWizard({ mode }: Props) {
  const [, navigate] = useLocation();
  const params = useParams<{ id?: string }>();
  const editId = mode === "edit" && params.id ? Number(params.id) : null;
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  // Brand step
  const [brandCustomerId, setBrandCustomerId] = useState<number | null>(null);
  const [brandContactId, setBrandContactId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [brandQuickOpen, setBrandQuickOpen] = useState(false);
  const [brandQuickName, setBrandQuickName] = useState("");
  const [brandQuickEmail, setBrandQuickEmail] = useState("");

  // Items step
  const [items, setItems] = useState<ItemRow[]>([newItem()]);

  // Termini step
  const [validUntil, setValidUntil] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const brandQuickCreate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/customers", {
        name: brandQuickName.trim(),
        email: brandQuickEmail.trim(),
        type: "brand",
      });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setBrandCustomerId(data.id);
      setBrandContactId(null);
      setBrandQuickOpen(false);
      setBrandQuickName("");
      setBrandQuickEmail("");
      toast({ title: "Brand creato", description: data.name });
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", { customerId: brandCustomerId }],
    queryFn: () => brandCustomerId
      ? fetch(`/api/contacts?customerId=${brandCustomerId}`, { credentials: "include" }).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!brandCustomerId,
  });
  const { data: talents = [] } = useQuery<TalentListItem[]>({ queryKey: ["/api/talents"] });

  // Cache of talent.rates loaded on demand for prefill
  const [ratesByTalent, setRatesByTalent] = useState<Record<number, TalentRate[]>>({});
  async function ensureTalentRates(tid: number): Promise<TalentRate[]> {
    if (ratesByTalent[tid]) return ratesByTalent[tid];
    try {
      const res = await fetch(`/api/talents/${tid}`, { credentials: "include" });
      if (!res.ok) return [];
      const t = await res.json();
      const r: TalentRate[] = Array.isArray(t.rates) ? t.rates : [];
      setRatesByTalent(prev => ({ ...prev, [tid]: r }));
      return r;
    } catch { return []; }
  }
  function rateFor(rates: TalentRate[], deliverableType: string): string | null {
    const m = rates.find(r => r.deliverableType === deliverableType);
    return m ? String(m.basePriceEur ?? "0") : null;
  }

  // Load existing quote in edit mode
  const { data: existing, isLoading: loadingExisting } = useQuery<TalentQuoteWithItems>({
    queryKey: ["/api/quotes", editId],
    queryFn: () => fetch(`/api/quotes/${editId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!editId,
  });
  useEffect(() => {
    if (!existing) return;
    setBrandCustomerId(existing.brandCustomerId);
    setBrandContactId(existing.brandContactId ?? null);
    setSubject(existing.subject);
    setValidUntil(existing.validUntil ? new Date(existing.validUntil).toISOString().slice(0, 10) : "");
    setPaymentTerms(existing.paymentTerms ?? "");
    setNotes(existing.notes ?? "");
    setInternalNotes(existing.internalNotes ?? "");
    setItems(existing.items.length ? existing.items.map(it => ({
      talentId: it.talentId, talentName: it.talentName,
      deliverableType: it.deliverableType as any,
      quantity: it.quantity, unitPriceEur: String(it.unitPriceEur ?? "0"),
      discountPct: String(it.discountPct ?? "0"), notes: it.notes ?? "",
    })) : [newItem()]);
  }, [existing]);

  const total = useMemo(
    () => items.reduce((acc, it) => acc + computeRowTotal(it), 0),
    [items],
  );

  const saveMutation = useMutation({
    mutationFn: async (status: "draft" | "sent") => {
      const payload = {
        quote: {
          brandCustomerId,
          brandContactId: brandContactId ?? null,
          subject,
          status,
          validUntil: validUntil ? new Date(validUntil).toISOString() : null,
          paymentTerms: paymentTerms || null,
          notes: notes || null,
          internalNotes: internalNotes || null,
        },
        items: items
          .filter(it => it.talentId)
          .map(it => ({
            talentId: it.talentId,
            talentName: it.talentName,
            deliverableType: it.deliverableType,
            quantity: it.quantity,
            unitPriceEur: it.unitPriceEur,
            discountPct: it.discountPct,
            notes: it.notes || null,
          })),
      };
      const res = editId
        ? await apiRequest("PUT", `/api/quotes/${editId}`, payload)
        : await apiRequest("POST", "/api/quotes", payload);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({ title: editId ? "Preventivo aggiornato" : "Preventivo creato" });
      navigate(`/quotes/${data.id}`);
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  function updateItem(idx: number, patch: Partial<ItemRow>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  async function selectTalent(idx: number, tid: number) {
    const t = talents.find(x => x.id === tid);
    const rates = await ensureTalentRates(tid);
    const cur = items[idx];
    const isPriceUntouched = !cur.unitPriceEur || cur.unitPriceEur === "0";
    const r = rateFor(rates, cur.deliverableType);
    setItems(prev => prev.map((it, i) => i === idx ? {
      ...it,
      talentId: tid,
      talentName: t?.displayName ?? "",
      ...(r != null && isPriceUntouched ? { unitPriceEur: r } : {}),
    } : it));
  }
  async function changeDeliverableType(idx: number, t: typeof TALENT_DELIVERABLES[number]) {
    const cur = items[idx];
    const isPriceUntouched = !cur.unitPriceEur || cur.unitPriceEur === "0";
    let r: string | null = null;
    if (cur.talentId) {
      const rates = await ensureTalentRates(cur.talentId);
      r = rateFor(rates, t);
    }
    setItems(prev => prev.map((it, i) => i === idx ? {
      ...it,
      deliverableType: t,
      ...(r != null && isPriceUntouched ? { unitPriceEur: r } : {}),
    } : it));
  }
  function addItem() { setItems(prev => [...prev, newItem()]); }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  const canStep2 = brandCustomerId != null && subject.trim().length > 0;
  const canStep3 = items.some(it => it.talentId != null);

  if (editId && loadingExisting) {
    return <Layout><div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 pb-20">
        <PageHeader
          title={editId ? "Modifica preventivo" : "Nuovo preventivo"}
          subtitle={`Step ${step} di 4`}
        />

        {/* Stepper */}
        <div className="flex items-center gap-2 text-sm">
          {["Brand", "Deliverable", "Termini", "Riepilogo"].map((label, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${
                    active ? "bg-primary text-primary-foreground" : done ? "bg-green-500 text-white" : "bg-gray-200 text-gray-600"
                  }`}
                  data-testid={`step-indicator-${n}`}
                >{n}</div>
                <span className={active ? "font-semibold" : "text-muted-foreground"}>{label}</span>
                {n < 4 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            );
          })}
        </div>

        {step === 1 && (
          <Card>
            <CardHeader><CardTitle>Brand</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="brand-customer">Brand *</Label>
                <div className="flex gap-2">
                  <Select
                    value={brandCustomerId ? String(brandCustomerId) : ""}
                    onValueChange={(v) => { setBrandCustomerId(Number(v)); setBrandContactId(null); }}
                  >
                    <SelectTrigger data-testid="select-brand-customer"><SelectValue placeholder="Seleziona brand" /></SelectTrigger>
                    <SelectContent>
                      {customers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={() => setBrandQuickOpen(true)}
                    data-testid="button-quick-brand">
                    <Building2 className="mr-1 h-4 w-4" /> Nuovo brand
                  </Button>
                </div>
              </div>

              <Dialog open={brandQuickOpen} onOpenChange={setBrandQuickOpen}>
                <DialogContent>
                  <DialogHeader><DialogTitle>Nuovo brand</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Nome *</Label>
                      <Input value={brandQuickName} onChange={(e) => setBrandQuickName(e.target.value)}
                        placeholder="Es. Acme S.p.A." data-testid="input-quick-brand-name" />
                    </div>
                    <div>
                      <Label>Email referente</Label>
                      <Input type="email" value={brandQuickEmail}
                        onChange={(e) => setBrandQuickEmail(e.target.value)}
                        placeholder="referente@brand.com" data-testid="input-quick-brand-email" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setBrandQuickOpen(false)}>Annulla</Button>
                    <Button
                      disabled={!brandQuickName.trim() || brandQuickCreate.isPending}
                      onClick={() => brandQuickCreate.mutate()}
                      data-testid="button-confirm-quick-brand"
                    >
                      {brandQuickCreate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crea"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <div>
                <Label>Contatto</Label>
                <Select
                  value={brandContactId ? String(brandContactId) : "_none"}
                  onValueChange={(v) => setBrandContactId(v === "_none" ? null : Number(v))}
                  disabled={!brandCustomerId}
                >
                  <SelectTrigger data-testid="select-brand-contact"><SelectValue placeholder="Seleziona contatto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Nessuno —</SelectItem>
                    {contacts.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.firstName} {c.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="quote-subject">Oggetto *</Label>
                <Input
                  id="quote-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Es. Campagna Estate 2026 — collabos influencer"
                  data-testid="input-quote-subject"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Deliverable
                <Button variant="outline" size="sm" onClick={addItem} data-testid="button-add-item">
                  <Plus className="mr-1 h-4 w-4" /> Aggiungi
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((it, idx) => (
                <div key={idx} className="border rounded-md p-3 space-y-2" data-testid={`item-row-${idx}`}>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-12 md:col-span-4">
                      <Label className="text-xs">Talent</Label>
                      <Select
                        value={it.talentId ? String(it.talentId) : ""}
                        onValueChange={(v) => { void selectTalent(idx, Number(v)); }}
                      >
                        <SelectTrigger data-testid={`select-item-talent-${idx}`}><SelectValue placeholder="Talent" /></SelectTrigger>
                        <SelectContent>
                          {talents.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.displayName}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label className="text-xs">Tipo</Label>
                      <Select value={it.deliverableType} onValueChange={(v) => { void changeDeliverableType(idx, v as any); }}>
                        <SelectTrigger data-testid={`select-item-type-${idx}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TALENT_DELIVERABLES.map(d => (
                            <SelectItem key={d} value={d}>{TALENT_DELIVERABLE_LABELS[d]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3 md:col-span-1">
                      <Label className="text-xs">Qtà</Label>
                      <Input type="number" min={1} value={it.quantity}
                        onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                        data-testid={`input-item-quantity-${idx}`} />
                    </div>
                    <div className="col-span-3 md:col-span-2">
                      <Label className="text-xs">€/cad</Label>
                      <Input type="number" step="0.01" min={0} value={it.unitPriceEur}
                        onChange={(e) => updateItem(idx, { unitPriceEur: e.target.value })}
                        data-testid={`input-item-price-${idx}`} />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label className="text-xs">Sconto %</Label>
                      <Input type="number" step="0.01" min={0} max={100} value={it.discountPct}
                        onChange={(e) => updateItem(idx, { discountPct: e.target.value })}
                        data-testid={`input-item-discount-${idx}`} />
                    </div>
                    <div className="col-span-6 md:col-span-1 flex items-end">
                      <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}
                        disabled={items.length === 1}
                        data-testid={`button-remove-item-${idx}`}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                  <Input value={it.notes} onChange={(e) => updateItem(idx, { notes: e.target.value })}
                    placeholder="Note (opzionale)"
                    data-testid={`input-item-notes-${idx}`} />
                  <div className="text-right text-sm text-muted-foreground">
                    Totale riga: <span className="font-semibold text-foreground">{formatEur(computeRowTotal(it))}</span>
                  </div>
                </div>
              ))}
              <div className="text-right border-t pt-3">
                <div className="text-sm text-muted-foreground">Totale preventivo</div>
                <div className="text-2xl font-bold" data-testid="text-total-preview">{formatEur(total)}</div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader><CardTitle>Termini</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="valid-until">Valido fino al</Label>
                  <Input id="valid-until" type="date" value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    data-testid="input-valid-until" />
                </div>
                <div>
                  <Label htmlFor="payment-terms">Termini di pagamento</Label>
                  <Input id="payment-terms" value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder="Es. 50% all'ordine, 50% a fine campagna"
                    data-testid="input-payment-terms" />
                </div>
              </div>
              <div>
                <Label htmlFor="notes">Note al brand</Label>
                <Textarea id="notes" rows={3} value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Visibili al brand sul PDF"
                  data-testid="input-notes" />
              </div>
              <div>
                <Label htmlFor="internal">Note interne</Label>
                <Textarea id="internal" rows={3} value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Solo per uso interno"
                  data-testid="input-internal-notes" />
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardHeader><CardTitle>Riepilogo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Brand</div>
                  <div className="font-semibold">{customers.find(c => c.id === brandCustomerId)?.name ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Contatto</div>
                  <div className="font-semibold">
                    {contacts.find(c => c.id === brandContactId)?.firstName ?? ""} {contacts.find(c => c.id === brandContactId)?.lastName ?? "—"}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-muted-foreground">Oggetto</div>
                  <div className="font-semibold">{subject}</div>
                </div>
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="text-sm font-semibold">Voci ({items.filter(i => i.talentId).length})</div>
                {items.filter(i => i.talentId).map((it, i) => (
                  <div key={i} className="flex justify-between text-sm border-b pb-1">
                    <span>{it.talentName} — {TALENT_DELIVERABLE_LABELS[it.deliverableType]} × {it.quantity}</span>
                    <span className="font-medium">{formatEur(computeRowTotal(it))}</span>
                  </div>
                ))}
              </div>
              <div className="text-right border-t pt-3">
                <div className="text-sm text-muted-foreground">Totale</div>
                <div className="text-2xl font-bold">{formatEur(total)}</div>
              </div>
              {editId ? (
                <div className="border rounded-md overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b text-sm">
                    <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Anteprima PDF</span>
                    <a href={`/api/quotes/${editId}/pdf`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-primary underline" data-testid="link-download-pdf">
                      Scarica
                    </a>
                  </div>
                  <iframe
                    src={`/api/quotes/${editId}/pdf?inline=1`}
                    title="Anteprima preventivo"
                    className="w-full"
                    style={{ height: 600, border: 0 }}
                    data-testid="iframe-pdf-preview"
                  />
                  <div className="text-xs text-muted-foreground p-2">
                    Salva eventuali modifiche per aggiornare l'anteprima.
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground bg-muted/30 border rounded-md p-3">
                  L'anteprima PDF sarà disponibile subito dopo il salvataggio del preventivo.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
            data-testid="button-step-back">
            <ChevronLeft className="mr-1 h-4 w-4" /> Indietro
          </Button>
          <div className="flex items-center gap-2">
            {step < 4 ? (
              <Button
                onClick={() => setStep(s => s + 1)}
                disabled={(step === 1 && !canStep2) || (step === 2 && !canStep3)}
                data-testid="button-step-next"
              >
                Avanti <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => saveMutation.mutate("draft")}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-draft">
                  {saveMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                  Salva bozza
                </Button>
                <Button onClick={() => saveMutation.mutate("sent")}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-send">
                  Salva e segna come Inviato
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
