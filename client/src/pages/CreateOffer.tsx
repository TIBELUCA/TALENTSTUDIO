import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useCustomers } from "@/hooks/use-customers";
import { useMachines } from "@/hooks/use-machines";
import { usePresets } from "@/hooks/use-presets";
import { useCreateOffer } from "@/hooks/use-offers";
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
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Loader2, Trash2, Plus, ChevronRight, ChevronLeft, Check, GripVertical, Eye, EyeOff, CornerDownLeft, Pencil, X, Sparkles, Upload, FileText, Users, User, ShieldCheck, Brain, Save, Ruler, Paperclip, Package, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MachinePicker } from "@/components/MachinePicker";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { CommentButton } from "@/components/CommentButton";
import { AIAssistantPanel } from "@/components/ai";
import type { MachineRecommendation, DraftInsertCallbacks } from "@/components/ai";
import { useRecommendMachines, useDraftOfferText, useReviewRisks, useConfigSafetyGuard, useQuoteContext, useSalesInsights, useOfferPatterns, useSubmitFeedback } from "@/hooks/use-ai-assistant";
import { useToast } from "@/hooks/use-toast";
import type { FamilyDefaults } from "./FamilyDefaults";
import type { Contact, Drawing, Offer } from "@shared/schema";
import { useWizardDraft } from "@/hooks/use-wizard-draft";

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

