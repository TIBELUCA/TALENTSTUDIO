import { useState, useEffect, useMemo } from "react";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useRoute } from "wouter";
import type { Interaction, Customer, Contact, Offer } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ArrowLeft, Loader2, Save, Check, ChevronsUpDown, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const INTERACTION_TYPES = [
  { value: "email", label: "Email" },
  { value: "phone_call", label: "Phone Call" },
  { value: "visit", label: "Visit" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "video_call", label: "Video Call" },
  { value: "todo", label: "To Do" },
];

const DIRECTIONS = [
  { value: "outbound", label: "Outbound" },
  { value: "inbound", label: "Inbound" },
];

const CLASSIFICATIONS = [
  { value: "commercial", label: "Commerciale" },
  { value: "commercial:invio_offerta", label: "Commerciale – Invio Offerta" },
  { value: "commercial:follow_up", label: "Commerciale – Follow Up" },
  { value: "commercial:trattativa", label: "Commerciale – Trattativa" },
  { value: "technical", label: "Tecnico" },
  { value: "technical:assistenza", label: "Tecnico – Assistenza" },
  { value: "technical:installazione", label: "Tecnico – Installazione" },
  { value: "technical:formazione", label: "Tecnico – Formazione" },
  { value: "administrative", label: "Amministrativo" },
];

interface InteractionFormData {
  customerId: string;
  contactId: string;
  date: string;
  direction: string;
  type: string;
  classification: string;
  notes: string;
  location: string;
  reminders: { minutesBefore: number }[];
  sendEmail: boolean;
  linkedOfferId: string;
}

const emptyForm: InteractionFormData = {
  customerId: "",
  contactId: "",
  date: new Date().toISOString().slice(0, 16),
  direction: "outbound",
  type: "phone_call",
  classification: "",
  notes: "",
  location: "",
  reminders: [],
  sendEmail: false,
  linkedOfferId: "",
};

