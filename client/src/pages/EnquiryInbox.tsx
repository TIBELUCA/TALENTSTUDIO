import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineConfirmButton } from "@/components/InlineConfirm";
import { Loader2, Inbox, Eye, FileText, Search, ArrowUpDown, Trash2, Clock, PlayCircle, CheckCircle2, CheckSquare, Share2 } from "lucide-react";
import { useSelection } from "@/hooks/use-selection";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectionBar } from "@/components/SelectionBar";
import { BulkShareDialog } from "@/components/BulkShareDialog";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Enquiry {
  id: number;
  referenceNumber: string;
  subject: string;
  status: string;
  date: string;
  dealerId: number | null;
  salesmanUserId: number | null;
  customer: { id: number; name: string };
  dealer?: { id: number; name: string; surname: string; email: string } | null;
  projectData?: any;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  revision_requested: "bg-red-100 text-red-700 border-red-200",
};
const STATUS_LABEL_KEYS: Record<string, string> = {
  pending: "enquiries.pending",
  in_progress: "enquiries.inProgress",
  completed: "enquiries.completed",
  revision_requested: "enquiries.revisionRequested",
};
const STATUS_ICONS: Record<string, any> = {
  pending: Clock,
  in_progress: PlayCircle,
  completed: CheckCircle2,
};

