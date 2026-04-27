import { DealerLayout } from "@/components/DealerLayout";
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
import { useState, useEffect } from "react";
import { ArrowLeft, Loader2, Building2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useRoute } from "wouter";

import { apiRequest } from "@/lib/queryClient";
import type { Customer } from "@shared/schema";

const ACCOUNT_STATUSES = ["Active", "Inactive"];
const STRUCTURES = ["H", "C", "D", "S"];
const LANGUAGES = ["ENGLISH", "FRENCH", "GERMAN", "ITALIANO", "POLISH", "PORTEGUESE", "SPANISH"];
const TYPES = ["Prospect"];
const INSOLVED_OPTIONS = ["YES", "NO"];
const COMPANY_ENTITIES = ["Talent Studio"];
const CUSTOMER_CATEGORIES = ["Agent", "Direct customer", "Indirect customer", "Dealer"];
const MATERIAL_TYPES = [
  "Cement", "Ceramic", "Composites", "Fiber cement", "Glass", "Marble",
  "Metal", "Other", "Plastic", "Wood",
];
const INDUSTRIES = [
  "ABS", "Aerospace", "Automotive", "Bathrooms", "Bedrooms", "Building",
  "Chairs", "Children's furniture", "Coffins", "Doors", "Flat panels",
  "Flooring", "Furniture", "Glass", "Glass furniture", "Kitchens", "Marine",
  "MDF Panels", "Office furniture", "Other", "Paint Supplier", "Profiles",
  "PVC", "Roll to Roll", "Roll to Roll Veneer", "Shutters and bars",
  "Solid wood", "Windows", "Wood particle panels",
];
const SIZES = ["1-10 Employees", "11-80 Employees", "81-200 Employees", "201+ Employees"];
const SALES_OPTIONS = ["MICRO 0-2 Mln", "SME 2-10 Mln", "MED 10-50 Mln", "LARGE 50+ Mln"];

