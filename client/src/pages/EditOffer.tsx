import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useCustomers } from "@/hooks/use-customers";
import { useMachines } from "@/hooks/use-machines";
import { usePresets } from "@/hooks/use-presets";
import { useOffer, useUpdateOffer } from "@/hooks/use-offers";
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
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";

import { Loader2, Trash2, Plus, ChevronRight, ChevronLeft, Check, ArrowLeft, GripVertical, Eye, EyeOff, CornerDownLeft, Pencil, X, Sparkles, ShieldCheck, Brain, Upload, FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { MachinePicker } from "@/components/MachinePicker";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { CommentButton } from "@/components/CommentButton";
import { AIAssistantPanel } from "@/components/ai";
import type { DraftInsertCallbacks } from "@/components/ai";
import { useDraftOfferText, useReviewRisks, useConfigSafetyGuard, useQuoteContext, useSalesInsights, useOfferPatterns, useSubmitFeedback } from "@/hooks/use-ai-assistant";
import { useToast } from "@/hooks/use-toast";
import type { Contact } from "@shared/schema";

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
  minMaxLength: "",
  maxWidth: "",
  minMaxThickness: "",
  averageLineSpeed: "",
  controlSide: "",
  maxBow: "10 mm",
  paint: "",
  substrate: "",
  finishing: "",
  standardVoltage: "Working tension 400V/50 Hz. Commands 24V. Max. allowed oscillation +/- 5%",
  standardColors: "Light Grey RAL 7035",
  components: "Prices are based on the use of our standard mechanical (Bonfiglioli), electrical and electronic (Schneider Telemecanique) components. Requests for other manufactures equipment to be supplied instead of our standard components can be evaluated for performance, reliability and any extra costs that may be incurred",
  precautions: "Do not place near the machine substances which may cause danger of inflammability. User must foresee an adequate technical ventilation in the working environment in order to prevent any risk of inflammability. User must verify that the zone in which the machine or installation will be positioned is right for the purpose.",
  airIntake: "Air intake is always considered with environmental temperature above +4 °C; in case of air intake from the outside of the work environment or temperatures below +4 °C, the user will have to foresee motorized shutters or request additional antifreeze systems, so as to prevent damage to the installation",
  commissioning: "For single machines shipped when already assembled, commissioning and start-up are carried out at our premises. For disassembled machines or groups of machines, start-up will be carried out after commissioning."
};