function StatusBadgeDropdown({ status, onChangeStatus, enquiryId }: { status: string; onChangeStatus: (s: string) => void; enquiryId: number }) {
  const { t } = useLanguage();
  const options = ["pending", "in_progress", "completed"].filter(s => s !== status);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="focus:outline-none" data-testid={`badge-status-${enquiryId}`}>
          <Badge className={`${STATUS_STYLES[status] ?? ""} cursor-pointer hover:opacity-80 transition-opacity`}>
            {t(STATUS_LABEL_KEYS[status] ?? status)}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map(s => {
          const Icon = STATUS_ICONS[s];
          return (
            <DropdownMenuItem key={s} onClick={() => onChangeStatus(s)} data-testid={`badge-set-${s}-${enquiryId}`}>
              {Icon && <Icon className={`w-4 h-4 mr-2 ${STATUS_STYLES[s]?.includes("amber") ? "text-amber-600" : STATUS_STYLES[s]?.includes("blue") ? "text-blue-600" : "text-green-600"}`} />}
              {t(STATUS_LABEL_KEYS[s] ?? s)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type SortOption = "ref-desc" | "ref-asc" | "date-desc" | "date-asc" | "name-asc" | "name-desc";

export default function EnquiryInbox() {
  const { isMaster } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("ref-desc");
  const [statusFilter, setStatusFilter] = useState("all");
  const selection = useSelection();
  const [bulkShareOpen, setBulkShareOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleBulkDelete = async () => {
    const ids = Array.from(selection.selectedIds);
    setBulkDeleting(true);
    let count = 0;
    for (const id of ids) {
      try {
        await apiRequest("DELETE", `/api/enquiries/${id}`);
        count++;
      } catch {}
    }
    setBulkDeleting(false);
    queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
    queryClient.invalidateQueries({ queryKey: ["/api/enquiries/bin"] });
    toast({ title: t("enquiries.movedToBin", { count: String(count) }) });
    selection.exitSelectionMode();
  };

  const { data: enquiries = [], isLoading } = useQuery<Enquiry[]>({
    queryKey: ["/api/enquiries"],
    staleTime: 0,
    refetchInterval: 30000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/enquiries/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
      toast({ title: t("enquiries.statusUpdated") });
    },
    onError: () => {
      toast({ title: t("enquiries.statusUpdateFailed"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/enquiries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
      toast({ title: t("enquiries.enquiryDeleted") });
    },
    onError: () => {
      toast({ title: t("enquiries.enquiryDeleteFailed"), variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    let result = [...enquiries];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.referenceNumber.toLowerCase().includes(q) ||
        e.subject?.toLowerCase().includes(q) ||
        e.customer?.name?.toLowerCase().includes(q) ||
        (e.dealer && `${e.dealer.name} ${e.dealer.surname}`.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== "all") {
      result = result.filter(e => e.status === statusFilter);
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "ref-asc": return a.referenceNumber.localeCompare(b.referenceNumber);
        case "ref-desc": return b.referenceNumber.localeCompare(a.referenceNumber);
        case "date-asc": return new Date(a.date).getTime() - new Date(b.date).getTime();
        case "date-desc": return new Date(b.date).getTime() - new Date(a.date).getTime();
        case "name-asc": return (a.customer?.name ?? "").localeCompare(b.customer?.name ?? "");
        case "name-desc": return (b.customer?.name ?? "").localeCompare(a.customer?.name ?? "");
        default: return 0;
      }
    });

    return result;
  }, [enquiries, search, sortBy, statusFilter]);

  const visibleIds = useMemo(() => filtered.map(e => e.id), [filtered]);

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("enquiries.title")}
          subtitle={t("enquiries.subtitle")}
          icon={<Inbox className="w-7 h-7 text-amber-600" />}
          actions={
            <>
              {!selection.active && (
                <Button variant="outline" onClick={selection.enterSelectionMode} data-testid="button-enter-selection">
                  <CheckSquare className="mr-2 h-4 w-4" />
                  {t("common.select")}
                </Button>
              )}
              <Link href="/enquiries/bin">
                <Button variant="outline" data-testid="button-open-enquiry-bin">
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("common.bin")}
                </Button>
              </Link>
            </>
          }
        />

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-5 h-5 text-muted-foreground" />
            <Input
              placeholder={t("enquiries.searchPlaceholder")}
              className="border-none shadow-none focus-visible:ring-0 bg-transparent"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-enquiries"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              <Select value={sortBy} onValueChange={v => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-[160px]" data-testid="select-sort-enquiries">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ref-desc">{t("offers.sortRefNewest")}</SelectItem>
                  <SelectItem value="ref-asc">{t("offers.sortRefOldest")}</SelectItem>
                  <SelectItem value="date-desc">{t("offers.sortDateNewest")}</SelectItem>
                  <SelectItem value="date-asc">{t("offers.sortDateOldest")}</SelectItem>
                  <SelectItem value="name-asc">{t("offers.sortNameAZ")}</SelectItem>
                  <SelectItem value="name-desc">{t("offers.sortNameZA")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-filter-status-enquiries">
                <SelectValue placeholder={t("offers.allStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("offers.allStatus")}</SelectItem>
                <SelectItem value="pending">{t("enquiries.pending")}</SelectItem>
                <SelectItem value="in_progress">{t("enquiries.inProgress")}</SelectItem>
                <SelectItem value="completed">{t("enquiries.completed")}</SelectItem>
                <SelectItem value="revision_requested">{t("enquiries.revisionRequested")}</SelectItem>
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
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{enquiries.length === 0 ? t("enquiries.noEnquiries") : t("common.noResults")}</p>
              <p className="text-sm mt-1">{enquiries.length === 0 ? t("enquiries.enquiriesWillAppear") : t("enquiries.tryAdjusting")}</p>
            </div>
          ) : (
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
                  <TableHead>{t("offers.dealer")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(enq => (
                  <TableRow
                    key={enq.id}
                    data-testid={`row-enquiry-${enq.id}`}
                    className={`cursor-pointer hover:bg-muted/40 ${selection.active && selection.isSelected(enq.id) ? "bg-primary/5" : ""}`}
                    onClick={() => {
                      if (selection.active) {
                        selection.toggle(enq.id);
                      } else {
                        setLocation(`/enquiries/${enq.id}`);
                      }
                    }}
                  >
                    {selection.active && (
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selection.isSelected(enq.id)}
                          onCheckedChange={() => selection.toggle(enq.id)}
                          data-testid={`checkbox-select-${enq.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono font-semibold text-xs">{enq.referenceNumber}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{enq.subject || "—"}</TableCell>
                    <TableCell>{enq.customer?.name ?? "—"}</TableCell>
                    <TableCell className="text-amber-600 text-sm">
                      {enq.dealer ? `${enq.dealer.name} ${enq.dealer.surname}` : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(enq.date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <StatusBadgeDropdown
                        status={enq.status}
                        enquiryId={enq.id}
                        onChangeStatus={(s) => statusMutation.mutate({ id: enq.id, status: s })}
                      />
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/enquiries/${enq.id}`}>
                          <Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`button-view-enquiry-${enq.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        <InlineConfirmButton
                          title={t("enquiries.deleteEnquiry")}
                          confirmLabel={t("common.delete")}
                          onConfirm={() => deleteMutation.mutate(enq.id)}
                          isPending={deleteMutation.isPending}
                          buttonContent={<Trash2 className="w-4 h-4 text-destructive" />}
                          buttonVariant="ghost"
                          buttonSize="icon"
                          buttonClassName="h-8 w-8"
                          data-testid={`button-delete-enquiry-${enq.id}`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

    </Layout>
  );
}
