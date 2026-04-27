import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import {
  Loader2,
  CheckCircle2,
  PlugZap,
  HardDrive,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";

interface DriveSettings {
  id: number;
  companyId: number;
  accountEmail: string | null;
  connectedAt: string | null;
  connected: boolean;
  needsReauth?: boolean;
  scopes?: string | null;
  updatedAt: string;
}

export default function DriveSettings() {
  const { isMaster } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery<DriveSettings | null>({
    queryKey: ["/api/drive/settings"],
  });

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

  const disconnect = useMutation({
    mutationFn: async () => apiRequest("DELETE", "/api/drive/settings"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drive/settings"] });
      toast({ title: "Account scollegato" });
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

  return (
    <Layout>
      <div className="max-w-4xl space-y-6">
        <PageHeader
          title="Impostazioni Google Drive"
          subtitle="Collega l'account Google per consultare i Drive Condivisi dall'app."
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
                        Quando Google chiede l'autorizzazione, conferma anche l'accesso ai Drive Condivisi.
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
                  Nessun account Google collegato. Collega un account per poter consultare i Drive Condivisi
                  direttamente dall'app, in sola lettura.
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
      </div>
    </Layout>
  );
}
