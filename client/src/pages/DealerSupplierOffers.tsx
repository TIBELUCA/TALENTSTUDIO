import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { useLocation, Link } from "wouter";
import { Loader2, Package, Search, ArrowUpDown, Eye, Trash2, CheckSquare, Share2 } from "lucide-react";
import { useSelection } from "@/hooks/use-selection";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectionBar } from "@/components/SelectionBar";
import { BulkShareDialog } from "@/components/BulkShareDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InlineConfirmButton } from "@/components/InlineConfirm";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const OFFER_STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];

type SortOption = "ref-desc" | "ref-asc" | "date-desc" | "date-asc" | "subject-asc" | "subject-desc";

const statusColors: Record<string, string> = {
  Draft:    "bg-green-50  text-green-700  border-green-200",
  Sent:     "bg-yellow-50 text-yellow-700 border-yellow-200",
  Accepted: "bg-green-50  text-green-700  border-green-200",
  Rejected: "bg-red-50    text-red-700    border-red-200",
  Expired:  "bg-gray-50   text-gray-700   border-gray-200",
};

function dealerStatusLabel(status: string): string {
  if (status === "Draft") return "Completed";
  return status;
}

export default function DealerSupplierOffers() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("ref-desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const selection = useSelection();
  const [bulkShareOpen, setBulkShareOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: offers, isLoading } = useQuery<any[]>({
    queryKey: ["/api/dealer/offers", "supplier"],
    queryFn: async () => {
      const res = await fetch("/api/dealer/offers?category=supplier", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch offers");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/dealer/offers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/offers"] });
      toast({ title: "Offer deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete offer", variant: "destructive" });
    },
  });

  const handleBulkDelete = async () => {
    const ids = Array.from(selection.selectedIds);
    setBulkDeleting(true);
    let count = 0;
    for (const id of ids) {
      try { await apiRequest("DELETE", `/api/dealer/offers/${id}`); count++; } catch {}
    }
    setBulkDeleting(false);
    queryClient.invalidateQueries({ queryKey: ["/api/dealer/offers"] });
    toast({ title: `${count} offer${count !== 1 ? "s" : ""} moved to bin` });
    selection.exitSelectionMode();
  };

  const filteredAndSortedOffers = useMemo(() => {
    let result = offers?.filter(offer =>
      offer.subject.toLowerCase().includes(search.toLowerCase()) ||
      offer.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
      offer.referenceNumber.toLowerCase().includes(search.toLowerCase())
    );

    if (statusFilter !== "all") {
      result = result?.filter(offer => offer.status === statusFilter);
    }

    result = result?.sort((a, b) => {
      switch (sortBy) {
        case "ref-desc": return b.referenceNumber.localeCompare(a.referenceNumber);
        case "ref-asc": return a.referenceNumber.localeCompare(b.referenceNumber);
        case "date-desc": return new Date(b.date).getTime() - new Date(a.date).getTime();
        case "date-asc": return new Date(a.date).getTime() - new Date(b.date).getTime();
        case "subject-asc": return a.subject.localeCompare(b.subject);
        case "subject-desc": return b.subject.localeCompare(a.subject);
        default: return 0;
      }
    });

    return result;
  }, [offers, search, sortBy, statusFilter]);

  const visibleIds = useMemo(() => filteredAndSortedOffers?.map((o: any) => o.id) ?? [], [filteredAndSortedOffers]);

  return (
    <DealerLayout>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Supplier Offers"
          subtitle="Offers received from the manufacturer where you are the buyer"
          actions={
            !selection.active ? (
              <Button variant="outline" onClick={selection.enterSelectionMode} data-testid="button-enter-selection-supplier">
                <CheckSquare className="mr-2 h-4 w-4" />
                Select
              </Button>
            ) : undefined
          }
        />

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by subject, customer, or ref #..."
              className="border-none shadow-none focus-visible:ring-0 bg-transparent"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-supplier"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-[160px]" data-testid="select-sort-supplier">
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ref-desc">Ref # (Newest)</SelectItem>
                  <SelectItem value="ref-asc">Ref # (Oldest)</SelectItem>
                  <SelectItem value="date-desc">Date (Newest)</SelectItem>
                  <SelectItem value="date-asc">Date (Oldest)</SelectItem>
                  <SelectItem value="subject-asc">Subject (A-Z)</SelectItem>
                  <SelectItem value="subject-desc">Subject (Z-A)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]" data-testid="select-filter-status-supplier">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {OFFER_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {dealerStatusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selection.active && (
          <SelectionBar
            selectedCount={selection.selectedIds.size}
            totalCount={visibleIds.length}
            onSelectAll={() => selection.selectAll(visibleIds)}
            onDeselectAll={selection.deselectAll}
            onCancel={selection.exitSelectionMode}
            actions={
              <>
                <Button size="sm" variant="outline" onClick={() => setBulkShareOpen(true)} data-testid="button-bulk-share-supplier">
                  <Share2 className="mr-1 h-3.5 w-3.5" /> Share
                </Button>
                <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting} data-testid="button-bulk-delete-supplier">
                  {bulkDeleting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1 h-3.5 w-3.5" />}
                  Delete
                </Button>
              </>
            }
          />
        )}

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                {selection.active && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={visibleIds.length > 0 && visibleIds.every((id: number) => selection.selectedIds.has(id))}
                      onCheckedChange={(checked) => checked ? selection.selectAll(visibleIds) : selection.deselectAll()}
                      data-testid="checkbox-select-all-supplier"
                    />
                  </TableHead>
                )}
                <TableHead>Ref #</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Salesman</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Request</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={selection.active ? 10 : 9} className="h-24 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedOffers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={selection.active ? 10 : 9} className="h-32 text-center text-muted-foreground">
                    {offers?.length === 0 ? "No supplier offers yet." : "No offers match your filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedOffers?.map((offer: any) => (
                  <TableRow key={offer.id} className="hover:bg-muted/20" data-testid={`supplier-offer-row-${offer.id}`}>
                    {selection.active && (
                      <TableCell>
                        <Checkbox
                          checked={selection.selectedIds.has(offer.id)}
                          onCheckedChange={() => selection.toggle(offer.id)}
                          data-testid={`checkbox-supplier-offer-${offer.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs">{offer.referenceNumber}</TableCell>
                    <TableCell className="font-medium">{offer.subject}</TableCell>
                    <TableCell>{offer.customer?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{offer.salesmanName || "—"}</TableCell>
                    <TableCell>{offer.date ? format(new Date(offer.date), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${statusColors[offer.status] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}
                      >
                        {dealerStatusLabel(offer.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {offer.sourceEnquiryRef ? (
                        <Link href={`/dealer/requests/${offer.sourceEnquiryId}`}>
                          <Badge
                            variant="outline"
                            className="text-xs font-mono cursor-pointer hover:bg-muted transition-colors"
                            data-testid={`link-enquiry-supplier-${offer.id}`}
                          >
                            {offer.sourceEnquiryRef}
                          </Badge>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/dealer/offers/${offer.id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="View Offer"
                            data-testid={`button-view-supplier-offer-${offer.id}`}
                          >
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </Link>
                        <InlineConfirmButton
                          title="Delete offer?"
                          confirmLabel="Delete"
                          onConfirm={() => deleteMutation.mutate(offer.id)}
                          isPending={deleteMutation.isPending}
                          buttonContent={<Trash2 className="w-4 h-4" />}
                          buttonVariant="ghost"
                          buttonSize="icon"
                          buttonClassName="text-destructive hover:text-destructive"
                          data-testid={`button-delete-supplier-offer-${offer.id}`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {offers?.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3" data-testid="supplier-offers-empty">
            <div className="p-4 rounded-full bg-muted">
              <Package className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium text-muted-foreground">No supplier offers yet</p>
            <p className="text-sm text-muted-foreground">Offers from the manufacturer where you are the buyer will appear here.</p>
          </div>
        )}
      </div>

      {bulkShareOpen && (
        <BulkShareDialog
          open={bulkShareOpen}
          onOpenChange={setBulkShareOpen}
          entityType="offer"
          entityIds={Array.from(selection.selectedIds)}
        />
      )}
    </DealerLayout>
  );
}
