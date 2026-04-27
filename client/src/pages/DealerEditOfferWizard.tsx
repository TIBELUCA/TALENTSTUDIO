import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ChevronRight, ChevronLeft, Check, Lock, Plus, Trash2, Eye, EyeOff, GripVertical, CornerDownLeft, FileText } from "lucide-react";
import { displayVersion } from "@shared/version";
import { useParams, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { CommentButton } from "@/components/CommentButton";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

interface OfferItemOption {
  id: number;
  machineOptionId: number;
  snapshotOptionName: string;
  snapshotPriceModifier: string;
  quantity: number;
}

interface OfferItem {
  id: number;
  machineId: number;
  position: number;
  quantity: number;
  snapshotMachineName: string;
  snapshotBasePrice: string;
  options: OfferItemOption[];
}

interface Offer {
  id: number;
  referenceNumber: string;
  subject: string;
  version: number;
  status?: string;
  totalPrice: string;
  sourceEnquiryId?: number | null;
  customer: { id: number; companyName?: string; name?: string };
  items: OfferItem[];
  projectData?: any;
}

interface ExtraItem { id: string; description: string; price: number; }

interface ServiceItems {
  travelCosts: boolean;
  boardLodging: boolean;
  trainingIncluded: boolean;
  trainingDays: string;
  packaging: boolean;
  transportIncluded: boolean;
  transportPrice: number;
}

const defaultServiceItems: ServiceItems = {
  travelCosts: false,
  boardLodging: false,
  trainingIncluded: false,
  trainingDays: "1",
  packaging: false,
  transportIncluded: false,
  transportPrice: 0,
};

const DEFAULT_PRICE_LABELS = {
  interlocking: "Interlocking",
  totalListPrice: "Total List Price",
  installation: "Installation & Commissioning",
  travelCosts: "Travel Costs",
  boardLodging: "Board & Lodging",
  training: "Training",
  packaging: "Packaging",
  transport: "Transport",
  grossTotal: "Gross Total",
  netTotal: "Net Total",
};

const SECTION_LABELS: Record<string, string> = {
  metadata: "Customer Details",
  offer_title: "Offer Title",
  technical_specs: "Technical Specifications",
  machine_line: "Machines and Options",
  utilities_summary: "Utilities Summary",
  price_overview: "Price Overview",
  terms_conditions: "Terms & Conditions",
};

const STEPS = [
  { id: "customer", label: "Customer Details",         readOnly: true  },
  { id: "details",  label: "Date & Parties",           readOnly: true  },
  { id: "subject",  label: "Project Data",             readOnly: true  },
  { id: "specs",    label: "Technical Specifications", readOnly: true  },
  { id: "pricing",  label: "Price Overview",           readOnly: false },
  { id: "review",   label: "Review Sections",          readOnly: false },
];

function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export default function DealerEditOfferWizard() {
  const { id } = useParams<{ id: string }>();
  const offerId = parseInt(id || "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: offer, isLoading } = useQuery<Offer>({
    queryKey: ["/api/dealer/offers", offerId],
    queryFn: () => fetch(`/api/dealer/offers/${offerId}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: formatSettings } = useQuery<any>({
    queryKey: ["/api/settings/document-format"],
  });

  const [step, setStep] = useState(1);
  const [initialized, setInitialized] = useState(false);

  const [basePrices, setBasePrices] = useState<Record<number, number>>({});
  const [optionPrices, setOptionPrices] = useState<Record<number, number>>({});
  const [optionPriceHidden, setOptionPriceHidden] = useState<Record<number, boolean>>({});
  const [itemComments, setItemComments] = useState<Record<number, string>>({});
  const [optionComments, setOptionComments] = useState<Record<number, string>>({});

  const [showDetailedPrices, setShowDetailedPrices] = useState(true);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [interlockingPricePerPosition, setInterlockingPricePerPosition] = useState(500);
  const [installationConfig, setInstallationConfig] = useState({
    included: false, dailyFee: 0, totalDays: 0, totalPrice: 0,
    hideDailyFee: false, hideTotalDays: false, hideTotalPrice: false,
  });
  const [serviceItems, setServiceItems] = useState<ServiceItems>(defaultServiceItems);
  const [priceLabels, setPriceLabels] = useState({ ...DEFAULT_PRICE_LABELS });
  const [priceComments, setPriceComments] = useState({
    interlocking: "", installation: "", travel: "", boardLodging: "",
    training: "", packaging: "", transport: "", extras: {} as Record<string, string>,
  });

  const [sectionOrder, setSectionOrder] = useState<string[]>([]);
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [pageBreaks, setPageBreaks] = useState<string[]>([]);
  const [machinePageBreakItemIds, setMachinePageBreakItemIds] = useState<number[]>([]);

  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const prevPdfBlobUrl = useRef<string | null>(null);

  useEffect(() => {
    if (offer && !initialized) {
      const bp: Record<number, number> = {};
      const op: Record<number, number> = {};
      offer.items.forEach(item => {
        bp[item.id] = parseFloat(item.snapshotBasePrice) || 0;
        item.options.forEach(opt => {
          op[opt.id] = parseFloat(opt.snapshotPriceModifier) || 0;
        });
      });
      setBasePrices(bp);
      setOptionPrices(op);

      const pricing = offer.projectData?.pricing ?? {};
      if (pricing.discountPercent != null) setDiscountPercent(pricing.discountPercent);
      if (pricing.extraItems) setExtraItems(pricing.extraItems);
      if (pricing.interlockingPricePerPosition != null) setInterlockingPricePerPosition(pricing.interlockingPricePerPosition);
      if (pricing.installationConfig) setInstallationConfig(prev => ({ ...prev, ...pricing.installationConfig }));
      if (pricing.serviceItems) setServiceItems(prev => ({ ...prev, ...pricing.serviceItems }));
      if (pricing.priceLabels) setPriceLabels(prev => ({ ...prev, ...pricing.priceLabels }));
      if (pricing.priceComments) setPriceComments(prev => ({ ...prev, ...pricing.priceComments }));
      if (pricing.optionPriceHidden) setOptionPriceHidden(pricing.optionPriceHidden);
      if (pricing.itemComments) setItemComments(pricing.itemComments);
      if (pricing.optionComments) setOptionComments(pricing.optionComments);
      if (pricing.basePrices) setBasePrices(prev => ({ ...prev, ...pricing.basePrices }));
      if (pricing.optionPrices) setOptionPrices(prev => ({ ...prev, ...pricing.optionPrices }));

      if (offer.projectData?.sectionOrder) setSectionOrder(offer.projectData.sectionOrder);
      if (offer.projectData?.hiddenSections) setHiddenSections(offer.projectData.hiddenSections);
      if (offer.projectData?.pageBreaks) setPageBreaks(offer.projectData.pageBreaks);
      if (offer.projectData?.machineBreakPositions) {
        const positions: number[] = offer.projectData.machineBreakPositions;
        const itemIds = positions.map((pos: number) => offer.items[pos]?.id).filter(Boolean);
        setMachinePageBreakItemIds(itemIds);
      }

      setInitialized(true);
    }
  }, [offer, initialized]);

  useEffect(() => {
    if (STEPS[step - 1]?.id === "review") {
      const t = setTimeout(() => generatePreviewPdf(), 600);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Includes hidden options as well: when an option is marked "Incl.", its price is
  // folded into the displayed machine unit price, so it must still contribute to the
  // Machines Total exactly once (compreso nel prezzo macchina).
  const getItemOptionsTotal = (item: OfferItem) =>
    item.options.reduce((acc, opt) => {
      return acc + (optionPrices[opt.id] ?? parseFloat(opt.snapshotPriceModifier) ?? 0) * (opt.quantity || 1);
    }, 0);

  const calculateMachinesTotal = () =>
    (offer?.items ?? []).reduce((acc, item) => {
      const base = basePrices[item.id] ?? parseFloat(item.snapshotBasePrice) ?? 0;
      return acc + (base + getItemOptionsTotal(item)) * item.quantity;
    }, 0);

  const calculateInterlocking = () => (offer?.items.length ?? 0) * interlockingPricePerPosition;
  const calculateExtrasTotal = () => extraItems.reduce((acc, item) => acc + item.price, 0);
  const calculateServicesTotal = () => {
    const instAmount = installationConfig.included ? installationConfig.totalPrice : 0;
    const transportAmount = serviceItems.transportIncluded ? serviceItems.transportPrice : 0;
    return instAmount + transportAmount;
  };
  const calculateTotalListPrice = () => calculateMachinesTotal() + calculateInterlocking() + calculateExtrasTotal();
  const calculateGrossTotal = () => calculateTotalListPrice() + calculateServicesTotal();
  const calculateDiscount = () => (calculateTotalListPrice() * discountPercent) / 100;
  const calculateNetTotal = () => calculateGrossTotal() - calculateDiscount();
  const calculateFinalTotal = () => discountPercent > 0 ? calculateNetTotal() : calculateGrossTotal();

  const formatPrice = (n: number) => `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const buildPreviewPayload = () => {
    if (!offer) return null;
    const machineBreakPositions = machinePageBreakItemIds
      .map(itemId => offer.items.findIndex(i => i.id === itemId))
      .filter(i => i > 0);
    const pd = offer.projectData ?? {};
    const hi = pd.headerInfo ?? {};
    return {
      offer: {
        customerId: offer.customer.id,
        subject: offer.subject,
        salesmanName: hi.salesman?.name || "Sales Team",
        totalPrice: calculateFinalTotal().toString(),
        status: offer.status || "Draft",
        projectData: {
          ...pd,
          hiddenSections,
          sectionOrder,
          pageBreaks,
          machineBreakPositions,
          pricing: {
            ...pd.pricing,
            discountPercent,
            extraItems,
            interlockingPricePerPosition,
            installationConfig,
            serviceItems: { ...serviceItems, installationPrice: installationConfig.included ? installationConfig.totalPrice : 0 },
            interlockingTotal: calculateInterlocking(),
            totalListPrice: calculateTotalListPrice(),
            grossTotal: calculateGrossTotal(),
            discountAmount: calculateDiscount(),
            netTotal: calculateNetTotal(),
            priceLabels,
            priceComments,
          },
        },
      },
      items: offer.items.map(item => ({
        machineId: item.machineId,
        quantity: item.quantity,
        optionIds: item.options.map(o => o.machineOptionId),
        optionQuantities: Object.fromEntries(item.options.map(o => [o.machineOptionId, o.quantity])),
        customBasePrice: basePrices[item.id] ?? parseFloat(item.snapshotBasePrice),
        customOptionPrices: Object.fromEntries(
          item.options.map(o => [o.machineOptionId, optionPrices[o.id] ?? parseFloat(o.snapshotPriceModifier)])
        ),
      })),
    };
  };

  const generatePreviewPdf = async () => {
    if (!offer) return;
    const payload = buildPreviewPayload();
    if (!payload) return;
    setIsPdfGenerating(true);
    try {
      const res = await fetch(`/api/dealer/offers/${offerId}/preview-pdf`, {
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!offer) throw new Error("No offer");
      const machineBreakPositions = machinePageBreakItemIds
        .map(itemId => offer.items.findIndex(i => i.id === itemId))
        .filter(i => i > 0);
      const items = offer.items.map(item => ({
        machineId: item.machineId,
        quantity: item.quantity,
        optionIds: item.options.map(o => o.machineOptionId),
        customBasePrice: basePrices[item.id] ?? parseFloat(item.snapshotBasePrice),
        customOptionPrices: Object.fromEntries(
          item.options.map(o => [o.machineOptionId, optionPrices[o.id] ?? parseFloat(o.snapshotPriceModifier)])
        ),
      }));
      const pricing = {
        discountPercent,
        extraItems,
        interlockingPricePerPosition,
        installationConfig,
        serviceItems: { ...serviceItems, installationPrice: installationConfig.included ? installationConfig.totalPrice : 0 },
        priceLabels,
        priceComments,
        optionPriceHidden,
        itemComments,
        optionComments,
        basePrices,
        optionPrices,
        interlockingTotal: calculateInterlocking(),
        totalListPrice: calculateTotalListPrice(),
        grossTotal: calculateGrossTotal(),
        discountAmount: calculateDiscount(),
        netTotal: calculateNetTotal(),
      };
      const res = await apiRequest("PUT", `/api/dealer/offers/${offerId}/prices`, {
        pricing,
        items,
        totalPrice: calculateFinalTotal(),
        sectionOrder,
        hiddenSections,
        pageBreaks,
        machineBreakPositions,
      });
      const result = await res.json();
      return result.newOfferId as number;
    },
    onSuccess: (newOfferId: number) => {
      toast({ title: "Prices saved!", description: "Redirecting to your offer…" });
      setLocation(`/dealer/offers/${newOfferId}`);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading || !initialized) {
    return (
      <DealerLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DealerLayout>
    );
  }

  if (!offer || (offer as any).message) {
    return <DealerLayout><div className="text-center py-20 text-muted-foreground">Offer not found or access denied.</div></DealerLayout>;
  }

  const pd = offer.projectData ?? {};
  const hi = pd.headerInfo ?? {};
  const ts = pd.technicalSpecs ?? {};
  const customerName = offer.customer?.name ?? offer.customer?.companyName ?? "—";
  const currentStepDef = STEPS[step - 1];
  const isLastStep = step === STEPS.length;

  const enabledIds = (formatSettings?.sections ?? []).filter((s: any) => s.enabled).map((s: any) => s.id);
  const displayOrder = sectionOrder.length > 0
    ? [...sectionOrder.filter((id: string) => enabledIds.includes(id)), ...enabledIds.filter((id: string) => !sectionOrder.includes(id))]
    : enabledIds;
  const visibleCount = displayOrder.filter((id: string) => !hiddenSections.includes(id)).length;

  return (
    <DealerLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="Edit Prices"
          subtitle={`${offer.referenceNumber} — ${offer.subject}`}
        />

        <div className="flex items-center gap-1 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1">
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  step === i + 1 ? "bg-primary text-primary-foreground" : step > i + 1 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground",
                  i + 1 < step && "cursor-pointer"
                )}
                onClick={() => { if (i + 1 < step) setStep(i + 1); }}
                data-testid={`step-tab-${s.id}`}
              >
                {step > i + 1 ? <Check className="w-3 h-3" /> : s.readOnly ? <Lock className="w-3 h-3" /> : <span>{i + 1}</span>}
                <span>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
            </div>
          ))}
        </div>

        <div className="border rounded-xl bg-card p-6 min-h-64">
          <AnimatePresence mode="wait">

            {currentStepDef.id === "customer" && (
              <motion.div key="customer" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <h3 className="font-semibold text-lg">Customer Details</h3>
                  <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" />Read-only</Badge>
                </div>
                <div className="bg-muted/30 rounded-lg p-4 grid md:grid-cols-2 gap-4">
                  <ReadOnlyField label="Customer" value={customerName} />
                  <ReadOnlyField label="Subject" value={offer.subject} />
                  <ReadOnlyField label="Reference" value={offer.referenceNumber} />
                  <ReadOnlyField label="Version" value={`v${displayVersion(offer.version)}`} />
                </div>
              </motion.div>
            )}

            {currentStepDef.id === "details" && (
              <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <h3 className="font-semibold text-lg">Date & Parties</h3>
                  <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" />Read-only</Badge>
                </div>
                <div className="bg-muted/30 rounded-lg p-4 space-y-4">
                  <ReadOnlyField label="Date" value={hi.date} />
                  {hi.salesman && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Salesman</p>
                      <div className="grid md:grid-cols-3 gap-3">
                        <ReadOnlyField label="Name" value={hi.salesman.name} />
                        <ReadOnlyField label="Email" value={hi.salesman.email} />
                        <ReadOnlyField label="Mobile" value={hi.salesman.mobile} />
                      </div>
                    </div>
                  )}
                  {hi.customer && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Customer</p>
                      <div className="grid md:grid-cols-2 gap-3">
                        <ReadOnlyField label="Company Name" value={hi.customer.name} />
                        <ReadOnlyField label="Contact Person" value={hi.customer.contactPerson} />
                        <ReadOnlyField label="Email" value={hi.customer.email} />
                        <ReadOnlyField label="Address" value={hi.customer.address} />
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {currentStepDef.id === "subject" && (
              <motion.div key="subject" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <h3 className="font-semibold text-lg">Project Data</h3>
                  <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" />Read-only</Badge>
                </div>
                <div className="bg-muted/30 rounded-lg p-4 grid md:grid-cols-2 gap-4">
                  <ReadOnlyField label="Subject / Title" value={offer.subject} />
                  <ReadOnlyField label="Layout" value={pd.layout} />
                  {pd.family && <ReadOnlyField label="Product Family" value={pd.family.charAt(0).toUpperCase() + pd.family.slice(1)} />}
                </div>
              </motion.div>
            )}

            {currentStepDef.id === "specs" && (
              <motion.div key="specs" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <h3 className="font-semibold text-lg">Technical Specifications</h3>
                  <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" />Read-only</Badge>
                </div>
                {Object.values(ts).some(Boolean) ? (
                  <div className="bg-muted/30 rounded-lg p-4 grid md:grid-cols-2 gap-4">
                    <ReadOnlyField label="Min/Max. Length (mm)" value={ts.minMaxLength} />
                    <ReadOnlyField label="Max. Width (mm)" value={ts.maxWidth} />
                    <ReadOnlyField label="Min/Max. Thickness (mm)" value={ts.minMaxThickness} />
                    <ReadOnlyField label="Avg. Line Speed (mt/min)" value={ts.averageLineSpeed} />
                    <ReadOnlyField label="Control Side" value={ts.controlSide} />
                    <ReadOnlyField label="Max. Bow of Panel" value={ts.maxBow} />
                    <ReadOnlyField label="Paint" value={ts.paint} />
                    <ReadOnlyField label="Substrate" value={ts.substrate} />
                    <ReadOnlyField label="Finishing Level" value={ts.finishing} />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm italic">No technical specifications recorded for this offer.</p>
                )}
              </motion.div>
            )}

            {currentStepDef.id === "pricing" && (
              <motion.div key="pricing" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
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

                <div className="space-y-2">
                  {showDetailedPrices && (
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-1 mb-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item</span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28 text-right">Unit Price €</span>
                      <span className="w-6" />
                      <span className="w-7" />
                    </div>
                  )}
                  {offer.items.map((item, index) => {
                    const base = basePrices[item.id] ?? parseFloat(item.snapshotBasePrice) ?? 0;
                    const hiddenSum = item.options.reduce((s, opt) => optionPriceHidden[opt.id] ? s + (optionPrices[opt.id] ?? parseFloat(opt.snapshotPriceModifier) ?? 0) * (opt.quantity || 1) : s, 0);
                    // getItemOptionsTotal now includes ALL options (visible + hidden) so
                    // hidden options are counted exactly once via the rolled-up base.
                    const itemTotal = (base + getItemOptionsTotal(item)) * item.quantity;
                    const displayedUnit = base + hiddenSum;
                    const hiddenNames = item.options.filter(opt => optionPriceHidden[opt.id]).map(opt => opt.snapshotOptionName);
                    return (
                      <div key={item.id} className="border rounded-lg p-3 space-y-1.5">
                        <div className={cn("items-center", showDetailedPrices ? "grid grid-cols-[1fr_auto_auto_auto] gap-x-2" : "flex justify-between")}>
                          <span className="font-medium text-sm">Pos. {index + 1}: {item.snapshotMachineName} ×{item.quantity}</span>
                          {showDetailedPrices ? (
                            <>
                              <div className="flex items-center gap-1 shrink-0">
                                <Input type="number" value={displayedUnit || ""} onChange={e => { const val = parseFloat(e.target.value) || 0; setBasePrices(prev => ({ ...prev, [item.id]: val - hiddenSum })); }} className="w-28 h-7 text-xs font-mono text-right" data-testid={`input-machine-price-${index}`} title={hiddenSum > 0 ? `Include opzioni nascoste (+€${hiddenSum.toLocaleString()}): ${hiddenNames.join(", ")}` : undefined} />
                              </div>
                              <CommentButton comment={itemComments[item.id] ?? ""} onChange={v => setItemComments(prev => ({ ...prev, [item.id]: v }))} data-testid={`comment-machine-${index}`} />
                              <span className="w-7" />
                            </>
                          ) : (
                            <CommentButton comment={itemComments[item.id] ?? ""} onChange={v => setItemComments(prev => ({ ...prev, [item.id]: v }))} data-testid={`comment-machine-${index}`} />
                          )}
                        </div>
                        {showDetailedPrices && item.options.map(opt => {
                          const isHidden = !!optionPriceHidden[opt.id];
                          return (
                            <div key={opt.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center pl-4">
                              <span className="text-xs text-muted-foreground">+ {opt.snapshotOptionName}{opt.quantity > 1 ? ` ×${opt.quantity}` : ""}</span>
                              <div className="flex items-center gap-1 shrink-0 w-28 justify-end">
                                {isHidden ? (
                                  <span className="text-xs text-muted-foreground font-mono italic">incl.</span>
                                ) : (
                                  <Input type="number" value={optionPrices[opt.id] ?? ""} onChange={e => setOptionPrices(prev => ({ ...prev, [opt.id]: parseFloat(e.target.value) || 0 }))} className="w-28 h-7 text-xs font-mono text-right" data-testid={`input-option-price-${index}-${opt.id}`} />
                                )}
                              </div>
                              <CommentButton comment={optionComments[opt.id] ?? ""} onChange={v => setOptionComments(prev => ({ ...prev, [opt.id]: v }))} data-testid={`input-option-comment-${index}-${opt.id}`} />
                              <button type="button" onClick={() => setOptionPriceHidden(prev => ({ ...prev, [opt.id]: !isHidden }))} className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title={isHidden ? "Show option price separately" : "Merge price into machine"} data-testid={`btn-toggle-option-price-${index}-${opt.id}`}>
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

                <div className="border rounded-lg p-3 bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Input value={priceLabels.interlocking} onChange={e => setPriceLabels(prev => ({ ...prev, interlocking: e.target.value }))} className="h-7 text-sm font-medium w-40 shrink-0" data-testid="label-interlocking" />
                    <span className="text-xs text-muted-foreground shrink-0">({offer.items.length} pos. ×</span>
                    <div className="flex items-center gap-1">
                      <span className="text-sm">€</span>
                      <Input type="number" value={interlockingPricePerPosition || ""} onChange={e => setInterlockingPricePerPosition(parseFloat(e.target.value) || 0)} className="w-20 h-7 text-xs font-mono" data-testid="input-interlocking-price" />
                      <span className="text-xs text-muted-foreground">)</span>
                    </div>
                    <span className="font-mono font-medium ml-auto">€{calculateInterlocking().toLocaleString()}</span>
                    <CommentButton comment={priceComments.interlocking} onChange={v => setPriceComments(prev => ({ ...prev, interlocking: v }))} data-testid="comment-interlocking" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium text-sm text-muted-foreground">Extra Items</h4>
                    <Button size="sm" variant="outline" onClick={() => setExtraItems(prev => [...prev, { id: Math.random().toString(36), description: "", price: 0 }])} data-testid="button-add-extra">
                      <Plus className="w-3 h-3 mr-1" /> Add Extra
                    </Button>
                  </div>
                  {extraItems.map((extra, index) => (
                    <div key={extra.id} className="flex gap-3 items-center">
                      <Input placeholder="Description" value={extra.description} onChange={e => setExtraItems(prev => prev.map(x => x.id === extra.id ? { ...x, description: e.target.value } : x))} className="flex-1" data-testid={`input-extra-desc-${index}`} />
                      <div className="flex items-center gap-1">
                        <span>€</span>
                        <Input type="number" placeholder="0" value={extra.price || ""} onChange={e => setExtraItems(prev => prev.map(x => x.id === extra.id ? { ...x, price: parseFloat(e.target.value) || 0 } : x))} className="w-28" data-testid={`input-extra-price-${index}`} />
                      </div>
                      <CommentButton comment={priceComments.extras[extra.id] || ""} onChange={v => setPriceComments(prev => ({ ...prev, extras: { ...prev.extras, [extra.id]: v } }))} data-testid={`comment-extra-${index}`} />
                      <Button size="icon" variant="ghost" onClick={() => setExtraItems(prev => prev.filter(x => x.id !== extra.id))} data-testid={`button-remove-extra-${index}`}>
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

                <div className="border-2 border-primary/30 rounded-lg p-3 bg-primary/5">
                  <div className="flex items-center gap-3">
                    <Input value={priceLabels.totalListPrice} onChange={e => setPriceLabels(prev => ({ ...prev, totalListPrice: e.target.value }))} className="h-7 text-sm font-bold flex-1" data-testid="label-total-list-price" />
                    <span className="font-mono font-bold shrink-0">€{calculateTotalListPrice().toLocaleString()}</span>
                  </div>
                </div>

                <div className="border rounded-lg p-3 bg-muted/30">
                  <div className="flex justify-between items-center gap-4">
                    <span className="font-medium">Discount (%)</span>
                    <div className="flex items-center gap-2">
                      <Input type="number" min="0" max="100" value={discountPercent || ""} onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)} className="w-24" data-testid="input-discount" />
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
                        <Input value={priceLabels.installation} onChange={e => setPriceLabels(prev => ({ ...prev, installation: e.target.value }))} className="h-7 text-sm font-medium flex-1" data-testid="label-installation" />
                        <div className="flex items-center gap-2">
                          <CommentButton comment={priceComments.installation} onChange={v => setPriceComments(prev => ({ ...prev, installation: v }))} data-testid="comment-installation" />
                          <button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, included: !prev.included }))} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", installationConfig.included ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-installation-included">
                            {installationConfig.included ? "INCLUDED" : "EXCLUDED"}
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Daily fee</span>
                            <button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, hideDailyFee: !prev.hideDailyFee }))} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="toggle-hide-daily-fee">
                              {installationConfig.hideDailyFee ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input type="number" value={installationConfig.dailyFee || ""} onChange={e => { const dailyFee = parseFloat(e.target.value) || 0; setInstallationConfig(prev => ({ ...prev, dailyFee, totalPrice: dailyFee * prev.totalDays })); }} className="flex-1 h-7 text-xs font-mono" data-testid="input-installation-daily-fee" />
                            <span className="text-xs text-muted-foreground shrink-0">€/day</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Days</span>
                            <button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, hideTotalDays: !prev.hideTotalDays }))} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="toggle-hide-installation-days">
                              {installationConfig.hideTotalDays ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input type="number" value={installationConfig.totalDays || ""} onChange={e => { const totalDays = parseFloat(e.target.value) || 0; setInstallationConfig(prev => ({ ...prev, totalDays, totalPrice: prev.dailyFee * totalDays })); }} className="flex-1 h-7 text-xs font-mono" data-testid="input-installation-days" />
                            <span className="text-xs text-muted-foreground shrink-0">days</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Total</span>
                            <button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, hideTotalPrice: !prev.hideTotalPrice }))} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="toggle-hide-installation-total">
                              {installationConfig.hideTotalPrice ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground shrink-0">€</span>
                            <Input type="number" value={installationConfig.totalPrice || ""} onChange={e => setInstallationConfig(prev => ({ ...prev, totalPrice: parseFloat(e.target.value) || 0 }))} className="flex-1 h-7 text-xs font-mono" data-testid="input-installation-total" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <Input value={priceLabels.travelCosts} onChange={e => setPriceLabels(prev => ({ ...prev, travelCosts: e.target.value }))} className="h-7 text-sm flex-1" data-testid="label-travel" />
                      <div className="flex items-center gap-2">
                        <CommentButton comment={priceComments.travel} onChange={v => setPriceComments(prev => ({ ...prev, travel: v }))} data-testid="comment-travel" />
                        <button type="button" onClick={() => setServiceItems({ ...serviceItems, travelCosts: !serviceItems.travelCosts })} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.travelCosts ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-travel">
                          {serviceItems.travelCosts ? "INCLUDED" : "EXCLUDED"}
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <Input value={priceLabels.boardLodging} onChange={e => setPriceLabels(prev => ({ ...prev, boardLodging: e.target.value }))} className="h-7 text-sm flex-1" data-testid="label-board" />
                      <div className="flex items-center gap-2">
                        <CommentButton comment={priceComments.boardLodging} onChange={v => setPriceComments(prev => ({ ...prev, boardLodging: v }))} data-testid="comment-board-lodging" />
                        <button type="button" onClick={() => setServiceItems({ ...serviceItems, boardLodging: !serviceItems.boardLodging })} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.boardLodging ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-board">
                          {serviceItems.boardLodging ? "INCLUDED" : "EXCLUDED"}
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <Input value={priceLabels.training} onChange={e => setPriceLabels(prev => ({ ...prev, training: e.target.value }))} className="h-7 text-sm flex-1" data-testid="label-training" />
                      <div className="flex items-center gap-2 shrink-0">
                        <CommentButton comment={priceComments.training} onChange={v => setPriceComments(prev => ({ ...prev, training: v }))} data-testid="comment-training" />
                        <div className="flex items-center gap-1">
                          <Input value={serviceItems.trainingDays} onChange={e => setServiceItems({ ...serviceItems, trainingDays: e.target.value })} className="w-16" data-testid="input-training-days" />
                          <span className="text-sm text-muted-foreground">days</span>
                        </div>
                        <button type="button" onClick={() => setServiceItems({ ...serviceItems, trainingIncluded: !serviceItems.trainingIncluded })} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.trainingIncluded ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-training">
                          {serviceItems.trainingIncluded ? "INCLUDED" : "EXCLUDED"}
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <Input value={priceLabels.packaging} onChange={e => setPriceLabels(prev => ({ ...prev, packaging: e.target.value }))} className="h-7 text-sm flex-1" data-testid="label-packaging" />
                      <div className="flex items-center gap-2">
                        <CommentButton comment={priceComments.packaging} onChange={v => setPriceComments(prev => ({ ...prev, packaging: v }))} data-testid="comment-packaging" />
                        <button type="button" onClick={() => setServiceItems({ ...serviceItems, packaging: !serviceItems.packaging })} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.packaging ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-packaging">
                          {serviceItems.packaging ? "INCLUDED" : "EXCLUDED"}
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <Input value={priceLabels.transport} onChange={e => setPriceLabels(prev => ({ ...prev, transport: e.target.value }))} className="h-7 text-sm flex-1" data-testid="label-transport" />
                      <div className="flex items-center gap-2 shrink-0">
                        <CommentButton comment={priceComments.transport} onChange={v => setPriceComments(prev => ({ ...prev, transport: v }))} data-testid="comment-transport" />
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">€</span>
                          <Input type="number" value={serviceItems.transportPrice || ""} onChange={e => setServiceItems({ ...serviceItems, transportPrice: parseFloat(e.target.value) || 0 })} className="w-24 h-7 text-xs font-mono" data-testid="input-transport-price" />
                        </div>
                        <button type="button" onClick={() => setServiceItems({ ...serviceItems, transportIncluded: !serviceItems.transportIncluded })} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.transportIncluded ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-transport">
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

                <div className="border-t-2 pt-4 space-y-2">
                  <div className="flex justify-between items-center gap-4">
                    <Input value={priceLabels.grossTotal} onChange={e => setPriceLabels(prev => ({ ...prev, grossTotal: e.target.value }))} className="h-7 text-base font-medium w-48" data-testid="label-gross-total" />
                    <span className="font-mono font-bold text-lg">€{calculateGrossTotal().toLocaleString()}</span>
                  </div>
                  {discountPercent > 0 && (
                    <div className="flex justify-between items-center gap-4 text-primary">
                      <Input value={priceLabels.netTotal} onChange={e => setPriceLabels(prev => ({ ...prev, netTotal: e.target.value }))} className="h-7 text-base font-medium w-48" data-testid="label-net-total" />
                      <span className="font-mono font-bold text-lg">€{calculateNetTotal().toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {currentStepDef.id === "review" && (
              <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h3 className="font-semibold text-lg mb-4">Review Sections</h3>
                <div className="flex flex-col lg:flex-row gap-6">

                  {/* Left: DnD layout controls */}
                  <div className="lg:w-2/5 flex flex-col gap-4">
                    <div>
                      <h4 className="font-semibold text-base border-b pb-2">Page Layout</h4>
                      <p className="text-sm text-muted-foreground mt-2">Drag sections to set their order. Use the page-break button to force a section to start on a new page. Uncheck to hide a section.</p>
                    </div>

                    <DragDropContext onDragEnd={(result) => {
                      if (!result.destination) return;
                      const items = [...displayOrder];
                      const [removed] = items.splice(result.source.index, 1);
                      items.splice(result.destination.index, 0, removed);
                      setSectionOrder(items);
                      setTimeout(() => generatePreviewPdf(), 400);
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
                                      <div className={`flex items-center gap-3 p-3 border rounded-md transition-colors ${snapshot.isDragging ? "shadow-md bg-background" : isVisible ? "hover:bg-muted/30" : "opacity-50"} ${isMachineLine ? "border-green-300 bg-green-50/50 dark:bg-green-950/20" : ""}`}>
                                        <div {...provided.dragHandleProps} className="cursor-grab text-muted-foreground shrink-0" data-testid={`drag-handle-${secId}`}>
                                          <GripVertical className="w-4 h-4" />
                                        </div>
                                        <label htmlFor={`section-vis-${secId}`} className={`font-medium text-sm flex-1 cursor-pointer ${isMachineLine ? "text-green-800 dark:text-green-300" : ""}`}>
                                          {label}
                                          {isMachineLine && offer.items.length > 0 && (
                                            <span className="ml-1.5 text-xs font-normal text-green-600">({offer.items.length} position{offer.items.length !== 1 ? "s" : ""})</span>
                                          )}
                                        </label>
                                        <Button variant="ghost" size="sm" type="button" className={`h-7 w-7 p-0 ${hasPageBreak ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
                                          onClick={() => { setPageBreaks(prev => hasPageBreak ? prev.filter(id => id !== secId) : [...prev, secId]); setTimeout(() => generatePreviewPdf(), 400); }}
                                          title={hasPageBreak ? "Remove page break" : "Start on new page"} data-testid={`btn-pagebreak-${secId}`}>
                                          <CornerDownLeft className="w-3.5 h-3.5" />
                                        </Button>
                                        <Checkbox id={`section-vis-${secId}`} checked={isVisible}
                                          onCheckedChange={(checked) => {
                                            if (checked) setHiddenSections(prev => prev.filter(id => id !== secId));
                                            else setHiddenSections(prev => [...prev, secId]);
                                            setTimeout(() => generatePreviewPdf(), 400);
                                          }}
                                          data-testid={`checkbox-section-${secId}`}
                                        />
                                      </div>

                                      {isMachineLine && isVisible && offer.items.length > 0 && (
                                        <div className="ml-6 mt-1 mb-1 flex flex-col gap-0.5 border-l-2 border-green-200 pl-2">
                                          {offer.items.map((item, posIdx) => {
                                            const hasMachBreak = machinePageBreakItemIds.includes(item.id);
                                            return (
                                              <div key={item.id}>
                                                {hasMachBreak && posIdx > 0 && (
                                                  <div className="flex items-center gap-1.5 py-0.5 px-1 mb-0.5">
                                                    <div className="flex-1 border-t border-dashed border-primary/30" />
                                                    <span className="text-primary/60 flex items-center gap-0.5 shrink-0 leading-none" style={{ fontSize: 9 }}>
                                                      <CornerDownLeft className="w-2.5 h-2.5" />new page
                                                    </span>
                                                    <div className="flex-1 border-t border-dashed border-primary/30" />
                                                  </div>
                                                )}
                                                <div className="flex items-center gap-2 px-2 py-1.5 rounded-sm bg-green-50 dark:bg-green-950/30 border border-green-100">
                                                  <span className="text-xs font-semibold text-green-700 dark:text-green-400 shrink-0 w-10">Pos. {posIdx + 1}</span>
                                                  <span className="text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">{item.snapshotMachineName}</span>
                                                  {posIdx > 0 && (
                                                    <Button variant="ghost" size="sm" type="button"
                                                      className={`h-5 w-5 p-0 shrink-0 ${hasMachBreak ? "text-primary bg-primary/10" : "text-muted-foreground/60"}`}
                                                      onClick={() => { setMachinePageBreakItemIds(prev => hasMachBreak ? prev.filter(id => id !== item.id) : [...prev, item.id]); setTimeout(() => generatePreviewPdf(), 400); }}
                                                      title={hasMachBreak ? "Remove page break before this position" : "Start this position on a new page"}
                                                      data-testid={`btn-machinebreak-${item.id}`}>
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

                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                      <h4 className="font-medium mb-2">Summary</h4>
                      <p className="text-sm text-muted-foreground">Customer: {customerName}</p>
                      <p className="text-sm text-muted-foreground">Items: {offer.items.length}</p>
                      <p className="text-sm text-muted-foreground">Visible sections: {visibleCount} of {displayOrder.length}</p>
                      {pageBreaks.length > 0 && <p className="text-sm text-muted-foreground">Page breaks: {pageBreaks.length}</p>}
                      <p className="font-bold text-xl mt-2">€{calculateFinalTotal().toLocaleString()}</p>
                    </div>

                    <Button
                      className="w-full shadow-lg shadow-primary/20"
                      size="lg"
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                      data-testid="button-save-offer"
                    >
                      {saveMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <FileText className="w-4 h-4 mr-2" />
                      )}
                      Save & View Offer
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Saves your prices and opens the offer view where you can download the PDF.
                    </p>
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
                      <iframe src={pdfBlobUrl} className="flex-1 w-full rounded-xl border shadow-sm" title="Offer PDF Preview" style={{ minHeight: "70vh" }} />
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
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 1} data-testid="button-prev">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          {!isLastStep && (
            <Button onClick={() => setStep(s => s + 1)} data-testid="button-next">
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </DealerLayout>
  );
}
