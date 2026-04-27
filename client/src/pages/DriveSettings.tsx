import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { displayVersion } from "@shared/version";
import {
  Loader2,
  ExternalLink,
  RefreshCw,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  PlugZap,
  PlayCircle,
  HardDrive,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";

interface DriveSettings {
  id: number;
  companyId: number;
  rootFolderId: string | null;
  rootFolderUrl: string | null;
  rootFolderName: string | null;
  accountEmail: string | null;
  connectedAt: string | null;
  connected: boolean;
  needsReauth?: boolean;
  scopes?: string | null;
  lastErrorMessage: string | null;
  lastErrorAt: string | null;
  updatedAt: string;
}

interface DriveItem {
  id: number;
  kind: string;
  offerId: number | null;
  offerVersion: number | null;
  driveFileName: string | null;
  driveFolderUrl: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  lastSyncedAt: string | null;
  updatedAt: string;
}

const KIND_LABELS: Record<string, string> = {
  offer_pdf: "PDF Offerta",
  drawing_pdf: "Disegno (PDF)",
  drawing_dwg: "Disegno (DWG)",
  drawing_request_attachment: "Allegato richiesta",
};

type Crumb = { id: string; name: string; driveId: string };

export default function DriveSettings() {
  const { isMaster } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [folderUrl, setFolderUrl] = useState("");
  const [path, setPath] = useState<Crumb[]>([]);

  const { data: settings, isLoading: settingsLoading } = useQuery<DriveSettings | null>({
    queryKey: ["/api/drive/settings"],
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery<DriveItem[]>({
    queryKey: ["/api/drive/items"],
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (settings?.rootFolderUrl && folderUrl === "") setFolderUrl(settings.rootFolderUrl);
  }, [settings?.rootFolderUrl]);

  // Show toast when redirected back from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") {
      toast({ title: "Account Google collegato" });
      window.history.replaceState({}, "", "/drive-settings");
      qc.invalidateQueries({ queryKey: ["/api/drive/settings"] });
    }
  }, []);

  const connect = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/drive/oauth/start", { credentials: "include" });
      if (!res.ok) throw new Error("Connessione fallita");
      const { url } = await res.json();
      window.location.href = url;
    },
    onError: () => toast({ title: "Errore avvio OAuth", variant: "destructive" }),
  });

  const saveFolder = useMutation({
    mutationFn: async () => apiRequest("PUT", "/api/drive/settings/folder", { folderUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drive/settings"] });
      toast({ title: "Cartella salvata" });
    },
    onError: (e: any) =>
      toast({ title: "Errore", description: e?.message || "Salvataggio fallito", variant: "destructive" }),
  });

  const test = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/drive/test", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Test fallito");
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/drive/settings"] });
      toast({ title: "Connessione OK", description: `Cartella: ${data.folderName || "?"}` });
    },
    onError: (e: any) => toast({ title: "Test fallito", description: e?.message, variant: "destructive" }),
  });

  const disconnect = useMutation({
    mutationFn: async () => apiRequest("DELETE", "/api/drive/settings"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drive/settings"] });
      toast({ title: "Account scollegato" });
    },
  });

  // ─ Folder picker (browser) ─
  const sharedDrivesEnabled = !!settings?.connected && !settings?.needsReauth;
  const current = path[path.length - 1] || null;

  const { data: sharedDrivesData, isLoading: drivesLoading, error: drivesError } = useQuery<{
    drives: { id: string; name: string }[];
  }>({
    queryKey: ["/api/drive/shared-drives"],
    enabled: sharedDrivesEnabled && path.length === 0,
  });
  const sharedDrives = sharedDrivesData?.drives ?? [];

  const { data: foldersData, isLoading: foldersLoading, error: foldersError } = useQuery<{
    folders: { id: string; name: string }[];
  }>({
    queryKey: ["/api/drive/folders", current?.id, current?.driveId],
    enabled: sharedDrivesEnabled && !!current,
    queryFn: async () => {
      const params = new URLSearchParams({ parentId: current!.id, driveId: current!.driveId });
      const res = await fetch(`/api/drive/folders?${params}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || "Errore caricamento cartelle");
      }
      return res.json();
    },
  });
  const folders = foldersData?.folders ?? [];

  const setAsDestination = useMutation({
    mutationFn: async () => {
      if (!current) throw new Error("Apri prima un Drive Condiviso");
      const folderId = current.id;
      const folderName = path.map(p => p.name).join(" / ");
      return apiRequest("PUT", "/api/drive/settings/folder", { folderId, folderName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drive/settings"] });
      toast({
        title: "Destinazione impostata",
        description: "Premi Test sulla cartella radice per verificare i permessi di scrittura.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Errore", description: e?.message || "Salvataggio fallito", variant: "destructive" }),
  });

  const retryAll = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/drive/items/retry-errors", { method: "POST", credentials: "include" });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/drive/items"] });
      toast({ title: `Reinseriti in coda: ${data.count}` });
    },
  });

  const retryOne = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/drive/items/${id}/retry`, { method: "POST", credentials: "include" });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/drive/items"] }),
  });

  const backfill = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/drive/backfill", { method: "POST", credentials: "include" });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/drive/items"] });
      toast({ title: "Backfill avviato", description: `Offerte in coda: ${data.offers}` });
    },
  });

  if (!isMaster) {
    return (
      <Layout>
        <div className="max-w-4xl">
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Accesso riservato all'utente master.
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const queued = items.filter(i => i.status === "queued").length;
  const errored = items.filter(i => i.status === "error").length;
  const ok = items.filter(i => i.status === "ok").length;

  return (
    <Layout>
      <div className="max-w-4xl space-y-6">
        <PageHeader
          title="Impostazioni Google Drive"
          subtitle="Collega l'account Google, scegli la cartella radice e monitora la coda di sincronizzazione."
        />

        {settings?.connected && !settings?.needsReauth && (
          <div className="text-sm">
            <Link href="/drive-archive">
              <Button variant="outline" size="sm" data-testid="link-drive-browser">
                <HardDrive className="w-3.5 h-3.5 mr-1.5" /> Vai a Drive Condivisi
              </Button>
            </Link>
          </div>
        )}

        <Card data-testid="card-drive-connection">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlugZap className="w-4 h-4" /> Account Google
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {settingsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
              </div>
            ) : settings?.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span data-testid="text-account-email">
                    Collegato come <strong>{settings.accountEmail || "?"}</strong>
                  </span>
                  {settings.connectedAt && (
                    <span className="text-muted-foreground">
                      — da {format(new Date(settings.connectedAt), "dd MMM yyyy HH:mm")}
                    </span>
                  )}
                </div>
                {settings.needsReauth && (
                  <div
                    className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 text-sm flex items-start gap-2"
                    data-testid="banner-needs-reauth"
                  >
                    <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-700 dark:text-amber-300 shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium text-amber-900 dark:text-amber-200">
                        Permessi aggiornati: riconnetti l'account per attivare i Drive Condivisi.
                      </div>
                      <div className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                        Quando Google chiede l'autorizzazione, conferma anche l'accesso ai Drive Condivisi. Se il
                        consent screen del progetto Google è in modalità <strong>Testing</strong>, accertati che il tuo
                        account sia tra i tester abilitati; per uso interno con un dominio Workspace dedicato puoi
                        impostare il consent screen su <strong>Internal</strong> per evitare la verifica Google.
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => connect.mutate()}
                      disabled={connect.isPending}
                      data-testid="button-reauth"
                    >
                      Riconnetti ora
                    </Button>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => connect.mutate()}
                    disabled={connect.isPending}
                    data-testid="button-reconnect"
                  >
                    Riconnetti
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnect.mutate()}
                    disabled={disconnect.isPending}
                    data-testid="button-disconnect"
                  >
                    Scollega
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Nessun account Google collegato. Verrà richiesto l'accesso ai tuoi file e Drive Condivisi su Google
                  Drive per archiviare offerte e disegni.
                </div>
                <Button
                  onClick={() => connect.mutate()}
                  disabled={connect.isPending}
                  data-testid="button-connect-google"
                >
                  {connect.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <PlugZap className="w-4 h-4 mr-2" />
                  )}
                  Collega account Google
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {sharedDrivesEnabled && (
          <Card data-testid="card-folder-picker">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="w-4 h-4" /> Scegli cartella di destinazione
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Naviga fino alla cartella che vuoi usare come radice dell'archivio, poi premi "Imposta come
                destinazione".
              </p>

              {/* Breadcrumb */}
              <div className="flex items-center gap-1 text-sm flex-wrap" data-testid="breadcrumb-picker">
                <button
                  type="button"
                  onClick={() => setPath([])}
                  className="px-2 py-1 rounded hover-elevate active-elevate-2 text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  data-testid="breadcrumb-picker-root"
                >
                  <HardDrive className="w-3.5 h-3.5" /> Drive Condivisi
                </button>
                {path.map((c, i) => (
                  <span key={c.id} className="inline-flex items-center gap-1">
                    <span className="text-muted-foreground">/</span>
                    <button
                      type="button"
                      onClick={() => setPath(path.slice(0, i + 1))}
                      className="px-2 py-1 rounded hover-elevate active-elevate-2 inline-flex items-center gap-1"
                      data-testid={`breadcrumb-picker-${i}`}
                    >
                      <FolderOpen className="w-3.5 h-3.5" /> {c.name}
                    </button>
                  </span>
                ))}
              </div>

              {/* Listing */}
              {path.length === 0 ? (
                drivesError ? (
                  <div className="text-sm text-red-600 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{(drivesError as Error)?.message || "Errore caricamento Drive Condivisi"}</span>
                  </div>
                ) : drivesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Caricamento Drive Condivisi…
                  </div>
                ) : sharedDrives.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-6 text-center">
                    Nessun Drive Condiviso visibile per questo account. Usa l'URL manuale qui sotto.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="grid-picker-drives">
                    {sharedDrives.map(d => (
                      <button
                        type="button"
                        key={d.id}
                        onClick={() => setPath([{ id: d.id, name: d.name, driveId: d.id }])}
                        className="flex items-center gap-2 p-3 rounded-md border bg-card hover-elevate active-elevate-2 text-left text-sm"
                        data-testid={`button-picker-drive-${d.id}`}
                      >
                        <HardDrive className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="truncate">{d.name}</span>
                      </button>
                    ))}
                  </div>
                )
              ) : foldersError ? (
                <div className="text-sm text-red-600 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{(foldersError as Error)?.message || "Errore caricamento cartelle"}</span>
                </div>
              ) : foldersLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Caricamento cartelle…
                </div>
              ) : folders.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Questa cartella non contiene sottocartelle. Puoi impostarla come destinazione qui sotto.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="grid-picker-folders">
                  {folders.map(f => (
                    <button
                      type="button"
                      key={f.id}
                      onClick={() => setPath([...path, { id: f.id, name: f.name, driveId: current!.driveId }])}
                      className="flex items-center gap-2 p-3 rounded-md border bg-card hover-elevate active-elevate-2 text-left text-sm"
                      data-testid={`button-picker-folder-${f.id}`}
                    >
                      <FolderOpen className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 items-center pt-1">
                <Button
                  onClick={() => setAsDestination.mutate()}
                  disabled={!current || setAsDestination.isPending}
                  data-testid="button-set-destination"
                >
                  {setAsDestination.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Imposta cartella corrente come destinazione
                </Button>
                {path.length > 0 && (
                  <Button variant="outline" onClick={() => setPath(path.slice(0, -1))} data-testid="button-go-up">
                    Cartella superiore
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card data-testid="card-drive-folder">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4" /> Cartella radice Drive
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cartella in cui verranno salvati offerte, disegni e allegati. Struttura:{" "}
              <code>radice/anno/{`{codice - cliente}`}/{`{versione}`}/</code>. Puoi sceglierla con il browser qui sopra
              oppure incollare un URL Drive.
            </p>
            <div className="flex gap-2">
              <Input
                value={folderUrl}
                onChange={e => setFolderUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/…"
                data-testid="input-folder-url"
              />
              <Button
                onClick={() => saveFolder.mutate()}
                disabled={!folderUrl || saveFolder.isPending}
                data-testid="button-save-folder"
              >
                {saveFolder.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salva"}
              </Button>
              <Button
                variant="outline"
                onClick={() => test.mutate()}
                disabled={!settings?.connected || test.isPending}
                data-testid="button-test-folder"
              >
                {test.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test"}
              </Button>
            </div>
            {settings?.rootFolderName && (
              <div className="text-xs text-muted-foreground">
                Cartella attuale: <strong>{settings.rootFolderName}</strong>
              </div>
            )}
            {settings?.lastErrorMessage && (
              <div className="text-xs text-red-600 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{settings.lastErrorMessage}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-drive-queue">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Coda di sincronizzazione</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" data-testid="badge-status-ok">
                  {ok} OK
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  data-testid="badge-status-queued"
                >
                  {queued} in coda
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  data-testid="badge-status-error"
                >
                  {errored} errore
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => retryAll.mutate()}
                disabled={!errored || retryAll.isPending}
                data-testid="button-retry-all"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Riprova errori
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => backfill.mutate()}
                disabled={!settings?.connected || !settings?.rootFolderId || backfill.isPending}
                data-testid="button-backfill"
              >
                <PlayCircle className="w-3.5 h-3.5 mr-1.5" /> Backfill offerte esistenti
              </Button>
            </div>
            {itemsLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
              </div>
            ) : items.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">Nessun elemento in archivio.</div>
            ) : (
              <div className="border rounded-md overflow-hidden text-sm">
                <table className="w-full">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Offerta</th>
                      <th className="px-3 py-2">Stato</th>
                      <th className="px-3 py-2">Aggiornato</th>
                      <th className="px-3 py-2 text-right">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.id} className="border-t" data-testid={`row-drive-item-${item.id}`}>
                        <td className="px-3 py-2">{KIND_LABELS[item.kind] || item.kind}</td>
                        <td className="px-3 py-2">
                          {item.offerId ? `#${item.offerId} v${displayVersion(item.offerVersion)}` : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {item.status === "ok" && (
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              OK
                            </Badge>
                          )}
                          {item.status === "queued" && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700">
                              In coda ({item.attempts})
                            </Badge>
                          )}
                          {item.status === "error" && (
                            <Badge variant="outline" className="bg-red-50 text-red-700" title={item.lastError || ""}>
                              Errore
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {format(new Date(item.updatedAt), "dd/MM HH:mm")}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex gap-1">
                            {item.driveFolderUrl && (
                              <a
                                href={item.driveFolderUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid={`link-folder-${item.id}`}
                              >
                                <Button variant="ghost" size="sm">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </Button>
                              </a>
                            )}
                            {item.status !== "ok" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => retryOne.mutate(item.id)}
                                data-testid={`button-retry-${item.id}`}
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