export default function CreateOffer() {
  const [, setLocation] = useLocation();

  const { user } = useAuth();
  const createOffer = useCreateOffer();
  const queryClient = useQueryClient();

  const fromEnquiryId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("fromEnquiry");
    return v ? parseInt(v) : null;
  }, []);
  
  const [customerId, setCustomerId] = useState<string>("");

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

  const { data: familyDefaults } = useQuery<FamilyDefaults>({
    queryKey: ["/api/settings/family-defaults"],
    queryFn: () => fetch("/api/settings/family-defaults", { credentials: "include" }).then(r => r.json()),
  });

  const { data: sourceEnquiry } = useQuery<any>({
    queryKey: ["/api/enquiries", fromEnquiryId],
    queryFn: () => fetch(`/api/enquiries/${fromEnquiryId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!fromEnquiryId,
  });

  const { data: availableDrawings = [] } = useQuery<Drawing[]>({
    queryKey: ["/api/drawings", { customerId }],
    queryFn: () => fetch(`/api/drawings?customerId=${customerId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!customerId,
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
  const [showAllOptions, setShowAllOptions] = useState<Set<string>>(new Set());
  const [technicalSpecs, setTechnicalSpecs] = useState<TechnicalSpecs>(defaultTechnicalSpecs);
  const formatDefaultsApplied = useRef(false);
  const draftRestoredRef = useRef(false);

  useEffect(() => {
    if (formatDefaultsApplied.current || draftRestoredRef.current || !formatSettings) return;
    const techSec = formatSettings.sections?.find((s: any) => s.id === "technical_specs");
    if (!techSec?.labels) return;
    formatDefaultsApplied.current = true;
    const enabledIds = (formatSettings.sections ?? []).filter((s: any) => s.enabled).map((s: any) => s.id);
    setSectionOrder(enabledIds);
    const lv = (key: string) => (techSec.labels as any)[key] ?? "";
    setTechnicalSpecs({
      minMaxLength:    lv("minMaxLengthVal"),
      maxWidth:        lv("maxWidthVal"),
      minMaxThickness: lv("minMaxThicknessVal"),
      averageLineSpeed:lv("averageLineSpeedVal"),
      controlSide:     lv("controlSideVal"),
      maxBow:          lv("maxBowVal"),
      paint:           lv("paintVal"),
      substrate:       lv("substrateVal"),
      finishing:       lv("finishingVal"),
      standardVoltage: lv("standardVoltageVal"),
      standardColors:  lv("standardColorsVal"),
      components:      lv("componentsVal"),
      precautions:     lv("precautionsVal"),
      airIntake:       lv("airIntakeVal"),
      commissioning:   lv("commissioningVal"),
    });
  }, [formatSettings]);

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

  const [activeMachineId, setActiveMachineId] = useState<string>("");
  const [activeQuantity, setActiveQuantity] = useState(1);
  const [activeOptions, setActiveOptions] = useState<number[]>([]);
  const [activeOptionQuantities, setActiveOptionQuantities] = useState<Record<number, number>>({});
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
  const [headerDate, setHeaderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [headerSalesmanName, setHeaderSalesmanName] = useState("");
  const [headerSalesmanEmail, setHeaderSalesmanEmail] = useState("");
  const [headerSalesmanMobile, setHeaderSalesmanMobile] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [headerCustomerName, setHeaderCustomerName] = useState("");
  const [headerCustomerContact, setHeaderCustomerContact] = useState("");
  const [headerCustomerEmail, setHeaderCustomerEmail] = useState("");
  const [headerCustomerAddress, setHeaderCustomerAddress] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [layout, setLayout] = useState("");
  const [layoutDrawing, setLayoutDrawing] = useState<{ filename: string; originalName: string } | null>(null);
  const [layoutDwg, setLayoutDwg] = useState<{ filename: string; originalName: string } | null>(null);
  const [includeLayoutInPdf, setIncludeLayoutInPdf] = useState(false);
  const [uploadingDrawing, setUploadingDrawing] = useState(false);
  const [uploadingDwg, setUploadingDwg] = useState(false);
  const layoutFileRef = useRef<HTMLInputElement>(null);
  const dwgFileRef = useRef<HTMLInputElement>(null);
  const [family, setFamily] = useState("");
  const [selectedDrawingId, setSelectedDrawingId] = useState<string>("");
  const [showDrawingRequestDialog, setShowDrawingRequestDialog] = useState(false);
  const [drawingRequestNotes, setDrawingRequestNotes] = useState("");
  const [drawingRequestFile, setDrawingRequestFile] = useState<File | null>(null);
  const [drawingRequestPending, setDrawingRequestPending] = useState(false);
  const [drawingRequestConfirmed, setDrawingRequestConfirmed] = useState(false);
  const [createdDrawingRequestId, setCreatedDrawingRequestId] = useState<number | null>(null);
  const drawingRequestFileRef = useRef<HTMLInputElement>(null);
  const enquiryPrefillApplied = useRef(false);
  const familyPrefillApplied = useRef(false);

  const { toast } = useToast();
  const recommendMachines = useRecommendMachines();
  const draftOfferText = useDraftOfferText();
  const reviewRisks = useReviewRisks();
  const configSafetyGuard = useConfigSafetyGuard();
  const submitFeedback = useSubmitFeedback();
  const [sectionTextOverrides, setSectionTextOverrides] = useState<Record<string, { intro?: string }>>({});
  const [machineDescOverrides, setMachineDescOverrides] = useState<Record<number, string>>({});
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiPanelMode, setAiPanelMode] = useState<"draft" | "risk" | "safety" | "brain">("draft");
  const [draftEditedTexts, setDraftEditedTexts] = useState<Record<string, string>>({});
  const [draftInsertedKeys, setDraftInsertedKeys] = useState<Set<string>>(new Set());
  const [addedFromAi, setAddedFromAi] = useState<Set<number>>(new Set());
  const [isLargeScreen, setIsLargeScreen] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [showDraftBanner, setShowDraftBanner] = useState(false);

  const draftState = useMemo(() => ({
    step,
    customerId,
    subject,
    cart,
    technicalSpecs,
    projectData,
    hiddenSections,
    sectionOrder,
    pageBreaks,
    machineOrder,
    machinePageBreaks,
    termsPageBreaks,
    extraItems,
    discountPercent,
    serviceItems,
    interlockingPricePerPosition,
    installationConfig,
    showDetailedPrices,
    priceComments,
    priceLabels,
    headerDate,
    headerSalesmanName,
    headerSalesmanEmail,
    headerSalesmanMobile,
    headerCustomerName,
    headerCustomerContact,
    headerCustomerEmail,
    headerCustomerAddress,
    selectedContactId,
    layout,
    layoutDrawing,
    layoutDwg,
    includeLayoutInPdf,
    family,
    sectionTextOverrides,
    machineDescOverrides,
  }), [
    step, customerId, subject, cart, technicalSpecs, projectData,
    hiddenSections, sectionOrder, pageBreaks, machineOrder, machinePageBreaks,
    termsPageBreaks, extraItems, discountPercent, serviceItems,
    interlockingPricePerPosition, installationConfig, showDetailedPrices,
    priceComments, priceLabels, headerDate, headerSalesmanName,
    headerSalesmanEmail, headerSalesmanMobile, headerCustomerName,
    headerCustomerContact, headerCustomerEmail, headerCustomerAddress,
    selectedContactId, layout, layoutDrawing, layoutDwg, includeLayoutInPdf, family,
    sectionTextOverrides, machineDescOverrides,
  ]);

  const draftKey = `talent-create-offer-draft:${user?.id ?? "anon"}`;
  const wizardDraft = useWizardDraft({
    key: draftKey,
    state: draftState,
    enabled: !fromEnquiryId,
  });

  const draftCheckedRef = useRef(false);
  useEffect(() => {
    if (draftCheckedRef.current) return;
    draftCheckedRef.current = true;
    if (fromEnquiryId) return;
    if (wizardDraft.hasDraft) {
      setShowDraftBanner(true);
    } else {
      wizardDraft.markReady();
    }
  }, []);

  useEffect(() => {
    if (!showDraftBanner) return;
    if (step > 1 || customerId || subject || cart.length > 0) {
      wizardDraft.markReady();
    }
  }, [step, customerId, subject, cart.length, showDraftBanner]);

  const restoreDraft = useCallback(() => {
    const saved = wizardDraft.restore();
    if (!saved) return;
    setStep(saved.step ?? 1);
    setCustomerId(saved.customerId ?? "");
    setSubject(saved.subject ?? "");
    setCart(saved.cart ?? []);
    setTechnicalSpecs(saved.technicalSpecs ?? defaultTechnicalSpecs);
    setProjectData(saved.projectData ?? { selectedPresets: [] });
    setHiddenSections(saved.hiddenSections ?? []);
    setSectionOrder(saved.sectionOrder ?? []);
    setPageBreaks(saved.pageBreaks ?? ["price_overview", "terms_conditions"]);
    setMachineOrder(saved.machineOrder ?? []);
    setMachinePageBreaks(saved.machinePageBreaks ?? []);
    setTermsPageBreaks(saved.termsPageBreaks ?? []);
    setExtraItems(saved.extraItems ?? []);
    setDiscountPercent(saved.discountPercent ?? 0);
    setServiceItems(saved.serviceItems ?? defaultServiceItems);
    setInterlockingPricePerPosition(saved.interlockingPricePerPosition ?? 500);
    setInstallationConfig(saved.installationConfig ?? { dailyFee: 850, totalDays: 0, totalPrice: 0, included: true, hideDailyFee: false, hideTotalDays: false, hideTotalPrice: false });
    setShowDetailedPrices(saved.showDetailedPrices ?? true);
    setPriceComments(saved.priceComments ?? { interlocking: '', installation: '', travel: '', boardLodging: '', training: '', packaging: '', transport: '', extras: {} });
    setPriceLabels(saved.priceLabels ?? { ...DEFAULT_PRICE_LABELS });
    setHeaderDate(saved.headerDate ?? new Date().toISOString().slice(0, 10));
    setHeaderSalesmanName(saved.headerSalesmanName ?? "");
    setHeaderSalesmanEmail(saved.headerSalesmanEmail ?? "");
    setHeaderSalesmanMobile(saved.headerSalesmanMobile ?? "");
    setHeaderCustomerName(saved.headerCustomerName ?? "");
    setHeaderCustomerContact(saved.headerCustomerContact ?? "");
    setHeaderCustomerEmail(saved.headerCustomerEmail ?? "");
    setHeaderCustomerAddress(saved.headerCustomerAddress ?? "");
    setSelectedContactId(saved.selectedContactId ?? "");
    setLayout(saved.layout ?? "");
    setLayoutDrawing(saved.layoutDrawing ?? null);
    setLayoutDwg(saved.layoutDwg ?? null);
    setIncludeLayoutInPdf(saved.includeLayoutInPdf ?? false);
    setFamily(saved.family ?? "");
    setSectionTextOverrides(saved.sectionTextOverrides ?? {});
    setMachineDescOverrides(saved.machineDescOverrides ?? {});
    draftRestoredRef.current = true;
    formatDefaultsApplied.current = true;
    setShowDraftBanner(false);
  }, [wizardDraft]);

  const handleDiscardDraft = useCallback(() => {
    wizardDraft.discard();
    setShowDraftBanner(false);
  }, [wizardDraft]);

  useEffect(() => {
    if (fromEnquiryId) return;
    const hasData = !!customerId || !!subject || cart.length > 0;
    if (!hasData) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [customerId, subject, cart.length, fromEnquiryId]);

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

  const handleRecommendMachines = () => {
    if (!machines || machines.length === 0) return;
    const customer = customers?.find((c: any) => c.id.toString() === customerId);
    const requirements = [
      subject && `Project: ${subject}`,
      layout && `Layout: ${layout}`,
      cart.length > 0 && `Already selected: ${cart.map(ci => machines.find(m => m.id === ci.machineId)?.name).filter(Boolean).join(", ")}`,
      sourceEnquiry?.notes && `Notes: ${sourceEnquiry.notes}`,
    ].filter(Boolean).join(". ");

    recommendMachines.mutate({
      requirements: requirements || "General machine line recommendation",
      customerIndustry: (customer as any)?.industry ?? undefined,
      availableMachines: machines.map(m => ({
        id: m.id,
        name: m.name,
        macroType: m.macroType,
        description: m.description,
        basePrice: String(m.basePrice),
        options: m.options.map(o => ({
          id: o.id,
          name: o.name,
          priceModifier: String(o.priceModifier),
        })),
      })),
      language: "en",
    });
    setShowAiPanel(true);
    setAddedFromAi(new Set());
  };

  const handleAddRecommendedMachine = (rec: MachineRecommendation) => {
    const machine = machines?.find(m => m.id === rec.machineId);
    if (!machine) return;

    const optionPrices: Record<number, number> = {};
    const selectedOptionIds: number[] = [];
    const optionQuantities: Record<number, number> = {};

    for (const so of rec.suggestedOptions) {
      const opt = machine.options.find(o => o.id === so.optionId);
      if (opt) {
        selectedOptionIds.push(so.optionId);
        optionPrices[so.optionId] = parseFloat(opt.priceModifier as unknown as string);
        optionQuantities[so.optionId] = 1;
      }
    }

    const safeQty = Math.max(1, Math.floor(Number(rec.suggestedQuantity) || 1));

    const newItem: CartItem = {
      tempId: Math.random().toString(36),
      machineId: machine.id,
      quantity: safeQty,
      selectedOptionIds,
      optionQuantities,
      basePrice: parseFloat(machine.basePrice as unknown as string),
      optionPrices,
      comment: "",
      optionComments: {},
      optionPriceHidden: {},
    };

    setCart(prev => [...prev, newItem]);
    setAddedFromAi(prev => new Set(prev).add(rec.machineId));
    toast({ title: `${rec.machineName} added to offer` });
  };

  const handleViewMachine = (machineId: number) => {
    setActiveMachineId(String(machineId));
  };

  const handleAiFeedback = (runId: string, rating: "accepted" | "rejected" | "modified", comment?: string) => {
    submitFeedback.mutate(
      { runId, rating, comment },
      {
        onSuccess: () => toast({ title: rating === "accepted" ? "Feedback submitted — thank you!" : "Feedback noted" }),
        onError: () => toast({ title: "Failed to submit feedback", variant: "destructive" }),
      }
    );
  };

  const aiOutput = recommendMachines.data?.output ?? null;
  const aiRun = recommendMachines.data?.run ?? null;
  const aiError = recommendMachines.error?.message ?? null;

  useEffect(() => {
    if (enquiryPrefillApplied.current || !sourceEnquiry || !machines || !customers) return;
    enquiryPrefillApplied.current = true;

    const pd = sourceEnquiry.projectData ?? {};
    const salesModel = pd.commercial?.salesModel;
    const isDealerBuysResells = salesModel === "dealer_buys_resells";
    const dealerCompany = sourceEnquiry.dealer?.dealerCompany;

    if (isDealerBuysResells && dealerCompany) {
      const dealerCust = customers?.find((c: any) => c.name === dealerCompany.companyName && !c.dealerId);
      setCustomerId(dealerCust ? dealerCust.id.toString() : (sourceEnquiry.customerId?.toString() ?? ""));
      setHeaderCustomerName(dealerCompany.companyName ?? "");
      const dealerUser = sourceEnquiry.dealer;
      setHeaderCustomerContact(dealerUser ? `${dealerUser.name ?? ""} ${dealerUser.surname ?? ""}`.trim() : "");
      setHeaderCustomerEmail(dealerUser?.email || (dealerCompany.email ?? ""));
      setHeaderCustomerAddress(dealerCompany.address ?? "");

      setProjectData((prev: any) => ({
        ...prev,
        commercial: {
          ...(prev.commercial ?? {}),
          ...(pd.commercial ?? {}),
          endCustomerId: sourceEnquiry.customerId,
          endCustomerName: sourceEnquiry.customer?.companyName || sourceEnquiry.customer?.name || null,
          endCustomerContactId: pd.headerInfo?.customer?.contactId || null,
          endCustomerContactPerson: pd.headerInfo?.customer?.contactPerson || null,
        },
      }));
    } else {
      setCustomerId(sourceEnquiry.customerId?.toString() ?? "");
      if (pd.headerInfo?.customer) {
        setHeaderCustomerName(pd.headerInfo.customer.name ?? "");
        setHeaderCustomerContact(pd.headerInfo.customer.contactPerson ?? "");
        setHeaderCustomerEmail(pd.headerInfo.customer.email ?? "");
        setHeaderCustomerAddress(pd.headerInfo.customer.address ?? "");
      } else if (sourceEnquiry.customer) {
        setHeaderCustomerName(sourceEnquiry.customer.name ?? "");
        setHeaderCustomerContact(sourceEnquiry.customer.contactPerson ?? "");
        setHeaderCustomerEmail(sourceEnquiry.customer.email ?? "");
        setHeaderCustomerAddress(sourceEnquiry.customer.address ?? "");
      }
    }

    setSubject(sourceEnquiry.subject ?? "");
    setLayout(sourceEnquiry.projectData?.layout ?? "");

    if (pd.family) setFamily(pd.family);
    setProjectData((prev: any) => ({
      ...prev,
      ...(pd.selectedPresets ? { selectedPresets: pd.selectedPresets } : {}),
      ...(pd.lineDescription ? { lineDescription: pd.lineDescription } : {}),
      ...(pd.notes ? { notes: pd.notes } : {}),
    }));
    if (pd.technicalSpecs) setTechnicalSpecs((prev) => ({ ...prev, ...pd.technicalSpecs }));
    if (pd.headerInfo?.date) setHeaderDate(pd.headerInfo.date);
    if (isDealerBuysResells && user) {
      setHeaderSalesmanName(`${user.name || ""} ${user.surname || ""}`.trim() || "");
      setHeaderSalesmanEmail(user.email || "");
      setHeaderSalesmanMobile(user.mobileNumber || "");
    } else if (pd.headerInfo?.salesman) {
      setHeaderSalesmanName(pd.headerInfo.salesman.name ?? "");
      setHeaderSalesmanEmail(pd.headerInfo.salesman.email ?? "");
      setHeaderSalesmanMobile(pd.headerInfo.salesman.mobile ?? "");
    }
    if (pd.pricing?.serviceItems) setServiceItems((prev) => ({ ...prev, ...pd.pricing.serviceItems }));
    if (pd.pricing?.installationConfig) setInstallationConfig((prev) => ({ ...prev, ...pd.pricing.installationConfig }));
    if (pd.pricing?.discountPercent != null) setDiscountPercent(pd.pricing.discountPercent);
    if (pd.pricing?.interlockingPricePerPosition != null) setInterlockingPricePerPosition(pd.pricing.interlockingPricePerPosition);
    if (pd.pricing?.extraItems) setExtraItems(pd.pricing.extraItems);
    if (pd.pricing?.priceComments) setPriceComments((prev) => ({ ...prev, ...pd.pricing.priceComments }));
    if (pd.pricing?.priceLabels) setPriceLabels((prev) => ({ ...prev, ...pd.pricing.priceLabels }));
    if (pd.hiddenSections) setHiddenSections(pd.hiddenSections);
    if (pd.sectionOrder) setSectionOrder(pd.sectionOrder);
    if (pd.pageBreaks) setPageBreaks(pd.pageBreaks);

    const items: any[] = sourceEnquiry.items ?? [];
    const newCart: CartItem[] = items.map((item: any) => {
      const machine = machines.find(m => m.id === item.machineId);
      const optionPrices: Record<number, number> = {};
      const optionIds: number[] = item.optionIds ?? item.selectedOptionIds ?? (item.options?.map((o: any) => o.machineOptionId) ?? []);
      for (const optId of optionIds) {
        if (item.customOptionPrices?.[optId] != null) {
          optionPrices[optId] = parseFloat(item.customOptionPrices[optId]);
        } else {
          const opt = machine?.options?.find((o: any) => o.id === optId);
          optionPrices[optId] = opt ? parseFloat(opt.priceModifier) : 0;
        }
      }
      return {
        tempId: Math.random().toString(36),
        machineId: item.machineId,
        quantity: item.quantity ?? 1,
        selectedOptionIds: optionIds,
        optionQuantities: item.optionQuantities ?? {},
        basePrice: item.customBasePrice != null ? parseFloat(item.customBasePrice) : (machine ? parseFloat(machine.basePrice as unknown as string) : 0),
        optionPrices,
        comment: "",
        optionComments: {},
        optionPriceHidden: {},
      };
    });
    setCart(newCart);
  }, [sourceEnquiry, machines, customers, user]);

  useEffect(() => {
    if (!family || !familyDefaults) return;
    const defaults = familyDefaults[family as keyof FamilyDefaults];
    if (!defaults) return;
    const useExisting = enquiryPrefillApplied.current && !familyPrefillApplied.current;
    familyPrefillApplied.current = true;
    setTechnicalSpecs(prev => ({
      ...prev,
      minMaxLength:     useExisting ? (prev.minMaxLength    || defaults.minMaxLength    || "") : (defaults.minMaxLength    || prev.minMaxLength    || ""),
      maxWidth:         useExisting ? (prev.maxWidth        || defaults.maxWidth        || "") : (defaults.maxWidth        || prev.maxWidth        || ""),
      minMaxThickness:  useExisting ? (prev.minMaxThickness || defaults.minMaxThickness || "") : (defaults.minMaxThickness || prev.minMaxThickness || ""),
      averageLineSpeed: useExisting ? (prev.averageLineSpeed|| defaults.averageLineSpeed|| "") : (defaults.averageLineSpeed|| prev.averageLineSpeed|| ""),
      controlSide:      useExisting ? (prev.controlSide     || defaults.controlSide     || "") : (defaults.controlSide     || prev.controlSide     || ""),
      maxBow:           useExisting ? (prev.maxBow          || defaults.maxBow          || "") : (defaults.maxBow          || prev.maxBow          || ""),
      paint:            useExisting ? (prev.paint           || defaults.paint           || "") : (defaults.paint           || prev.paint           || ""),
      substrate:        useExisting ? (prev.substrate       || defaults.substrate       || "") : (defaults.substrate       || prev.substrate       || ""),
      finishing:        useExisting ? (prev.finishing        || defaults.finishing       || "") : (defaults.finishing        || prev.finishing       || ""),
    }));
  }, [family, familyDefaults]);

  useEffect(() => {
    if (user && !headerSalesmanName) {
      setHeaderSalesmanName(`${user.name || ""} ${user.surname || ""}`.trim() || "");
      setHeaderSalesmanEmail(user.email || "");
      setHeaderSalesmanMobile(user.mobileNumber || "");
    }
  }, [user]);

  const prevCustomerIdRef = useRef<string>("");
  useEffect(() => {
    if (!customerId || !customers) return;
    const c = customers.find((c: any) => c.id.toString() === customerId);
    if (c) {
      setHeaderCustomerName(c.name || "");
      setHeaderCustomerAddress((c as any).address || "");
      if (prevCustomerIdRef.current && prevCustomerIdRef.current !== customerId) {
        setSelectedContactId("");
        setHeaderCustomerContact("");
        setHeaderCustomerEmail("");
      }
    }
    prevCustomerIdRef.current = customerId;
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

  useEffect(() => {
    const currentId = wizardSteps[step - 1]?.id;
    if (currentId !== "review") return;
    if (pdfDebounceRef.current) clearTimeout(pdfDebounceRef.current);
    pdfDebounceRef.current = setTimeout(() => {
      generatePreviewPdf();
    }, 600);
    return () => {
      if (pdfDebounceRef.current) clearTimeout(pdfDebounceRef.current);
    };
  }, [step, sectionOrder, hiddenSections, pageBreaks, machinePageBreaks]);

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

  const handleDwgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDwg(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/offers/layout-drawing", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setLayoutDwg({ filename: data.filename, originalName: data.originalName });
      toast({ title: "DWG uploaded", description: data.originalName });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploadingDwg(false);
      if (dwgFileRef.current) dwgFileRef.current.value = "";
    }
  };

  const handleRemoveDwg = async () => {
    if (!layoutDwg) return;
    try {
      await fetch(`/api/offers/layout-drawing/${layoutDwg.filename}`, { method: "DELETE", credentials: "include" });
    } catch {}
    setLayoutDwg(null);
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

  const computeInstallationDaysFromCart = () => {
    return cart.reduce((sum, item) => {
      const machine = machines?.find(m => m.id === item.machineId);
      const days = parseFloat(machine?.installationDays as unknown as string ?? "0") || 0;
      return sum + days * item.quantity;
    }, 0);
  };

  useEffect(() => {
    if (currentStepDef?.id === "pricing" && installationConfig.totalDays === 0) {
      const days = computeInstallationDaysFromCart();
      setInstallationConfig(prev => ({
        ...prev,
        totalDays: days,
        totalPrice: prev.dailyFee * days,
      }));
    }
  }, [step]);

  useEffect(() => {
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
  }, [formatSettings]);

  useEffect(() => {
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
  }, [formatSettings]);

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

  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const pdfDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPdfBlobUrl = useRef<string | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);

  const buildPreviewPayload = () => {
    const salesmanName = `${user?.name || ""} ${user?.surname || ""}`.trim() || "Sales Team";
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
          hiddenSections,
          sectionOrder,
          pageBreaks,
          machineBreakPositions: machinePageBreaks.map(tid => orderedCart.findIndex(c => c.tempId === tid)).filter(i => i > 0),
          termsBreakPositions: termsPageBreaks,
          layout,
          layoutDrawing,
          layoutDwg,
          includeLayoutInPdf,
          family,
          linkedDrawingId: selectedDrawingId && selectedDrawingId !== "none" ? Number(selectedDrawingId) : null,
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
      // silent — preview failure shouldn't block submission
    } finally {
      setIsPdfGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!customerId || !subject || cart.length === 0) return;
    
    const salesmanName = `${user?.name || ""} ${(user as any)?.surname || ""}`.trim() || "Sales Team";

    const payload = {
      offer: {
        customerId: parseInt(customerId),
        subject,
        salesmanName,
        salesmanEmail: headerSalesmanEmail || undefined,
        salesmanMobile: headerSalesmanMobile || undefined,
        totalPrice: calculateTotal().toString(),
        status: "Draft",
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
          layoutDwg,
          includeLayoutInPdf,
          family,
          linkedDrawingId: selectedDrawingId && selectedDrawingId !== "none" ? Number(selectedDrawingId) : null,
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

    try {
      let createdOfferId: number | null = null;

      if (fromEnquiryId) {
        const res = await apiRequest("POST", `/api/enquiries/${fromEnquiryId}/start-offer`, payload);
        const resData = await res.json?.().catch(() => null);
        createdOfferId = resData?.id ?? null;
        queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
        toast({ title: "Offer created", description: "The offer has been created from the enquiry." });
      } else {
        const result: Offer = await createOffer.mutateAsync(payload);
        createdOfferId = result?.id ?? null;
      }

      if (createdDrawingRequestId && createdOfferId) {
        try {
          await apiRequest("PATCH", `/api/drawing-requests/${createdDrawingRequestId}/link-offer`, { offerId: createdOfferId });
        } catch {
          // Non-fatal: request was already sent, offerId link is optional
        }
      }

      wizardDraft.clearDraft();
      setLocation("/offers");
    } catch (err: any) {
      toast({ title: "Failed to create offer", description: err?.message || "An unexpected error occurred.", variant: "destructive" });
    }
  };

  const selectedMachine = machines?.find(m => m.id.toString() === activeMachineId);
  const techSpecSection = formatSettings?.sections?.find((s: any) => s.id === "technical_specs");
  const tsLbl = (key: string, fallback: string) => (techSpecSection?.labels?.[key] as string) || fallback;

  const updateSpec = (field: keyof TechnicalSpecs, value: string) => {
    setTechnicalSpecs(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-20">
        <PageHeader
          title="New Offer"
        />
        <div>
          {fromEnquiryId && sourceEnquiry && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm rounded-md px-3 py-1.5">
                <CornerDownLeft className="w-4 h-4 shrink-0" />
                <span>Based on enquiry <strong>{sourceEnquiry.referenceNumber}</strong> from {sourceEnquiry.dealer?.name ? `${sourceEnquiry.dealer.name} ${sourceEnquiry.dealer.surname}`.trim() : "dealer"}</span>
              </div>
              {sourceEnquiry.projectData?.commercial?.salesModel === "dealer_buys_resells" && (
                <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-sm rounded-md px-3 py-1.5" data-testid="banner-dealer-buys-resells">
                  <Users className="w-4 h-4 shrink-0" />
                  <span>
                    Dealer buys & resells — Customer set to <strong>{sourceEnquiry.dealer?.dealerCompany?.companyName ?? "dealer"}</strong>
                    {(sourceEnquiry.customer?.name || sourceEnquiry.customer?.companyName) && (
                      <> · End customer: <strong>{sourceEnquiry.customer.companyName || sourceEnquiry.customer.name}</strong></>
                    )}
                  </span>
                </div>
              )}
            </div>
          )}
          {showDraftBanner && (
            <div className="mt-3 flex items-center justify-between gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-sm rounded-md px-4 py-3" data-testid="banner-draft-restore">
              <div className="flex items-center gap-2">
                <Save className="w-4 h-4 shrink-0" />
                <span>Hai un'offerta in bozza non salvata. Vuoi ripristinarla?</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={handleDiscardDraft} data-testid="button-discard-draft">
                  Scarta
                </Button>
                <Button size="sm" onClick={restoreDraft} data-testid="button-restore-draft">
                  Ripristina
                </Button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-1 mt-4 text-sm font-medium flex-wrap">
            {wizardSteps.map(({ id, label }, i) => {
              const n = i + 1;
              const compositionIdx = wizardSteps.findIndex(s => s.id === "composition");
              const canJump = n <= step
                || (wizardSteps[i].id === "subject")
                || (wizardSteps[i].id === "composition" && !!customerId)
                || (n > (compositionIdx + 1) && !!customerId && cart.length > 0);
              return (
                <>
                  {i > 0 && <ChevronRight key={`sep-${n}`} className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <button
                    key={id}
                    type="button"
                    onClick={() => canJump && setStep(n)}
                    className={cn(
                      "transition-colors rounded px-1",
                      step === n ? "text-primary font-bold" : n < step ? "text-primary/70 hover:text-primary cursor-pointer" : canJump ? "text-muted-foreground hover:text-primary/70 cursor-pointer" : "text-muted-foreground/40 cursor-default"
                    )}
                    disabled={!canJump}
                  >
                    {n}. {label}
                  </button>
                </>
              );
            })}
            {wizardDraft.lastSavedAt && !showDraftBanner && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-auto shrink-0" data-testid="text-draft-saved">
                <Save className="w-3 h-3" />
                Bozza salvata · {wizardDraft.lastSavedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>

        <Card className="border-border shadow-md">
          <CardContent className="p-6">
            {/* Top navigation bar */}
            <div className="flex justify-between items-center mb-6 pb-4 border-b">
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                disabled={step === 1}
                data-testid="button-back-top"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
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
                  data-testid="button-next-top"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={!subject || createOffer.isPending}
                  className="bg-primary hover:bg-primary/90"
                  data-testid="button-create-top"
                >
                  {createOffer.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                  Create Offer
                </Button>
              )}
            </div>

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
                  {/* Customer search */}
                  <div className="space-y-2">
                    <Label>Search Customer</Label>
                    <div className="relative">
                      <Input
                        placeholder="Type company name, contact or email…"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        data-testid="input-customer-search"
                      />
                      {customerSearch.trim().length > 0 && (() => {
                        const q = customerSearch.toLowerCase();
                        const matches = (customers ?? []).filter((c: any) =>
                          c.name?.toLowerCase().includes(q) ||
                          c.contactPerson?.toLowerCase().includes(q) ||
                          c.email?.toLowerCase().includes(q)
                        );
                        if (matches.length === 0) return (
                          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md p-3 text-sm text-muted-foreground">
                            No customers found
                          </div>
                        );
                        return (
                          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md max-h-56 overflow-y-auto" data-testid="customer-search-results">
                            {matches.map((c: any) => (
                              <button
                                key={c.id}
                                type="button"
                                className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b last:border-b-0"
                                data-testid={`customer-search-result-${c.id}`}
                                onClick={() => {
                                  setCustomerId(c.id.toString());
                                  setHeaderCustomerName(c.name ?? "");
                                  setHeaderCustomerAddress(c.address ?? "");
                                  setSelectedContactId("");
                                  setHeaderCustomerContact("");
                                  setHeaderCustomerEmail("");
                                  setCustomerSearch("");
                                  setSelectedDrawingId("");
                                }}
                              >
                                <p className="font-medium text-sm">{c.name}</p>
                                {(c.contactPerson || c.email) && (
                                  <p className="text-xs text-muted-foreground">{[c.contactPerson, c.email].filter(Boolean).join(" · ")}</p>
                                )}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Selected customer indicator */}
                  {customerId && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
                      <Check className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="text-sm font-medium text-green-800 dark:text-green-300">
                        {customers?.find((c: any) => c.id.toString() === customerId)?.name}
                      </span>
                      <button
                        type="button"
                        className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => { setCustomerId(""); setSelectedDrawingId(""); }}
                        data-testid="btn-clear-customer"
                      >
                        Change
                      </button>
                    </div>
                  )}

                  {/* Fallback: full list select */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Or pick from list</Label>
                    <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setSelectedDrawingId(""); }}>
                      <SelectTrigger className="h-10" data-testid="select-customer">
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
                    <p className="text-sm text-muted-foreground">
                      Don't see the customer? <span className="text-primary cursor-pointer hover:underline" onClick={() => setLocation("/crm")}>Add new customer</span>
                    </p>
                  </div>

                  {customerId && (
                    <div className="space-y-2">
                      <Label>Contact Person</Label>
                      {companyContacts.length > 0 ? (
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
                      ) : headerCustomerContact ? (
                        <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                          <User className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium">{headerCustomerContact}</span>
                          {headerCustomerEmail && <span className="text-xs text-muted-foreground ml-auto">{headerCustomerEmail}</span>}
                        </div>
                      ) : (
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
                  <h3 className="font-semibold text-lg border-b pb-2">{currentStepDef.label}</h3>
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
                    <div className="flex flex-col gap-2 mt-1">
                      <input
                        ref={layoutFileRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={handleLayoutDrawingUpload}
                        data-testid="input-layout-drawing"
                      />
                      <input
                        ref={dwgFileRef}
                        type="file"
                        accept=".dwg"
                        className="hidden"
                        onChange={handleDwgUpload}
                        data-testid="input-layout-dwg"
                      />
                      <div className="flex items-center gap-2">
                        {layoutDrawing ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm flex-1">
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
                            Attach Layout (PDF)
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {layoutDwg ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm flex-1">
                            <Package className="w-4 h-4 text-blue-500 shrink-0" />
                            <a href={`/api/layout-drawings/${layoutDwg.filename}?download=1&name=${encodeURIComponent(layoutDwg.originalName)}`} className="text-primary hover:underline truncate flex-1" data-testid="link-layout-dwg">
                              {layoutDwg.originalName}
                            </a>
                            <Button variant="ghost" size="sm" type="button" className="h-6 w-6 p-0 text-destructive shrink-0" onClick={handleRemoveDwg} data-testid="btn-remove-dwg">
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" type="button" onClick={() => dwgFileRef.current?.click()} disabled={uploadingDwg} data-testid="btn-upload-dwg">
                            {uploadingDwg ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                            Attach Layout (DWG)
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Ruler className="w-3.5 h-3.5" />
                      Disegno Tecnico Collegato
                    </Label>
                    {!customerId ? (
                      <p className="text-xs text-muted-foreground italic">Seleziona prima un cliente per vedere i disegni disponibili.</p>
                    ) : availableDrawings.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nessun disegno tecnico disponibile per questo cliente.</p>
                    ) : (
                      <Select value={selectedDrawingId} onValueChange={setSelectedDrawingId}>
                        <SelectTrigger data-testid="select-drawing">
                          <SelectValue placeholder="Seleziona disegno (opzionale)…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nessun disegno</SelectItem>
                          {availableDrawings.map((d) => (
                            <SelectItem key={d.id} value={String(d.id)}>
                              Disegno #{d.id}{d.notes ? ` — ${d.notes.slice(0, 40)}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {selectedDrawingId && selectedDrawingId !== "none" && (() => {
                      const selDrawing = availableDrawings.find(d => String(d.id) === selectedDrawingId);
                      return selDrawing ? (
                        <div className="text-xs space-y-0.5 p-2 bg-muted/50 rounded-md">
                          <p className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Disegno #{selDrawing.id} collegato all'offerta
                          </p>
                          {selDrawing.notes && <p className="text-muted-foreground">Note: {selDrawing.notes.slice(0, 80)}</p>}
                          {selDrawing.pdfOriginalName && (
                            <a href={`/drawings-files/${selDrawing.pdfFilename}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                              <FileText className="w-3 h-3" /> {selDrawing.pdfOriginalName}
                            </a>
                          )}
                          {selDrawing.dwgOriginalName && (
                            <a href={`/drawings-files/${selDrawing.dwgFilename}?download=1&name=${encodeURIComponent(selDrawing.dwgOriginalName ?? "")}`} className="text-primary hover:underline flex items-center gap-1">
                              <Package className="w-3 h-3" /> {selDrawing.dwgOriginalName}
                            </a>
                          )}
                        </div>
                      ) : null;
                    })()}
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
                    <p className="text-xs text-muted-foreground">Selecting a family will auto-fill Technical Specification fields from family defaults.</p>
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
                  <h3 className="font-semibold text-lg border-b pb-2">{currentStepDef.label}</h3>
                  
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
                  <div className={cn(
                    showAiPanel && isLargeScreen && "flex gap-4"
                  )}>
                  <div className={cn("space-y-8 min-w-0", showAiPanel && isLargeScreen && "flex-1")}>
                  {/* Add Line Item — full width */}
                  <div className="space-y-4 p-4 bg-muted/30 rounded-xl border border-border/50">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Add Line Item
                      </h3>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRecommendMachines}
                          disabled={recommendMachines.isPending || !machines || machines.length === 0}
                          data-testid="button-recommend-machines"
                        >
                          {recommendMachines.isPending ? (
                            <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Analyzing...</>
                          ) : (
                            <><Sparkles className="h-4 w-4 mr-1" /> Recommend Machines</>
                          )}
                        </Button>
                        <Button
                          onClick={handleAddMachine}
                          disabled={!activeMachineId}
                          data-testid="button-add-item-top"
                        >
                          Add to Offer
                        </Button>
                      </div>
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
                  </div>
                  {showAiPanel && isLargeScreen && (
                    <div className="w-80 shrink-0 sticky top-0 self-start animate-in slide-in-from-right-5 duration-300">
                      <AIAssistantPanel
                        isLoading={recommendMachines.isPending}
                        error={aiError}
                        run={aiRun}
                        output={aiOutput}
                        workflowType="machine_recommendation"
                        onFeedback={handleAiFeedback}
                        onDismiss={() => setShowAiPanel(false)}
                        onRetry={handleRecommendMachines}
                        feedbackPending={submitFeedback.isPending}
                        title="Machine Suggestions"
                        onAddMachine={handleAddRecommendedMachine}
                        onViewMachine={handleViewMachine}
                        addedMachineIds={addedFromAi}
                      />
                    </div>
                  )}
                  </div>
                  {!isLargeScreen && showAiPanel && (
                    <div className="mt-4 rounded-xl border bg-card p-4">
                      <AIAssistantPanel
                        isLoading={recommendMachines.isPending}
                        error={aiError}
                        run={aiRun}
                        output={aiOutput}
                        workflowType="machine_recommendation"
                        onFeedback={handleAiFeedback}
                        onDismiss={() => setShowAiPanel(false)}
                        onRetry={handleRecommendMachines}
                        feedbackPending={submitFeedback.isPending}
                        title="Machine Suggestions"
                        onAddMachine={handleAddRecommendedMachine}
                        onViewMachine={handleViewMachine}
                        addedMachineIds={addedFromAi}
                      />
                    </div>
                  )}
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
                    <h3 className="font-semibold text-lg">{currentStepDef?.label ?? "Price Overview"}</h3>
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
                          {/* Machine row */}
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
                          {/* Option rows */}
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
                      {/* Travel */}
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
                      {/* Board & Lodging */}
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
                      {/* Training */}
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
                      {/* Packaging */}
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
                      {/* Transport */}
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
                  <h3 className="font-semibold text-lg border-b pb-2">{currentStepDef?.label ?? "Terms & Conditions"}</h3>

                  <div className="space-y-4">
                    <Label>Select Terms and Conditions</Label>
                    <div className="grid gap-3">
                      {presets?.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">No terms & conditions entries yet. Add them in the Terms & Conditions page.</p>
                      )}
                      {presets?.map((preset) => {
                        const selected = (projectData.selectedPresets || []).some((p: any) => p.id === preset.id);
                        return (
                          <div key={preset.id} className="flex items-start space-x-2 p-3 border rounded-md">
                            <Checkbox 
                              id={`preset-${preset.id}`}
                              checked={selected}
                              onCheckedChange={(checked) => {
                                const current = projectData.selectedPresets || [];
                                if (checked) setProjectData({ ...projectData, selectedPresets: [...current, { id: preset.id, title: preset.title, content: preset.content }] });
                                else setProjectData({ ...projectData, selectedPresets: current.filter((p: any) => p.id !== preset.id) });
                              }}
                              data-testid={`checkbox-preset-${preset.id}`}
                            />
                            <div>
                              <label htmlFor={`preset-${preset.id}`} className="font-medium text-sm block cursor-pointer">
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
                      {customerId && (
                        drawingRequestConfirmed ? (
                          <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 rounded px-3 py-1.5" data-testid="badge-drawing-request-confirmed">
                            <CheckCircle2 className="h-4 w-4" />
                            Richiesta inviata ✓
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowDrawingRequestDialog(true)}
                            data-testid="button-request-drawing"
                          >
                            <Ruler className="h-4 w-4 mr-1" />
                            Richiedi Disegno
                          </Button>
                        )
                      )}
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
                                                  title="Edit section content"
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

                      {layoutDrawing && (
                        <div className="flex items-center gap-3 p-3 border rounded-md bg-rose-50/50 dark:bg-rose-950/20 border-rose-300">
                          <FileText className="w-4 h-4 text-red-500 shrink-0" />
                          <label htmlFor="include-layout-pdf" className="text-sm font-medium flex-1 cursor-pointer">
                            Include layout drawing in offer PDF
                          </label>
                          <Checkbox
                            id="include-layout-pdf"
                            checked={includeLayoutInPdf}
                            onCheckedChange={(checked) => setIncludeLayoutInPdf(!!checked)}
                            data-testid="checkbox-include-layout-pdf"
                          />
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

                    {/* Section edit — full-page overlay */}
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
                              data-testid="btn-section-edit-close"
                            >
                              <X className="w-5 h-5" />
                            </Button>
                            <h2 className="font-semibold text-lg">{title}</h2>
                            <div className="flex-1" />
                            <Button
                              type="button"
                              onClick={() => { setEditingSection(null); generatePreviewPdf(); }}
                              data-testid="btn-section-edit-done"
                            >
                              Save &amp; Preview
                            </Button>
                          </div>
                          <div className="flex-1 overflow-y-auto p-6 md:p-10">
                            <div className="max-w-6xl mx-auto flex flex-col gap-6">
                              {editingSection === "machine_line" && (
                                <>
                                  <p className="text-sm text-muted-foreground">Override the description shown for each machine in this offer (does not change the source data).</p>
                                  {orderedCartForEdit.map((item, idx) => {
                                    const machine = machines?.find(m => m.id === item.machineId);
                                    return (
                                      <div key={item.tempId} className="flex flex-col gap-1.5">
                                        <Label className="text-sm font-medium">Pos. {idx + 1} — {machine?.name ?? `Machine ${item.machineId}`}</Label>
                                        <Textarea
                                          rows={8}
                                          className="text-sm font-mono"
                                          placeholder={machine?.description ?? ""}
                                          value={machineDescOverrides[item.machineId] ?? machine?.description ?? ""}
                                          onChange={(e) => setMachineDescOverrides(prev => ({ ...prev, [item.machineId]: e.target.value }))}
                                        />
                                      </div>
                                    );
                                  })}
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
                disabled={step === 1}
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
                  disabled={!subject || createOffer.isPending}
                  className="bg-primary hover:bg-primary/90"
                  data-testid="button-create"
                  size="lg"
                >
                  {createOffer.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                  Create Offer
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDrawingRequestDialog} onOpenChange={setShowDrawingRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ruler className="w-4 h-4" />
              Richiedi Disegno Tecnico
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              La richiesta verrà inviata immediatamente al tecnico commerciale. Potrai collegare l'offerta in seguito.
            </p>
            <div className="space-y-2">
              <Label>Note per il tecnico</Label>
              <Textarea
                placeholder="Descrivi le specifiche del disegno richiesto…"
                value={drawingRequestNotes}
                onChange={e => setDrawingRequestNotes(e.target.value)}
                rows={3}
                data-testid="input-drawing-request-notes"
              />
            </div>
            <div className="space-y-2">
              <Label>Allegato (opzionale)</Label>
              <input
                ref={drawingRequestFileRef}
                type="file"
                className="hidden"
                onChange={e => setDrawingRequestFile(e.target.files?.[0] ?? null)}
              />
              {drawingRequestFile ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm">
                  <Paperclip className="w-4 h-4 shrink-0" />
                  <span className="truncate flex-1">{drawingRequestFile.name}</span>
                  <Button
                    variant="ghost" size="sm" type="button"
                    className="h-6 w-6 p-0 text-destructive shrink-0"
                    onClick={() => setDrawingRequestFile(null)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline" size="sm" type="button"
                  onClick={() => drawingRequestFileRef.current?.click()}
                  data-testid="btn-attach-drawing-request"
                >
                  <Paperclip className="w-3.5 h-3.5 mr-1" />
                  Allega file
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDrawingRequestDialog(false);
              setDrawingRequestNotes("");
              setDrawingRequestFile(null);
              if (!drawingRequestConfirmed) setDrawingRequestConfirmed(false);
            }}>
              Annulla
            </Button>
            <Button
              disabled={drawingRequestPending || !customerId || !drawingRequestNotes.trim()}
              onClick={async () => {
                if (!customerId) return;
                setDrawingRequestPending(true);
                try {
                  const fd = new FormData();
                  fd.append("customerId", customerId);
                  fd.append("notes", drawingRequestNotes);
                  if (drawingRequestFile) fd.append("attachment", drawingRequestFile);
                  const res = await fetch("/api/drawing-requests", { method: "POST", body: fd, credentials: "include" });
                  if (!res.ok) throw new Error("Invio fallito");
                  const data: { id: number } = await res.json();
                  setCreatedDrawingRequestId(data.id);
                  setDrawingRequestConfirmed(true);
                  setShowDrawingRequestDialog(false);
                  toast({ title: "Richiesta inviata", description: "Il tecnico commerciale è stato notificato." });
                } catch {
                  toast({ title: "Errore nell'invio della richiesta", variant: "destructive" });
                } finally {
                  setDrawingRequestPending(false);
                }
              }}
              data-testid="btn-confirm-drawing-request"
            >
              {drawingRequestPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Ruler className="w-4 h-4 mr-1" />}
              Conferma Richiesta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
