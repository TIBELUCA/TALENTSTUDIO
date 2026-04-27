import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { useLocation, Link } from "wouter";
import { Loader2, FileText, Search, ArrowUpDown, Eye, Trash2, Download, CheckSquare, Share2 } from "lucide-react";
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
import { useLanguage } from "@/lib/i18n/LanguageContext";

const OFFER_STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];

type SortOption = "ref-desc" | "ref-asc" | "date-desc" | "date-asc" | "subject-asc" | "subject-desc";

const statusColors: Record<string, string> = {
  Draft:    "bg-blue-50   text-blue-700   border-blue-200",
  Sent:     "bg-yellow-50 text-yellow-700 border-yellow-200",
  Accepted: "bg-green-50  text-green-700  border-green-200",
  Rejected: "bg-red-50    text-red-700    border-red-200",
  Expired:  "bg-gray-50   text-gray-700   border-gray-200",
};

export default function DealerOffers() {
  const [, navigate] = useLocation();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("ref-desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const selection = useSelection();
  const [bulkShareOpen, setBulkShareOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleBulkDelete = async () => {
    const ids = Array.from(selection.selectedIds);
    setBulkDeleting(true);
    let count = 0;
    for (const id of ids) {
      try { await apiRequest("DELETE", `/api/dealer/offers/${id}`); count++; } catch {}
    }
    setBulkDeleting(false);
    queryClient.invalidateQueries({ queryKey: ["/api/dealer/offers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dealer/offers/bin"] });
    toast({ title: t("offers.movedToBin", { count: String(count) }) });
    selection.exitSelectionMode();
  };

  const { data: offers, isLoading } = useQuery<any[]>({
    queryKey: ["/api/dealer/offers", "customer"],
    queryFn: async () => {
      const res = await fetch("/api/dealer/offers?category=customer", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch offers");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/dealer/offers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/offers"] });
      toast({ title: t("offers.offerDeleted") });
    },
    onError: () => {
      toast({ title: t("offers.offerDeleteFailed"), variant: "destructive" });
    },
  });

  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const handleDownload = async (offerId: number, refNumber: string) => {
    setDownloadingId(offerId);
    try {
      const res = await fetch(`/api/dealer/offers/${offerId}/pdf`, { credentials: "include" });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${refNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: t("offers.pdfFailed"), variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
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
        case "ref-desc":
          return b.referenceNumber.localeCompare(a.referenceNumber);
        case "ref-asc":
          return a.referenceNumber.localeCompare(b.referenceNumber);
        case "date-desc":
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case "date-asc":
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case "subject-asc":
          return a.subject.localeCompare(b.subject);
        case "subject-desc":
          return b.subject.localeCompare(a.subject);
        default:
          return 0;
      }
    });

    return result;
  }, [offers, search, sortBy, statusFilter]);

  const visibleIds = useMemo(() => filteredAndSortedOffers?.map((o: any) => o.id) ?? [], [filteredAndSortedOffers]);

  return (
    <DealerLayout>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("dealerPortal.customerOffers")}
          subtitle={t("dealerPortal.customerOffersSubtitle")}
          actions={
            !selection.active ? (
              <Button variant="outline" onClick={selection.enterSelectionMode} data-testid="button-enter-selection">
                <CheckSquare className="mr-2 h-4 w-4" />
                {t("common.select")}
              </Button>
            ) : undefined
          }
        />

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-5 h-5 text-muted-foreground" />
            <Input
              placeholder={t("offers.searchPlaceholder")}
              className="border-none shadow-none focus-visible:ring-0 bg-transparent"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-[160px]" data-testid="select-sort">
                  <SelectValue placeholder={t("common.sortBy")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ref-desc" data-testid="sort-ref-desc">{t("offers.sortRefNewest")}</SelectItem>
                  <SelectItem value="ref-asc" data-testid="sort-ref-asc">{t("offers.sortRefOldest")}</SelectItem>
                  <SelectItem value="date-desc" data-testid="sort-date-desc">{t("offers.sortDateNewest")}</SelectItem>
                  <SelectItem value="date-asc" data-testid="sort-date-asc">{t("offers.sortDateOldest")}</SelectItem>
                  <SelectItem value="subject-asc" data-testid="sort-subject-asc">{t("offers.sortNameAZ")}</SelectItem>
                  <SelectItem value="subject-desc" data-testid="sort-subject-desc">{t("offers.sortNameZA")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]" data-testid="select-filter-status">
                <SelectValue placeholder={t("common.filterStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="filter-all">{t("offers.allStatus")}</SelectItem>
                {OFFER_STATUSES.map((status) => (
                  <SelectItem key={status} value={status} data-testid={`filter-${status.toLowerCase()}`}>
                    {t(`offers.status${status}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selection.active && (
          <SelectionBar
            count={selection.count}
            onCancel={selection.exitSelectionMode}
            actions={
              <>
                <Button size="sm" variant="outline" onClick={() => setBulkShareOpen(true)} data-testid="button-bulk-share">
                  <Share2 className="w-4 h-4 mr-1" /> {t("common.share")}
                </Button>
                <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting} data-testid="button-bulk-delete">
                  {bulkDeleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                  {t("common.delete")}
                </Button>
              </>
            }
          />
        )}

        <BulkShareDialog
          open={bulkShareOpen}
          onOpenChange={setBulkShareOpen}
          entityType="offer"
          entityIds={Array.from(selection.selectedIds)}
          onComplete={() => selection.exitSelectionMode()}
        />

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                {selection.active && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selection.isAllSelected(visibleIds)}
                      onCheckedChange={() => selection.toggleAll(visibleIds)}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                )}
                <TableHead>{t("offers.ref")}</TableHead>
                <TableHead>{t("offers.subject")}</TableHead>
                <TableHead>{t("offers.customer")}</TableHead>
                <TableHead>{t("offers.createdBy")}</TableHead>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("dealerPortal.request")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={selection.active ? 9 : 8} className="h-24 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedOffers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={selection.active ? 9 : 8} className="h-32 text-center text-muted-foreground">
                    {offers?.length === 0 ? t("offers.noOffers") : t("common.noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedOffers?.map((offer: any) => (
                  <TableRow key={offer.id} className={`hover:bg-muted/20 ${selection.active && selection.isSelected(offer.id) ? "bg-primary/5" : ""}`} data-testid={`dealer-offer-row-${offer.id}`}>
                    {selection.active && (
                      <TableCell>
                        <Checkbox
                          checked={selection.isSelected(offer.id)}
                          onCheckedChange={() => selection.toggle(offer.id)}
                          data-testid={`checkbox-select-${offer.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs">{offer.referenceNumber}</TableCell>
                    <TableCell className="font-medium">{offer.subject}</TableCell>
                    <TableCell>{offer.customer?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm" data-testid={`text-creator-${offer.id}`}>{offer.salesmanName || <span className="text-muted-foreground italic text-xs">—</span>}</TableCell>
                    <TableCell>{offer.date ? format(new Date(offer.date), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${statusColors[offer.status] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}
                      >
                        {t(`offers.status${offer.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {offer.sourceEnquiryRef ? (
                        <Link href={`/dealer/requests/${offer.sourceEnquiryId}`}>
                          <Badge
                            variant="outline"
                            className="text-xs font-mono cursor-pointer hover:bg-muted transition-colors"
                            data-testid={`link-enquiry-${offer.id}`}
                          >
                            📋 {offer.sourceEnquiryRef}
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
                            data-testid={`button-view-dealer-offer-${offer.id}`}
                          >
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(offer.id, offer.referenceNumber)}
                          disabled={downloadingId === offer.id}
                          title={t("offers.downloadPdf")}
                          data-testid={`button-download-dealer-offer-${offer.id}`}
                        >
                          {downloadingId === offer.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Download className="w-4 h-4 text-muted-foreground" />}
                        </Button>
                        <InlineConfirmButton
                          title={t("offers.moveToBin")}
                          confirmLabel={t("common.delete")}
                          onConfirm={() => deleteMutation.mutate(offer.id)}
                          isPending={deleteMutation.isPending}
                          buttonContent={<Trash2 className="w-4 h-4" />}
                          buttonVariant="ghost"
                          buttonSize="icon"
                          buttonClassName="text-destructive hover:text-destructive"
                          data-testid={`button-delete-dealer-offer-${offer.id}`}
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
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3" data-testid="dealer-offers-empty">
            <div className="p-4 rounded-full bg-muted">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium text-muted-foreground">{t("offers.noOffers")}</p>
            <p className="text-sm text-muted-foreground">{t("dealerPortal.offersWillAppear")}</p>
          </div>
        )}
      </div>

    </DealerLayout>
  );
}
