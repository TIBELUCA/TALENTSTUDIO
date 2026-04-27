import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";

import { apiRequest } from "@/lib/queryClient";
import { Loader2, Trash2, Plus, ChevronRight, ChevronLeft, Check, Eye, EyeOff, CornerDownLeft, Pencil, X, Package, GripVertical } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { CommentButton } from "@/components/CommentButton";
import { useToast } from "@/hooks/use-toast";

interface CartItem {
  tempId: string;
  machineId: number;
  quantity: number;
  selectedOptionIds: number[];
  optionQuantities: Record<number, number>;
  basePrice: number;
  optionPrices: Record<number, number>;
  comment: string;
  optionComments: Record<number, string>;
  optionPriceHidden: Record<number, boolean>;
  snapshotMachineName: string;
  snapshotOptionNames: Record<number, string>;
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
  standardVoltage: string;
  standardColors: string;
  components: string;
  precautions: string;
  airIntake: string;
  commissioning: string;
}

interface ExtraItem {
  id: string;
  description: string;
  price: number;
}

interface ServiceItems {
  travelCosts: boolean;
  boardLodging: boolean;
  trainingDays: string;
  trainingIncluded: boolean;
  packaging: boolean;
  transportPrice: number;
  transportIncluded: boolean;
}

const defaultServiceItems: ServiceItems = {
  travelCosts: true,
  boardLodging: true,
  trainingDays: "1",
  trainingIncluded: true,
  packaging: true,
  transportPrice: 0,
  transportIncluded: true,
};

const DEFAULT_PRICE_LABELS = {
  interlocking:    "Interlocking",
  totalListPrice:  "TOTAL LIST PRICE (ex works, installation excluded)",
  installation:    "Installation and start-up",
  travelCosts:     "Travel and flight costs",
  boardLodging:    "Board and lodging",
  training:        "Training",
  packaging:       "Packaging",
  transport:       "Transport",
  grossTotal:      "Gross Total",
  netTotal:        "NET TOTAL",
};

const defaultTechnicalSpecs: TechnicalSpecs = {
  minMaxLength: "", maxWidth: "", minMaxThickness: "", averageLineSpeed: "",
  controlSide: "", maxBow: "10 mm", paint: "", substrate: "", finishing: "",
  standardVoltage: "Working tension 400V/50 Hz. Commands 24V. Max. allowed oscillation +/- 5%",
  standardColors: "Light Grey RAL 7035",
  components: "Prices are based on the use of our standard mechanical (Bonfiglioli), electrical and electronic (Schneider Telemecanique) components. Requests for other manufactures equipment to be supplied instead of our standard components can be evaluated for performance, reliability and any extra costs that may be incurred",
  precautions: "Do not place near the machine substances which may cause danger of inflammability. User must foresee an adequate technical ventilation in the working environment in order to prevent any risk of inflammability. User must verify that the zone in which the machine or installation will be positioned is right for the purpose.",
  airIntake: "Air intake is always considered with environmental temperature above +4 °C; in case of air intake from the outside of the work environment or temperatures below +4 °C, the user will have to foresee motorized shutters or request additional antifreeze systems, so as to prevent damage to the installation",
  commissioning: "For single machines shipped when already assembled, commissioning and start-up are carried out at our premises. For disassembled machines or groups of machines, start-up will be carried out after commissioning."
};

