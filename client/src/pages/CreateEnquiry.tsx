import { useState, useRef, useEffect } from "react";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2, ChevronRight, ChevronLeft, Check, Paperclip, Trash2, Plus, GripVertical, Eye, EyeOff } from "lucide-react";
import { MachinePicker } from "@/components/MachinePicker";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import type { Customer, MachineWithOptions, Contact } from "@shared/schema";
import type { FamilyDefaults } from "./FamilyDefaults";

interface CartItem {
  tempId: string;
  machineId: number;
  quantity: number;
  selectedOptionIds: number[];
  optionQuantities: Record<number, number>;
}

interface TechnicalSpecs {
  minMaxLength: string;
  maxWidth: string;
  minMaxThickness: string;
  averageLineSpeed: string;
  controlSide: string;
  maxBow: string;
  paint: string;
  substrate: string;
  finishing: string;
}

const defaultTechnicalSpecs: TechnicalSpecs = {
  minMaxLength: "",
  maxWidth: "",
  minMaxThickness: "",
  averageLineSpeed: "",
  controlSide: "",
  maxBow: "",
  paint: "",
  substrate: "",
  finishing: "",
};

const STEPS = [
  { id: "customer",    label: "Customer Details" },
  { id: "details",     label: "Date & Parties" },
  { id: "subject",     label: "Project Data" },
  { id: "specs",       label: "Technical Specifications" },
  { id: "composition", label: "Machines and Options" },
  { id: "description", label: "Line Description" },
  { id: "commercial",  label: "Commercial Details" },
];

