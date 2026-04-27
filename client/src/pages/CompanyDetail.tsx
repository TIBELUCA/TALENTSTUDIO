import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { LinkedEmailAttachments } from "@/components/LinkedEmailAttachments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { InlineConfirmButton } from "@/components/InlineConfirm";
import {
  ArrowLeft, Loader2, Edit2, Trash2, Plus, Building2, UserCircle, Factory,
  FileText, Mail, MessageSquare, Clock, Eye, ExternalLink, Merge, Search, AlertTriangle,
  CheckCircle2, XCircle,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation, useParams, useSearch } from "wouter";

import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import type { Customer, Contact, SalesmanUser, DealerCompany, ProductionFacility, Offer, Interaction } from "@shared/schema";
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

const COMPANY_TABS = ["overview", "contacts", "offers", "enquiries", "facilities", "interactions"] as const;

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const search = useSearch();

  const searchParams = new URLSearchParams(search);
  const rawTab = searchParams.get("tab") || "overview";
  const activeTab = COMPANY_TABS.includes(rawTab as any) ? rawTab : "overview";
  const setTab = (tab: string) => navigate(`/crm/companies/${customerId}?tab=${tab}`, { replace: true });

  const [facilityOpen, setFacilityOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState<ProductionFacility | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeTarget, setMergeTarget] = useState<Customer | null>(null);
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [fName, setFName] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fPostalCode, setFPostalCode] = useState("");
  const [fCity, setFCity] = useState("");
  const [fCountry, setFCountry] = useState("");
  const [fRegion, setFRegion] = useState("");
  const [fProvince, setFProvince] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fNotes, setFNotes] = useState("");

  const { data: company, isLoading } = useQuery<Customer>({
    queryKey: ["/api/customers", customerId],
    enabled: !!customerId,
  });

  const { data: companyContacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", { customerId }],
    queryFn: async () => {
      const res = await fetch(`/api/contacts?customerId=${customerId}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!customerId,
  });

  const { data: facilities = [] } = useQuery<ProductionFacility[]>({
    queryKey: ["/api/customers", customerId, "facilities"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/facilities`, { credentials: "include" });
      return res.json();
    },
    enabled: !!customerId,
  });

  const { data: linkedOffers = [] } = useQuery<Offer[]>({
    queryKey: ["/api/customers", customerId, "offers"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/offers`, { credentials: "include" });
      return res.json();
    },
    enabled: !!customerId,
  });

  const { data: companyInteractions = [] } = useQuery<(Interaction & { customerName?: string; contactName?: string })[]>({
    queryKey: ["/api/interactions?customerId=" + customerId],
    enabled: !!customerId,
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
  const { data: dealers = [] } = useQuery<DealerCompany[]>({ queryKey: ["/api/dealers"] });

  const { data: allCustomers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const internalCandidates = allCustomers
    .filter(c => !c.dealerId && !c.mergedIntoId && c.id !== customerId)
    .filter(c => {
      if (!mergeSearch.trim()) return true;
      const s = mergeSearch.toLowerCase();
      return (
        c.name?.toLowerCase().includes(s) ||
        c.city?.toLowerCase().includes(s) ||
        c.country?.toLowerCase().includes(s) ||
        c.vatNumber?.toLowerCase().includes(s)
      );
    })
    .slice(0, 20);

  const mergeMutation = useMutation({
    mutationFn: async (targetId: number) => {
      const res = await apiRequest("POST", `/api/customers/${customerId}/merge`, { targetId });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Merge completed",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      navigate(`/crm/companies/${data.targetId}`);
    },
    onError: (err: any) => {
      toast({
        title: "Merge failed",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const res = await fetch(`/api/contacts/${contactId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact deleted" });
    },
  });

  const createFacilityMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/customers/${customerId}/facilities`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data), credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create facility");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "facilities"] });
      toast({ title: "Facility added" });
      closeFacilityDialog();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateFacilityMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/facilities/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data), credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update facility");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "facilities"] });
      toast({ title: "Facility updated" });
      closeFacilityDialog();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteFacilityMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/facilities/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete facility");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "facilities"] });
      toast({ title: "Facility deleted" });
    },
  });

  const resetFacilityForm = () => {
    setEditingFacility(null);
    setFName(""); setFAddress(""); setFPostalCode(""); setFCity("");
    setFCountry(""); setFRegion(""); setFProvince("");
    setFPhone(""); setFEmail(""); setFNotes("");
  };
  const closeFacilityDialog = () => { setFacilityOpen(false); resetFacilityForm(); };
  const openAddFacility = () => { resetFacilityForm(); setFacilityOpen(true); };
  const openEditFacility = (f: ProductionFacility) => {
    setEditingFacility(f);
    setFName(f.name); setFAddress(f.address || ""); setFPostalCode(f.postalCode || "");
    setFCity(f.city || ""); setFCountry(f.country || ""); setFRegion(f.region || "");
    setFProvince(f.province || ""); setFPhone(f.phone || ""); setFEmail(f.email || "");
    setFNotes(f.notes || "");
    setFacilityOpen(true);
  };
  const handleFacilitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: fName, address: fAddress, postalCode: fPostalCode, city: fCity,
      country: fCountry, region: fRegion, province: fProvince,
      phone: fPhone, email: fEmail, notes: fNotes,
    };
    if (editingFacility) updateFacilityMutation.mutate({ id: editingFacility.id, data });
    else createFacilityMutation.mutate(data);
  };
  const facilityPending = createFacilityMutation.isPending || updateFacilityMutation.isPending;

  const validateMutation = useMutation({
    mutationFn: async ({ action }: { action: "approve" | "reject" }) => {
      const res = await apiRequest("POST", `/api/customers/${customerId}/validate`, { action });
      return res.json();
    },
    onSuccess: (data, { action }) => {
      if (data.deleted) {
        const msg = action === "approve" ? "Deletion approved — company removed" : "Company rejected and removed";
        toast({ title: msg });
        navigate("/crm/companies");
      } else {
        const msg = action === "approve" ? "Company approved" : "Deletion rejected — company kept active";
        toast({ title: msg });
        queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId] });
        queryClient.invalidateQueries({ queryKey: ["/api/pending-validations"] });
      }
    },
    onError: () => toast({ title: "Validation failed", variant: "destructive" }),
  });

  if (isLoading) {
    return <Layout><div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin" /></div></Layout>;
  }
  if (!company) {
    return <Layout><div className="text-center py-24 text-muted-foreground">Company not found</div></Layout>;
  }

  const salesman = salesmen.find(s => s.id === company.salesmanId);
  const dealer = dealers.find(d => d.id === company.dealerId);

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
          title={company.name}
          subtitle="Company CRM Profile"
          actions={
            <div className="flex gap-2">
              <Link href={`/offers/new?customerId=${customerId}`}>
                <Button size="sm" variant="outline" data-testid="button-create-offer">
                  <Plus className="w-4 h-4 mr-1" /> New Offer
                </Button>
              </Link>
              <Link href={`/crm/companies/${customerId}/edit`}>
                <Button size="sm" variant="outline" data-testid="button-edit-company">
                  <Edit2 className="w-4 h-4 mr-1" /> Edit
                </Button>
              </Link>
            </div>
          }
        />

        {company.mergedIntoId && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800 p-4 flex items-center gap-3" data-testid="banner-merged">
            <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-medium text-orange-800 dark:text-orange-200">This record has been merged</span>
              <span className="text-muted-foreground ml-1">
                — all data was moved to the target record.
              </span>
            </div>
            <Link href={`/crm/companies/${company.mergedIntoId}`}>
              <Button size="sm" variant="outline" data-testid="button-go-to-merged-target">
                <ExternalLink className="w-3 h-3 mr-1" /> View Target
              </Button>
            </Link>
          </div>
        )}

        {company.accountStatus === "Pending Validation" && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4 flex items-center gap-3" data-testid="banner-pending-validation">
            <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-medium text-amber-800 dark:text-amber-200">Pending Validation</span>
              <span className="text-muted-foreground ml-1">
                — this company was created by a dealer and needs your approval before it becomes active.
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => validateMutation.mutate({ action: "approve" })}
                disabled={validateMutation.isPending}
                data-testid="button-approve-company"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { if (confirm("Reject and delete this company?")) validateMutation.mutate({ action: "reject" }); }}
                disabled={validateMutation.isPending}
                data-testid="button-reject-company"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
              </Button>
            </div>
          </div>
        )}

        {company.accountStatus === "Pending Deletion" && (
          <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-4 flex items-center gap-3" data-testid="banner-pending-deletion">
            <Trash2 className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-medium text-red-800 dark:text-red-200">Deletion Requested</span>
              <span className="text-muted-foreground ml-1">
                — a dealer has requested to delete this company. Approve to permanently delete or reject to keep it active.
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { if (confirm("Permanently delete this company?")) validateMutation.mutate({ action: "approve" }); }}
                disabled={validateMutation.isPending}
                data-testid="button-approve-deletion-company"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Approve Deletion
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => validateMutation.mutate({ action: "reject" })}
                disabled={validateMutation.isPending}
                data-testid="button-reject-deletion-company"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" /> Keep Active
              </Button>
            </div>
          </div>
        )}

        {company.dealerId && !company.mergedIntoId && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 p-4 flex items-center gap-3" data-testid="banner-dealer-private">
            <Building2 className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-medium text-blue-800 dark:text-blue-200">Dealer-created record</span>
              <span className="text-muted-foreground ml-1">
                — match this to an existing internal CRM record to consolidate data.
              </span>
            </div>
            <Button
              size="sm"
              variant="default"
              onClick={() => { setMergeOpen(true); setMergeSearch(""); setMergeTarget(null); }}
              data-testid="button-open-merge"
            >
              <Merge className="w-4 h-4 mr-1" /> Match to Internal Record
            </Button>
          </div>
        )}

        {mergeOpen && (
          <div className="rounded-xl border bg-card p-6 space-y-4" data-testid="merge-section">
            <h3 className="font-semibold text-base">Match to Internal CRM Record</h3>
            <p className="text-sm text-muted-foreground">
              Search for an existing internal CRM record. When matched, all offers, contacts,
              and facilities from <strong>{company.name}</strong> will be moved to the selected record.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={mergeSearch}
                onChange={e => setMergeSearch(e.target.value)}
                placeholder="Search by name, city, country, or VAT..."
                className="pl-10"
                data-testid="input-merge-search"
              />
            </div>
            <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
              {internalCandidates.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  {mergeSearch.trim() ? "No matching records found" : "Type to search internal records"}
                </div>
              ) : (
                internalCandidates.map(c => (
                  <button
                    key={c.id}
                    className={`w-full text-left p-3 hover:bg-accent transition-colors ${mergeTarget?.id === c.id ? "bg-accent" : ""}`}
                    onClick={() => setMergeTarget(c)}
                    data-testid={`merge-candidate-${c.id}`}
                  >
                    <div className="font-medium text-sm">{c.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {[c.city, c.country, c.vatNumber].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                ))
              )}
            </div>
            {mergeTarget && (
              <div className="rounded-md border bg-muted/50 p-3 text-sm">
                <span className="text-muted-foreground">Selected target:</span>{" "}
                <strong>{mergeTarget.name}</strong>
                {mergeTarget.vatNumber && <span className="text-muted-foreground ml-2">({mergeTarget.vatNumber})</span>}
              </div>
            )}
            {mergeTarget && !mergeConfirmOpen && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setMergeOpen(false)} data-testid="button-merge-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={() => setMergeConfirmOpen(true)}
                  data-testid="button-merge-proceed"
                >
                  <Merge className="w-4 h-4 mr-1" /> Proceed
                </Button>
              </div>
            )}
            {mergeConfirmOpen && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-3" data-testid="merge-confirm-section">
                <p className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" /> Confirm Merge
                </p>
                <p className="text-sm text-muted-foreground">
                  This will move all offers, contacts, and production facilities from{" "}
                  <strong>"{company.name}"</strong> into{" "}
                  <strong>"{mergeTarget?.name}"</strong>. The dealer record will be marked as merged
                  and hidden from listings. This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setMergeConfirmOpen(false); setMergeOpen(false); }} data-testid="button-merge-confirm-cancel">
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { if (mergeTarget) mergeMutation.mutate(mergeTarget.id); }}
                    disabled={mergeMutation.isPending}
                    data-testid="button-merge-confirm"
                  >
                    {mergeMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Merging...</>
                    ) : (
                      "Yes, merge records"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary Badges */}
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
            <span className="font-medium">{companyContacts.length}</span> <span className="text-muted-foreground">Contacts</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
            <Factory className="w-4 h-4 text-purple-500" />
            <span className="font-medium">{facilities.length}</span> <span className="text-muted-foreground">Facilities</span>
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-6">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="contacts" data-testid="tab-contacts">Contacts</TabsTrigger>
            <TabsTrigger value="offers" data-testid="tab-offers">Offers</TabsTrigger>
            <TabsTrigger value="enquiries" data-testid="tab-enquiries">Enquiries</TabsTrigger>
            <TabsTrigger value="facilities" data-testid="tab-facilities">Facilities</TabsTrigger>
            <TabsTrigger value="interactions" data-testid="tab-interactions">Interactions</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Identity & Status */}
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

              {/* Contact Information */}
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

              {/* Address */}
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

              {/* Fiscal & Legal */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base">Fiscal & Legal</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Fiscal Code" value={company.fiscalCode} />
                  <InfoField label="VAT Number" value={company.vatNumber} />
                  <InfoField label="Public Admin Code" value={company.publicAdminCode} />
                </div>
              </div>

              {/* Assignment & Sales */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base">Assignment & Sales</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Salesman" value={salesman?.name} />
                  <InfoField label="Dealer" value={dealer?.companyName} />
                  <InfoField label="Machine Family" value={company.machineFamily} />
                  <InfoField label="Size" value={company.size} />
                  <InfoField label="Sales" value={company.sales} />
                  <InfoField label="ABC Analysis" value={company.abcAnalysis} />
                  <InfoField label="Group ABC Analysis" value={company.groupAbcAnalysis} />
                  <InfoField label="Conversion Date" value={company.conversionDate} />
                </div>
              </div>

              {/* Classification */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base">Classification</h3>
                <div className="space-y-3">
                  <ArrayField label="Customer Category" values={company.customerCategory} />
                  <ArrayField label="Material Type" values={company.materialType} />
                  <ArrayField label="Industry" values={company.industry} />
                </div>
              </div>
            </div>

            {/* Notes */}
            {company.notes && (
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="font-semibold text-base mb-2">Notes</h3>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{company.notes}</p>
              </div>
            )}

            {/* Audit */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h3 className="font-semibold text-base mb-3">Audit Trail</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <InfoField label="Created" value={company.createdAt ? format(new Date(company.createdAt), "PPp") : undefined} />
                <InfoField label="Created By" value={company.createdBy} />
                <InfoField label="Last Updated" value={company.updatedAt ? format(new Date(company.updatedAt), "PPp") : undefined} />
                <InfoField label="Updated By" value={company.updatedBy} />
              </div>
            </div>
            <div className="rounded-lg border bg-card p-6">
              <LinkedEmailAttachments entityType="customer" entityId={customerId} />
            </div>
          </TabsContent>

          {/* CONTACTS TAB */}
          <TabsContent value="contacts" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <UserCircle className="w-5 h-5 text-muted-foreground" />
                Contacts
                <Badge variant="secondary">{companyContacts.length}</Badge>
              </h3>
              <Link href={`/crm/contacts/new?customerId=${customerId}`}>
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
                  {companyContacts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                        No contacts yet
                      </TableCell>
                    </TableRow>
                  ) : companyContacts.map(c => (
                    <TableRow key={c.id} data-testid={`row-contact-${c.id}`} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/crm/contacts/${c.id}`)}>
                      <TableCell className="font-medium">{c.firstName} {c.lastName}</TableCell>
                      <TableCell>{(c.contactRole || []).join(", ") || c.role || "—"}</TableCell>
                      <TableCell>{c.email || "—"}</TableCell>
                      <TableCell>{c.phone || c.mobile || "—"}</TableCell>
                      <TableCell>{c.sourceOfContact || "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <Link href={`/crm/contacts/${c.id}`}>
                            <Button variant="ghost" size="icon" data-testid={`button-view-contact-${c.id}`}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button variant="ghost" size="icon" className="text-destructive"
                            onClick={() => { if (confirm("Delete this contact?")) deleteContactMutation.mutate(c.id); }}
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

          {/* OFFERS TAB */}
          <TabsContent value="offers" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-muted-foreground" />
                Offers
                <Badge variant="secondary">{offers.length}</Badge>
              </h3>
              <Link href={`/offers/new?customerId=${customerId}`}>
                <Button size="sm" data-testid="button-new-offer">
                  <Plus className="w-4 h-4 mr-1" /> New Offer
                </Button>
              </Link>
            </div>
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Salesman</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
                        No offers linked to this company
                      </TableCell>
                    </TableRow>
                  ) : offers.map(o => (
                    <TableRow key={o.id} data-testid={`row-offer-${o.id}`} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/offers/${o.id}`)}>
                      <TableCell className="font-mono text-xs">{o.referenceNumber}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{o.subject}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(o.status)}`}>
                          {o.status}
                        </span>
                      </TableCell>
                      <TableCell>{o.salesmanName}</TableCell>
                      <TableCell className="font-medium">{Number(o.totalPrice).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</TableCell>
                      <TableCell>{format(new Date(o.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <Link href={`/offers/${o.id}`}>
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

          {/* ENQUIRIES TAB */}
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
                    <TableHead>Salesman</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enquiries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
                        No enquiries linked to this company
                      </TableCell>
                    </TableRow>
                  ) : enquiries.map(o => (
                    <TableRow key={o.id} data-testid={`row-enquiry-${o.id}`} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/enquiries/${o.id}`)}>
                      <TableCell className="font-mono text-xs">{o.referenceNumber}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{o.subject}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(o.status)}`}>
                          {o.status}
                        </span>
                      </TableCell>
                      <TableCell>{o.salesmanName}</TableCell>
                      <TableCell className="font-medium">{Number(o.totalPrice).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</TableCell>
                      <TableCell>{format(new Date(o.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <Link href={`/enquiries/${o.id}`}>
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

          {/* FACILITIES TAB */}
          <TabsContent value="facilities" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Factory className="w-5 h-5 text-muted-foreground" />
                Production Facilities
                <Badge variant="secondary">{facilities.length}</Badge>
              </h3>
              <Button size="sm" onClick={openAddFacility} data-testid="button-add-facility">
                <Plus className="w-4 h-4 mr-1" /> Add Facility
              </Button>
            </div>
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Facility Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {facilities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
                        No production facilities yet
                      </TableCell>
                    </TableRow>
                  ) : facilities.map(f => (
                    <TableRow key={f.id} data-testid={`row-facility-${f.id}`}>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell>{f.address || "—"}</TableCell>
                      <TableCell>{[f.postalCode, f.city].filter(Boolean).join(" ") || "—"}</TableCell>
                      <TableCell>{f.country || "—"}</TableCell>
                      <TableCell>{f.phone || "—"}</TableCell>
                      <TableCell>{f.email || "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditFacility(f)} data-testid={`button-edit-facility-${f.id}`}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive"
                            onClick={() => { if (confirm("Delete this facility?")) deleteFacilityMutation.mutate(f.id); }}
                            data-testid={`button-delete-facility-${f.id}`}>
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

          {/* INTERACTIONS TAB */}
          <TabsContent value="interactions" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
                Interaction Timeline
              </h3>
              <Link href={`/crm/interactions/new?customerId=${customerId}`}>
                <Button size="sm" data-testid="button-add-company-interaction">
                  <Plus className="w-4 h-4 mr-1" />New Interaction
                </Button>
              </Link>
            </div>
            <InteractionList
              interactions={companyInteractions}
              showCompany={false}
              onEdit={i => navigate(`/crm/interactions/${i.id}/edit`)}
              onDelete={id => deleteInteractionMutation.mutate(id)}
            />
          </TabsContent>
        </Tabs>

        {facilityOpen && (
          <div className="rounded-xl border bg-card p-6" data-testid="facility-form-inline">
            <h3 className="font-semibold text-base mb-4">{editingFacility ? "Edit Facility" : "Add Production Facility"}</h3>
            <form onSubmit={handleFacilitySubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Facility Name *</Label>
                <Input value={fName} onChange={e => setFName(e.target.value)} required placeholder="e.g. Plant 2 — Bologna" data-testid="input-facility-name" />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={fAddress} onChange={e => setFAddress(e.target.value)} data-testid="input-facility-address" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Postal Code</Label>
                  <Input value={fPostalCode} onChange={e => setFPostalCode(e.target.value)} data-testid="input-facility-postal-code" />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={fCity} onChange={e => setFCity(e.target.value)} data-testid="input-facility-city" />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Input value={fCountry} onChange={e => setFCountry(e.target.value)} data-testid="input-facility-country" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Input value={fRegion} onChange={e => setFRegion(e.target.value)} data-testid="input-facility-region" />
                </div>
                <div className="space-y-2">
                  <Label>District/Province</Label>
                  <Input value={fProvince} onChange={e => setFProvince(e.target.value)} data-testid="input-facility-province" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={fPhone} onChange={e => setFPhone(e.target.value)} data-testid="input-facility-phone" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} data-testid="input-facility-email" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} data-testid="input-facility-notes" />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeFacilityDialog}>Cancel</Button>
                <Button type="submit" disabled={facilityPending} data-testid="button-submit-facility">
                  {facilityPending ? "Saving..." : editingFacility ? "Save Changes" : "Add Facility"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Layout>
  );
}
