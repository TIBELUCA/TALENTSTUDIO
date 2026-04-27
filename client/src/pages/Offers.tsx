import { Layout } from "@/components/Layout";
import { useOffers, useDeleteOffer, useUpdateOfferStatus } from "@/hooks/use-offers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useLocation } from "wouter";
import { Plus, Search, Trash2, Loader2, Eye, ArrowUpDown, FileDown, ClipboardList, CalendarIcon, X, Filter, AlertTriangle, RefreshCw, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSelection } from "@/hooks/use-selection";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectionBar } from "@/components/SelectionBar";
import { BulkShareDialog } from "@/components/BulkShareDialog";
import { CheckSquare, Share2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineConfirmButton } from "@/components/InlineConfirm";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const OFFER_STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];

type SortOption = "ref-desc" | "ref-asc" | "date-desc" | "date-asc" | "name-asc" | "name-desc";

import { displayVersion } from "@shared/version";

function parseReference(ref: string): { base: string; version: number } {
  // Match both legacy (`-V<n>`) and new configurable (`-v<n>`, `_v<n>`, `_V<n>`) suffixes.
  const versionMatch = ref.match(/[-_][vV](\d+)$/);
  if (versionMatch) {
    return {
      base: ref.replace(/[-_][vV]\d+$/, ''),
      version: parseInt(versionMatch[1], 10)
    };
  }
  return { base: ref, version: 1 };
}

