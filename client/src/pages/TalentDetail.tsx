import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Pencil, Trash2, Loader2, Users, Mail, Phone, MapPin, Instagram,
  Music2, Youtube, ArrowLeft,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TalentWithDetails } from "@shared/schema";

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X (Twitter)",
};

const DELIVERABLE_LABELS: Record<string, string> = {
  post: "Post feed",
  reel: "Reel",
  story: "Story",
  video: "Video lungo",
  event: "Evento",
};

function platformIcon(p: string) {
  if (p === "instagram") return <Instagram className="w-4 h-4" />;
  if (p === "tiktok") return <Music2 className="w-4 h-4" />;
  if (p === "youtube") return <Youtube className="w-4 h-4" />;
  return <span className="font-bold">𝕏</span>;
}

export default function TalentDetail() {
  const { id } = useParams<{ id: string }>();
  const talentId = Number(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: talent, isLoading, isError } = useQuery<TalentWithDetails>({
    queryKey: ["/api/talents", talentId],
    enabled: !isNaN(talentId),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/talents/${talentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/talents"] });
      toast({ title: "Talent eliminato" });
      navigate("/talents");
    },
    onError: () => toast({ title: "Errore", description: "Impossibile eliminare", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (isError || !talent || isNaN(talentId)) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 max-w-xl text-center">
          <Users className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <h2 className="text-lg font-semibold mb-2" data-testid="text-not-found">
            Talent non trovato
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Il talent richiesto non esiste o è stato eliminato.
          </p>
          <Link href="/talents">
            <Button data-testid="button-back-to-roster">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Torna al roster
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <Link href="/talents">
          <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" /> Roster
          </Button>
        </Link>

        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              <Avatar className="w-24 h-24">
                <AvatarImage src={talent.avatarUrl ?? undefined} alt={talent.displayName} />
                <AvatarFallback className="text-2xl">
                  {talent.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h1 className="text-2xl font-bold" data-testid="text-talent-name">{talent.displayName}</h1>
                {talent.realName && (
                  <p className="text-muted-foreground" data-testid="text-real-name">{talent.realName}</p>
                )}
                {talent.bio && <p className="mt-2 text-sm" data-testid="text-bio">{talent.bio}</p>}
                <div className="flex flex-wrap gap-3 mt-3 text-sm text-muted-foreground">
                  {(talent.city || talent.country) && (
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />
                      {[talent.city, talent.country].filter(Boolean).join(", ")}
                    </span>
                  )}
                  {talent.email && (
                    <a href={`mailto:${talent.email}`} className="flex items-center gap-1 hover:underline">
                      <Mail className="w-3.5 h-3.5" /> {talent.email}
                    </a>
                  )}
                  {talent.phone && (
                    <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {talent.phone}</span>
                  )}
                </div>
                {talent.tags && talent.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {talent.tags.map(t => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Link href={`/talents/${talent.id}/edit`}>
                  <Button variant="outline" data-testid="button-edit">
                    <Pencil className="w-4 h-4 mr-2" /> Modifica
                  </Button>
                </Link>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="text-destructive" data-testid="button-delete">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminare {talent.displayName}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Verranno rimossi anche tutti i dati social, tariffe e documenti collegati.
                        L'azione non è reversibile.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteMutation.mutate()} data-testid="button-confirm-delete">
                        Elimina
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="profile">
          <TabsList className="mb-4">
            <TabsTrigger value="profile" data-testid="tab-profile">Anagrafica & Tariffe</TabsTrigger>
            <TabsTrigger value="campaigns" data-testid="tab-campaigns">Storico Campagne</TabsTrigger>
            <TabsTrigger value="performance" data-testid="tab-performance">Performance</TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">Documenti</TabsTrigger>
            <TabsTrigger value="crm" data-testid="tab-crm">Interazioni CRM</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Social & Statistiche</CardTitle>
              </CardHeader>
              <CardContent>
                {talent.socials.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessun social configurato.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {talent.socials.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 p-3 border rounded-md" data-testid={`social-${s.id}`}>
                        <div className="text-primary">{platformIcon(s.platform)}</div>
                        <div className="flex-1">
                          <div className="font-medium">{PLATFORM_LABELS[s.platform] ?? s.platform}</div>
                          <div className="text-sm text-muted-foreground">{s.handle}</div>
                          {s.statsUpdatedAt && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              Stat. agg. {new Date(s.statsUpdatedAt).toLocaleDateString("it-IT")}
                            </div>
                          )}
                        </div>
                        <div className="text-right text-sm">
                          <div className="font-semibold">{(s.followers ?? 0).toLocaleString("it-IT")}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.engagementPct ? `${s.engagementPct}% eng.` : "—"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tariffe base</CardTitle>
              </CardHeader>
              <CardContent>
                {talent.rates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessuna tariffa configurata.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {talent.rates.map(r => (
                      <div key={r.id} className="p-3 border rounded-md" data-testid={`rate-${r.id}`}>
                        <div className="text-sm text-muted-foreground">
                          {DELIVERABLE_LABELS[r.deliverableType] ?? r.deliverableType}
                        </div>
                        <div className="text-lg font-semibold">
                          {Number(r.basePriceEur).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                        </div>
                        {r.notes && <div className="text-xs text-muted-foreground mt-1">{r.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 text-sm text-muted-foreground">
                  Commissione di default: <span className="font-medium">{talent.defaultCommissionPct ?? "—"}%</span>
                </div>
              </CardContent>
            </Card>

            {talent.notes && (
              <Card>
                <CardHeader><CardTitle>Note interne</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-internal-notes">{talent.notes}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="campaigns">
            <TalentCampaignsHistory talentId={talentId} />
          </TabsContent>

          <TabsContent value="performance">
            <TalentPerformance talentId={talentId} />
          </TabsContent>

          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle>Documenti</CardTitle>
              </CardHeader>
              <CardContent>
                {talent.documents.length === 0 ? (
                  <p
                    className="text-sm text-muted-foreground"
                    data-testid="text-no-documents"
                  >
                    Nessun documento collegato. L'upload diretto (contratti,
                    media kit, ID) verrà attivato nella prossima fase; nel
                    frattempo si possono allegare via Drive dalla scheda
                    Profilo.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {talent.documents.map((d) => (
                      <li
                        key={d.id}
                        className="py-2 flex items-center gap-3"
                        data-testid={`document-${d.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {d.label ?? d.originalName}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {d.originalName}
                            {d.kind ? ` · ${d.kind}` : ""}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(d.uploadedAt).toLocaleDateString("it-IT")}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="crm">
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Le interazioni CRM dedicate al talent saranno collegate nella prossima fase.
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// =============== Aggregates panes ===============
type TalentAggregate = {
  campaigns: {
    campaignId: number; campaignCode: string; campaignName: string; brandName: string | null;
    status: string; deliverablesCount: number; publishedCount: number; valueEur: number; createdAt: string;
  }[];
  performance: {
    campaignsCount: number; totalRevenueEur: number; totalCommissionEur: number;
    avgViews: number; avgEngagementPct: number; deliverablesCount: number;
    topPerformerCampaignId: number | null;
  };
};

function fmtEur(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function TalentCampaignsHistory({ talentId }: { talentId: number }) {
  const { data, isLoading } = useQuery<TalentAggregate>({
    queryKey: ["/api/talents", talentId, "aggregates"],
    queryFn: () => fetch(`/api/talents/${talentId}/aggregates`, { credentials: "include" }).then(r => r.json()),
  });
  if (isLoading) return <Card><CardContent className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>;
  const list = data?.campaigns ?? [];
  return (
    <Card>
      <CardHeader><CardTitle>Storico campagne ({list.length})</CardTitle></CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nessuna campagna ancora.</p>
        ) : (
          <div className="space-y-2">
            {list.map(c => (
              <Link key={c.campaignId} href={`/campaigns/${c.campaignId}`}>
                <div className="flex items-center gap-3 p-3 border rounded-md hover-elevate cursor-pointer"
                  data-testid={`row-history-campaign-${c.campaignId}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{c.campaignCode}</span>
                      <Badge variant="outline" className="text-xs">{c.status}</Badge>
                    </div>
                    <div className="font-medium">{c.campaignName}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.brandName ?? "—"} · {c.publishedCount}/{c.deliverablesCount} pubblicati
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{fmtEur(c.valueEur)}</div>
                    <div className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("it-IT")}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TalentPerformance({ talentId }: { talentId: number }) {
  const { data, isLoading } = useQuery<TalentAggregate>({
    queryKey: ["/api/talents", talentId, "aggregates"],
    queryFn: () => fetch(`/api/talents/${talentId}/aggregates`, { credentials: "include" }).then(r => r.json()),
  });
  if (isLoading) return <Card><CardContent className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>;
  const p = data?.performance;
  if (!p || p.campaignsCount === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Ancora nessun dato di performance — completa qualche campagna per iniziare a vedere le metriche.
        </CardContent>
      </Card>
    );
  }
  const cards = [
    { label: "Campagne", value: p.campaignsCount.toString() },
    { label: "Deliverable", value: p.deliverablesCount.toString() },
    { label: "Compensi totali", value: fmtEur(p.totalRevenueEur) },
    { label: "Commissioni", value: fmtEur(p.totalCommissionEur) },
    { label: "Views medie / deliverable", value: p.avgViews.toLocaleString("it-IT") },
    { label: "Engagement medio", value: `${p.avgEngagementPct.toFixed(1)}%` },
  ];
  return (
    <Card>
      <CardHeader><CardTitle>Performance aggregata</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {cards.map(c => (
            <div key={c.label} className="border rounded-md p-3 bg-muted/20" data-testid={`stat-${c.label.toLowerCase().replace(/\s/g, "-")}`}>
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="text-xl font-bold">{c.value}</div>
            </div>
          ))}
        </div>
        {p.topPerformerCampaignId && (
          <div className="mt-4 text-sm">
            <Link href={`/campaigns/${p.topPerformerCampaignId}`}>
              <span className="text-blue-600 hover:underline" data-testid="link-top-campaign">→ Vai alla campagna top performer</span>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
