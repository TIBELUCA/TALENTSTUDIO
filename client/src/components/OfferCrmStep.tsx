import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, Bell, Calendar as CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { OfferCrmCompetitor } from "@shared/schema";

// Parse "yyyy-MM-dd" as a local Date (avoids UTC shift).
function parseLocalDate(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? undefined : dt;
}

// Parse "yyyy-MM-ddTHH:mm" (datetime-local) as a local Date.
function parseLocalDateTime(s: string): Date | undefined {
  if (!s) return undefined;
  const [datePart, timePart = "00:00"] = s.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  if (!y || !m || !d) return undefined;
  const dt = new Date(y, m - 1, d, hh || 0, mm || 0);
  return isNaN(dt.getTime()) ? undefined : dt;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export type CrmStepFormState = {
  expectedCloseDate: string;
  winProbability: number;
  budget: string;
  decisionMaker: string;
  competitors: OfferCrmCompetitor[];
  nextSteps: string;
  notes: string;
};

export type PendingReminder = {
  remindAtLocal: string;
  note: string;
};

export const EMPTY_CRM_FORM: CrmStepFormState = {
  expectedCloseDate: "",
  winProbability: 50,
  budget: "",
  decisionMaker: "",
  competitors: [],
  nextSteps: "",
  notes: "",
};

interface Props {
  form: CrmStepFormState;
  onChange: (updater: (f: CrmStepFormState) => CrmStepFormState) => void;
  pendingReminders: PendingReminder[];
  onPendingChange: (updater: (rs: PendingReminder[]) => PendingReminder[]) => void;
}

export function OfferCrmStep({ form, onChange, pendingReminders, onPendingChange }: Props) {
  const addCompetitor = () =>
    onChange(f => ({ ...f, competitors: [...f.competitors, { name: "", notes: "" }] }));
  const updateCompetitor = (idx: number, patch: Partial<OfferCrmCompetitor>) =>
    onChange(f => ({ ...f, competitors: f.competitors.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }));
  const removeCompetitor = (idx: number) =>
    onChange(f => ({ ...f, competitors: f.competitors.filter((_, i) => i !== idx) }));

  return (
    <div className="space-y-5" data-testid="step-crm">
      <div>
        <h2 className="text-lg font-semibold">Pannello CRM</h2>
        <p className="text-sm text-muted-foreground">
          Informazioni opzionali per il follow-up commerciale. Puoi modificarle in qualsiasi momento dalla pagina dell'offerta.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="crm-step-close-date">Data prevista chiusura</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="crm-step-close-date"
                type="button"
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !form.expectedCloseDate && "text-muted-foreground",
                )}
                data-testid="input-crm-step-close-date"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {form.expectedCloseDate
                  ? format(parseLocalDate(form.expectedCloseDate)!, "dd MMMM yyyy", { locale: it })
                  : "Seleziona una data"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                locale={it}
                selected={parseLocalDate(form.expectedCloseDate)}
                onSelect={(d) => onChange(f => ({
                  ...f,
                  expectedCloseDate: d ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : "",
                }))}
                initialFocus
              />
              {form.expectedCloseDate && (
                <div className="flex justify-end p-2 border-t">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange(f => ({ ...f, expectedCloseDate: "" }))}
                    data-testid="btn-clear-crm-step-close-date"
                  >
                    Cancella
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="crm-step-budget">Budget cliente (€)</Label>
          <Input
            id="crm-step-budget"
            type="number"
            min={0}
            step="0.01"
            value={form.budget}
            onChange={e => onChange(f => ({ ...f, budget: e.target.value }))}
            data-testid="input-crm-step-budget"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="input-crm-step-probability">Probabilità di chiusura</Label>
            <div className="flex items-center gap-2">
              <Input
                id="input-crm-step-probability"
                type="number"
                min={0}
                max={100}
                step={1}
                className="w-20 h-8 text-right tabular-nums"
                value={form.winProbability}
                onChange={(e) => {
                  const n = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)));
                  onChange(f => ({ ...f, winProbability: n }));
                }}
                data-testid="input-crm-step-probability"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[form.winProbability]}
            onValueChange={(v) => onChange(f => ({ ...f, winProbability: v[0] ?? 0 }))}
            data-testid="slider-crm-step-probability"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="crm-step-decision-maker">Decision maker</Label>
          <Input
            id="crm-step-decision-maker"
            value={form.decisionMaker}
            onChange={e => onChange(f => ({ ...f, decisionMaker: e.target.value }))}
            placeholder="Nome e ruolo del referente decisionale"
            data-testid="input-crm-step-decision-maker"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Competitor</Label>
          <Button type="button" variant="outline" size="sm" onClick={addCompetitor} data-testid="btn-crm-step-add-competitor">
            <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi
          </Button>
        </div>
        {form.competitors.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nessun competitor segnalato.</p>
        ) : (
          <div className="space-y-2">
            {form.competitors.map((c, idx) => (
              <div key={idx} className="flex gap-2 items-start" data-testid={`row-crm-step-competitor-${idx}`}>
                <Input
                  className="flex-1"
                  placeholder="Nome competitor"
                  value={c.name}
                  onChange={e => updateCompetitor(idx, { name: e.target.value })}
                  data-testid={`input-crm-step-competitor-name-${idx}`}
                />
                <Input
                  className="flex-1"
                  placeholder="Note (opzionale)"
                  value={c.notes ?? ""}
                  onChange={e => updateCompetitor(idx, { notes: e.target.value })}
                  data-testid={`input-crm-step-competitor-notes-${idx}`}
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeCompetitor(idx)} data-testid={`btn-crm-step-remove-competitor-${idx}`}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="crm-step-next-steps">Prossimi passi</Label>
        <Textarea
          id="crm-step-next-steps"
          rows={3}
          value={form.nextSteps}
          onChange={e => onChange(f => ({ ...f, nextSteps: e.target.value }))}
          placeholder="Es. inviare proposta rivista entro venerdì, programmare visita tecnica…"
          data-testid="textarea-crm-step-next-steps"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="crm-step-notes">Note interne</Label>
        <Textarea
          id="crm-step-notes"
          rows={3}
          value={form.notes}
          onChange={e => onChange(f => ({ ...f, notes: e.target.value }))}
          placeholder="Contesto, obiezioni, sponsor interni…"
          data-testid="textarea-crm-step-notes"
        />
      </div>

      <Card className="p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Promemoria</h3>
          <span className="text-xs text-muted-foreground">verranno creati al salvataggio dell'offerta</span>
        </div>
        <PendingReminderEditor pendingReminders={pendingReminders} onPendingChange={onPendingChange} />
      </Card>
    </div>
  );
}

function PendingReminderEditor({
  pendingReminders,
  onPendingChange,
}: {
  pendingReminders: PendingReminder[];
  onPendingChange: (updater: (rs: PendingReminder[]) => PendingReminder[]) => void;
}) {
  const addReminder = () =>
    onPendingChange(rs => [...rs, { remindAtLocal: "", note: "" }]);
  const updateReminder = (idx: number, patch: Partial<PendingReminder>) =>
    onPendingChange(rs => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeReminder = (idx: number) =>
    onPendingChange(rs => rs.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      {pendingReminders.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nessun promemoria in coda.</p>
      ) : (
        <ul className="space-y-2" data-testid="list-pending-reminders">
          {pendingReminders.map((r, idx) => {
            let preview: string | null = null;
            if (r.remindAtLocal) {
              const d = new Date(r.remindAtLocal);
              if (!isNaN(d.getTime())) preview = format(d, "dd/MM/yyyy HH:mm");
            }
            return (
              <li key={idx} className="grid grid-cols-1 md:grid-cols-[260px_1fr_auto] gap-2 items-end" data-testid={`pending-reminder-${idx}`}>
                <div className="space-y-1">
                  <Label htmlFor={`pending-reminder-when-${idx}`} className="text-xs">Quando</Label>
                  <div className="flex gap-1.5">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id={`pending-reminder-when-${idx}`}
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            "flex-1 justify-start text-left font-normal h-9",
                            !r.remindAtLocal && "text-muted-foreground",
                          )}
                          data-testid={`input-pending-reminder-when-${idx}`}
                        >
                          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                          {r.remindAtLocal
                            ? format(parseLocalDateTime(r.remindAtLocal)!, "dd MMM yyyy", { locale: it })
                            : "Data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          locale={it}
                          selected={parseLocalDateTime(r.remindAtLocal)}
                          onSelect={(d) => {
                            if (!d) {
                              updateReminder(idx, { remindAtLocal: "" });
                              return;
                            }
                            const existing = parseLocalDateTime(r.remindAtLocal);
                            const hh = existing ? existing.getHours() : 9;
                            const mm = existing ? existing.getMinutes() : 0;
                            const datePart = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
                            updateReminder(idx, { remindAtLocal: `${datePart}T${pad2(hh)}:${pad2(mm)}` });
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <div className="relative">
                      <Clock className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        type="time"
                        className="h-9 w-[110px] pl-7"
                        value={r.remindAtLocal ? r.remindAtLocal.split("T")[1] ?? "" : ""}
                        onChange={(e) => {
                          const time = e.target.value;
                          if (!time) {
                            // Keep date if any, drop time → invalid datetime-local: clear all
                            updateReminder(idx, { remindAtLocal: "" });
                            return;
                          }
                          const existing = parseLocalDateTime(r.remindAtLocal) ?? new Date();
                          const datePart = `${existing.getFullYear()}-${pad2(existing.getMonth() + 1)}-${pad2(existing.getDate())}`;
                          updateReminder(idx, { remindAtLocal: `${datePart}T${time}` });
                        }}
                        data-testid={`input-pending-reminder-time-${idx}`}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`pending-reminder-note-${idx}`} className="text-xs">Nota (opzionale)</Label>
                  <Input
                    id={`pending-reminder-note-${idx}`}
                    value={r.note}
                    onChange={e => updateReminder(idx, { note: e.target.value })}
                    placeholder="Es. richiamare per conferma"
                    data-testid={`input-pending-reminder-note-${idx}`}
                  />
                  {preview && <p className="text-[10px] text-muted-foreground">Programmato: {preview}</p>}
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeReminder(idx)} data-testid={`btn-remove-pending-reminder-${idx}`}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <Button type="button" variant="outline" size="sm" onClick={addReminder} data-testid="btn-add-pending-reminder">
        <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi promemoria
      </Button>
    </div>
  );
}
