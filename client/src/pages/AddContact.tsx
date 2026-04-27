import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Loader2, UserCircle, ChevronsUpDown, Check } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useParams } from "wouter";

import type { Customer, SalesmanUser, Contact } from "@shared/schema";

const CONTACT_ROLES = [
  "Business Development Manager", "CEO", "CFO", "Coating Technologist",
  "Customer Service", "Customer Support", "Finance/account", "Finishing Manager",
  "IT Manager", "LAB Manager", "Logistics", "Maintenance Supervisor", "Other",
  "Owner", "President", "Production Manager", "Purchase Assistant",
  "Purchase Manager", "R&D Manager", "Sales Area Manager", "Sales Director",
  "Technical Manager", "Warehouse/Logistic Supervisor",
];
const CONTACT_STATUSES = ["Active", "Inactive"];
const LANGUAGES = ["ENGLISH", "FRENCH", "GERMAN", "ITALIANO", "POLISH", "PORTEGUESE", "SPANISH"];
const YES_NO = ["YES", "NO"];
const COMPANY_ENTITIES = ["Talent Studio"];
const SOURCE_OPTIONS = [
  "Cold call", "Direct customer", "Direct Marketing", "Exhibition",
  "From Partners", "Other", "Paint Supplier", "Public Relations", "Reports", "Website",
];

