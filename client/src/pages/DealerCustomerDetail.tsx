import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";

import {
  ArrowLeft, Loader2, Building2, UserCircle, Mail, Edit2, Eye, Plus,
  FileText, Factory, MessageSquare, Clock, Trash2, ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Customer, Contact, Offer, Interaction } from "@shared/schema";
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

export default function DealerCustomerDetail() {
  const [, params] = useRoute("/dealer/customers/companies/:id");
  const [, navigate] = useLocation();

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const customerId = Number(params?.id);

  const { data: company, isLoading } = useQuery<Customer>({
    queryKey: ["/api/dealer/customers", customerId],
    enabled: !!customerId,
  });

  const { data: allContacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/dealer/contacts"],
  });

  const { data: allOffers = [] } = useQuery<Offer[]>({
    queryKey: ["/api/dealer/offers"],
  });

  const { data: allEnquiries = [] } = useQuery<Offer[]>({
    queryKey: ["/api/dealer/enquiries"],
  });

  type InteractionWithNames = Interaction & { customerName?: string; contactName?: string };
  const { data: companyInteractions = [] } = useQuery<InteractionWithNames[]>({
    queryKey: ["/api/dealer/interactions", { customerId }],
    queryFn: async () => {
      const res = await fetch(`/api/dealer/interactions?customerId=${customerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load interactions");
      return res.json();
    },
    enabled: !!customerId,
  });

  const deleteInteractionMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/dealer/interactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/interactions"] });
      toast({ title: "Interaction deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const contacts = allContacts.filter(c => c.customerId === customerId);
  const offers = allOffers.filter(o => o.customerId === customerId && !o.deletedAt);
  const enquiries = allEnquiries.filter(o => o.customerId === customerId && !o.deletedAt);

  const deleteContactMutation = useMutation({
    mutationFn: (contactId: number) => apiRequest("DELETE", `/api/dealer/contacts/${contactId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/contacts"] });
      toast({ title: "Deletion request sent", description: "Your salesman will review this request." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusColor = (s: string) => {
    if (s === "Accepted" || s === "Won") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (s === "Sent" || s === "Pending") return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    if (s === "Draft") return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    if (s === "Lost" || s === "Rejected") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    return "bg-gray-100 text-gray-700";
  };

  if (isLoading) {
    return (
      <DealerLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DealerLayout>
    );
  }

  if (!company) {
    return (
      <DealerLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
          <Building2 className="w-12 h-12 opacity-30" />
          <p>Company not found</p>
          <Button variant="outline" onClick={() => window.history.back()} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Companies
          </Button>
        </div>
      </DealerLayout>
    );
  }

  return (
    <DealerLayout>
      <div className="space-y-6">
        <PageHeader
          title={company.name}
          subtitle="Company CRM Profile"
          actions={
            <div className="flex gap-2">
              <Link href={`/dealer/requests/new?customerId=${customerId}`}>
                <Button size="sm" variant="outline" data-testid="button-create-offer">
                  <Plus className="w-4 h-4 mr-1" /> New Offer
                </Button>
              </Link>
              <Link href={`/dealer/customers/companies/${customerId}/edit`}>
                <Button size="sm" variant="outline" data-testid="button-edit-company">
                  <Edit2 className="w-4 h-4 mr-1" /> Edit
                </Button>
              </Link>
            </div>
          }
        />

        {company.accountStatus === "Pending Deletion" && (
          <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-4 flex items-center gap-3" data-testid="banner-pending-deletion">
            <Clock className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-medium text-red-800 dark:text-red-200">Deletion Requested</span>
              <span className="text-muted-foreground ml-1">
                — you have requested deletion of this company. Your salesman will review this request.
              </span>
            </div>
          </div>
        )}

        {company.accountStatus === "Pending Validation" && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4 flex items-center gap-3" data-testid="banner-pending-validation">
            <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-medium text-amber-800 dark:text-amber-200">Pending Validation</span>
              <span className="text-muted-foreground ml-1">
                — this company is awaiting approval by your salesman. You can view but not edit until approved.
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="font-medium">{offers.length}</span> <span className="text-muted-foreground">Offers</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
            <Mail className="w-4 h-4 text-orange-500" />
            <span className="font-medium">{enquiries.length}</span> <span className="text-muted-foreground">Enquiries</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
            <UserCircle className="w-4 h-4 text-green-500" />
            <span className="font-medium">{contacts.length}</span> <span className="text-muted-foreground">Contacts</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
            <Factory className="w-4 h-4 text-purple-500" />
            <span className="font-medium">0</span> <span className="text-muted-foreground">Facilities</span>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-6">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="contacts" data-testid="tab-contacts">Contacts</TabsTrigger>
            <TabsTrigger value="offers" data-testid="tab-offers">Offers</TabsTrigger>
            <TabsTrigger value="enquiries" data-testid="tab-enquiries">Enquiries</TabsTrigger>
            <TabsTrigger value="facilities" data-testid="tab-facilities">Facilities</TabsTrigger>
            <TabsTrigger value="interactions" data-testid="tab-interactions">Interactions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" /> Identity & Status
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Company Name" value={company.name} />
                  <InfoField label="Customer Code" value={company.customerCode} />
                  <InfoField label="Account Status" value={company.accountStatus} />
                  <InfoField label="Structure" value={company.structure} />
                  <InfoField label="Related Account" value={company.relatedAccount} />
                  <InfoField label="Language" value={company.language} />
                  <InfoField label="Type" value={company.type} />
                  <InfoField label="Insolved" value={company.insolved} />
                  <InfoField label="Company Entity" value={company.company} />
                  <InfoField label="Directory ID" value={company.directoryId} />
                  {company.description && (
                    <div className="col-span-2">
                      <InfoField label="Description" value={company.description} />
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" /> Contact Information
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Email" value={company.email} />
                  <InfoField label="Contact Person" value={company.contactPerson} />
                  <InfoField label="Office Phone" value={company.officePhone} />
                  <InfoField label="Fax" value={company.fax} />
                  <InfoField label="PEC" value={company.pec} />
                  <InfoField label="Website" value={company.webSite} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base">Address</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Address" value={company.address} />
                  <InfoField label="Postal Code" value={company.postalCode} />
                  <InfoField label="City" value={company.city} />
                  <InfoField label="Country" value={company.country} />
                  <InfoField label="Region" value={company.region} />
                  <InfoField label="Province" value={company.province} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base">Fiscal & Legal</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Fiscal Code" value={company.fiscalCode} />
                  <InfoField label="VAT Number" value={company.vatNumber} />
                  <InfoField label="Public Admin Code" value={company.publicAdminCode} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base">Sales & Classification</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Machine Family" value={company.machineFamily} />
                  <InfoField label="Size" value={company.size} />
                  <InfoField label="Sales" value={company.sales} />
                  <InfoField label="ABC Analysis" value={company.abcAnalysis} />
                  <InfoField label="Group ABC Analysis" value={company.groupAbcAnalysis} />
                  <InfoField label="Conversion Date" value={company.conversionDate} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base">Classification</h3>
                <div className="space-y-3">
                  <ArrayField label="Customer Category" values={company.customerCategory} />
                  <ArrayField label="Material Type" values={company.materialType} />
                  <ArrayField label="Industry" values={company.industry} />
                </div>
              </div>
            </div>

            {company.notes && (
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="font-semibold text-base mb-2">Notes</h3>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{company.notes}</p>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h3 className="font-semibold text-base mb-3">Audit Trail</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <InfoField label="Created" value={company.createdAt ? format(new Date(company.createdAt), "PPp") : undefined} />
                <InfoField label="Created By" value={company.createdBy} />
                <InfoField label="Last Updated" value={company.updatedAt ? format(new Date(company.updatedAt), "PPp") : undefined} />
                <InfoField label="Updated By" value={company.updatedBy} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="contacts" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <UserCircle className="w-5 h-5 text-muted-foreground" />
                Contacts
                <Badge variant="secondary">{contacts.length}</Badge>
              </h3>
              <Link href={`/dealer/customers/contacts/new?customerId=${customerId}`}>
                <Button size="sm" data-testid="button-add-contact">
                  <Plus className="w-4 h-4 mr-1" /> Add Contact
                </Button>
              </Link>
            </div>
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                        No contacts yet
                      </TableCell>
                    </TableRow>
                  ) : contacts.map(c => (
                    <TableRow key={c.id} data-testid={`row-contact-${c.id}`} className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/dealer/customers/contacts/${c.id}`)}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {c.firstName} {c.lastName}
                          {c.contactStatus === "Pending Deletion" && (
                            <Badge variant="outline" className="border-red-400 text-red-700 text-[10px] px-1.5 py-0">Deletion Requested</Badge>
                          )}
                          {c.contactStatus === "Pending Validation" && (
                            <Badge variant="outline" className="border-amber-400 text-amber-700 text-[10px] px-1.5 py-0">Pending</Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>{(c.contactRole || []).join(", ") || "—"}</TableCell>
                      <TableCell>{c.email || "—"}</TableCell>
                      <TableCell>{c.phone || c.mobile || c.officePhone || "—"}</TableCell>
                      <TableCell>{c.sourceOfContact || "—"}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Link href={`/dealer/customers/contacts/${c.id}`}>
                            <Button variant="ghost" size="icon" data-testid={`button-view-contact-${c.id}`}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button variant="ghost" size="icon" className="text-destructive"
                            onClick={() => { if (confirm("Request deletion of this contact? Your salesman will need to approve.")) deleteContactMutation.mutate(c.id); }}
                            disabled={deleteContactMutation.isPending || c.contactStatus === "Pending Deletion"}
                            data-testid={`button-delete-contact-${c.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="offers" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-muted-foreground" />
                Offers
                <Badge variant="secondary">{offers.length}</Badge>
              </h3>
            </div>
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                        No offers linked to this company
                      </TableCell>
                    </TableRow>
                  ) : offers.map(o => (
                    <TableRow key={o.id} data-testid={`row-offer-${o.id}`} className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/dealer/offers/${o.id}`)}>
                      <TableCell className="font-mono text-xs">{o.referenceNumber}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{o.subject}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(o.status)}`}>
                          {o.status}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{Number(o.totalPrice).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</TableCell>
                      <TableCell>{format(new Date(o.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <Link href={`/dealer/offers/${o.id}`}>
                          <Button variant="ghost" size="icon" data-testid={`button-view-offer-${o.id}`}>
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="enquiries" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Mail className="w-5 h-5 text-muted-foreground" />
                Enquiries / Requests
                <Badge variant="secondary">{enquiries.length}</Badge>
              </h3>
            </div>
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enquiries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                        No enquiries linked to this company
                      </TableCell>
                    </TableRow>
                  ) : enquiries.map(o => (
                    <TableRow key={o.id} data-testid={`row-enquiry-${o.id}`} className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/dealer/requests/${o.id}`)}>
                      <TableCell className="font-mono text-xs">{o.referenceNumber}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{o.subject}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(o.status)}`}>
                          {o.status}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{Number(o.totalPrice).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</TableCell>
                      <TableCell>{format(new Date(o.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <Link href={`/dealer/requests/${o.id}`}>
                          <Button variant="ghost" size="icon" data-testid={`button-view-enquiry-${o.id}`}>
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="facilities" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Factory className="w-5 h-5 text-muted-foreground" />
                Production Facilities
                <Badge variant="secondary">0</Badge>
              </h3>
            </div>
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Factory className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h4 className="font-semibold text-lg">Coming Soon</h4>
                <p className="text-muted-foreground mt-1 max-w-md mx-auto text-sm">
                  Production facilities management will be available here. Contact your salesman for facility-related requests.
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="interactions" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
                Interaction Timeline
              </h3>
              <Link href={`/dealer/customers/interactions/new?customerId=${customerId}`}>
                <Button size="sm" data-testid="button-add-company-interaction">
                  <Plus className="w-4 h-4 mr-1" />New Interaction
                </Button>
              </Link>
            </div>
            <InteractionList
              interactions={companyInteractions}
              showCompany={false}
              onEdit={i => navigate(`/dealer/customers/interactions/${i.id}/edit`)}
              onDelete={id => deleteInteractionMutation.mutate(id)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DealerLayout>
  );
}
