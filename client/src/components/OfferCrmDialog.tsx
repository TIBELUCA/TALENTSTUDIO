import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Bell, Save, BellOff } from "lucide-react";
import { format } from "date-fns";
import type { OfferCrmInfo, OfferCrmCompetitor, OfferReminder } from "@shared/schema";

interface OfferCrmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offerId: number;
  offerReference: string;
}

type FormState = {
  expectedCloseDate: string;
  winProbability: number;
  budget: string;
  decisionMaker: string;
  competitors: OfferCrmCompetitor[];
  nextSteps: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  expectedCloseDate: "",
  winProbability: 50,
  budget: "",
  decisionMaker: "",
  competitors: [],
  nextSteps: "",
  notes: "",
};

function fromCrmInfo(info: OfferCrmInfo | null | undefined): FormState {
  if (!info) return { ...EMPTY_FORM };
  return {
    expectedCloseDate: info.expectedCloseDate ?? "",
    winProbability: typeof info.winProbability === "number" ? info.winProbability : 50,
    budget: info.budget != null ? String(info.budget) : "",
    decisionMaker: info.decisionMaker ?? "",
    competitors: info.competitors ?? [],
    nextSteps: info.nextSteps ?? "",
    notes: info.notes ?? "",
  };
}

export function OfferCrmDialog({ open, onOpenChange, offerId, offerReference }: OfferCrmDialogProps) {
  const { toast } = useToast();

  const { data: crmData, isLoading: loadingCrm } = useQuery<OfferCrmInfo | null>({
    queryKey: ["/api/offers", offerId, "crm"],
    enabled: open,
  });

  const { data: reminders = [], isLoading: loadingReminders } = useQuery<OfferReminder[]>({
    queryKey: ["/api/offers", offerId, "reminders"],
    enabled: open,
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [newReminderAt, setNewReminderAt] = useState("");
  const [newReminderNote, setNewReminderNote] = useState("");

  useEffect(() => {
    if (open) {
      setForm(fromCrmInfo(crmData));
    }
  }, [open, crmData]);

  const saveCrm = useMutation({
    mutationFn: async () => {
      const payload = {
        expectedCloseDate: form.expectedCloseDate || null,
        winProbability: form.winProbability,
        budget: form.budget !== "" ? Number(form.budget) : null,
        decisionMaker: form.decisionMaker || null,
        competitors: form.competitors.filter(c => c.name.trim().length > 0),
        nextSteps: form.nextSteps || null,
        notes: form.notes || null,
      };
      await apiRequest("PUT", `/api/offers/${offerId}/crm`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers", offerId, "crm"] });
      queryClient.invalidateQueries({ queryKey: ["/api/offers", offerId] });
      toast({ title: "Dati CRM salvati" });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Errore nel salvataggio", description: msg, variant: "destructive" });
    },
  });

  const createReminder = useMutation({
    mutationFn: async () => {
      if (!newReminderAt) throw new Error("Inserisci una data e ora");
      const iso = new Date(newReminderAt).toISOString();
      await apiRequest("POST", `/api/offers/${offerId}/reminders`, {
        remindAt: iso,
        note: newReminderNote,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers", offerId, "reminders"] });
      setNewReminderAt("");
      setNewReminderNote("");
      toast({ title: "Promemoria creato" });
    },
    onError: (e: any) => {
      toast({ title: "Errore nella creazione", description: e?.message ?? String(e), variant: "destructive" });
    },
  });

  const dismissReminder = useMutation({
    mutationFn: async (rid: number) => {
      await apiRequest("PATCH", `/api/offers/${offerId}/reminders/${rid}`, { isDismissed: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers", offerId, "reminders"] });
    },
  });

  const deleteReminder = useMutation({
    mutationFn: async (rid: number) => {
      await apiRequest("DELETE", `/api/offers/${offerId}/reminders/${rid}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers", offerId, "reminders"] });
    },
  });

  const addCompetitor = () => {
    setForm(f => ({ ...f, competitors: [...f.competitors, { name: "", notes: "" }] }));
  };
  const updateCompetitor = (idx: number, patch: Partial<OfferCrmCompetitor>) => {
    setForm(f => ({
      ...f,
      competitors: f.competitors.map((c, i) => i === idx ? { ...c, ...patch } : c),
    }));
  };
  const removeCompetitor = (idx: number) => {
    setForm(f => ({ ...f, competitors: f.competitors.filter((_, i) => i !== idx) }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-offer-crm">
        <DialogHeader>
          <DialogTitle>Pannello CRM — Offerta {offerReference}</DialogTitle>
        </DialogHeader>

        {loadingCrm ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="crm-close-date">Data prevista chiusura</Label>
                <Input
                  id="crm-close-date"
                  type="date"
                  value={form.expectedCloseDate}
                  onChange={e => setForm(f => ({ ...f, expectedCloseDate: e.target.value }))}
                  data-testid="input-crm-close-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="crm-budget">Budget cliente (€)</Label>
                <Input
                  id="crm-budget"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.budget}
                  onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                  data-testid="input-crm-budget"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="input-crm-probability">Probabilità di chiusura</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="input-crm-probability"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      className="w-20 h-8 text-right tabular-nums"
                      value={form.winProbability}
                      onChange={(e) => {
                        const n = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)));
                        setForm(f => ({ ...f, winProbability: n }));
                      }}
                      data-testid="input-crm-probability"
                    />
                    <span className="text-sm text-muted-foreground" data-testid="text-crm-probability-value">%</span>
                  </div>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[form.winProbability]}
                  onValueChange={(v) => setForm(f => ({ ...f, winProbability: v[0] ?? 0 }))}
                  data-testid="slider-crm-probability"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="crm-decision-maker">Decision maker</Label>
                <Input
                  id="crm-decision-maker"
                  value={form.decisionMaker}
                  onChange={e => setForm(f => ({ ...f, decisionMaker: e.target.value }))}
                  placeholder="Nome e ruolo del referente decisionale"
                  data-testid="input-crm-decision-maker"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Competitor</Label>
                <Button type="button" variant="outline" size="sm" onClick={addCompetitor} data-testid="btn-add-competitor">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi
                </Button>
              </div>
              {form.competitors.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessun competitor segnalato.</p>
              ) : (
                <div className="space-y-2">
                  {form.competitors.map((c, idx) => (
                    <div key={idx} className="flex gap-2 items-start" data-testid={`row-competitor-${idx}`}>
                      <Input
                        className="flex-1"
                        placeholder="Nome competitor"
                        value={c.name}
                        onChange={e => updateCompetitor(idx, { name: e.target.value })}
                        data-testid={`input-competitor-name-${idx}`}
                      />
                      <Input
                        className="flex-1"
                        placeholder="Note (opzionale)"
                        value={c.notes ?? ""}
                        onChange={e => updateCompetitor(idx, { notes: e.target.value })}
                        data-testid={`input-competitor-notes-${idx}`}
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeCompetitor(idx)} data-testid={`btn-remove-competitor-${idx}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="crm-next-steps">Prossimi passi</Label>
              <Textarea
                id="crm-next-steps"
                rows={3}
                value={form.nextSteps}
                onChange={e => setForm(f => ({ ...f, nextSteps: e.target.value }))}
                placeholder="Es. inviare proposta rivista entro venerdì, programmare visita tecnica…"
                data-testid="textarea-crm-next-steps"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="crm-notes">Note interne</Label>
              <Textarea
                id="crm-notes"
                rows={3}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Contesto, obiezioni, sponsor interni…"
                data-testid="textarea-crm-notes"
              />
            </div>

            <Card className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Promemoria</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-2 items-end">
                <div className="space-y-1">
                  <Label htmlFor="reminder-when" className="text-xs">Quando</Label>
                  <Input
                    id="reminder-when"
                    type="datetime-local"
                    value={newReminderAt}
                    onChange={e => setNewReminderAt(e.target.value)}
                    data-testid="input-reminder-when"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reminder-note" className="text-xs">Nota (opzionale)</Label>
                  <Input
                    id="reminder-note"
                    value={newReminderNote}
                    onChange={e => setNewReminderNote(e.target.value)}
                    placeholder="Es. richiamare per conferma"
                    data-testid="input-reminder-note"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => createReminder.mutate()}
                  disabled={createReminder.isPending || !newReminderAt}
                  data-testid="btn-add-reminder"
                >
                  {createReminder.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                  Aggiungi
                </Button>
              </div>

              {loadingReminders ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : reminders.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessun promemoria impostato.</p>
              ) : (
                <ul className="space-y-1.5" data-testid="list-reminders">
                  {reminders.map((r) => {
                    const dt = new Date(r.remindAt as unknown as string);
                    const fired = !!r.sentAt;
                    const dismissed = !!r.isDismissed;
                    return (
                      <li
                        key={r.id}
                        className="flex items-center gap-2 text-sm border rounded-md px-2 py-1.5"
                        data-testid={`reminder-item-${r.id}`}
                      >
                        <Bell className={`w-3.5 h-3.5 ${dismissed ? "text-muted-foreground" : fired ? "text-green-600" : "text-primary"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium">
                            {format(dt, "dd/MM/yyyy HH:mm")}
                            {fired && <span className="ml-2 text-[10px] text-green-700">inviato</span>}
                            {dismissed && <span className="ml-2 text-[10px] text-muted-foreground">archiviato</span>}
                          </div>
                          {r.note && <div className="text-xs text-muted-foreground truncate">{r.note}</div>}
                        </div>
                        {!dismissed && !fired && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => dismissReminder.mutate(r.id)}
                            data-testid={`btn-dismiss-reminder-${r.id}`}
                          >
                            <BellOff className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => deleteReminder.mutate(r.id)}
                          data-testid={`btn-delete-reminder-${r.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="btn-crm-close">
            Chiudi
          </Button>
          <Button
            type="button"
            onClick={() => saveCrm.mutate()}
            disabled={saveCrm.isPending || loadingCrm}
            data-testid="btn-crm-save"
          >
            {saveCrm.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
