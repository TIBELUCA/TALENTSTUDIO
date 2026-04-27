import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useBinOffers, usePermanentDeleteOffer } from "@/hooks/use-offers";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2, Trash2, Calendar, User, Building2, Eye, RotateCcw, AlertTriangle, CheckSquare } from "lucide-react";
import { useState } from "react";
import { useSelection } from "@/hooks/use-selection";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectionBar } from "@/components/SelectionBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InlineConfirmButton } from "@/components/InlineConfirm";

const statusColors: Record<string, string> = {
  Draft:    "bg-blue-50   text-blue-700   border-blue-200",
  Sent:     "bg-yellow-50 text-yellow-700 border-yellow-200",
  Accepted: "bg-green-50  text-green-700  border-green-200",
  Rejected: "bg-red-50    text-red-700    border-red-200",
  Expired:  "bg-gray-50   text-gray-700   border-gray-200",
};

export default function OfferBin() {
  const { data: binOffers, isLoading } = useBinOffers();
  const { isMaster } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const selection = useSelection();
  const [bulkRestoring, setBulkRestoring] = useState(false);
  const [bulkPermanentDeleting, setBulkPermanentDeleting] = useState(false);

  const handleBulkPermanentDelete = async () => {
    const ids = Array.from(selection.selectedIds);
    setBulkPermanentDeleting(true);
    let count = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/offers/${id}/permanent`, { method: "DELETE", credentials: "include" });
        if (res.ok) count++;
      } catch {}
    }
    setBulkPermanentDeleting(false);
    queryClient.invalidateQueries({ queryKey: ["/api/offers/bin"] });
    toast({ title: `${count} offer${count !== 1 ? "s" : ""} permanently deleted` });
    selection.exitSelectionMode();
  };

  const handleBulkRestore = async () => {
    const ids = Array.from(selection.selectedIds);
    setBulkRestoring(true);
    let count = 0;
    for (const id of ids) {
      try { await apiRequest("PATCH", `/api/offers/${id}/restore`); count++; } catch {}
    }
    setBulkRestoring(false);
    queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/offers/bin"] });
    toast({ title: `${count} offer${count !== 1 ? "s" : ""} restored` });
    selection.exitSelectionMode();
  };

  const restoreMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/offers/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/offers/bin"] });
      toast({ title: "Offer restored", description: "The offer has been moved back to your offers." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to restore offer.", variant: "destructive" });
    },
  });

  const permanentDeleteMutation = usePermanentDeleteOffer();

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="Bin"
          subtitle="Deleted offers are stored here. You can view them or restore them to your active offers."
          icon={<div className="p-2 rounded-lg bg-destructive/10"><Trash2 className="w-5 h-5 text-destructive" /></div>}
          actions={
            !selection.active ? (
              <Button variant="outline" onClick={selection.enterSelectionMode} data-testid="button-enter-selection">
                <CheckSquare className="mr-2 h-4 w-4" />
                Select
              </Button>
            ) : undefined
          }
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !binOffers?.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3" data-testid="bin-empty-state">
            <div className="p-4 rounded-full bg-muted">
              <Trash2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium text-muted-foreground">The bin is empty</p>
            <p className="text-sm text-muted-foreground">Deleted offers will appear here.</p>
          </div>
        ) : (
          <>
          {selection.active && (
            <SelectionBar
              count={selection.count}
              onCancel={selection.exitSelectionMode}
              actions={
                <>
                  <Button size="sm" variant="outline" onClick={handleBulkRestore} disabled={bulkRestoring} data-testid="button-bulk-restore">
                    {bulkRestoring ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                    Restore
                  </Button>
                  {isMaster && (
                    <Button size="sm" variant="destructive" onClick={handleBulkPermanentDelete} disabled={bulkPermanentDeleting} data-testid="button-bulk-delete">
                      {bulkPermanentDeleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                      Delete
                    </Button>
                  )}
                </>
              }
            />
          )}
          <div className="rounded-lg border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  {selection.active && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selection.isAllSelected(binOffers.map((o: any) => o.id))}
                        onCheckedChange={() => selection.toggleAll(binOffers.map((o: any) => o.id))}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                  )}
                  <TableHead>Reference</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead><span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />Customer</span></TableHead>
                  <TableHead><span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />Salesman</span></TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead><span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Deleted</span></TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {binOffers.map((offer) => (
                  <TableRow key={offer.id} className={`opacity-70 hover:opacity-100 transition-opacity ${selection.active && selection.isSelected(offer.id) ? "!opacity-100 bg-primary/5" : ""}`} data-testid={`bin-row-${offer.id}`}>
                    {selection.active && (
                      <TableCell>
                        <Checkbox
                          checked={selection.isSelected(offer.id)}
                          onCheckedChange={() => selection.toggle(offer.id)}
                          data-testid={`checkbox-select-${offer.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs font-semibold text-muted-foreground">
                      {offer.referenceNumber}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-medium text-sm">
                      {offer.subject}
                    </TableCell>
                    <TableCell className="text-sm">
                      {offer.customer?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {offer.salesmanName}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${statusColors[offer.status] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}
                      >
                        {offer.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {offer.deletedAt
                        ? format(new Date(offer.deletedAt), "MMM d, yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/offers/${offer.id}`)}
                          data-testid={`button-view-bin-${offer.id}`}
                          title="View offer"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => restoreMutation.mutate(offer.id)}
                          disabled={restoreMutation.isPending}
                          data-testid={`button-restore-bin-${offer.id}`}
                          title="Restore offer"
                          className="text-primary hover:text-primary"
                        >
                          {restoreMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4 mr-1" />
                          )}
                          Restore
                        </Button>
                        {isMaster && (
                          <InlineConfirmButton
                            title="Permanently delete?"
                            confirmLabel="Delete Permanently"
                            onConfirm={() => permanentDeleteMutation.mutate(offer.id)}
                            isPending={permanentDeleteMutation.isPending}
                            buttonContent={<><Trash2 className="w-4 h-4 mr-1" />Delete</>}
                            buttonVariant="ghost"
                            buttonSize="sm"
                            buttonClassName="text-destructive hover:text-destructive hover:bg-destructive/10"
                            data-testid={`button-permanent-delete-${offer.id}`}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </div>
    </Layout>
  );
}
