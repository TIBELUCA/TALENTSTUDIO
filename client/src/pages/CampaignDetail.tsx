import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Plus, Trash2, Mail, Pencil, FileText, History,
  TrendingUp, Wallet, Package, Megaphone, ExternalLink, ArrowUp, ArrowDown, Building2, MessageSquare,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS, type CampaignStatus,
  DELIVERABLE_STATUSES, DELIVERABLE_STATUS_LABELS, type DeliverableStatus,
  PAYMENT_IN_STATUSES, PAYMENT_IN_STATUS_LABELS,
  PAYMENT_OUT_STATUSES, PAYMENT_OUT_STATUS_LABELS,
  TALENT_DELIVERABLES, TALENT_DELIVERABLE_LABELS, type TalentDeliverable,
  type CampaignWithRelations, type TalentListItem, type CampaignVersion,
} from "@shared/schema";

type CampaignVersionRow = CampaignVersion & { isCurrent: boolean };

function fmtDateTime(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

const CAMPAIGN_STATUS_BADGE: Record<CampaignStatus, string> = {
  briefing: "bg-amber-100 text-amber-800 border-amber-300",
  production: "bg-blue-100 text-blue-800 border-blue-300",
  publishing: "bg-purple-100 text-purple-800 border-purple-300",
  closed: "bg-green-100 text-green-800 border-green-300",
};
const DELIV_BADGE: Record<DeliverableStatus, string> = {
  briefing: "bg-gray-100 text-gray-800 border-gray-300",
  draft_received: "bg-amber-100 text-amber-800 border-amber-300",
  approved: "bg-blue-100 text-blue-800 border-blue-300",
  published: "bg-green-100 text-green-800 border-green-300",
};

function formatEur(v: any) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v ?? 0));
}
function formatDate(d: any) { return d ? new Date(d).toLocaleDateString("it-IT") : "—"; }
function isoDate(d: any) { return d ? new Date(d).toISOString().slice(0, 10) : ""; }

