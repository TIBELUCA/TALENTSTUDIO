import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/Layout";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Landmark, RefreshCw, Loader2, ArrowUpRight, ArrowDownLeft,
  CreditCard, Minus,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface Balance {
  currentBalance: string | null;
  availableBalance: string | null;
  currency: string | null;
  fetchedAt: string | null;
}

interface Transaction {
  id: number;
  providerTransactionId: string | null;
  transactionDate: string | null;
  amount: string | null;
  currency: string | null;
  description: string | null;
  reference: string | null;
  counterpartyName: string | null;
}

interface AccountDetail {
  account: {
    id: number;
    connectionId: number;
    providerAccountId: string;
    bankName: string | null;
    accountName: string | null;
    iban: string | null;
    currency: string | null;
    accountType: string | null;
  };
  balance: Balance | null;
  transactions: Transaction[];
  connectionStatus: string;
}

export default function FinanceAccountDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading } = useQuery<AccountDetail>({
    queryKey: ["/api/finance/accounts", accountId],
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/finance/accounts/${accountId}/refresh`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/accounts", accountId] });
      toast({ title: "Dati aggiornati" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare i dati.", variant: "destructive" });
    },
  });

  const formatCurrency = (val: string | null, currency: string | null) => {
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

  const account = data?.account;
  const balance = data?.balance;
  const transactions = data?.transactions || [];

  const filteredTx = searchTerm.trim()
    ? transactions.filter((tx) => {
        const term = searchTerm.toLowerCase();
        return (
          tx.description?.toLowerCase().includes(term) ||
          tx.counterpartyName?.toLowerCase().includes(term) ||
          tx.reference?.toLowerCase().includes(term) ||
          tx.amount?.includes(searchTerm)
        );
      })
    : transactions;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!account) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Conto non trovato.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
              <Landmark className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold" data-testid="text-account-title">
                {account.accountName || account.bankName || "Conto"}
              </h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {account.bankName && <span>{account.bankName}</span>}
                {account.iban && (
                  <>
                    {account.bankName && <span>·</span>}
                    <span className="font-mono text-xs">{account.iban}</span>
                  </>
                )}
                {account.accountType && (
                  <>
                    <span>·</span>
                    <span className="capitalize">{account.accountType}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            data-testid="btn-refresh-account"
          >
            {refreshMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-1" />
            )}
            Aggiorna
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="rounded-lg border p-4 bg-background" data-testid="card-current-balance">
            <p className="text-xs text-muted-foreground mb-1">Saldo corrente</p>
            <p className="text-2xl font-bold">
              {formatCurrency(balance?.currentBalance || null, balance?.currency || account.currency)}
            </p>
          </div>
          <div className="rounded-lg border p-4 bg-background" data-testid="card-available-balance">
            <p className="text-xs text-muted-foreground mb-1">Saldo disponibile</p>
            <p className="text-2xl font-bold">
              {formatCurrency(balance?.availableBalance || null, balance?.currency || account.currency)}
            </p>
          </div>
          <div className="rounded-lg border p-4 bg-background" data-testid="card-last-update">
            <p className="text-xs text-muted-foreground mb-1">Ultimo aggiornamento</p>
            <p className="text-lg font-semibold">
              {balance?.fetchedAt
                ? format(new Date(balance.fetchedAt), "dd/MM/yyyy HH:mm", { locale: it })
                : "—"}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Movimenti ({filteredTx.length})
            </h2>
            <input
              type="text"
              placeholder="Cerca movimenti..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-sm border rounded-md px-3 py-1.5 bg-background w-56"
              data-testid="input-search-transactions"
            />
          </div>

          {filteredTx.length === 0 ? (
            <div className="text-center py-12 space-y-2" data-testid="empty-transactions">
              <CreditCard className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {searchTerm ? "Nessun movimento trovato." : "Nessun movimento disponibile. Prova ad aggiornare i dati."}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border divide-y bg-background overflow-hidden">
              {filteredTx.map((tx) => {
                const amt = tx.amount ? parseFloat(tx.amount) : 0;
                const isCredit = amt > 0;
                return (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-3" data-testid={`transaction-${tx.id}`}>
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                      isCredit ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30",
                    )}>
                      {isCredit ? (
                        <ArrowDownLeft className="w-4 h-4 text-green-600" />
                      ) : amt < 0 ? (
                        <ArrowUpRight className="w-4 h-4 text-red-600" />
                      ) : (
                        <Minus className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {tx.counterpartyName || tx.description || "Movimento"}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {tx.transactionDate && (
                          <span>{format(new Date(tx.transactionDate), "dd/MM/yyyy", { locale: it })}</span>
                        )}
                        {tx.reference && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[200px]">{tx.reference}</span>
                          </>
                        )}
                        {tx.description && tx.counterpartyName && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[200px]">{tx.description}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <p className={cn(
                      "text-sm font-semibold tabular-nums flex-shrink-0",
                      isCredit ? "text-green-600" : amt < 0 ? "text-red-600" : "text-foreground",
                    )} data-testid={`text-tx-amount-${tx.id}`}>
                      {formatCurrency(tx.amount, tx.currency || account.currency)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