function MultiSelectField({ label, options, value, onChange, testId }: {
  label: string; options: string[]; value: string[];
  onChange: (v: string[]) => void; testId: string;
}) {
  const toggle = (opt: string) => {
    if (value.includes(opt)) onChange(value.filter(v => v !== opt));
    else onChange([...value, opt]);
  };
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="border rounded-md p-3 space-y-1.5 max-h-48 overflow-y-auto bg-background" data-testid={testId}>
        {options.map(opt => (
          <div key={opt} className="flex items-center gap-2">
            <Checkbox checked={value.includes(opt)} onCheckedChange={() => toggle(opt)} id={`${testId}-${opt}`} data-testid={`${testId}-${opt}`} />
            <label htmlFor={`${testId}-${opt}`} className="text-sm cursor-pointer">{opt}</label>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompanySearchSelect({ companies, value, onChange, disabled, testId }: {
  companies: { id: number; name: string }[];
  value: number | null;
  onChange: (id: number | null) => void;
  disabled?: boolean;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = companies.find(c => c.id === value);

  const filtered = useMemo(() => {
    if (!search) return companies;
    const q = search.toLowerCase();
    return companies.filter(c => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  if (disabled) {
    return (
      <div className="space-y-2">
        <Label>Account (Company) *</Label>
        <Input value={selected?.name || ""} disabled className="bg-muted" data-testid={`${testId}-disabled`} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Account (Company) *</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            data-testid={testId}
          >
            {selected ? selected.name : "Select company..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search companies..."
              value={search}
              onValueChange={setSearch}
              data-testid={`${testId}-search`}
            />
            <CommandList>
              <CommandEmpty>No company found.</CommandEmpty>
              <CommandGroup>
                {filtered.map(c => (
                  <CommandItem
                    key={c.id}
                    value={String(c.id)}
                    onSelect={() => { onChange(c.id); setOpen(false); setSearch(""); }}
                    data-testid={`${testId}-option-${c.id}`}
                  >
                    <Check className={`mr-2 h-4 w-4 ${value === c.id ? "opacity-100" : "opacity-0"}`} />
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function AddContact() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const editId = params.id ? Number(params.id) : null;
  const isEditing = !!editId;

  // Pre-fill from URL query params (used when arriving from Email page,
  // e.g. /crm/contacts/new?email=...&name=...&customerId=...&phone=...)
  const prefill = useMemo(() => {
    if (typeof window === "undefined") return { firstName: "", lastName: "", email: "", phone: "", customerId: null as number | null };
    const sp = new URLSearchParams(window.location.search);
    const fullName = (sp.get("name") || "").trim();
    let firstName = "";
    let lastName = "";
    if (fullName) {
      const parts = fullName.split(/\s+/);
      if (parts.length === 1) {
        lastName = parts[0];
      } else {
        firstName = parts[0];
        lastName = parts.slice(1).join(" ");
      }
    }
    const cid = sp.get("customerId");
    return {
      firstName,
      lastName,
      email: (sp.get("email") || "").trim(),
      phone: (sp.get("phone") || "").trim(),
      customerId: cid ? Number(cid) : null,
    };
  }, []);

  const [lastName, setLastName] = useState(prefill.lastName);
  const [firstName, setFirstName] = useState(prefill.firstName);
  const [customerId, setCustomerId] = useState<number | null>(prefill.customerId);
  const [contactRole, setContactRole] = useState<string[]>([]);
  const [contactStatus, setContactStatus] = useState("");
  const [email, setEmail] = useState(prefill.email);
  const [mobile, setMobile] = useState(prefill.phone);
  const [fax, setFax] = useState("");
  const [officePhone, setOfficePhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [language, setLanguage] = useState("");
  const [newsletterBlock, setNewsletterBlock] = useState("");
  const [description, setDescription] = useState("");
  const [commercial, setCommercial] = useState("");
  const [expiringDateSales, setExpiringDateSales] = useState("");
  const [newsletter, setNewsletter] = useState("");
  const [unsubscribeDate, setUnsubscribeDate] = useState("");
  const [profiling, setProfiling] = useState("");
  const [expiringDateProfiling, setExpiringDateProfiling] = useState("");
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState("");
  const [anonymized, setAnonymized] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [companyEntity, setCompanyEntity] = useState("");
  const [salesmanId, setSalesmanId] = useState<number | null>(null);
  const [sourceOfContact, setSourceOfContact] = useState("");
  const [exhibitionYear, setExhibitionYear] = useState("");
  const [exhibitionName, setExhibitionName] = useState("");
  const [areaOfInterest, setAreaOfInterest] = useState("");
  const [areaOfInterestDescription, setAreaOfInterestDescription] = useState("");
  const [lastCall, setLastCall] = useState("");
  const [nextRecall, setNextRecall] = useState("");
  const [tipo, setTipo] = useState("");
  const [nMarketing, setNMarketing] = useState("");
  const [conversionDate, setConversionDate] = useState("");
  const [isExternalRecord, setIsExternalRecord] = useState("");
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { setLoaded(false); }, [editId]);

  const { data: existing, isLoading: loadingExisting, isError: loadError } = useQuery<Contact>({
    queryKey: ["/api/contacts", editId],
    enabled: isEditing,
  });

  useEffect(() => {
    if (existing && !loaded) {
      setLastName(existing.lastName || "");
      setFirstName(existing.firstName || "");
      setCustomerId(existing.customerId ?? null);
      setContactRole(existing.contactRole || []);
      setContactStatus(existing.contactStatus || "");
      setEmail(existing.email || "");
      setMobile(existing.mobile || "");
      setFax(existing.fax || "");
      setOfficePhone(existing.officePhone || "");
      setDateOfBirth(existing.dateOfBirth || "");
      setLanguage(existing.language || "");
      setNewsletterBlock(existing.newsletterBlock || "");
      setDescription(existing.description || "");
      setCommercial(existing.commercial || "");
      setExpiringDateSales(existing.expiringDateSales || "");
      setNewsletter(existing.newsletter || "");
      setUnsubscribeDate(existing.unsubscribeDate || "");
      setProfiling(existing.profiling || "");
      setExpiringDateProfiling(existing.expiringDateProfiling || "");
      setPrivacyAcknowledged(existing.privacyAcknowledged || "");
      setAnonymized(existing.anonymized || "");
      setAddress(existing.address || "");
      setCity(existing.city || "");
      setPostalCode(existing.postalCode || "");
      setCountry(existing.country || "");
      setRegion(existing.region || "");
      setDistrict(existing.district || "");
      setCompanyEntity(existing.company || "");
      setSalesmanId(existing.salesmanId ?? null);
      setSourceOfContact(existing.sourceOfContact || "");
      setExhibitionYear(existing.exhibitionYear || "");
      setExhibitionName(existing.exhibitionName || "");
      setAreaOfInterest(existing.areaOfInterest || "");
      setAreaOfInterestDescription(existing.areaOfInterestDescription || "");
      setLastCall(existing.lastCall || "");
      setNextRecall(existing.nextRecall || "");
      setTipo(existing.tipo || "");
      setNMarketing(existing.nMarketing || "");
      setConversionDate(existing.conversionDate || "");
      setIsExternalRecord(existing.isExternalRecord || "");
      setNotes(existing.notes || "");
      setLoaded(true);
    }
  }, [existing, loaded]);

  const { data: companies = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: salesmen = [] } = useQuery<SalesmanUser[]>({ queryKey: ["/api/users"] });
  const { data: machineFamilies = [] } = useQuery<string[]>({ queryKey: ["/api/machine-families"] });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = isEditing ? `/api/contacts/${editId}` : "/api/contacts";
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data), credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed to ${isEditing ? "update" : "create"} contact`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      if (isEditing) queryClient.invalidateQueries({ queryKey: ["/api/contacts", editId] });
      toast({ title: isEditing ? "Contact updated" : "Contact created" });
      navigate(`/crm/contacts/${data.id}`);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) { toast({ title: "Please select an account (company)", variant: "destructive" }); return; }
    saveMutation.mutate({
      customerId, firstName, lastName, contactRole, contactStatus,
      email, mobile, fax, officePhone, dateOfBirth, language,
      newsletterBlock, description, commercial, expiringDateSales,
      newsletter, unsubscribeDate, profiling, expiringDateProfiling,
      privacyAcknowledged, anonymized, address, city, postalCode,
      country, region, district, company: companyEntity, salesmanId,
      sourceOfContact, exhibitionYear, exhibitionName,
      areaOfInterest, areaOfInterestDescription,
      lastCall, nextRecall, tipo, nMarketing, conversionDate,
      isExternalRecord, notes,
    });
  };

  if (isEditing && loadingExisting) {
    return <Layout><div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin" /></div></Layout>;
  }

  if (isEditing && loadError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-destructive font-medium">Contact not found or failed to load.</p>
          <Button variant="outline" onClick={() => window.history.back()} data-testid="button-back-contacts">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Contacts
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title={isEditing ? "Edit Contact" : "New Contact"}
          subtitle={isEditing ? `Editing ${existing?.firstName || ""} ${existing?.lastName || ""}` : "Add a new contact to your CRM."}
        />

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2"><UserCircle className="w-4 h-4" /> Identity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Surname *</Label>
                    <Input value={lastName} onChange={e => setLastName(e.target.value)} required data-testid="input-last-name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Name *</Label>
                    <Input value={firstName} onChange={e => setFirstName(e.target.value)} required data-testid="input-first-name" />
                  </div>
                </div>
                <CompanySearchSelect
                  companies={companies}
                  value={customerId}
                  onChange={setCustomerId}
                  disabled={false}
                  testId="select-account"
                />
                <MultiSelectField
                  label="Contact Role"
                  options={CONTACT_ROLES}
                  value={contactRole}
                  onChange={setContactRole}
                  testId="multi-contact-role"
                />
                <div className="space-y-2">
                  <Label>Contact Status</Label>
                  <Select value={contactStatus || "none"} onValueChange={v => setContactStatus(v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="select-contact-status"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {CONTACT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date of Birth</Label>
                    <Input type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} data-testid="input-date-of-birth" />
                  </div>
                  <div className="space-y-2">
                    <Label>Language</Label>
                    <Select value={language || "none"} onValueChange={v => setLanguage(v === "none" ? "" : v)}>
                      <SelectTrigger data-testid="select-language"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {LANGUAGES.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} data-testid="input-description" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Contact Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} data-testid="input-email" />
                  </div>
                  <div className="space-y-2">
                    <Label>Mobile</Label>
                    <Input value={mobile} onChange={e => setMobile(e.target.value)} data-testid="input-mobile" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Office Phone</Label>
                    <Input value={officePhone} onChange={e => setOfficePhone(e.target.value)} data-testid="input-office-phone" />
                  </div>
                  <div className="space-y-2">
                    <Label>Fax</Label>
                    <Input value={fax} onChange={e => setFax(e.target.value)} data-testid="input-fax" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={address} onChange={e => setAddress(e.target.value)} data-testid="input-address" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Postal Code</Label>
                    <Input value={postalCode} onChange={e => setPostalCode(e.target.value)} data-testid="input-postal-code" />
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input value={city} onChange={e => setCity(e.target.value)} data-testid="input-city" />
                  </div>
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <Input value={country} onChange={e => setCountry(e.target.value)} data-testid="input-country" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Region</Label>
                    <Input value={region} onChange={e => setRegion(e.target.value)} data-testid="input-region" />
                  </div>
                  <div className="space-y-2">
                    <Label>District</Label>
                    <Input value={district} onChange={e => setDistrict(e.target.value)} data-testid="input-district" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Assignment &amp; Source</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Company (Entity)</Label>
                  <Select value={companyEntity || "none"} onValueChange={v => setCompanyEntity(v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="select-company-entity"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {COMPANY_ENTITIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assigned to (Salesman)</Label>
                  <Select value={salesmanId ? String(salesmanId) : "none"} onValueChange={v => setSalesmanId(v === "none" ? null : Number(v))}>
                    <SelectTrigger data-testid="select-salesman"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {salesmen.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Source of the Contact</Label>
                  <Select value={sourceOfContact || "none"} onValueChange={v => setSourceOfContact(v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="select-source"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {SOURCE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {sourceOfContact === "Exhibition" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Exhibition Year</Label>
                      <Input value={exhibitionYear} onChange={e => setExhibitionYear(e.target.value)} placeholder="e.g. 2025" data-testid="input-exhibition-year" />
                    </div>
                    <div className="space-y-2">
                      <Label>Exhibition Name</Label>
                      <Input value={exhibitionName} onChange={e => setExhibitionName(e.target.value)} data-testid="input-exhibition-name" />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Area of Interest (Machine Family)</Label>
                  <Select value={areaOfInterest || "none"} onValueChange={v => setAreaOfInterest(v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="select-area-of-interest"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {machineFamilies.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Area of Interest — Description</Label>
                  <Input value={areaOfInterestDescription} onChange={e => setAreaOfInterestDescription(e.target.value)} data-testid="input-area-of-interest-desc" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Privacy &amp; Marketing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Newsletter Block</Label>
                    <Select value={newsletterBlock || "none"} onValueChange={v => setNewsletterBlock(v === "none" ? "" : v)}>
                      <SelectTrigger data-testid="select-newsletter-block"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {YES_NO.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Commercial</Label>
                    <Input value={commercial} onChange={e => setCommercial(e.target.value)} data-testid="input-commercial" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Expiring Date (Sales)</Label>
                    <Input value={expiringDateSales} onChange={e => setExpiringDateSales(e.target.value)} data-testid="input-expiring-date-sales" />
                  </div>
                  <div className="space-y-2">
                    <Label>Newsletter</Label>
                    <Input value={newsletter} onChange={e => setNewsletter(e.target.value)} data-testid="input-newsletter" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Unsubscribe Date</Label>
                    <Input value={unsubscribeDate} onChange={e => setUnsubscribeDate(e.target.value)} data-testid="input-unsubscribe-date" />
                  </div>
                  <div className="space-y-2">
                    <Label>Profiling</Label>
                    <Input value={profiling} onChange={e => setProfiling(e.target.value)} data-testid="input-profiling" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Expiring Date (Profiling)</Label>
                    <Input value={expiringDateProfiling} onChange={e => setExpiringDateProfiling(e.target.value)} data-testid="input-expiring-date-profiling" />
                  </div>
                  <div className="space-y-2">
                    <Label>Privacy Acknowledged</Label>
                    <Input value={privacyAcknowledged} onChange={e => setPrivacyAcknowledged(e.target.value)} data-testid="input-privacy-acknowledged" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Anonymized</Label>
                  <Input value={anonymized} onChange={e => setAnonymized(e.target.value)} data-testid="input-anonymized" />
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Additional</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Last Call</Label>
                    <Input value={lastCall} onChange={e => setLastCall(e.target.value)} data-testid="input-last-call" />
                  </div>
                  <div className="space-y-2">
                    <Label>Next Recall</Label>
                    <Input value={nextRecall} onChange={e => setNextRecall(e.target.value)} data-testid="input-next-recall" />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Input value={tipo} onChange={e => setTipo(e.target.value)} data-testid="input-tipo" />
                  </div>
                  <div className="space-y-2">
                    <Label>N. Marketing</Label>
                    <Input value={nMarketing} onChange={e => setNMarketing(e.target.value)} data-testid="input-n-marketing" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Conversion Date</Label>
                    <Input value={conversionDate} onChange={e => setConversionDate(e.target.value)} data-testid="input-conversion-date" />
                  </div>
                  <div className="space-y-2">
                    <Label>Is External Record</Label>
                    <Input value={isExternalRecord} onChange={e => setIsExternalRecord(e.target.value)} data-testid="input-is-external-record" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} data-testid="input-notes" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-3 mt-6">
            <Button type="submit" disabled={saveMutation.isPending} className="px-8" data-testid="button-submit-contact">
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isEditing ? "Save Changes" : "Create Contact"}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(isEditing ? `/crm/contacts/${editId}` : "/crm/contacts")} data-testid="button-cancel">
              Cancel
            </Button>
          </div>
        </form>

        {!isEditing && (
          <div className="text-xs text-muted-foreground pb-4">
            Creation date and user are recorded automatically.
          </div>
        )}
      </div>
    </Layout>
  );
}