export default function EditOffer() {
  const { id } = useParams<{ id: string }>();
  const offerId = parseInt(id || "0");
  const [, setLocation] = useLocation();

  const { user } = useAuth();
  const updateOffer = useUpdateOffer();
  
  const [customerId, setCustomerId] = useState<string>("");

  const { data: offer, isLoading: offerLoading } = useOffer(offerId);
  const { data: customers } = useCustomers();
  const { data: machines } = useMachines();
  const { data: presets } = usePresets();
  const { data: companyContacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", { customerId }],
    queryFn: () => fetch(`/api/contacts?customerId=${customerId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!customerId,
  });
  const { data: formatSettings } = useQuery<{ sections: any[]; pageBackground: string }>({
    queryKey: ["/api/settings/document-format"],
  });

  const [step, setStep] = useState(1);

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
    if (!sections.length) return defaultSteps;
    const steps: typeof defaultSteps = [];
    for (const sec of sections) {
      const def = SECTION_TO_STEP[sec.id];
      if (!def) continue;
      if (!sec.enabled && !def.alwaysShow) continue;
      steps.push({
        id: def.id,
        label: def.defaultLabel,
        intro: sec.labels?.intro ?? "",
        sectionLabels: sec.labels ?? {},
      });
      if (def.id === "customer") steps.push(DETAILS_STEP);
    }
    const result = steps.length ? steps : defaultSteps;
    result.push({ id: "review", label: "Review Sections", intro: "", sectionLabels: {} as Record<string,string> });
    return result;
  }, [formatSettings]);

  const currentStepDef = wizardSteps[step - 1] ?? wizardSteps[0];
  const [subject, setSubject] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [technicalSpecs, setTechnicalSpecs] = useState<TechnicalSpecs>(defaultTechnicalSpecs);
  const [projectData, setProjectData] = useState<any>({ selectedPresets: [] });
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [sectionOrder, setSectionOrder] = useState<string[]>([]);
  const [pageBreaks, setPageBreaks] = useState<string[]>([]);
  const [machineOrder, setMachineOrder] = useState<string[]>([]);
  const [machinePageBreaks, setMachinePageBreaks] = useState<string[]>([]);
  const [termsPageBreaks, setTermsPageBreaks] = useState<number[]>([]);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [serviceItems, setServiceItems] = useState<ServiceItems>(defaultServiceItems);
  const [activeMachineId, setActiveMachineId] = useState<string>("");
  const [activeQuantity, setActiveQuantity] = useState(1);
  const [activeOptions, setActiveOptions] = useState<number[]>([]);
  const [activeOptionQuantities, setActiveOptionQuantities] = useState<Record<number, number>>({});
  const [showAllOptions, setShowAllOptions] = useState<Set<string>>(new Set());
  const [interlockingPricePerPosition, setInterlockingPricePerPosition] = useState(500);
  const [installationConfig, setInstallationConfig] = useState({
    dailyFee: 850,
    totalDays: 0,
    totalPrice: 0,
    included: true,
    hideDailyFee: false,
    hideTotalDays: false,
    hideTotalPrice: false,
  });
  const [showDetailedPrices, setShowDetailedPrices] = useState(true);
  const [priceComments, setPriceComments] = useState({
    interlocking: '',
    installation: '',
    travel: '',
    boardLodging: '',
    training: '',
    packaging: '',
    transport: '',
    extras: {} as Record<string, string>,
  });
  const [priceLabels, setPriceLabels] = useState({ ...DEFAULT_PRICE_LABELS });
  const [initialized, setInitialized] = useState(false);
  const [headerDate, setHeaderDate] = useState("");
  const [headerSalesmanName, setHeaderSalesmanName] = useState("");
  const [headerSalesmanEmail, setHeaderSalesmanEmail] = useState("");
  const [headerSalesmanMobile, setHeaderSalesmanMobile] = useState("");
  const [headerCustomerName, setHeaderCustomerName] = useState("");
  const [headerCustomerContact, setHeaderCustomerContact] = useState("");
  const [headerCustomerEmail, setHeaderCustomerEmail] = useState("");
  const [headerCustomerAddress, setHeaderCustomerAddress] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [layout, setLayout] = useState("");
  const [layoutDrawing, setLayoutDrawing] = useState<{ filename: string; originalName: string } | null>(null);
  const [uploadingDrawing, setUploadingDrawing] = useState(false);
  const layoutFileRef = useRef<HTMLInputElement>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const prevPdfBlobUrl = useRef<string | null>(null);
  const [sectionTextOverrides, setSectionTextOverrides] = useState<Record<string, { intro?: string }>>({});
  const [machineDescOverrides, setMachineDescOverrides] = useState<Record<number, string>>({});
  const [editingSection, setEditingSection] = useState<string | null>(null);

  const { toast } = useToast();
  const draftOfferText = useDraftOfferText();
  const reviewRisks = useReviewRisks();
  const configSafetyGuard = useConfigSafetyGuard();
  const submitFeedback = useSubmitFeedback();
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiPanelMode, setAiPanelMode] = useState<"draft" | "risk" | "safety" | "brain">("draft");
  const [draftEditedTexts, setDraftEditedTexts] = useState<Record<string, string>>({});
  const [draftInsertedKeys, setDraftInsertedKeys] = useState<Set<string>>(new Set());
  const [isLargeScreen, setIsLargeScreen] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleGenerateDraft = () => {
    if (!subject || cart.length === 0 || !machines) return;
    const customer = customers?.find((c: any) => c.id.toString() === customerId);

    const enabledIds = (formatSettings?.sections ?? []).filter((s: any) => s.enabled).map((s: any) => s.id);

    draftOfferText.mutate({
      offerSubject: subject,
      customerName: customer?.name ?? "Customer",
      selectedMachines: cart.map(ci => {
        const m = machines.find(mm => mm.id === ci.machineId);
        return {
          name: m?.name ?? "Unknown",
          description: machineDescOverrides[ci.machineId] ?? m?.description ?? "",
          quantity: ci.quantity,
        };
      }),
      availableSections: enabledIds.map((id: string) => {
        const sec = (formatSettings?.sections ?? []).find((s: any) => s.id === id);
        return { id, name: sec?.label ?? id };
      }),
      availablePresets: (presets ?? []).map((p: any) => ({
        id: p.id,
        title: p.title,
        content: p.content,
      })),
      notes: layout ? `Layout: ${layout}` : undefined,
      tone: "formal",
      language: "en",
      offerId: offer?.id,
    });
    setShowAiPanel(true);
    setAiPanelMode("draft");
    setDraftEditedTexts({});
    setDraftInsertedKeys(new Set());
  };

  const handleReviewRisks = () => {
    if (!subject || cart.length === 0 || !machines) return;
    const customer = customers?.find((c: any) => c.id.toString() === customerId);

    reviewRisks.mutate({
      offerSubject: subject,
      customerName: customer?.name ?? (headerCustomerName || "Customer"),
      customerAddress: headerCustomerAddress || (customer as any)?.address || undefined,
      totalPrice: calculateTotal().toString(),
      selectedMachines: cart.map(ci => {
        const m = machines.find(mm => mm.id === ci.machineId);
        return {
          name: m?.name ?? "Unknown",
          quantity: ci.quantity,
          unitPrice: ci.basePrice.toString(),
        };
      }),
      selectedPresets: (projectData.selectedPresets ?? []).map((p: any) => ({
        title: p.title ?? "",
        content: p.content ?? "",
      })),
      offerNotes: layout ? `Layout: ${layout}` : undefined,
      language: "en",
      offerId: offer?.id,
    });
    setShowAiPanel(true);
    setAiPanelMode("risk");
  };

  const handleSafetyCheck = () => {
    if (!subject || cart.length === 0 || !machines) return;
    const customer = customers?.find((c: any) => c.id.toString() === customerId);

    configSafetyGuard.mutate({
      offerSubject: subject,
      customerName: customer?.name ?? (headerCustomerName || "Customer"),
      customerAddress: headerCustomerAddress || (customer as any)?.address || undefined,
      totalPrice: calculateTotal().toString(),
      selectedMachines: cart.map(ci => {
        const m = machines.find(mm => mm.id === ci.machineId);
        const machineOptions = (m as any)?.options ?? [];
        return {
          name: m?.name ?? "Unknown",
          quantity: ci.quantity,
          unitPrice: ci.basePrice.toString(),
          macroType: m?.macroType ?? null,
          options: ci.selectedOptionIds.map((optId: number) => {
            const opt = machineOptions.find((o: any) => o.id === optId);
            return {
              name: opt?.name ?? `Option #${optId}`,
              priceModifier: opt?.priceModifier?.toString(),
            };
          }),
        };
      }),
      selectedPresets: (projectData.selectedPresets ?? []).map((p: any) => ({
        title: p.title ?? "",
        content: p.content ?? "",
      })),
      offerNotes: layout ? `Layout: ${layout}` : undefined,
      language: "en",
      offerId: offer?.id,
    });
    setShowAiPanel(true);
    setAiPanelMode("safety");
  };

  const handleDraftEditText = (key: string, text: string) => {
    setDraftEditedTexts(prev => ({ ...prev, [key]: text }));
  };

  const handleInsertSubject = (text: string) => {
    setSubject(text);
    setDraftInsertedKeys(prev => new Set(prev).add("subject"));
    toast({ title: "Subject inserted into offer" });
  };

  const handleInsertSection = (sectionId: string, text: string) => {
    setSectionTextOverrides(prev => ({
      ...prev,
      [sectionId]: { ...prev[sectionId], intro: text },
    }));
    setDraftInsertedKeys(prev => new Set(prev).add(`section-${sectionId}`));
    toast({ title: "Section text inserted" });
  };

  const handleInsertIntroduction = (text: string) => {
    setSectionTextOverrides(prev => ({
      ...prev,
      offer_title: { ...prev.offer_title, intro: text },
    }));
    setDraftInsertedKeys(prev => new Set(prev).add("introduction"));
    toast({ title: "Introduction inserted" });
  };

  const handleInsertClosing = (text: string) => {
    setSectionTextOverrides(prev => ({
      ...prev,
      terms_conditions: { ...prev.terms_conditions, intro: text },
    }));
    setDraftInsertedKeys(prev => new Set(prev).add("closing"));
    toast({ title: "Closing paragraph inserted" });
  };

  const handleDraftFeedback = (runId: string, rating: "accepted" | "rejected" | "modified", comment?: string) => {
    submitFeedback.mutate(
      { runId, rating, comment },
      {
        onSuccess: () => toast({ title: rating === "accepted" ? "Feedback submitted — thank you!" : "Feedback noted" }),
        onError: () => toast({ title: "Failed to submit feedback", variant: "destructive" }),
      }
    );
  };

  const draftOutput = draftOfferText.data?.output ?? null;
  const draftRun = draftOfferText.data?.run ?? null;
  const draftError = draftOfferText.error?.message ?? null;

  const riskOutput = reviewRisks.data?.output ?? null;
  const riskRun = reviewRisks.data?.run ?? null;
  const riskError = reviewRisks.error?.message ?? null;

  const safetyOutput = configSafetyGuard.data?.output ?? null;
  const safetyRun = configSafetyGuard.data?.run ?? null;
  const safetyError = configSafetyGuard.error?.message ?? null;

  const cartMachineIds = useMemo(() => cart.map(ci => ci.machineId), [cart]);
  const quoteContext = useQuoteContext(cartMachineIds);
  const salesInsights = useSalesInsights();
  const offerPatterns = useOfferPatterns();
  const brainOutput = useMemo(() => {
    if (!quoteContext.data && !salesInsights.data && !offerPatterns.data) return null;
    return {
      type: "sales_brain" as const,
      insights: salesInsights.data ?? [],
      machineStats: quoteContext.data?.machineStats ?? [],
      optionStats: quoteContext.data?.commonOptions ?? [],
      pricingDistributions: quoteContext.data?.pricingDistributions ?? [],
      patterns: offerPatterns.data ?? [],
      quoteContext: quoteContext.data ?? null,
    };
  }, [quoteContext.data, salesInsights.data, offerPatterns.data]);
  const brainError = quoteContext.error?.message ?? salesInsights.error?.message ?? offerPatterns.error?.message ?? null;

  const handleShowBrain = () => {
    setAiPanelMode("brain");
    setShowAiPanel(true);
    quoteContext.refetch();
  };

  const activeOutput = aiPanelMode === "draft" ? draftOutput : aiPanelMode === "risk" ? riskOutput : aiPanelMode === "safety" ? safetyOutput : brainOutput;
  const activeRun = aiPanelMode === "draft" ? draftRun : aiPanelMode === "risk" ? riskRun : aiPanelMode === "safety" ? safetyRun : null;
  const activeError = aiPanelMode === "draft" ? draftError : aiPanelMode === "risk" ? riskError : aiPanelMode === "safety" ? safetyError : brainError;
  const activeLoading = aiPanelMode === "draft" ? draftOfferText.isPending : aiPanelMode === "risk" ? reviewRisks.isPending : aiPanelMode === "safety" ? configSafetyGuard.isPending : quoteContext.isFetching;
  const activeWorkflowType = aiPanelMode === "draft" ? "offer_text_draft" as const : aiPanelMode === "risk" ? "risk_review" as const : aiPanelMode === "safety" ? "config_safety_guard" as const : "sales_brain" as const;
  const activeRetry = aiPanelMode === "draft" ? handleGenerateDraft : aiPanelMode === "risk" ? handleReviewRisks : aiPanelMode === "safety" ? handleSafetyCheck : handleShowBrain;
  const activeTitle = aiPanelMode === "draft" ? "Offer Draft" : aiPanelMode === "risk" ? "Risk Review" : aiPanelMode === "safety" ? "Safety Check" : "Sales Brain";

  const draftCallbacks: DraftInsertCallbacks = {
    onInsertSubject: handleInsertSubject,
    onInsertSection: handleInsertSection,
    onInsertIntroduction: handleInsertIntroduction,
    onInsertClosing: handleInsertClosing,
    editedTexts: draftEditedTexts,
    onEditText: handleDraftEditText,
    insertedKeys: draftInsertedKeys,
  };

  useEffect(() => {
    if (offer && machines && !initialized) {
      setCustomerId(offer.customerId.toString());
      setSubject(offer.subject);
      
      const existingProjectData = offer.projectData as any || { selectedPresets: [] };
      setProjectData({ 
        selectedPresets: existingProjectData.selectedPresets || [],
      });
      
      if (existingProjectData.hiddenSections) {
        setHiddenSections(existingProjectData.hiddenSections);
      }

      setSectionOrder(existingProjectData.sectionOrder ?? []);
      setPageBreaks(existingProjectData.pageBreaks ?? ["price_overview", "terms_conditions"]);

      // Build cartItems first so break positions can reference tempId values
      const savedComments: Array<{machineComment: string; optionComments: Record<number, string>}> =
        (existingProjectData.pricing?.itemComments) || [];

      const cartItems: CartItem[] = offer.items.map((item, idx) => {
        const optionIds = item.options.map(o => o.machineOptionId);
        const optionPrices: Record<number, number> = {};
        const optionQuantities: Record<number, number> = {};
        for (const opt of item.options) {
          optionPrices[opt.machineOptionId] = parseFloat(opt.snapshotPriceModifier as unknown as string ?? "0");
          optionQuantities[opt.machineOptionId] = (opt as any).quantity ?? 1;
        }
        const saved = savedComments[idx] || {};
        return {
          tempId: Math.random().toString(36),
          machineId: item.machineId,
          quantity: item.quantity,
          selectedOptionIds: optionIds,
          optionQuantities,
          basePrice: parseFloat(item.snapshotBasePrice as unknown as string),
          optionPrices,
          comment: saved.machineComment || "",
          optionComments: saved.optionComments || {},
          optionPriceHidden: (saved as any).optionPriceHidden || {},
        };
      });

      setCart(cartItems);

      const savedBreakPositions: number[] = existingProjectData.machineBreakPositions ?? [];
      if (savedBreakPositions.length > 0) {
        setMachinePageBreaks(savedBreakPositions.map((pos: number) => cartItems[pos]?.tempId ?? "").filter(Boolean));
      }

      const savedTermsBreaks: number[] = existingProjectData.termsBreakPositions ?? [];
      if (savedTermsBreaks.length > 0) {
        setTermsPageBreaks(savedTermsBreaks);
      }

      if (existingProjectData.technicalSpecs) {
        setTechnicalSpecs({ ...defaultTechnicalSpecs, ...existingProjectData.technicalSpecs });
      }
      
      if (existingProjectData.pricing) {
        setExtraItems(existingProjectData.pricing.extraItems || []);
        setDiscountPercent(existingProjectData.pricing.discountPercent || 0);
        const savedService = existingProjectData.pricing.serviceItems || {};
        setServiceItems({ ...defaultServiceItems, ...savedService });
        if (existingProjectData.pricing.interlockingPricePerPosition != null) {
          setInterlockingPricePerPosition(existingProjectData.pricing.interlockingPricePerPosition);
        }
        if (existingProjectData.pricing.installationConfig != null) {
          setInstallationConfig(existingProjectData.pricing.installationConfig);
        } else if (existingProjectData.pricing.installationDailyFee != null) {
          const dailyFee = existingProjectData.pricing.installationDailyFee;
          const totalDays = existingProjectData.pricing.installationTotalDays ?? 0;
          setInstallationConfig(prev => ({ ...prev, dailyFee, totalDays, totalPrice: dailyFee * totalDays }));
        }
        if (existingProjectData.pricing.priceComments != null) {
          setPriceComments(prev => ({ ...prev, ...existingProjectData.pricing.priceComments }));
        }
        if (existingProjectData.pricing.priceLabels != null) {
          setPriceLabels(prev => ({ ...DEFAULT_PRICE_LABELS, ...existingProjectData.pricing.priceLabels }));
        }
      }

      const hi = existingProjectData.headerInfo ?? {};
      setHeaderDate(hi.date || new Date(offer.date).toISOString().slice(0, 10));
      setHeaderSalesmanName(hi.salesman?.name ?? (offer as any).salesmanName ?? "");
      setHeaderSalesmanEmail(hi.salesman?.email ?? (offer as any).salesmanEmail ?? "");
      setHeaderSalesmanMobile(hi.salesman?.mobile ?? (offer as any).salesmanMobile ?? "");
      setHeaderCustomerName(hi.customer?.name ?? (offer as any).customer?.name ?? "");
      setHeaderCustomerContact(hi.customer?.contactPerson ?? (offer as any).customer?.contactPerson ?? "");
      setHeaderCustomerEmail(hi.customer?.email ?? (offer as any).customer?.email ?? "");
      setHeaderCustomerAddress(hi.customer?.address ?? (offer as any).customer?.address ?? "");
      setLayout(existingProjectData.layout ?? "");
      setLayoutDrawing(existingProjectData.layoutDrawing ?? null);
      setSectionTextOverrides(existingProjectData.sectionTextOverrides ?? {});
      setMachineDescOverrides(existingProjectData.machineDescOverrides ?? {});

      setInitialized(true);
    }
  }, [offer, machines, initialized]);

  useEffect(() => {
    if (!selectedContactId || companyContacts.length === 0) return;
    const contact = companyContacts.find(c => c.id.toString() === selectedContactId);
    if (contact) {
      setHeaderCustomerContact(`${contact.firstName || ""} ${contact.lastName || ""}`.trim());
      setHeaderCustomerEmail(contact.email || "");
    }
  }, [selectedContactId, companyContacts]);

  useEffect(() => {
    if (selectedContactId || companyContacts.length === 0) return;
    if (!headerCustomerContact && !headerCustomerEmail) return;
    const nameNorm = (headerCustomerContact || "").trim().toLowerCase();
    const emailNorm = (headerCustomerEmail || "").trim().toLowerCase();
    let match = companyContacts.find(c => {
      const fullName = `${c.firstName || ""} ${c.lastName || ""}`.trim().toLowerCase();
      return fullName === nameNorm;
    });
    if (!match && emailNorm) {
      match = companyContacts.find(c => (c.email || "").trim().toLowerCase() === emailNorm);
    }
    if (match) {
      setSelectedContactId(match.id.toString());
    }
  }, [companyContacts, headerCustomerContact, headerCustomerEmail, selectedContactId]);

  const handleLayoutDrawingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDrawing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/offers/layout-drawing", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setLayoutDrawing({ filename: data.filename, originalName: data.originalName });
      toast({ title: "Drawing uploaded", description: data.originalName });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploadingDrawing(false);
      if (layoutFileRef.current) layoutFileRef.current.value = "";
    }
  };

  const handleRemoveDrawing = async () => {
    if (!layoutDrawing) return;
    try {
      await fetch(`/api/offers/layout-drawing/${layoutDrawing.filename}`, { method: "DELETE", credentials: "include" });
    } catch {}
    setLayoutDrawing(null);
  };

  const handleAddMachine = () => {
    if (!activeMachineId) return;
    const machine = machines?.find(m => m.id === parseInt(activeMachineId));
    if (!machine) return;

    const optionPrices: Record<number, number> = {};
    for (const optId of activeOptions) {
      const opt = machine.options.find(o => o.id === optId);
      optionPrices[optId] = opt ? parseFloat(opt.priceModifier as unknown as string) : 0;
    }

    const newItem: CartItem = {
      tempId: Math.random().toString(36),
      machineId: machine.id,
      quantity: activeQuantity,
      selectedOptionIds: activeOptions,
      optionQuantities: { ...activeOptionQuantities },
      basePrice: parseFloat(machine.basePrice as unknown as string),
      optionPrices,
      comment: "",
      optionComments: {},
      optionPriceHidden: {},
    };

    setCart([...cart, newItem]);
    setActiveMachineId("");
    setActiveQuantity(1);
    setActiveOptions([]);
    setActiveOptionQuantities({});
  };

  const handleRemoveItem = (tempId: string) => {
    setCart(cart.filter(item => item.tempId !== tempId));
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    const items = Array.from(cart);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setCart(items);
  };

  const getItemOptionsTotal = (item: CartItem) =>
    item.selectedOptionIds.reduce((sum, optId) => sum + (item.optionPrices[optId] ?? 0) * (item.optionQuantities?.[optId] ?? 1), 0);

  const calculateMachinesTotal = () => {
    return cart.reduce((acc, item) => {
      return acc + ((item.basePrice + getItemOptionsTotal(item)) * item.quantity);
    }, 0);
  };

  const calculateInterlocking = () => {
    return cart.length * interlockingPricePerPosition;
  };

  const calculateExtrasTotal = () => {
    return extraItems.reduce((acc, item) => acc + item.price, 0);
  };

  const calculateServicesTotal = () => {
    const instAmount = installationConfig.included ? installationConfig.totalPrice : 0;
    const transportAmount = serviceItems.transportIncluded ? serviceItems.transportPrice : 0;
    return instAmount + transportAmount;
  };

  const calculateTotalListPrice = () => {
    return calculateMachinesTotal() + calculateInterlocking() + calculateExtrasTotal();
  };

  const calculateGrossTotal = () => {
    return calculateMachinesTotal() + calculateInterlocking() + calculateExtrasTotal() + calculateServicesTotal();
  };

  const calculateDiscount = () => {
    const discountableAmount = calculateMachinesTotal() + calculateInterlocking() + calculateExtrasTotal();
    return (discountableAmount * discountPercent) / 100;
  };

  const calculateNetTotal = () => {
    return calculateGrossTotal() - calculateDiscount();
  };

  const addExtraItem = () => {
    setExtraItems([...extraItems, { id: Math.random().toString(36), description: "", price: 0 }]);
  };

  const updateExtraItem = (id: string, field: "description" | "price", value: string | number) => {
    setExtraItems(extraItems.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const removeExtraItem = (id: string) => {
    setExtraItems(extraItems.filter(item => item.id !== id));
  };

  const calculateTotal = () => {
    return discountPercent > 0 ? calculateNetTotal() : calculateGrossTotal();
  };

  const buildPreviewPayload = () => {
    const orderedCart = machineOrder.length > 0
      ? machineOrder.map(tid => cart.find(c => c.tempId === tid)).filter(Boolean) as CartItem[]
      : cart;
    const machineBreakPositions = machinePageBreaks
      .map(tid => orderedCart.findIndex(c => c.tempId === tid))
      .filter(i => i > 0);
    const salesmanName = `${user?.name || ""} ${user?.surname || ""}`.trim() || offer?.salesmanName || "Sales Team";
    return {
      offer: {
        customerId: parseInt(customerId),
        subject,
        salesmanName,
        totalPrice: calculateTotal().toString(),
        status: "Draft",
        projectData: {
          ...projectData,
          hiddenSections,
          sectionOrder,
          pageBreaks,
          machineBreakPositions,
          termsBreakPositions: termsPageBreaks,
          layout,
          layoutDrawing,
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
            discountAmount: calculateDiscount(),
            serviceItems: { ...serviceItems, installationPrice: installationConfig.included ? installationConfig.totalPrice : 0 },
            installationConfig,
            interlockingPricePerPosition,
            interlockingTotal: calculateInterlocking(),
            totalListPrice: calculateTotalListPrice(),
            grossTotal: calculateGrossTotal(),
            netTotal: calculateNetTotal(),
            priceLabels,
            priceComments,
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
      const res = await fetch("/api/offers/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Preview failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (prevPdfBlobUrl.current) URL.revokeObjectURL(prevPdfBlobUrl.current);
      prevPdfBlobUrl.current = url;
      setPdfBlobUrl(url);
    } catch {
      // silent
    } finally {
      setIsPdfGenerating(false);
    }
  };

  useEffect(() => {
    if (currentStepDef?.id !== "review") return;
    const t = setTimeout(() => { generatePreviewPdf(); }, 600);
    return () => clearTimeout(t);
  }, [currentStepDef?.id, sectionOrder.join(","), hiddenSections.join(","), pageBreaks.join(","), subject, JSON.stringify(sectionTextOverrides)]);

  const handleSubmit = async () => {
    if (!customerId || !subject || cart.length === 0) return;
    
    const salesmanName = `${user?.name || ""} ${user?.surname || ""}`.trim() || offer?.salesmanName || "Sales Team";

    const payload = {
      offer: {
        customerId: parseInt(customerId),
        subject,
        salesmanName,
        totalPrice: calculateTotal(),
        projectData: {
          ...projectData,
          hiddenSections,
          sectionOrder,
          pageBreaks,
          machineBreakPositions: (() => {
            const ordered = machineOrder.length > 0
              ? machineOrder.map(tid => cart.find(c => c.tempId === tid)).filter(Boolean) as typeof cart
              : cart;
            return machinePageBreaks.map(tid => ordered.findIndex(c => c.tempId === tid)).filter(i => i > 0);
          })(),
          termsBreakPositions: termsPageBreaks,
          layout,
          layoutDrawing,
          sectionTextOverrides,
          machineDescOverrides,
          headerInfo: {
            date: headerDate,
            salesman: { name: headerSalesmanName, email: headerSalesmanEmail, mobile: headerSalesmanMobile },
            customer: { name: headerCustomerName, contactPerson: headerCustomerContact, email: headerCustomerEmail, address: headerCustomerAddress },
          },
          technicalSpecs: technicalSpecs,
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
      items: (machineOrder.length > 0
        ? machineOrder.map(tid => cart.find(c => c.tempId === tid)).filter(Boolean) as typeof cart
        : cart).map(item => ({
        machineId: item.machineId,
        quantity: item.quantity,
        optionIds: item.selectedOptionIds,
        optionQuantities: item.optionQuantities,
        customBasePrice: item.basePrice,
        customOptionPrices: item.optionPrices,
      }))
    };

    await updateOffer.mutateAsync({ offerId, payload });
    setLocation(`/offers/${offerId}`);
  };

  const selectedMachine = machines?.find(m => m.id.toString() === activeMachineId);
  const techSpecSection = formatSettings?.sections?.find((s: any) => s.id === "technical_specs");
  const tsLbl = (key: string, fallback: string) => (techSpecSection?.labels?.[key] as string) || fallback;

  useEffect(() => {
    if (initialized) return;
    if (!formatSettings?.sections) return;
    const priceSection = formatSettings.sections.find((s: any) => s.id === "price_overview");
    if (!priceSection?.labels) return;
    const fl = priceSection.labels;
    setPriceLabels(prev => ({
      interlocking:   fl.interlocking   || prev.interlocking,
      totalListPrice: fl.totalListPrice || prev.totalListPrice,
      installation:   fl.installation   || prev.installation,
      travelCosts:    fl.travelCosts    || prev.travelCosts,
      boardLodging:   fl.boardLodging   || prev.boardLodging,
      training:       fl.training       || prev.training,
      packaging:      fl.packaging      || prev.packaging,
      transport:      fl.transport      || prev.transport,
      grossTotal:     fl.grossTotal     || prev.grossTotal,
      netTotal:       fl.netTotal       || prev.netTotal,
    }));
  }, [formatSettings, initialized]);

  useEffect(() => {
    if (initialized) return;
    if (!formatSettings?.sections) return;
    const tsSec = formatSettings.sections.find((s: any) => s.id === "technical_specs");
    if (!tsSec?.labels) return;
    const l = tsSec.labels;
    setTechnicalSpecs(prev => ({
      ...prev,
      paint:     prev.paint     || l.paintVal     || "",
      substrate: prev.substrate || l.substrateVal || "",
      finishing: prev.finishing || l.finishingVal || "",
    }));
  }, [formatSettings, initialized]);

  useEffect(() => {
    if (!initialized || !formatSettings?.sections?.length) return;
    setSectionOrder(prev => {
      if (prev.length > 0) return prev;
      return (formatSettings.sections as any[]).filter(s => s.enabled).map(s => s.id);
    });
  }, [initialized, formatSettings]);

  const updateSpec = (field: keyof TechnicalSpecs, value: string) => {
    setTechnicalSpecs(prev => ({ ...prev, [field]: value }));
  };

  if (offerLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!offer) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Offer not found.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-20">
        <div>
          <PageHeader
            title="Edit Offer"
            subtitle={offer.referenceNumber}
          />
          <div className="flex items-center gap-1 mt-4 text-sm font-medium flex-wrap">
            {wizardSteps.map(({ id, label }, i) => {
              const n = i + 1;
              return (
                <>
                  {i > 0 && <ChevronRight key={`sep-${n}`} className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <button
                    key={id}
                    type="button"
                    onClick={() => setStep(n)}
                    className={cn(
                      "transition-colors rounded px-1",
                      step === n ? "text-primary font-bold" : "text-primary/70 hover:text-primary cursor-pointer"
                    )}
                  >
                    {n}. {label}
                  </button>
                </>
              );
            })}
          </div>
        </div>

        <Card className="border-border shadow-md">
          <CardContent className="p-6">
            {currentStepDef?.intro && (
              <p className="text-sm text-muted-foreground italic mb-4 border-l-2 border-primary/30 pl-3">{currentStepDef.intro}</p>
            )}
            <AnimatePresence mode="wait">
              {currentStepDef?.id === "customer" && (
                <motion.div
                  key="customer"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <Label>Select Customer</Label>
                    <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setSelectedContactId(""); setHeaderCustomerContact(""); setHeaderCustomerEmail(""); }}>
                      <SelectTrigger className="h-12 text-lg" data-testid="select-customer">
                        <SelectValue placeholder="Choose a client..." />
                      </SelectTrigger>
                      <SelectContent>
                        {customers?.map((c) => (
                          <SelectItem key={c.id} value={c.id.toString()}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {customerId && (
                    <div className="space-y-2">
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

              {currentStepDef?.id === "details" && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <h3 className="font-semibold text-lg border-b pb-2">Date &amp; Parties</h3>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</Label>
                    <Input
                      type="date"
                      value={headerDate}
                      onChange={(e) => setHeaderDate(e.target.value)}
                      data-testid="input-header-date"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Salesman</Label>
                    <div className="grid md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Name</Label>
                        <Input value={headerSalesmanName} onChange={(e) => setHeaderSalesmanName(e.target.value)} placeholder="Salesman name" data-testid="input-salesman-name" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Email</Label>
                        <Input value={headerSalesmanEmail} onChange={(e) => setHeaderSalesmanEmail(e.target.value)} placeholder="email@company.com" data-testid="input-salesman-email" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Mobile</Label>
                        <Input value={headerSalesmanMobile} onChange={(e) => setHeaderSalesmanMobile(e.target.value)} placeholder="+39 ..." data-testid="input-salesman-mobile" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</Label>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Company Name</Label>
                        <Input value={headerCustomerName} onChange={(e) => setHeaderCustomerName(e.target.value)} placeholder="Company name" data-testid="input-customer-name" />
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
                          <Input value={headerCustomerContact} onChange={(e) => setHeaderCustomerContact(e.target.value)} placeholder="Contact person" data-testid="input-customer-contact" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Email</Label>
                        <Input value={headerCustomerEmail} onChange={(e) => setHeaderCustomerEmail(e.target.value)} placeholder="customer@email.com" data-testid="input-customer-email" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Address</Label>
                        <Input value={headerCustomerAddress} onChange={(e) => setHeaderCustomerAddress(e.target.value)} placeholder="Address" data-testid="input-customer-address" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "subject" && (
                <motion.div
                  key="subject"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <h3 className="font-semibold text-lg border-b pb-2">{currentStepDef?.label || "Project Data"}</h3>
                  <div className="space-y-2">
                    <Label>Subject / Offer Title</Label>
                    <Input 
                      placeholder="e.g. Production Line Upgrade for Factory A" 
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      data-testid="input-subject"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Layout</Label>
                    <Input
                      placeholder="e.g. 3"
                      value={layout}
                      onChange={(e) => setLayout(e.target.value)}
                      data-testid="input-layout"
                    />
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        ref={layoutFileRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={handleLayoutDrawingUpload}
                        data-testid="input-layout-drawing"
                      />
                      {layoutDrawing ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm w-full">
                          <FileText className="w-4 h-4 text-red-500 shrink-0" />
                          <a href={`/api/layout-drawings/${layoutDrawing.filename}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex-1" data-testid="link-layout-drawing">
                            {layoutDrawing.originalName}
                          </a>
                          <Button variant="ghost" size="sm" type="button" className="h-6 w-6 p-0 text-destructive shrink-0" onClick={handleRemoveDrawing} data-testid="btn-remove-drawing">
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" type="button" onClick={() => layoutFileRef.current?.click()} disabled={uploadingDrawing} data-testid="btn-upload-drawing">
                          {uploadingDrawing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                          Attach Layout Drawing (PDF)
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "specs" && (
                <motion.div
                  key="specs"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <h3 className="font-semibold text-lg border-b pb-2">{currentStepDef?.label || "Technical Specifications"}</h3>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{tsLbl("minMaxLength", "Min/Max. length of the pieces (mm)")}</Label>
                      <Input 
                        placeholder="e.g. 300-2500"
                        value={technicalSpecs.minMaxLength}
                        onChange={(e) => updateSpec("minMaxLength", e.target.value)}
                        data-testid="input-min-max-length"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{tsLbl("maxWidth", "Max. width of the pieces (mm)")}</Label>
                      <Input 
                        placeholder="e.g. 1300"
                        value={technicalSpecs.maxWidth}
                        onChange={(e) => updateSpec("maxWidth", e.target.value)}
                        data-testid="input-max-width"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{tsLbl("minMaxThickness", "Min/Max. thickness (mm)")}</Label>
                      <Input 
                        placeholder="e.g. 8-50"
                        value={technicalSpecs.minMaxThickness}
                        onChange={(e) => updateSpec("minMaxThickness", e.target.value)}
                        data-testid="input-thickness"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{tsLbl("averageLineSpeed", "Average line speed (mt/min)")}</Label>
                      <Input 
                        placeholder="e.g. 5-15"
                        value={technicalSpecs.averageLineSpeed}
                        onChange={(e) => updateSpec("averageLineSpeed", e.target.value)}
                        data-testid="input-line-speed"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{tsLbl("controlSide", "Control side")}</Label>
                      <Input 
                        placeholder="e.g. Right / Left"
                        value={technicalSpecs.controlSide}
                        onChange={(e) => updateSpec("controlSide", e.target.value)}
                        data-testid="input-control-side"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{tsLbl("maxBow", "Max. bow of the panel")}</Label>
                      <Input 
                        value={technicalSpecs.maxBow}
                        onChange={(e) => updateSpec("maxBow", e.target.value)}
                        data-testid="input-max-bow"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{tsLbl("paint", "Paint")}</Label>
                      <Input 
                        value={technicalSpecs.paint}
                        onChange={(e) => updateSpec("paint", e.target.value)}
                        data-testid="input-paint"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{tsLbl("substrate", "Substrate")}</Label>
                      <Input 
                        value={technicalSpecs.substrate}
                        onChange={(e) => updateSpec("substrate", e.target.value)}
                        data-testid="input-substrate"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{tsLbl("finishing", "Finishing")}</Label>
                      <Input 
                        value={technicalSpecs.finishing}
                        onChange={(e) => updateSpec("finishing", e.target.value)}
                        data-testid="input-finishing"
                      />
                    </div>
                  </div>

                  <h3 className="font-semibold text-lg border-b pb-2 mt-8">Standard Specifications</h3>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>{tsLbl("standardVoltage", "Standard voltage")}</Label>
                      <Input 
                        value={technicalSpecs.standardVoltage}
                        onChange={(e) => updateSpec("standardVoltage", e.target.value)}
                        data-testid="input-voltage"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{tsLbl("standardColors", "Standard colors")}</Label>
                      <Input 
                        value={technicalSpecs.standardColors}
                        onChange={(e) => updateSpec("standardColors", e.target.value)}
                        data-testid="input-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{tsLbl("components", "Components")}</Label>
                      <textarea 
                        className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        value={technicalSpecs.components}
                        onChange={(e) => updateSpec("components", e.target.value)}
                        data-testid="input-components"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{tsLbl("precautions", "Precautions")}</Label>
                      <textarea 
                        className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        value={technicalSpecs.precautions}
                        onChange={(e) => updateSpec("precautions", e.target.value)}
                        data-testid="input-precautions"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{tsLbl("commissioning", "Commissioning and start-up")}</Label>
                      <textarea 
                        className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        value={technicalSpecs.commissioning}
                        onChange={(e) => updateSpec("commissioning", e.target.value)}
                        data-testid="input-commissioning"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "composition" && (
                <motion.div
                  key="composition"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  {/* Add Line Item — full width */}
                  <div className="space-y-4 p-4 bg-muted/30 rounded-xl border border-border/50">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Add Line Item
                      </h3>
                      <Button
                        onClick={handleAddMachine}
                        disabled={!activeMachineId}
                        data-testid="button-add-item-top"
                      >
                        Add to Offer
                      </Button>
                    </div>

                    <MachinePicker
                      machines={machines}
                      value={activeMachineId}
                      onChange={setActiveMachineId}
                    />

                    {selectedMachine && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="space-y-4 pt-2"
                      >
                        <div className="flex items-end gap-4">
                          <div className="space-y-1">
                            <Label>Quantity</Label>
                            <Input
                              type="number"
                              min="1"
                              value={activeQuantity}
                              onChange={(e) => setActiveQuantity(parseInt(e.target.value))}
                              className="w-24"
                              data-testid="input-quantity"
                            />
                          </div>
                        </div>

                        {selectedMachine.options.length > 0 && (
                          <div className="space-y-2">
                            <Label>Options</Label>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {[...selectedMachine.options]
                                .sort((a, b) => ((a as any).seqNum ?? 999999) - ((b as any).seqNum ?? 999999))
                                .map((opt) => {
                                  const isChecked = activeOptions.includes(opt.id);
                                  return (
                                    <div key={opt.id} className="flex items-center gap-2 p-2 border rounded-md bg-background">
                                      <Checkbox
                                        id={`opt-${opt.id}`}
                                        checked={isChecked}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setActiveOptions([...activeOptions, opt.id]);
                                            setActiveOptionQuantities(q => ({ ...q, [opt.id]: 1 }));
                                          } else {
                                            setActiveOptions(activeOptions.filter(id => id !== opt.id));
                                            setActiveOptionQuantities(q => { const n = { ...q }; delete n[opt.id]; return n; });
                                          }
                                        }}
                                      />
                                      <label htmlFor={`opt-${opt.id}`} className="text-sm leading-tight cursor-pointer flex-1 min-w-0">
                                        <span className="font-medium">{opt.name}</span>
                                        <span className="block text-xs text-muted-foreground">+€{parseFloat(opt.priceModifier as unknown as string).toLocaleString()}</span>
                                      </label>
                                      {isChecked && (
                                        <Input
                                          type="number"
                                          min="1"
                                          value={activeOptionQuantities[opt.id] ?? 1}
                                          onChange={(e) => {
                                            const v = Math.max(1, parseInt(e.target.value) || 1);
                                            setActiveOptionQuantities(q => ({ ...q, [opt.id]: v }));
                                          }}
                                          className="w-14 h-7 text-xs shrink-0"
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

                    <Button
                      onClick={handleAddMachine}
                      disabled={!activeMachineId}
                      className="w-full"
                      data-testid="button-add-item"
                    >
                      Add to Offer
                    </Button>
                  </div>

                  {/* Current Items — full width below */}
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
                                const totalItemPrice = (item.basePrice + getItemOptionsTotal(item)) * item.quantity;
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
                                        {/* Machine header row */}
                                        <div className="flex items-center gap-2 mb-3">
                                          <div
                                            {...provided.dragHandleProps}
                                            className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground shrink-0"
                                            data-testid={`drag-handle-${index}`}
                                          >
                                            <GripVertical className="w-4 h-4" />
                                          </div>
                                          <span className="font-bold text-primary shrink-0">Pos. {position}</span>
                                          <span className="font-medium flex-1 truncate">{machine?.name}</span>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <Label className="text-xs text-muted-foreground">Qty</Label>
                                            <Input
                                              type="number"
                                              min="1"
                                              value={item.quantity}
                                              onChange={(e) => {
                                                const v = Math.max(1, parseInt(e.target.value) || 1);
                                                setCart(prev => prev.map(c => c.tempId === item.tempId ? { ...c, quantity: v } : c));
                                              }}
                                              className="w-16 h-7 text-sm"
                                              data-testid={`input-cart-qty-${index}`}
                                            />
                                            <span className="font-mono font-semibold text-sm">€{totalItemPrice.toLocaleString()}</span>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-7 w-7 text-destructive"
                                              onClick={() => handleRemoveItem(item.tempId)}
                                              data-testid={`button-remove-item-${index}`}
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                          </div>
                                        </div>

                                        {/* Options */}
                                        {allOptions.length > 0 && (() => {
                                          const isExpanded = showAllOptions.has(item.tempId);
                                          const visibleOptions = isExpanded ? allOptions : allOptions.filter(o => item.selectedOptionIds.includes(o.id));
                                          const hiddenCount = allOptions.length - item.selectedOptionIds.length;
                                          return (
                                            <div className="ml-8 space-y-1.5">
                                              {visibleOptions.length > 0 && (
                                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
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
                                                              const ids = checked
                                                                ? [...c.selectedOptionIds, opt.id]
                                                                : c.selectedOptionIds.filter(id => id !== opt.id);
                                                              const oq = { ...c.optionQuantities };
                                                              if (checked) oq[opt.id] = 1;
                                                              else delete oq[opt.id];
                                                              return { ...c, selectedOptionIds: ids, optionQuantities: oq };
                                                            }));
                                                          }}
                                                          data-testid={`checkbox-cart-opt-${index}-${opt.id}`}
                                                        />
                                                        <label htmlFor={`cart-opt-${item.tempId}-${opt.id}`} className="text-xs leading-tight cursor-pointer flex-1 min-w-0">
                                                          <span className={isChecked ? "font-medium" : "text-muted-foreground"}>{opt.name}</span>
                                                          <span className="block text-muted-foreground">+€{parseFloat(opt.priceModifier as unknown as string).toLocaleString()}</span>
                                                        </label>
                                                        {isChecked && (
                                                          <Input
                                                            type="number"
                                                            min="1"
                                                            value={qty}
                                                            onChange={(e) => {
                                                              const v = Math.max(1, parseInt(e.target.value) || 1);
                                                              setCart(prev => prev.map(c => c.tempId === item.tempId
                                                                ? { ...c, optionQuantities: { ...c.optionQuantities, [opt.id]: v } }
                                                                : c
                                                              ));
                                                            }}
                                                            className="w-14 h-6 text-xs shrink-0"
                                                            data-testid={`input-cart-opt-qty-${index}-${opt.id}`}
                                                          />
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                              {hiddenCount > 0 && (
                                                <button
                                                  type="button"
                                                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                  onClick={() => setShowAllOptions(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(item.tempId)) next.delete(item.tempId);
                                                    else next.add(item.tempId);
                                                    return next;
                                                  })}
                                                  data-testid={`btn-toggle-options-${index}`}
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
                        <div className="border-t pt-4 flex justify-between items-center font-bold text-lg">
                          <span>Total</span>
                          <span>€{calculateTotal().toLocaleString()}</span>
                        </div>
                      </DragDropContext>
                    )}
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "pricing" && (
                <motion.div
                  key="pricing"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="font-semibold text-lg">Price Overview</h3>
                    <button
                      type="button"
                      onClick={() => setShowDetailedPrices(!showDetailedPrices)}
                      className={cn("text-xs font-medium px-3 py-1 rounded-full border transition-colors", showDetailedPrices ? "bg-muted text-foreground border-border" : "bg-primary/10 text-primary border-primary/30")}
                      data-testid="toggle-detailed-prices"
                    >
                      {showDetailedPrices ? "Hide Individual Prices" : "Show Individual Prices"}
                    </button>
                  </div>

                  {/* Machines and Options List */}
                  <div className="space-y-2">
                    {showDetailedPrices && (
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-1 mb-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item</span>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28 text-right">Unit Price €</span>
                        <span className="w-6" />
                        <span className="w-7" />
                      </div>
                    )}
                    {cart.map((item, index) => {
                      const machine = machines?.find(m => m.id === item.machineId);
                      const itemTotal = (item.basePrice + getItemOptionsTotal(item)) * item.quantity;
                      const hiddenSum = item.selectedOptionIds.reduce((s, id) => item.optionPriceHidden?.[id] ? s + (item.optionPrices[id] ?? 0) * (item.optionQuantities?.[id] ?? 1) : s, 0);
                      const displayedUnit = item.basePrice + hiddenSum;
                      const hiddenNames = item.selectedOptionIds.filter(id => item.optionPriceHidden?.[id]).map(id => machine?.options?.find(o => o.id === id)?.name ?? `Option #${id}`);
                      return (
                        <div key={item.tempId} className="border rounded-lg p-3 space-y-1.5">
                          <div className={cn("items-center", showDetailedPrices ? "grid grid-cols-[1fr_auto_auto_auto] gap-x-2" : "flex justify-between")}>
                            <span className="font-medium text-sm">Pos. {index + 1}: {machine?.name} ×{item.quantity}</span>
                            {showDetailedPrices ? (
                              <>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Input
                                    type="number"
                                    value={displayedUnit || ""}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      const newBase = val - hiddenSum;
                                      setCart(cart.map(ci => ci.tempId === item.tempId ? { ...ci, basePrice: newBase } : ci));
                                    }}
                                    className="w-28 h-7 text-xs font-mono text-right"
                                    data-testid={`input-machine-price-${index}`}
                                    title={hiddenSum > 0 ? `Include opzioni nascoste (+€${hiddenSum.toLocaleString()}): ${hiddenNames.join(", ")}` : undefined}
                                  />
                                </div>
                                <CommentButton
                                  comment={item.comment}
                                  onChange={(v) => setCart(cart.map(ci => ci.tempId === item.tempId ? { ...ci, comment: v } : ci))}
                                  data-testid={`comment-machine-${index}`}
                                />
                                <span className="w-7" />
                              </>
                            ) : (
                              <CommentButton
                                comment={item.comment}
                                onChange={(v) => setCart(cart.map(ci => ci.tempId === item.tempId ? { ...ci, comment: v } : ci))}
                                data-testid={`comment-machine-${index}`}
                              />
                            )}
                          </div>
                          {showDetailedPrices && hiddenSum > 0 && (
                            <div className="text-[10px] text-muted-foreground italic pl-1" data-testid={`text-hidden-options-hint-${index}`}>
                              include opzioni "Incl." (+€{hiddenSum.toLocaleString()}): {hiddenNames.join(", ")}
                            </div>
                          )}
                          {showDetailedPrices && item.selectedOptionIds.map(optId => {
                            const opt = machine?.options.find(o => o.id === optId);
                            if (!opt) return null;
                            const isHidden = !!item.optionPriceHidden?.[optId];
                            const toggleHidden = () => setCart(cart.map(ci => ci.tempId === item.tempId
                              ? { ...ci, optionPriceHidden: { ...ci.optionPriceHidden, [optId]: !isHidden } }
                              : ci));
                            const optQty = item.optionQuantities?.[optId] ?? 1;
                            return (
                              <div key={optId} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center pl-4">
                                <span className="text-xs text-muted-foreground">
                                  + {opt.name}{optQty > 1 ? ` ×${optQty}` : ""}
                                </span>
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
                                      data-testid={`input-option-price-${index}-${optId}`}
                                    />
                                  )}
                                </div>
                                <CommentButton
                                  comment={item.optionComments[optId] ?? ""}
                                  onChange={(v) => setCart(cart.map(ci => ci.tempId === item.tempId
                                    ? { ...ci, optionComments: { ...ci.optionComments, [optId]: v } }
                                    : ci))}
                                  data-testid={`input-option-comment-${index}-${optId}`}
                                />
                                <button
                                  type="button"
                                  onClick={toggleHidden}
                                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  title={isHidden ? "Show option price separately" : "Merge price into machine"}
                                  data-testid={`btn-toggle-option-price-${index}-${optId}`}
                                >
                                  {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            );
                          })}
                          {showDetailedPrices && (
                            <div className="flex justify-between items-center text-sm font-medium pt-1 border-t mt-1">
                              <span className="text-muted-foreground">Subtotal</span>
                              <span className="font-mono">€{itemTotal.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex justify-between items-center font-medium pt-1 px-1">
                      <span>Machines Total</span>
                      <span className="font-mono">€{calculateMachinesTotal().toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Interlocking */}
                  <div className="border rounded-lg p-3 bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Input
                        value={priceLabels.interlocking}
                        onChange={(e) => setPriceLabels(prev => ({ ...prev, interlocking: e.target.value }))}
                        className="h-7 text-sm font-medium w-40 shrink-0"
                        data-testid="label-interlocking"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">({cart.length} pos. ×</span>
                      <div className="flex items-center gap-1">
                        <span className="text-sm">€</span>
                        <Input
                          type="number"
                          value={interlockingPricePerPosition || ""}
                          onChange={(e) => setInterlockingPricePerPosition(parseFloat(e.target.value) || 0)}
                          className="w-20 h-7 text-xs font-mono"
                          data-testid="input-interlocking-price"
                        />
                        <span className="text-xs text-muted-foreground">)</span>
                      </div>
                      <span className="font-mono font-medium ml-auto">€{calculateInterlocking().toLocaleString()}</span>
                      <CommentButton
                        comment={priceComments.interlocking}
                        onChange={(v) => setPriceComments(prev => ({ ...prev, interlocking: v }))}
                        data-testid="comment-interlocking"
                      />
                    </div>
                  </div>

                  {/* Extra Items */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="font-medium text-sm text-muted-foreground">Extra Items</h4>
                      <Button size="sm" variant="outline" onClick={addExtraItem} data-testid="button-add-extra">
                        <Plus className="w-3 h-3 mr-1" /> Add Extra
                      </Button>
                    </div>
                    {extraItems.map((extra, index) => (
                      <div key={extra.id} className="flex gap-3 items-center">
                        <Input 
                          placeholder="Description"
                          value={extra.description}
                          onChange={(e) => updateExtraItem(extra.id, "description", e.target.value)}
                          className="flex-1"
                          data-testid={`input-extra-desc-${index}`}
                        />
                        <div className="flex items-center gap-1">
                          <span>€</span>
                          <Input 
                            type="number"
                            placeholder="0"
                            value={extra.price || ""}
                            onChange={(e) => updateExtraItem(extra.id, "price", parseFloat(e.target.value) || 0)}
                            className="w-28"
                            data-testid={`input-extra-price-${index}`}
                          />
                        </div>
                        <CommentButton
                          comment={priceComments.extras[extra.id] || ''}
                          onChange={(v) => setPriceComments(prev => ({ ...prev, extras: { ...prev.extras, [extra.id]: v } }))}
                          data-testid={`comment-extra-${index}`}
                        />
                        <Button size="icon" variant="ghost" onClick={() => removeExtraItem(extra.id)} data-testid={`button-remove-extra-${index}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    {extraItems.length > 0 && (
                      <div className="flex justify-between items-center font-medium pt-2">
                        <span>Extras Total</span>
                        <span className="font-mono">€{calculateExtrasTotal().toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  {/* TOTAL LIST PRICE */}
                  <div className="border-2 border-primary/30 rounded-lg p-3 bg-primary/5">
                    <div className="flex items-center gap-3">
                      <Input
                        value={priceLabels.totalListPrice}
                        onChange={(e) => setPriceLabels(prev => ({ ...prev, totalListPrice: e.target.value }))}
                        className="h-7 text-sm font-bold flex-1"
                        data-testid="label-total-list-price"
                      />
                      <span className="font-mono font-bold shrink-0">€{calculateTotalListPrice().toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Discount */}
                  <div className="border rounded-lg p-3 bg-muted/30">
                    <div className="flex justify-between items-center gap-4">
                      <span className="font-medium">Discount (%)</span>
                      <div className="flex items-center gap-2">
                        <Input 
                          type="number"
                          min="0"
                          max="100"
                          value={discountPercent || ""}
                          onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                          className="w-24"
                          data-testid="input-discount"
                        />
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

                  {/* Service Items */}
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground">Services</h4>
                    <div className="border rounded-lg p-3 space-y-3">
                      {/* Installation */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Input value={priceLabels.installation} onChange={(e) => setPriceLabels(prev => ({ ...prev, installation: e.target.value }))} className="h-7 text-sm font-medium flex-1" data-testid="label-installation" />
                          <div className="flex items-center gap-2">
                            <CommentButton
                              comment={priceComments.installation}
                              onChange={(v) => setPriceComments(prev => ({ ...prev, installation: v }))}
                              data-testid="comment-installation"
                            />
                            <button
                              type="button"
                              onClick={() => setInstallationConfig(prev => ({ ...prev, included: !prev.included }))}
                              className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", installationConfig.included ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")}
                              data-testid="toggle-installation-included"
                            >
                              {installationConfig.included ? "INCLUDED" : "EXCLUDED"}
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Daily fee</span>
                              <button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, hideDailyFee: !prev.hideDailyFee }))} className="text-muted-foreground hover:text-foreground transition-colors" title={installationConfig.hideDailyFee ? "Hidden in document" : "Shown in document"} data-testid="toggle-hide-daily-fee">
                                {installationConfig.hideDailyFee ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={installationConfig.dailyFee || ""}
                                onChange={(e) => {
                                  const dailyFee = parseFloat(e.target.value) || 0;
                                  setInstallationConfig(prev => ({ ...prev, dailyFee, totalPrice: dailyFee * prev.totalDays }));
                                }}
                                className="flex-1 h-7 text-xs font-mono"
                                data-testid="input-installation-daily-fee"
                              />
                              <span className="text-xs text-muted-foreground shrink-0">€/day</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Days</span>
                              <button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, hideTotalDays: !prev.hideTotalDays }))} className="text-muted-foreground hover:text-foreground transition-colors" title={installationConfig.hideTotalDays ? "Hidden in document" : "Shown in document"} data-testid="toggle-hide-installation-days">
                                {installationConfig.hideTotalDays ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={installationConfig.totalDays || ""}
                                onChange={(e) => {
                                  const totalDays = parseFloat(e.target.value) || 0;
                                  setInstallationConfig(prev => ({ ...prev, totalDays, totalPrice: prev.dailyFee * totalDays }));
                                }}
                                className="flex-1 h-7 text-xs font-mono"
                                data-testid="input-installation-days"
                              />
                              <span className="text-xs text-muted-foreground shrink-0">days</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Total</span>
                              <button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, hideTotalPrice: !prev.hideTotalPrice }))} className="text-muted-foreground hover:text-foreground transition-colors" title={installationConfig.hideTotalPrice ? "Hidden in document" : "Shown in document"} data-testid="toggle-hide-installation-total">
                                {installationConfig.hideTotalPrice ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground shrink-0">€</span>
                              <Input
                                type="number"
                                value={installationConfig.totalPrice || ""}
                                onChange={(e) => setInstallationConfig(prev => ({ ...prev, totalPrice: parseFloat(e.target.value) || 0 }))}
                                className="flex-1 h-7 text-xs font-mono"
                                data-testid="input-installation-total"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <Input value={priceLabels.travelCosts} onChange={(e) => setPriceLabels(prev => ({ ...prev, travelCosts: e.target.value }))} className="h-7 text-sm flex-1" data-testid="label-travel" />
                        <div className="flex items-center gap-2">
                          <CommentButton
                            comment={priceComments.travel}
                            onChange={(v) => setPriceComments(prev => ({ ...prev, travel: v }))}
                            data-testid="comment-travel"
                          />
                          <button
                            type="button"
                            onClick={() => setServiceItems({...serviceItems, travelCosts: !serviceItems.travelCosts})}
                            className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.travelCosts ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")}
                            data-testid="toggle-travel"
                          >
                            {serviceItems.travelCosts ? "INCLUDED" : "EXCLUDED"}
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <Input value={priceLabels.boardLodging} onChange={(e) => setPriceLabels(prev => ({ ...prev, boardLodging: e.target.value }))} className="h-7 text-sm flex-1" data-testid="label-board" />
                        <div className="flex items-center gap-2">
                          <CommentButton
                            comment={priceComments.boardLodging}
                            onChange={(v) => setPriceComments(prev => ({ ...prev, boardLodging: v }))}
                            data-testid="comment-board-lodging"
                          />
                          <button
                            type="button"
                            onClick={() => setServiceItems({...serviceItems, boardLodging: !serviceItems.boardLodging})}
                            className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.boardLodging ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")}
                            data-testid="toggle-board"
                          >
                            {serviceItems.boardLodging ? "INCLUDED" : "EXCLUDED"}
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <Input value={priceLabels.training} onChange={(e) => setPriceLabels(prev => ({ ...prev, training: e.target.value }))} className="h-7 text-sm flex-1" data-testid="label-training" />
                        <div className="flex items-center gap-2 shrink-0">
                          <CommentButton
                            comment={priceComments.training}
                            onChange={(v) => setPriceComments(prev => ({ ...prev, training: v }))}
                            data-testid="comment-training"
                          />
                          <div className="flex items-center gap-1">
                            <Input 
                              value={serviceItems.trainingDays}
                              onChange={(e) => setServiceItems({...serviceItems, trainingDays: e.target.value})}
                              className="w-16"
                              data-testid="input-training-days"
                            />
                            <span className="text-sm text-muted-foreground">days</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setServiceItems({...serviceItems, trainingIncluded: !serviceItems.trainingIncluded})}
                            className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.trainingIncluded ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")}
                            data-testid="toggle-training"
                          >
                            {serviceItems.trainingIncluded ? "INCLUDED" : "EXCLUDED"}
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <Input value={priceLabels.packaging} onChange={(e) => setPriceLabels(prev => ({ ...prev, packaging: e.target.value }))} className="h-7 text-sm flex-1" data-testid="label-packaging" />
                        <div className="flex items-center gap-2">
                          <CommentButton
                            comment={priceComments.packaging}
                            onChange={(v) => setPriceComments(prev => ({ ...prev, packaging: v }))}
                            data-testid="comment-packaging"
                          />
                          <button
                            type="button"
                            onClick={() => setServiceItems({...serviceItems, packaging: !serviceItems.packaging})}
                            className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.packaging ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")}
                            data-testid="toggle-packaging"
                          >
                            {serviceItems.packaging ? "INCLUDED" : "EXCLUDED"}
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <Input value={priceLabels.transport} onChange={(e) => setPriceLabels(prev => ({ ...prev, transport: e.target.value }))} className="h-7 text-sm flex-1" data-testid="label-transport" />
                        <div className="flex items-center gap-2 shrink-0">
                          <CommentButton
                            comment={priceComments.transport}
                            onChange={(v) => setPriceComments(prev => ({ ...prev, transport: v }))}
                            data-testid="comment-transport"
                          />
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">€</span>
                            <Input
                              type="number"
                              value={serviceItems.transportPrice || ""}
                              onChange={(e) => setServiceItems({...serviceItems, transportPrice: parseFloat(e.target.value) || 0})}
                              className="w-24 h-7 text-xs font-mono"
                              data-testid="input-transport-price"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setServiceItems({...serviceItems, transportIncluded: !serviceItems.transportIncluded})}
                            className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.transportIncluded ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")}
                            data-testid="toggle-transport"
                          >
                            {serviceItems.transportIncluded ? "INCLUDED" : "EXCLUDED"}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center font-medium pt-2">
                      <span>Services Total</span>
                      <span className="font-mono">€{calculateServicesTotal().toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="border-t-2 pt-4 space-y-2">
                    <div className="flex justify-between items-center gap-4">
                      <Input value={priceLabels.grossTotal} onChange={(e) => setPriceLabels(prev => ({ ...prev, grossTotal: e.target.value }))} className="h-7 text-base font-medium w-48" data-testid="label-gross-total" />
                      <span className="font-mono font-bold text-lg">€{calculateGrossTotal().toLocaleString()}</span>
                    </div>
                    {discountPercent > 0 && (
                      <div className="flex justify-between items-center gap-4 text-primary">
                        <Input value={priceLabels.netTotal} onChange={(e) => setPriceLabels(prev => ({ ...prev, netTotal: e.target.value }))} className="h-7 text-base font-medium w-48" data-testid="label-net-total" />
                        <span className="font-mono font-bold text-lg">€{calculateNetTotal().toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "terms" && (
                <motion.div
                  key="terms"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="space-y-4">
                    <Label>{currentStepDef?.label || "Terms and Conditions"}</Label>
                    <div className="grid gap-3">
                      {presets?.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">No terms & conditions entries yet. Add them in the Terms & Conditions page.</p>
                      )}
                      {presets?.map((preset) => {
                        const selected = (projectData.selectedPresets || []).some((p: any) => p.id === preset.id);
                        return (
                          <div key={preset.id} className="flex items-start space-x-2 p-3 border rounded-md">
                            <Checkbox 
                              id={`preset-edit-${preset.id}`}
                              checked={selected}
                              onCheckedChange={(checked) => {
                                const current = projectData.selectedPresets || [];
                                if (checked) setProjectData({ ...projectData, selectedPresets: [...current, { id: preset.id, title: preset.title, content: preset.content }] });
                                else setProjectData({ ...projectData, selectedPresets: current.filter((p: any) => p.id !== preset.id) });
                              }}
                              data-testid={`checkbox-preset-${preset.id}`}
                            />
                            <div>
                              <label htmlFor={`preset-edit-${preset.id}`} className="font-medium text-sm block cursor-pointer">
                                {preset.title || "(no title)"}
                              </label>
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
                <motion.div
                  key="review"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 className="font-semibold text-lg">Review & AI</h3>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateDraft}
                        disabled={draftOfferText.isPending || !subject || cart.length === 0}
                        data-testid="button-generate-draft"
                      >
                        {draftOfferText.isPending ? (
                          <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generating...</>
                        ) : (
                          <><Sparkles className="h-4 w-4 mr-1" /> Generate draft</>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReviewRisks}
                        disabled={reviewRisks.isPending || !subject || cart.length === 0}
                        data-testid="button-review-risks"
                      >
                        {reviewRisks.isPending ? (
                          <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Reviewing...</>
                        ) : (
                          <><Sparkles className="h-4 w-4 mr-1" /> Review with AI</>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSafetyCheck}
                        disabled={configSafetyGuard.isPending || !subject || cart.length === 0}
                        data-testid="button-safety-check"
                      >
                        {configSafetyGuard.isPending ? (
                          <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Checking...</>
                        ) : (
                          <><ShieldCheck className="h-4 w-4 mr-1" /> Safety Check</>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleShowBrain}
                        disabled={quoteContext.isFetching || cart.length === 0}
                        data-testid="button-sales-brain"
                      >
                        {quoteContext.isFetching ? (
                          <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Loading...</>
                        ) : (
                          <><Brain className="h-4 w-4 mr-1" /> Sales Brain</>
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className={cn(
                    "flex flex-col gap-4",
                    showAiPanel && isLargeScreen && "xl:flex-row"
                  )}>
                  <div className={cn("min-w-0", showAiPanel && isLargeScreen && "xl:flex-1")}>
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Left: DnD controls */}
                    <div className="lg:w-2/5 flex flex-col gap-4">
                      <div>
                        <h3 className="font-semibold text-lg border-b pb-2">Page Layout</h3>
                        <p className="text-sm text-muted-foreground mt-2">Drag sections to set their order. Use the page-break button to force a section to start on a new page. Uncheck to hide a section.</p>
                      </div>

                      {(() => {
                        const SECTION_LABELS: Record<string,string> = {
                          metadata: "Customer Details",
                          offer_title: "Offer Title",
                          technical_specs: "Technical Specifications",
                          machine_line: "Machines and Options",
                          utilities_summary: "Utilities Summary",
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
                            <Droppable droppableId="page-layout-sections">
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
                                              <div {...provided.dragHandleProps} className="cursor-grab text-muted-foreground shrink-0" data-testid={`drag-handle-${secId}`}>
                                                <GripVertical className="w-4 h-4" />
                                              </div>
                                              <label htmlFor={`section-vis-${secId}`} className={`font-medium text-sm flex-1 cursor-pointer ${isMachineLine ? "text-green-800 dark:text-green-300" : ""}`}>
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
                                                  title="Edit section text"
                                                  data-testid={`btn-edit-section-${secId}`}
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
                                                data-testid={`btn-pagebreak-${secId}`}
                                              >
                                                <CornerDownLeft className="w-3.5 h-3.5" />
                                              </Button>
                                              <Checkbox
                                                id={`section-vis-${secId}`}
                                                checked={isVisible}
                                                onCheckedChange={(checked) => {
                                                  if (checked) {
                                                    setHiddenSections(prev => prev.filter(id => id !== secId));
                                                  } else {
                                                    setHiddenSections(prev => [...prev, secId]);
                                                  }
                                                }}
                                                data-testid={`checkbox-section-${secId}`}
                                              />
                                            </div>

                                            {/* Machine position sub-rows */}
                                            {isMachineLine && isVisible && orderedCart.length > 0 && (
                                              <div className="ml-6 mt-1 mb-1 flex flex-col gap-0.5 border-l-2 border-green-200 pl-2">
                                                {orderedCart.map((item, posIdx) => {
                                                  const machine = machines?.find(m => m.id === item.machineId);
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
                                                        <span className="text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">{machine?.name ?? "—"}</span>
                                                        {posIdx > 0 && (
                                                          <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            type="button"
                                                            className={`h-5 w-5 p-0 shrink-0 ${hasMachBreak ? "text-primary bg-primary/10" : "text-muted-foreground/60"}`}
                                                            onClick={() => setMachinePageBreaks(prev => hasMachBreak ? prev.filter(t => t !== item.tempId) : [...prev, item.tempId])}
                                                            title={hasMachBreak ? "Remove page break before this position" : "Start this position on a new page"}
                                                            data-testid={`btn-machinebreak-${item.tempId}`}
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

                                            {/* Terms & Conditions preset sub-rows */}
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
                                                            data-testid={`btn-termsbreak-${preset.id}`}
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

                      {/* Section edit — full-page overlay */}
                      {editingSection !== null && (editingSection === "machine_line" || editingSection === "terms_conditions") && (
                        <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
                          <div className="flex items-center gap-3 border-b px-6 py-4 shrink-0 bg-card">
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              onClick={() => { setEditingSection(null); generatePreviewPdf(); }}
                              data-testid="btn-section-edit-close"
                            >
                              <X className="w-5 h-5" />
                            </Button>
                            <h2 className="font-semibold text-lg">
                              {editingSection === "machine_line" ? "Machines and Options" : "Terms & Conditions"}
                            </h2>
                            <div className="flex-1" />
                            <Button
                              type="button"
                              onClick={() => { setEditingSection(null); generatePreviewPdf(); }}
                              data-testid="btn-section-edit-save"
                            >
                              Save &amp; Preview
                            </Button>
                          </div>
                          <div className="flex-1 overflow-y-auto p-6 md:p-10">
                            <div className="max-w-6xl mx-auto flex flex-col gap-6">
                              {editingSection === "machine_line" && (
                                <>
                                  <p className="text-sm text-muted-foreground">Override the description shown for each machine in this offer (does not change the source data).</p>
                                  {cart.map((item) => {
                                    const machine = machines?.find(m => m.id === item.machineId);
                                    const currentVal = machineDescOverrides[item.machineId] ?? machine?.description ?? "";
                                    return (
                                      <div key={item.machineId} className="flex flex-col gap-1.5">
                                        <label className="text-sm font-medium">{machine?.name ?? `Machine #${item.machineId}`}</label>
                                        <Textarea
                                          rows={8}
                                          value={currentVal}
                                          onChange={(e) => setMachineDescOverrides(prev => ({ ...prev, [item.machineId]: e.target.value }))}
                                          data-testid={`textarea-machinedesc-${item.machineId}`}
                                        />
                                      </div>
                                    );
                                  })}
                                </>
                              )}
                              {editingSection === "terms_conditions" && (
                                <>
                                  {(projectData.selectedPresets ?? []).length === 0 && (
                                    <p className="text-sm text-muted-foreground">No terms presets selected. Add presets in the Terms &amp; Conditions step.</p>
                                  )}
                                  {(projectData.selectedPresets ?? []).map((preset: any, idx: number) => (
                                    <div key={idx} className="flex flex-col gap-2 border rounded-lg p-4">
                                      <Input
                                        className="font-semibold"
                                        value={preset.title ?? ""}
                                        onChange={(e) => {
                                          const updated = [...(projectData.selectedPresets ?? [])];
                                          updated[idx] = { ...updated[idx], title: e.target.value };
                                          setProjectData((prev: any) => ({ ...prev, selectedPresets: updated }));
                                        }}
                                        placeholder="Section title"
                                        data-testid={`input-preset-title-${idx}`}
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
                                        data-testid={`textarea-preset-content-${idx}`}
                                      />
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                        <h4 className="font-medium mb-2">Summary</h4>
                        <p className="text-sm text-muted-foreground">Customer: {customers?.find(c => c.id.toString() === customerId)?.name}</p>
                        <p className="text-sm text-muted-foreground">Items: {cart.length}</p>
                        <p className="text-sm text-muted-foreground">Visible sections: {(formatSettings?.sections ?? []).filter((s: any) => s.enabled).length - hiddenSections.length} of {(formatSettings?.sections ?? []).filter((s: any) => s.enabled).length}</p>
                        {pageBreaks.length > 0 && <p className="text-sm text-muted-foreground">Page breaks: {pageBreaks.length}</p>}
                        <p className="font-bold text-xl mt-2">€{calculateTotal().toLocaleString()}</p>
                      </div>
                    </div>

                    {/* Right: PDF preview */}
                    <div className="lg:w-3/5 flex flex-col gap-2" style={{ minHeight: "75vh" }}>
                      <p className="text-sm font-medium text-muted-foreground shrink-0">PDF Preview</p>
                      {isPdfGenerating && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 border rounded-xl bg-muted/20">
                          <Loader2 className="w-8 h-8 animate-spin text-primary" />
                          <p className="text-sm text-muted-foreground">Generating preview…</p>
                        </div>
                      )}
                      {!isPdfGenerating && pdfBlobUrl && (
                        <iframe
                          src={pdfBlobUrl}
                          className="flex-1 w-full rounded-xl border shadow-sm"
                          title="Offer PDF Preview"
                          style={{ minHeight: "70vh" }}
                        />
                      )}
                      {!isPdfGenerating && !pdfBlobUrl && (
                        <div className="flex-1 flex items-center justify-center border rounded-xl bg-muted/20 text-sm text-muted-foreground">
                          Preview will appear here
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                  {showAiPanel && isLargeScreen && (
                    <div className="xl:w-96 shrink-0 sticky top-0 self-start animate-in slide-in-from-right-5 duration-300">
                      <AIAssistantPanel
                        isLoading={activeLoading}
                        error={activeError}
                        run={activeRun}
                        output={activeOutput}
                        workflowType={activeWorkflowType}
                        onFeedback={handleDraftFeedback}
                        onDismiss={() => setShowAiPanel(false)}
                        onRetry={activeRetry}
                        feedbackPending={submitFeedback.isPending}
                        title={activeTitle}
                        draftCallbacks={aiPanelMode === "draft" ? draftCallbacks : undefined}
                      />
                    </div>
                  )}
                  </div>
                  {!isLargeScreen && showAiPanel && (
                    <div className="mt-6 border rounded-xl bg-card" data-testid="ai-panel-inline-mobile">
                      <AIAssistantPanel
                        isLoading={activeLoading}
                        error={activeError}
                        run={activeRun}
                        output={activeOutput}
                        workflowType={activeWorkflowType}
                        onFeedback={handleDraftFeedback}
                        onDismiss={() => setShowAiPanel(false)}
                        onRetry={activeRetry}
                        feedbackPending={submitFeedback.isPending}
                        title={activeTitle}
                        draftCallbacks={aiPanelMode === "draft" ? draftCallbacks : undefined}
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            
            <div className="flex justify-between items-center mt-8 pt-6 border-t">
              <Button 
                variant="outline" 
                onClick={() => setStep(step - 1)}
                disabled={step === 1 || wizardSteps.length === 0}
                data-testid="button-back"
                size="lg"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Back
              </Button>

              <span className="text-sm text-muted-foreground font-medium">{step} / {wizardSteps.length}</span>
              
              {step < wizardSteps.length ? (
                <Button 
                  onClick={() => setStep(step + 1)}
                  disabled={
                    (currentStepDef?.id === "customer" && !customerId) ||
                    (currentStepDef?.id === "composition" && cart.length === 0)
                  }
                  data-testid="button-next"
                  size="lg"
                >
                  Next
                  <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
              ) : (
                <Button 
                  onClick={handleSubmit} 
                  disabled={!subject || updateOffer.isPending}
                  className="bg-primary hover:bg-primary/90"
                  data-testid="button-save"
                  size="lg"
                >
                  {updateOffer.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
