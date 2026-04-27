import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineConfirmButton } from "@/components/InlineConfirm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, FileText, ExternalLink, Paperclip, ChevronLeft, AlertCircle, RefreshCw, Check, Building2, User, Calendar, Package, Sparkles, Trash2, ChevronDown, Clock, PlayCircle, CheckCircle2, Share2, Download } from "lucide-react";
import { ShareEntityDialog } from "@/components/ShareOfferDialog";
import { Link, useLocation, useParams } from "wouter";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCreateOfferVersion } from "@/hooks/use-offers";
import { AIAssistantPanel } from "@/components/ai/AIAssistantPanel";
import { useSummarizeEnquiry, useSubmitFeedback } from "@/hooks/use-ai-assistant";
import type { EnquirySummaryOutput, AiRun } from "@/components/ai/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface EnquiryItemOption {
  id: number;
  machineOptionId: number;
  snapshotOptionName: string;
  quantity: number;
}

interface EnquiryItem {
  id: number;
  machineId: number;
  quantity: number;
  snapshotMachineName?: string;
  machine?: { id: number; name: string; machineCode: string | null };
  options?: EnquiryItemOption[];
  optionIds?: number[];
  selectedOptions?: { id: number; name: string }[];
}

interface Enquiry {
  id: number;
  referenceNumber: string;
  subject: string;
  status: string;
  date: string;
  dealerId: number | null;
  salesmanUserId: number | null;
  customer: { id: number; name: string; email: string; contactPerson: string | null; address: string | null };
  dealer?: { id: number; name: string; surname: string; email: string } | null;
  projectData?: any;
  items?: EnquiryItem[];
  linkedOfferId?: number | null;
}

