import { useState } from "react";
import { Layout } from "@/components/Layout";
import { LinkedEmailAttachments } from "@/components/LinkedEmailAttachments";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft, Loader2, Building2, UserCircle, Mail, Phone, MapPin, Edit2, Trash2,
  Shield, FileText, MessageSquare, Clock, Calendar, CheckCircle2, XCircle, Plus,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link, useParams, useLocation, useSearch } from "wouter";

import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import type { Contact, Customer, SalesmanUser, Offer, Interaction } from "@shared/schema";
import { InteractionList } from "@/pages/Interactions";

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div data-testid={`field-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="font-medium mt-0.5 text-sm">{value}</p>
    </div>
  );
}

function ArrayField({ label, values }: { label: string; values: string[] | null | undefined }) {
  if (!values || values.length === 0) return null;
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex flex-wrap gap-1 mt-1">
        {values.map((v, i) => (
          <Badge key={i} variant="secondary" className="text-xs">{v}</Badge>
        ))}
      </div>
    </div>
  );
}

const CONTACT_TABS = ["overview", "documents", "interactions", "privacy"] as const;

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const contactId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const search = useSearch();

  const searchParams = new URLSearchParams(search);
  const rawTab = searchParams.get("tab") || "overview";
  const activeTab = CONTACT_TABS.includes(rawTab as any) ? rawTab : "overview";
  const setTab = (tab: string) => navigate(`/crm/contacts/${contactId}?tab=${tab}`, { replace: true });

  const { data: contact, isLoading } = useQuery<Contact>({
    queryKey: ["/api/contacts", contactId],
    enabled: !!contactId,
  });

  const { data: company } = useQuery<Customer>({
    queryKey: ["/api/customers", contact?.customerId],
    enabled: !!contact?.customerId,
  });

  const { data: companyOffers = [] } = useQuery<Offer[]>({
    queryKey: ["/api/customers", contact?.customerId, "offers"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${contact!.customerId}/offers`, { credentials: "include" });
      return res.json();
    },
    enabled: !!contact?.customerId,
  });


  const { data: contactInteractions = [] } = useQuery<(Interaction & { customerName?: string; contactName?: string })[]>({
    queryKey: ["/api/interactions?contactId=" + contactId],
    enabled: !!contactId,
  });

  const deleteInteractionMutation = useMutation({
    mutationFn: async (intId: number) => apiRequest("DELETE", `/api/interactions/${intId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/interactions");
      }});
      toast({ title: "Interaction deleted" });
    },
  });

  const { data: salesmen = [] } = useQuery<SalesmanUser[]>({ queryKey: ["/api/users"] });

  const validateMutation = useMutation({
    mutationFn: async ({ action }: { action: "approve" | "reject" }) => {
      const res = await apiRequest("POST", `/api/contacts/${contactId}/validate`, { action });
      return res.json();
    },
    onSuccess: (data, { action }) => {
      if (data.deleted) {
        const msg = action === "approve" ? "Deletion approved — contact removed" : "Contact rejected and removed";
        toast({ title: msg });
        navigate("/crm/contacts");
      } else {
        const msg = action === "approve" ? "Contact approved" : "Deletion rejected — contact kept active";
        toast({ title: msg });
        queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId] });
        queryClient.invalidateQueries({ queryKey: ["/api/pending-validations"] });
      }
    },
    onError: () => toast({ title: "Validation failed", variant: "destructive" }),
  });

  if (isLoading) {
    return <Layout><div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin" /></div></Layout>;
  }
  if (!contact) {
    return <Layout><div className="text-center py-24 text-muted-foreground">Contact not found</div></Layout>;
  }

  const salesman = salesmen.find(s => s.id === contact.salesmanId);
  const offers = companyOffers.filter(o => o.offerType === "offer" && !o.deletedAt);
  const enquiries = companyOffers.filter(o => o.offerType === "enquiry" && !o.deletedAt);

  const statusColor = (s: string) => {
    if (s === "Accepted" || s === "Won") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (s === "Sent" || s === "Pending") return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    if (s === "Draft") return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    if (s === "Lost" || s === "Rejected") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title={`${contact.firstName} ${contact.lastName}`}
          subtitle={company ? `Contact at ${company.name}` : "Contact Profile"}
          actions={
            <div className="flex gap-2">
              {company && (
                <Link href={`/crm/companies/${company.id}`}>
                  <Button size="sm" variant="outline" data-testid="button-view-company">
                    <Building2 className="w-4 h-4 mr-1" /> View Company
                  </Button>
                </Link>
              )}
              <Link href={`/crm/contacts/${contactId}/edit`}>
                <Button size="sm" variant="outline" data-testid="button-edit-contact">
                  <Edit2 className="w-4 h-4 mr-1" /> Edit
                </Button>
              </Link>
            </div>
          }
        />

        {contact.contactStatus === "Pending Validation" && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4 flex items-center gap-3" data-testid="banner-pending-validation">
            <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-medium text-amber-800 dark:text-amber-200">Pending Validation</span>
              <span className="text-muted-foreground ml-1">
                — this contact was created by a dealer and needs your approval before it becomes active.
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => validateMutation.mutate({ action: "approve" })}
                disabled={validateMutation.isPending}
                data-testid="button-approve-contact"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { if (confirm("Reject and delete this contact?")) validateMutation.mutate({ action: "reject" }); }}
                disabled={validateMutation.isPending}
                data-testid="button-reject-contact"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
              </Button>
            </div>
          </div>
        )}

        {contact.contactStatus === "Pending Deletion" && (
          <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-4 flex items-center gap-3" data-testid="banner-pending-deletion">
            <Trash2 className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-medium text-red-800 dark:text-red-200">Deletion Requested</span>
              <span className="text-muted-foreground ml-1">
                — a dealer has requested to delete this contact. Approve to permanently delete or reject to keep it active.
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { if (confirm("Permanently delete this contact?")) validateMutation.mutate({ action: "approve" }); }}
                disabled={validateMutation.isPending}
                data-testid="button-approve-deletion-contact"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Approve Deletion
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => validateMutation.mutate({ action: "reject" })}
                disabled={validateMutation.isPending}
                data-testid="button-reject-deletion-contact"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" /> Keep Active
              </Button>
            </div>
          </div>
        )}

        {/* Summary Badges */}
        <div className="flex flex-wrap gap-3">
          {company && (
            <Link href={`/crm/companies/${company.id}`}>
              <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm hover:bg-muted/50 cursor-pointer">
                <Building2 className="w-4 h-4 text-blue-500" />
                <span className="font-medium">{company.name}</span>
              </div>
            </Link>
          )}
          {contact.contactStatus && (
            <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
              <span className="text-muted-foreground">Status:</span>
              <Badge variant={contact.contactStatus === "Pending Validation" || contact.contactStatus === "Pending Deletion" ? "outline" : "secondary"} className={contact.contactStatus === "Pending Validation" ? "border-amber-400 text-amber-700" : contact.contactStatus === "Pending Deletion" ? "border-red-400 text-red-700" : ""}>{contact.contactStatus}</Badge>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="font-medium">{offers.length}</span> <span className="text-muted-foreground">Offers</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
            <Mail className="w-4 h-4 text-orange-500" />
            <span className="font-medium">{enquiries.length}</span> <span className="text-muted-foreground">Enquiries</span>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">Documents</TabsTrigger>
            <TabsTrigger value="interactions" data-testid="tab-interactions">Interactions</TabsTrigger>
            <TabsTrigger value="privacy" data-testid="tab-privacy">Privacy & Marketing</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Identity */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <UserCircle className="w-4 h-4 text-muted-foreground" /> Identity
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Last Name" value={contact.lastName} />
                  <InfoField label="First Name" value={contact.firstName} />
                  <InfoField label="Contact Status" value={contact.contactStatus} />
                  <InfoField label="Date of Birth" value={contact.dateOfBirth} />
                  <InfoField label="Language" value={contact.language} />
                  <InfoField label="Tipo" value={contact.tipo} />
                  <ArrayField label="Contact Role" values={contact.contactRole} />
                  {contact.role && <InfoField label="Role (Legacy)" value={contact.role} />}
                  {contact.description && (
                    <div className="col-span-2">
                      <InfoField label="Description" value={contact.description} />
                    </div>
                  )}
                </div>
              </div>

              {/* Contact Details */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" /> Contact Details
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Email" value={contact.email} />
                  <InfoField label="Mobile" value={contact.mobile} />
                  <InfoField label="Office Phone" value={contact.officePhone} />
                  <InfoField label="Phone" value={contact.phone} />
                  <InfoField label="Fax" value={contact.fax} />
                </div>
              </div>

              {/* Address */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" /> Address
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Address" value={contact.address} />
                  <InfoField label="Postal Code" value={contact.postalCode} />
                  <InfoField label="City" value={contact.city} />
                  <InfoField label="Country" value={contact.country} />
                  <InfoField label="Region" value={contact.region} />
                  <InfoField label="District" value={contact.district} />
                </div>
              </div>

              {/* Assignment & Source */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base">Assignment & Source</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Account (Company)" value={company?.name} />
                  <InfoField label="Company Entity" value={contact.company} />
                  <InfoField label="Salesman" value={salesman?.name} />
                  <InfoField label="Source of Contact" value={contact.sourceOfContact} />
                  <InfoField label="Exhibition Name" value={contact.exhibitionName} />
                  <InfoField label="Exhibition Year" value={contact.exhibitionYear} />
                  <InfoField label="Area of Interest" value={contact.areaOfInterest} />
                  <InfoField label="Area of Interest Description" value={contact.areaOfInterestDescription} />
                  <InfoField label="Is External Record" value={contact.isExternalRecord} />
                </div>
              </div>

              {/* Activity */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" /> Activity
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Last Call" value={contact.lastCall} />
                  <InfoField label="Next Recall" value={contact.nextRecall} />
                  <InfoField label="N. Marketing" value={contact.nMarketing} />
                  <InfoField label="Conversion Date" value={contact.conversionDate} />
                </div>
              </div>
            </div>

            {/* Notes */}
            {contact.notes && (
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="font-semibold text-base mb-2">Notes</h3>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{contact.notes}</p>
              </div>
            )}

            {/* Audit */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h3 className="font-semibold text-base mb-3">Audit Trail</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <InfoField label="Created" value={contact.createdAt ? format(new Date(contact.createdAt), "PPp") : undefined} />
                <InfoField label="Created By" value={contact.createdBy} />
                <InfoField label="Last Updated" value={contact.updatedAt ? format(new Date(contact.updatedAt), "PPp") : undefined} />
                <InfoField label="Updated By" value={contact.updatedBy} />
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <LinkedEmailAttachments entityType="contact" entityId={contactId} />
            </div>
          </TabsContent>

          {/* DOCUMENTS TAB */}
          <TabsContent value="documents" className="space-y-6">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-muted-foreground" />
              Linked Documents
              <Badge variant="secondary">{offers.length + enquiries.length}</Badge>
            </h3>
            <p className="text-sm text-muted-foreground">
              Documents linked to the parent company <strong>{company?.name || "—"}</strong>.
            </p>

            {offers.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground">Offers ({offers.length})</h4>
                <div className="space-y-2">
                  {offers.map(o => (
                    <Link key={o.id} href={`/offers/${o.id}`}>
                      <div className="rounded-lg border bg-card p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer" data-testid={`card-offer-${o.id}`}>
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-blue-500" />
                          <div>
                            <p className="font-medium text-sm">{o.subject}</p>
                            <p className="text-xs text-muted-foreground">{o.referenceNumber} &middot; {o.salesmanName} &middot; {format(new Date(o.date), "dd/MM/yyyy")}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-sm">{Number(o.totalPrice).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(o.status)}`}>
                            {o.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {enquiries.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-muted-foreground">Enquiries ({enquiries.length})</h4>
                <div className="space-y-2">
                  {enquiries.map(o => (
                    <Link key={o.id} href={`/enquiries/${o.id}`}>
                      <div className="rounded-lg border bg-card p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer" data-testid={`card-enquiry-${o.id}`}>
                        <div className="flex items-center gap-3">
                          <Mail className="w-5 h-5 text-orange-500" />
                          <div>
                            <p className="font-medium text-sm">{o.subject}</p>
                            <p className="text-xs text-muted-foreground">{o.referenceNumber} &middot; {o.salesmanName} &middot; {format(new Date(o.date), "dd/MM/yyyy")}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-sm">{Number(o.totalPrice).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(o.status)}`}>
                            {o.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {offers.length === 0 && enquiries.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
                <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No documents linked to this contact's company yet.</p>
              </div>
            )}
          </TabsContent>

          {/* INTERACTIONS TAB */}
          <TabsContent value="interactions" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
                Interaction Timeline
              </h3>
              <Link href={`/crm/interactions/new?contactId=${contactId}`}>
                <Button size="sm" data-testid="button-add-contact-interaction">
                  <Plus className="w-4 h-4 mr-1" />New Interaction
                </Button>
              </Link>
            </div>
            <InteractionList
              interactions={contactInteractions}
              showCompany={true}
              onEdit={i => navigate(`/crm/interactions/${i.id}/edit`)}
              onDelete={id => deleteInteractionMutation.mutate(id)}
            />
          </TabsContent>

          {/* PRIVACY & MARKETING TAB */}
          <TabsContent value="privacy" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" /> Privacy
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Privacy Acknowledged" value={contact.privacyAcknowledged} />
                  <InfoField label="Anonymized" value={contact.anonymized} />
                  <InfoField label="Profiling" value={contact.profiling} />
                  <InfoField label="Expiring Date (Profiling)" value={contact.expiringDateProfiling} />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" /> Marketing & Newsletter
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Newsletter Block" value={contact.newsletterBlock} />
                  <InfoField label="Newsletter" value={contact.newsletter} />
                  <InfoField label="Commercial" value={contact.commercial} />
                  <InfoField label="Expiring Date (Sales)" value={contact.expiringDateSales} />
                  <InfoField label="Unsubscribe Date" value={contact.unsubscribeDate} />
                  <InfoField label="N. Marketing" value={contact.nMarketing} />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