export default function CreateEnquiry() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [customerId, setCustomerId] = useState<number | null>(null);

  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/dealer/customers"] });
  const { data: machines } = useQuery<MachineWithOptions[]>({ queryKey: ["/api/dealer/machines"] });
  const { data: companyContacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/dealer/contacts", { customerId }],
    queryFn: () => fetch(`/api/dealer/contacts?customerId=${customerId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!customerId,
  });
  const { data: familyDefaults } = useQuery<FamilyDefaults>({
    queryKey: ["/api/settings/family-defaults"],
    queryFn: () => fetch("/api/settings/family-defaults", { credentials: "include" }).then(r => r.json()),
  });
  const [subject, setSubject] = useState("");
  const [layout, setLayout] = useState("");
  const [family, setFamily] = useState("");
  const [technicalSpecs, setTechnicalSpecs] = useState<TechnicalSpecs>(defaultTechnicalSpecs);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lineDescription, setLineDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [salesModel, setSalesModel] = useState("");
  const [installationResponsibility, setInstallationResponsibility] = useState("");
  const [installationNotes, setInstallationNotes] = useState("");
  const [offerUrgency, setOfferUrgency] = useState("");
  const [deliveryUrgency, setDeliveryUrgency] = useState("");
  const [paintSupplierStatus, setPaintSupplierStatus] = useState("");
  const [paintSupplierName, setPaintSupplierName] = useState("");
  const [paintSupplierContact, setPaintSupplierContact] = useState("");
  const [hasIntermediaries, setHasIntermediaries] = useState("");
  const [intermediariesDetails, setIntermediariesDetails] = useState("");

  const [headerDate, setHeaderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [headerSalesmanName, setHeaderSalesmanName] = useState("");
  const [headerSalesmanEmail, setHeaderSalesmanEmail] = useState("");
  const [headerSalesmanMobile, setHeaderSalesmanMobile] = useState("");
  const [headerCustomerName, setHeaderCustomerName] = useState("");
  const [headerCustomerContact, setHeaderCustomerContact] = useState("");
  const [headerCustomerEmail, setHeaderCustomerEmail] = useState("");
  const [headerCustomerAddress, setHeaderCustomerAddress] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string>("");

  const [activeMachineId, setActiveMachineId] = useState("");
  const [activeQuantity, setActiveQuantity] = useState(1);
  const [activeOptions, setActiveOptions] = useState<number[]>([]);
  const [activeOptionQuantities, setActiveOptionQuantities] = useState<Record<number, number>>({});
  const [showAllOptions, setShowAllOptions] = useState<Set<string>>(new Set());

  const currentStep = STEPS[step - 1];
  const selectedMachine = machines?.find(m => m.id === parseInt(activeMachineId));

  useEffect(() => {
    if (user) {
      if (!headerSalesmanName) setHeaderSalesmanName(`${user.name || ""} ${user.surname || ""}`.trim());
      if (!headerSalesmanEmail) setHeaderSalesmanEmail(user.email ?? "");
      if (!headerSalesmanMobile) setHeaderSalesmanMobile(user.mobileNumber ?? "");
    }
  }, [user]);

  useEffect(() => {
    if (customerId && customers) {
      const c = customers.find(x => x.id === customerId) as any;
      if (c) {
        setHeaderCustomerName(c.name ?? "");
        setHeaderCustomerAddress(c.address ?? "");
        setSelectedContactId("");
        setHeaderCustomerContact("");
        setHeaderCustomerEmail("");
      }
    }
  }, [customerId, customers]);

  useEffect(() => {
    if (!selectedContactId || companyContacts.length === 0) return;
    const contact = companyContacts.find(c => c.id.toString() === selectedContactId);
    if (contact) {
      setHeaderCustomerContact(`${contact.firstName || ""} ${contact.lastName || ""}`.trim());
      setHeaderCustomerEmail(contact.email || "");
    }
  }, [selectedContactId, companyContacts]);

  useEffect(() => {
    if (currentStep.id !== "specs" || !family || !familyDefaults) return;
    const defaults = familyDefaults[family as keyof FamilyDefaults];
    if (!defaults) return;
    setTechnicalSpecs(prev => ({
      minMaxLength:     prev.minMaxLength     || defaults.minMaxLength     || prev.minMaxLength,
      maxWidth:         prev.maxWidth         || defaults.maxWidth         || prev.maxWidth,
      minMaxThickness:  prev.minMaxThickness  || defaults.minMaxThickness  || prev.minMaxThickness,
      averageLineSpeed: prev.averageLineSpeed || defaults.averageLineSpeed || prev.averageLineSpeed,
      controlSide:      prev.controlSide      || defaults.controlSide      || prev.controlSide,
      maxBow:           prev.maxBow           || defaults.maxBow           || prev.maxBow,
      paint:            prev.paint            || defaults.paint            || prev.paint,
      substrate:        prev.substrate        || defaults.substrate        || prev.substrate,
      finishing:        prev.finishing        || defaults.finishing        || prev.finishing,
    }));
  }, [currentStep.id, family, familyDefaults]);

  const updateSpec = (field: keyof TechnicalSpecs, value: string) =>
    setTechnicalSpecs(prev => ({ ...prev, [field]: value }));

  const handleAddMachine = () => {
    if (!activeMachineId) return;
    const machine = machines?.find(m => m.id === parseInt(activeMachineId));
    if (!machine) return;
    setCart(prev => [...prev, {
      tempId: Math.random().toString(36).slice(2),
      machineId: machine.id,
      quantity: activeQuantity,
      selectedOptionIds: [...activeOptions],
      optionQuantities: { ...activeOptionQuantities },
    }]);
    setActiveMachineId("");
    setActiveQuantity(1);
    setActiveOptions([]);
    setActiveOptionQuantities({});
  };

  const handleRemoveItem = (tempId: string) => setCart(prev => prev.filter(i => i.tempId !== tempId));

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(cart);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setCart(items);
  };

  const handleSubmit = async () => {
    if (!customerId) return;
    setSubmitting(true);
    try {
      const offerData = {
        customerId,
        subject: subject || "Offer Request",
        salesmanName: `${user?.name || ""} ${user?.surname || ""}`.trim(),
        totalPrice: 0,
        status: "pending",
        projectData: {
          lineDescription,
          notes,
          layout,
          family,
          technicalSpecs,
          headerInfo: {
            date: headerDate,
            salesman: { name: headerSalesmanName, email: headerSalesmanEmail, mobile: headerSalesmanMobile },
            customer: { name: headerCustomerName, contactPerson: headerCustomerContact, contactId: selectedContactId || undefined, email: headerCustomerEmail, address: headerCustomerAddress },
          },
          commercial: {
            salesModel: salesModel || undefined,
            installationResponsibility: installationResponsibility || undefined,
            installationNotes: installationNotes || undefined,
            offerUrgency: offerUrgency || undefined,
            deliveryUrgency: deliveryUrgency || undefined,
            paintSupplierStatus: paintSupplierStatus || undefined,
            paintSupplierName: paintSupplierName || undefined,
            paintSupplierContact: paintSupplierContact || undefined,
            hasIntermediaries: hasIntermediaries || undefined,
            intermediariesDetails: intermediariesDetails || undefined,
          },
        },
      };

      const items = cart.map(item => ({
        machineId: item.machineId,
        quantity: item.quantity,
        optionIds: item.selectedOptionIds,
        optionQuantities: item.optionQuantities,
        customBasePrice: 0,
      }));

      const res = await fetch("/api/dealer/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ offer: offerData, items }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to submit request");
      }

      const enquiry = await res.json();

      for (const file of attachments) {
        const formData = new FormData();
        formData.append("file", file);
        await fetch(`/api/enquiries/${enquiry.id}/attachments`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/dealer/enquiries"] });
      toast({ title: "Request submitted!", description: "Your sales team has been notified." });
      setLocation("/dealer/requests");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    if (currentStep.id === "customer") return !!customerId;
    if (currentStep.id === "composition") return cart.length > 0;
    return true;
  };

  const isLastStep = step === STEPS.length;

  return (
    <DealerLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="New Offer Request"
          subtitle="Submit a request for a quotation from your sales team"
        />

        <div className="flex items-center gap-1 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1">
              <div className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer",
                step === i + 1 ? "bg-primary text-primary-foreground" : step > i + 1 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"
              )}
              onClick={() => {
                if (i + 1 < step) setStep(i + 1);
              }}
              >
                {step > i + 1 ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
                <span>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
            </div>
          ))}
        </div>

        <div className="border rounded-xl bg-card p-6 min-h-64">
          <AnimatePresence mode="wait">

            {currentStep.id === "customer" && (
              <motion.div key="customer" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <h2 className="text-lg font-semibold border-b pb-2">Customer Details</h2>
                <div className="space-y-1">
                  <Label>Customer</Label>
                  <Select
                    value={customerId ? String(customerId) : ""}
                    onValueChange={(v) => setCustomerId(parseInt(v))}
                  >
                    <SelectTrigger data-testid="select-customer">
                      <SelectValue placeholder="Select a customer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customers?.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)} data-testid={`option-customer-${c.id}`}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {customerId && (
                  <div className="space-y-1">
                    <Label>Contact Person</Label>
                    <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                      <SelectTrigger data-testid="select-contact">
                        <SelectValue placeholder="Select a contact..." />
                      </SelectTrigger>
                      <SelectContent>
                        {companyContacts.map((ct) => (
                          <SelectItem key={ct.id} value={ct.id.toString()} data-testid={`option-contact-${ct.id}`}>
                            {ct.firstName} {ct.lastName}{ct.contactRole?.length ? ` — ${ct.contactRole[0]}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {companyContacts.length === 0 && (
                      <p className="text-xs text-muted-foreground">No contacts found for this company.</p>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {currentStep.id === "details" && (
              <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <h3 className="font-semibold text-lg border-b pb-2">Date & Parties</h3>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={headerDate} onChange={e => setHeaderDate(e.target.value)} data-testid="input-date" />
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dealer / Salesman</Label>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Name</Label>
                      <Input value={headerSalesmanName} onChange={e => setHeaderSalesmanName(e.target.value)} placeholder="Your name" data-testid="input-salesman-name" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Email</Label>
                      <Input value={headerSalesmanEmail} onChange={e => setHeaderSalesmanEmail(e.target.value)} placeholder="email@company.com" data-testid="input-salesman-email" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Mobile</Label>
                      <Input value={headerSalesmanMobile} onChange={e => setHeaderSalesmanMobile(e.target.value)} placeholder="+39 ..." data-testid="input-salesman-mobile" />
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</Label>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Company Name</Label>
                      <Input value={headerCustomerName} onChange={e => setHeaderCustomerName(e.target.value)} placeholder="Company name" data-testid="input-customer-name" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Contact Person</Label>
                      {companyContacts.length > 0 ? (
                        <Select value={selectedContactId} onValueChange={(v) => setSelectedContactId(v)}>
                          <SelectTrigger data-testid="select-header-contact">
                            <SelectValue placeholder="Select a contact..." />
                          </SelectTrigger>
                          <SelectContent>
                            {companyContacts.map((ct) => (
                              <SelectItem key={ct.id} value={ct.id.toString()}>
                                {ct.firstName} {ct.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={headerCustomerContact} onChange={e => setHeaderCustomerContact(e.target.value)} placeholder="Contact person" data-testid="input-customer-contact" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Email</Label>
                      <Input value={headerCustomerEmail} onChange={e => setHeaderCustomerEmail(e.target.value)} placeholder="customer@email.com" data-testid="input-customer-email" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Address</Label>
                      <Input value={headerCustomerAddress} onChange={e => setHeaderCustomerAddress(e.target.value)} placeholder="Address" data-testid="input-customer-address" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {currentStep.id === "subject" && (
              <motion.div key="subject" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <h3 className="font-semibold text-lg border-b pb-2">Project Data</h3>
                <div className="space-y-2">
                  <Label>Subject / Project Name</Label>
                  <Input
                    data-testid="input-enquiry-subject"
                    placeholder="e.g. Finishing Line Project 2026"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Layout</Label>
                  <Input
                    data-testid="input-layout"
                    placeholder="e.g. 3"
                    value={layout}
                    onChange={e => setLayout(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Product Family</Label>
                  <Select value={family} onValueChange={setFamily}>
                    <SelectTrigger data-testid="select-family">
                      <SelectValue placeholder="Select a machine family…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rullo">Rullo</SelectItem>
                      <SelectItem value="spruzzatrici">Spruzzatrici</SelectItem>
                      <SelectItem value="robot">Robot</SelectItem>
                      <SelectItem value="profilo">Profilo</SelectItem>
                      <SelectItem value="velo">Velo</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Selecting a family will pre-fill empty Technical Specification fields in the next step.</p>
                </div>
              </motion.div>
            )}

            {currentStep.id === "specs" && (
              <motion.div key="specs" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <h3 className="font-semibold text-lg border-b pb-2">Technical Specifications</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    { field: "minMaxLength",     label: "Min/Max. length of the pieces (mm)", placeholder: "e.g. 300-2500" },
                    { field: "maxWidth",          label: "Max. width of the pieces (mm)",       placeholder: "e.g. 1300" },
                    { field: "minMaxThickness",   label: "Min/Max. thickness (mm)",             placeholder: "e.g. 8-50" },
                    { field: "averageLineSpeed",  label: "Average line speed (mt/min)",          placeholder: "e.g. 5-15" },
                    { field: "controlSide",       label: "Control side",                        placeholder: "e.g. Right / Left" },
                    { field: "maxBow",            label: "Max. bow of the panel",               placeholder: "" },
                    { field: "paint",             label: "Paint",                               placeholder: "" },
                    { field: "substrate",         label: "Substrate",                           placeholder: "" },
                    { field: "finishing",         label: "Finishing Level",                     placeholder: "" },
                  ].map(({ field, label, placeholder }) => (
                    <div key={field} className="space-y-2">
                      <Label>{label}</Label>
                      <Input
                        placeholder={placeholder}
                        value={technicalSpecs[field as keyof TechnicalSpecs]}
                        onChange={e => updateSpec(field as keyof TechnicalSpecs, e.target.value)}
                        data-testid={`input-spec-${field}`}
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {currentStep.id === "composition" && (
              <motion.div key="composition" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                <div className="space-y-4 p-4 bg-muted/30 rounded-xl border border-border/50">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Add Line Item
                  </h3>

                  <MachinePicker
                    machines={machines ?? []}
                    value={activeMachineId}
                    onChange={(id) => {
                      setActiveMachineId(id);
                      setActiveOptions([]);
                      setActiveOptionQuantities({});
                    }}
                  />

                  {selectedMachine && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Quantity</Label>
                        <Input
                          type="number" min="1"
                          value={activeQuantity}
                          onChange={e => setActiveQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                          data-testid="input-quantity"
                        />
                      </div>
                      {selectedMachine.options.length > 0 && (
                        <div className="space-y-2">
                          <Label>Options</Label>
                          <div className="grid gap-2">
                            {[...selectedMachine.options]
                              .sort((a, b) => ((a as any).seqNum ?? 999999) - ((b as any).seqNum ?? 999999))
                              .map(opt => {
                                const isChecked = activeOptions.includes(opt.id);
                                return (
                                  <div key={opt.id} className="flex items-center gap-2 flex-wrap">
                                    <Checkbox
                                      id={`opt-${opt.id}`}
                                      checked={isChecked}
                                      onCheckedChange={checked => {
                                        if (checked) {
                                          setActiveOptions(prev => [...prev, opt.id]);
                                          setActiveOptionQuantities(q => ({ ...q, [opt.id]: 1 }));
                                        } else {
                                          setActiveOptions(prev => prev.filter(id => id !== opt.id));
                                          setActiveOptionQuantities(q => { const n = { ...q }; delete n[opt.id]; return n; });
                                        }
                                      }}
                                      data-testid={`checkbox-opt-${opt.id}`}
                                    />
                                    <label htmlFor={`opt-${opt.id}`} className="text-sm font-medium leading-none cursor-pointer flex-1">
                                      {opt.name}
                                    </label>
                                    {isChecked && (
                                      <Input
                                        type="number" min="1"
                                        value={activeOptionQuantities[opt.id] ?? 1}
                                        onChange={e => {
                                          const v = Math.max(1, parseInt(e.target.value) || 1);
                                          setActiveOptionQuantities(q => ({ ...q, [opt.id]: v }));
                                        }}
                                        className="w-16 h-7 text-xs"
                                        data-testid={`input-opt-qty-${opt.id}`}
                                      />
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  <Button onClick={handleAddMachine} disabled={!activeMachineId} className="w-full" data-testid="button-add-item">
                    <Plus className="w-4 h-4 mr-2" />
                    Add to List
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">Current Items</h3>
                    <p className="text-xs text-muted-foreground">Drag items to reorder positions</p>
                  </div>
                  {cart.length === 0 ? (
                    <div className="h-32 flex items-center justify-center border-2 border-dashed border-muted-foreground/20 rounded-xl text-muted-foreground text-sm">
                      No items added yet.
                    </div>
                  ) : (
                    <DragDropContext onDragEnd={handleDragEnd}>
                      <Droppable droppableId="cart-items">
                        {(provided) => (
                          <div className="space-y-3" {...provided.droppableProps} ref={provided.innerRef}>
                            {cart.map((item, index) => {
                              const machine = machines?.find(m => m.id === item.machineId);
                              const allOptions = [...(machine?.options ?? [])].sort((a, b) => ((a as any).seqNum ?? 999999) - ((b as any).seqNum ?? 999999));
                              const position = index + 1;
                              return (
                                <Draggable key={item.tempId} draggableId={item.tempId} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      className={cn(
                                        "p-4 bg-card border rounded-lg shadow-sm",
                                        snapshot.isDragging && "shadow-lg ring-2 ring-primary/20"
                                      )}
                                    >
                                      <div className="flex items-center gap-2 mb-3">
                                        <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground" data-testid={`drag-handle-${index}`}>
                                          <GripVertical className="w-4 h-4" />
                                        </div>
                                        <span className="font-bold text-primary shrink-0">Pos. {position}</span>
                                        <span className="font-medium flex-1 truncate">{machine?.name}</span>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <Label className="text-xs text-muted-foreground">Qty</Label>
                                          <Input
                                            type="number" min="1"
                                            value={item.quantity}
                                            onChange={(e) => {
                                              const v = Math.max(1, parseInt(e.target.value) || 1);
                                              setCart(prev => prev.map(c => c.tempId === item.tempId ? { ...c, quantity: v } : c));
                                            }}
                                            className="w-16 h-7 text-sm"
                                            data-testid={`input-cart-qty-${index}`}
                                          />
                                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleRemoveItem(item.tempId)} data-testid={`button-remove-item-${index}`}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </Button>
                                        </div>
                                      </div>

                                      {allOptions.length > 0 && (() => {
                                        const isExpanded = showAllOptions.has(item.tempId);
                                        const visibleOptions = isExpanded ? allOptions : allOptions.filter(o => item.selectedOptionIds.includes(o.id));
                                        const hiddenCount = allOptions.length - item.selectedOptionIds.length;
                                        return (
                                          <div className="ml-8 space-y-1.5">
                                            <div className="grid sm:grid-cols-2 gap-1.5">
                                              {visibleOptions.map((opt) => {
                                                const isChecked = item.selectedOptionIds.includes(opt.id);
                                                const qty = item.optionQuantities?.[opt.id] ?? 1;
                                                return (
                                                  <div key={opt.id} className="flex items-center gap-2 px-2 py-1.5 rounded border border-transparent hover:border-border hover:bg-muted/30 transition-colors">
                                                    <Checkbox
                                                      id={`cart-opt-${item.tempId}-${opt.id}`}
                                                      checked={isChecked}
                                                      onCheckedChange={(checked) => {
                                                        setCart(prev => prev.map(c => {
                                                          if (c.tempId !== item.tempId) return c;
                                                          const ids = checked ? [...c.selectedOptionIds, opt.id] : c.selectedOptionIds.filter(id => id !== opt.id);
                                                          const oq = { ...c.optionQuantities };
                                                          if (checked) oq[opt.id] = 1; else delete oq[opt.id];
                                                          return { ...c, selectedOptionIds: ids, optionQuantities: oq };
                                                        }));
                                                      }}
                                                      data-testid={`checkbox-cart-opt-${item.tempId}-${opt.id}`}
                                                    />
                                                    <label htmlFor={`cart-opt-${item.tempId}-${opt.id}`} className="text-xs leading-tight cursor-pointer flex-1 min-w-0">
                                                      <span className={isChecked ? "font-medium" : "text-muted-foreground"}>{opt.name}</span>
                                                    </label>
                                                    {isChecked && (
                                                      <Input
                                                        type="number" min="1"
                                                        value={qty}
                                                        onChange={(e) => {
                                                          const v = Math.max(1, parseInt(e.target.value) || 1);
                                                          setCart(prev => prev.map(c => c.tempId === item.tempId ? { ...c, optionQuantities: { ...c.optionQuantities, [opt.id]: v } } : c));
                                                        }}
                                                        className="w-14 h-6 text-xs shrink-0"
                                                        data-testid={`input-cart-opt-qty-${item.tempId}-${opt.id}`}
                                                      />
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                            {hiddenCount > 0 && (
                                              <button
                                                type="button"
                                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                                onClick={() => setShowAllOptions(prev => {
                                                  const next = new Set(prev);
                                                  if (next.has(item.tempId)) next.delete(item.tempId); else next.add(item.tempId);
                                                  return next;
                                                })}
                                                data-testid={`button-toggle-options-${index}`}
                                              >
                                                {isExpanded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                {isExpanded ? "Hide unselected options" : `Show ${hiddenCount} more option${hiddenCount !== 1 ? "s" : ""}`}
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </DragDropContext>
                  )}
                </div>
              </motion.div>
            )}

            {currentStep.id === "description" && (
              <motion.div key="description" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <h2 className="text-lg font-semibold border-b pb-2">Line Description & Attachments</h2>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    data-testid="textarea-line-description"
                    placeholder="Describe the line configuration and main requirements..."
                    value={lineDescription}
                    onChange={e => setLineDescription(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    data-testid="textarea-notes"
                    placeholder="Any additional notes, special requests, or context for your sales team..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Attachments</Label>
                  <div className="space-y-2">
                    {attachments.map((file, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 px-3 py-2 rounded-lg">
                        <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                        <Button
                          size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                          onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                          data-testid={`button-remove-attachment-${i}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline" size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-add-attachment"
                    >
                      <Paperclip className="w-3.5 h-3.5 mr-2" />
                      Attach File
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={e => {
                        if (e.target.files) setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {currentStep.id === "commercial" && (
              <motion.div key="commercial" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <h2 className="text-lg font-semibold border-b pb-2">Commercial Details</h2>

                <div className="space-y-2">
                  <Label>Sales Model</Label>
                  <Select value={salesModel} onValueChange={setSalesModel}>
                    <SelectTrigger data-testid="select-sales-model">
                      <SelectValue placeholder="Select sales model…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dealer_buys_resells">Dealer buys and resells</SelectItem>
                      <SelectItem value="manufacturer_sells_commission">Manufacturer sells directly — dealer receives commission</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">If the total amount exceeds certain project-dependent thresholds, the manufacturer may reserve the right not to guarantee the dealer buy-and-resell model.</p>
                </div>

                <div className="space-y-2">
                  <Label>Installation Responsibility</Label>
                  <Select value={installationResponsibility} onValueChange={setInstallationResponsibility}>
                    <SelectTrigger data-testid="select-installation">
                      <SelectValue placeholder="Select installation responsibility…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="installation_required">Installation required from manufacturer</SelectItem>
                      <SelectItem value="installation_by_dealer">Installation handled by dealer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    data-testid="textarea-installation-notes"
                    placeholder="Installation notes or special requirements…"
                    value={installationNotes}
                    onChange={e => setInstallationNotes(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Offer Urgency</Label>
                    <Select value={offerUrgency} onValueChange={setOfferUrgency}>
                      <SelectTrigger data-testid="select-offer-urgency">
                        <SelectValue placeholder="Select urgency…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Delivery Urgency</Label>
                    <Select value={deliveryUrgency} onValueChange={setDeliveryUrgency}>
                      <SelectTrigger data-testid="select-delivery-urgency">
                        <SelectValue placeholder="Select urgency…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Paint Supplier</Label>
                  <Select value={paintSupplierStatus} onValueChange={(v) => { setPaintSupplierStatus(v); if (v !== "defined") { setPaintSupplierName(""); setPaintSupplierContact(""); } }}>
                    <SelectTrigger data-testid="select-paint-supplier">
                      <SelectValue placeholder="Is the paint supplier defined?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_defined">Not defined yet</SelectItem>
                      <SelectItem value="defined">Defined</SelectItem>
                    </SelectContent>
                  </Select>
                  {paintSupplierStatus === "defined" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Supplier / Company Name</Label>
                        <Input
                          data-testid="input-paint-supplier-name"
                          placeholder="Company name…"
                          value={paintSupplierName}
                          onChange={e => setPaintSupplierName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Reference Contact Person</Label>
                        <Input
                          data-testid="input-paint-supplier-contact"
                          placeholder="Contact person…"
                          value={paintSupplierContact}
                          onChange={e => setPaintSupplierContact(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Additional Intermediaries / Referrers</Label>
                  <Select value={hasIntermediaries} onValueChange={(v) => { setHasIntermediaries(v); if (v !== "yes") setIntermediariesDetails(""); }}>
                    <SelectTrigger data-testid="select-intermediaries">
                      <SelectValue placeholder="Any intermediaries involved?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                  {hasIntermediaries === "yes" && (
                    <Textarea
                      data-testid="textarea-intermediaries-details"
                      placeholder="Describe the intermediaries or referrers involved…"
                      value={intermediariesDetails}
                      onChange={e => setIntermediariesDetails(e.target.value)}
                      rows={2}
                    />
                  )}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 1}
            data-testid="button-prev"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          {isLastStep ? (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              data-testid="button-submit"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
              Submit Request
            </Button>
          ) : (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
              data-testid="button-next"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </DealerLayout>
  );
}