export default function DealerCreateOffer() {
  const { id } = useParams<{ id: string }>();
  const sourceOfferId = parseInt(id || "0");
  const [, setLocation] = useLocation();

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: sourceOffer, isLoading: sourceLoading } = useQuery<any>({
    queryKey: ["/api/dealer/offers", sourceOfferId],
    queryFn: () => fetch(`/api/dealer/offers/${sourceOfferId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!sourceOfferId,
  });

  const { data: customers } = useQuery<any[]>({
    queryKey: ["/api/dealer/customers"],
    queryFn: () => fetch("/api/dealer/customers", { credentials: "include" }).then(r => r.json()),
  });

  const { data: presets } = useQuery<any[]>({
    queryKey: ["/api/dealer/presets"],
    queryFn: () => fetch("/api/dealer/presets", { credentials: "include" }).then(r => r.json()),
  });

  const { data: dealerFormatSettings } = useQuery<{ sections: any[]; pageBackground: string }>({
    queryKey: ["/api/dealer/settings/document-format"],
    queryFn: () => fetch("/api/dealer/settings/document-format", { credentials: "include" }).then(r => r.json()),
  });

  const formatSettings = dealerFormatSettings;

  const [customerId, setCustomerId] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState("");

  const { data: companyContacts = [] } = useQuery<any[]>({
    queryKey: ["/api/dealer/contacts", { companyId: customerId }],
    queryFn: () => fetch(`/api/dealer/contacts?companyId=${customerId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!customerId,
  });

  const SECTION_TO_STEP: Record<string, { id: string; defaultLabel: string; alwaysShow?: boolean }> = {
    metadata:         { id: "customer",    defaultLabel: "Customer Details",        alwaysShow: true },
    offer_title:      { id: "subject",     defaultLabel: "Project Data",            alwaysShow: true },
    technical_specs:  { id: "specs",       defaultLabel: "Technical Specifications" },
    machine_line:     { id: "composition", defaultLabel: "Machines and Options",    alwaysShow: true },
    price_overview:   { id: "pricing",     defaultLabel: "Price Overview" },
    terms_conditions: { id: "terms",       defaultLabel: "Terms & Conditions" },
  };

  const DETAILS_STEP = { id: "details", label: "Date & Parties", intro: "", sectionLabels: {} as Record<string,string> };

  const wizardSteps = useMemo(() => {
    const sections: any[] = formatSettings?.sections ?? [];
    const defaultSteps = [
      { id: "customer",    label: "Customer Details",         intro: "", sectionLabels: {} as Record<string,string> },
      DETAILS_STEP,
      { id: "subject",     label: "Project Data",             intro: "", sectionLabels: {} as Record<string,string> },
      { id: "specs",       label: "Technical Specifications", intro: "", sectionLabels: {} as Record<string,string> },
      { id: "composition", label: "Machines and Options",     intro: "", sectionLabels: {} as Record<string,string> },
      { id: "pricing",     label: "Price Overview",           intro: "", sectionLabels: {} as Record<string,string> },
      { id: "terms",       label: "Terms & Conditions",       intro: "", sectionLabels: {} as Record<string,string> },
    ];
    if (!sections.length) return [...defaultSteps, { id: "review", label: "Review & Submit", intro: "", sectionLabels: {} as Record<string,string> }];
    const steps: typeof defaultSteps = [];
    for (const sec of sections) {
      const def = SECTION_TO_STEP[sec.id];
      if (!def) continue;
      if (!sec.enabled && !def.alwaysShow) continue;
      steps.push({ id: def.id, label: def.defaultLabel, intro: sec.labels?.intro ?? "", sectionLabels: sec.labels ?? {} });
      if (def.id === "customer") steps.push(DETAILS_STEP);
    }
    const result = steps.length ? steps : defaultSteps;
    result.push({ id: "review", label: "Review & Submit", intro: "", sectionLabels: {} as Record<string,string> });
    return result;
  }, [formatSettings]);

  const [step, setStep] = useState(1);
  const currentStepDef = wizardSteps[step - 1] ?? wizardSteps[0];

  const [subject, setSubject] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [technicalSpecs, setTechnicalSpecs] = useState<TechnicalSpecs>(defaultTechnicalSpecs);
  const [projectData, setProjectData] = useState<any>({ selectedPresets: [] });
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [sectionOrder, setSectionOrder] = useState<string[]>([]);
  const [pageBreaks, setPageBreaks] = useState<string[]>(["price_overview", "terms_conditions"]);
  const [machineOrder, setMachineOrder] = useState<string[]>([]);
  const [machinePageBreaks, setMachinePageBreaks] = useState<string[]>([]);
  const [termsPageBreaks, setTermsPageBreaks] = useState<number[]>([]);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [serviceItems, setServiceItems] = useState<ServiceItems>(defaultServiceItems);
  const [interlockingPricePerPosition, setInterlockingPricePerPosition] = useState(500);
  const [installationConfig, setInstallationConfig] = useState({
    dailyFee: 850, totalDays: 0, totalPrice: 0, included: true,
    hideDailyFee: false, hideTotalDays: false, hideTotalPrice: false,
  });
  const [showDetailedPrices, setShowDetailedPrices] = useState(true);
  const [priceComments, setPriceComments] = useState({
    interlocking: '', installation: '', travel: '', boardLodging: '',
    training: '', packaging: '', transport: '', extras: {} as Record<string, string>,
  });
  const [priceLabels, setPriceLabels] = useState({ ...DEFAULT_PRICE_LABELS });
  const [headerDate, setHeaderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [headerSalesmanName, setHeaderSalesmanName] = useState("");
  const [headerSalesmanEmail, setHeaderSalesmanEmail] = useState("");
  const [headerSalesmanMobile, setHeaderSalesmanMobile] = useState("");
  const [headerCustomerName, setHeaderCustomerName] = useState("");
  const [headerCustomerContact, setHeaderCustomerContact] = useState("");
  const [headerCustomerEmail, setHeaderCustomerEmail] = useState("");
  const [headerCustomerAddress, setHeaderCustomerAddress] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [layout, setLayout] = useState("");
  const [family, setFamily] = useState("");
  const [sectionTextOverrides, setSectionTextOverrides] = useState<Record<string, { intro?: string }>>({});
  const [machineDescOverrides, setMachineDescOverrides] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const prefillApplied = useRef(false);
  const prefillContactName = useRef("");
  const prefillContactId = useRef("");

  useEffect(() => {
    if (prefillApplied.current || !sourceOffer) return;
    prefillApplied.current = true;

    const pd = sourceOffer.projectData ?? {};
    const pricing = pd.pricing ?? {};
    const headerInfo = pd.headerInfo ?? {};

    setSubject(sourceOffer.subject || "");
    setLayout(pd.layout || "");
    setFamily(pd.family || "");

    if (pd.technicalSpecs) setTechnicalSpecs({ ...defaultTechnicalSpecs, ...pd.technicalSpecs });
    if (pd.hiddenSections) setHiddenSections(pd.hiddenSections);
    if (pd.sectionOrder) setSectionOrder(pd.sectionOrder);
    if (pd.pageBreaks) setPageBreaks(pd.pageBreaks);
    if (pd.sectionTextOverrides) setSectionTextOverrides(pd.sectionTextOverrides);
    if (pd.machineDescOverrides) setMachineDescOverrides(pd.machineDescOverrides);

    if (pricing.extraItems) setExtraItems(pricing.extraItems);
    if (pricing.discountPercent != null) setDiscountPercent(pricing.discountPercent);
    if (pricing.serviceItems) setServiceItems(s => ({ ...s, ...pricing.serviceItems }));
    if (pricing.installationConfig) setInstallationConfig(ic => ({ ...ic, ...pricing.installationConfig }));
    if (pricing.interlockingPricePerPosition != null) setInterlockingPricePerPosition(pricing.interlockingPricePerPosition);
    if (pricing.priceComments) setPriceComments(pc => ({ ...pc, ...pricing.priceComments }));
    if (pricing.priceLabels) setPriceLabels(pl => ({ ...pl, ...pricing.priceLabels }));

    if (sourceOffer.items && sourceOffer.items.length > 0) {
      const cartItems: CartItem[] = sourceOffer.items.map((item: any, idx: number) => {
        const optionIds: number[] = (item.options ?? []).map((o: any) => o.machineOptionId);
        const optionPrices: Record<number, number> = {};
        const optionQuantities: Record<number, number> = {};
        const snapshotOptionNames: Record<number, string> = {};
        (item.options ?? []).forEach((o: any) => {
          const optId = o.machineOptionId;
          optionPrices[optId] = item.customOptionPrices?.[optId] ?? parseFloat(o.snapshotPriceModifier ?? "0");
          optionQuantities[optId] = o.quantity ?? 1;
          snapshotOptionNames[optId] = o.snapshotOptionName ?? `Option #${optId}`;
        });
        return {
          tempId: Math.random().toString(36),
          machineId: item.machineId,
          quantity: item.quantity,
          selectedOptionIds: optionIds,
          optionQuantities,
          basePrice: parseFloat(item.customBasePrice?.toString() ?? item.snapshotBasePrice?.toString() ?? item.basePrice?.toString() ?? "0"),
          optionPrices,
          comment: pricing.itemComments?.[idx]?.machineComment ?? "",
          optionComments: pricing.itemComments?.[idx]?.optionComments ?? {},
          optionPriceHidden: pricing.itemComments?.[idx]?.optionPriceHidden ?? {},
          snapshotMachineName: item.snapshotMachineName ?? `Machine #${item.machineId}`,
          snapshotOptionNames,
        };
      });
      setCart(cartItems);
    }

    const dealerUser = user as any;
    setHeaderSalesmanName(`${dealerUser?.name || ""} ${dealerUser?.surname || ""}`.trim());
    setHeaderSalesmanEmail(dealerUser?.email || "");

    const commercial = pd.commercial ?? {};
    const endCustId = commercial.endCustomerId;
    if (endCustId) {
      setCustomerId(endCustId.toString());
    } else if (sourceOffer.customerId) {
      setCustomerId(sourceOffer.customerId.toString());
    }

    const contactPersonName =
      headerInfo.customer?.contactPerson ||
      sourceOffer.customer?.contactPerson ||
      "";
    const customerEmail =
      headerInfo.customer?.email ||
      sourceOffer.customer?.email ||
      "";
    const customerAddress =
      headerInfo.customer?.address ||
      sourceOffer.customer?.address ||
      "";
    const customerName =
      headerInfo.customer?.name ||
      sourceOffer.customer?.companyName ||
      sourceOffer.customer?.name ||
      "";

    if (customerName) setHeaderCustomerName(customerName);
    if (contactPersonName) setHeaderCustomerContact(contactPersonName);
    if (customerEmail) setHeaderCustomerEmail(customerEmail);
    if (customerAddress) setHeaderCustomerAddress(customerAddress);

    prefillContactName.current = contactPersonName;

    const storedContactId =
      commercial.endCustomerContactId ||
      headerInfo.customer?.contactId ||
      "";
    if (storedContactId) {
      prefillContactId.current = storedContactId.toString();
    }
  }, [sourceOffer, user]);

  useEffect(() => {
    if (!customerId || !customers) return;
    const c = customers.find((c: any) => c.id.toString() === customerId);
    if (c) {
      setHeaderCustomerName(c.companyName || c.name || "");
      setHeaderCustomerAddress((c as any).address || "");
    }
  }, [customerId, customers]);

  const contactAutoMatched = useRef(false);
  useEffect(() => {
    if (contactAutoMatched.current || !companyContacts.length) return;
    contactAutoMatched.current = true;

    if (prefillContactId.current) {
      const idMatch = companyContacts.find((ct: any) => ct.id.toString() === prefillContactId.current);
      if (idMatch) {
        setSelectedContactId(idMatch.id.toString());
        return;
      }
    }

    const targetName = prefillContactName.current || headerCustomerContact;
    if (targetName) {
      const normalised = targetName.toLowerCase().trim();
      const match = companyContacts.find((ct: any) => {
        const full = `${ct.firstName || ""} ${ct.lastName || ""}`.trim().toLowerCase();
        const reversed = `${ct.lastName || ""} ${ct.firstName || ""}`.trim().toLowerCase();
        return full === normalised || reversed === normalised ||
               full.includes(normalised) || normalised.includes(full);
      });
      if (match) {
        setSelectedContactId(match.id.toString());
        return;
      }
    }

    if (companyContacts.length === 1) {
      setSelectedContactId(companyContacts[0].id.toString());
    }
  }, [companyContacts, headerCustomerContact]);

  useEffect(() => {
    if (!selectedContactId || companyContacts.length === 0) return;
    const contact = companyContacts.find((c: any) => c.id.toString() === selectedContactId);
    if (contact) {
      setHeaderCustomerContact(`${contact.firstName || ""} ${contact.lastName || ""}`.trim());
      setHeaderCustomerEmail(contact.email || "");
    }
  }, [selectedContactId, companyContacts]);

  const getItemOptionsTotal = (item: CartItem) =>
    item.selectedOptionIds.reduce((sum, optId) => sum + (item.optionPrices[optId] ?? 0) * (item.optionQuantities?.[optId] ?? 1), 0);

  const calculateMachinesTotal = () => cart.reduce((acc, item) => acc + ((item.basePrice + getItemOptionsTotal(item)) * item.quantity), 0);
  const calculateInterlocking = () => cart.length * interlockingPricePerPosition;
  const calculateExtrasTotal = () => extraItems.reduce((acc, item) => acc + item.price, 0);
  const calculateServicesTotal = () => {
    const instAmount = installationConfig.included ? installationConfig.totalPrice : 0;
    const transportAmount = serviceItems.transportIncluded ? serviceItems.transportPrice : 0;
    return instAmount + transportAmount;
  };
  const calculateTotalListPrice = () => calculateMachinesTotal() + calculateInterlocking() + calculateExtrasTotal();
  const calculateGrossTotal = () => calculateMachinesTotal() + calculateInterlocking() + calculateExtrasTotal() + calculateServicesTotal();
  const calculateDiscount = () => (calculateMachinesTotal() + calculateInterlocking() + calculateExtrasTotal()) * discountPercent / 100;
  const calculateNetTotal = () => calculateGrossTotal() - calculateDiscount();
  const calculateTotal = () => discountPercent > 0 ? calculateNetTotal() : calculateGrossTotal();

  const addExtraItem = () => setExtraItems([...extraItems, { id: Math.random().toString(36), description: "", price: 0 }]);
  const updateExtraItem = (id: string, field: "description" | "price", value: string | number) =>
    setExtraItems(extraItems.map(item => item.id === id ? { ...item, [field]: value } : item));
  const removeExtraItem = (id: string) => setExtraItems(extraItems.filter(item => item.id !== id));

  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const pdfDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPdfBlobUrl = useRef<string | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);

  const buildPreviewPayload = () => {
    const salesmanName = headerSalesmanName || `${(user as any)?.name || ""} ${(user as any)?.surname || ""}`.trim() || "Dealer";
    const orderedCart = machineOrder.length > 0
      ? machineOrder.map(tid => cart.find(c => c.tempId === tid)).filter(Boolean) as typeof cart
      : cart;
    return {
      offer: {
        customerId: customerId ? parseInt(customerId) : null,
        subject,
        salesmanName,
        totalPrice: calculateTotal().toString(),
        status: "Draft",
        projectData: {
          ...projectData,
          presentationMode: "dealer",
          hiddenSections,
          sectionOrder,
          pageBreaks,
          machineBreakPositions: machinePageBreaks.map(tid => orderedCart.findIndex(c => c.tempId === tid)).filter(i => i > 0),
          termsBreakPositions: termsPageBreaks,
          layout,
          family,
          sectionTextOverrides,
          machineDescOverrides,
          headerInfo: {
            date: headerDate,
            salesman: { name: headerSalesmanName, email: headerSalesmanEmail, mobile: headerSalesmanMobile },
            customer: { name: headerCustomerName, contactPerson: headerCustomerContact, email: headerCustomerEmail, address: headerCustomerAddress },
          },
          technicalSpecs,
          pricing: {
            extraItems,
            discountPercent,
            serviceItems: { ...serviceItems, installationPrice: installationConfig.included ? installationConfig.totalPrice : 0 },
            installationConfig,
            interlockingPricePerPosition,
            interlockingTotal: calculateInterlocking(),
            totalListPrice: calculateTotalListPrice(),
            grossTotal: calculateGrossTotal(),
            discountAmount: calculateDiscount(),
            netTotal: calculateNetTotal(),
            itemComments: cart.map(item => ({
              machineComment: item.comment,
              optionComments: item.optionComments,
              optionPriceHidden: item.optionPriceHidden,
            })),
            priceComments,
            priceLabels,
          },
        },
      },
      items: orderedCart.map(item => ({
        machineId: item.machineId,
        quantity: item.quantity,
        optionIds: item.selectedOptionIds,
        optionQuantities: item.optionQuantities,
        customBasePrice: item.basePrice,
        customOptionPrices: item.optionPrices,
      })),
    };
  };

  const generatePreviewPdf = async () => {
    setIsPdfGenerating(true);
    try {
      const payload = buildPreviewPayload();
      const res = await fetch(`/api/dealer/offers/${sourceOfferId}/dealer-preview-pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Preview failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (prevPdfBlobUrl.current) URL.revokeObjectURL(prevPdfBlobUrl.current);
      prevPdfBlobUrl.current = url;
      setPdfBlobUrl(url);
    } catch {
    } finally {
      setIsPdfGenerating(false);
    }
  };

  useEffect(() => {
    const currentId = wizardSteps[step - 1]?.id;
    if (currentId !== "review") return;
    if (pdfDebounceRef.current) clearTimeout(pdfDebounceRef.current);
    pdfDebounceRef.current = setTimeout(() => generatePreviewPdf(), 600);
    return () => { if (pdfDebounceRef.current) clearTimeout(pdfDebounceRef.current); };
  }, [step, sectionOrder, hiddenSections, pageBreaks, machinePageBreaks]);

  const handleSubmit = async () => {
    if (!customerId || !subject || cart.length === 0) return;
    setIsSubmitting(true);

    const orderedCart = machineOrder.length > 0
      ? machineOrder.map(tid => cart.find(c => c.tempId === tid)).filter(Boolean) as typeof cart
      : cart;

    const payload = {
      customerId: parseInt(customerId),
      subject,
      totalPrice: calculateTotal().toString(),
      projectData: {
        ...projectData,
        presentationMode: "dealer",
        hiddenSections,
        sectionOrder,
        pageBreaks,
        machineBreakPositions: machinePageBreaks.map(tid => orderedCart.findIndex(c => c.tempId === tid)).filter(i => i > 0),
        termsBreakPositions: termsPageBreaks,
        layout,
        family,
        sectionTextOverrides,
        machineDescOverrides,
        headerInfo: {
          date: headerDate,
          salesman: { name: headerSalesmanName, email: headerSalesmanEmail, mobile: headerSalesmanMobile },
          customer: { name: headerCustomerName, contactPerson: headerCustomerContact, email: headerCustomerEmail, address: headerCustomerAddress },
        },
        technicalSpecs,
        pricing: {
          extraItems,
          discountPercent,
          serviceItems: { ...serviceItems, installationPrice: installationConfig.included ? installationConfig.totalPrice : 0 },
          installationConfig,
          interlockingPricePerPosition,
          interlockingTotal: calculateInterlocking(),
          totalListPrice: calculateTotalListPrice(),
          grossTotal: calculateGrossTotal(),
          discountAmount: calculateDiscount(),
          netTotal: calculateNetTotal(),
          itemComments: cart.map(item => ({
            machineComment: item.comment,
            optionComments: item.optionComments,
            optionPriceHidden: item.optionPriceHidden,
          })),
          priceComments,
          priceLabels,
        },
      },
      items: orderedCart.map(item => ({
        machineId: item.machineId,
        quantity: item.quantity,
        optionIds: item.selectedOptionIds,
        optionQuantities: item.optionQuantities,
        customBasePrice: item.basePrice,
        customOptionPrices: item.optionPrices,
      })),
    };

    try {
      const res = await apiRequest("POST", `/api/dealer/offers/${sourceOfferId}/create-dealer-version`, payload);
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/offers"] });
      toast({ title: "Dealer offer created", description: `Reference: ${data.referenceNumber}` });
      setLocation(`/dealer/offers/${data.offerId}`);
    } catch (err: any) {
      toast({ title: "Failed to create offer", description: err?.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateSpec = (field: keyof TechnicalSpecs, value: string) => setTechnicalSpecs(prev => ({ ...prev, [field]: value }));

  const techSpecSection = formatSettings?.sections?.find((s: any) => s.id === "technical_specs");
  const tsLbl = (key: string, fallback: string) => (techSpecSection?.labels?.[key] as string) || fallback;

  if (sourceLoading) {
    return (
      <DealerLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DealerLayout>
    );
  }

  if (!sourceOffer) {
    return (
      <DealerLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Package className="w-12 h-12 text-muted-foreground" />
          <p className="text-lg text-muted-foreground">Source offer not found</p>
          <Button onClick={() => window.history.back()} data-testid="button-back-offers">Back to Offers</Button>
        </div>
      </DealerLayout>
    );
  }

  return (
    <DealerLayout>
      <div className="max-w-6xl mx-auto space-y-8 pb-20">
        <PageHeader title="Create Dealer Offer" />
        <div>
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm rounded-md px-3 py-1.5" data-testid="banner-source-offer">
            <Package className="w-4 h-4 shrink-0" />
            <span>Based on supplier offer <strong>{sourceOffer.referenceNumber}</strong> — {sourceOffer.subject}</span>
          </div>
          <div className="flex items-center gap-1 mt-4 text-sm font-medium flex-wrap">
            {wizardSteps.map(({ id, label }, i) => {
              const n = i + 1;
              const canJump = n <= step || n === 1;
              return (
                <span key={id} className="flex items-center">
                  {i > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mx-0.5" />}
                  <button
                    type="button"
                    onClick={() => canJump && setStep(n)}
                    className={cn(
                      "transition-colors rounded px-1",
                      step === n ? "text-primary font-bold" : n < step ? "text-primary/70 hover:text-primary cursor-pointer" : "text-muted-foreground/40 cursor-default"
                    )}
                    disabled={!canJump}
                  >
                    {n}. {label}
                  </button>
                </span>
              );
            })}
          </div>
        </div>

        <Card className="border-border shadow-md">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-6 pb-4 border-b">
              <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 1} data-testid="button-back-top">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <span className="text-sm text-muted-foreground font-medium">{step} / {wizardSteps.length}</span>
              {step < wizardSteps.length ? (
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={
                    (currentStepDef?.id === "customer" && !customerId) ||
                    (currentStepDef?.id === "composition" && cart.length === 0)
                  }
                  data-testid="button-next-top"
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={!subject || !customerId || cart.length === 0 || isSubmitting}
                  className="bg-primary hover:bg-primary/90"
                  data-testid="button-create-top"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                  Create Dealer Offer
                </Button>
              )}
            </div>

            {currentStepDef?.intro && (
              <p className="text-sm text-muted-foreground italic mb-4 border-l-2 border-primary/30 pl-3">{currentStepDef.intro}</p>
            )}

            <AnimatePresence mode="wait">
              {currentStepDef?.id === "customer" && (
                <motion.div key="customer" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <div className="space-y-2">
                    <Label>Search Customer (from your CRM)</Label>
                    <div className="relative">
                      <Input
                        placeholder="Type company name..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        data-testid="input-dealer-customer-search"
                      />
                      {customerSearch.trim().length > 0 && (() => {
                        const q = customerSearch.toLowerCase();
                        const matches = (customers ?? []).filter((c: any) =>
                          (c.companyName || c.name || "").toLowerCase().includes(q)
                        );
                        if (matches.length === 0) return (
                          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md p-3 text-sm text-muted-foreground">
                            No customers found in your CRM
                          </div>
                        );
                        return (
                          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md max-h-56 overflow-y-auto" data-testid="dealer-customer-search-results">
                            {matches.map((c: any) => (
                              <button
                                key={c.id}
                                type="button"
                                className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b last:border-b-0"
                                onClick={() => {
                                  setCustomerId(c.id.toString());
                                  setHeaderCustomerName(c.companyName || c.name || "");
                                  setHeaderCustomerAddress(c.address || "");
                                  setSelectedContactId("");
                                  setHeaderCustomerContact("");
                                  setHeaderCustomerEmail("");
                                  setCustomerSearch("");
                                }}
                              >
                                <p className="font-medium text-sm">{c.companyName || c.name}</p>
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {customerId && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                      <Check className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="text-sm font-medium text-green-800">
                        {customers?.find((c: any) => c.id.toString() === customerId)?.companyName || customers?.find((c: any) => c.id.toString() === customerId)?.name}
                      </span>
                      <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setCustomerId("")} data-testid="btn-clear-dealer-customer">
                        Change
                      </button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Or pick from list</Label>
                    <Select value={customerId} onValueChange={setCustomerId}>
                      <SelectTrigger className="h-10" data-testid="select-dealer-customer">
                        <SelectValue placeholder="Choose a customer..." />
                      </SelectTrigger>
                      <SelectContent>
                        {customers?.map((c: any) => (
                          <SelectItem key={c.id} value={c.id.toString()}>
                            {c.companyName || c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Don't see the customer? <span className="text-primary cursor-pointer hover:underline" onClick={() => setLocation("/dealer/customers")}>Add new customer</span>
                    </p>
                  </div>

                  {customerId && companyContacts.length > 0 && (
                    <div className="space-y-2">
                      <Label>Contact Person</Label>
                      <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                        <SelectTrigger data-testid="select-dealer-contact">
                          <SelectValue placeholder="Select a contact..." />
                        </SelectTrigger>
                        <SelectContent>
                          {companyContacts.map((ct: any) => (
                            <SelectItem key={ct.id} value={ct.id.toString()}>
                              {ct.firstName} {ct.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </motion.div>
              )}

              {currentStepDef?.id === "details" && (
                <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <h3 className="font-semibold text-lg border-b pb-2">Date &amp; Parties</h3>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</Label>
                    <Input type="date" value={headerDate} onChange={(e) => setHeaderDate(e.target.value)} data-testid="input-dealer-header-date" />
                  </div>
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Details (shown as salesman)</Label>
                    <div className="grid md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Name</Label>
                        <Input value={headerSalesmanName} onChange={(e) => setHeaderSalesmanName(e.target.value)} placeholder="Your name" data-testid="input-dealer-salesman-name" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Email</Label>
                        <Input value={headerSalesmanEmail} onChange={(e) => setHeaderSalesmanEmail(e.target.value)} placeholder="email@company.com" data-testid="input-dealer-salesman-email" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Mobile</Label>
                        <Input value={headerSalesmanMobile} onChange={(e) => setHeaderSalesmanMobile(e.target.value)} placeholder="+39 ..." data-testid="input-dealer-salesman-mobile" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</Label>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Company Name</Label>
                        <Input value={headerCustomerName} onChange={(e) => setHeaderCustomerName(e.target.value)} placeholder="Company name" data-testid="input-dealer-customer-name" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Contact Person</Label>
                        <Input value={headerCustomerContact} onChange={(e) => setHeaderCustomerContact(e.target.value)} placeholder="Contact person" data-testid="input-dealer-customer-contact" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Email</Label>
                        <Input value={headerCustomerEmail} onChange={(e) => setHeaderCustomerEmail(e.target.value)} placeholder="customer@email.com" data-testid="input-dealer-customer-email" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Address</Label>
                        <Input value={headerCustomerAddress} onChange={(e) => setHeaderCustomerAddress(e.target.value)} placeholder="Address" data-testid="input-dealer-customer-address" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "subject" && (
                <motion.div key="subject" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <h3 className="font-semibold text-lg border-b pb-2">{currentStepDef.label}</h3>
                  <div className="space-y-2">
                    <Label>Subject / Offer Title</Label>
                    <Input placeholder="e.g. Production Line Upgrade for Factory A" value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="input-dealer-subject" />
                  </div>
                  <div className="space-y-2">
                    <Label>Layout</Label>
                    <Input placeholder="e.g. 3" value={layout} onChange={(e) => setLayout(e.target.value)} data-testid="input-dealer-layout" />
                  </div>
                  <div className="space-y-2">
                    <Label>Product Family</Label>
                    <Select value={family} onValueChange={setFamily}>
                      <SelectTrigger data-testid="select-dealer-family">
                        <SelectValue placeholder="Select a machine family..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rullo">Rullo</SelectItem>
                        <SelectItem value="spruzzatrici">Spruzzatrici</SelectItem>
                        <SelectItem value="robot">Robot</SelectItem>
                        <SelectItem value="profilo">Profilo</SelectItem>
                        <SelectItem value="velo">Velo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "specs" && (
                <motion.div key="specs" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <h3 className="font-semibold text-lg border-b pb-2">{currentStepDef.label}</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>{tsLbl("minMaxLength", "Min/Max. length (mm)")}</Label><Input value={technicalSpecs.minMaxLength} onChange={(e) => updateSpec("minMaxLength", e.target.value)} data-testid="input-dealer-min-max-length" /></div>
                    <div className="space-y-2"><Label>{tsLbl("maxWidth", "Max. width (mm)")}</Label><Input value={technicalSpecs.maxWidth} onChange={(e) => updateSpec("maxWidth", e.target.value)} data-testid="input-dealer-max-width" /></div>
                    <div className="space-y-2"><Label>{tsLbl("minMaxThickness", "Min/Max. thickness (mm)")}</Label><Input value={technicalSpecs.minMaxThickness} onChange={(e) => updateSpec("minMaxThickness", e.target.value)} data-testid="input-dealer-thickness" /></div>
                    <div className="space-y-2"><Label>{tsLbl("averageLineSpeed", "Average line speed (mt/min)")}</Label><Input value={technicalSpecs.averageLineSpeed} onChange={(e) => updateSpec("averageLineSpeed", e.target.value)} data-testid="input-dealer-line-speed" /></div>
                    <div className="space-y-2"><Label>{tsLbl("controlSide", "Control side")}</Label><Input value={technicalSpecs.controlSide} onChange={(e) => updateSpec("controlSide", e.target.value)} data-testid="input-dealer-control-side" /></div>
                    <div className="space-y-2"><Label>{tsLbl("maxBow", "Max. bow of the panel")}</Label><Input value={technicalSpecs.maxBow} onChange={(e) => updateSpec("maxBow", e.target.value)} data-testid="input-dealer-max-bow" /></div>
                    <div className="space-y-2"><Label>{tsLbl("paint", "Paint")}</Label><Input value={technicalSpecs.paint} onChange={(e) => updateSpec("paint", e.target.value)} data-testid="input-dealer-paint" /></div>
                    <div className="space-y-2"><Label>{tsLbl("substrate", "Substrate")}</Label><Input value={technicalSpecs.substrate} onChange={(e) => updateSpec("substrate", e.target.value)} data-testid="input-dealer-substrate" /></div>
                    <div className="space-y-2"><Label>{tsLbl("finishing", "Finishing")}</Label><Input value={technicalSpecs.finishing} onChange={(e) => updateSpec("finishing", e.target.value)} data-testid="input-dealer-finishing" /></div>
                  </div>
                  <h3 className="font-semibold text-lg border-b pb-2 mt-8">Standard Specifications</h3>
                  <div className="space-y-4">
                    <div className="space-y-2"><Label>{tsLbl("standardVoltage", "Standard voltage")}</Label><Input value={technicalSpecs.standardVoltage} onChange={(e) => updateSpec("standardVoltage", e.target.value)} data-testid="input-dealer-voltage" /></div>
                    <div className="space-y-2"><Label>{tsLbl("standardColors", "Standard colors")}</Label><Input value={technicalSpecs.standardColors} onChange={(e) => updateSpec("standardColors", e.target.value)} data-testid="input-dealer-colors" /></div>
                    <div className="space-y-2"><Label>{tsLbl("components", "Components")}</Label><textarea className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring" value={technicalSpecs.components} onChange={(e) => updateSpec("components", e.target.value)} data-testid="input-dealer-components" /></div>
                    <div className="space-y-2"><Label>{tsLbl("precautions", "Precautions")}</Label><textarea className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring" value={technicalSpecs.precautions} onChange={(e) => updateSpec("precautions", e.target.value)} data-testid="input-dealer-precautions" /></div>
                    <div className="space-y-2"><Label>{tsLbl("commissioning", "Commissioning and start-up")}</Label><textarea className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring" value={technicalSpecs.commissioning} onChange={(e) => updateSpec("commissioning", e.target.value)} data-testid="input-dealer-commissioning" /></div>
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "composition" && (
                <motion.div key="composition" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md mb-4">
                    <Package className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="text-sm text-blue-800">Machines and options are carried over from the supplier offer. You can adjust prices below.</span>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg">Machine Line</h3>
                    {cart.length === 0 ? (
                      <div className="h-32 flex items-center justify-center border-2 border-dashed border-muted-foreground/20 rounded-xl text-muted-foreground text-sm">
                        No machines in source offer.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {cart.map((item, index) => {
                          const totalItemPrice = (item.basePrice + getItemOptionsTotal(item)) * item.quantity;
                          return (
                            <div key={item.tempId} className="p-4 bg-card border rounded-lg shadow-sm" data-testid={`dealer-cart-item-${index}`}>
                              <div className="flex items-center gap-2 mb-3">
                                <span className="font-bold text-primary shrink-0">Pos. {index + 1}</span>
                                <span className="font-medium flex-1 truncate">{item.snapshotMachineName}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Label className="text-xs text-muted-foreground">Qty</Label>
                                  <span className="text-sm font-medium bg-muted px-2 py-0.5 rounded">{item.quantity}</span>
                                  <span className="font-mono font-semibold text-sm">€{totalItemPrice.toLocaleString()}</span>
                                </div>
                              </div>
                              <div className="ml-8 mb-2">
                                <span className="text-xs font-mono text-muted-foreground">Base price: €{item.basePrice.toLocaleString()}</span>
                              </div>
                              {item.selectedOptionIds.length > 0 && (
                                <div className="ml-8 space-y-1">
                                  {item.selectedOptionIds.map(optId => {
                                    const optName = item.snapshotOptionNames[optId] ?? `Option #${optId}`;
                                    const optQty = item.optionQuantities?.[optId] ?? 1;
                                    return (
                                      <div key={optId} className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Check className="w-3 h-3 text-green-600 shrink-0" />
                                        <span className="flex-1">{optName}{optQty > 1 ? ` ×${optQty}` : ""}</span>
                                        <span className="font-mono">€{((item.optionPrices[optId] ?? 0) * optQty).toLocaleString()}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="border-t pt-4 flex justify-between items-center font-bold text-lg">
                          <span>Total</span>
                          <span>€{calculateTotal().toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "pricing" && (
                <motion.div key="pricing" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="font-semibold text-lg">{currentStepDef?.label ?? "Price Overview"}</h3>
                    <button
                      type="button"
                      onClick={() => setShowDetailedPrices(!showDetailedPrices)}
                      className={cn("text-xs font-medium px-3 py-1 rounded-full border transition-colors", showDetailedPrices ? "bg-muted text-foreground border-border" : "bg-primary/10 text-primary border-primary/30")}
                      data-testid="dealer-toggle-detailed-prices"
                    >
                      {showDetailedPrices ? "Hide Individual Prices" : "Show Individual Prices"}
                    </button>
                  </div>

                  <div className="space-y-2">
                    {cart.map((item, index) => {
                      const itemTotal = (item.basePrice + getItemOptionsTotal(item)) * item.quantity;
                      const hiddenSum = item.selectedOptionIds.reduce((s, id) => item.optionPriceHidden?.[id] ? s + (item.optionPrices[id] ?? 0) * (item.optionQuantities?.[id] ?? 1) : s, 0);
                      const displayedUnit = item.basePrice + hiddenSum;
                      const hiddenNames = item.selectedOptionIds.filter(id => item.optionPriceHidden?.[id]).map(id => item.snapshotOptionNames?.[id] ?? `Option #${id}`);
                      return (
                        <div key={item.tempId} className="border rounded-lg p-3 space-y-1.5">
                          <div className={cn("items-center", showDetailedPrices ? "grid grid-cols-[1fr_auto_auto] gap-x-2" : "flex justify-between")}>
                            <span className="font-medium text-sm">Pos. {index + 1}: {item.snapshotMachineName} ×{item.quantity}</span>
                            {showDetailedPrices ? (
                              <>
                                <Input
                                  type="number"
                                  value={displayedUnit || ""}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    const newBase = val - hiddenSum;
                                    setCart(cart.map(ci => ci.tempId === item.tempId ? { ...ci, basePrice: newBase } : ci));
                                  }}
                                  className="w-28 h-7 text-xs font-mono text-right"
                                  title={hiddenSum > 0 ? `Include opzioni nascoste (+€${hiddenSum.toLocaleString()}): ${hiddenNames.join(", ")}` : undefined}
                                  data-testid={`input-dealer-machine-price-${index}`}
                                />
                                <CommentButton
                                  comment={item.comment}
                                  onChange={(v) => setCart(cart.map(ci => ci.tempId === item.tempId ? { ...ci, comment: v } : ci))}
                                  data-testid={`dealer-comment-machine-${index}`}
                                />
                              </>
                            ) : (
                              <span className="font-mono font-medium">€{itemTotal.toLocaleString()}</span>
                            )}
                          </div>
                          {showDetailedPrices && item.selectedOptionIds.map(optId => {
                            const optName = item.snapshotOptionNames[optId] ?? `Option #${optId}`;
                            const isHidden = !!item.optionPriceHidden?.[optId];
                            const toggleHidden = () => setCart(cart.map(ci => ci.tempId === item.tempId
                              ? { ...ci, optionPriceHidden: { ...ci.optionPriceHidden, [optId]: !isHidden } }
                              : ci));
                            const optQty = item.optionQuantities?.[optId] ?? 1;
                            return (
                              <div key={optId} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center pl-4">
                                <span className="text-xs text-muted-foreground">+ {optName}{optQty > 1 ? ` ×${optQty}` : ""}</span>
                                <div className="flex items-center gap-1 shrink-0 w-28 justify-end">
                                  {isHidden ? (
                                    <span className="text-xs text-muted-foreground font-mono italic">incl.</span>
                                  ) : (
                                    <Input
                                      type="number"
                                      value={item.optionPrices[optId] ?? ""}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setCart(cart.map(ci => ci.tempId === item.tempId
                                          ? { ...ci, optionPrices: { ...ci.optionPrices, [optId]: val } }
                                          : ci));
                                      }}
                                      className="w-28 h-7 text-xs font-mono text-right"
                                      data-testid={`input-dealer-option-price-${index}-${optId}`}
                                    />
                                  )}
                                </div>
                                <CommentButton
                                  comment={item.optionComments[optId] ?? ""}
                                  onChange={(v) => setCart(cart.map(ci => ci.tempId === item.tempId
                                    ? { ...ci, optionComments: { ...ci.optionComments, [optId]: v } }
                                    : ci))}
                                  data-testid={`dealer-comment-option-${index}-${optId}`}
                                />
                                <button type="button" onClick={toggleHidden} className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title={isHidden ? "Show price" : "Hide price"} data-testid={`dealer-toggle-option-${index}-${optId}`}>
                                  {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            );
                          })}
                          {showDetailedPrices && (
                            <div className="flex justify-between items-center text-sm font-medium pt-1 border-t mt-1">
                              <span>Subtotal</span>
                              <span className="font-mono">€{itemTotal.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-3">
                    <Input value={priceLabels.interlocking} onChange={(e) => setPriceLabels(prev => ({ ...prev, interlocking: e.target.value }))} className="h-7 text-sm font-medium flex-1" data-testid="dealer-label-interlocking" />
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>(</span>
                      <Input type="number" value={interlockingPricePerPosition || ""} onChange={(e) => setInterlockingPricePerPosition(parseFloat(e.target.value) || 0)} className="w-20 h-7 text-xs font-mono" data-testid="dealer-input-interlocking-price" />
                      <span>× {cart.length} pos.)</span>
                    </div>
                    <span className="font-mono font-medium ml-auto">€{calculateInterlocking().toLocaleString()}</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="font-medium text-sm text-muted-foreground">Extra Items</h4>
                      <Button size="sm" variant="outline" onClick={addExtraItem} data-testid="dealer-button-add-extra"><Plus className="w-3 h-3 mr-1" /> Add Extra</Button>
                    </div>
                    {extraItems.map((extra, index) => (
                      <div key={extra.id} className="flex gap-3 items-center">
                        <Input placeholder="Description" value={extra.description} onChange={(e) => updateExtraItem(extra.id, "description", e.target.value)} className="flex-1" data-testid={`dealer-input-extra-desc-${index}`} />
                        <div className="flex items-center gap-1">
                          <span>€</span>
                          <Input type="number" placeholder="0" value={extra.price || ""} onChange={(e) => updateExtraItem(extra.id, "price", parseFloat(e.target.value) || 0)} className="w-28" data-testid={`dealer-input-extra-price-${index}`} />
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => removeExtraItem(extra.id)} data-testid={`dealer-button-remove-extra-${index}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    ))}
                  </div>

                  <div className="border-2 border-primary/30 rounded-lg p-3 bg-primary/5">
                    <div className="flex items-center gap-3">
                      <Input value={priceLabels.totalListPrice} onChange={(e) => setPriceLabels(prev => ({ ...prev, totalListPrice: e.target.value }))} className="h-7 text-sm font-bold flex-1" data-testid="dealer-label-total-list-price" />
                      <span className="font-mono font-bold shrink-0">€{calculateTotalListPrice().toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="border rounded-lg p-3 bg-muted/30">
                    <div className="flex justify-between items-center gap-4">
                      <span className="font-medium">Discount (%)</span>
                      <div className="flex items-center gap-2">
                        <Input type="number" min="0" max="100" value={discountPercent || ""} onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)} className="w-24" data-testid="dealer-input-discount" />
                        <span className="text-muted-foreground">%</span>
                      </div>
                    </div>
                    {discountPercent > 0 && (
                      <div className="flex justify-between items-center text-sm mt-2 text-destructive">
                        <span>Discount Amount</span>
                        <span className="font-mono">-€{calculateDiscount().toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground">Services</h4>
                    <div className="border rounded-lg p-3 space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Input value={priceLabels.installation} onChange={(e) => setPriceLabels(prev => ({ ...prev, installation: e.target.value }))} className="h-7 text-sm font-medium flex-1" data-testid="dealer-label-installation" />
                          <button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, included: !prev.included }))} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", installationConfig.included ? "bg-green-100 text-green-700 border-green-300" : "bg-red-100 text-red-700 border-red-300")} data-testid="dealer-toggle-installation">
                            {installationConfig.included ? "INCLUDED" : "EXCLUDED"}
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Daily fee</span>
                            <div className="flex items-center gap-1"><Input type="number" value={installationConfig.dailyFee || ""} onChange={(e) => { const dailyFee = parseFloat(e.target.value) || 0; setInstallationConfig(prev => ({ ...prev, dailyFee, totalPrice: dailyFee * prev.totalDays })); }} className="flex-1 h-7 text-xs font-mono" data-testid="dealer-input-daily-fee" /><span className="text-xs text-muted-foreground shrink-0">€/day</span></div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Days</span>
                            <div className="flex items-center gap-1"><Input type="number" value={installationConfig.totalDays || ""} onChange={(e) => { const totalDays = parseFloat(e.target.value) || 0; setInstallationConfig(prev => ({ ...prev, totalDays, totalPrice: prev.dailyFee * totalDays })); }} className="flex-1 h-7 text-xs font-mono" data-testid="dealer-input-install-days" /><span className="text-xs text-muted-foreground shrink-0">days</span></div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Total</span>
                            <div className="flex items-center gap-1"><span className="text-xs text-muted-foreground shrink-0">€</span><Input type="number" value={installationConfig.totalPrice || ""} onChange={(e) => setInstallationConfig(prev => ({ ...prev, totalPrice: parseFloat(e.target.value) || 0 }))} className="flex-1 h-7 text-xs font-mono" data-testid="dealer-input-install-total" /></div>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <Input value={priceLabels.travelCosts} onChange={(e) => setPriceLabels(prev => ({ ...prev, travelCosts: e.target.value }))} className="h-7 text-sm flex-1" />
                        <button type="button" onClick={() => setServiceItems({...serviceItems, travelCosts: !serviceItems.travelCosts})} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.travelCosts ? "bg-green-100 text-green-700 border-green-300" : "bg-red-100 text-red-700 border-red-300")} data-testid="dealer-toggle-travel">{serviceItems.travelCosts ? "INCLUDED" : "EXCLUDED"}</button>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <Input value={priceLabels.boardLodging} onChange={(e) => setPriceLabels(prev => ({ ...prev, boardLodging: e.target.value }))} className="h-7 text-sm flex-1" />
                        <button type="button" onClick={() => setServiceItems({...serviceItems, boardLodging: !serviceItems.boardLodging})} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.boardLodging ? "bg-green-100 text-green-700 border-green-300" : "bg-red-100 text-red-700 border-red-300")} data-testid="dealer-toggle-board">{serviceItems.boardLodging ? "INCLUDED" : "EXCLUDED"}</button>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <Input value={priceLabels.training} onChange={(e) => setPriceLabels(prev => ({ ...prev, training: e.target.value }))} className="h-7 text-sm flex-1" />
                        <div className="flex items-center gap-1 shrink-0"><Input value={serviceItems.trainingDays} onChange={(e) => setServiceItems({...serviceItems, trainingDays: e.target.value})} className="w-16" data-testid="dealer-input-training-days" /><span className="text-sm text-muted-foreground">days</span></div>
                        <button type="button" onClick={() => setServiceItems({...serviceItems, trainingIncluded: !serviceItems.trainingIncluded})} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.trainingIncluded ? "bg-green-100 text-green-700 border-green-300" : "bg-red-100 text-red-700 border-red-300")} data-testid="dealer-toggle-training">{serviceItems.trainingIncluded ? "INCLUDED" : "EXCLUDED"}</button>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <Input value={priceLabels.packaging} onChange={(e) => setPriceLabels(prev => ({ ...prev, packaging: e.target.value }))} className="h-7 text-sm flex-1" />
                        <button type="button" onClick={() => setServiceItems({...serviceItems, packaging: !serviceItems.packaging})} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.packaging ? "bg-green-100 text-green-700 border-green-300" : "bg-red-100 text-red-700 border-red-300")} data-testid="dealer-toggle-packaging">{serviceItems.packaging ? "INCLUDED" : "EXCLUDED"}</button>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <Input value={priceLabels.transport} onChange={(e) => setPriceLabels(prev => ({ ...prev, transport: e.target.value }))} className="h-7 text-sm flex-1" />
                        <div className="flex items-center gap-1 shrink-0"><span className="text-xs text-muted-foreground">€</span><Input type="number" value={serviceItems.transportPrice || ""} onChange={(e) => setServiceItems({...serviceItems, transportPrice: parseFloat(e.target.value) || 0})} className="w-24 h-7 text-xs font-mono" data-testid="dealer-input-transport-price" /></div>
                        <button type="button" onClick={() => setServiceItems({...serviceItems, transportIncluded: !serviceItems.transportIncluded})} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.transportIncluded ? "bg-green-100 text-green-700 border-green-300" : "bg-red-100 text-red-700 border-red-300")} data-testid="dealer-toggle-transport">{serviceItems.transportIncluded ? "INCLUDED" : "EXCLUDED"}</button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t-2 pt-4 space-y-2">
                    <div className="flex justify-between items-center gap-4">
                      <Input value={priceLabels.grossTotal} onChange={(e) => setPriceLabels(prev => ({ ...prev, grossTotal: e.target.value }))} className="h-7 text-base font-medium w-48" data-testid="dealer-label-gross-total" />
                      <span className="font-mono font-bold text-lg">€{calculateGrossTotal().toLocaleString()}</span>
                    </div>
                    {discountPercent > 0 && (
                      <div className="flex justify-between items-center gap-4 text-primary">
                        <Input value={priceLabels.netTotal} onChange={(e) => setPriceLabels(prev => ({ ...prev, netTotal: e.target.value }))} className="h-7 text-base font-medium w-48" data-testid="dealer-label-net-total" />
                        <span className="font-mono font-bold text-lg">€{calculateNetTotal().toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "terms" && (
                <motion.div key="terms" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <h3 className="font-semibold text-lg border-b pb-2">{currentStepDef?.label ?? "Terms & Conditions"}</h3>
                  <div className="space-y-4">
                    <Label>Select Terms and Conditions (from your dealer presets)</Label>
                    <div className="grid gap-3">
                      {(!presets || presets.length === 0) && (
                        <p className="text-sm text-muted-foreground italic">No dealer presets yet. Add them in Presets & Terms.</p>
                      )}
                      {presets?.map((preset: any) => {
                        const selected = (projectData.selectedPresets || []).some((p: any) => p.id === preset.id);
                        return (
                          <div key={preset.id} className="flex items-start space-x-2 p-3 border rounded-md">
                            <Checkbox
                              id={`dealer-preset-${preset.id}`}
                              checked={selected}
                              onCheckedChange={(checked) => {
                                const current = projectData.selectedPresets || [];
                                if (checked) setProjectData({ ...projectData, selectedPresets: [...current, { id: preset.id, title: preset.title, content: preset.content }] });
                                else setProjectData({ ...projectData, selectedPresets: current.filter((p: any) => p.id !== preset.id) });
                              }}
                              data-testid={`dealer-checkbox-preset-${preset.id}`}
                            />
                            <div>
                              <label htmlFor={`dealer-preset-${preset.id}`} className="font-medium text-sm block cursor-pointer">{preset.title || "(no title)"}</label>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{preset.content}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "review" && (
                <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="flex flex-col lg:flex-row gap-6">
                    <div className="lg:w-2/5 flex flex-col gap-4">
                      <div>
                        <h3 className="font-semibold text-lg border-b pb-2">Page Layout</h3>
                        <p className="text-sm text-muted-foreground mt-2">Drag sections to set their order. Use the page-break button to force a section to start on a new page. Uncheck to hide a section.</p>
                      </div>

                      {(() => {
                        const SECTION_LABELS: Record<string, string> = {
                          metadata: "Customer Details",
                          offer_title: "Offer Title",
                          technical_specs: "Technical Specifications",
                          machine_line: "Machines and Options",
                          price_overview: "Price Overview",
                          terms_conditions: "Terms & Conditions",
                        };
                        const enabledIds = (formatSettings?.sections ?? []).filter((s: any) => s.enabled).map((s: any) => s.id);
                        const displayOrder = sectionOrder.length > 0
                          ? [
                              ...sectionOrder.filter((id: string) => enabledIds.includes(id)),
                              ...enabledIds.filter((id: string) => !sectionOrder.includes(id)),
                            ]
                          : enabledIds;
                        const orderedCart = machineOrder.length > 0
                          ? machineOrder.map(tid => cart.find(c => c.tempId === tid)).filter(Boolean) as typeof cart
                          : cart;

                        return (
                          <DragDropContext onDragEnd={(result) => {
                            if (!result.destination) return;
                            const items = [...displayOrder];
                            const [removed] = items.splice(result.source.index, 1);
                            items.splice(result.destination.index, 0, removed);
                            setSectionOrder(items);
                          }}>
                            <Droppable droppableId="dealer-page-layout-sections">
                              {(provided) => (
                                <div {...provided.droppableProps} ref={provided.innerRef} className="flex flex-col gap-1">
                                  {displayOrder.map((secId: string, index: number) => {
                                    const sec = (formatSettings?.sections ?? []).find((s: any) => s.id === secId);
                                    if (!sec) return null;
                                    const isVisible = !hiddenSections.includes(secId);
                                    const hasPageBreak = pageBreaks.includes(secId);
                                    const label = sec.label || SECTION_LABELS[secId] || secId;
                                    const isMachineLine = secId === "machine_line";
                                    return (
                                      <Draggable key={secId} draggableId={secId} index={index}>
                                        {(provided, snapshot) => (
                                          <div ref={provided.innerRef} {...provided.draggableProps}>
                                            {hasPageBreak && (
                                              <div className="flex items-center gap-2 py-1 px-1 my-1">
                                                <div className="flex-1 border-t-2 border-dashed border-primary/40" />
                                                <span className="text-xs text-primary/70 font-medium flex items-center gap-1 shrink-0">
                                                  <CornerDownLeft className="w-3 h-3" />New page
                                                </span>
                                                <div className="flex-1 border-t-2 border-dashed border-primary/40" />
                                              </div>
                                            )}
                                            <div
                                              className={`flex items-center gap-3 p-3 border rounded-md transition-colors ${snapshot.isDragging ? "shadow-md bg-background" : isVisible ? "hover:bg-muted/30" : "opacity-50"} ${isMachineLine ? "border-green-300 bg-green-50/50 dark:bg-green-950/20" : ""}`}
                                            >
                                              <div {...provided.dragHandleProps} className="cursor-grab text-muted-foreground shrink-0" data-testid={`dealer-drag-handle-${secId}`}>
                                                <GripVertical className="w-4 h-4" />
                                              </div>
                                              <label htmlFor={`dealer-section-vis-${secId}`} className={`font-medium text-sm flex-1 cursor-pointer ${isMachineLine ? "text-green-800 dark:text-green-300" : ""}`}>
                                                {label}
                                                {isMachineLine && cart.length > 0 && (
                                                  <span className="ml-1.5 text-xs font-normal text-green-600">({cart.length} position{cart.length !== 1 ? "s" : ""})</span>
                                                )}
                                                {secId === "terms_conditions" && (projectData.selectedPresets ?? []).length > 0 && (
                                                  <span className="ml-1.5 text-xs font-normal text-amber-600">({(projectData.selectedPresets as any[]).length} selected)</span>
                                                )}
                                              </label>
                                              {(secId === "machine_line" || secId === "terms_conditions") && (
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  type="button"
                                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                                                  onClick={() => setEditingSection(secId)}
                                                  title="Edit section content"
                                                  data-testid={`dealer-btn-edit-section-${secId}`}
                                                >
                                                  <Pencil className="w-3.5 h-3.5" />
                                                </Button>
                                              )}
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                type="button"
                                                className={`h-7 w-7 p-0 ${hasPageBreak ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
                                                onClick={() => setPageBreaks(prev => hasPageBreak ? prev.filter(id => id !== secId) : [...prev, secId])}
                                                title={hasPageBreak ? "Remove page break" : "Start on new page"}
                                                data-testid={`dealer-btn-pagebreak-${secId}`}
                                              >
                                                <CornerDownLeft className="w-3.5 h-3.5" />
                                              </Button>
                                              <Checkbox
                                                id={`dealer-section-vis-${secId}`}
                                                checked={isVisible}
                                                onCheckedChange={(checked) => {
                                                  if (checked) {
                                                    setHiddenSections(prev => prev.filter(id => id !== secId));
                                                  } else {
                                                    setHiddenSections(prev => [...prev, secId]);
                                                  }
                                                }}
                                                data-testid={`dealer-checkbox-section-${secId}`}
                                              />
                                            </div>

                                            {isMachineLine && isVisible && orderedCart.length > 0 && (
                                              <div className="ml-6 mt-1 mb-1 flex flex-col gap-0.5 border-l-2 border-green-200 pl-2">
                                                {orderedCart.map((item, posIdx) => {
                                                  const hasMachBreak = machinePageBreaks.includes(item.tempId);
                                                  return (
                                                    <div key={item.tempId}>
                                                      {hasMachBreak && posIdx > 0 && (
                                                        <div className="flex items-center gap-1.5 py-0.5 px-1 mb-0.5">
                                                          <div className="flex-1 border-t border-dashed border-primary/30" />
                                                          <span className="text-xs text-primary/60 flex items-center gap-0.5 shrink-0 leading-none" style={{ fontSize: 9 }}>
                                                            <CornerDownLeft className="w-2.5 h-2.5" />new page
                                                          </span>
                                                          <div className="flex-1 border-t border-dashed border-primary/30" />
                                                        </div>
                                                      )}
                                                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-sm bg-green-50 dark:bg-green-950/30 border border-green-100">
                                                        <span className="text-xs font-semibold text-green-700 dark:text-green-400 shrink-0 w-10">Pos. {posIdx + 1}</span>
                                                        <span className="text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">{item.snapshotMachineName}</span>
                                                        {posIdx > 0 && (
                                                          <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            type="button"
                                                            className={`h-5 w-5 p-0 shrink-0 ${hasMachBreak ? "text-primary bg-primary/10" : "text-muted-foreground/60"}`}
                                                            onClick={() => setMachinePageBreaks(prev => hasMachBreak ? prev.filter(t => t !== item.tempId) : [...prev, item.tempId])}
                                                            title={hasMachBreak ? "Remove page break before this position" : "Start this position on a new page"}
                                                            data-testid={`dealer-btn-machinebreak-${item.tempId}`}
                                                          >
                                                            <CornerDownLeft className="w-2.5 h-2.5" />
                                                          </Button>
                                                        )}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}

                                            {secId === "terms_conditions" && isVisible && (projectData.selectedPresets ?? []).length > 0 && (
                                              <div className="ml-6 mt-1 mb-1 flex flex-col gap-0.5 border-l-2 border-amber-200 pl-2">
                                                {(projectData.selectedPresets as Array<{ id: number; title: string; content: string }>).map((preset, pidx) => {
                                                  const hasTermBreak = termsPageBreaks.includes(preset.id);
                                                  return (
                                                    <div key={preset.id}>
                                                      {hasTermBreak && pidx > 0 && (
                                                        <div className="flex items-center gap-1.5 py-0.5 px-1 mb-0.5">
                                                          <div className="flex-1 border-t border-dashed border-primary/30" />
                                                          <span className="text-xs text-primary/60 flex items-center gap-0.5 shrink-0 leading-none" style={{ fontSize: 9 }}>
                                                            <CornerDownLeft className="w-2.5 h-2.5" />new page
                                                          </span>
                                                          <div className="flex-1 border-t border-dashed border-primary/30" />
                                                        </div>
                                                      )}
                                                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-100">
                                                        <span className="text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">{preset.title || "Untitled"}</span>
                                                        {pidx > 0 && (
                                                          <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            type="button"
                                                            className={`h-5 w-5 p-0 shrink-0 ${hasTermBreak ? "text-primary bg-primary/10" : "text-muted-foreground/60"}`}
                                                            onClick={() => setTermsPageBreaks(prev => hasTermBreak ? prev.filter(id => id !== preset.id) : [...prev, preset.id])}
                                                            title={hasTermBreak ? "Remove page break before this preset" : "Start this preset on a new page"}
                                                            data-testid={`dealer-btn-termsbreak-${preset.id}`}
                                                          >
                                                            <CornerDownLeft className="w-2.5 h-2.5" />
                                                          </Button>
                                                        )}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
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
                        );
                      })()}

                      <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                        <h4 className="font-medium mb-2">Summary</h4>
                        <p className="text-sm text-muted-foreground">Customer: <strong>{headerCustomerName || "—"}</strong></p>
                        <p className="text-sm text-muted-foreground">Subject: <strong>{subject || "—"}</strong></p>
                        <p className="text-sm text-muted-foreground">Items: {cart.length}</p>
                        <p className="text-sm text-muted-foreground">Source Offer: {sourceOffer.referenceNumber}</p>
                        <p className="text-sm text-muted-foreground">Visible sections: {(formatSettings?.sections ?? []).filter((s: any) => s.enabled).length - hiddenSections.length} of {(formatSettings?.sections ?? []).filter((s: any) => s.enabled).length}</p>
                        {pageBreaks.length > 0 && <p className="text-sm text-muted-foreground">Page breaks: {pageBreaks.length}</p>}
                        <p className="font-bold text-xl mt-2">€{calculateTotal().toLocaleString()}</p>
                      </div>

                      <Button onClick={generatePreviewPdf} disabled={isPdfGenerating} variant="outline" className="w-full" data-testid="button-dealer-refresh-preview">
                        {isPdfGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Refresh Preview
                      </Button>
                    </div>

                    {editingSection !== null && (editingSection === "machine_line" || editingSection === "terms_conditions") && (() => {
                      const orderedCartForEdit = machineOrder.length > 0
                        ? machineOrder.map(tid => cart.find(c => c.tempId === tid)).filter(Boolean) as typeof cart
                        : cart;
                      const title = editingSection === "machine_line" ? "Machines and Options" : "Terms & Conditions";
                      return (
                        <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
                          <div className="flex items-center gap-3 border-b px-6 py-4 shrink-0 bg-card">
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              onClick={() => { setEditingSection(null); generatePreviewPdf(); }}
                              data-testid="dealer-btn-section-edit-close"
                            >
                              <X className="w-5 h-5" />
                            </Button>
                            <h2 className="font-semibold text-lg">{title}</h2>
                            <div className="flex-1" />
                            <Button
                              type="button"
                              onClick={() => { setEditingSection(null); generatePreviewPdf(); }}
                              data-testid="dealer-btn-section-edit-done"
                            >
                              Save &amp; Preview
                            </Button>
                          </div>
                          <div className="flex-1 overflow-y-auto p-6 md:p-10">
                            <div className="max-w-6xl mx-auto flex flex-col gap-6">
                              {editingSection === "machine_line" && (
                                <>
                                  <p className="text-sm text-muted-foreground">Override the description shown for each machine in this offer.</p>
                                  {orderedCartForEdit.map((item, idx) => (
                                    <div key={item.tempId} className="flex flex-col gap-1.5">
                                      <Label className="text-sm font-medium">Pos. {idx + 1} — {item.snapshotMachineName}</Label>
                                      <Textarea
                                        rows={8}
                                        className="text-sm font-mono"
                                        placeholder="Machine description..."
                                        value={machineDescOverrides[item.machineId] ?? ""}
                                        onChange={(e) => setMachineDescOverrides(prev => ({ ...prev, [item.machineId]: e.target.value }))}
                                      />
                                    </div>
                                  ))}
                                </>
                              )}
                              {editingSection === "terms_conditions" && (
                                <>
                                  <p className="text-sm text-muted-foreground">Edit the terms text for this offer only (does not change the preset source).</p>
                                  {(projectData.selectedPresets ?? []).map((preset: any, idx: number) => (
                                    <div key={preset.id ?? idx} className="flex flex-col gap-2 border rounded-lg p-4">
                                      <Input
                                        className="font-semibold"
                                        value={preset.title ?? ""}
                                        onChange={(e) => {
                                          const updated = [...(projectData.selectedPresets ?? [])];
                                          updated[idx] = { ...updated[idx], title: e.target.value };
                                          setProjectData((prev: any) => ({ ...prev, selectedPresets: updated }));
                                        }}
                                        placeholder="Section title"
                                      />
                                      <Textarea
                                        rows={12}
                                        className="text-sm font-mono"
                                        value={preset.content ?? ""}
                                        onChange={(e) => {
                                          const updated = [...(projectData.selectedPresets ?? [])];
                                          updated[idx] = { ...updated[idx], content: e.target.value };
                                          setProjectData((prev: any) => ({ ...prev, selectedPresets: updated }));
                                        }}
                                      />
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="lg:w-3/5 flex flex-col gap-2" style={{ minHeight: "75vh" }}>
                      <p className="text-sm font-medium text-muted-foreground shrink-0">PDF Preview (Dealer Format)</p>
                      {isPdfGenerating && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 border rounded-xl bg-muted/20">
                          <Loader2 className="w-8 h-8 animate-spin text-primary" />
                          <p className="text-sm text-muted-foreground">Generating preview...</p>
                        </div>
                      )}
                      {!isPdfGenerating && pdfBlobUrl && (
                        <iframe src={pdfBlobUrl} className="flex-1 w-full rounded-xl border shadow-sm" title="Dealer Offer PDF Preview" style={{ minHeight: "70vh" }} />
                      )}
                      {!isPdfGenerating && !pdfBlobUrl && (
                        <div className="flex-1 flex items-center justify-center border rounded-xl bg-muted/20 text-sm text-muted-foreground">
                          Preview will appear here
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex justify-between items-center mt-8 pt-6 border-t">
              <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 1} data-testid="button-dealer-back" size="lg">
                <ChevronLeft className="w-5 h-5 mr-1" /> Back
              </Button>
              <span className="text-sm text-muted-foreground font-medium">{step} / {wizardSteps.length}</span>
              {step < wizardSteps.length ? (
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={
                    (currentStepDef?.id === "customer" && !customerId) ||
                    (currentStepDef?.id === "composition" && cart.length === 0)
                  }
                  data-testid="button-dealer-next"
                  size="lg"
                >
                  Next <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={!subject || !customerId || cart.length === 0 || isSubmitting}
                  className="bg-primary hover:bg-primary/90"
                  data-testid="button-dealer-create"
                  size="lg"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                  Create Dealer Offer
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DealerLayout>
  );
}