async function downloadOfferPdf(offerId: number, referenceNumber: string) {
  const res = await fetch(`/api/offers/${offerId}/pdf`, { credentials: "include" });
  if (!res.ok) throw new Error("PDF generation failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${referenceNumber}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

interface SalesmanUser {
  id: number;
  name: string;
  surname?: string;
}

interface DealerCompany {
  id: number;
  companyName: string;
}

export default function Offers() {
  const { isMaster } = useAuth();
  const { t } = useLanguage();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("ref-desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);
  const [filterSalesmanId, setFilterSalesmanId] = useState<string>("all");
  const [filterDealerId, setFilterDealerId] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [refreshDialogOffer, setRefreshDialogOffer] = useState<any | null>(null);
  const [refreshResult, setRefreshResult] = useState<{ offer: any; warnings: string[] } | null>(null);

  const serverFilters = isMaster ? {
    salesmanId: filterSalesmanId,
    dealerId: filterDealerId,
    fromDate,
    toDate,
  } : undefined;

  const { data: offers, isLoading } = useOffers(serverFilters);
  const deleteOffer = useDeleteOffer();
  const updateStatus = useUpdateOfferStatus();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const selection = useSelection();
  const [bulkShareOpen, setBulkShareOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: catalogVersionData } = useQuery<{ activeCatalogVersionId: number | null }>({
    queryKey: ["/api/offers/active-catalog-version"],
  });
  const activeCatalogVersionId = catalogVersionData?.activeCatalogVersionId ?? null;

  const refreshCatalogMutation = useMutation({
    mutationFn: async (offerId: number) => {
      const res = await fetch(`/api/offers/${offerId}/refresh-catalog`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to refresh catalog");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      setRefreshDialogOffer(null);
      setRefreshResult(data);
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const isOutdated = (offer: any) => {
    if (!activeCatalogVersionId) return false;
    return offer.catalogVersionId == null || offer.catalogVersionId !== activeCatalogVersionId;
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selection.selectedIds);
    setBulkDeleting(true);
    let count = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/offers/${id}`, { method: "DELETE", credentials: "include" });
        if (res.ok) count++;
      } catch {}
    }
    setBulkDeleting(false);
    queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/offers/bin"] });
    toast({ title: t("offers.movedToBin", { count: String(count) }) });
    selection.exitSelectionMode();
  };

  const { data: salesmen = [] } = useQuery<SalesmanUser[]>({
    queryKey: ["/api/users"],
    enabled: !!isMaster,
  });
  const { data: dealerCompanies = [] } = useQuery<DealerCompany[]>({
    queryKey: ["/api/dealers"],
    enabled: !!isMaster,
  });

  const handleDownloadPdf = async (offerId: number, referenceNumber: string) => {
    setPdfLoadingId(offerId);
    try {
      await downloadOfferPdf(offerId, referenceNumber);
    } catch {
      toast({ title: t("offers.pdfFailed"), description: t("offers.pdfFailedDesc"), variant: "destructive" });
    } finally {
      setPdfLoadingId(null);
    }
  };

  const hasActiveFilters = filterSalesmanId !== "all" || filterDealerId !== "all" || fromDate || toDate;

  const clearAllFilters = () => {
    setFilterSalesmanId("all");
    setFilterDealerId("all");
    setFromDate("");
    setToDate("");
  };

  const filteredAndSortedOffers = useMemo(() => {
    let result = offers?.filter((offer: any) =>
      offer.subject.toLowerCase().includes(search.toLowerCase()) ||
      offer.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
      offer.referenceNumber.toLowerCase().includes(search.toLowerCase())
    );

    if (statusFilter !== "all") {
      result = result?.filter((offer: any) => offer.status === statusFilter);
    }

    result = result?.sort((a: any, b: any) => {
      switch (sortBy) {
        case "ref-desc": {
          const aRef = parseReference(a.referenceNumber);
          const bRef = parseReference(b.referenceNumber);
          const baseCompare = bRef.base.localeCompare(aRef.base);
          if (baseCompare !== 0) return baseCompare;
          return bRef.version - aRef.version;
        }
        case "ref-asc": {
          const aRef = parseReference(a.referenceNumber);
          const bRef = parseReference(b.referenceNumber);
          const baseCompare = aRef.base.localeCompare(bRef.base);
          if (baseCompare !== 0) return baseCompare;
          return aRef.version - bRef.version;
        }
        case "date-desc":
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case "date-asc":
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case "name-asc":
          return a.subject.localeCompare(b.subject);
        case "name-desc":
          return b.subject.localeCompare(a.subject);
        default:
          return 0;
      }
    });

    return result;
  }, [offers, search, sortBy, statusFilter]);

  const colCount = (isMaster ? 13 : 11) + (selection.active ? 1 : 0);
  const visibleIds = useMemo(() => filteredAndSortedOffers?.map((o: any) => o.id) ?? [], [filteredAndSortedOffers]);

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("offers.title")}
          subtitle={t("offers.subtitle")}
          actions={
            <>
              {!selection.active && (
                <Button variant="outline" onClick={selection.enterSelectionMode} data-testid="button-enter-selection">
                  <CheckSquare className="mr-2 h-4 w-4" />
                  {t("common.select")}
                </Button>
              )}
              <Link href="/offers/bin">
                <Button variant="outline" data-testid="button-open-bin">
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("common.bin")}
                </Button>
              </Link>
              <Link href="/offers/new">
                <Button className="shadow-lg shadow-primary/20">
                  <Plus className="mr-2 h-4 w-4" />
                  {t("offers.createOffer")}
                </Button>
              </Link>
            </>
          }
        />

        <div className="flex flex-col gap-3 bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
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
                    <SelectItem value="name-asc" data-testid="sort-name-asc">{t("offers.sortNameAZ")}</SelectItem>
                    <SelectItem value="name-desc" data-testid="sort-name-desc">{t("offers.sortNameZA")}</SelectItem>
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
              {isMaster && (
                <Button
                  variant={showFilters || hasActiveFilters ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowFilters(v => !v)}
                  data-testid="button-toggle-filters"
                  className="gap-1.5"
                >
                  <Filter className="w-3.5 h-3.5" />
                  {t("common.filters")}
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] font-bold">
                      {[filterSalesmanId !== "all", filterDealerId !== "all", fromDate, toDate].filter(Boolean).length}
                    </Badge>
                  )}
                </Button>
              )}
            </div>
          </div>

          {isMaster && showFilters && (
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("offers.salesman")}</label>
                <Select value={filterSalesmanId} onValueChange={setFilterSalesmanId}>
                  <SelectTrigger className="w-[180px]" data-testid="select-filter-salesman">
                    <SelectValue placeholder={t("offers.allSalesmen")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("offers.allSalesmen")}</SelectItem>
                    {(salesmen as any[]).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.surname ? ` ${s.surname}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("offers.dealer")}</label>
                <Select value={filterDealerId} onValueChange={setFilterDealerId}>
                  <SelectTrigger className="w-[180px]" data-testid="select-filter-dealer">
                    <SelectValue placeholder={t("offers.allDealers")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("offers.allDealers")}</SelectItem>
                    {(dealerCompanies as any[]).map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("offers.fromDate")}</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="date"
                    className="pl-8 w-[150px]"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    data-testid="input-from-date"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("offers.toDate")}</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="date"
                    className="pl-8 w-[150px]"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    data-testid="input-to-date"
                  />
                </div>
              </div>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground" data-testid="button-clear-filters">
                  <X className="w-3.5 h-3.5 mr-1" /> {t("common.clear")}
                </Button>
              )}
            </div>
          )}
        </div>

        {selection.active && (
          <SelectionBar
            count={selection.count}
            onCancel={selection.exitSelectionMode}
            actions={
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkShareOpen(true)}
                  data-testid="button-bulk-share"
                >
                  <Share2 className="w-4 h-4 mr-1" />
                  {t("common.share")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  data-testid="button-bulk-delete"
                >
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
                <TableHead>{t("offers.version")}</TableHead>
                <TableHead>{t("offers.subject")}</TableHead>
                <TableHead>{t("offers.customer")}</TableHead>
                <TableHead>{t("offers.createdBy")}</TableHead>
                {isMaster && <TableHead>{t("offers.dealer")}</TableHead>}
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("offers.total")}</TableHead>
                <TableHead>{t("offers.status")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="h-24 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedOffers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="h-32 text-center text-muted-foreground">
                    {t("offers.noOffers")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedOffers?.map((offer: any) => (
                  <TableRow key={offer.id} className={`hover:bg-muted/20 ${selection.active && selection.isSelected(offer.id) ? "bg-primary/5" : ""}`} data-testid={`row-offer-${offer.id}`}>
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
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="font-mono">V{displayVersion(offer.version)}</Badge>
                        {offer.language && offer.language !== "it" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase" data-testid={`badge-lang-${offer.id}`}>{offer.language}</Badge>
                        )}
                        {isOutdated(offer) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setRefreshDialogOffer(offer)}
                                  className="inline-flex"
                                  data-testid={`button-outdated-catalog-${offer.id}`}
                                >
                                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Il catalogo è stato aggiornato dopo la creazione di questa offerta</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-1">
                        <span>{offer.subject}</span>
                        {offer.sourceEnquiryId && (
                          <Link href={`/enquiries/${offer.sourceEnquiryId}`}>
                            <span
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                              data-testid={`link-enquiry-${offer.id}`}
                            >
                              <ClipboardList className="w-3 h-3" />
                              {offer.sourceEnquiryRef ?? `${t("enquiries.title")} #${offer.sourceEnquiryId}`}
                            </span>
                          </Link>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{offer.customer?.name}</TableCell>
                    <TableCell className="text-sm" data-testid={`text-creator-${offer.id}`}>
                      {offer.salesmanName || <span className="text-muted-foreground italic text-xs">—</span>}
                    </TableCell>
                    {isMaster && (
                      <TableCell className="text-sm" data-testid={`text-dealer-${offer.id}`}>
                        {offer.dealerCompanyName || <span className="text-muted-foreground italic text-xs">—</span>}
                      </TableCell>
                    )}
                    <TableCell>{format(new Date(offer.date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-mono">
                      €{parseFloat(offer.totalPrice as unknown as string).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={offer.status}
                        onValueChange={(value) => updateStatus.mutate({ offerId: offer.id, status: value })}
                      >
                        <SelectTrigger className="w-[120px]" data-testid={`select-status-${offer.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OFFER_STATUSES.map((status) => (
                            <SelectItem key={status} value={status} data-testid={`status-option-${status.toLowerCase()}`}>
                              <Badge
                                variant="outline"
                                className={
                                  status === "Draft" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                  status === "Sent" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                                  status === "Accepted" ? "bg-green-50 text-green-700 border-green-200" :
                                  status === "Rejected" ? "bg-red-50 text-red-700 border-red-200" :
                                  "bg-gray-50 text-gray-700 border-gray-200"
                                }
                              >
                                {t(`offers.status${status}`)}
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={`${t("offers.downloadPdf")} — ${offer.referenceNumber}`}
                          data-testid={`button-pdf-${offer.id}`}
                          disabled={pdfLoadingId === offer.id}
                          onClick={() => handleDownloadPdf(offer.id, offer.referenceNumber)}
                        >
                          {pdfLoadingId === offer.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <FileDown className="w-4 h-4 text-muted-foreground" />}
                        </Button>
                        <Link href={`/offers/${offer.id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`button-view-${offer.id}`}
                          >
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </Link>
                        <InlineConfirmButton
                          title={t("offers.moveToBin")}
                          confirmLabel={t("offers.moveToBinConfirm")}
                          onConfirm={() => deleteOffer.mutate(offer.id)}
                          isPending={deleteOffer.isPending}
                          buttonContent={<Trash2 className="w-4 h-4 text-destructive" />}
                          buttonVariant="ghost"
                          buttonSize="icon"
                          data-testid={`button-delete-${offer.id}`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog open={!!refreshDialogOffer} onOpenChange={(open) => { if (!open) setRefreshDialogOffer(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Aggiorna catalogo offerta</DialogTitle>
              <DialogDescription>
                L'offerta <strong>{refreshDialogOffer?.referenceNumber}</strong> è stata creata con una versione precedente del catalogo.
                Verrà creata una nuova versione con prezzi, descrizioni e dati tecnici aggiornati dal catalogo corrente. La struttura dell'offerta (macchine, opzioni, quantità) verrà preservata.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRefreshDialogOffer(null)} data-testid="button-cancel-refresh">
                Annulla
              </Button>
              <Button
                onClick={() => refreshCatalogMutation.mutate(refreshDialogOffer?.id)}
                disabled={refreshCatalogMutation.isPending}
                data-testid="button-confirm-refresh"
              >
                {refreshCatalogMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Aggiorna
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!refreshResult} onOpenChange={(open) => { if (!open) setRefreshResult(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Catalogo aggiornato</DialogTitle>
              <DialogDescription>
                Nuova versione creata: <strong>{refreshResult?.offer?.referenceNumber}</strong>
              </DialogDescription>
            </DialogHeader>
            {refreshResult?.warnings && refreshResult.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-1">
                <p className="font-medium text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Alcuni elementi non sono stati aggiornati perché non più presenti nel catalogo:
                </p>
                <ul className="list-disc list-inside text-amber-700">
                  {refreshResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
            {refreshResult?.warnings?.length === 0 && (
              <p className="text-sm text-muted-foreground">Tutti gli elementi sono stati aggiornati con successo.</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setRefreshResult(null)} data-testid="button-close-result">
                Chiudi
              </Button>
              <Button
                onClick={() => {
                  const id = refreshResult?.offer?.id;
                  setRefreshResult(null);
                  if (id) navigate(`/offers/${id}`);
                }}
                data-testid="button-view-refreshed"
              >
                <Eye className="w-4 h-4 mr-2" />
                Visualizza
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
