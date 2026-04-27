import { Layout } from "@/components/Layout";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
  pending:            "bg-yellow-50 text-yellow-700 border-yellow-200",
  in_progress:        "bg-blue-50   text-blue-700   border-blue-200",
  completed:          "bg-green-50  text-green-700  border-green-200",
  revision_requested: "bg-orange-50 text-orange-700 border-orange-200",
};

function formatStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function EnquiryBin() {
  const { isDealer, isMaster } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const selection = useSelection();
  const [bulkRestoring, setBulkRestoring] = useState(false);
  const [bulkPermanentDeleting, setBulkPermanentDeleting] = useState(false);

  const binEndpoint = isDealer ? "/api/dealer/enquiries/bin" : "/api/enquiries/bin";
  const restorePrefix = isDealer ? "/api/dealer/enquiries" : "/api/enquiries";
  const listKey = isDealer ? "/api/dealer/enquiries" : "/api/enquiries";

  const handleBulkRestore = async () => {
    const ids = Array.from(selection.selectedIds);
    setBulkRestoring(true);
    let count = 0;
    for (const id of ids) {
      try { await apiRequest("PATCH", `${restorePrefix}/${id}/restore`); count++; } catch {}
    }
    setBulkRestoring(false);
    queryClient.invalidateQueries({ queryKey: [binEndpoint] });
    queryClient.invalidateQueries({ queryKey: [listKey] });
    toast({ title: `${count} enquir${count !== 1 ? "ies" : "y"} restored` });
    selection.exitSelectionMode();
  };

  const handleBulkPermanentDelete = async () => {
    const ids = Array.from(selection.selectedIds);
    setBulkPermanentDeleting(true);
    let count = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`${restorePrefix}/${id}/permanent`, { method: "DELETE", credentials: "include" });
        if (res.ok) count++;
      } catch {}
    }
    setBulkPermanentDeleting(false);
    queryClient.invalidateQueries({ queryKey: [binEndpoint] });
    toast({ title: `${count} enquir${count !== 1 ? "ies" : "y"} permanently deleted` });
    selection.exitSelectionMode();
  };

  const { data: binEnquiries, isLoading } = useQuery({
    queryKey: [binEndpoint],
    queryFn: async () => {
      const res = await fetch(binEndpoint, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bin");
      return res.json() as Promise<any[]>;
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `${restorePrefix}/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [binEndpoint] });
      queryClient.invalidateQueries({ queryKey: [listKey] });
      toast({ title: "Enquiry restored", description: "The enquiry has been moved back to your list." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to restore enquiry.", variant: "destructive" });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/enquiries/${id}/permanent`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 403) throw new Error("Only administrators can permanently delete enquiries");
      if (!res.ok) throw new Error("Failed to permanently delete enquiry");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [binEndpoint] });
      queryClient.invalidateQueries({ queryKey: [listKey] });
      toast({ title: "Permanently deleted", description: "The enquiry has been permanently removed." });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const viewPath = isDealer ? "/dealer/requests" : "/enquiries";

  const Wrapper = isDealer ? DealerLayout : Layout;

  return (
    <Wrapper>
      <div className={isDealer ? "max-w-6xl mx-auto space-y-6" : "p-6 max-w-6xl mx-auto space-y-6"}>
        <PageHeader
          title="Enquiry Bin"
          subtitle="Deleted enquiries are stored here. You can view them or restore them."
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
        ) : !binEnquiries?.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3" data-testid="enquiry-bin-empty-state">
            <div className="p-4 rounded-full bg-muted">
              <Trash2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium text-muted-foreground">The bin is empty</p>
            <p className="text-sm text-muted-foreground">Deleted enquiries will appear here.</p>
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
                        checked={selection.isAllSelected(binEnquiries.map((e: any) => e.id))}
                        onCheckedChange={() => selection.toggleAll(binEnquiries.map((e: any) => e.id))}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                  )}
                  <TableHead>Reference</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead><span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />Customer</span></TableHead>
                  {!isDealer && <TableHead><span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />Dealer</span></TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead><span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Deleted</span></TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {binEnquiries.map((enquiry: any) => (
                  <TableRow key={enquiry.id} className={`opacity-70 hover:opacity-100 transition-opacity ${selection.active && selection.isSelected(enquiry.id) ? "!opacity-100 bg-primary/5" : ""}`} data-testid={`enquiry-bin-row-${enquiry.id}`}>
                    {selection.active && (
                      <TableCell>
                        <Checkbox
                          checked={selection.isSelected(enquiry.id)}
                          onCheckedChange={() => selection.toggle(enquiry.id)}
                          data-testid={`checkbox-select-${enquiry.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs font-semibold text-muted-foreground">
                      {enquiry.referenceNumber}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-medium text-sm">
                      {enquiry.subject}
                    </TableCell>
                    <TableCell className="text-sm">
                      {enquiry.customer?.name ?? "—"}
                    </TableCell>
                    {!isDealer && (
                      <TableCell className="text-sm">
                        {enquiry.dealer ? `${enquiry.dealer.name} ${enquiry.dealer.surname || ""}`.trim() : "—"}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${statusColors[enquiry.status] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}
                      >
                        {formatStatus(enquiry.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {enquiry.deletedAt
                        ? format(new Date(enquiry.deletedAt), "MMM d, yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`${viewPath}/${enquiry.id}`)}
                          data-testid={`button-view-enquiry-bin-${enquiry.id}`}
                          title="View enquiry"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => restoreMutation.mutate(enquiry.id)}
                          disabled={restoreMutation.isPending}
                          data-testid={`button-restore-enquiry-bin-${enquiry.id}`}
                          title="Restore enquiry"
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
                            onConfirm={() => permanentDeleteMutation.mutate(enquiry.id)}
                            isPending={permanentDeleteMutation.isPending}
                            buttonContent={<><Trash2 className="w-4 h-4 mr-1" />Delete</>}
                            buttonVariant="ghost"
                            buttonSize="sm"
                            buttonClassName="text-destructive hover:text-destructive hover:bg-destructive/10"
                            data-testid={`button-permanent-delete-enquiry-${enquiry.id}`}
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
    </Wrapper>
  );
}
