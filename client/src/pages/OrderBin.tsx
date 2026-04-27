import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2, Trash2, RotateCcw, Building2, Calendar, Eye, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { InlineConfirm } from "@/components/InlineConfirm";

const statusColor: Record<string, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  completed: "bg-blue-50 text-blue-700 border-blue-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  on_hold: "bg-amber-50 text-amber-700 border-amber-200",
};
const statusLabels: Record<string, string> = {
  active: "Attiva", on_hold: "Sospesa", completed: "Completata", cancelled: "Annullata",
};

function fmtCurrency(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

export default function OrderBin() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useQuery<any[]>({
    queryKey: ["/api/orders-bin"],
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/orders/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders-bin"] });
      toast({ title: "Commessa ripristinata" });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/orders/${id}/permanent`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders-bin"] });
      toast({ title: "Commessa eliminata definitivamente" });
    },
  });

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="Cestino Commesse"
          description="Commesse eliminate che possono essere ripristinate o eliminate definitivamente."
          backHref="/orders"
          backLabel="Commesse"
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !orders || orders.length === 0 ? (
          <div className="text-center py-20">
            <Trash2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Il cestino è vuoto</p>
            <p className="text-sm text-muted-foreground mt-1">Le commesse eliminate appariranno qui.</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table data-testid="table-order-bin">
              <TableHeader>
                <TableRow>
                  <TableHead>Commessa</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Offerta</TableHead>
                  <TableHead>Totale</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Eliminata il</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order: any) => {
                  const totalPrice = order.priceSummary?.totalOrderPrice;
                  return (
                    <TableRow key={order.id} data-testid={`bin-row-${order.id}`}>
                      <TableCell>
                        <span className="font-mono font-semibold text-sm">{order.jobNumber}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm">{order.customerName || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{order.offerRef || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-mono">{fmtCurrency(totalPrice)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${statusColor[order.status] || ""}`}>
                          {statusLabels[order.status] || order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5" />
                          {order.deletedAt ? format(new Date(order.deletedAt), "dd/MM/yyyy HH:mm") : "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => restoreMutation.mutate(order.id)}
                            disabled={restoreMutation.isPending}
                            data-testid={`btn-restore-${order.id}`}
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Ripristina
                          </Button>
                          <InlineConfirm
                            trigger={
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" data-testid={`btn-perm-delete-${order.id}`}>
                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Elimina
                              </Button>
                            }
                            title="Eliminare definitivamente?"
                            description="Questa azione non può essere annullata. Tutti i dati, versioni e documenti saranno rimossi."
                            confirmLabel="Elimina"
                            cancelLabel="Annulla"
                            onConfirm={() => permanentDeleteMutation.mutate(order.id)}
                            isPending={permanentDeleteMutation.isPending}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Layout>
  );
}
