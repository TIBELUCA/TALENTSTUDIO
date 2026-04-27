import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";

import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineConfirmButton } from "@/components/InlineConfirm";
import { Loader2, Save, ArrowLeft, Building2, UserPlus, Pencil, Trash2, Eye, EyeOff, Globe, Search, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SalesmanUser } from "@shared/schema";
import { WORLD_COUNTRIES } from "@shared/schema";
import { cn } from "@/lib/utils";

interface DealerCompanyData {
  id: number;
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
  assignedCountries: string[] | null;
}

interface DealerContact {
  id: number;
  name: string;
  surname: string;
  email: string;
  mobileNumber?: string;
  role?: string;
  isActive: boolean;
}

const EMPTY_CONTACT_FORM = {
  name: "", surname: "", email: "", mobileNumber: "", password: "", role: "", isActive: true,
};

export default function EditDealerCompany() {
  const [, params] = useRoute("/dealers/:id/edit");
  const [, paramsNew] = useRoute("/dealers/new");
  const [, setLocation] = useLocation();

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isNew = !!paramsNew;
  const companyId = params?.id ? Number(params.id) : null;

  const [form, setForm] = useState({
    companyName: "", address: "", vatNumber: "", state: "", city: "",
    postalCode: "", email: "", phone: "", notes: "",
    linkedSalesmanId: "none" as string, isActive: true,
    assignedCountries: [] as string[],
  });
  const [countrySearch, setCountrySearch] = useState("");
  const [loaded, setLoaded] = useState(isNew);

  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<DealerContact | null>(null);
  const [contactForm, setContactForm] = useState({ ...EMPTY_CONTACT_FORM });
  const [showContactPassword, setShowContactPassword] = useState(false);

  const { data: companyData, isLoading } = useQuery<DealerCompanyData>({
    queryKey: ["/api/dealers", companyId],
    queryFn: async () => {
      const all = await fetch(`/api/dealers`, { credentials: "include" }).then(r => r.json());
      return all.find((c: any) => c.id === companyId);
    },
    enabled: !!companyId,
  });

  const { data: contacts = [] } = useQuery<DealerContact[]>({
    queryKey: ["/api/dealers", companyId, "contacts"],
    queryFn: async () => {
      const res = await fetch(`/api/dealers/${companyId}/contacts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load contacts");
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: salesmen = [] } = useQuery<SalesmanUser[]>({ queryKey: ["/api/users"] });

  useEffect(() => {
    if (companyData && !loaded) {
      setForm({
        companyName: companyData.companyName, address: companyData.address ?? "",
        vatNumber: companyData.vatNumber ?? "", state: companyData.state ?? "",
        city: companyData.city ?? "", postalCode: companyData.postalCode ?? "",
        email: companyData.email ?? "", phone: companyData.phone ?? "", notes: companyData.notes ?? "",
        linkedSalesmanId: companyData.linkedSalesmanId ? String(companyData.linkedSalesmanId) : "none",
        isActive: companyData.isActive,
        assignedCountries: companyData.assignedCountries ?? [],
      });
      setLoaded(true);
    }
  }, [companyData, loaded]);

  const createCompanyMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/dealers", {
      ...data,
      linkedSalesmanId: data.linkedSalesmanId === "none" ? null : parseInt(data.linkedSalesmanId),
      assignedCountries: data.assignedCountries?.length > 0 ? data.assignedCountries : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      toast({ title: "Dealer company created" });
      setLocation("/dealers");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateCompanyMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", `/api/dealers/${companyId}`, {
      ...data,
      linkedSalesmanId: data.linkedSalesmanId === "none" ? null : parseInt(data.linkedSalesmanId),
      assignedCountries: data.assignedCountries?.length > 0 ? data.assignedCountries : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dealers", companyId] });
      toast({ title: "Dealer company updated" });
      setLocation(`/dealers/${companyId}`);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createContactMutation = useMutation({
    mutationFn: (data: typeof contactForm) => apiRequest("POST", `/api/dealers/${companyId}/contacts`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealers", companyId, "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      setContactFormOpen(false);
      toast({ title: "Contact created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateContactMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/dealers/${companyId}/contacts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealers", companyId, "contacts"] });
      setContactFormOpen(false);
      toast({ title: "Contact updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteContactMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/dealers/${companyId}/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealers", companyId, "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      toast({ title: "Contact removed" });
    },
  });

  const handleCompanySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { ...form };
    if (isNew) {
      createCompanyMutation.mutate(payload);
    } else {
      updateCompanyMutation.mutate(payload);
    }
  };

  const openCreateContact = () => {
    setEditingContact(null);
    setContactForm({ ...EMPTY_CONTACT_FORM });
    setShowContactPassword(false);
    setContactFormOpen(true);
  };

  const openEditContact = (contact: DealerContact) => {
    setEditingContact(contact);
    setContactForm({
      name: contact.name, surname: contact.surname, email: contact.email,
      mobileNumber: contact.mobileNumber ?? "", password: "", role: contact.role ?? "",
      isActive: contact.isActive,
    });
    setShowContactPassword(false);
    setContactFormOpen(true);
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingContact) {
      const payload: any = { ...contactForm };
      if (!payload.password) delete payload.password;
      updateContactMutation.mutate({ id: editingContact.id, data: payload });
    } else {
      createContactMutation.mutate(contactForm);
    }
  };

  const isPending = createCompanyMutation.isPending || updateCompanyMutation.isPending;

  if (!isNew && isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <PageHeader
          title={isNew ? "Add Dealer Company" : "Edit Dealer Company"}
          subtitle={isNew ? "Create a new dealer company" : companyData?.companyName ?? ""}
          icon={<Building2 className="w-6 h-6 text-amber-600" />}
        />

        <form onSubmit={handleCompanySubmit} className="space-y-6">
          <div className="rounded-lg border bg-card p-6 space-y-5">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Company Information</h3>
            <div className="space-y-1">
              <Label>Company Name *</Label>
              <Input data-testid="input-company-name" value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>VAT Number</Label>
                <Input data-testid="input-company-vat" value={form.vatNumber} onChange={e => setForm(f => ({ ...f, vatNumber: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>State / Country</Label>
                <Input data-testid="input-company-state" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Address</Label>
              <Input data-testid="input-company-address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>City</Label>
                <Input data-testid="input-company-city" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Postal Code</Label>
                <Input data-testid="input-company-postal" value={form.postalCode} onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input data-testid="input-company-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input data-testid="input-company-phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Assigned Salesman</Label>
              <Select value={form.linkedSalesmanId} onValueChange={v => setForm(f => ({ ...f, linkedSalesmanId: v }))}>
                <SelectTrigger data-testid="select-company-salesman">
                  <SelectValue placeholder="Select salesman..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No assignment</SelectItem>
                  {(salesmen as any[]).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name} {s.surname}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea data-testid="input-company-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            {!isNew && (
              <div className="flex items-center justify-between py-1">
                <Label>Company Active</Label>
                <Switch data-testid="switch-company-active" checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-card p-6 space-y-4" data-testid="territory-card">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Assigned Territory</h3>
            </div>

            {form.assignedCountries.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.assignedCountries.map(code => {
                  const country = WORLD_COUNTRIES.find(c => c.code === code);
                  return (
                    <Badge key={code} variant="secondary" className="gap-1 pr-1">
                      {country ? country.name : code}
                      <button
                        type="button"
                        className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                        onClick={() => setForm(f => ({ ...f, assignedCountries: f.assignedCountries.filter(c => c !== code) }))}
                        data-testid={`remove-country-${code}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search countries..."
                value={countrySearch}
                onChange={e => setCountrySearch(e.target.value)}
                className="pl-9"
                data-testid="input-country-search"
              />
            </div>

            <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
              {WORLD_COUNTRIES
                .filter(c => {
                  if (!countrySearch) return !form.assignedCountries.includes(c.code);
                  const q = countrySearch.toLowerCase();
                  return (c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) && !form.assignedCountries.includes(c.code);
                })
                .slice(0, 50)
                .map(c => (
                  <button
                    key={c.code}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center justify-between"
                    onClick={() => {
                      setForm(f => ({ ...f, assignedCountries: [...f.assignedCountries, c.code].sort() }));
                      setCountrySearch("");
                    }}
                    data-testid={`add-country-${c.code}`}
                  >
                    <span>{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.code}</span>
                  </button>
                ))}
            </div>

            {form.assignedCountries.length === 0 && (
              <p className="text-xs text-muted-foreground">No countries assigned — this dealer has no territory restrictions.</p>
            )}
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={isPending} data-testid="button-save-company">
              {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Save className="w-4 h-4 mr-1.5" />
              {isNew ? "Create Company" : "Save Changes"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setLocation("/dealers")}>Cancel</Button>
          </div>
        </form>

        {!isNew && (
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Sales Contacts</h3>
              <Button size="sm" variant="outline" onClick={openCreateContact} data-testid="button-add-contact">
                <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Add Contact
              </Button>
            </div>

            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-2">No contacts yet.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Email</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Phone</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Role</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact, ci) => (
                      <tr key={contact.id} data-testid={`row-dealer-contact-${contact.id}`} className={ci % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                        <td className="px-3 py-2 font-medium">{contact.name} {contact.surname}</td>
                        <td className="px-3 py-2 text-muted-foreground">{contact.email}</td>
                        <td className="px-3 py-2 text-muted-foreground">{contact.mobileNumber || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{contact.role || "—"}</td>
                        <td className="px-3 py-2">
                          <Badge variant={contact.isActive ? "default" : "secondary"} className={cn("text-xs", contact.isActive ? "bg-green-100 text-green-700 border-green-200" : "")}>
                            {contact.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditContact(contact)} data-testid={`button-edit-contact-${contact.id}`}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <InlineConfirmButton
                              title="Remove contact?"
                              confirmLabel="Remove"
                              onConfirm={() => deleteContactMutation.mutate(contact.id)}
                              isPending={deleteContactMutation.isPending}
                              buttonContent={<Trash2 className="w-3 h-3 text-destructive" />}
                              buttonVariant="ghost"
                              buttonSize="icon"
                              buttonClassName="h-7 w-7"
                              data-testid={`button-delete-contact-${contact.id}`}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {contactFormOpen && (
        <div className="rounded-xl border bg-card p-6 mt-6" data-testid="contact-form-inline">
          <h3 className="font-semibold text-base mb-4">{editingContact ? "Edit Contact" : "Add Sales Contact"}</h3>
          <form onSubmit={handleContactSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First Name *</Label>
                <Input data-testid="input-contact-name" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Surname</Label>
                <Input data-testid="input-contact-surname" value={contactForm.surname} onChange={e => setContactForm(f => ({ ...f, surname: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Email *</Label>
              <Input data-testid="input-contact-email" type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Phone / Mobile</Label>
                <Input data-testid="input-contact-mobile" value={contactForm.mobileNumber} onChange={e => setContactForm(f => ({ ...f, mobileNumber: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Role / Title</Label>
                <Input data-testid="input-contact-role" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{editingContact ? "New Password (leave blank to keep)" : "Password *"}</Label>
              <div className="relative">
                <Input
                  data-testid="input-contact-password"
                  type={showContactPassword ? "text" : "password"}
                  value={contactForm.password}
                  onChange={e => setContactForm(f => ({ ...f, password: e.target.value }))}
                  required={!editingContact}
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowContactPassword(v => !v)}>
                  {showContactPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {editingContact && (
              <div className="flex items-center gap-3">
                <Switch id="contact-active" checked={contactForm.isActive} onCheckedChange={v => setContactForm(f => ({ ...f, isActive: v }))} data-testid="switch-contact-active" />
                <Label htmlFor="contact-active">Contact Active</Label>
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setContactFormOpen(false)}>Cancel</Button>
              <Button type="submit" data-testid="button-save-contact" disabled={createContactMutation.isPending || updateContactMutation.isPending}>
                {(createContactMutation.isPending || updateContactMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {editingContact ? "Save Changes" : "Add Contact"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
}
