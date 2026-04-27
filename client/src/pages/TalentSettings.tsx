import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Wallet, Lock } from "lucide-react";

export default function TalentSettings() {
  const { isMaster } = useAuth();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ paymentsEnabled: boolean }>({
    queryKey: ["/api/talent-settings"],
  });

  const togglePayments = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PUT", "/api/talent-settings/payments", { enabled }).then(r => r.json()),
    onSuccess: (d) => {
      queryClient.setQueryData(["/api/talent-settings"], d);
      toast({ title: "Impostazione aggiornata" });
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6 pb-20">
        <PageHeader
          title="Impostazioni Talent Studio"
          subtitle="Configurazioni del modulo talent"
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" /> Modulo pagamenti
            </CardTitle>
            <CardDescription>
              Quando attivo, ogni campagna mostra una scheda "Pagamenti" con entrate dai brand
              e uscite verso i talent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border rounded-md">
              <div>
                <Label htmlFor="payments-toggle" className="text-base font-medium">
                  Tracciamento pagamenti
                </Label>
                <p className="text-sm text-muted-foreground">
                  {data?.paymentsEnabled ? "Attivo per tutte le campagne" : "Disattivato"}
                </p>
              </div>
              {!isMaster ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Solo master
                </span>
              ) : (
                <Switch
                  id="payments-toggle"
                  checked={data?.paymentsEnabled ?? false}
                  disabled={isLoading || togglePayments.isPending}
                  onCheckedChange={(v) => togglePayments.mutate(v)}
                  data-testid="switch-payments-enabled"
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