function MultiSelectField({ label, options, value, onChange, testId }: {
  label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; testId: string;
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

export default function DealerEditCompanyPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [, editParams] = useRoute("/dealer/customers/companies/:id/edit");
  const [, newParams] = useRoute("/dealer/customers/companies/new");
  const editId = editParams?.id ? Number(editParams.id) : null;
  const isEditing = !!editId;


  const [name, setName] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [structure, setStructure] = useState("");
  const [relatedAccount, setRelatedAccount] = useState("");
  const [language, setLanguage] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [province, setProvince] = useState("");
  const [officePhone, setOfficePhone] = useState("");
  const [fax, setFax] = useState("");
  const [email, setEmail] = useState("");
  const [pec, setPec] = useState("");
  const [webSite, setWebSite] = useState("");
  const [fiscalCode, setFiscalCode] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [publicAdminCode, setPublicAdminCode] = useState("");
  const [insolved, setInsolved] = useState("");
  const [companyEntity, setCompanyEntity] = useState("");
  const [customerCategory, setCustomerCategory] = useState<string[]>([]);
  const [materialType, setMaterialType] = useState<string[]>([]);
  const [industry, setIndustry] = useState<string[]>([]);
  const [size, setSize] = useState("");
  const [sales, setSales] = useState("");
  const [abcAnalysis, setAbcAnalysis] = useState("");
  const [groupAbcAnalysis, setGroupAbcAnalysis] = useState("");
  const [conversionDate, setConversionDate] = useState("");
  const [directoryId, setDirectoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);

  const { data: existing, isLoading: loadingExisting, isError: loadError } = useQuery<Customer>({
    queryKey: ["/api/dealer/customers", editId],
    enabled: !!editId,
  });

  useEffect(() => {
    if (existing && !loaded) {
      setName(existing.name || "");
      setCustomerCode(existing.customerCode || "");
      setAccountStatus(existing.accountStatus || "");
      setStructure(existing.structure || "");
      setRelatedAccount(existing.relatedAccount || "");
      setLanguage(existing.language || "");
      setType(existing.type || "");
      setDescription(existing.description || "");
      setCompanyName(existing.contactPerson || "");
      setAddress(existing.address || "");
      setPostalCode(existing.postalCode || "");
      setCity(existing.city || "");
      setCountry(existing.country || "");
      setRegion(existing.region || "");
      setProvince(existing.province || "");
      setOfficePhone(existing.officePhone || "");
      setFax(existing.fax || "");
      setEmail(existing.email || "");
      setPec(existing.pec || "");
      setWebSite(existing.webSite || "");
      setFiscalCode(existing.fiscalCode || "");
      setVatNumber(existing.vatNumber || "");
      setPublicAdminCode(existing.publicAdminCode || "");
      setInsolved(existing.insolved || "");
      setCompanyEntity(existing.company || "");
      setCustomerCategory(existing.customerCategory || []);
      setMaterialType(existing.materialType || []);
      setIndustry(existing.industry || []);
      setSize(existing.size || "");
      setSales(existing.sales || "");
      setAbcAnalysis(existing.abcAnalysis || "");
      setGroupAbcAnalysis(existing.groupAbcAnalysis || "");
      setConversionDate(existing.conversionDate || "");
      setDirectoryId(existing.directoryId || "");
      setNotes(existing.notes || "");
      setLoaded(true);
    }
  }, [existing, loaded]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEditing) {
        return apiRequest("PUT", `/api/dealer/customers/${editId}`, data);
      }
      return apiRequest("POST", "/api/dealer/customers", data);
    },
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/customers"] });
      if (isEditing) {
        queryClient.invalidateQueries({ queryKey: ["/api/dealer/customers", editId] });
        toast({ title: "Company updated", description: "A notification has been sent for review." });
        navigate(`/dealer/customers/companies/${editId}`);
      } else {
        const created = await res.json();
        toast({ title: "Company created" });
        navigate(`/dealer/customers/companies/${created.id}`);
      }
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      name, customerCode, accountStatus, structure, relatedAccount, language,
      type, description, contactPerson: companyName, address, postalCode, city,
      country, region, province, officePhone, fax, email, pec, webSite,
      fiscalCode, vatNumber, publicAdminCode, insolved,
      company: companyEntity, customerCategory, materialType, industry,
      size, sales, abcAnalysis, groupAbcAnalysis,
      conversionDate, directoryId, notes,
    });
  };

  if (isEditing && loadingExisting) {
    return <DealerLayout><div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin" /></div></DealerLayout>;
  }

  if (isEditing && loadError) {
    return (
      <DealerLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-destructive font-medium">Company not found.</p>
          <Button variant="outline" onClick={() => window.history.back()} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </div>
      </DealerLayout>
    );
  }

  return (
    <DealerLayout>
      <div className="space-y-6">
        <PageHeader
          title={isEditing ? "Edit Company" : "New Company"}
          subtitle={isEditing ? `Editing ${existing?.name || "company"}` : "Add a new company to your CRM."}
        />

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4" /> General Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name *</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Company name" data-testid="input-name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Code</Label>
                    <Input value={customerCode} onChange={e => setCustomerCode(e.target.value)} placeholder="Code" data-testid="input-customer-code" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Account Status</Label>
                    <Select value={accountStatus || "none"} onValueChange={v => setAccountStatus(v === "none" ? "" : v)}>
                      <SelectTrigger data-testid="select-account-status"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {ACCOUNT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Structure</Label>
                    <Select value={structure || "none"} onValueChange={v => setStructure(v === "none" ? "" : v)}>
                      <SelectTrigger data-testid="select-structure"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {STRUCTURES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Related Account</Label>
                  <Input value={relatedAccount} onChange={e => setRelatedAccount(e.target.value)} placeholder="Related account" data-testid="input-related-account" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Language</Label>
                    <Select value={language || "none"} onValueChange={v => setLanguage(v === "none" ? "" : v)}>
                      <SelectTrigger data-testid="select-language"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {LANGUAGES.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={type || "none"} onValueChange={v => setType(v === "none" ? "" : v)}>
                      <SelectTrigger data-testid="select-type"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Description" data-testid="input-description" />
                </div>
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Company name" data-testid="input-company-name" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Address &amp; Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street address" data-testid="input-address" />
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
                    <Label>District/Province</Label>
                    <Input value={province} onChange={e => setProvince(e.target.value)} data-testid="input-province" />
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} data-testid="input-email" />
                  </div>
                  <div className="space-y-2">
                    <Label>PEC</Label>
                    <Input value={pec} onChange={e => setPec(e.target.value)} data-testid="input-pec" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Web Site</Label>
                  <Input value={webSite} onChange={e => setWebSite(e.target.value)} placeholder="https://..." data-testid="input-web-site" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fiscal Code</Label>
                    <Input value={fiscalCode} onChange={e => setFiscalCode(e.target.value)} data-testid="input-fiscal-code" />
                  </div>
                  <div className="space-y-2">
                    <Label>VAT Number</Label>
                    <Input value={vatNumber} onChange={e => setVatNumber(e.target.value)} data-testid="input-vat-number" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Public Admin Code</Label>
                    <Input value={publicAdminCode} onChange={e => setPublicAdminCode(e.target.value)} data-testid="input-public-admin-code" />
                  </div>
                  <div className="space-y-2">
                    <Label>Insolved</Label>
                    <Select value={insolved || "none"} onValueChange={v => setInsolved(v === "none" ? "" : v)}>
                      <SelectTrigger data-testid="select-insolved"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {INSOLVED_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Assignment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Company (Entity)</Label>
                  <Select value={companyEntity || "none"} onValueChange={v => setCompanyEntity(v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="select-company-entity"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {COMPANY_ENTITIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <MultiSelectField
                  label="Customer Category"
                  options={CUSTOMER_CATEGORIES}
                  value={customerCategory}
                  onChange={setCustomerCategory}
                  testId="multi-customer-category"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Industry &amp; Classification</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <MultiSelectField
                  label="Material Type"
                  options={MATERIAL_TYPES}
                  value={materialType}
                  onChange={setMaterialType}
                  testId="multi-material-type"
                />
                <MultiSelectField
                  label="Industry"
                  options={INDUSTRIES}
                  value={industry}
                  onChange={setIndustry}
                  testId="multi-industry"
                />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Size</Label>
                    <Select value={size || "none"} onValueChange={v => setSize(v === "none" ? "" : v)}>
                      <SelectTrigger data-testid="select-size"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sales</Label>
                    <Select value={sales || "none"} onValueChange={v => setSales(v === "none" ? "" : v)}>
                      <SelectTrigger data-testid="select-sales"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {SALES_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>ABC Analysis</Label>
                    <Input value={abcAnalysis} onChange={e => setAbcAnalysis(e.target.value)} data-testid="input-abc-analysis" />
                  </div>
                  <div className="space-y-2">
                    <Label>Group ABC Analysis</Label>
                    <Input value={groupAbcAnalysis} onChange={e => setGroupAbcAnalysis(e.target.value)} data-testid="input-group-abc-analysis" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Additional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Conversion Date</Label>
                  <Input value={conversionDate} onChange={e => setConversionDate(e.target.value)} placeholder="e.g. 2025-01-15" data-testid="input-conversion-date" />
                </div>
                <div className="space-y-2">
                  <Label>Directory ID</Label>
                  <Input value={directoryId} onChange={e => setDirectoryId(e.target.value)} data-testid="input-directory-id" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} data-testid="input-notes" />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 mt-6">
            <Button type="submit" disabled={saveMutation.isPending} className="px-8" data-testid="button-submit-company">
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isEditing ? "Save Changes" : "Create Company"}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(isEditing ? `/dealer/customers/companies/${editId}` : "/dealer/customers/companies")} data-testid="button-cancel">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </DealerLayout>
  );
}
