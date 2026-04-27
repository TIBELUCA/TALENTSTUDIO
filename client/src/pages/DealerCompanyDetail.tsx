import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft, Loader2, Edit2, Store, UserCircle,
  FileText, Mail, MessageSquare, Clock, Eye, ExternalLink,
  MapPin, Hash, Phone, AtSign,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useLocation, useSearch } from "wouter";

import { format } from "date-fns";
import type { SalesmanUser, Offer } from "@shared/schema";

interface DealerCompanyData {
  id: number;
  companyId: number;
  companyName: string;
  address: string;
  vatNumber: string;
  state: string;
  city?: string;
  postalCode?: string;
  email?: string;
  phone?: string;
  notes?: string;
  linkedSalesmanId: number | null;
  isActive: boolean;
  docLogoUrl?: string | null;
  docFooterLines?: any;
  docTermsText?: string | null;
  createdAt: string;
  contactCount: number;
  salesmanName?: string;
}

interface DealerContact {
  id: number;
  name: string;
  surname: string;
  email: string;
  mobileNumber?: string;
  role?: string;
  isActive: boolean;
  dealerCompanyId: number;
  linkedSalesmanId?: number | null;
  createdAt: string;
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div data-testid={`field-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="font-medium mt-0.5 text-sm">{value}</p>
    </div>
  );
}

const DEALER_COMPANY_TABS = ["overview", "contacts", "offers", "enquiries", "interactions"] as const;

export default function DealerCompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const dealerCompanyId = Number(id);
  const [, navigate] = useLocation();
  const search = useSearch();

  const searchParams = new URLSearchParams(search);
  const rawTab = searchParams.get("tab") || "overview";
  const activeTab = DEALER_COMPANY_TABS.includes(rawTab as any) ? rawTab : "overview";
  const setTab = (tab: string) => navigate(`/dealers/${dealerCompanyId}?tab=${tab}`, { replace: true });

  const { data: allCompanies = [], isLoading } = useQuery<DealerCompanyData[]>({
    queryKey: ["/api/dealers"],
  });
  const company = allCompanies.find(c => c.id === dealerCompanyId);

  const { data: contacts = [] } = useQuery<DealerContact[]>({
    queryKey: ["/api/dealers", dealerCompanyId, "contacts"],
    queryFn: async () => {
      const res = await fetch(`/api/dealers/${dealerCompanyId}/contacts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load contacts");
      return res.json();
    },
    enabled: !!dealerCompanyId,
  });

  const { data: linkedOffers = [] } = useQuery<Offer[]>({
    queryKey: ["/api/dealers", dealerCompanyId, "linked-offers"],
    queryFn: async () => {
      const res = await fetch(`/api/dealers/${dealerCompanyId}/linked-offers`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load linked offers");
      return res.json();
    },
    enabled: !!dealerCompanyId,
  });

  const { data: salesmen = [] } = useQuery<SalesmanUser[]>({ queryKey: ["/api/users"] });

  if (isLoading) {
    return <Layout><div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin" /></div></Layout>;
  }
  if (!company) {
    return <Layout><div className="text-center py-24 text-muted-foreground">Dealer company not found</div></Layout>;
  }

  const salesman = salesmen.find(s => s.id === company.linkedSalesmanId);
  const offers = linkedOffers.filter(o => o.offerType === "offer" && !o.deletedAt);
  const enquiries = linkedOffers.filter(o => o.offerType === "enquiry" && !o.deletedAt);

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
          title={company.companyName}
          subtitle="Dealer Company Profile"
          icon={<Store className="w-6 h-6 text-amber-600" />}
          actions={
            <div className="flex gap-2">
              <Link href={`/dealers/${dealerCompanyId}/edit`}>
                <Button size="sm" variant="outline" data-testid="button-edit-dealer-company">
                  <Edit2 className="w-4 h-4 mr-1" /> Edit
                </Button>
              </Link>
            </div>
          }
        />

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
            <UserCircle className="w-4 h-4 text-green-500" />
            <span className="font-medium" data-testid="text-contact-count">{contacts.length}</span> <span className="text-muted-foreground">Contacts</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="font-medium" data-testid="text-offer-count">{offers.length}</span> <span className="text-muted-foreground">Offers</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
            <Mail className="w-4 h-4 text-orange-500" />
            <span className="font-medium" data-testid="text-enquiry-count">{enquiries.length}</span> <span className="text-muted-foreground">Enquiries</span>
          </div>
          <div className="ml-auto">
            <Badge variant={company.isActive ? "default" : "secondary"} className={company.isActive ? "bg-green-100 text-green-700 border-green-200" : ""} data-testid="badge-status">
              {company.isActive ? "Active" : "Disabled"}
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="contacts" data-testid="tab-contacts">Contacts</TabsTrigger>
            <TabsTrigger value="offers" data-testid="tab-offers">Offers</TabsTrigger>
            <TabsTrigger value="enquiries" data-testid="tab-enquiries">Enquiries</TabsTrigger>
            <TabsTrigger value="interactions" data-testid="tab-interactions">Interactions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Store className="w-4 h-4 text-muted-foreground" /> Identity
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Company Name" value={company.companyName} />
                  <InfoField label="VAT Number" value={company.vatNumber} />
                  <InfoField label="Status" value={company.isActive ? "Active" : "Disabled"} />
                  <InfoField label="Created" value={company.createdAt ? format(new Date(company.createdAt), "dd MMM yyyy") : undefined} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <AtSign className="w-4 h-4 text-muted-foreground" /> Contact Information
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Email" value={company.email} />
                  <InfoField label="Phone" value={company.phone} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" /> Address
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <div className="col-span-2">
                    <InfoField label="Address" value={company.address} />
                  </div>
                  <InfoField label="City" value={company.city} />
                  <InfoField label="Postal Code" value={company.postalCode} />
                  <InfoField label="State / Country" value={company.state} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <UserCircle className="w-4 h-4 text-muted-foreground" /> Assignment
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Linked Salesman" value={salesman ? `${salesman.name} ${salesman.surname}` : company.salesmanName || "Unassigned"} />
                </div>
              </div>

              {(company.docLogoUrl || company.docTermsText) && (
                <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" /> Document Branding
                  </h3>
                  <div className="space-y-3">
                    {company.docLogoUrl && (
                      <div>
                        <span className="text-muted-foreground text-xs">Logo</span>
                        <img src={company.docLogoUrl} alt="Dealer logo" className="mt-1 h-12 object-contain" />
                      </div>
                    )}
                    <InfoField label="Custom Terms" value={company.docTermsText} />
                  </div>
                </div>
              )}

              {company.notes && (
                <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                  <h3 className="font-semibold text-base flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" /> Notes
                  </h3>
                  <p className="text-sm whitespace-pre-wrap">{company.notes}</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="contacts">
            {contacts.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <UserCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No contacts yet</p>
                <p className="text-sm mt-1">Add contacts from the edit page</p>
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map(contact => (
                      <TableRow key={contact.id} data-testid={`row-dealer-contact-${contact.id}`} className="cursor-pointer">
                        <TableCell className="font-medium">
                          <Link href={`/dealers/${dealerCompanyId}/contacts/${contact.id}`} className="hover:underline" data-testid={`link-contact-${contact.id}`}>
                            {contact.name} {contact.surname}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{contact.email}</TableCell>
                        <TableCell className="text-muted-foreground">{contact.mobileNumber || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{contact.role || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={contact.isActive ? "default" : "secondary"} className={contact.isActive ? "bg-green-100 text-green-700 border-green-200 text-xs" : "text-xs"}>
                            {contact.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/dealers/${dealerCompanyId}/contacts/${contact.id}`}>
                            <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-view-contact-${contact.id}`}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="offers">
            {offers.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No linked offers</p>
                <p className="text-sm mt-1">Offers originated by this dealer's contacts will appear here</p>
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden bg-card">
                <Table>
                  <TableHeader>
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
                    {offers.map(offer => (
                      <TableRow key={offer.id} data-testid={`row-offer-${offer.id}`}>
                        <TableCell className="font-medium font-mono text-sm">{offer.referenceNumber}</TableCell>
                        <TableCell>{offer.subject}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${statusColor(offer.status)}`}>{offer.status}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {Number(offer.totalPrice).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(offer.date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/offers/${offer.id}`}>
                            <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-view-offer-${offer.id}`}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="enquiries">
            {enquiries.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No linked enquiries</p>
                <p className="text-sm mt-1">Enquiries submitted by this dealer's contacts will appear here</p>
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enquiries.map(enq => (
                      <TableRow key={enq.id} data-testid={`row-enquiry-${enq.id}`}>
                        <TableCell className="font-medium font-mono text-sm">{enq.referenceNumber}</TableCell>
                        <TableCell>{enq.subject}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${statusColor(enq.status)}`}>{enq.status}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(enq.date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/enquiries/${enq.id}`}>
                            <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-view-enquiry-${enq.id}`}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="interactions">
            <div className="text-center py-16 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Interaction Timeline</p>
              <p className="text-sm mt-1">Email, call, and meeting tracking coming soon</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