export default function DealerInteractionFormPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [, editParams] = useRoute("/dealer/customers/interactions/:id/edit");
  const editId = editParams?.id ? Number(editParams.id) : null;
  const isEditing = !!editId;

  const { data: companies = [] } = useQuery<Customer[]>({ queryKey: ["/api/dealer/customers"] });
  const { data: allContacts = [] } = useQuery<Contact[]>({ queryKey: ["/api/dealer/contacts"] });
  const { data: allOffers = [] } = useQuery<Offer[]>({ queryKey: ["/api/dealer/offers"] });

  const { data: existingInteraction, isLoading: loadingInteraction } = useQuery<Interaction>({
    queryKey: ["/api/dealer/interactions", editId],
    queryFn: () => fetch(`/api/dealer/interactions/${editId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!editId,
  });

  const [form, setForm] = useState<InteractionFormData>({ ...emptyForm });
  const [initialized, setInitialized] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerSearch, setOfferSearch] = useState("");

  const searchParams = new URLSearchParams(window.location.search);
  const preselectedCustomerId = searchParams.get("customerId");
  const preselectedContactId = searchParams.get("contactId");

  useEffect(() => {
    if (isEditing && existingInteraction && !initialized) {
      setForm({
        customerId: String(existingInteraction.customerId),
        contactId: existingInteraction.contactId ? String(existingInteraction.contactId) : "",
        date: existingInteraction.date ? new Date(existingInteraction.date).toISOString().slice(0, 16) : emptyForm.date,
        direction: existingInteraction.direction,
        type: existingInteraction.type,
        classification: existingInteraction.classification || "",
        notes: existingInteraction.notes || "",
        location: existingInteraction.location || "",
        reminders: (existingInteraction.reminders as any) || [],
        sendEmail: (existingInteraction as any).sendEmail || false,
        linkedOfferId: existingInteraction.linkedOfferId ? String(existingInteraction.linkedOfferId) : "",
      });
      setInitialized(true);
    }
  }, [isEditing, existingInteraction, initialized]);

  useEffect(() => {
    if (!isEditing && !initialized) {
      const updates: Partial<InteractionFormData> = {};
      if (preselectedCustomerId) updates.customerId = preselectedCustomerId;
      if (preselectedContactId) updates.contactId = preselectedContactId;
      if (Object.keys(updates).length > 0) {
        setForm(f => ({ ...f, ...updates }));
      }
      setInitialized(true);
    }
  }, [isEditing, initialized, preselectedCustomerId, preselectedContactId]);

  const filteredContacts = form.customerId
    ? allContacts.filter(c => c.customerId === Number(form.customerId))
    : allContacts;

  const filteredCompanies = useMemo(() => {
    const q = companySearch.toLowerCase().trim();
    return q ? companies.filter(c => c.name.toLowerCase().includes(q)) : companies;
  }, [companies, companySearch]);

  const companyOffers = useMemo(() => {
    if (!form.customerId) return [];
    return allOffers.filter(o => o.customerId === Number(form.customerId));
  }, [allOffers, form.customerId]);

  const filteredOffers = useMemo(() => {
    const q = offerSearch.toLowerCase().trim();
    return q
      ? companyOffers.filter(o => o.referenceNumber.toLowerCase().includes(q) || o.subject.toLowerCase().includes(q))
      : companyOffers;
  }, [companyOffers, offerSearch]);

  const filteredContactsSearch = useMemo(() => {
    const q = contactSearch.toLowerCase().trim();
    return q
      ? filteredContacts.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q))
      : filteredContacts;
  }, [filteredContacts, contactSearch]);

  const showLocation = form.type === "visit" || form.type === "video_call";

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEditing) {
        return apiRequest("PUT", `/api/dealer/interactions/${editId}`, data);
      }
      return apiRequest("POST", "/api/dealer/interactions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/dealer/interactions");
      }});
      toast({ title: isEditing ? "Interaction updated" : "Interaction created" });
      window.history.back();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) {
      toast({ title: "Company is required", variant: "destructive" });
      return;
    }
    const contactId = form.contactId && form.contactId !== "none" ? Number(form.contactId) : null;
    saveMutation.mutate({
      customerId: Number(form.customerId),
      contactId,
      date: new Date(form.date).toISOString(),
      direction: form.direction,
      type: form.type,
      classification: form.classification || null,
      notes: form.notes || null,
      location: form.location || null,
      reminders: form.reminders.length > 0 ? form.reminders : null,
      sendEmail: form.sendEmail,
      linkedOfferId: form.linkedOfferId ? Number(form.linkedOfferId) : null,
    });
  };

  if (isEditing && loadingInteraction) {
    return (
      <DealerLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DealerLayout>
    );
  }

  return (
    <DealerLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <PageHeader
          title={isEditing ? "Edit Interaction" : "New Interaction"}
          subtitle={isEditing ? "Update interaction details" : "Log a new customer interaction"}
          actions={
            <Button variant="outline" onClick={() => window.history.back()} data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          }
        />

        <form onSubmit={handleSubmit} className="space-y-6 bg-card border rounded-lg p-6">
          <div>
            <Label>Company *</Label>
            <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={companyOpen}
                  className="w-full justify-between font-normal"
                  data-testid="select-company"
                >
                  {form.customerId
                    ? companies.find(c => String(c.id) === form.customerId)?.name ?? "Select company"
                    : "Select company"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search companies..."
                    value={companySearch}
                    onValueChange={setCompanySearch}
                    data-testid="select-company-search"
                  />
                  <CommandList>
                    <CommandEmpty>No company found.</CommandEmpty>
                    <CommandGroup>
                      {filteredCompanies.map(c => (
                        <CommandItem
                          key={c.id}
                          value={String(c.id)}
                          onSelect={() => {
                            setForm(f => {
                              const newCid = Number(c.id);
                              const keepOffer = f.linkedOfferId && allOffers.some(o => String(o.id) === f.linkedOfferId && o.customerId === newCid);
                              return { ...f, customerId: String(c.id), contactId: "", linkedOfferId: keepOffer ? f.linkedOfferId : "" };
                            });
                            setCompanyOpen(false);
                            setCompanySearch("");
                          }}
                          data-testid={`select-company-option-${c.id}`}
                        >
                          <Check className={cn("mr-2 h-4 w-4", form.customerId === String(c.id) ? "opacity-100" : "opacity-0")} />
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Contact</Label>
            <Popover open={contactOpen} onOpenChange={setContactOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={contactOpen}
                  className="w-full justify-between font-normal"
                  data-testid="select-contact"
                >
                  {form.contactId && form.contactId !== "none"
                    ? (() => {
                        const ct = allContacts.find(c => String(c.id) === form.contactId);
                        return ct ? `${ct.firstName} ${ct.lastName}` : "Select contact (optional)";
                      })()
                    : "Select contact (optional)"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search contacts..."
                    value={contactSearch}
                    onValueChange={setContactSearch}
                    data-testid="select-contact-search"
                  />
                  <CommandList>
                    <CommandEmpty>No contact found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="none"
                        onSelect={() => {
                          setForm(f => ({ ...f, contactId: "none" }));
                          setContactOpen(false);
                          setContactSearch("");
                        }}
                        data-testid="select-contact-option-none"
                      >
                        <Check className={cn("mr-2 h-4 w-4", !form.contactId || form.contactId === "none" ? "opacity-100" : "opacity-0")} />
                        No specific contact
                      </CommandItem>
                      {filteredContactsSearch.map(c => (
                        <CommandItem
                          key={c.id}
                          value={String(c.id)}
                          onSelect={() => {
                            setForm(f => ({ ...f, contactId: String(c.id) }));
                            setContactOpen(false);
                            setContactSearch("");
                          }}
                          data-testid={`select-contact-option-${c.id}`}
                        >
                          <Check className={cn("mr-2 h-4 w-4", form.contactId === String(c.id) ? "opacity-100" : "opacity-0")} />
                          {c.firstName} {c.lastName}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date & Time *</Label>
              <Input
                type="datetime-local"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                data-testid="input-date"
              />
            </div>
            <div>
              <Label>Direction *</Label>
              <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v }))}>
                <SelectTrigger data-testid="select-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTIONS.map(d => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Type *</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger data-testid="select-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERACTION_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Classification</Label>
              <Select value={form.classification || "none"} onValueChange={v => setForm(f => ({ ...f, classification: v === "none" ? "" : v }))}>
                <SelectTrigger data-testid="select-classification">
                  <SelectValue placeholder="Select classification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {CLASSIFICATIONS.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {showLocation && (
            <div>
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder={form.type === "visit" ? "Visit location" : "Meeting link"}
                data-testid="input-location"
              />
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={4}
              placeholder="Interaction notes..."
              data-testid="input-notes"
            />
          </div>

          <div>
            <Label>Reminder</Label>
            <Select
              value={form.reminders.length > 0 ? String(form.reminders[0].minutesBefore) : "none"}
              onValueChange={v => setForm(f => ({ ...f, reminders: v === "none" ? [] : [{ minutesBefore: Number(v) }] }))}
            >
              <SelectTrigger data-testid="select-reminder">
                <SelectValue placeholder="No reminder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No reminder</SelectItem>
                <SelectItem value="15">15 minutes before</SelectItem>
                <SelectItem value="30">30 minutes before</SelectItem>
                <SelectItem value="60">1 hour before</SelectItem>
                <SelectItem value="1440">1 day before</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Offerta collegata</Label>
            <Popover open={offerOpen} onOpenChange={setOfferOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={offerOpen}
                  className="w-full justify-between font-normal"
                  disabled={!form.customerId || companyOffers.length === 0}
                  data-testid="select-offer"
                >
                  {form.linkedOfferId && form.linkedOfferId !== "none"
                    ? (() => {
                        const o = allOffers.find(o => String(o.id) === form.linkedOfferId);
                        return o ? `${o.referenceNumber} – ${o.subject}` : "Seleziona offerta (opzionale)";
                      })()
                    : !form.customerId ? "Seleziona prima una company" : companyOffers.length === 0 ? "Nessuna offerta per questa company" : "Seleziona offerta (opzionale)"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Cerca offerta..."
                    value={offerSearch}
                    onValueChange={setOfferSearch}
                    data-testid="select-offer-search"
                  />
                  <CommandList>
                    <CommandEmpty>Nessuna offerta trovata.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="none"
                        onSelect={() => {
                          setForm(f => ({ ...f, linkedOfferId: "" }));
                          setOfferOpen(false);
                          setOfferSearch("");
                        }}
                        data-testid="select-offer-option-none"
                      >
                        <Check className={cn("mr-2 h-4 w-4", !form.linkedOfferId || form.linkedOfferId === "none" ? "opacity-100" : "opacity-0")} />
                        Nessuna offerta
                      </CommandItem>
                      {filteredOffers.map(o => (
                        <CommandItem
                          key={o.id}
                          value={String(o.id)}
                          onSelect={() => {
                            setForm(f => ({ ...f, linkedOfferId: String(o.id) }));
                            setOfferOpen(false);
                            setOfferSearch("");
                          }}
                          data-testid={`select-offer-option-${o.id}`}
                        >
                          <Check className={cn("mr-2 h-4 w-4", form.linkedOfferId === String(o.id) ? "opacity-100" : "opacity-0")} />
                          <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                          <span className="truncate">{o.referenceNumber} – {o.subject}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => window.history.back()} data-testid="button-cancel">
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-interaction">
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Saving..." : isEditing ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </DealerLayout>
  );
}