function statusBadge(status: string) {
  switch (status) {
    case "pending": return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>;
    case "in_progress": return <Badge className="bg-blue-100 text-blue-700 border-blue-200">In Progress</Badge>;
    case "completed": return <Badge className="bg-green-100 text-green-700 border-green-200">Completed</Badge>;
    case "revision_requested": return <Badge className="bg-red-100 text-red-700 border-red-200">Revision Requested</Badge>;
    default: return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function EnquiryView() {
  const { id } = useParams<{ id: string }>();
  const { isMaster } = useAuth();
  const { toast } = useToast();
  const createVersion = useCreateOfferVersion();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiRun, setAiRun] = useState<AiRun | null>(null);
  const [aiOutput, setAiOutput] = useState<EnquirySummaryOutput | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsLargeScreen(mql.matches);
    mql.addEventListener("change", onChange);
    setIsLargeScreen(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const { data: enquiry, isLoading } = useQuery<Enquiry>({
    queryKey: ["/api/enquiries", parseInt(id)],
    queryFn: () => fetch(`/api/enquiries/${id}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: attachments = [] } = useQuery<any[]>({
    queryKey: ["/api/enquiries", parseInt(id), "attachments"],
    queryFn: () => fetch(`/api/enquiries/${id}/attachments`, { credentials: "include" }).then(r => r.json()),
    enabled: !!id,
  });

  const { data: machines } = useQuery<any[]>({
    queryKey: ["/api/machines"],
  });

  const { data: aiSettings } = useQuery<{ enabled: boolean; hasKey: boolean }>({
    queryKey: ["/api/settings/ai"],
    queryFn: async () => {
      const res = await fetch("/api/settings/ai", { credentials: "include" });
      if (!res.ok) return { enabled: false, hasKey: false };
      return res.json();
    },
  });

  const aiAvailable = aiSettings?.enabled && aiSettings?.hasKey;

  const statusMutation = useMutation({
    mutationFn: (status: string) => apiRequest("PATCH", `/api/enquiries/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/enquiries", parseInt(id)] });
      toast({ title: "Status updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/enquiries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
      toast({ title: "Enquiry deleted" });
      setLocation("/enquiries");
    },
    onError: () => {
      toast({ title: "Failed to delete enquiry", variant: "destructive" });
    },
  });

  const summarizeMutation = useSummarizeEnquiry();
  const feedbackMutation = useSubmitFeedback();

  const items: EnquiryItem[] = enquiry?.items ?? [];

  function handleAnalyze() {
    if (!enquiry) return;
    setShowAiPanel(true);
    setAiError(null);
    setAiRun(null);
    setAiOutput(null);

    const existingItems = items.map(item => {
      const machine = machines?.find((m: any) => m.id === item.machineId) ?? item.machine;
      return { machineName: machine?.name ?? `Machine #${item.machineId}`, quantity: item.quantity };
    });

    const attachmentNames = attachments.map((att: any) => att.originalName ?? att.filename);

    const notes = [
      enquiry.projectData?.lineDescription ?? "",
      enquiry.projectData?.revisionNotes?.map((n: any) => n.text).join("\n") ?? "",
    ].filter(Boolean).join("\n\n");

    summarizeMutation.mutate(
      {
        enquirySubject: enquiry.subject,
        enquiryNotes: notes || "(No notes provided)",
        customerName: enquiry.customer?.name ?? "Unknown",
        customerAddress: enquiry.customer?.address ?? undefined,
        dealerName: enquiry.dealer ? `${enquiry.dealer.name} ${enquiry.dealer.surname}` : undefined,
        attachmentNames,
        existingItems,
        enquiryId: enquiry.id,
        language: "en",
      },
      {
        onSuccess: (data) => {
          setAiRun(data.run);
          setAiOutput(data.output);
          if (data.run.status === "failed") {
            setAiError(data.run.error ?? "AI analysis failed");
          }
        },
        onError: (err) => {
          setAiError(err.message);
        },
      },
    );
  }

  function handleFeedback(runId: string, rating: "accepted" | "rejected" | "modified") {
    feedbackMutation.mutate(
      { runId, rating },
      {
        onSuccess: () => {
          toast({ title: "Feedback submitted", description: `You ${rating} the AI suggestion.` });
        },
        onError: (err) => {
          toast({ title: "Feedback failed", description: err.message, variant: "destructive" });
        },
      },
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!enquiry) {
    return (
      <Layout>
        <div className="text-center py-24 text-muted-foreground">Enquiry not found.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={`flex gap-0 ${showAiPanel ? "" : ""}`}>
        <div className={`flex-1 min-w-0 ${showAiPanel ? "max-w-4xl" : "max-w-6xl mx-auto"} space-y-6`}>
          <PageHeader
            title={enquiry.referenceNumber}
            subtitle={enquiry.subject}
            actions={
              <div className="flex items-center gap-2">
                {statusBadge(enquiry.status)}
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {format(new Date(enquiry.date), "MMMM d, yyyy")}
                </span>
              </div>
            }
          />
          <div className="flex flex-wrap gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        variant="outline"
                        onClick={handleAnalyze}
                        disabled={summarizeMutation.isPending || !aiAvailable}
                        className="gap-2"
                        data-testid="button-analyze-enquiry"
                      >
                        {summarizeMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        {summarizeMutation.isPending ? "Analyzing..." : "Analyze with AI"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!aiAvailable && (
                    <TooltipContent>
                      <p>{aiSettings?.enabled === false ? "AI services are disabled by system settings" : "AI provider is not configured"}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
              {enquiry.status === "pending" && (
                <Button
                  onClick={() => setLocation(`/offers/new?fromEnquiry=${enquiry.id}`)}
                  className="gap-2"
                  data-testid="button-create-offer-from-enquiry"
                >
                  <FileText className="w-4 h-4" />
                  Create Offer
                </Button>
              )}
              {enquiry.status === "revision_requested" && (
                <Button
                  className="gap-2"
                  disabled={createVersion.isPending}
                  data-testid="button-create-new-version"
                  onClick={() => {
                    if (enquiry.linkedOfferId) {
                      createVersion.mutate(enquiry.linkedOfferId, {
                        onSuccess: (newOffer: any) => {
                          setLocation(`/offers/${newOffer.id}/edit`);
                        },
                        onError: () => {
                          toast({ title: "Failed to create new version", variant: "destructive" });
                        },
                      });
                    } else {
                      setLocation(`/offers/new?fromEnquiry=${enquiry.id}`);
                    }
                  }}
                >
                  {createVersion.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  Create New Version
                </Button>
              )}
              {(enquiry.status === "in_progress" || enquiry.status === "completed") && enquiry.linkedOfferId && (
                <Link href={`/offers/${enquiry.linkedOfferId}`}>
                  <Button variant="outline" className="gap-2" data-testid="button-view-linked-offer">
                    <ExternalLink className="w-4 h-4" />
                    View Linked Offer
                  </Button>
                </Link>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1" disabled={statusMutation.isPending} data-testid="button-change-status">
                    {statusMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Change Status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {enquiry.status !== "pending" && (
                    <DropdownMenuItem onClick={() => statusMutation.mutate("pending")} data-testid="menu-status-pending">
                      <Clock className="w-4 h-4 mr-2 text-amber-600" />
                      Set Pending
                    </DropdownMenuItem>
                  )}
                  {enquiry.status !== "in_progress" && (
                    <DropdownMenuItem onClick={() => statusMutation.mutate("in_progress")} data-testid="menu-status-in-progress">
                      <PlayCircle className="w-4 h-4 mr-2 text-blue-600" />
                      Set In Progress
                    </DropdownMenuItem>
                  )}
                  {enquiry.status !== "completed" && (
                    <DropdownMenuItem onClick={() => statusMutation.mutate("completed")} data-testid="menu-status-completed">
                      <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                      Set Completed
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <InlineConfirmButton
                title="Delete enquiry?"
                confirmLabel="Delete"
                onConfirm={() => deleteMutation.mutate()}
                isPending={deleteMutation.isPending}
                buttonContent={<><Trash2 className="w-3.5 h-3.5" />Delete</>}
                buttonVariant="outline"
                buttonSize="sm"
                buttonClassName="gap-1 text-destructive hover:text-destructive"
                data-testid="button-delete-enquiry"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareOpen(true)}
                className="gap-1"
                data-testid="button-share-enquiry"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="border rounded-xl bg-card p-4 space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Customer
              </h2>
              <div className="space-y-1 text-sm">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">Company</span>
                <p className="font-semibold text-base">{enquiry.customer?.name ?? "—"}</p>
                {(enquiry.projectData?.headerInfo?.customer?.address || enquiry.customer?.address) && (
                  <p className="text-muted-foreground text-xs">{enquiry.projectData?.headerInfo?.customer?.address || enquiry.customer?.address}</p>
                )}
              </div>
              {(enquiry.projectData?.headerInfo?.customer?.contactPerson || enquiry.customer?.contactPerson) && (
                <div className="space-y-1 text-sm border-t pt-3">
                  <span className="text-muted-foreground text-xs uppercase tracking-wide">Contact Person</span>
                  <p className="font-medium">{enquiry.projectData?.headerInfo?.customer?.contactPerson || enquiry.customer?.contactPerson}</p>
                  {(enquiry.projectData?.headerInfo?.customer?.email || enquiry.customer?.email) && (
                    <p className="text-muted-foreground text-xs">{enquiry.projectData?.headerInfo?.customer?.email || enquiry.customer?.email}</p>
                  )}
                </div>
              )}
            </div>

            {enquiry.dealer && (
              <div className="border rounded-xl bg-card p-4 space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <User className="w-4 h-4" /> Dealer
                </h2>
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-base">{enquiry.dealer.name} {enquiry.dealer.surname}</p>
                  <p className="text-muted-foreground">{enquiry.dealer.email}</p>
                </div>
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="border rounded-xl bg-card p-4 space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Package className="w-4 h-4" /> Composition
              </h2>
              <div className="space-y-2">
                {items.map((item, idx) => {
                  const machine = machines?.find(m => m.id === item.machineId) ?? item.machine;
                  const resolvedOpts: { id: number; name: string }[] = (() => {
                    if (item.options && item.options.length > 0) {
                      return item.options.map(o => ({ id: o.id, name: o.snapshotOptionName }));
                    }
                    const selectedOpts = item.selectedOptions ?? [];
                    if (selectedOpts.length > 0) return selectedOpts;
                    return (item.optionIds ?? []).map(oid => {
                      const opt = (machine as any)?.options?.find((o: any) => o.id === oid);
                      return opt ? { id: oid, name: opt.name } : null;
                    }).filter(Boolean) as { id: number; name: string }[];
                  })();

                  return (
                    <div key={item.id ?? idx} className="flex gap-3 p-3 border rounded-lg bg-muted/20">
                      <div className="text-xs font-bold text-muted-foreground w-10 shrink-0 pt-0.5">
                        Pos. {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">
                          {machine ? (
                            <>
                              {machine.machineCode && (
                                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs mr-2">{machine.machineCode}</span>
                              )}
                              {machine.name}
                            </>
                          ) : item.snapshotMachineName ?? `Machine #${item.machineId}`}
                          <span className="text-muted-foreground ml-2 text-xs">× {item.quantity}</span>
                        </div>
                        {resolvedOpts.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {resolvedOpts.map(opt => (
                              <span key={opt.id} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                                {opt.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {enquiry.projectData?.lineDescription && (
            <div className="border rounded-xl bg-card p-4 space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Line Description</h2>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{enquiry.projectData.lineDescription}</p>
            </div>
          )}

          {enquiry.projectData?.commercial && (() => {
            const c = enquiry.projectData.commercial;
            const salesModelLabels: Record<string, string> = { dealer_buys_resells: "Dealer buys and resells", manufacturer_sells_commission: "Manufacturer sells directly — dealer receives commission" };
            const installLabels: Record<string, string> = { installation_required: "Installation required from manufacturer", installation_by_dealer: "Installation handled by dealer" };
            const urgencyLabels: Record<string, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
            const paintLabels: Record<string, string> = { not_defined: "Not defined yet", defined: "Defined" };
            const hasAny = c.salesModel || c.installationResponsibility || c.offerUrgency || c.deliveryUrgency || c.paintSupplierStatus || c.hasIntermediaries;
            if (!hasAny) return null;
            return (
              <div className="border rounded-xl bg-card p-4 space-y-3" data-testid="section-commercial-details">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Commercial Details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {c.salesModel && (
                    <div>
                      <span className="text-muted-foreground text-xs">Sales Model</span>
                      <p className="font-medium">{salesModelLabels[c.salesModel] || c.salesModel}</p>
                    </div>
                  )}
                  {c.installationResponsibility && (
                    <div>
                      <span className="text-muted-foreground text-xs">Installation</span>
                      <p className="font-medium">{installLabels[c.installationResponsibility] || c.installationResponsibility}</p>
                      {c.installationNotes && <p className="text-xs text-muted-foreground mt-0.5">{c.installationNotes}</p>}
                    </div>
                  )}
                  {c.offerUrgency && (
                    <div>
                      <span className="text-muted-foreground text-xs">Offer Urgency</span>
                      <p className="font-medium">{urgencyLabels[c.offerUrgency] || c.offerUrgency}</p>
                    </div>
                  )}
                  {c.deliveryUrgency && (
                    <div>
                      <span className="text-muted-foreground text-xs">Delivery Urgency</span>
                      <p className="font-medium">{urgencyLabels[c.deliveryUrgency] || c.deliveryUrgency}</p>
                    </div>
                  )}
                  {c.paintSupplierStatus && (
                    <div>
                      <span className="text-muted-foreground text-xs">Paint Supplier</span>
                      <p className="font-medium">{paintLabels[c.paintSupplierStatus] || c.paintSupplierStatus}</p>
                      {c.paintSupplierStatus === "defined" && (c.paintSupplierName || c.paintSupplierContact) && (
                        <p className="text-xs text-muted-foreground mt-0.5">{[c.paintSupplierName, c.paintSupplierContact].filter(Boolean).join(" — ")}</p>
                      )}
                    </div>
                  )}
                  {c.hasIntermediaries && (
                    <div>
                      <span className="text-muted-foreground text-xs">Intermediaries / Referrers</span>
                      <p className="font-medium">{c.hasIntermediaries === "yes" ? "Yes" : "No"}</p>
                      {c.hasIntermediaries === "yes" && c.intermediariesDetails && (
                        <p className="text-xs text-muted-foreground mt-0.5">{c.intermediariesDetails}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {attachments.length > 0 && (
            <div className="border rounded-xl bg-card p-4 space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Paperclip className="w-4 h-4" /> Attachments
              </h2>
              <div className="space-y-2">
                {attachments.map((att: any) => (
                  <a
                    key={att.id}
                    href={`/enquiry-attachments/${att.filename}`}
                    download={att.originalName}
                    className="flex items-center gap-3 text-sm p-2 border rounded-lg hover:bg-muted/40 transition-colors group"
                    data-testid={`link-attachment-${att.id}`}
                  >
                    <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate font-medium">{att.originalName}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{(att.size / 1024 / 1024).toFixed(1)} MB</span>
                    <Download className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {enquiry.status === "revision_requested" && enquiry.projectData?.revisionNotes?.length > 0 && (
            <div className="border border-red-200 rounded-xl bg-red-50 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-red-700 uppercase tracking-wide flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Revision Notes
              </h2>
              {enquiry.projectData.revisionNotes.map((note: any, i: number) => (
                <div key={i} className="bg-white border border-red-100 rounded-lg p-3 text-sm space-y-1">
                  <p>{note.text}</p>
                  <p className="text-xs text-muted-foreground">{note.dealerName} · {format(new Date(note.requestedAt), "MMM d, yyyy HH:mm")}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {showAiPanel && isLargeScreen && (
          <div
            className="w-[380px] shrink-0 sticky top-0 h-[calc(100vh-4rem)] flex animate-in slide-in-from-right-5 duration-300"
            data-testid="ai-panel-container"
          >
            <AIAssistantPanel
              isLoading={summarizeMutation.isPending}
              error={aiError}
              run={aiRun}
              output={aiOutput}
              workflowType="enquiry_summary"
              onFeedback={handleFeedback}
              onDismiss={() => setShowAiPanel(false)}
              onRetry={handleAnalyze}
              feedbackPending={feedbackMutation.isPending}
              title="Enquiry Analysis"
            />
          </div>
        )}

        {!isLargeScreen && showAiPanel && (
          <div className="mt-6 border rounded-xl bg-card" data-testid="ai-panel-inline-mobile">
            <AIAssistantPanel
              isLoading={summarizeMutation.isPending}
              error={aiError}
              run={aiRun}
              output={aiOutput}
              workflowType="enquiry_summary"
              onFeedback={handleFeedback}
              onDismiss={() => setShowAiPanel(false)}
              onRetry={handleAnalyze}
              feedbackPending={feedbackMutation.isPending}
              title="Enquiry Analysis"
            />
          </div>
        )}
      </div>

      <ShareEntityDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        entityType="enquiry"
        entityId={enquiry.id}
        entityReference={enquiry.referenceNumber}
      />
    </Layout>
  );
}
