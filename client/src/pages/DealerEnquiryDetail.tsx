import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineConfirmButton } from "@/components/InlineConfirm";
import { Loader2, FileText, ExternalLink, Trash2, ChevronDown, Clock, PlayCircle, CheckCircle2, Share2, User, Mail, Phone, MapPin, Building2, Wrench } from "lucide-react";
import { ShareEntityDialog } from "@/components/ShareOfferDialog";
import { Link, useParams, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface LinkedOffer {
  id: number;
  referenceNumber: string;
  status: string;
  projectData?: any;
}

interface DealerEnquiry {
  id: number;
  referenceNumber: string;
  subject: string;
  status: string;
  date: string;
  customer: { id: number; companyName: string };
  items: any[];
  projectData?: any;
  attachments?: any[];
  linkedOfferId?: number | null;
  linkedOfferStatus?: string | null;
  linkedOffers?: LinkedOffer[];
}

function statusBadge(status: string) {
  switch (status) {
    case "pending": return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pending — Awaiting your sales team</Badge>;
    case "in_progress": return <Badge className="bg-blue-100 text-blue-700 border-blue-200">In Progress — Your offer is being prepared</Badge>;
    case "completed": return <Badge className="bg-green-100 text-green-700 border-green-200">Completed — Offer ready</Badge>;
    case "revision_requested": return <Badge className="bg-red-100 text-red-700 border-red-200">Revision Requested</Badge>;
    default: return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function DealerEnquiryDetail() {
  const { id } = useParams<{ id: string }>();
  const enquiryId = parseInt(id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [shareOpen, setShareOpen] = useState(false);

  const { data: enquiry, isLoading } = useQuery<DealerEnquiry>({
    queryKey: ["/api/dealer/enquiries", enquiryId],
    queryFn: () => fetch(`/api/dealer/enquiries/${enquiryId}`, { credentials: "include" }).then(r => r.json()),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest("PATCH", `/api/dealer/enquiries/${enquiryId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/enquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/enquiries", enquiryId] });
      toast({ title: "Status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/dealer/enquiries/${enquiryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/enquiries"] });
      toast({ title: "Request deleted" });
      setLocation("/dealer/requests");
    },
    onError: () => {
      toast({ title: "Failed to delete request", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <DealerLayout>
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      </DealerLayout>
    );
  }

  if (!enquiry) {
    return (
      <DealerLayout>
        <div className="text-center py-20 text-muted-foreground">Enquiry not found</div>
      </DealerLayout>
    );
  }

  return (
    <DealerLayout>
      <div className="space-y-6 max-w-6xl">
        <PageHeader
          title={enquiry.referenceNumber}
          subtitle={enquiry.subject}
        />

        <div className="border rounded-xl bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {statusBadge(enquiry.status)}
            <div className="ml-auto flex items-center gap-2">
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
                title="Delete request?"
                confirmLabel="Delete"
                onConfirm={() => deleteMutation.mutate()}
                isPending={deleteMutation.isPending}
                buttonContent={<><Trash2 className="w-3.5 h-3.5" />Delete</>}
                buttonVariant="outline"
                buttonSize="sm"
                buttonClassName="gap-1 text-destructive hover:text-destructive"
                data-testid="button-delete-request"
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
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Customer</span>
              <p className="font-medium">{enquiry.customer?.companyName}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Date</span>
              <p className="font-medium">{enquiry.projectData?.headerInfo?.date ? new Date(enquiry.projectData.headerInfo.date).toLocaleDateString() : new Date(enquiry.date).toLocaleDateString()}</p>
            </div>
            {enquiry.projectData?.family && (
              <div>
                <span className="text-muted-foreground text-xs">Product Family</span>
                <p className="font-medium capitalize">{enquiry.projectData.family}</p>
              </div>
            )}
            {enquiry.projectData?.layout && (
              <div>
                <span className="text-muted-foreground text-xs">Layout</span>
                <p className="font-medium">{enquiry.projectData.layout}</p>
              </div>
            )}
          </div>
        </div>

        {enquiry.projectData?.headerInfo && (() => {
          const hi = enquiry.projectData.headerInfo;
          const salesman = hi.salesman;
          const customer = hi.customer;
          const hasSalesman = salesman && (salesman.name || salesman.email || salesman.mobile);
          const hasCustomer = customer && (customer.name || customer.contactPerson || customer.email || customer.address);
          if (!hasSalesman && !hasCustomer) return null;
          return (
            <div className="border rounded-xl bg-card p-4 space-y-4" data-testid="section-header-info">
              <h2 className="font-semibold text-sm">Contact Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {hasSalesman && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dealer Contact</span>
                    <div className="space-y-1.5 text-sm">
                      {salesman.name && (
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span>{salesman.name}</span>
                        </div>
                      )}
                      {salesman.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span>{salesman.email}</span>
                        </div>
                      )}
                      {salesman.mobile && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span>{salesman.mobile}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {hasCustomer && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">End Customer</span>
                    <div className="space-y-1.5 text-sm">
                      {customer.name && (
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span>{customer.name}</span>
                        </div>
                      )}
                      {customer.contactPerson && (
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span>{customer.contactPerson}</span>
                        </div>
                      )}
                      {customer.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span>{customer.email}</span>
                        </div>
                      )}
                      {customer.address && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span>{customer.address}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {enquiry.items?.length > 0 && (
          <div className="border rounded-xl bg-card p-4 space-y-3">
            <h2 className="font-semibold text-sm">Machines Requested</h2>
            <div className="space-y-2">
              {enquiry.items.map((item: any, i: number) => (
                <div key={item.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted/30" data-testid={`machine-item-${i}`}>
                  <span className="text-xs text-muted-foreground font-mono mt-0.5">#{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.snapshotMachineName} ×{item.quantity}</p>
                    {item.options?.map((opt: any) => (
                      <p key={opt.id} className="text-xs text-muted-foreground">+ {opt.snapshotOptionName}{opt.quantity > 1 ? ` ×${opt.quantity}` : ""}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {enquiry.projectData?.technicalSpecs && (() => {
          const ts = enquiry.projectData.technicalSpecs;
          const specFields = [
            { key: "minMaxLength", label: "Min/Max. length (mm)" },
            { key: "maxWidth", label: "Max. width (mm)" },
            { key: "minMaxThickness", label: "Min/Max. thickness (mm)" },
            { key: "averageLineSpeed", label: "Average line speed (mt/min)" },
            { key: "controlSide", label: "Control side" },
            { key: "maxBow", label: "Max. bow of the panel" },
            { key: "paint", label: "Paint" },
            { key: "substrate", label: "Substrate" },
            { key: "finishing", label: "Finishing" },
          ];
          const standardFields = [
            { key: "standardVoltage", label: "Standard voltage" },
            { key: "standardColors", label: "Standard colors" },
          ];
          const textAreaFields = [
            { key: "components", label: "Components" },
            { key: "precautions", label: "Precautions" },
            { key: "commissioning", label: "Commissioning and start-up" },
          ];
          const hasSpecs = specFields.some(f => ts[f.key]);
          const hasStandard = standardFields.some(f => ts[f.key]) || textAreaFields.some(f => ts[f.key]);
          if (!hasSpecs && !hasStandard) return null;
          return (
            <div className="border rounded-xl bg-card p-4 space-y-3" data-testid="section-technical-specs">
              <h2 className="font-semibold text-sm flex items-center gap-2"><Wrench className="w-4 h-4" /> Technical Specifications</h2>
              {hasSpecs && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                  {specFields.map(f => ts[f.key] ? (
                    <div key={f.key}>
                      <span className="text-muted-foreground text-xs">{f.label}</span>
                      <p className="font-medium">{ts[f.key]}</p>
                    </div>
                  ) : null)}
                </div>
              )}
              {hasStandard && (
                <>
                  <h3 className="font-medium text-xs uppercase tracking-wide text-muted-foreground pt-2 border-t">Standard Specifications</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {standardFields.map(f => ts[f.key] ? (
                      <div key={f.key}>
                        <span className="text-muted-foreground text-xs">{f.label}</span>
                        <p className="font-medium">{ts[f.key]}</p>
                      </div>
                    ) : null)}
                  </div>
                  {textAreaFields.map(f => ts[f.key] ? (
                    <div key={f.key}>
                      <span className="text-muted-foreground text-xs">{f.label}</span>
                      <p className="text-sm whitespace-pre-wrap mt-0.5">{ts[f.key]}</p>
                    </div>
                  ) : null)}
                </>
              )}
            </div>
          );
        })()}

        {(enquiry.projectData?.lineDescription || enquiry.projectData?.notes) && (
          <div className="border rounded-xl bg-card p-4 space-y-3">
            {enquiry.projectData.lineDescription && (
              <div className="space-y-1">
                <h2 className="font-semibold text-sm">Line Description</h2>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{enquiry.projectData.lineDescription}</p>
              </div>
            )}
            {enquiry.projectData.notes && (
              <div className="space-y-1">
                <h2 className="font-semibold text-sm">Notes</h2>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{enquiry.projectData.notes}</p>
              </div>
            )}
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
              <h2 className="font-semibold text-sm">Commercial Details</h2>
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

        {enquiry.attachments && enquiry.attachments.length > 0 && (
          <div className="border rounded-xl bg-card p-4 space-y-2">
            <h2 className="font-semibold text-sm">Attachments</h2>
            <div className="space-y-1">
              {enquiry.attachments.map((att: any) => (
                <a
                  key={att.id}
                  href={`/enquiry-attachments/${att.filename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                  data-testid={`link-att-${att.id}`}
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span>{att.originalName}</span>
                  <ExternalLink className="w-3 h-3 ml-auto shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {enquiry.linkedOffers && enquiry.linkedOffers.length > 0 && (
          <div className="border rounded-xl p-4 space-y-3" data-testid="linked-offers-section">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Linked Offers</h3>
            <div className="space-y-2">
              {enquiry.linkedOffers.map((offer: LinkedOffer) => {
                const pd = offer.projectData as any;
                const isDealerVersion = !!pd?.dealerVersionOf;
                const label = isDealerVersion ? "Dealer Offer" : "Supplier Offer";
                return (
                  <div key={offer.id} className="flex items-center gap-3 border rounded-lg p-3 bg-muted/30" data-testid={`linked-offer-${offer.id}`}>
                    <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{offer.referenceNumber}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{offer.status}</p>
                    </div>
                    <Link href={`/dealer/offers/${offer.id}`}>
                      <Button variant="outline" size="sm" className="shrink-0" data-testid={`button-view-offer-${offer.id}`}>
                        View
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {enquiry.status === "revision_requested" && enquiry.projectData?.revisionNotes?.length > 0 && (
          <div className="border rounded-xl bg-red-50 border-red-200 p-4 space-y-2">
            <p className="font-semibold text-red-800 text-sm">Revision Requested</p>
            {enquiry.projectData.revisionNotes.map((note: any, i: number) => (
              <div key={i} className="text-sm">
                <p className="text-red-700">{note.text}</p>
                <p className="text-xs text-muted-foreground">{new Date(note.requestedAt).toLocaleString()}</p>
              </div>
            ))}
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
    </DealerLayout>
  );
}
