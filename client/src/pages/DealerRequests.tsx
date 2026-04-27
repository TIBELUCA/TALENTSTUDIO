import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ArrowUpDown, CheckSquare as CheckSquareIcon, Share2 } from "lucide-react";
import { useSelection } from "@/hooks/use-selection";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectionBar } from "@/components/SelectionBar";
import { BulkShareDialog } from "@/components/BulkShareDialog";
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
import { Loader2, PlusCircle, Inbox, Eye, Trash2, Check, X } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface DealerEnquiry {
  id: number;
  referenceNumber: string;
  subject: string;
  status: string;
  date: string;
  customer: { id: number; name: string; companyName?: string };
  linkedOfferId?: number | null;
  linkedOfferStatus?: string | null;
}

const REQUEST_STATUSES = ["pending", "in_progress", "completed", "revision_requested"];

type SortOption = "ref-desc" | "ref-asc" | "date-desc" | "date-asc" | "subject-asc" | "subject-desc";


export default function DealerRequests() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("ref-desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const selection = useSelection();
  const [bulkShareOpen, setBulkShareOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleBulkDelete = async () => {
    const ids = Array.from(selection.selectedIds);
    setBulkDeleting(true);
    let count = 0;
    for (const id of ids) {
      try { await apiRequest("DELETE", `/api/dealer/enquiries/${id}`); count++; } catch {}
    }
    setBulkDeleting(false);
    queryClient.invalidateQueries({ queryKey: ["/api/dealer/enquiries"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dealer/enquiries/bin"] });
    toast({ title: t("enquiries.movedToBin", { count: String(count) }) });
    selection.exitSelectionMode();
  };

  const { data: enquiries = [], isLoading } = useQuery<DealerEnquiry[]>({
    queryKey: ["/api/dealer/enquiries"],
    staleTime: 0,
    refetchInterval: 30000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/dealer/enquiries/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/enquiries"] });
      toast({ title: t("enquiries.statusUpdated") });
    },
    onError: () => {
      toast({ title: t("enquiries.statusUpdateFailed"), variant: "destructive" });
    },
  });


  const filteredAndSortedRequests = useMemo(() => {
    let result = enquiries?.filter(req =>
      req.subject.toLowerCase().includes(search.toLowerCase()) ||
      (req.customer?.name || req.customer?.companyName || "").toLowerCase().includes(search.toLowerCase()) ||
      req.referenceNumber.toLowerCase().includes(search.toLowerCase())
    );

    if (statusFilter !== "all") {
      result = result?.filter(req => req.status === statusFilter);
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
  }, [enquiries, search, sortBy, statusFilter]);

  const visibleIds = useMemo(() => filteredAndSortedRequests?.map((r) => r.id) ?? [], [filteredAndSortedRequests]);

  return (
    <DealerLayout>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("dealerPortal.myRequests")}
          subtitle={t("dealerPortal.myRequestsSubtitle")}
          actions={
            <>
              {!selection.active && (
                <Button variant="outline" onClick={selection.enterSelectionMode} data-testid="button-enter-selection">
                  <CheckSquareIcon className="mr-2 h-4 w-4" />
                  {t("common.select")}
                </Button>
              )}
              <Link href="/dealer/requests/bin">
                <Button variant="outline" data-testid="button-open-enquiry-bin">
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("common.bin")}
                </Button>
              </Link>
              <Link href="/dealer/requests/new">
                <Button className="shadow-lg shadow-primary/20" data-testid="button-new-request">
                  <PlusCircle className="w-4 h-4 mr-2" />
                  {t("dealerPortal.newRequest")}
                </Button>
              </Link>
            </>
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
                {REQUEST_STATUSES.map((status) => (
                  <SelectItem key={status} value={status} data-testid={`filter-${status}`}>
                    {t(`enquiries.${status === "in_progress" ? "inProgress" : status === "revision_requested" ? "revisionRequested" : status}`)}
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
          entityType="enquiry"
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
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("offers.title")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={selection.active ? 8 : 7} className="h-24 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedRequests?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={selection.active ? 8 : 7} className="h-32 text-center text-muted-foreground">
                    {enquiries.length === 0 ? t("enquiries.noRequestsYet") : t("enquiries.noRequestsMatch")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedRequests?.map((req) => (
                  <TableRow key={req.id} className={`hover:bg-muted/20 ${selection.active && selection.isSelected(req.id) ? "bg-primary/5" : ""}`} data-testid={`row-request-${req.id}`}>
                    {selection.active && (
                      <TableCell>
                        <Checkbox
                          checked={selection.isSelected(req.id)}
                          onCheckedChange={() => selection.toggle(req.id)}
                          data-testid={`checkbox-select-${req.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs">{req.referenceNumber}</TableCell>
                    <TableCell className="font-medium">{req.subject}</TableCell>
                    <TableCell>{req.customer?.name || req.customer?.companyName || "—"}</TableCell>
                    <TableCell>{format(new Date(req.date), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      {req.linkedOfferId ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5" data-testid={`offer-status-${req.id}`}>
                          <Check className="w-3 h-3" /> {t("common.yes")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/50 border border-border rounded-full px-2 py-0.5" data-testid={`offer-status-${req.id}`}>
                          <X className="w-3 h-3" /> {t("common.no")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={req.status}
                        onValueChange={(value) => statusMutation.mutate({ id: req.id, status: value })}
                      >
                        <SelectTrigger className="w-[130px]" data-testid={`select-status-${req.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REQUEST_STATUSES.map((status) => (
                            <SelectItem key={status} value={status} data-testid={`status-option-${status}`}>
                              <Badge variant="outline" className={
                                status === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                status === "in_progress" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                status === "completed" ? "bg-green-50 text-green-700 border-green-200" :
                                "bg-red-50 text-red-700 border-red-200"
                              }>
                                {t(`enquiries.${status === "in_progress" ? "inProgress" : status === "revision_requested" ? "revisionRequested" : status}`)}
                              </Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/dealer/requests/${req.id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`button-view-${req.id}`}
                          >
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {enquiries.length === 0 && !isLoading && (
          <div className="text-center py-16 text-muted-foreground border rounded-xl bg-card">
            <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{t("enquiries.noRequestsYet")}</p>
            <p className="text-sm mt-1">{t("enquiries.submitFirstRequest")}</p>
            <Link href="/dealer/requests/new">
              <Button className="mt-4" data-testid="button-first-request">
                <PlusCircle className="w-4 h-4 mr-2" />
                {t("dealerPortal.newRequest")}
              </Button>
            </Link>
          </div>
        )}
      </div>

    </DealerLayout>
  );
}
