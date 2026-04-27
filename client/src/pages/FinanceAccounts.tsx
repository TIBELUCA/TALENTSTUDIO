import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/Layout";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Landmark, RefreshCw, Plus, Trash2, Loader2, AlertTriangle,
  CreditCard, ArrowRight, CheckCircle2, XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface BankAccountRow {
  id: number;
  connection_id: number;
  provider_account_id: string;
  bank_name: string | null;
  account_name: string | null;
  iban: string | null;
  currency: string | null;
  account_type: string | null;
  latest_balance: {
    current_balance: string | null;
    available_balance: string | null;
    currency: string | null;
    fetched_at: string | null;
  } | null;
}

interface ConnectionRow {
  id: number;
  provider: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface FinanceData {
  connections: ConnectionRow[];
  accounts: BankAccountRow[];
}

export default function FinanceAccounts() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams(location.split("?")[1] || "");
  const showConnected = searchParams.get("connected") === "true";
  const showError = searchParams.get("error");

  const { data, isLoading } = useQuery<FinanceData>({
    queryKey: ["/api/finance/accounts"],
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/finance/refresh-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/accounts"] });
      toast({ title: "Dati aggiornati", description: "Conti e saldi aggiornati con successo." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare i dati bancari.", variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (connId: number) => apiRequest("DELETE", `/api/finance/connections/${connId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/accounts"] });
      toast({ title: "Connessione rimossa" });
    },
  });

  const handleConnect = async () => {
    try {
      const resp = await fetch("/api/finance/oauth/start", { credentials: "include" });
      const json = await resp.json();
      if (json.url) {
        window.location.href = json.url;
      } else if (json.message) {
        toast({ title: "Errore", description: json.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    }
  };

  const connections = data?.connections || [];
  const accounts = data?.accounts || [];

  const formatBalance = (val: string | null, currency: string | null) => {
    if (!val) return "—";
    const num = parseFloat(val);
    try {
      return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: currency || "EUR",
      }).format(num);
    } catch {
      return `${num.toFixed(2)} ${currency || "EUR"}`;
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Landmark className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-finance-title">Finanza</h1>
              <p className="text-sm text-muted-foreground">Conti bancari collegati e movimenti</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending || connections.length === 0}
              data-testid="btn-refresh-all"
            >
              {refreshMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Aggiorna dati
            </Button>
            <Button size="sm" onClick={handleConnect} data-testid="btn-connect-bank">
              <Plus className="w-4 h-4 mr-1" /> Collega banca
            </Button>
          </div>
        </div>

        {showConnected && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2 text-sm text-green-800 dark:text-green-300" data-testid="alert-connected">
            <CheckCircle2 className="w-4 h-4" />
            Conto bancario collegato con successo!
          </div>
        )}

        {showError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2 text-sm text-red-800 dark:text-red-300" data-testid="alert-error">
            <AlertTriangle className="w-4 h-4" />
            {showError === "auth_failed" && "Autorizzazione bancaria non riuscita. Riprova."}
            {showError === "token_exchange" && "Errore nello scambio dei token. Riprova."}
            {showError === "missing_params" && "Parametri mancanti nel callback."}
            {showError === "invalid_state" && "Stato di sessione non valido. Riprova."}
          </div>
        )}

        {connections.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Connessioni</h2>
            <div className="grid gap-2">
              {connections.map((conn) => (
                <div key={conn.id} className="flex items-center justify-between rounded-lg border p-3 bg-background" data-testid={`connection-${conn.id}`}>
                  <div className="flex items-center gap-3">
                    <Landmark className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">TrueLayer</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {conn.status === "active" ? (
                          <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3 h-3" /> Attiva</span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600"><XCircle className="w-3 h-3" /> {conn.status === "expired" ? "Scaduta" : conn.status}</span>
                        )}
                        <span>·</span>
                        <span>Collegata {format(new Date(conn.createdAt), "dd/MM/yyyy", { locale: it })}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnectMutation.mutate(conn.id)}
                    disabled={disconnectMutation.isPending}
                    className="text-red-600 hover:text-red-700"
                    data-testid={`btn-disconnect-${conn.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Disconnetti
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-16 space-y-3" data-testid="empty-state">
            <CreditCard className="w-12 h-12 mx-auto text-muted-foreground/40" />
            <h3 className="text-lg font-semibold text-muted-foreground">Nessun conto collegato</h3>
            <p className="text-sm text-muted-foreground">
              Collega il tuo conto bancario per visualizzare saldi e movimenti.
            </p>
            <Button onClick={handleConnect} data-testid="btn-connect-bank-empty">
              <Plus className="w-4 h-4 mr-1" /> Collega banca
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Conti</h2>
            <div className="grid gap-3">
              {accounts.map((acct) => (
                <div
                  key={acct.id}
                  className="rounded-lg border p-4 bg-background hover:border-primary/40 transition-colors cursor-pointer"
                  onClick={() => setLocation(`/finance/accounts/${acct.id}`)}
                  data-testid={`account-card-${acct.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Landmark className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate" data-testid={`text-account-name-${acct.id}`}>
                          {acct.account_name || acct.bank_name || "Conto"}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {acct.bank_name && <span>{acct.bank_name}</span>}
                          {acct.iban && (
                            <>
                              {acct.bank_name && <span>·</span>}
                              <span className="font-mono">{acct.iban}</span>
                            </>
                          )}
                          {acct.currency && (
                            <>
                              <span>·</span>
                              <span>{acct.currency}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="font-bold text-lg" data-testid={`text-balance-${acct.id}`}>
                          {formatBalance(
                            acct.latest_balance?.current_balance || null,
                            acct.latest_balance?.currency || acct.currency,
                          )}
                        </p>
                        {acct.latest_balance?.fetched_at && (
                          <p className="text-[10px] text-muted-foreground">
                            Aggiornato {format(new Date(acct.latest_balance.fetched_at), "dd/MM HH:mm", { locale: it })}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