export default function CampaignDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("deliverables");

  const { data: campaign, isLoading } = useQuery<CampaignWithRelations>({
    queryKey: ["/api/campaigns", id],
    queryFn: () => fetch(`/api/campaigns/${id}`, { credentials: "include" }).then(r => r.json()),
  });
  const { data: settings } = useQuery<{ paymentsEnabled: boolean }>({
    queryKey: ["/api/talent-settings"],
  });
  const paymentsEnabled = settings?.paymentsEnabled === true;
  const { data: talents = [] } = useQuery<TalentListItem[]>({ queryKey: ["/api/talents"] });

  const updateCampaign = useMutation({
    mutationFn: (patch: any) => apiRequest("PUT", `/api/campaigns/${id}`, patch).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campagna aggiornata" });
    },
  });

  const deleteCampaign = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campagna eliminata" });
      navigate("/campaigns");
    },
  });

  if (isLoading) {
    return <Layout><div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div></Layout>;
  }
  if (!campaign) {
    return <Layout><div className="max-w-3xl mx-auto p-6"><Card><CardContent className="py-10 text-center">Campagna non trovata</CardContent></Card></div></Layout>;
  }

  const status = campaign.status as CampaignStatus;

  const totalIn = campaign.paymentsIn.reduce((a, p) => a + Number(p.amountEur || 0), 0);
  const totalInPaid = campaign.paymentsIn.filter(p => p.status === "paid").reduce((a, p) => a + Number(p.amountEur || 0), 0);
  const totalOut = campaign.paymentsOut.reduce((a, p) => a + Number(p.amountEur || 0), 0);
  const totalOutPaid = campaign.paymentsOut.filter(p => p.status === "paid").reduce((a, p) => a + Number(p.amountEur || 0), 0);

  const publishedCount = campaign.deliverables.filter(d => d.status === "published").length;
  const totalsMetrics = campaign.deliverables.reduce((acc, d) => {
    if (d.metrics) {
      acc.views += d.metrics.views ?? 0;
      acc.likes += d.metrics.likes ?? 0;
      acc.comments += d.metrics.comments ?? 0;
    }
    return acc;
  }, { views: 0, likes: 0, comments: 0 });

  const composeSubject = encodeURIComponent(`Campagna ${campaign.code} — ${campaign.name}`);
  const bodyLines = [
    `Ciao,`,
    ``,
    `aggiornamento sulla campagna "${campaign.name}" (${campaign.code}):`,
    `• Deliverable: ${publishedCount}/${campaign.deliverables.length} pubblicati`,
    `• Views totali: ${totalsMetrics.views.toLocaleString("it-IT")}`,
    `• Engagement: ${totalsMetrics.likes.toLocaleString("it-IT")} like · ${totalsMetrics.comments.toLocaleString("it-IT")} commenti`,
    ``,
    `Resto a disposizione per qualsiasi chiarimento.`,
    ``,
    `— Giovanna`,
  ];
  const composeBody = encodeURIComponent(bodyLines.join("\n"));
  const emailHref = `/email?compose=1&subject=${composeSubject}&body=${composeBody}&campaignId=${campaign.id}`;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6 pb-20">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <span className="font-mono text-base text-muted-foreground">{campaign.code}</span>
              <Badge variant="outline" className="font-mono text-xs" data-testid="badge-campaign-version">
                v{campaign.currentVersion ?? 1}
              </Badge>
              <Badge variant="outline" className={CAMPAIGN_STATUS_BADGE[status]}>{CAMPAIGN_STATUS_LABELS[status]}</Badge>
            </span>
          }
          subtitle={campaign.name}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} data-testid="button-edit-campaign">
                <Pencil className="mr-1 h-4 w-4" /> Modifica
              </Button>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("history")} data-testid="button-show-history">
                <History className="mr-1 h-4 w-4" /> Storico
              </Button>
              <Link href={emailHref}>
                <Button variant="outline" size="sm" data-testid="button-compose-email">
                  <Mail className="mr-1 h-4 w-4" /> Componi email
                </Button>
              </Link>
              {campaign.quoteId && (
                <Link href={`/quotes/${campaign.quoteId}`}>
                  <Button variant="outline" size="sm" data-testid="button-go-quote">
                    <FileText className="mr-1 h-4 w-4" /> Preventivo
                  </Button>
                </Link>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-delete-campaign">
                    <Trash2 className="mr-1 h-4 w-4 text-red-600" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminare la campagna?</AlertDialogTitle>
                    <AlertDialogDescription>Anche tutti i deliverable e pagamenti collegati verranno persi.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteCampaign.mutate()}>Elimina</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          }
        />

        {/* Header summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Brand</CardTitle></CardHeader>
            <CardContent>
              <div className="font-semibold">{campaign.brandName ?? "—"}</div>
              {campaign.brandContactName && <div className="text-sm text-muted-foreground">{campaign.brandContactName}</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Stato</CardTitle></CardHeader>
            <CardContent>
              <Select value={status} onValueChange={(v) => updateCampaign.mutate({ status: v })}>
                <SelectTrigger data-testid="select-campaign-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{CAMPAIGN_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground mt-1">
                {campaign.startDate && <>Inizio: {formatDate(campaign.startDate)} </>}
                {campaign.endDate && <>· Fine: {formatDate(campaign.endDate)}</>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Valore</CardTitle></CardHeader>
            <CardContent>
              <div className="text-xl font-bold" data-testid="text-campaign-value">{formatEur(campaign.totalValueEur)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Avanzamento</CardTitle></CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {campaign.deliverables.filter(d => d.status === "published").length}/{campaign.deliverables.length}
              </div>
              <div className="text-xs text-muted-foreground">deliverable pubblicati</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="deliverables" data-testid="tab-deliverables">
              <Package className="mr-1 h-4 w-4" /> Deliverable
            </TabsTrigger>
            <TabsTrigger value="metrics" data-testid="tab-metrics">
              <TrendingUp className="mr-1 h-4 w-4" /> Metriche
            </TabsTrigger>
            {paymentsEnabled && (
              <TabsTrigger value="payments" data-testid="tab-payments">
                <Wallet className="mr-1 h-4 w-4" /> Pagamenti
              </TabsTrigger>
            )}
            <TabsTrigger value="documents" data-testid="tab-documents">
              <FileText className="mr-1 h-4 w-4" /> Documenti
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">
              <History className="mr-1 h-4 w-4" /> Storico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deliverables" className="mt-4">
            <DeliverablesTab campaign={campaign} talents={talents} />
          </TabsContent>
          <TabsContent value="metrics" className="mt-4">
            <MetricsTab campaign={campaign} />
          </TabsContent>
          {paymentsEnabled && (
            <TabsContent value="payments" className="mt-4">
              <PaymentsTab campaign={campaign} totalIn={totalIn} totalInPaid={totalInPaid}
                totalOut={totalOut} totalOutPaid={totalOutPaid} talents={talents} />
            </TabsContent>
          )}
          <TabsContent value="documents" className="mt-4">
            <DocumentsTab campaign={campaign} />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <HistoryTab campaign={campaign} />
          </TabsContent>
        </Tabs>

        <EditCampaignDialog campaign={campaign} open={editOpen} onOpenChange={setEditOpen} />
      </div>
    </Layout>
  );
}

// =============== Edit campaign dialog ===============
function EditCampaignDialog({ campaign, open, onOpenChange }: {
  campaign: CampaignWithRelations;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => ({
    name: campaign.name,
    status: campaign.status as CampaignStatus,
    startDate: isoDate(campaign.startDate),
    endDate: isoDate(campaign.endDate),
    totalValueEur: String(campaign.totalValueEur ?? "0"),
    notes: campaign.notes ?? "",
  }));

  // Reset form when the dialog opens with a new campaign snapshot
  useEffect(() => {
    if (open) {
      setForm({
        name: campaign.name,
        status: campaign.status as CampaignStatus,
        startDate: isoDate(campaign.startDate),
        endDate: isoDate(campaign.endDate),
        totalValueEur: String(campaign.totalValueEur ?? "0"),
        notes: campaign.notes ?? "",
      });
    }
  }, [open, campaign]);

  const mut = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", `/api/campaigns/${campaign.id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id, "versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Campagna aggiornata", description: "È stata creata una nuova versione." });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err?.message || "Impossibile salvare", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Modifica campagna</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome campagna</Label>
            <Input value={form.name} onChange={(e) => setForm(s => ({ ...s, name: e.target.value }))}
              data-testid="input-edit-campaign-name" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Stato</Label>
              <Select value={form.status} onValueChange={(v) => setForm(s => ({ ...s, status: v as CampaignStatus }))}>
                <SelectTrigger data-testid="select-edit-campaign-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{CAMPAIGN_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valore totale (€)</Label>
              <Input type="number" step="0.01" value={form.totalValueEur}
                onChange={(e) => setForm(s => ({ ...s, totalValueEur: e.target.value }))}
                data-testid="input-edit-campaign-value" />
            </div>
            <div>
              <Label>Data inizio</Label>
              <Input type="date" value={form.startDate}
                onChange={(e) => setForm(s => ({ ...s, startDate: e.target.value }))}
                data-testid="input-edit-campaign-start" />
            </div>
            <div>
              <Label>Data fine</Label>
              <Input type="date" value={form.endDate}
                onChange={(e) => setForm(s => ({ ...s, endDate: e.target.value }))}
                data-testid="input-edit-campaign-end" />
            </div>
          </div>
          <div>
            <Label>Note</Label>
            <Textarea rows={3} value={form.notes}
              onChange={(e) => setForm(s => ({ ...s, notes: e.target.value }))}
              data-testid="textarea-edit-campaign-notes" />
          </div>
          <div className="text-xs text-muted-foreground bg-muted/30 border rounded-md px-3 py-2">
            Ogni modifica salvata genera una nuova versione nello storico, così puoi sempre rivedere chi ha cambiato cosa.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button
            disabled={mut.isPending || !form.name.trim()}
            onClick={() => mut.mutate({
              name: form.name.trim(),
              status: form.status,
              startDate: form.startDate || null,
              endDate: form.endDate || null,
              totalValueEur: form.totalValueEur || "0",
              notes: form.notes.trim() || null,
            })}
            data-testid="button-save-edit-campaign"
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============== History tab ===============
function HistoryTab({ campaign }: { campaign: CampaignWithRelations }) {
  const { data: versions, isLoading } = useQuery<CampaignVersionRow[]>({
    queryKey: ["/api/campaigns", campaign.id, "versions"],
    queryFn: () => fetch(`/api/campaigns/${campaign.id}/versions`, { credentials: "include" }).then(r => r.json()),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-5 w-5 text-primary" />
          Storico versioni ({versions?.length ?? 0})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border-2 border-primary/30 bg-primary/5 p-3" data-testid="version-row-current">
          <div className="flex items-center gap-3">
            <Badge className="font-mono text-xs shrink-0 bg-primary text-primary-foreground">
              v{campaign.currentVersion ?? 1} — Attuale
            </Badge>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{campaign.lastModifiedByName || "—"}</span>
                <span className="text-muted-foreground text-xs">{fmtDateTime(campaign.updatedAt)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Stato corrente della campagna — quello che stai visualizzando.</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : !versions || versions.length === 0 ? (
          <div className="text-center text-muted-foreground py-6">Nessuna versione precedente.</div>
        ) : (
          versions.map((v) => (
            <div key={v.id} className="rounded-lg border bg-muted/20 p-3" data-testid={`version-row-${v.versionNumber}`}>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="font-mono text-xs shrink-0">v{v.versionNumber}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{v.modifiedByName || "—"}</span>
                    <span className="text-muted-foreground text-xs">{fmtDateTime(v.createdAt)}</span>
                  </div>
                  {v.changeNotes && (
                    <p className="text-xs text-muted-foreground mt-0.5">{v.changeNotes}</p>
                  )}
                </div>
              </div>
              {v.changeSummary && v.changeSummary.length > 0 ? (
                <ul className="mt-2 ml-9 space-y-0.5">
                  {v.changeSummary.map((change, ci) => (
                    <li key={ci} className="text-xs text-muted-foreground flex items-start gap-1.5"
                      data-testid={`version-change-${v.versionNumber}-${ci}`}>
                      <span className="text-primary mt-0.5 shrink-0">•</span>
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground mt-2 ml-9 italic">Nessuna differenza rilevata.</p>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// =============== Deliverables tab ===============
function DeliverablesTab({ campaign, talents }: { campaign: CampaignWithRelations; talents: TalentListItem[] }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<{ id: number; status: DeliverableStatus; plannedDate: string; postUrl: string; notes: string } | null>(null);

  const addMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/campaigns/${campaign.id}/deliverables`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id] });
      toast({ title: "Deliverable aggiunto" });
      setAdding(false);
    },
  });

  const updMut = useMutation({
    mutationFn: ({ did, data }: { did: number; data: any }) =>
      apiRequest("PUT", `/api/campaigns/${campaign.id}/deliverables/${did}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id] });
      toast({ title: "Deliverable aggiornato" });
      setEdit(null);
    },
  });

  const delMut = useMutation({
    mutationFn: (did: number) => apiRequest("DELETE", `/api/campaigns/${campaign.id}/deliverables/${did}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id] }),
  });

  const reorderMut = useMutation({
    mutationFn: (orderedIds: number[]) =>
      apiRequest("POST", `/api/campaigns/${campaign.id}/deliverables/reorder`, { orderedIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id] }),
  });

  function move(idx: number, dir: -1 | 1) {
    const ids = campaign.deliverables.map(d => d.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    reorderMut.mutate(ids);
  }

  const [newDel, setNewDel] = useState({
    talentId: "", deliverableType: "post" as TalentDeliverable, quantity: 1,
    unitPriceEur: "0", plannedDate: "", postUrl: "", notes: "",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          Deliverable ({campaign.deliverables.length})
          <Button size="sm" onClick={() => setAdding(true)} data-testid="button-add-deliverable">
            <Plus className="mr-1 h-4 w-4" /> Aggiungi
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {campaign.deliverables.length === 0 ? (
          <div className="text-center text-muted-foreground py-6">Nessun deliverable.</div>
        ) : campaign.deliverables.map((d, idx) => {
          const status = d.status as DeliverableStatus;
          return (
            <div key={d.id} className="flex items-center gap-3 p-3 border rounded-md" data-testid={`row-deliverable-${d.id}`}>
              <div className="flex flex-col gap-0.5">
                <Button variant="ghost" size="icon" className="h-6 w-6"
                  disabled={idx === 0 || reorderMut.isPending}
                  onClick={() => move(idx, -1)}
                  data-testid={`button-move-up-${d.id}`}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6"
                  disabled={idx === campaign.deliverables.length - 1 || reorderMut.isPending}
                  onClick={() => move(idx, 1)}
                  data-testid={`button-move-down-${d.id}`}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{d.talentName}</span>
                  <Badge variant="outline">{TALENT_DELIVERABLE_LABELS[d.deliverableType as TalentDeliverable] ?? d.deliverableType}</Badge>
                  <Badge variant="outline" className={DELIV_BADGE[status]}>{DELIVERABLE_STATUS_LABELS[status]}</Badge>
                  {d.postUrl && (
                    <a href={d.postUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      data-testid={`link-post-${d.id}`}>
                      Post <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Qtà {d.quantity} · {formatEur(d.unitPriceEur)} cad
                  {d.plannedDate && <> · Pianificato {formatDate(d.plannedDate)}</>}
                  {d.publishedDate && <> · Pubblicato {formatDate(d.publishedDate)}</>}
                </div>
              </div>
              <Select value={status} onValueChange={(v) => updMut.mutate({ did: d.id, data: { status: v } })}>
                <SelectTrigger className="w-40" data-testid={`select-deliverable-status-${d.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DELIVERABLE_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{DELIVERABLE_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => setEdit({
                id: d.id, status, plannedDate: isoDate(d.plannedDate),
                postUrl: d.postUrl ?? "", notes: d.notes ?? "",
              })} data-testid={`button-edit-deliverable-${d.id}`}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => delMut.mutate(d.id)} data-testid={`button-delete-deliverable-${d.id}`}>
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          );
        })}

        {/* Add dialog */}
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuovo deliverable</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Talent</Label>
                <Select value={newDel.talentId} onValueChange={(v) => setNewDel(s => ({ ...s, talentId: v }))}>
                  <SelectTrigger data-testid="select-new-deliverable-talent"><SelectValue placeholder="Seleziona" /></SelectTrigger>
                  <SelectContent>
                    {talents.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.displayName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={newDel.deliverableType} onValueChange={(v) => setNewDel(s => ({ ...s, deliverableType: v as TalentDeliverable }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TALENT_DELIVERABLES.map(d => (
                        <SelectItem key={d} value={d}>{TALENT_DELIVERABLE_LABELS[d]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantità</Label>
                  <Input type="number" min={1} value={newDel.quantity}
                    onChange={(e) => setNewDel(s => ({ ...s, quantity: Math.max(1, Number(e.target.value)) }))} />
                </div>
                <div>
                  <Label>€ cad</Label>
                  <Input type="number" step="0.01" value={newDel.unitPriceEur}
                    onChange={(e) => setNewDel(s => ({ ...s, unitPriceEur: e.target.value }))} />
                </div>
                <div>
                  <Label>Pianificato</Label>
                  <Input type="date" value={newDel.plannedDate}
                    onChange={(e) => setNewDel(s => ({ ...s, plannedDate: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAdding(false)}>Annulla</Button>
              <Button
                disabled={!newDel.talentId || addMut.isPending}
                onClick={() => {
                  const t = talents.find(x => x.id === Number(newDel.talentId));
                  addMut.mutate({
                    talentId: Number(newDel.talentId),
                    talentName: t?.displayName ?? "",
                    deliverableType: newDel.deliverableType,
                    quantity: newDel.quantity,
                    unitPriceEur: newDel.unitPriceEur,
                    plannedDate: newDel.plannedDate || null,
                    status: "briefing",
                    position: campaign.deliverables.length,
                  });
                }}
                data-testid="button-confirm-add-deliverable"
              >
                {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aggiungi"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit dialog */}
        <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Modifica deliverable</DialogTitle></DialogHeader>
            {edit && (
              <div className="space-y-3">
                <div>
                  <Label>Stato</Label>
                  <Select value={edit.status} onValueChange={(v) => setEdit(e => e ? { ...e, status: v as DeliverableStatus } : e)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DELIVERABLE_STATUSES.map(s => (
                        <SelectItem key={s} value={s}>{DELIVERABLE_STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Data pianificata</Label>
                  <Input type="date" value={edit.plannedDate}
                    onChange={(e) => setEdit(s => s ? { ...s, plannedDate: e.target.value } : s)} />
                </div>
                <div>
                  <Label>URL del post</Label>
                  <Input type="url" value={edit.postUrl}
                    placeholder="https://www.instagram.com/p/..."
                    onChange={(e) => setEdit(s => s ? { ...s, postUrl: e.target.value } : s)}
                    data-testid="input-edit-post-url" />
                </div>
                <div>
                  <Label>Note</Label>
                  <Textarea rows={3} value={edit.notes}
                    onChange={(e) => setEdit(s => s ? { ...s, notes: e.target.value } : s)} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEdit(null)}>Annulla</Button>
              <Button onClick={() => edit && updMut.mutate({
                did: edit.id,
                data: {
                  status: edit.status,
                  plannedDate: edit.plannedDate || null,
                  postUrl: edit.postUrl || null,
                  notes: edit.notes || null,
                },
              })}>Salva</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// =============== Metrics tab ===============
function MetricsTab({ campaign }: { campaign: CampaignWithRelations }) {
  const { toast } = useToast();
  const [edit, setEdit] = useState<{ deliverableId: number; views: string; likes: string; comments: string; saves: string; reach: string } | null>(null);

  const upsertMut = useMutation({
    mutationFn: (m: any) =>
      apiRequest("PUT", `/api/campaigns/${campaign.id}/deliverables/${m.deliverableId}/metrics`, m)
        .then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id] });
      toast({ title: "Metriche aggiornate" });
      setEdit(null);
    },
  });

  const totals = campaign.deliverables.reduce((acc, d) => {
    if (d.metrics) {
      acc.views += d.metrics.views ?? 0;
      acc.likes += d.metrics.likes ?? 0;
      acc.comments += d.metrics.comments ?? 0;
      acc.saves += d.metrics.saves ?? 0;
      acc.reach += d.metrics.reach ?? 0;
    }
    return acc;
  }, { views: 0, likes: 0, comments: 0, saves: 0, reach: 0 });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Metriche di campagna</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Views", v: totals.views }, { label: "Like", v: totals.likes },
            { label: "Commenti", v: totals.comments }, { label: "Salvataggi", v: totals.saves },
            { label: "Reach", v: totals.reach },
          ].map(s => (
            <div key={s.label} className="border rounded-md p-3 text-center bg-muted/20">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-xl font-bold">{s.v.toLocaleString("it-IT")}</div>
            </div>
          ))}
        </div>

        {campaign.deliverables.length === 0 ? (
          <div className="text-center text-muted-foreground py-6">Aggiungi prima dei deliverable.</div>
        ) : (
          <div className="space-y-2">
            {campaign.deliverables.map(d => (
              <div key={d.id} className="flex items-center gap-3 p-3 border rounded-md text-sm" data-testid={`row-metrics-${d.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{d.talentName} · {TALENT_DELIVERABLE_LABELS[d.deliverableType as TalentDeliverable]}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.metrics ? (
                      <>
                        Views {d.metrics.views ?? 0} · Like {d.metrics.likes ?? 0} · Commenti {d.metrics.comments ?? 0}
                        · Salvati {d.metrics.saves ?? 0} · Reach {d.metrics.reach ?? 0}
                      </>
                    ) : "Nessuna metrica"}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEdit({
                  deliverableId: d.id,
                  views: String(d.metrics?.views ?? 0),
                  likes: String(d.metrics?.likes ?? 0),
                  comments: String(d.metrics?.comments ?? 0),
                  saves: String(d.metrics?.saves ?? 0),
                  reach: String(d.metrics?.reach ?? 0),
                })} data-testid={`button-edit-metrics-${d.id}`}>
                  <Pencil className="mr-1 h-3 w-3" /> {d.metrics ? "Modifica" : "Aggiungi"}
                </Button>
              </div>
            ))}
          </div>
        )}

        <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Metriche deliverable</DialogTitle></DialogHeader>
            {edit && (
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["views", "Views"], ["likes", "Like"], ["comments", "Commenti"],
                  ["saves", "Salvataggi"], ["reach", "Reach"],
                ].map(([k, label]) => (
                  <div key={k}>
                    <Label>{label}</Label>
                    <Input type="number" min={0} value={(edit as any)[k]}
                      onChange={(e) => setEdit(s => s ? { ...s, [k]: e.target.value } as any : s)}
                      data-testid={`input-metric-${k}`} />
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEdit(null)}>Annulla</Button>
              <Button onClick={() => edit && upsertMut.mutate({
                deliverableId: edit.deliverableId,
                views: Number(edit.views), likes: Number(edit.likes),
                comments: Number(edit.comments), saves: Number(edit.saves),
                reach: Number(edit.reach),
              })} data-testid="button-save-metrics">Salva</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// =============== Payments tab ===============
function PaymentsTab({
  campaign, totalIn, totalInPaid, totalOut, totalOutPaid, talents,
}: {
  campaign: CampaignWithRelations; totalIn: number; totalInPaid: number;
  totalOut: number; totalOutPaid: number; talents: TalentListItem[];
}) {
  const { toast } = useToast();
  const [addInOpen, setAddInOpen] = useState(false);
  const [addOutOpen, setAddOutOpen] = useState(false);
  const [newIn, setNewIn] = useState({ amountEur: "0", status: "to_invoice" as any, dueDate: "", invoiceRef: "", notes: "" });
  const [newOut, setNewOut] = useState({ talentId: "", amountEur: "0", commissionPct: "0", status: "to_pay" as any, paidDate: "", method: "", notes: "" });

  const addIn = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/campaigns/${campaign.id}/payments-in`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id] });
      toast({ title: "Pagamento registrato" });
      setAddInOpen(false);
    },
  });
  const updIn = useMutation({
    mutationFn: ({ pid, data }: any) => apiRequest("PUT", `/api/campaigns/${campaign.id}/payments-in/${pid}`, data).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id] }),
  });
  const delIn = useMutation({
    mutationFn: (pid: number) => apiRequest("DELETE", `/api/campaigns/${campaign.id}/payments-in/${pid}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id] }),
  });
  const addOut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/campaigns/${campaign.id}/payments-out`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id] });
      toast({ title: "Pagamento talent registrato" });
      setAddOutOpen(false);
    },
  });
  const updOut = useMutation({
    mutationFn: ({ pid, data }: any) => apiRequest("PUT", `/api/campaigns/${campaign.id}/payments-out/${pid}`, data).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id] }),
  });
  const delOut = useMutation({
    mutationFn: (pid: number) => apiRequest("DELETE", `/api/campaigns/${campaign.id}/payments-out/${pid}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id] }),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* PAYMENTS IN */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            Entrate (brand)
            <Button size="sm" onClick={() => setAddInOpen(true)} data-testid="button-add-payment-in">
              <Plus className="mr-1 h-4 w-4" /> Aggiungi
            </Button>
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            Totali: {formatEur(totalInPaid)} pagati / {formatEur(totalIn)} previsti
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {campaign.paymentsIn.length === 0 ? (
            <div className="text-center text-muted-foreground py-4">Nessun pagamento.</div>
          ) : campaign.paymentsIn.map(p => (
            <div key={p.id} className="flex items-center gap-2 p-3 border rounded-md text-sm" data-testid={`row-payment-in-${p.id}`}>
              <div className="flex-1">
                <div className="font-semibold">{formatEur(p.amountEur)} {p.invoiceRef && <span className="text-xs text-muted-foreground">· {p.invoiceRef}</span>}</div>
                <div className="text-xs text-muted-foreground">
                  {p.dueDate && <>Scad. {formatDate(p.dueDate)} </>}
                  {p.paidDate && <>· Pagato {formatDate(p.paidDate)}</>}
                </div>
              </div>
              <Select value={p.status} onValueChange={(v) => updIn.mutate({
                pid: p.id, data: { status: v, paidDate: v === "paid" ? new Date().toISOString() : p.paidDate },
              })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_IN_STATUSES.map(s => <SelectItem key={s} value={s}>{PAYMENT_IN_STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => delIn.mutate(p.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
            </div>
          ))}
          <Dialog open={addInOpen} onOpenChange={setAddInOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Pagamento in entrata</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Importo (€)</Label>
                  <Input type="number" step="0.01" value={newIn.amountEur}
                    onChange={(e) => setNewIn(s => ({ ...s, amountEur: e.target.value }))}
                    data-testid="input-payment-in-amount" />
                </div>
                <div>
                  <Label>Riferimento fattura</Label>
                  <Input value={newIn.invoiceRef}
                    onChange={(e) => setNewIn(s => ({ ...s, invoiceRef: e.target.value }))} />
                </div>
                <div>
                  <Label>Scadenza</Label>
                  <Input type="date" value={newIn.dueDate}
                    onChange={(e) => setNewIn(s => ({ ...s, dueDate: e.target.value }))} />
                </div>
                <div>
                  <Label>Note</Label>
                  <Textarea rows={2} value={newIn.notes}
                    onChange={(e) => setNewIn(s => ({ ...s, notes: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddInOpen(false)}>Annulla</Button>
                <Button onClick={() => addIn.mutate({
                  amountEur: newIn.amountEur,
                  status: "to_invoice",
                  dueDate: newIn.dueDate || null,
                  invoiceRef: newIn.invoiceRef || null,
                  notes: newIn.notes || null,
                })} data-testid="button-confirm-payment-in">Aggiungi</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* PAYMENTS OUT */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            Uscite (talent)
            <Button size="sm" onClick={() => setAddOutOpen(true)} data-testid="button-add-payment-out">
              <Plus className="mr-1 h-4 w-4" /> Aggiungi
            </Button>
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            Totali: {formatEur(totalOutPaid)} pagati / {formatEur(totalOut)} previsti
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {campaign.paymentsOut.length === 0 ? (
            <div className="text-center text-muted-foreground py-4">Nessun pagamento.</div>
          ) : campaign.paymentsOut.map(p => {
            const t = talents.find(x => x.id === p.talentId);
            return (
              <div key={p.id} className="flex items-center gap-2 p-3 border rounded-md text-sm" data-testid={`row-payment-out-${p.id}`}>
                <div className="flex-1">
                  <div className="font-semibold">{t?.displayName ?? `Talent #${p.talentId}`}</div>
                  <div className="text-xs">{formatEur(p.amountEur)} {Number(p.commissionPct) > 0 && <>· comm. {Number(p.commissionPct)}%</>} {p.method && <>· {p.method}</>}</div>
                  {p.paidDate && <div className="text-xs text-muted-foreground">Pagato {formatDate(p.paidDate)}</div>}
                </div>
                <Select value={p.status} onValueChange={(v) => updOut.mutate({
                  pid: p.id, data: { status: v, paidDate: v === "paid" ? new Date().toISOString() : p.paidDate },
                })}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_OUT_STATUSES.map(s => <SelectItem key={s} value={s}>{PAYMENT_OUT_STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => delOut.mutate(p.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
              </div>
            );
          })}
          <Dialog open={addOutOpen} onOpenChange={setAddOutOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Pagamento al talent</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Talent</Label>
                  <Select value={newOut.talentId} onValueChange={(v) => setNewOut(s => ({ ...s, talentId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
                    <SelectContent>
                      {talents.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.displayName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Importo (€)</Label>
                    <Input type="number" step="0.01" value={newOut.amountEur}
                      onChange={(e) => setNewOut(s => ({ ...s, amountEur: e.target.value }))}
                      data-testid="input-payment-out-amount" />
                  </div>
                  <div>
                    <Label>Commissione %</Label>
                    <Input type="number" step="0.01" value={newOut.commissionPct}
                      onChange={(e) => setNewOut(s => ({ ...s, commissionPct: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Metodo</Label>
                    <Input value={newOut.method} placeholder="Bonifico"
                      onChange={(e) => setNewOut(s => ({ ...s, method: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Data pagamento</Label>
                    <Input type="date" value={newOut.paidDate}
                      onChange={(e) => setNewOut(s => ({ ...s, paidDate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Note</Label>
                  <Textarea rows={2} value={newOut.notes}
                    onChange={(e) => setNewOut(s => ({ ...s, notes: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOutOpen(false)}>Annulla</Button>
                <Button
                  disabled={!newOut.talentId}
                  onClick={() => addOut.mutate({
                    talentId: Number(newOut.talentId),
                    amountEur: newOut.amountEur,
                    commissionPct: newOut.commissionPct,
                    status: newOut.paidDate ? "paid" : "to_pay",
                    paidDate: newOut.paidDate || null,
                    method: newOut.method || null,
                    notes: newOut.notes || null,
                  })}
                  data-testid="button-confirm-payment-out"
                >Aggiungi</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}

// =============== Documents & CRM tab ===============
type Interaction = {
  id: number;
  type: string;
  subject: string | null;
  notes: string | null;
  scheduledDate: string | null;
  createdAt: string;
};

function DocumentsTab({ campaign }: { campaign: CampaignWithRelations }) {
  const allAttachments = campaign.deliverables.flatMap(d => (d.attachments ?? []).map(a => ({
    ...a, deliverableId: d.id, talentName: d.talentName,
  })));

  const { data: interactions = [], isLoading } = useQuery<Interaction[]>({
    queryKey: ["/api/interactions", { customerId: campaign.brandCustomerId }],
    queryFn: () =>
      fetch(`/api/interactions?customerId=${campaign.brandCustomerId}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : []),
    enabled: !!campaign.brandCustomerId,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Allegati deliverable
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allAttachments.length === 0 ? (
            <div className="text-center text-muted-foreground py-6">
              <FileText className="mx-auto h-10 w-10 opacity-50 mb-2" />
              <p>Gli allegati ai singoli deliverable verranno mostrati qui.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {allAttachments.map((a, i) => (
                <li key={i} className="flex items-center gap-2 p-2 border rounded">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-sm">{a.originalName}</span>
                  <span className="text-xs text-muted-foreground">{a.talentName}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Storico CRM brand
            </span>
            <Link href={`/crm/companies/${campaign.brandCustomerId}`}>
              <Button variant="outline" size="sm" data-testid="button-open-brand">
                Apri brand
              </Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : interactions.length === 0 ? (
            <div className="text-center text-muted-foreground py-6">
              <MessageSquare className="mx-auto h-10 w-10 opacity-50 mb-2" />
              <p>Nessuna interazione registrata con questo brand.</p>
              <Link href={`/crm/interactions/new?customerId=${campaign.brandCustomerId}`}>
                <Button variant="outline" size="sm" className="mt-3" data-testid="button-add-interaction">
                  <Plus className="mr-1 h-4 w-4" /> Aggiungi interazione
                </Button>
              </Link>
            </div>
          ) : (
            <ul className="space-y-2" data-testid="list-crm-interactions">
              {interactions.slice(0, 10).map(i => (
                <li key={i.id} className="p-3 border rounded text-sm" data-testid={`row-interaction-${i.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Badge variant="outline">{i.type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(i.scheduledDate ?? i.createdAt)}
                    </span>
                  </div>
                  {i.subject && <div className="font-medium mt-1">{i.subject}</div>}
                  {i.notes && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{i.notes}</div>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
