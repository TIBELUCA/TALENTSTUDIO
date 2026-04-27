import { Layout } from "@/components/Layout";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { useCustomers } from "@/hooks/use-customers";
import { useMachines } from "@/hooks/use-machines";
import { usePresets } from "@/hooks/use-presets";
import { useOffer, useCreateOffer, useUpdateOffer } from "@/hooks/use-offers";
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
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";

import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Loader2, Trash2, Plus, ChevronRight, ChevronLeft, Check,
  GripVertical, Eye, EyeOff, CornerDownLeft, Pencil, X,
  Sparkles, Upload, FileText, Users, User, Lock, Package,
  ShieldCheck, Brain, ArrowLeft, Gauge, AlertTriangle, Truck, CreditCard,
  History, ChevronDown as ChevronDownIcon, Save, FolderOpen,
  Ruler, Paperclip, CheckCircle2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MachinePicker, type CustomMachineData } from "@/components/MachinePicker";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { CommentButton } from "@/components/CommentButton";
import { AIAssistantPanel } from "@/components/ai";
import type { MachineRecommendation, DraftInsertCallbacks } from "@/components/ai";
import {
  useRecommendMachines, useSubmitFeedback,
  useDraftOfferText, useReviewRisks, useConfigSafetyGuard,
  useQuoteContext, useSalesInsights, useOfferPatterns,
} from "@/hooks/use-ai-assistant";
import { useToast } from "@/hooks/use-toast";
import type { FamilyDefaults } from "./FamilyDefaults";
import type { Contact, Drawing, Offer } from "@shared/schema";
import { displayVersion } from "@shared/version";
import { useWizardDraft } from "@/hooks/use-wizard-draft";
import { OfferCrmStep, EMPTY_CRM_FORM, type CrmStepFormState, type PendingReminder } from "@/components/OfferCrmStep";

import type {
  CartItem, TechnicalSpecs, ExtraItem, ServiceItems,
  InstallationConfig, PriceComments, PriceLabels,
  WizardStep, OfferRole, OfferMode,
} from "@/types/offer";
import {
  DEFAULT_PRICE_LABELS, defaultServiceItems, defaultTechnicalSpecs,
  defaultInstallationConfig, defaultPriceComments,
  SECTION_TO_STEP, DETAILS_STEP, SECTION_LABELS,
} from "@/constants/offer";
import {
  getItemOptionsTotal, getItemHiddenOptionsTotal, getDisplayedUnitPrice, calculateMachinesTotal, calculateInterlocking,
  calculateExtrasTotal, calculateServicesTotal, calculateTotalListPrice,
  calculateGrossTotal, calculateDiscount, calculateNetTotal, applyLineDiscount,
  calculateFinalTotal, buildWizardSteps, formatPrice,
} from "@/utils/offerCalculations";

function OfferPriceBreakdown({ offer, fmtCur }: { offer: any; fmtCur: (v: any) => string }) {
  const items: any[] = offer.items ?? [];
  const pd = offer.projectData?.pricing ?? {};
  const svc = pd.serviceItems;
  const inst = pd.installationConfig;
  const extras: any[] = pd.extraItems ?? [];
  const discPct = pd.discountPercent ?? 0;
  const interlockingPP = pd.interlockingPricePerPosition ?? 0;
  const interlockingTotal = pd.interlockingTotal ?? (items.length > 0 && interlockingPP > 0 ? interlockingPP * items.length : 0);

  const machinesTotal = items.reduce((s: number, item: any) => {
    const optT = (item.options ?? []).reduce((a: number, opt: any) => a + (parseFloat(opt.snapshotPriceModifier || "0") * (opt.quantity ?? 1)), 0);
    return s + (parseFloat(item.snapshotBasePrice || "0") + optT) * (item.quantity ?? 1);
  }, 0);
  const extrasTotal = extras.reduce((s: number, e: any) => s + (e.price || 0), 0);
  const totalListPrice = machinesTotal + interlockingTotal + extrasTotal;

  let servicesTotal = 0;
  const travelT = svc ? (svc.travelCostsDailyFee || 0) * (svc.travelCostsDays || 0) + (svc.travelFlightTicket || 0) : 0;
  const boardT = svc ? (svc.boardLodgingDailyFee || 0) * (svc.travelCostsDays || 0) : 0;
  const transportT = svc?.transportPrice || 0;
  if (inst && inst.totalPrice > 0) servicesTotal += inst.totalPrice;
  servicesTotal += travelT + boardT + transportT;
  const grossTotal = totalListPrice + servicesTotal;
  const discountAmount = discPct > 0 ? (totalListPrice * discPct) / 100 : 0;
  const netTotal = grossTotal - discountAmount;

  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  if (items.length === 0) return <p className="text-xs text-muted-foreground py-2">Nessuna riga disponibile.</p>;

  const inclBadge = (included: boolean) => (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${included ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"}`}>
      {included ? "Incluso" : "Escluso"}
    </span>
  );

  return (
    <div className="border rounded-md overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left px-2 py-1.5 font-semibold w-8">Pos.</th>
            <th className="text-left px-2 py-1.5 font-semibold">Descrizione</th>
            <th className="text-center px-2 py-1.5 font-semibold w-10">Qtà</th>
            <th className="text-right px-2 py-1.5 font-semibold w-24">Importo</th>
          </tr>
        </thead>
        <tbody>
          {items.flatMap((item: any, idx: number) => {
            const opts: any[] = item.options ?? [];
            const optTotal = opts.reduce((s: number, opt: any) => s + (parseFloat(opt.snapshotPriceModifier || "0") * (opt.quantity ?? 1)), 0);
            const lineTotal = (parseFloat(item.snapshotBasePrice || "0") + optTotal) * (item.quantity ?? 1);
            const isItemExpanded = expandedItem === (item.id || idx);
            const rows = [
              <tr
                key={`m-${item.id || idx}`}
                className={`border-t hover:bg-muted/20 ${opts.length > 0 ? "cursor-pointer" : ""}`}
                onClick={() => opts.length > 0 && setExpandedItem(isItemExpanded ? null : (item.id || idx))}
              >
                <td className="px-2 py-1.5 font-mono">{item.position ?? idx + 1}</td>
                <td className="px-2 py-1.5 font-medium">
                  <span className="flex items-center gap-1">
                    {item.snapshotMachineName}
                    {opts.length > 0 && <ChevronDownIcon className={`w-3 h-3 text-muted-foreground transition-transform ${isItemExpanded ? "rotate-180" : ""}`} />}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Base: {fmtCur(item.snapshotBasePrice)}
                    {opts.length > 0 && ` + ${opts.length} opt.: ${opts.map((o: any) => o.snapshotOptionName).join(", ")}`}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-center">{item.quantity ?? 1}</td>
                <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmtCur(lineTotal)}</td>
              </tr>
            ];
            if (isItemExpanded) {
              opts.forEach((opt: any, oi: number) => {
                rows.push(
                  <tr key={`opt-${item.id}-${oi}`} className="bg-muted/5">
                    <td className="px-2 py-1"></td>
                    <td className="px-2 py-1 pl-5 text-muted-foreground">↳ {opt.snapshotOptionName}</td>
                    <td className="px-2 py-1 text-center text-muted-foreground">{opt.quantity ?? 1}</td>
                    <td className="px-2 py-1 text-right font-mono text-muted-foreground">{fmtCur(parseFloat(opt.snapshotPriceModifier || "0") * (opt.quantity ?? 1))}</td>
                  </tr>
                );
              });
            }
            return rows;
          })}

          {interlockingTotal > 0 && (
            <tr className="border-t hover:bg-muted/20">
              <td className="px-2 py-1.5"></td>
              <td className="px-2 py-1.5 font-medium">Interlocking <span className="text-[10px] text-muted-foreground ml-1">{items.length} pos. × {fmtCur(interlockingPP)}</span></td>
              <td className="px-2 py-1.5"></td>
              <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmtCur(interlockingTotal)}</td>
            </tr>
          )}

          {extras.map((e: any, i: number) => (
            <tr key={`ex-${i}`} className="border-t hover:bg-muted/20">
              <td className="px-2 py-1.5"></td>
              <td className="px-2 py-1.5 font-medium">{e.description || "Extra"} <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 ml-1">Extra</span></td>
              <td className="px-2 py-1.5"></td>
              <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmtCur(e.price)}</td>
            </tr>
          ))}

          <tr className="border-t bg-muted/20 font-semibold">
            <td className="px-2 py-1.5"></td>
            <td className="px-2 py-1.5 text-right" colSpan={2}>Totale macchine</td>
            <td className="px-2 py-1.5 text-right font-mono">{fmtCur(totalListPrice)}</td>
          </tr>

          {inst && inst.totalPrice > 0 && (
            <tr className="border-t hover:bg-muted/20">
              <td className="px-2 py-1.5"></td>
              <td className="px-2 py-1.5 font-medium">
                Installazione {inclBadge(inst.included)}
                {inst.totalDays > 0 && <span className="ml-1 text-[10px] text-muted-foreground">{inst.totalDays}gg × {fmtCur(inst.dailyFee)}/gg</span>}
              </td>
              <td className="px-2 py-1.5"></td>
              <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmtCur(inst.totalPrice)}</td>
            </tr>
          )}
          {travelT > 0 && (
            <tr className="border-t hover:bg-muted/20">
              <td className="px-2 py-1.5"></td>
              <td className="px-2 py-1.5 font-medium">Spese di viaggio {svc && inclBadge(svc.travelCosts)}</td>
              <td className="px-2 py-1.5"></td>
              <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmtCur(travelT)}</td>
            </tr>
          )}
          {boardT > 0 && (
            <tr className="border-t hover:bg-muted/20">
              <td className="px-2 py-1.5"></td>
              <td className="px-2 py-1.5 font-medium">Vitto e alloggio {svc && inclBadge(svc.boardLodging)}</td>
              <td className="px-2 py-1.5"></td>
              <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmtCur(boardT)}</td>
            </tr>
          )}
          {transportT > 0 && (
            <tr className="border-t hover:bg-muted/20">
              <td className="px-2 py-1.5"></td>
              <td className="px-2 py-1.5 font-medium">Trasporto {svc && inclBadge(svc.transportIncluded)}</td>
              <td className="px-2 py-1.5"></td>
              <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmtCur(transportT)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/20 font-semibold">
            <td className="px-2 py-1.5"></td>
            <td className="px-2 py-1.5 text-right" colSpan={2}>Totale lordo</td>
            <td className="px-2 py-1.5 text-right font-mono">{fmtCur(grossTotal)}</td>
          </tr>
          {discPct > 0 && (
            <>
              <tr className="text-red-600 dark:text-red-400">
                <td className="px-2 py-1.5"></td>
                <td className="px-2 py-1.5 text-right font-semibold" colSpan={2}>Sconto ({discPct}%)</td>
                <td className="px-2 py-1.5 text-right font-mono font-semibold">- {fmtCur(discountAmount)}</td>
              </tr>
              <tr className="border-t bg-primary/10 font-bold">
                <td className="px-2 py-2"></td>
                <td className="px-2 py-2 text-right" colSpan={2}>Totale netto</td>
                <td className="px-2 py-2 text-right font-mono">{fmtCur(netTotal)}</td>
              </tr>
            </>
          )}
          {discPct === 0 && (
            <tr className="border-t bg-primary/10 font-bold">
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2 text-right" colSpan={2}>Totale offerta</td>
              <td className="px-2 py-2 text-right font-mono">{fmtCur(grossTotal)}</td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}

function CustomerOfferHistory({ customerId }: { customerId: string }) {
  const [listOpen, setListOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data: customerOffers, isLoading } = useQuery<any[]>({
    queryKey: ["/api/customers", customerId, "offers"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/offers`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!customerId,
  });

  const { data: expandedOffer } = useQuery<any>({
    queryKey: ["/api/offers", expandedId],
    queryFn: async () => {
      const res = await fetch(`/api/offers/${expandedId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!expandedId,
  });

  if (isLoading) return null;
  const sorted = (customerOffers ?? [])
    .filter((o: any) => !o.deletedAt)
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  if (sorted.length === 0) return null;

  const fmtDate = (d: string | Date | null) => {
    if (!d) return "—";
    try {
      const dt = new Date(d);
      return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
    } catch { return "—"; }
  };
  const fmtCur = (v: number | string | null | undefined) => {
    if (v == null) return "—";
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (isNaN(n)) return "—";
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
  };

  return (
    <div className="border rounded-lg overflow-hidden" data-testid="customer-offer-history">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
        onClick={() => setListOpen(prev => !prev)}
        data-testid="btn-toggle-offer-history"
      >
        <History className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Offerte precedenti ({sorted.length})</span>
        <ChevronDownIcon className={`w-3.5 h-3.5 text-muted-foreground ml-auto transition-transform ${listOpen ? "rotate-180" : ""}`} />
      </button>
      {listOpen && (
        <div className="divide-y border-t">
          {sorted.map((o: any) => {
            const isExpanded = expandedId === o.id;
            return (
              <div key={o.id}>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : o.id)}
                  data-testid={`btn-offer-history-${o.id}`}
                >
                  <span className="text-sm font-mono font-bold text-primary">{o.referenceNumber}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(o.date)}</span>
                  {o.subject && <span className="text-xs text-muted-foreground truncate flex-1 hidden sm:inline">{o.subject}</span>}
                  <span className="text-sm font-mono font-semibold ml-auto">{fmtCur(o.totalPrice)}</span>
                  <a
                    href={`/offers/${o.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-primary transition-colors shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`btn-view-offer-${o.id}`}
                    title="Visualizza offerta"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </a>
                  <ChevronDownIcon className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 bg-muted/10">
                    {expandedOffer && expandedOffer.id === o.id ? (
                      <OfferPriceBreakdown offer={expandedOffer} fmtCur={fmtCur} />
                    ) : (
                      <div className="flex items-center gap-2 py-3">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Caricamento...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface OfferWorkflowProps {
  mode: OfferMode;
  role: OfferRole;
}

export default function OfferWorkflow({ mode, role }: OfferWorkflowProps) {
  const { id } = useParams<{ id: string }>();
  const offerId = id ? parseInt(id) : 0;
  const [, setLocation] = useLocation();

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isSalesman = role === "salesman";
  const isDealer = role === "dealer";
  const isCreate = mode === "create";
  const isEdit = mode === "edit";
  const isDealerEdit = isDealer && isEdit;

  const fromEnquiryId = useMemo(() => {
    if (!isSalesman || !isCreate) return null;
    const params = new URLSearchParams(window.location.search);
    const v = params.get("fromEnquiry");
    return v ? parseInt(v) : null;
  }, []);

  const sourceOfferId = isDealer && isCreate ? offerId : 0;

  const createOffer = useCreateOffer();
  const updateOffer = useUpdateOffer();

  const apiPrefix = isDealer ? "/api/dealer" : "/api";

  const { data: offer, isLoading: offerLoading } = useQuery<any>({
    queryKey: isDealer ? ["/api/dealer/offers", offerId] : ["/api/offers", offerId],
    queryFn: () => fetch(`${apiPrefix}/offers/${offerId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!offerId && (isEdit || (isDealer && isCreate)),
  });

  const salesmanCustomers = useCustomers();
  const dealerCustomersQuery = useQuery<any[]>({
    queryKey: ["/api/dealer/customers"],
    queryFn: () => fetch("/api/dealer/customers", { credentials: "include" }).then(r => r.json()),
    enabled: isDealer,
  });
  const { data: customers } = isDealer ? dealerCustomersQuery : salesmanCustomers;

  const { data: machines } = useMachines();

  const salesmanPresets = usePresets();
  const dealerPresetsQuery = useQuery<any[]>({
    queryKey: ["/api/dealer/presets"],
    queryFn: () => fetch("/api/dealer/presets", { credentials: "include" }).then(r => r.json()),
    enabled: isDealer,
  });
  const { data: presets } = isDealer ? dealerPresetsQuery : salesmanPresets;

  const [customerId, setCustomerId] = useState<string>("");

  const { data: companyContacts = [] } = useQuery<any[]>({
    queryKey: isDealer ? ["/api/dealer/contacts", { companyId: customerId }] : ["/api/contacts", { customerId }],
    queryFn: () => {
      const url = isDealer
        ? `/api/dealer/contacts?companyId=${customerId}`
        : `/api/contacts?customerId=${customerId}`;
      return fetch(url, { credentials: "include" }).then(r => r.json());
    },
    enabled: !!customerId,
  });

  const formatUrl = isDealer ? "/api/dealer/settings/document-format" : "/api/settings/document-format";
  const { data: formatSettings } = useQuery<{ sections: any[]; pageBackground: string }>({
    queryKey: [formatUrl],
  });

  const { data: familyDefaults } = useQuery<FamilyDefaults>({
    queryKey: ["/api/settings/family-defaults"],
    queryFn: () => fetch("/api/settings/family-defaults", { credentials: "include" }).then(r => r.json()),
    enabled: isSalesman && isCreate,
  });

  const { data: sourceEnquiry } = useQuery<any>({
    queryKey: ["/api/enquiries", fromEnquiryId],
    queryFn: () => fetch(`/api/enquiries/${fromEnquiryId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!fromEnquiryId,
  });

  const { data: dealerCompaniesList = [] } = useQuery<any[]>({
    queryKey: ["/api/dealers"],
    enabled: isSalesman,
  });

  const { data: availableDrawings = [] } = useQuery<Drawing[]>({
    queryKey: ["/api/drawings", { customerId }],
    queryFn: () => fetch(`/api/drawings?customerId=${customerId}`, { credentials: "include" }).then(r => r.json()),
    enabled: isSalesman && !!customerId,
  });

  const { data: existingOfferRequests = [] } = useQuery<{ id: number; status: string; notes: string }[]>({
    queryKey: ["/api/drawing-requests", { offerId }],
    queryFn: () => fetch(`/api/drawing-requests`, { credentials: "include" }).then(r => r.json()).then((rows: { id: number; offerId: number; status: string; notes: string }[]) => rows.filter(r => r.offerId === offerId)),
    enabled: isSalesman && isEdit && !!offerId,
  });

  const dealerEditSteps: WizardStep[] = useMemo(() => [
    { id: "customer", label: "Customer Details", intro: "", sectionLabels: {}, readOnly: true },
    { id: "details", label: "Date & Parties", intro: "", sectionLabels: {}, readOnly: true },
    { id: "subject", label: "Project Data", intro: "", sectionLabels: {}, readOnly: true },
    { id: "specs", label: "Technical Specifications", intro: "", sectionLabels: {}, readOnly: true },
    { id: "pricing", label: "Price Overview", intro: "", sectionLabels: {}, readOnly: false },
    { id: "review", label: "Review Sections", intro: "", sectionLabels: {}, readOnly: false },
  ], []);

  const wizardSteps = useMemo(() => {
    if (isDealerEdit) return dealerEditSteps;
    return buildWizardSteps(formatSettings?.sections);
  }, [formatSettings, isDealerEdit]);

  const [step, setStep] = useState(1);
  const currentStepDef = wizardSteps[step - 1] ?? wizardSteps[0];

  const [subject, setSubject] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showAllOptions, setShowAllOptions] = useState<Set<string>>(new Set());
  const [technicalSpecs, setTechnicalSpecs] = useState<TechnicalSpecs>(defaultTechnicalSpecs);
  const formatDefaultsApplied = useRef(false);
  const [projectData, setProjectData] = useState<any>({ selectedPresets: [] });
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [sectionOrder, setSectionOrder] = useState<string[]>([]);
  const [pageBreaks, setPageBreaks] = useState<string[]>(["price_overview", "terms_conditions"]);
  const [machineOrder, setMachineOrder] = useState<string[]>([]);
  const [machinePageBreaks, setMachinePageBreaks] = useState<string[]>([]);
  const [termsPageBreaks, setTermsPageBreaks] = useState<number[]>([]);
  const [deliveryMode, setDeliveryMode] = useState<"days" | "date">("days");
  const [deliveryDays, setDeliveryDays] = useState("90");
  const [deliveryDescription, setDeliveryDescription] = useState("dalla conferma dell'ordine");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentMode, setPaymentMode] = useState<"percentage" | "amount">("percentage");
  const [paymentSchedule, setPaymentSchedule] = useState<{ description: string; percentage: number; amount: number }[]>([
    { description: "Acconto alla conferma dell'ordine", percentage: 30, amount: 0 },
    { description: "All'avviso di merce pronta, prima della consegna", percentage: 60, amount: 0 },
    { description: "Al termine del montaggio meccanico", percentage: 5, amount: 0 },
    { description: "Al collaudo, non oltre 60 giorni dalla data di consegna", percentage: 5, amount: 0 },
  ]);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [serviceItems, setServiceItems] = useState<ServiceItems>(defaultServiceItems);
  const [activeMachineId, setActiveMachineId] = useState<string>("");
  const [activeQuantity, setActiveQuantity] = useState(1);
  const [activeOptions, setActiveOptions] = useState<number[]>([]);
  const [activeOptionQuantities, setActiveOptionQuantities] = useState<Record<number, number>>({});
  const [interlockingPricePerPosition, setInterlockingPricePerPosition] = useState(500);
  const [installationConfig, setInstallationConfig] = useState<InstallationConfig>(defaultInstallationConfig);
  const [showDetailedPrices, setShowDetailedPrices] = useState(true);
  const [showNetOnly, setShowNetOnly] = useState(false);
  const [priceComments, setPriceComments] = useState<PriceComments>(defaultPriceComments);
  const [priceLabels, setPriceLabels] = useState<PriceLabels>({ ...DEFAULT_PRICE_LABELS });
  const [initialized, setInitialized] = useState(isCreate && isSalesman && !fromEnquiryId);
  const [headerDate, setHeaderDate] = useState(() => isCreate ? new Date().toISOString().slice(0, 10) : "");
  const [headerSalesmanName, setHeaderSalesmanName] = useState("");
  const [headerSalesmanEmail, setHeaderSalesmanEmail] = useState("");
  const [headerSalesmanMobile, setHeaderSalesmanMobile] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [offerScenario, setOfferScenario] = useState<"direct" | "with_dealer" | "to_dealer">("direct");
  const [dealerCompanyId, setDealerCompanyId] = useState<string>("");
  const selectedDealerCompany = dealerCompanyId
    ? (dealerCompaniesList as any[]).find((d) => String(d.id) === dealerCompanyId) ?? null
    : null;
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
  const { data: selectedDrawingData } = useQuery<Drawing>({
    queryKey: ["/api/drawings", selectedDrawingId],
    queryFn: () => fetch(`/api/drawings/${selectedDrawingId}`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
    enabled: !!selectedDrawingId && selectedDrawingId !== "none",
  });
  const [showDrawingRequestDialog, setShowDrawingRequestDialog] = useState(false);
  const [drawingRequestNotes, setDrawingRequestNotes] = useState("");
  const [drawingRequestFile, setDrawingRequestFile] = useState<File | null>(null);
  const [drawingRequestPending, setDrawingRequestPending] = useState(false);
  const [drawingRequestConfirmed, setDrawingRequestConfirmed] = useState(false);
  const [createdDrawingRequestId, setCreatedDrawingRequestId] = useState<number | null>(null);
  const drawingRequestFileRef = useRef<HTMLInputElement>(null);
  const enquiryPrefillApplied = useRef(false);
  const familyPrefillApplied = useRef(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const pdfDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPdfBlobUrl = useRef<string | null>(null);
  const [sectionTextOverrides, setSectionTextOverrides] = useState<Record<string, { intro?: string }>>({});
  const [machineDescOverrides, setMachineDescOverrides] = useState<Record<number, string>>({});
  const [lineSpeedOverrides, setLineSpeedOverrides] = useState<Record<number, string>>({});
  const [crmInfo, setCrmInfo] = useState<CrmStepFormState>(EMPTY_CRM_FORM);
  const [pendingReminders, setPendingReminders] = useState<PendingReminder[]>([]);
  const [originalPresets, setOriginalPresets] = useState<Array<{ id: number; title: string; content: string }> | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contentLanguage, setContentLanguage] = useState("it");

  const [dealerBasePrices, setDealerBasePrices] = useState<Record<number, number>>({});
  const [dealerOptionPrices, setDealerOptionPrices] = useState<Record<number, number>>({});
  const [dealerOptionPriceHidden, setDealerOptionPriceHidden] = useState<Record<number, boolean>>({});
  const [dealerItemComments, setDealerItemComments] = useState<Record<number, string>>({});
  const [dealerOptionComments, setDealerOptionComments] = useState<Record<number, string>>({});
  const [machinePageBreakItemIds, setMachinePageBreakItemIds] = useState<number[]>([]);

  useEffect(() => {
    const installTotal = installationConfig.dailyFee * installationConfig.totalDays;
    const rentalTotal = (serviceItems.travelCostsDailyFee || 0) * (serviceItems.travelCostsDays || 0);
    const flightTotal = serviceItems.travelFlightTicket || 0;
    const newTotal = installTotal + rentalTotal + flightTotal;
    if (installationConfig.totalPrice !== newTotal) {
      setInstallationConfig(prev => ({ ...prev, totalPrice: newTotal }));
    }
  }, [installationConfig.dailyFee, installationConfig.totalDays, serviceItems.travelCostsDailyFee, serviceItems.travelCostsDays, serviceItems.travelFlightTicket]);

  const recommendMachines = useRecommendMachines();
  const submitFeedback = useSubmitFeedback();
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [addedFromAi, setAddedFromAi] = useState<Set<number>>(new Set());
  const [isLargeScreen, setIsLargeScreen] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true
  );

  const draftOfferText = useDraftOfferText();
  const reviewRisks = useReviewRisks();
  const configSafetyGuard = useConfigSafetyGuard();
  const [aiPanelMode, setAiPanelMode] = useState<"draft" | "risk" | "safety" | "brain" | "recommend">("recommend");
  const [draftEditedTexts, setDraftEditedTexts] = useState<Record<string, string>>({});
  const [draftInsertedKeys, setDraftInsertedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [showDraftsList, setShowDraftsList] = useState(false);
  const [draftNameInput, setDraftNameInput] = useState("");
  const [showSaveNameInput, setShowSaveNameInput] = useState(false);
  const [draftsListVersion, setDraftsListVersion] = useState(0);
  const draftRestoredRef = useRef(false);

  const draftEnabled = isSalesman && !fromEnquiryId && (isCreate || isEdit);

  const draftState = useMemo(() => ({
    step,
    customerId,
    offerScenario,
    dealerCompanyId,
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
    deliveryMode,
    deliveryDays,
    deliveryDescription,
    deliveryDate,
    paymentMode,
    paymentSchedule,
    extraItems,
    discountPercent,
    serviceItems,
    interlockingPricePerPosition,
    installationConfig,
    showDetailedPrices,
    showNetOnly,
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
    selectedDrawingId,
    family,
    sectionTextOverrides,
    machineDescOverrides,
    lineSpeedOverrides,
    crmInfo,
    pendingReminders,
  }), [
    step, customerId, offerScenario, dealerCompanyId, subject, cart, technicalSpecs, projectData,
    hiddenSections, sectionOrder, pageBreaks, machineOrder, machinePageBreaks,
    termsPageBreaks, deliveryMode, deliveryDays, deliveryDescription,
    deliveryDate, paymentMode, paymentSchedule, extraItems, discountPercent,
    serviceItems, interlockingPricePerPosition, installationConfig,
    showDetailedPrices, showNetOnly, priceComments, priceLabels, headerDate,
    headerSalesmanName, headerSalesmanEmail, headerSalesmanMobile,
    headerCustomerName, headerCustomerContact, headerCustomerEmail,
    headerCustomerAddress, selectedContactId, layout, layoutDrawing,
    layoutDwg, includeLayoutInPdf, selectedDrawingId,
    family, sectionTextOverrides, machineDescOverrides, lineSpeedOverrides,
    crmInfo, pendingReminders,
  ]);

  const draftKey = isCreate
    ? `talent-create-offer-draft:${user?.id ?? "anon"}`
    : `talent-edit-offer-draft:${user?.id ?? "anon"}:${offerId}`;
  const wizardDraft = useWizardDraft({
    key: draftKey,
    state: draftState,
    enabled: draftEnabled,
  });

  const draftCheckedRef = useRef(false);
  useEffect(() => {
    if (draftCheckedRef.current) return;
    if (!draftEnabled) return;
    if (!initialized) return;
    draftCheckedRef.current = true;
    wizardDraft.markReady();
  }, [draftEnabled, initialized, wizardDraft]);

  const prevStepRef = useRef(step);
  useEffect(() => {
    if (prevStepRef.current !== step && draftEnabled && initialized) {
      prevStepRef.current = step;
      wizardDraft.upsertDraft("Autosalvataggio");
      setDraftsListVersion(v => v + 1);
    }
  }, [step, draftEnabled, initialized, wizardDraft]);

  const restoreDraft = useCallback(() => {
    const saved = wizardDraft.restore();
    if (!saved) return;
    setStep(saved.step ?? 1);
    setCustomerId(saved.customerId ?? "");
    setOfferScenario(saved.offerScenario ?? "direct");
    setDealerCompanyId(saved.dealerCompanyId ?? "");
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
    setDeliveryMode(saved.deliveryMode ?? "days");
    setDeliveryDays(saved.deliveryDays ?? "90");
    setDeliveryDescription(saved.deliveryDescription ?? "dalla conferma dell'ordine");
    setDeliveryDate(saved.deliveryDate ?? "");
    setPaymentMode(saved.paymentMode ?? "percentage");
    setPaymentSchedule(saved.paymentSchedule ?? [
      { description: "Acconto alla conferma dell'ordine", percentage: 30, amount: 0 },
      { description: "All'avviso di merce pronta, prima della consegna", percentage: 60, amount: 0 },
      { description: "Al termine del montaggio meccanico", percentage: 5, amount: 0 },
      { description: "Al collaudo, non oltre 60 giorni dalla data di consegna", percentage: 5, amount: 0 },
    ]);
    setExtraItems(saved.extraItems ?? []);
    setDiscountPercent(saved.discountPercent ?? 0);
    setServiceItems(saved.serviceItems ?? defaultServiceItems);
    setInterlockingPricePerPosition(saved.interlockingPricePerPosition ?? 500);
    setInstallationConfig(saved.installationConfig ?? defaultInstallationConfig);
    setShowDetailedPrices(saved.showDetailedPrices ?? true);
    setShowNetOnly(saved.showNetOnly ?? false);
    setPriceComments(saved.priceComments ?? defaultPriceComments);
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
    setSelectedDrawingId(saved.selectedDrawingId ?? "");
    setFamily(saved.family ?? "");
    setSectionTextOverrides(saved.sectionTextOverrides ?? {});
    setMachineDescOverrides(saved.machineDescOverrides ?? {});
    setLineSpeedOverrides(saved.lineSpeedOverrides ?? {});
    setCrmInfo(saved.crmInfo ?? EMPTY_CRM_FORM);
    setPendingReminders(saved.pendingReminders ?? []);
    draftRestoredRef.current = true;
    formatDefaultsApplied.current = true;
  }, [wizardDraft]);

  const handleSaveNamedDraft = useCallback(() => {
    const name = draftNameInput.trim() || `Bozza ${new Date().toLocaleDateString("it-IT")} ${new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    wizardDraft.saveNamedDraft(name);
    setDraftNameInput("");
    setShowSaveNameInput(false);
    setDraftsListVersion(v => v + 1);
  }, [wizardDraft, draftNameInput]);

  const handleLoadNamedDraft = useCallback((draftId: string) => {
    const saved = wizardDraft.loadDraft(draftId);
    if (!saved) return;
    const s = saved as any;
    setStep(s.step ?? 1);
    setCustomerId(s.customerId ?? "");
    setOfferScenario(s.offerScenario ?? "direct");
    setDealerCompanyId(s.dealerCompanyId ?? "");
    setSubject(s.subject ?? "");
    setCart(s.cart ?? []);
    setTechnicalSpecs(s.technicalSpecs ?? defaultTechnicalSpecs);
    setProjectData(s.projectData ?? { selectedPresets: [] });
    setHiddenSections(s.hiddenSections ?? []);
    setSectionOrder(s.sectionOrder ?? []);
    setPageBreaks(s.pageBreaks ?? ["price_overview", "terms_conditions"]);
    setMachineOrder(s.machineOrder ?? []);
    setMachinePageBreaks(s.machinePageBreaks ?? []);
    setTermsPageBreaks(s.termsPageBreaks ?? []);
    setDeliveryMode(s.deliveryMode ?? "days");
    setDeliveryDays(s.deliveryDays ?? "90");
    setDeliveryDescription(s.deliveryDescription ?? "dalla conferma dell'ordine");
    setDeliveryDate(s.deliveryDate ?? "");
    setPaymentMode(s.paymentMode ?? "percentage");
    setPaymentSchedule(s.paymentSchedule ?? [
      { description: "Acconto alla conferma dell'ordine", percentage: 30, amount: 0 },
      { description: "All'avviso di merce pronta, prima della consegna", percentage: 60, amount: 0 },
      { description: "Al termine del montaggio meccanico", percentage: 5, amount: 0 },
      { description: "Al collaudo, non oltre 60 giorni dalla data di consegna", percentage: 5, amount: 0 },
    ]);
    setExtraItems(s.extraItems ?? []);
    setDiscountPercent(s.discountPercent ?? 0);
    setServiceItems(s.serviceItems ?? defaultServiceItems);
    setInterlockingPricePerPosition(s.interlockingPricePerPosition ?? 500);
    setInstallationConfig(s.installationConfig ?? defaultInstallationConfig);
    setShowDetailedPrices(s.showDetailedPrices ?? true);
    setShowNetOnly(s.showNetOnly ?? false);
    setPriceComments(s.priceComments ?? defaultPriceComments);
    setPriceLabels(s.priceLabels ?? { ...DEFAULT_PRICE_LABELS });
    setHeaderDate(s.headerDate ?? new Date().toISOString().slice(0, 10));
    setHeaderSalesmanName(s.headerSalesmanName ?? "");
    setHeaderSalesmanEmail(s.headerSalesmanEmail ?? "");
    setHeaderSalesmanMobile(s.headerSalesmanMobile ?? "");
    setHeaderCustomerName(s.headerCustomerName ?? "");
    setHeaderCustomerContact(s.headerCustomerContact ?? "");
    setHeaderCustomerEmail(s.headerCustomerEmail ?? "");
    setHeaderCustomerAddress(s.headerCustomerAddress ?? "");
    setSelectedContactId(s.selectedContactId ?? "");
    setLayout(s.layout ?? "");
    setLayoutDrawing(s.layoutDrawing ?? null);
    setLayoutDwg(s.layoutDwg ?? null);
    setIncludeLayoutInPdf(s.includeLayoutInPdf ?? false);
    setSelectedDrawingId(s.selectedDrawingId ?? "");
    setFamily(s.family ?? "");
    setSectionTextOverrides(s.sectionTextOverrides ?? {});
    setMachineDescOverrides(s.machineDescOverrides ?? {});
    setLineSpeedOverrides(s.lineSpeedOverrides ?? {});
    setCrmInfo(s.crmInfo ?? EMPTY_CRM_FORM);
    setPendingReminders(s.pendingReminders ?? []);
    draftRestoredRef.current = true;
    formatDefaultsApplied.current = true;
    setShowDraftsList(false);
  }, [wizardDraft]);

  const handleDeleteNamedDraft = useCallback((draftId: string) => {
    wizardDraft.deleteDraft(draftId);
    setDraftsListVersion(v => v + 1);
  }, [wizardDraft]);

  useEffect(() => {
    if (!draftEnabled) return;
    const hasData = !!customerId || !!subject || cart.length > 0;
    if (!hasData) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [customerId, subject, cart.length, draftEnabled]);

  const calcMachinesTotal = () => calculateMachinesTotal(cart);
  const calcInterlocking = () => calculateInterlocking(cart.length, interlockingPricePerPosition);
  const calcExtrasTotal = () => calculateExtrasTotal(extraItems);
  const calcServicesTotal = () => calculateServicesTotal(installationConfig, serviceItems);
  const calcTotalListPrice = () => calculateTotalListPrice(cart, interlockingPricePerPosition, extraItems);
  const calcGrossTotal = () => calculateGrossTotal(cart, interlockingPricePerPosition, extraItems, installationConfig, serviceItems);
  const calcDiscount = () => calculateDiscount(cart, interlockingPricePerPosition, extraItems, discountPercent);
  const calcNetTotal = () => calculateNetTotal(cart, interlockingPricePerPosition, extraItems, installationConfig, serviceItems, discountPercent);
  const calcTotal = () => calculateFinalTotal(cart, interlockingPricePerPosition, extraItems, installationConfig, serviceItems, discountPercent);

  const dealerCalcMachinesTotal = () => {
    if (!offer?.items) return 0;
    return offer.items.reduce((acc: number, item: any) => {
      const base = dealerBasePrices[item.id] ?? parseFloat(item.snapshotBasePrice) ?? 0;
      // Include hidden options in Machines Total: they are folded into the displayed
      // machine unit price ("Incl." = compreso nel prezzo macchina) so machine row +
      // visible options must reconcile to the subtotal.
      const optTotal = (item.options ?? []).reduce((oa: number, opt: any) => {
        return oa + (dealerOptionPrices[opt.id] ?? parseFloat(opt.snapshotPriceModifier) ?? 0) * (opt.quantity || 1);
      }, 0);
      return acc + (base + optTotal) * item.quantity;
    }, 0);
  };
  const dealerCalcInterlocking = () => (offer?.items?.length ?? 0) * interlockingPricePerPosition;
  const dealerCalcTotalListPrice = () => dealerCalcMachinesTotal() + dealerCalcInterlocking() + calcExtrasTotal();
  const dealerCalcGrossTotal = () => dealerCalcTotalListPrice() + calcServicesTotal();
  const dealerCalcDiscount = () => (dealerCalcTotalListPrice() * discountPercent) / 100;
  const dealerCalcNetTotal = () => dealerCalcGrossTotal() - dealerCalcDiscount();
  const dealerCalcFinalTotal = () => discountPercent > 0 ? dealerCalcNetTotal() : dealerCalcGrossTotal();

  const prefillApplied = useRef(false);
  const prefillContactName = useRef("");
  const prefillContactId = useRef("");
  const contactAutoMatched = useRef(false);

  useEffect(() => {
    if (isSalesman && isCreate && !fromEnquiryId) {
      if (formatDefaultsApplied.current || draftRestoredRef.current || !formatSettings) return;
      const techSec = formatSettings.sections?.find((s: any) => s.id === "technical_specs");
      if (!techSec?.labels) return;
      formatDefaultsApplied.current = true;
      const enabledIds = (formatSettings.sections ?? []).filter((s: any) => s.enabled).map((s: any) => s.id);
      setSectionOrder(enabledIds);
      const lv = (key: string) => (techSec.labels as any)[key] ?? "";
      setTechnicalSpecs({
        minMaxLength: lv("minMaxLengthVal"),
        maxWidth: lv("maxWidthVal"),
        minMaxThickness: lv("minMaxThicknessVal"),
        averageLineSpeed: lv("averageLineSpeedVal"),
        controlSide: lv("controlSideVal"),
        maxBow: lv("maxBowVal"),
        paint: lv("paintVal"),
        substrate: lv("substrateVal"),
        finishing: lv("finishingVal"),
        standardVoltage: lv("standardVoltageVal"),
        standardColors: lv("standardColorsVal"),
        components: lv("componentsVal"),
        precautions: lv("precautionsVal"),
        airIntake: lv("airIntakeVal"),
        commissioning: lv("commissioningVal"),
      });
    }
  }, [formatSettings]);

  useEffect(() => {
    if (isSalesman && isCreate && fromEnquiryId) {
      if (enquiryPrefillApplied.current || !sourceEnquiry || !machines || !customers) return;
      enquiryPrefillApplied.current = true;

      const pd = sourceEnquiry.projectData ?? {};
      const salesModel = pd.commercial?.salesModel;
      const isDealerBuysResells = salesModel === "dealer_buys_resells";
      const dealerCompany = sourceEnquiry.dealer?.dealerCompany;

      if (isDealerBuysResells && dealerCompany) {
        setOfferScenario("to_dealer");
        setDealerCompanyId(dealerCompany.id ? String(dealerCompany.id) : "");
        setCustomerId(sourceEnquiry.customerId?.toString() ?? "");
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
        // Dealer present but salesModel != dealer_buys_resells →
        // "Customer + dealer (channel partner)" scenario.
        if (dealerCompany) {
          setOfferScenario("with_dealer");
          setDealerCompanyId(dealerCompany.id ? String(dealerCompany.id) : "");
        } else {
          setOfferScenario("direct");
          setDealerCompanyId("");
        }
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
      if (pd.pricing?.installationConfig) {
        const ic = pd.pricing.installationConfig;
        setInstallationConfig((prev) => {
          const merged = { ...prev, ...ic };
          if (merged.totalDays > 0 && merged.travelDays === 0 && merged.mechanicalDays === 0 && merged.electricalDays === 0 && merged.testingDays === 0 && merged.installTrainingDays === 0) {
            merged.mechanicalDays = merged.totalDays;
          }
          const td = merged.travelDays + merged.mechanicalDays + merged.electricalDays + merged.testingDays + merged.installTrainingDays;
          merged.totalDays = td;
          merged.totalPrice = merged.dailyFee * td;
          return merged;
        });
      }
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
        const machine = (machines as any[]).find(m => m.id === item.machineId);
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
          discountOverridePercent: null,
          isNet: false,
          optionDiscounts: {},
        };
      });
      setCart(newCart);
      setInitialized(true);
    }
  }, [sourceEnquiry, machines, customers, user]);

  useEffect(() => {
    if (isSalesman && isEdit) {
      if (!offer || !machines || initialized) return;
      const existingProjectDataRaw = offer.projectData as any || {};
      const existingCommercial = existingProjectDataRaw.commercial ?? {};
      const offScenario = (offer.salesScenario as ("direct" | "with_dealer" | "to_dealer") | null)
        ?? (existingCommercial.dealerCompanyId ? (existingCommercial.endCustomerId ? "to_dealer" : "with_dealer") : "direct");
      setOfferScenario(offScenario);
      setDealerCompanyId(existingCommercial.dealerCompanyId ? String(existingCommercial.dealerCompanyId) : "");
      // For "to_dealer" the customer step picker represents the end customer,
      // which lives in projectData.commercial.endCustomerId. Fall back to
      // offer.customerId for legacy data.
      const customerStepId = offScenario === "to_dealer" && existingCommercial.endCustomerId
        ? Number(existingCommercial.endCustomerId)
        : offer.customerId;
      setCustomerId(String(customerStepId));
      setSubject(offer.subject);
      const existingProjectData = offer.projectData as any || { selectedPresets: [] };
      setProjectData({ ...existingProjectData, selectedPresets: existingProjectData.selectedPresets || [] });
      if (existingProjectData.hiddenSections) setHiddenSections(existingProjectData.hiddenSections);
      setSectionOrder(existingProjectData.sectionOrder ?? []);
      setPageBreaks(existingProjectData.pageBreaks ?? ["price_overview", "terms_conditions"]);

      const savedComments: Array<{machineComment: string; optionComments: Record<number, string>}> =
        (existingProjectData.pricing?.itemComments) || [];

      const cartItems: CartItem[] = offer.items.map((item: any, idx: number) => {
        const isCustom = item.machineId === 0 || (item.snapshotMacroType === "custom");
        const optionPrices: Record<number, number> = {};
        const optionQuantities: Record<number, number> = {};
        const snapshotOptionNames: Record<number, string> = {};
        if (isCustom) {
          const customOptIds: number[] = [];
          for (const opt of item.options) {
            const fakeId = -(Date.now() + idx * 1000 + customOptIds.length);
            customOptIds.push(fakeId);
            optionPrices[fakeId] = parseFloat(opt.snapshotPriceModifier as unknown as string ?? "0");
            optionQuantities[fakeId] = (opt as any).quantity ?? 1;
            snapshotOptionNames[fakeId] = opt.snapshotOptionName ?? "";
          }
          const saved = savedComments[idx] || {};
          return {
            tempId: Math.random().toString(36),
            machineId: 0,
            quantity: item.quantity,
            selectedOptionIds: customOptIds,
            optionQuantities,
            basePrice: parseFloat(item.snapshotBasePrice as unknown as string),
            optionPrices,
            comment: (saved as any).machineComment || "",
            optionComments: (saved as any).optionComments || {},
            optionPriceHidden: (saved as any).optionPriceHidden || {},
            discountOverridePercent: existingProjectData.pricing?.itemDiscounts?.[idx]?.discountOverridePercent ?? null,
            isNet: existingProjectData.pricing?.itemDiscounts?.[idx]?.isNet ?? false,
            optionDiscounts: existingProjectData.pricing?.itemDiscounts?.[idx]?.optionDiscounts ?? {},
            isCustom: true,
            snapshotMachineName: item.snapshotMachineName,
            snapshotMachineDescription: item.snapshotMachineDescription,
            snapshotOptionNames,
            customOptions: Object.entries(snapshotOptionNames).map(([id, name]) => ({ name, price: optionPrices[Number(id)] ?? 0 })),
            customMainImage: (item as any).snapshotImageUrl || undefined,
          };
        }
        const optionIds = item.options.map((o: any) => o.machineOptionId);
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
          comment: (saved as any).machineComment || "",
          optionComments: (saved as any).optionComments || {},
          optionPriceHidden: (saved as any).optionPriceHidden || {},
          discountOverridePercent: existingProjectData.pricing?.itemDiscounts?.[idx]?.discountOverridePercent ?? null,
          isNet: existingProjectData.pricing?.itemDiscounts?.[idx]?.isNet ?? false,
          optionDiscounts: existingProjectData.pricing?.itemDiscounts?.[idx]?.optionDiscounts ?? {},
        };
      });
      setCart(cartItems);
      const savedBreakPositions: number[] = existingProjectData.machineBreakPositions ?? [];
      if (savedBreakPositions.length > 0) {
        setMachinePageBreaks(savedBreakPositions.map((pos: number) => cartItems[pos]?.tempId ?? "").filter(Boolean));
      }
      const savedTermsBreaks: number[] = existingProjectData.termsBreakPositions ?? [];
      if (savedTermsBreaks.length > 0) setTermsPageBreaks(savedTermsBreaks);
      if (existingProjectData.technicalSpecs) setTechnicalSpecs({ ...defaultTechnicalSpecs, ...existingProjectData.technicalSpecs });
      if (existingProjectData.pricing) {
        setExtraItems(existingProjectData.pricing.extraItems || []);
        setDiscountPercent(existingProjectData.pricing.discountPercent || 0);
        setShowNetOnly(existingProjectData.pricing.showNetOnly ?? false);
        setServiceItems({ ...defaultServiceItems, ...(existingProjectData.pricing.serviceItems || {}) });
        if (existingProjectData.pricing.interlockingPricePerPosition != null) setInterlockingPricePerPosition(existingProjectData.pricing.interlockingPricePerPosition);
        if (existingProjectData.pricing.installationConfig != null) {
          const ic = existingProjectData.pricing.installationConfig;
          setInstallationConfig(prev => {
            const merged = { ...prev, ...ic };
            if (merged.totalDays > 0 && merged.travelDays === 0 && merged.mechanicalDays === 0 && merged.electricalDays === 0 && merged.testingDays === 0 && merged.installTrainingDays === 0) {
              merged.mechanicalDays = merged.totalDays;
            }
            return merged;
          });
        }
        if (existingProjectData.pricing.priceComments != null) setPriceComments(prev => ({ ...prev, ...existingProjectData.pricing.priceComments }));
        if (existingProjectData.pricing.priceLabels != null) setPriceLabels(prev => ({ ...DEFAULT_PRICE_LABELS, ...existingProjectData.pricing.priceLabels }));
      }
      const hi = existingProjectData.headerInfo ?? {};
      setHeaderDate(hi.date || new Date(offer.date).toISOString().slice(0, 10));
      setHeaderSalesmanName(hi.salesman?.name ?? offer.salesmanName ?? "");
      setHeaderSalesmanEmail(hi.salesman?.email ?? offer.salesmanEmail ?? "");
      setHeaderSalesmanMobile(hi.salesman?.mobile ?? offer.salesmanMobile ?? "");
      setHeaderCustomerName(hi.customer?.name ?? offer.customer?.name ?? "");
      setHeaderCustomerContact(hi.customer?.contactPerson ?? offer.customer?.contactPerson ?? "");
      setHeaderCustomerEmail(hi.customer?.email ?? offer.customer?.email ?? "");
      setHeaderCustomerAddress(hi.customer?.address ?? offer.customer?.address ?? "");
      setFamily(existingProjectData.family ?? "");
      setLayout(existingProjectData.layout ?? "");
      setLayoutDrawing(existingProjectData.layoutDrawing ?? null);
      setLayoutDwg(existingProjectData.layoutDwg ?? null);
      setIncludeLayoutInPdf(existingProjectData.includeLayoutInPdf ?? false);
      setSelectedDrawingId(existingProjectData.linkedDrawingId ? String(existingProjectData.linkedDrawingId) : "");
      setSectionTextOverrides(existingProjectData.sectionTextOverrides ?? {});
      setMachineDescOverrides(existingProjectData.machineDescOverrides ?? {});
      setLineSpeedOverrides(existingProjectData.lineSpeedOverrides ?? {});
      if (existingProjectData.originalPresets) setOriginalPresets(existingProjectData.originalPresets);
      if ((offer as any).language) setContentLanguage((offer as any).language);
      if (existingProjectData.deliveryMode) setDeliveryMode(existingProjectData.deliveryMode);
      if (existingProjectData.deliveryDays != null) setDeliveryDays(existingProjectData.deliveryDays);
      if (existingProjectData.deliveryDescription != null) setDeliveryDescription(existingProjectData.deliveryDescription);
      if (existingProjectData.deliveryDate != null) setDeliveryDate(existingProjectData.deliveryDate);
      if (existingProjectData.deliveryTerms != null && !existingProjectData.deliveryMode) {
        setDeliveryMode("days");
        const match = existingProjectData.deliveryTerms.match(/^(\d+)\s+(.+)$/);
        if (match) { setDeliveryDays(match[1]); setDeliveryDescription(match[2]); }
        else { setDeliveryDays(""); setDeliveryDescription(existingProjectData.deliveryTerms); }
      }
      if (existingProjectData.paymentMode) setPaymentMode(existingProjectData.paymentMode);
      if (existingProjectData.paymentSchedule) setPaymentSchedule(existingProjectData.paymentSchedule);
      setInitialized(true);
    }
  }, [offer, machines, initialized]);

  useEffect(() => {
    if (isDealer && isCreate) {
      if (prefillApplied.current || !offer) return;
      prefillApplied.current = true;
      const pd = offer.projectData ?? {};
      const pricing = pd.pricing ?? {};
      const headerInfo = pd.headerInfo ?? {};
      setSubject(offer.subject || "");
      setLayout(pd.layout || "");
      setFamily(pd.family || "");
      if (pd.technicalSpecs) setTechnicalSpecs({ ...defaultTechnicalSpecs, ...pd.technicalSpecs });
      if (pd.hiddenSections) setHiddenSections(pd.hiddenSections);
      if (pd.sectionOrder) setSectionOrder(pd.sectionOrder);
      if (pd.pageBreaks) setPageBreaks(pd.pageBreaks);
      if (pd.sectionTextOverrides) setSectionTextOverrides(pd.sectionTextOverrides);
      if (pd.machineDescOverrides) setMachineDescOverrides(pd.machineDescOverrides);
      if (pd.lineSpeedOverrides) setLineSpeedOverrides(pd.lineSpeedOverrides);
      if (pricing.extraItems) setExtraItems(pricing.extraItems);
      if (pricing.discountPercent != null) setDiscountPercent(pricing.discountPercent);
      if (pricing.showNetOnly != null) setShowNetOnly(pricing.showNetOnly);
      if (pricing.serviceItems) setServiceItems(s => ({ ...s, ...pricing.serviceItems }));
      if (pricing.installationConfig) {
        const ic = pricing.installationConfig;
        setInstallationConfig(prev => {
          const merged = { ...prev, ...ic };
          if (merged.totalDays > 0 && merged.travelDays === 0 && merged.mechanicalDays === 0 && merged.electricalDays === 0 && merged.testingDays === 0 && merged.installTrainingDays === 0) {
            merged.mechanicalDays = merged.totalDays;
          }
          const td = merged.travelDays + merged.mechanicalDays + merged.electricalDays + merged.testingDays + merged.installTrainingDays;
          merged.totalDays = td;
          merged.totalPrice = merged.dailyFee * td;
          return merged;
        });
      }
      if (pricing.interlockingPricePerPosition != null) setInterlockingPricePerPosition(pricing.interlockingPricePerPosition);
      if (pricing.priceComments) setPriceComments(pc => ({ ...pc, ...pricing.priceComments }));
      if (pricing.priceLabels) setPriceLabels(pl => ({ ...pl, ...pricing.priceLabels }));
      if (pd.deliveryMode) setDeliveryMode(pd.deliveryMode);
      if (pd.deliveryDays != null) setDeliveryDays(pd.deliveryDays);
      if (pd.deliveryDescription != null) setDeliveryDescription(pd.deliveryDescription);
      if (pd.deliveryDate != null) setDeliveryDate(pd.deliveryDate);
      if (pd.deliveryTerms != null && !pd.deliveryMode) {
        setDeliveryMode("days");
        const match = pd.deliveryTerms.match(/^(\d+)\s+(.+)$/);
        if (match) { setDeliveryDays(match[1]); setDeliveryDescription(match[2]); }
        else { setDeliveryDays(""); setDeliveryDescription(pd.deliveryTerms); }
      }
      if (pd.paymentMode) setPaymentMode(pd.paymentMode);
      if (pd.paymentSchedule) setPaymentSchedule(pd.paymentSchedule);

      if (offer.items?.length > 0) {
        const cartItems: CartItem[] = offer.items.map((item: any, idx: number) => {
          const isItemCustom = item.machineId === 0 || (item.snapshotMacroType === "custom");
          const optionPrices: Record<number, number> = {};
          const optionQuantities: Record<number, number> = {};
          const snapshotOptionNames: Record<number, string> = {};
          if (isItemCustom) {
            const customOptIds: number[] = [];
            (item.options ?? []).forEach((o: any, oi: number) => {
              const fakeId = -(Date.now() + idx * 1000 + oi);
              customOptIds.push(fakeId);
              optionPrices[fakeId] = parseFloat(o.snapshotPriceModifier ?? "0");
              optionQuantities[fakeId] = o.quantity ?? 1;
              snapshotOptionNames[fakeId] = o.snapshotOptionName ?? "";
            });
            return {
              tempId: Math.random().toString(36),
              machineId: 0,
              quantity: item.quantity,
              selectedOptionIds: customOptIds,
              optionQuantities,
              basePrice: parseFloat(item.snapshotBasePrice?.toString() ?? "0"),
              optionPrices,
              comment: pricing.itemComments?.[idx]?.machineComment ?? "",
              optionComments: pricing.itemComments?.[idx]?.optionComments ?? {},
              optionPriceHidden: pricing.itemComments?.[idx]?.optionPriceHidden ?? {},
              discountOverridePercent: pricing.itemDiscounts?.[idx]?.discountOverridePercent ?? null,
              isNet: pricing.itemDiscounts?.[idx]?.isNet ?? false,
              optionDiscounts: pricing.itemDiscounts?.[idx]?.optionDiscounts ?? {},
              isCustom: true,
              snapshotMachineName: item.snapshotMachineName,
              snapshotMachineDescription: item.snapshotMachineDescription,
              snapshotOptionNames,
              customOptions: Object.entries(snapshotOptionNames).map(([id, name]) => ({ name, price: optionPrices[Number(id)] ?? 0 })),
              customMainImage: (item as any).snapshotImageUrl || undefined,
            };
          }
          const optionIds: number[] = (item.options ?? []).map((o: any) => o.machineOptionId);
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
            discountOverridePercent: pricing.itemDiscounts?.[idx]?.discountOverridePercent ?? null,
            isNet: pricing.itemDiscounts?.[idx]?.isNet ?? false,
            optionDiscounts: pricing.itemDiscounts?.[idx]?.optionDiscounts ?? {},
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
      if (endCustId) setCustomerId(endCustId.toString());
      else if (offer.customerId) setCustomerId(offer.customerId.toString());

      const contactPersonName = headerInfo.customer?.contactPerson || offer.customer?.contactPerson || "";
      const customerEmail = headerInfo.customer?.email || offer.customer?.email || "";
      const customerAddress = headerInfo.customer?.address || offer.customer?.address || "";
      const customerName = headerInfo.customer?.name || offer.customer?.companyName || offer.customer?.name || "";
      if (customerName) setHeaderCustomerName(customerName);
      if (contactPersonName) setHeaderCustomerContact(contactPersonName);
      if (customerEmail) setHeaderCustomerEmail(customerEmail);
      if (customerAddress) setHeaderCustomerAddress(customerAddress);
      prefillContactName.current = contactPersonName;
      const storedContactId = commercial.endCustomerContactId || headerInfo.customer?.contactId || "";
      if (storedContactId) prefillContactId.current = storedContactId.toString();
      setInitialized(true);
    }
  }, [offer, user]);

  useEffect(() => {
    if (isDealerEdit) {
      if (!offer || initialized) return;
      const bp: Record<number, number> = {};
      const op: Record<number, number> = {};
      offer.items.forEach((item: any) => {
        bp[item.id] = parseFloat(item.snapshotBasePrice) || 0;
        item.options.forEach((opt: any) => {
          op[opt.id] = parseFloat(opt.snapshotPriceModifier) || 0;
        });
      });
      setDealerBasePrices(bp);
      setDealerOptionPrices(op);
      const pricing = offer.projectData?.pricing ?? {};
      if (pricing.discountPercent != null) setDiscountPercent(pricing.discountPercent);
      if (pricing.extraItems) setExtraItems(pricing.extraItems);
      if (pricing.interlockingPricePerPosition != null) setInterlockingPricePerPosition(pricing.interlockingPricePerPosition);
      if (pricing.installationConfig) {
        const ic = pricing.installationConfig;
        setInstallationConfig(prev => {
          const merged = { ...prev, ...ic };
          if (merged.totalDays > 0 && merged.travelDays === 0 && merged.mechanicalDays === 0 && merged.electricalDays === 0 && merged.testingDays === 0 && merged.installTrainingDays === 0) {
            merged.mechanicalDays = merged.totalDays;
          }
          const td = merged.travelDays + merged.mechanicalDays + merged.electricalDays + merged.testingDays + merged.installTrainingDays;
          merged.totalDays = td;
          merged.totalPrice = merged.dailyFee * td;
          return merged;
        });
      }
      if (pricing.serviceItems) setServiceItems(prev => ({ ...prev, ...pricing.serviceItems }));
      if (pricing.priceLabels) setPriceLabels(prev => ({ ...prev, ...pricing.priceLabels }));
      if (pricing.priceComments) setPriceComments(prev => ({ ...prev, ...pricing.priceComments }));
      if (pricing.optionPriceHidden) setDealerOptionPriceHidden(pricing.optionPriceHidden);
      if (pricing.itemComments) setDealerItemComments(pricing.itemComments);
      if (pricing.optionComments) setDealerOptionComments(pricing.optionComments);
      if (pricing.basePrices) setDealerBasePrices(prev => ({ ...prev, ...pricing.basePrices }));
      if (pricing.optionPrices) setDealerOptionPrices(prev => ({ ...prev, ...pricing.optionPrices }));
      if (pricing.showNetOnly != null) setShowNetOnly(Boolean(pricing.showNetOnly));
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

  const prevFamilyLangDefaultsRef = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    if (!isSalesman || !isCreate) return;
    if (!family || !familyDefaults) return;
    const familyEntry: any = (familyDefaults as any)[family];
    if (!familyEntry) return;
    // Support both nested {lang: vals} and legacy flat shape
    const isNested = ["it","en","de","fr","es","pt"].some(l => familyEntry[l] && typeof familyEntry[l] === "object");
    const defaults: Record<string, string> = isNested
      ? (familyEntry[contentLanguage] ?? familyEntry.it ?? {})
      : familyEntry;
    if (!defaults) return;
    const prevDefaults = prevFamilyLangDefaultsRef.current;
    const useExisting = enquiryPrefillApplied.current && !familyPrefillApplied.current;
    familyPrefillApplied.current = true;
    prevFamilyLangDefaultsRef.current = defaults;
    // Pick value: if user has typed something different from the previous defaults, keep it.
    // Otherwise, fill with the new defaults.
    const pick = (cur: string, key: string): string => {
      const newVal = defaults[key] || "";
      if (useExisting) return cur || newVal;
      const prevVal = prevDefaults?.[key] ?? "";
      const isDefault = !cur || cur === prevVal;
      return isDefault ? (newVal || cur) : cur;
    };
    setTechnicalSpecs(prev => ({
      ...prev,
      minMaxLength:     pick(prev.minMaxLength,     "minMaxLength"),
      maxWidth:         pick(prev.maxWidth,         "maxWidth"),
      minMaxThickness:  pick(prev.minMaxThickness,  "minMaxThickness"),
      averageLineSpeed: pick(prev.averageLineSpeed, "averageLineSpeed"),
      controlSide:      pick(prev.controlSide,      "controlSide"),
      maxBow:           pick(prev.maxBow,           "maxBow"),
      paint:            pick(prev.paint,            "paint"),
      substrate:        pick(prev.substrate,        "substrate"),
      finishing:        pick(prev.finishing,        "finishing"),
      standardVoltage:  pick(prev.standardVoltage,  "standardVoltage"),
      standardColors:   pick(prev.standardColors,   "standardColors"),
      components:       pick(prev.components,       "components"),
      precautions:      pick(prev.precautions,      "precautions"),
      commissioning:    pick(prev.commissioning,    "commissioning"),
    }));
  }, [family, familyDefaults, contentLanguage]);

  useEffect(() => {
    if (isSalesman && isCreate && user && !headerSalesmanName) {
      setHeaderSalesmanName(`${user.name || ""} ${user.surname || ""}`.trim() || "");
      setHeaderSalesmanEmail(user.email || "");
      setHeaderSalesmanMobile(user.mobileNumber || "");
    }
  }, [user]);

  const prevCustomerIdRef = useRef<string>("");
  useEffect(() => {
    if (!customerId || isDealerEdit) return;
    if (isDealer && isCreate && customers) {
      const c = (customers as any[]).find((c: any) => c.id.toString() === customerId);
      if (c) {
        setHeaderCustomerName(c.companyName || c.name || "");
        setHeaderCustomerAddress((c as any).address || "");
      }
    } else if (isSalesman && customers) {
      // For "to_dealer" scenario the header recipient must be the dealer,
      // not the end customer. Skip the auto-sync entirely in that case.
      if (offerScenario === "to_dealer") {
        prevCustomerIdRef.current = customerId;
        return;
      }
      const c = (customers as any[]).find((c: any) => c.id.toString() === customerId);
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
    }
  }, [customerId, customers]);

  useEffect(() => {
    if (!selectedContactId || companyContacts.length === 0 || isDealerEdit) return;
    // In "to_dealer", recipient header belongs to the dealer; the end-customer
    // contact (selected on the Customer step) is reference-only and must not
    // overwrite the dealer recipient contact/email.
    if (isSalesman && offerScenario === "to_dealer") return;
    const contact = companyContacts.find((c: any) => (c.id ?? "").toString() === selectedContactId);
    if (contact) {
      setHeaderCustomerContact(`${contact.firstName || ""} ${contact.lastName || ""}`.trim());
      setHeaderCustomerEmail(contact.email || "");
    }
  }, [selectedContactId, companyContacts, offerScenario, isSalesman]);

  useEffect(() => {
    if (isDealerEdit) return;
    if (isSalesman) {
      if (selectedContactId || companyContacts.length === 0) return;
      if (!headerCustomerContact && !headerCustomerEmail) return;
      const nameNorm = (headerCustomerContact || "").trim().toLowerCase();
      const emailNorm = (headerCustomerEmail || "").trim().toLowerCase();
      let match = companyContacts.find((c: any) => {
        const fullName = `${c.firstName || ""} ${c.lastName || ""}`.trim().toLowerCase();
        return fullName === nameNorm;
      });
      if (!match && emailNorm) {
        match = companyContacts.find((c: any) => (c.email || "").trim().toLowerCase() === emailNorm);
      }
      if (match) setSelectedContactId(match.id.toString());
    }
    if (isDealer && isCreate) {
      if (contactAutoMatched.current || !companyContacts.length) return;
      contactAutoMatched.current = true;
      if (prefillContactId.current) {
        const idMatch = companyContacts.find((ct: any) => ct.id.toString() === prefillContactId.current);
        if (idMatch) { setSelectedContactId(idMatch.id.toString()); return; }
      }
      const targetName = prefillContactName.current || headerCustomerContact;
      if (targetName) {
        const normalised = targetName.toLowerCase().trim();
        const match = companyContacts.find((ct: any) => {
          const full = `${ct.firstName || ""} ${ct.lastName || ""}`.trim().toLowerCase();
          const reversed = `${ct.lastName || ""} ${ct.firstName || ""}`.trim().toLowerCase();
          return full === normalised || reversed === normalised || full.includes(normalised) || normalised.includes(full);
        });
        if (match) { setSelectedContactId(match.id.toString()); return; }
      }
      if (companyContacts.length === 1) setSelectedContactId(companyContacts[0].id.toString());
    }
  }, [companyContacts, headerCustomerContact, headerCustomerEmail, selectedContactId]);

  useEffect(() => {
    if (isSalesman && isEdit) {
      if (!initialized || !formatSettings?.sections) return;
      const priceSection = formatSettings.sections.find((s: any) => s.id === "price_overview");
      if (priceSection?.labels) {
        const fl = priceSection.labels;
        setPriceLabels(prev => ({
          interlocking: fl.interlocking || prev.interlocking,
          totalListPrice: fl.totalListPrice || prev.totalListPrice,
          installation: fl.installation || prev.installation,
          travelCosts: fl.travelCosts || prev.travelCosts,
          boardLodging: fl.boardLodging || prev.boardLodging,
          training: fl.training || prev.training,
          packaging: fl.packaging || prev.packaging,
          transport: fl.transport || prev.transport,
          grossTotal: fl.grossTotal || prev.grossTotal,
          netTotal: fl.netTotal || prev.netTotal,
        }));
      }
      const tsSec = formatSettings.sections.find((s: any) => s.id === "technical_specs");
      if (tsSec?.labels) {
        const l = tsSec.labels;
        setTechnicalSpecs(prev => ({
          ...prev,
          paint: prev.paint || l.paintVal || "",
          substrate: prev.substrate || l.substrateVal || "",
          finishing: prev.finishing || l.finishingVal || "",
        }));
      }
      setSectionOrder(prev => {
        if (prev.length > 0) return prev;
        return (formatSettings.sections as any[]).filter(s => s.enabled).map(s => s.id);
      });
    }
  }, [formatSettings, initialized]);

  useEffect(() => {
    if (isSalesman && isCreate && !fromEnquiryId) {
      if (!formatSettings?.sections) return;
      const priceSection = formatSettings.sections.find((s: any) => s.id === "price_overview");
      if (!priceSection?.labels) return;
      const fl = priceSection.labels;
      setPriceLabels(prev => ({
        interlocking: fl.interlocking || prev.interlocking,
        totalListPrice: fl.totalListPrice || prev.totalListPrice,
        installation: fl.installation || prev.installation,
        travelCosts: fl.travelCosts || prev.travelCosts,
        boardLodging: fl.boardLodging || prev.boardLodging,
        training: fl.training || prev.training,
        packaging: fl.packaging || prev.packaging,
        transport: fl.transport || prev.transport,
        grossTotal: fl.grossTotal || prev.grossTotal,
        netTotal: fl.netTotal || prev.netTotal,
      }));
    }
  }, [formatSettings]);

  useEffect(() => {
    if (isSalesman && isCreate && !fromEnquiryId) {
      if (!formatSettings?.sections) return;
      const tsSec = formatSettings.sections.find((s: any) => s.id === "technical_specs");
      if (!tsSec?.labels) return;
      const l = tsSec.labels;
      setTechnicalSpecs(prev => ({
        ...prev,
        paint: prev.paint || l.paintVal || "",
        substrate: prev.substrate || l.substrateVal || "",
        finishing: prev.finishing || l.finishingVal || "",
      }));
    }
  }, [formatSettings]);

  const computeInstallationDaysFromCart = () => {
    if (!machines) return 0;
    return cart.reduce((sum, item) => {
      const machine = (machines as any[])?.find((m: any) => m.id === item.machineId);
      const days = parseFloat(machine?.installationDays as unknown as string ?? "0") || 0;
      return sum + days * item.quantity;
    }, 0);
  };

  useEffect(() => {
    if (isSalesman && currentStepDef?.id === "pricing" && installationConfig.mechanicalDays === 0) {
      const days = computeInstallationDaysFromCart();
      if (days > 0) {
        setInstallationConfig(prev => {
          const updated = { ...prev, mechanicalDays: days };
          const td = updated.travelDays + updated.mechanicalDays + updated.electricalDays + updated.testingDays + updated.installTrainingDays;
          return { ...updated, totalDays: td };
        });
      }
    }
  }, [step]);

  useEffect(() => {
    const currentId = wizardSteps[step - 1]?.id;
    if (currentId !== "review") return;
    if (pdfDebounceRef.current) clearTimeout(pdfDebounceRef.current);
    pdfDebounceRef.current = setTimeout(() => generatePreviewPdf(), 600);
    return () => { if (pdfDebounceRef.current) clearTimeout(pdfDebounceRef.current); };
  }, [step, sectionOrder, hiddenSections, pageBreaks, machinePageBreaks, termsPageBreaks, machinePageBreakItemIds]);

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
    try { await fetch(`/api/offers/layout-drawing/${layoutDrawing.filename}`, { method: "DELETE", credentials: "include" }); } catch {}
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
    try { await fetch(`/api/offers/layout-drawing/${layoutDwg.filename}`, { method: "DELETE", credentials: "include" }); } catch {}
    setLayoutDwg(null);
  };

  const handleAddMachine = () => {
    if (!activeMachineId || !machines) return;
    const machine = (machines as any[])?.find((m: any) => m.id === parseInt(activeMachineId));
    if (!machine) return;
    const optionPrices: Record<number, number> = {};
    for (const optId of activeOptions) {
      const opt = machine.options.find((o: any) => o.id === optId);
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
      discountOverridePercent: null,
      isNet: false,
      optionDiscounts: {},
    };
    setCart([...cart, newItem]);
    setActiveMachineId("");
    setActiveQuantity(1);
    setActiveOptions([]);
    setActiveOptionQuantities({});
  };

  const handleAddCustomMachine = (data: CustomMachineData) => {
    const customOptPrices: Record<number, number> = {};
    const customOptIds: number[] = [];
    const customOptNames: Record<number, string> = {};
    const customOptQuantities: Record<number, number> = {};
    data.customOptions.forEach((opt, i) => {
      const fakeId = -(Date.now() + i);
      customOptIds.push(fakeId);
      customOptPrices[fakeId] = opt.price;
      customOptNames[fakeId] = opt.name;
      customOptQuantities[fakeId] = opt.quantity ?? 1;
    });

    let finalDescription = data.description;
    if (data.detailImages && data.detailImages.length > 0) {
      data.detailImages.forEach((filename, i) => {
        const placeholder = `[[IMG${i + 1}]]`;
        finalDescription = finalDescription.replace(placeholder, `[[IMG:${filename}]]`);
      });
    }

    const newItem: CartItem = {
      tempId: Math.random().toString(36),
      machineId: 0,
      quantity: 1,
      selectedOptionIds: customOptIds,
      optionQuantities: customOptQuantities,
      basePrice: data.basePrice,
      optionPrices: customOptPrices,
      comment: "",
      optionComments: {},
      optionPriceHidden: {},
      discountOverridePercent: null,
      isNet: false,
      optionDiscounts: {},
      isCustom: true,
      snapshotMachineName: data.name,
      snapshotMachineDescription: finalDescription,
      snapshotOptionNames: customOptNames,
      customOptions: data.customOptions.filter(o => o.name.trim()),
      customMainImage: data.mainImage,
      customDetailImages: data.detailImages,
    };
    setCart([...cart, newItem]);

    if (!data.alreadySaved) {
      const lang = data.language || contentLanguage || "it";
      const titles: Record<string, string> = { [lang]: data.name };
      const descs: Record<string, string> = { [lang]: data.description };
      apiRequest("POST", "/api/custom-machines", {
        name: data.name,
        description: data.description,
        basePrice: data.basePrice,
        imageUrl: data.mainImage || null,
        detailImages: data.detailImages || null,
        titles,
        descriptions: descs,
        options: data.customOptions.filter(o => o.name.trim()).map(o => ({
          name: o.name,
          price: o.price,
          quantity: o.quantity ?? 1,
        })),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/custom-machines"] });
      }).catch(() => {});
    }
  };

  const handleRemoveItem = (tempId: string) => setCart(cart.filter(item => item.tempId !== tempId));

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(cart);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setCart(items);
  };

  const addExtraItem = () => setExtraItems([...extraItems, { id: Math.random().toString(36), description: "", price: 0, discountOverridePercent: null, isNet: false }]);
  const updateExtraItem = (id: string, field: "description" | "price", value: string | number) =>
    setExtraItems(extraItems.map(item => item.id === id ? { ...item, [field]: value } : item));
  const removeExtraItem = (id: string) => setExtraItems(extraItems.filter(item => item.id !== id));
  const updateExtraDiscount = (id: string, patch: { discountOverridePercent?: number | null; isNet?: boolean }) =>
    setExtraItems(extraItems.map(item => item.id === id ? { ...item, ...patch } : item));

  const getOrderedCart = () => machineOrder.length > 0
    ? machineOrder.map(tid => cart.find(c => c.tempId === tid)).filter(Boolean) as CartItem[]
    : cart;

  const buildProjectDataPayload = () => {
    const existingOrigDescs: Record<number, string> = (projectData?.originalMachineDescs ?? {}) as Record<number, string>;
    const origMachDescs: Record<number, string> = { ...existingOrigDescs };
    if (machines) {
      for (const ci of cart) {
        if (origMachDescs[ci.machineId] != null) continue;
        const m = (machines as any[]).find((m: any) => m.id === ci.machineId);
        if (m) origMachDescs[ci.machineId] = m.description ?? "";
      }
    }
    const origPresets = originalPresets ?? (projectData.selectedPresets ?? []).map((p: any) => ({ id: p.id, title: p.title, content: p.content }));

    const existingCommercial = (projectData as any).commercial ?? {};
    const dealerCompanyForPayload = dealerCompanyId
      ? (dealerCompaniesList.find((d: any) => String(d.id) === dealerCompanyId) ?? null)
      : null;
    const endCustomerForPayload = (offerScenario === "to_dealer" && customerId)
      ? (customers as any[] | undefined)?.find((c: any) => String(c.id) === String(customerId))
      : null;
    return {
      ...projectData,
      ...(isSalesman ? {
        commercial: {
          ...existingCommercial,
          dealerCompanyId: dealerCompanyForPayload ? dealerCompanyForPayload.id : null,
          dealerCompanyName: dealerCompanyForPayload?.companyName ?? null,
          ...(offerScenario === "to_dealer" ? {
            endCustomerId: endCustomerForPayload?.id ?? (customerId ? Number(customerId) : null),
            endCustomerName: endCustomerForPayload?.companyName || endCustomerForPayload?.name || null,
          } : {
            endCustomerId: null,
            endCustomerName: null,
          }),
        },
      } : {}),
      ...(isDealer && isCreate ? { presentationMode: "dealer" } : {}),
      hiddenSections,
      sectionOrder,
      pageBreaks,
      machineBreakPositions: (() => {
        const ordered = getOrderedCart();
        return machinePageBreaks.map(tid => ordered.findIndex(c => c.tempId === tid)).filter(i => i > 0);
      })(),
      termsBreakPositions: termsPageBreaks,
      layout,
      ...(isSalesman ? { layoutDrawing, layoutDwg, includeLayoutInPdf } : {}),
      family,
      ...(isSalesman ? { linkedDrawingId: selectedDrawingId && selectedDrawingId !== "none" ? Number(selectedDrawingId) : null } : {}),
      sectionTextOverrides,
      machineDescOverrides,
      lineSpeedOverrides,
      originalMachineDescs: origMachDescs,
      originalPresets: origPresets,
      deliveryMode,
      deliveryDays,
      deliveryDescription,
      deliveryDate,
      deliveryTerms: deliveryMode === "days" ? `${deliveryDays} giorni ${deliveryDescription}` : deliveryDate,
      paymentMode,
      paymentSchedule,
      headerInfo: {
        date: headerDate,
        salesman: { name: headerSalesmanName, email: headerSalesmanEmail, mobile: headerSalesmanMobile },
        customer: { name: headerCustomerName, contactPerson: headerCustomerContact, email: headerCustomerEmail, address: headerCustomerAddress },
      },
      technicalSpecs,
      pricing: {
        extraItems,
        discountPercent,
        showNetOnly,
        serviceItems: { ...serviceItems, trainingDays: String(installationConfig.installTrainingDays || 0), installationPrice: installationConfig.included ? installationConfig.totalPrice : 0 },
        installationConfig,
        interlockingPricePerPosition,
        interlockingTotal: calcInterlocking(),
        totalListPrice: calcTotalListPrice(),
        grossTotal: calcGrossTotal(),
        discountAmount: calcDiscount(),
        netTotal: calcNetTotal(),
        itemComments: getOrderedCart().map(item => ({
          machineComment: item.comment,
          optionComments: item.optionComments,
          optionPriceHidden: item.optionPriceHidden,
        })),
        itemDiscounts: getOrderedCart().map(item => ({
          discountOverridePercent: item.discountOverridePercent ?? null,
          isNet: item.isNet ?? false,
          optionDiscounts: item.optionDiscounts ?? {},
        })),
        priceComments,
        priceLabels,
      },
    };
  };

  const buildItemsPayload = () => getOrderedCart().map(item => ({
    machineId: item.machineId,
    quantity: item.quantity,
    optionIds: item.selectedOptionIds,
    optionQuantities: item.optionQuantities,
    customBasePrice: item.basePrice,
    customOptionPrices: item.optionPrices,
    isCustom: item.isCustom ?? false,
    snapshotMachineName: item.snapshotMachineName,
    snapshotMachineDescription: item.snapshotMachineDescription,
    customOptions: item.customOptions,
    snapshotOptionNames: item.snapshotOptionNames,
    customMainImage: item.customMainImage,
  }));

  const buildPreviewPayload = () => {
    if (isDealerEdit) {
      if (!offer) return null;
      const machineBreakPositions = machinePageBreakItemIds
        .map(itemId => offer.items.findIndex((i: any) => i.id === itemId))
        .filter((i: number) => i > 0);
      const pd = offer.projectData ?? {};
      const hi = pd.headerInfo ?? {};
      return {
        offer: {
          customerId: offer.customer.id,
          subject: offer.subject,
          salesmanName: hi.salesman?.name || "Sales Team",
          language: contentLanguage,
          totalPrice: dealerCalcFinalTotal().toString(),
          status: offer.status || "Draft",
          projectData: {
            ...pd,
            hiddenSections,
            sectionOrder,
            pageBreaks,
            machineBreakPositions,
            termsBreakPositions: termsPageBreaks,
            pricing: {
              ...pd.pricing,
              discountPercent,
              extraItems,
              interlockingPricePerPosition,
              installationConfig,
              serviceItems: { ...serviceItems, trainingDays: String(installationConfig.installTrainingDays || 0), installationPrice: installationConfig.included ? installationConfig.totalPrice : 0 },
              interlockingTotal: dealerCalcInterlocking(),
              totalListPrice: dealerCalcTotalListPrice(),
              grossTotal: dealerCalcGrossTotal(),
              discountAmount: dealerCalcDiscount(),
              netTotal: dealerCalcNetTotal(),
              itemDiscounts: pd.pricing?.itemDiscounts,
              showNetOnly: pd.pricing?.showNetOnly,
              priceLabels,
              priceComments,
            },
          },
        },
        items: offer.items.map((item: any) => ({
          machineId: item.machineId,
          quantity: item.quantity,
          optionIds: item.options.map((o: any) => o.machineOptionId),
          optionQuantities: Object.fromEntries(item.options.map((o: any) => [o.machineOptionId, o.quantity])),
          customBasePrice: dealerBasePrices[item.id] ?? parseFloat(item.snapshotBasePrice),
          customOptionPrices: Object.fromEntries(
            item.options.map((o: any) => [o.machineOptionId, dealerOptionPrices[o.id] ?? parseFloat(o.snapshotPriceModifier)])
          ),
        })),
      };
    }

    const salesmanName = headerSalesmanName || `${user?.name || ""} ${(user as any)?.surname || ""}`.trim() || (isDealer ? "Dealer" : "Sales Team");
    return {
      offer: {
        customerId: customerId ? parseInt(customerId) : null,
        subject,
        salesmanName,
        language: contentLanguage,
        totalPrice: calcTotal().toString(),
        status: "Draft",
        projectData: buildProjectDataPayload(),
      },
      items: buildItemsPayload(),
    };
  };

  const generatePreviewPdf = async () => {
    setIsPdfGenerating(true);
    try {
      const payload = buildPreviewPayload();
      if (!payload) { setIsPdfGenerating(false); return; }
      let url: string;
      if (isDealerEdit) url = `/api/dealer/offers/${offerId}/preview-pdf`;
      else if (isDealer && isCreate) url = `/api/dealer/offers/${sourceOfferId}/dealer-preview-pdf`;
      else url = `/api/offers/preview-pdf`;
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Preview failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (prevPdfBlobUrl.current) URL.revokeObjectURL(prevPdfBlobUrl.current);
      prevPdfBlobUrl.current = blobUrl;
      setPdfBlobUrl(blobUrl);
    } catch {} finally {
      setIsPdfGenerating(false);
    }
  };

  const persistCrmAfterCreate = async (newOfferId: number) => {
    const hasCrm =
      !!crmInfo.expectedCloseDate ||
      crmInfo.winProbability !== EMPTY_CRM_FORM.winProbability ||
      crmInfo.budget !== "" ||
      !!crmInfo.decisionMaker.trim() ||
      crmInfo.competitors.some(c => c.name.trim().length > 0) ||
      !!crmInfo.nextSteps.trim() ||
      !!crmInfo.notes.trim();

    if (hasCrm) {
      try {
        await apiRequest("PUT", `/api/offers/${newOfferId}/crm`, {
          expectedCloseDate: crmInfo.expectedCloseDate || null,
          winProbability: crmInfo.winProbability,
          budget: crmInfo.budget !== "" ? Number(crmInfo.budget) : null,
          decisionMaker: crmInfo.decisionMaker || null,
          competitors: crmInfo.competitors.filter(c => c.name.trim().length > 0),
          nextSteps: crmInfo.nextSteps || null,
          notes: crmInfo.notes || null,
        });
      } catch (err: any) {
        toast({
          title: "Dati CRM non salvati",
          description: `L'offerta è stata creata, ma i dati CRM non sono stati salvati. Aprila per riprovare. (${err?.message ?? ""})`,
          variant: "destructive",
        });
      }
    }

    const validReminders = pendingReminders.filter(r => {
      if (!r.remindAtLocal) return false;
      const d = new Date(r.remindAtLocal);
      return !isNaN(d.getTime());
    });
    let failedReminders = 0;
    for (const r of validReminders) {
      try {
        await apiRequest("POST", `/api/offers/${newOfferId}/reminders`, {
          remindAt: new Date(r.remindAtLocal).toISOString(),
          note: r.note ?? "",
        });
      } catch {
        failedReminders++;
      }
    }
    if (failedReminders > 0) {
      toast({
        title: "Promemoria non creati",
        description: `${failedReminders} promemoria non sono stati creati. Aprila per aggiungerli manualmente.`,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async () => {
    if (isDealerEdit) {
      if (!offer) return;
      setIsSubmitting(true);
      try {
        const machineBreakPositions = machinePageBreakItemIds
          .map(itemId => offer.items.findIndex((i: any) => i.id === itemId))
          .filter((i: number) => i > 0);
        const items = offer.items.map((item: any) => ({
          machineId: item.machineId,
          quantity: item.quantity,
          optionIds: item.options.map((o: any) => o.machineOptionId),
          customBasePrice: dealerBasePrices[item.id] ?? parseFloat(item.snapshotBasePrice),
          customOptionPrices: Object.fromEntries(
            item.options.map((o: any) => [o.machineOptionId, dealerOptionPrices[o.id] ?? parseFloat(o.snapshotPriceModifier)])
          ),
        }));
        const pricing = {
          discountPercent,
          extraItems,
          interlockingPricePerPosition,
          installationConfig,
          serviceItems: { ...serviceItems, trainingDays: String(installationConfig.installTrainingDays || 0), installationPrice: installationConfig.included ? installationConfig.totalPrice : 0 },
          priceLabels,
          priceComments,
          optionPriceHidden: dealerOptionPriceHidden,
          itemComments: dealerItemComments,
          optionComments: dealerOptionComments,
          basePrices: dealerBasePrices,
          optionPrices: dealerOptionPrices,
          interlockingTotal: dealerCalcInterlocking(),
          totalListPrice: dealerCalcTotalListPrice(),
          grossTotal: dealerCalcGrossTotal(),
          discountAmount: dealerCalcDiscount(),
          netTotal: dealerCalcNetTotal(),
          itemDiscounts: (offer.projectData as any)?.pricing?.itemDiscounts,
          showNetOnly: (offer.projectData as any)?.pricing?.showNetOnly,
        };
        const res = await apiRequest("PUT", `/api/dealer/offers/${offerId}/prices`, {
          pricing, items, totalPrice: dealerCalcFinalTotal(),
          language: contentLanguage,
          sectionOrder, hiddenSections, pageBreaks, machineBreakPositions,
        });
        const result = await res.json();
        toast({ title: "Prices saved!", description: "Redirecting to your offer…" });
        setLocation(`/dealer/offers/${result.newOfferId as number}`);
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!customerId || !subject || cart.length === 0) return;
    setIsSubmitting(true);

    const salesmanName = `${user?.name || ""} ${(user as any)?.surname || ""}`.trim() || (isSalesman ? (offer?.salesmanName || "Sales Team") : "Dealer");
    const payload = {
      ...(isDealer && isCreate ? {} : { offer: {} }),
      offer: {
        customerId: parseInt(customerId),
        subject,
        salesmanName,
        language: contentLanguage,
        ...(isSalesman ? {
          salesmanEmail: headerSalesmanEmail || undefined,
          salesmanMobile: headerSalesmanMobile || undefined,
          salesScenario: offerScenario,
        } : {}),
        totalPrice: calcTotal().toString(),
        status: "Draft",
        projectData: buildProjectDataPayload(),
      },
      items: buildItemsPayload(),
    };

    try {
      if (isSalesman && isCreate && fromEnquiryId) {
        const res = await apiRequest("POST", `/api/enquiries/${fromEnquiryId}/start-offer`, payload);
        let createdId: number | null = null;
        try {
          const data = await res.json();
          createdId = typeof data?.id === "number" ? data.id : null;
        } catch { /* non-JSON response, ignore */ }
        queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
        if (createdId) await persistCrmAfterCreate(createdId);
        toast({ title: "Offer created", description: "The offer has been created from the enquiry." });
        setLocation("/offers");
      } else if (isSalesman && isCreate) {
        const created = await createOffer.mutateAsync(payload as Parameters<typeof createOffer.mutateAsync>[0]) as Offer;
        if (createdDrawingRequestId && created?.id) {
          try {
            await apiRequest("PATCH", `/api/drawing-requests/${createdDrawingRequestId}/link-offer`, { offerId: created.id });
          } catch {
            // Non-fatal: request was already sent, offerId link is optional
          }
        }
        if (created?.id) await persistCrmAfterCreate(created.id);
        wizardDraft.clearDraft();
        setLocation("/offers");
      } else if (isSalesman && isEdit) {
        await updateOffer.mutateAsync({ offerId, payload });
        setLocation(`/offers/${offerId}`);
      } else if (isDealer && isCreate) {
        const dealerPayload = {
          customerId: parseInt(customerId),
          subject,
          language: contentLanguage,
          totalPrice: calcTotal().toString(),
          projectData: buildProjectDataPayload(),
          items: buildItemsPayload(),
        };
        const res = await apiRequest("POST", `/api/dealer/offers/${sourceOfferId}/create-dealer-version`, dealerPayload);
        const data = await res.json();
        queryClient.invalidateQueries({ queryKey: ["/api/dealer/offers"] });
        toast({ title: "Dealer offer created", description: `Reference: ${data.referenceNumber}` });
        setLocation(`/dealer/offers/${data.offerId}`);
      }
    } catch (err: any) {
      toast({ title: "Failed to save offer", description: err?.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const dealerEditSaveMutation = useMutation({
    mutationFn: handleSubmit,
  });

  const handleRecommendMachines = () => {
    if (!machines || (machines as any[]).length === 0) return;
    const customer = (customers as any[])?.find((c: any) => c.id.toString() === customerId);
    const requirements = [
      subject && `Project: ${subject}`,
      layout && `Layout: ${layout}`,
      cart.length > 0 && `Already selected: ${cart.map(ci => (machines as any[]).find((m: any) => m.id === ci.machineId)?.name).filter(Boolean).join(", ")}`,
      sourceEnquiry?.notes && `Notes: ${sourceEnquiry.notes}`,
    ].filter(Boolean).join(". ");
    recommendMachines.mutate({
      requirements: requirements || "General machine line recommendation",
      customerIndustry: (customer as any)?.industry ?? undefined,
      availableMachines: (machines as any[]).map((m: any) => ({
        id: m.id, name: m.name, macroType: m.macroType, description: m.description,
        basePrice: String(m.basePrice),
        options: m.options.map((o: any) => ({ id: o.id, name: o.name, priceModifier: String(o.priceModifier) })),
      })),
      language: "en",
    });
    setShowAiPanel(true);
    setAiPanelMode("recommend");
    setAddedFromAi(new Set());
  };

  const handleAddRecommendedMachine = (rec: MachineRecommendation) => {
    const machine = (machines as any[])?.find((m: any) => m.id === rec.machineId);
    if (!machine) return;
    const optionPrices: Record<number, number> = {};
    const selectedOptionIds: number[] = [];
    const optionQuantities: Record<number, number> = {};
    for (const so of rec.suggestedOptions) {
      const opt = machine.options.find((o: any) => o.id === so.optionId);
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
      selectedOptionIds, optionQuantities,
      basePrice: parseFloat(machine.basePrice as unknown as string),
      optionPrices, comment: "", optionComments: {}, optionPriceHidden: {},
      discountOverridePercent: null, isNet: false, optionDiscounts: {},
    };
    setCart(prev => [...prev, newItem]);
    setAddedFromAi(prev => new Set(prev).add(rec.machineId));
    toast({ title: `${rec.machineName} added to offer` });
  };

  const handleViewMachine = (machineId: number) => setActiveMachineId(String(machineId));

  const handleAiFeedback = (runId: string, rating: "accepted" | "rejected" | "modified", comment?: string) => {
    submitFeedback.mutate(
      { runId, rating, comment },
      {
        onSuccess: () => toast({ title: rating === "accepted" ? "Feedback submitted — thank you!" : "Feedback noted" }),
        onError: () => toast({ title: "Failed to submit feedback", variant: "destructive" }),
      }
    );
  };

  const handleGenerateDraft = () => {
    if (!subject || cart.length === 0 || !machines) return;
    const customer = (customers as any[])?.find((c: any) => c.id.toString() === customerId);
    const enabledIds = (formatSettings?.sections ?? []).filter((s: any) => s.enabled).map((s: any) => s.id);
    draftOfferText.mutate({
      offerSubject: subject,
      customerName: customer?.name ?? "Customer",
      selectedMachines: cart.map(ci => {
        const m = (machines as any[]).find((mm: any) => mm.id === ci.machineId);
        return { name: m?.name ?? "Unknown", description: machineDescOverrides[ci.machineId] ?? m?.description ?? "", quantity: ci.quantity };
      }),
      availableSections: enabledIds.map((id: string) => {
        const sec = (formatSettings?.sections ?? []).find((s: any) => s.id === id);
        return { id, name: sec?.label ?? id };
      }),
      availablePresets: (presets ?? []).map((p: any) => ({ id: p.id, title: p.title, content: p.content })),
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
    const customer = (customers as any[])?.find((c: any) => c.id.toString() === customerId);
    reviewRisks.mutate({
      offerSubject: subject,
      customerName: customer?.name ?? (headerCustomerName || "Customer"),
      customerAddress: headerCustomerAddress || (customer as any)?.address || undefined,
      totalPrice: calcTotal().toString(),
      selectedMachines: cart.map(ci => {
        const m = (machines as any[]).find((mm: any) => mm.id === ci.machineId);
        return { name: m?.name ?? "Unknown", quantity: ci.quantity, unitPrice: ci.basePrice.toString() };
      }),
      selectedPresets: (projectData.selectedPresets ?? []).map((p: any) => ({ title: p.title ?? "", content: p.content ?? "" })),
      offerNotes: layout ? `Layout: ${layout}` : undefined,
      language: "en",
      offerId: offer?.id,
    });
    setShowAiPanel(true);
    setAiPanelMode("risk");
  };

  const handleSafetyCheck = () => {
    if (!subject || cart.length === 0 || !machines) return;
    const customer = (customers as any[])?.find((c: any) => c.id.toString() === customerId);
    configSafetyGuard.mutate({
      offerSubject: subject,
      customerName: customer?.name ?? (headerCustomerName || "Customer"),
      customerAddress: headerCustomerAddress || (customer as any)?.address || undefined,
      totalPrice: calcTotal().toString(),
      selectedMachines: cart.map(ci => {
        const m = (machines as any[]).find((mm: any) => mm.id === ci.machineId);
        const machineOptions = (m as any)?.options ?? [];
        return {
          name: m?.name ?? "Unknown",
          quantity: ci.quantity,
          unitPrice: ci.basePrice.toString(),
          macroType: m?.macroType ?? null,
          options: ci.selectedOptionIds.map((optId: number) => {
            const opt = machineOptions.find((o: any) => o.id === optId);
            return { name: opt?.name ?? `Option #${optId}`, priceModifier: opt?.priceModifier?.toString() };
          }),
        };
      }),
      selectedPresets: (projectData.selectedPresets ?? []).map((p: any) => ({ title: p.title ?? "", content: p.content ?? "" })),
      offerNotes: layout ? `Layout: ${layout}` : undefined,
      language: "en",
      offerId: offer?.id,
    });
    setShowAiPanel(true);
    setAiPanelMode("safety");
  };

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

  const handleInsertSubject = (text: string) => { setSubject(text); setDraftInsertedKeys(prev => new Set(prev).add("subject")); toast({ title: "Subject inserted into offer" }); };
  const handleInsertSection = (sectionId: string, text: string) => { setSectionTextOverrides(prev => ({ ...prev, [sectionId]: { ...prev[sectionId], intro: text } })); setDraftInsertedKeys(prev => new Set(prev).add(`section-${sectionId}`)); toast({ title: "Section text inserted" }); };
  const handleInsertIntroduction = (text: string) => { setSectionTextOverrides(prev => ({ ...prev, offer_title: { ...prev.offer_title, intro: text } })); setDraftInsertedKeys(prev => new Set(prev).add("introduction")); toast({ title: "Introduction inserted" }); };
  const handleInsertClosing = (text: string) => { setSectionTextOverrides(prev => ({ ...prev, terms_conditions: { ...prev.terms_conditions, intro: text } })); setDraftInsertedKeys(prev => new Set(prev).add("closing")); toast({ title: "Closing paragraph inserted" }); };
  const handleDraftEditText = (key: string, text: string) => setDraftEditedTexts(prev => ({ ...prev, [key]: text }));

  const aiOutput = aiPanelMode === "recommend" ? (recommendMachines.data?.output ?? null)
    : aiPanelMode === "draft" ? (draftOfferText.data?.output ?? null)
    : aiPanelMode === "risk" ? (reviewRisks.data?.output ?? null)
    : aiPanelMode === "safety" ? (configSafetyGuard.data?.output ?? null)
    : brainOutput;
  const aiRun = aiPanelMode === "recommend" ? (recommendMachines.data?.run ?? null)
    : aiPanelMode === "draft" ? (draftOfferText.data?.run ?? null)
    : aiPanelMode === "risk" ? (reviewRisks.data?.run ?? null)
    : aiPanelMode === "safety" ? (configSafetyGuard.data?.run ?? null)
    : null;
  const aiError = aiPanelMode === "recommend" ? (recommendMachines.error?.message ?? null)
    : aiPanelMode === "draft" ? (draftOfferText.error?.message ?? null)
    : aiPanelMode === "risk" ? (reviewRisks.error?.message ?? null)
    : aiPanelMode === "safety" ? (configSafetyGuard.error?.message ?? null)
    : brainError;
  const aiLoading = aiPanelMode === "recommend" ? recommendMachines.isPending
    : aiPanelMode === "draft" ? draftOfferText.isPending
    : aiPanelMode === "risk" ? reviewRisks.isPending
    : aiPanelMode === "safety" ? configSafetyGuard.isPending
    : quoteContext.isFetching;
  const aiWorkflowType = aiPanelMode === "recommend" ? "machine_recommendation" as const
    : aiPanelMode === "draft" ? "offer_text_draft" as const
    : aiPanelMode === "risk" ? "risk_review" as const
    : aiPanelMode === "safety" ? "config_safety_guard" as const
    : "sales_brain" as const;
  const aiRetry = aiPanelMode === "recommend" ? handleRecommendMachines
    : aiPanelMode === "draft" ? handleGenerateDraft
    : aiPanelMode === "risk" ? handleReviewRisks
    : aiPanelMode === "safety" ? handleSafetyCheck
    : handleShowBrain;
  const aiTitle = aiPanelMode === "recommend" ? "Machine Suggestions"
    : aiPanelMode === "draft" ? "Offer Draft"
    : aiPanelMode === "risk" ? "Risk Review"
    : aiPanelMode === "safety" ? "Safety Check"
    : "Sales Brain";

  const draftCallbacks: DraftInsertCallbacks = {
    onInsertSubject: handleInsertSubject,
    onInsertSection: handleInsertSection,
    onInsertIntroduction: handleInsertIntroduction,
    onInsertClosing: handleInsertClosing,
    editedTexts: draftEditedTexts,
    onEditText: handleDraftEditText,
    insertedKeys: draftInsertedKeys,
  };

  const updateSpec = (field: keyof TechnicalSpecs, value: string) => setTechnicalSpecs(prev => ({ ...prev, [field]: value }));

  const selectedMachine = machines ? (machines as any[])?.find((m: any) => m.id.toString() === activeMachineId) : null;
  const techSpecSection = formatSettings?.sections?.find((s: any) => s.id === "technical_specs");
  const tsLbl = (key: string, fallback: string) => (techSpecSection?.labels?.[key] as string) || fallback;

  const isLoading = (isEdit || (isDealer && isCreate)) && (offerLoading || !initialized);

  const LayoutWrapper = isDealer ? DealerLayout : Layout;

  if (isLoading) {
    return (
      <LayoutWrapper>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </LayoutWrapper>
    );
  }

  if ((isEdit || (isDealer && isCreate)) && !offer) {
    return (
      <LayoutWrapper>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Package className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">Offer not found or access denied.</p>
        </div>
      </LayoutWrapper>
    );
  }

  const canJumpToStep = (targetStepIdx: number) => {
    if (isDealerEdit) return targetStepIdx < step;
    const n = targetStepIdx + 1;
    const compositionIdx = wizardSteps.findIndex(s => s.id === "composition");
    return n <= step
      || wizardSteps[targetStepIdx]?.id === "subject"
      || (wizardSteps[targetStepIdx]?.id === "composition" && !!customerId)
      || (n > (compositionIdx + 1) && !!customerId && cart.length > 0);
  };

  const pageTitle = isDealerEdit
    ? "Edit Prices"
    : isSalesman && isCreate ? "New Offer"
    : isSalesman && isEdit ? "Edit Offer"
    : isDealer && isCreate ? "Create Dealer Offer"
    : "Offer";

  const pageSubtitle = isDealerEdit && offer
    ? `${offer.referenceNumber} — ${offer.subject}`
    : isDealer && isCreate && offer
    ? `Based on ${offer.referenceNumber}`
    : undefined;

  const submitLabel = isDealerEdit ? "Save Prices"
    : isSalesman && isCreate ? "Create Offer"
    : isSalesman && isEdit ? "Save Changes"
    : "Create Dealer Offer";

  const submitting = isSubmitting || createOffer.isPending || updateOffer.isPending || dealerEditSaveMutation.isPending;

  const pd = isDealerEdit ? (offer?.projectData ?? {}) : {};
  const hi = isDealerEdit ? (pd.headerInfo ?? {}) : {};
  const ts = isDealerEdit ? (pd.technicalSpecs ?? {}) : {};
  const customerName = isDealerEdit ? (offer?.customer?.name ?? offer?.customer?.companyName ?? "—") : "";

  const enabledIds = (formatSettings?.sections ?? []).filter((s: any) => s.enabled).map((s: any) => s.id);
  const displayOrder = sectionOrder.length > 0
    ? [...sectionOrder.filter((id: string) => enabledIds.includes(id)), ...enabledIds.filter((id: string) => !sectionOrder.includes(id))]
    : enabledIds;

  function ReadOnlyField({ label, value }: { label: string; value?: string }) {
    if (!value) return null;
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <p className="text-sm font-medium">{value}</p>
      </div>
    );
  }

  return (
    <LayoutWrapper>
      <div className="max-w-6xl mx-auto space-y-8 pb-20">
        <PageHeader
          title={pageTitle}
          subtitle={pageSubtitle}
        />
        <div>
          {isSalesman && isCreate && fromEnquiryId && sourceEnquiry && (
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
          {draftEnabled && (
            <div className="mt-3" data-testid="drafts-panel">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowDraftsList(v => !v)}
                data-testid="button-toggle-drafts-list"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Le Mie Bozze</span>
                <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${showDraftsList ? "rotate-180" : ""}`} />
              </button>
              {showDraftsList && (() => {
                void draftsListVersion;
                const drafts = wizardDraft.listDrafts();
                return (
                  <div className="mt-2 border rounded-lg bg-muted/20 overflow-hidden" data-testid="drafts-list-container">
                    <div className="p-3 border-b bg-muted/30 flex items-center justify-between gap-2">
                      {showSaveNameInput ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            value={draftNameInput}
                            onChange={(e) => setDraftNameInput(e.target.value)}
                            placeholder="Nome bozza (opzionale)..."
                            className="h-8 text-sm flex-1"
                            onKeyDown={(e) => e.key === "Enter" && handleSaveNamedDraft()}
                            autoFocus
                            data-testid="input-draft-name"
                          />
                          <Button size="sm" onClick={handleSaveNamedDraft} className="h-8 text-xs" data-testid="button-confirm-save-draft">
                            <Save className="w-3.5 h-3.5 mr-1" />
                            Salva
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setShowSaveNameInput(false); setDraftNameInput(""); }} className="h-8 text-xs">
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setShowSaveNameInput(true)} className="h-8 text-xs" data-testid="button-save-named-draft">
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Salva Bozza Corrente
                        </Button>
                      )}
                    </div>
                    {drafts.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Nessuna bozza salvata. Usa "Salva Bozza Corrente" per salvare lo stato attuale.
                      </div>
                    ) : (
                      <div className="divide-y max-h-64 overflow-y-auto">
                        {drafts.map((d) => (
                          <div key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors" data-testid={`draft-item-${d.id}`}>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{d.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(d.savedAt).toLocaleDateString("it-IT")} {new Date(d.savedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                {d.customerName && <> · {d.customerName}</>}
                                {d.subject && <> · {d.subject}</>}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleLoadNamedDraft(d.id)} data-testid={`button-load-draft-${d.id}`}>
                                Carica
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteNamedDraft(d.id)} data-testid={`button-delete-draft-${d.id}`}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          <div className="flex items-center gap-1 mt-4 text-sm font-medium flex-wrap">
            {wizardSteps.map(({ id, label, readOnly: ro }, i) => {
              const n = i + 1;
              const canJump = canJumpToStep(i);
              return (
                <div key={id} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <div
                    className={cn(
                      "flex items-center gap-1.5 transition-colors rounded px-2 py-1",
                      isDealerEdit
                        ? (step === n ? "bg-primary text-primary-foreground" : n < step ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-pointer" : "bg-muted text-muted-foreground")
                        : (step === n ? "text-primary font-bold" : n < step ? "text-primary/70 hover:text-primary cursor-pointer" : canJump ? "text-muted-foreground hover:text-primary/70 cursor-pointer" : "text-muted-foreground/40 cursor-default"),
                      isDealerEdit && "text-xs font-medium px-3 py-1.5 rounded-full"
                    )}
                    onClick={() => canJump && setStep(n)}
                    data-testid={`step-tab-${id}`}
                  >
                    {isDealerEdit && step > n ? <Check className="w-3 h-3" /> : isDealerEdit && ro ? <Lock className="w-3 h-3" /> : null}
                    {!isDealerEdit && <span>{n}.</span>}
                    <span>{label}</span>
                  </div>
                </div>
              );
            })}
            {wizardDraft.lastSavedAt && draftEnabled && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-auto shrink-0" data-testid="text-draft-saved">
                <Save className="w-3 h-3" />
                Bozza salvata · {wizardDraft.lastSavedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
        </div>

        <Card className="border-border shadow-md">
          <CardContent className="p-6">
            <div className="flex justify-between items-center gap-2 mb-6 pb-4 border-b">
              <Button variant="outline" size="sm" onClick={() => setStep(step - 1)} disabled={step === 1} data-testid="button-back-top" className="sm:size-default px-2 sm:px-4 shrink-0">
                <ChevronLeft className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Back</span>
              </Button>
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <span className="text-xs sm:text-sm text-muted-foreground font-medium whitespace-nowrap">{step} / {wizardSteps.length}</span>
                {draftEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { wizardDraft.upsertDraft("Autosalvataggio"); setDraftsListVersion(v => v + 1); }}
                    data-testid="button-save-draft"
                    className="text-xs px-2 sm:px-3"
                  >
                    <Save className="w-3.5 h-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Salva Bozza</span>
                  </Button>
                )}
              </div>
              {step < wizardSteps.length ? (
                <Button
                  size="sm"
                  onClick={() => setStep(step + 1)}
                  disabled={!isDealerEdit && (
                    (currentStepDef?.id === "customer" && (
                      !customerId ||
                      ((offerScenario === "with_dealer" || offerScenario === "to_dealer") && !dealerCompanyId)
                    )) ||
                    (currentStepDef?.id === "composition" && cart.length === 0)
                  )}
                  data-testid="button-next-top"
                  className="sm:size-default px-2 sm:px-4 shrink-0"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-4 h-4 sm:ml-1" />
                </Button>
              ) : (
                <Button size="sm" onClick={handleSubmit} disabled={(!isDealerEdit && (!subject || cart.length === 0)) || submitting} className="bg-primary hover:bg-primary/90 sm:size-default px-2 sm:px-4 shrink-0" data-testid="button-submit-top">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin sm:mr-2" /> : <Check className="w-4 h-4 sm:mr-2" />}
                  <span className="hidden sm:inline">{submitLabel}</span>
                </Button>
              )}
            </div>

            {currentStepDef?.intro && !isDealerEdit && (
              <p className="text-sm text-muted-foreground italic mb-4 border-l-2 border-primary/30 pl-3">{currentStepDef.intro}</p>
            )}

            <AnimatePresence mode="wait">
              {currentStepDef?.id === "customer" && !isDealerEdit && (
                <motion.div key="customer" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  {isSalesman && (
                    <div className="space-y-2">
                      <Label>Sales Scenario</Label>
                      <p className="text-xs text-muted-foreground">Choose how this offer is sold.</p>
                      <div className="grid sm:grid-cols-3 gap-2">
                        {[
                          { id: "direct", title: "Direct to customer", desc: "No dealer involved." },
                          { id: "with_dealer", title: "Customer + dealer", desc: "Dealer assists as channel partner." },
                          { id: "to_dealer", title: "Dealer with end customer", desc: "Dealer is the buyer / reseller." },
                        ].map((opt) => (
                          <button
                            type="button"
                            key={opt.id}
                            onClick={() => {
                              const next = opt.id as typeof offerScenario;
                              setOfferScenario(next);
                              if (next === "direct") {
                                setDealerCompanyId("");
                              }
                              if (next !== "to_dealer") {
                                // Switching back: header customer should track end customer again
                                const sel = ((customers ?? []) as any[]).find((c: any) => c.id.toString() === customerId);
                                if (sel) {
                                  setHeaderCustomerName(sel.companyName || sel.name || "");
                                  setHeaderCustomerAddress(sel.address ?? "");
                                  setHeaderCustomerEmail(sel.email ?? "");
                                  setHeaderCustomerContact(sel.contactPerson ?? "");
                                }
                              } else if (dealerCompanyId) {
                                const d = dealerCompaniesList.find((dc: any) => String(dc.id) === dealerCompanyId);
                                if (d) {
                                  setHeaderCustomerName(d.companyName ?? "");
                                  setHeaderCustomerAddress(d.address ?? "");
                                  setHeaderCustomerEmail(d.email ?? "");
                                  setHeaderCustomerContact("");
                                }
                              }
                            }}
                            className={`text-left p-3 rounded-md border transition-colors ${
                              offerScenario === opt.id
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/40 hover:bg-muted/40"
                            }`}
                            data-testid={`scenario-${opt.id}`}
                          >
                            <p className="text-sm font-medium">{opt.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {isSalesman && (offerScenario === "with_dealer" || offerScenario === "to_dealer") && (
                    <div className="space-y-2">
                      <Label>{offerScenario === "to_dealer" ? "Dealer (Recipient)" : "Dealer (Channel Partner)"}</Label>
                      <Select
                        value={dealerCompanyId}
                        onValueChange={(v) => {
                          setDealerCompanyId(v);
                          if (offerScenario === "to_dealer") {
                            const d = dealerCompaniesList.find((dc: any) => String(dc.id) === v);
                            if (d) {
                              setHeaderCustomerName(d.companyName ?? "");
                              setHeaderCustomerAddress(d.address ?? "");
                              setHeaderCustomerEmail(d.email ?? "");
                              setHeaderCustomerContact("");
                            }
                          }
                        }}
                      >
                        <SelectTrigger data-testid="select-dealer-company">
                          <SelectValue placeholder="Choose a dealer..." />
                        </SelectTrigger>
                        <SelectContent>
                          {dealerCompaniesList.map((d: any) => (
                            <SelectItem key={d.id} value={String(d.id)} data-testid={`dealer-option-${d.id}`}>
                              {d.companyName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedDealerCompany && (
                        <div className="flex items-center gap-2 p-2 rounded-md border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                          <Check className="w-4 h-4 text-blue-600 shrink-0" />
                          <span className="text-sm font-medium text-blue-800 dark:text-blue-300">{selectedDealerCompany.companyName}</span>
                          {selectedDealerCompany.city && (
                            <span className="text-xs text-muted-foreground ml-auto">{selectedDealerCompany.city}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>{offerScenario === "to_dealer" ? "End Customer (Reference)" : "Search Customer"}</Label>
                    <div className="relative">
                      <Input placeholder="Type company name, contact or email…" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} data-testid="input-customer-search" />
                      {customerSearch.trim().length > 0 && (() => {
                        const q = customerSearch.toLowerCase();
                        const matches = ((customers ?? []) as any[]).filter((c: any) =>
                          c.name?.toLowerCase().includes(q) || c.companyName?.toLowerCase().includes(q) ||
                          c.contactPerson?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
                        );
                        if (matches.length === 0) return (
                          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md p-3 text-sm text-muted-foreground">No customers found</div>
                        );
                        return (
                          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md max-h-56 overflow-y-auto" data-testid="customer-search-results">
                            {matches.map((c: any) => (
                              <button key={c.id} type="button" className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b last:border-b-0" data-testid={`customer-search-result-${c.id}`}
                                onClick={() => {
                                  setCustomerId(c.id.toString());
                                  if (offerScenario !== "to_dealer") {
                                    setHeaderCustomerName(c.companyName || c.name || "");
                                    setHeaderCustomerAddress(c.address ?? "");
                                    setHeaderCustomerContact("");
                                    setHeaderCustomerEmail("");
                                  }
                                  setSelectedContactId("");
                                  setCustomerSearch("");
                                  setSelectedDrawingId("");
                                }}>
                                <p className="font-medium text-sm">{c.companyName || c.name}</p>
                                {(c.contactPerson || c.email) && <p className="text-xs text-muted-foreground">{[c.contactPerson, c.email].filter(Boolean).join(" · ")}</p>}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  {customerId && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
                      <Check className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="text-sm font-medium text-green-800 dark:text-green-300">
                        {((customers ?? []) as any[]).find((c: any) => c.id.toString() === customerId)?.name ?? ((customers ?? []) as any[]).find((c: any) => c.id.toString() === customerId)?.companyName}
                      </span>
                      <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => { setCustomerId(""); setSelectedDrawingId(""); }} data-testid="btn-clear-customer">Change</button>
                    </div>
                  )}
                  {customerId && <CustomerOfferHistory customerId={customerId} />}
                  <div className="space-y-2">
                    <Label>Document Language</Label>
                    <p className="text-xs text-muted-foreground">Language used for machine names and descriptions in the offer document and PDF.</p>
                    <Select value={contentLanguage} onValueChange={(newLang) => {
                      setContentLanguage(newLang);
                      const selected = projectData.selectedPresets;
                      if (selected?.length && presets?.length) {
                        const today = new Date();
                        const dateStr = today.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
                        const applyPlaceholders = (text: string) => text
                          .replace(/\{\{DATA_OGGI\}\}/g, dateStr)
                          .replace(/\{\{NOME_CLIENTE\}\}/g, headerCustomerName || "—")
                          .replace(/\{\{CONTATTO_CLIENTE\}\}/g, headerCustomerContact || "—")
                          .replace(/\{\{EMAIL_CLIENTE\}\}/g, headerCustomerEmail || "—")
                          .replace(/\{\{INDIRIZZO_CLIENTE\}\}/g, headerCustomerAddress || "—")
                          .replace(/\{\{NUMERO_OFFERTA\}\}/g, projectData.offerNumber || projectData.headerInfo?.offerNumber || "—");
                        const reResolved = selected.map((sp: any) => {
                          const source = (presets as any[]).find((p: any) => p.id === sp.id);
                          if (!source) return sp;
                          const tr = newLang !== "it" && source.translations?.[newLang];
                          return { id: sp.id, title: applyPlaceholders(tr?.title || source.title), content: applyPlaceholders(tr?.content || source.content) };
                        });
                        setProjectData({ ...projectData, selectedPresets: reResolved });
                      }
                    }}>
                      <SelectTrigger className="w-[200px]" data-testid="select-content-language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="it" data-testid="content-lang-it">🇮🇹 Italiano</SelectItem>
                        <SelectItem value="en" data-testid="content-lang-en">🇬🇧 English</SelectItem>
                        <SelectItem value="de" data-testid="content-lang-de">🇩🇪 Deutsch</SelectItem>
                        <SelectItem value="fr" data-testid="content-lang-fr">🇫🇷 Français</SelectItem>
                        <SelectItem value="es" data-testid="content-lang-es">🇪🇸 Español</SelectItem>
                        <SelectItem value="pt" data-testid="content-lang-pt">🇵🇹 Português</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Or pick from list</Label>
                    <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setSelectedDrawingId(""); }}>
                      <SelectTrigger className="h-10" data-testid="select-customer"><SelectValue placeholder="Choose a client..." /></SelectTrigger>
                      <SelectContent>
                        {((customers ?? []) as any[]).map((c: any) => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.companyName || c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isSalesman && (
                      <p className="text-sm text-muted-foreground">Don't see the customer? <span className="text-primary cursor-pointer hover:underline" onClick={() => setLocation("/crm")}>Add new customer</span></p>
                    )}
                  </div>
                  {customerId && (
                    <div className="space-y-2">
                      <Label>Contact Person</Label>
                      {companyContacts.length > 0 ? (
                        <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                          <SelectTrigger data-testid="select-contact"><SelectValue placeholder="Select a contact..." /></SelectTrigger>
                          <SelectContent>
                            {companyContacts.map((ct: any) => (
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

              {currentStepDef?.id === "customer" && isDealerEdit && (
                <motion.div key="customer" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <div className="flex items-center gap-2 border-b pb-2">
                    <h3 className="font-semibold text-lg">Customer Details</h3>
                    <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" />Read-only</Badge>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4 grid md:grid-cols-2 gap-4">
                    <ReadOnlyField label="Customer" value={customerName} />
                    <ReadOnlyField label="Subject" value={offer?.subject} />
                    <ReadOnlyField label="Reference" value={offer?.referenceNumber} />
                    <ReadOnlyField label="Version" value={`v${displayVersion(offer?.version)}`} />
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "details" && !isDealerEdit && (
                <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <h3 className="font-semibold text-lg border-b pb-2">Date &amp; Parties</h3>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</Label>
                    <Input type="date" value={headerDate} onChange={(e) => setHeaderDate(e.target.value)} data-testid="input-header-date" />
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
                  {isSalesman && offerScenario === "with_dealer" && selectedDealerCompany && (
                    <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-sm text-blue-900 dark:text-blue-200" data-testid="info-channel-partner">
                      <span className="font-medium">Channel partner:</span> {selectedDealerCompany.companyName}
                    </div>
                  )}
                  {isSalesman && offerScenario === "to_dealer" && (() => {
                    const endCust = ((customers ?? []) as any[]).find((c: any) => c.id.toString() === customerId);
                    return (
                      <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-200" data-testid="info-end-customer-reference">
                        <span className="font-medium">End customer reference:</span> {endCust?.companyName || endCust?.name || "—"}
                      </div>
                    );
                  })()}
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {offerScenario === "to_dealer" ? "Recipient (Dealer)" : "Customer"}
                    </Label>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Company Name</Label>
                        <Input value={headerCustomerName} onChange={(e) => setHeaderCustomerName(e.target.value)} placeholder="Company name" data-testid="input-customer-name" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Contact Person</Label>
                        {companyContacts.length > 0 ? (
                          <Select value={selectedContactId} onValueChange={(v) => setSelectedContactId(v)}>
                            <SelectTrigger data-testid="select-header-contact"><SelectValue placeholder="Select a contact..." /></SelectTrigger>
                            <SelectContent>
                              {companyContacts.map((ct: any) => (
                                <SelectItem key={ct.id} value={ct.id.toString()}>{ct.firstName} {ct.lastName}</SelectItem>
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

              {currentStepDef?.id === "details" && isDealerEdit && (
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

              {currentStepDef?.id === "subject" && !isDealerEdit && (
                <motion.div key="subject" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <h3 className="font-semibold text-lg border-b pb-2">{currentStepDef.label}</h3>
                  <div className="space-y-2">
                    <Label>Subject / Offer Title</Label>
                    <Input placeholder="e.g. Production Line Upgrade for Factory A" value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="input-subject" />
                  </div>
                  <div className="space-y-2">
                    <Label>Product Family</Label>
                    <Select value={family} onValueChange={setFamily}>
                      <SelectTrigger data-testid="select-family"><SelectValue placeholder="Select a machine family…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rullo">Rullo</SelectItem>
                        <SelectItem value="spruzzatrici">Spruzzatrici</SelectItem>
                        <SelectItem value="robot">Robot</SelectItem>
                        <SelectItem value="profilo">Profilo</SelectItem>
                        <SelectItem value="velo">Velo</SelectItem>
                      </SelectContent>
                    </Select>
                    {isSalesman && isCreate && <p className="text-xs text-muted-foreground">Selecting a family will auto-fill Technical Specification fields from family defaults.</p>}
                  </div>
                  {isSalesman && (
                    <div className="space-y-3 p-4 border rounded-lg bg-muted/20">
                      <Label className="flex items-center gap-1.5 text-base font-semibold">
                        <Ruler className="w-4 h-4" />
                        Disegno Tecnico Collegato
                      </Label>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Layout (riferimento)</Label>
                        <Input placeholder="e.g. 3" value={layout} onChange={(e) => setLayout(e.target.value)} data-testid="input-layout" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Seleziona disegno esistente</Label>
                        {!customerId ? (
                          <p className="text-xs text-muted-foreground italic">Seleziona prima un cliente per vedere i disegni disponibili.</p>
                        ) : availableDrawings.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Nessun disegno tecnico disponibile per questo cliente.</p>
                        ) : (
                          <Select value={selectedDrawingId} onValueChange={(v) => {
                            setSelectedDrawingId(v);
                            if (v && v !== "none") {
                              const d = availableDrawings.find((x) => String(x.id) === v);
                              const name = d?.pdfOriginalName ?? d?.dwgOriginalName ?? "";
                              if (name) {
                                const base = name.replace(/\.(pdf|dwg)$/i, "");
                                setLayout(base);
                              }
                            }
                          }}>
                            <SelectTrigger data-testid="select-drawing">
                              <SelectValue placeholder="Seleziona disegno (opzionale)…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nessun disegno</SelectItem>
                              {availableDrawings.map((d) => (
                                <SelectItem key={d.id} value={String(d.id)}>
                                  Disegno #{d.id}{d.notes ? ` — ${d.notes.slice(0, 40)}` : ""}
                                  {d.pdfOriginalName ? ` [PDF: ${d.pdfOriginalName.slice(0, 20)}]` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {selectedDrawingId && selectedDrawingId !== "none" && selectedDrawingData && (
                            <div className="text-xs space-y-0.5 p-2 bg-muted/50 rounded-md">
                              <p className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Disegno #{selectedDrawingData.id} collegato all'offerta
                              </p>
                              {selectedDrawingData.notes && <p className="text-muted-foreground">Note: {selectedDrawingData.notes.slice(0, 80)}</p>}
                              {selectedDrawingData.pdfOriginalName && (
                                <a href={`/drawings-files/${selectedDrawingData.pdfFilename}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                  <FileText className="w-3 h-3" /> {selectedDrawingData.pdfOriginalName}
                                </a>
                              )}
                              {selectedDrawingData.dwgOriginalName && (
                                <a href={`/drawings-files/${selectedDrawingData.dwgFilename}?download=1&name=${encodeURIComponent(selectedDrawingData.dwgOriginalName)}`} className="text-primary hover:underline flex items-center gap-1">
                                  <Package className="w-3 h-3" /> {selectedDrawingData.dwgOriginalName}
                                </a>
                              )}
                            </div>
                        )}
                      </div>
                      <div className="border-t pt-3 space-y-2">
                        <Label className="text-xs text-muted-foreground">Oppure allega file direttamente</Label>
                        <input ref={layoutFileRef} type="file" accept="application/pdf" className="hidden" onChange={handleLayoutDrawingUpload} data-testid="input-layout-drawing" />
                        <input ref={dwgFileRef} type="file" accept=".dwg" className="hidden" onChange={handleDwgUpload} data-testid="input-layout-dwg" />
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            {layoutDrawing ? (
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm flex-1">
                                <FileText className="w-4 h-4 text-red-500 shrink-0" />
                                <a href={`/api/layout-drawings/${layoutDrawing.filename}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex-1" data-testid="link-layout-drawing">{layoutDrawing.originalName}</a>
                                <Button variant="ghost" size="sm" type="button" className="h-6 w-6 p-0 text-destructive shrink-0" onClick={handleRemoveDrawing} data-testid="btn-remove-drawing"><X className="w-3.5 h-3.5" /></Button>
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
                                <a href={`/api/layout-drawings/${layoutDwg.filename}?download=1&name=${encodeURIComponent(layoutDwg.originalName)}`} className="text-primary hover:underline truncate flex-1" data-testid="link-layout-dwg">{layoutDwg.originalName}</a>
                                <Button variant="ghost" size="sm" type="button" className="h-6 w-6 p-0 text-destructive shrink-0" onClick={handleRemoveDwg} data-testid="btn-remove-dwg"><X className="w-3.5 h-3.5" /></Button>
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
                    </div>
                  )}
                </motion.div>
              )}

              {currentStepDef?.id === "subject" && isDealerEdit && (
                <motion.div key="subject" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <div className="flex items-center gap-2 border-b pb-2">
                    <h3 className="font-semibold text-lg">Project Data</h3>
                    <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" />Read-only</Badge>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4 grid md:grid-cols-2 gap-4">
                    <ReadOnlyField label="Subject / Title" value={offer?.subject} />
                    <ReadOnlyField label="Layout" value={pd.layout} />
                    {pd.family && <ReadOnlyField label="Product Family" value={pd.family.charAt(0).toUpperCase() + pd.family.slice(1)} />}
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "specs" && !isDealerEdit && (
                <motion.div key="specs" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <h3 className="font-semibold text-lg border-b pb-2">{currentStepDef.label}</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>{tsLbl("minMaxLength", "Min/Max. length of the pieces (mm)")}</Label><Input placeholder="e.g. 300-2500" value={technicalSpecs.minMaxLength} onChange={(e) => updateSpec("minMaxLength", e.target.value)} data-testid="input-min-max-length" /></div>
                    <div className="space-y-2"><Label>{tsLbl("maxWidth", "Max. width of the pieces (mm)")}</Label><Input placeholder="e.g. 1300" value={technicalSpecs.maxWidth} onChange={(e) => updateSpec("maxWidth", e.target.value)} data-testid="input-max-width" /></div>
                    <div className="space-y-2"><Label>{tsLbl("minMaxThickness", "Min/Max. thickness (mm)")}</Label><Input placeholder="e.g. 8-50" value={technicalSpecs.minMaxThickness} onChange={(e) => updateSpec("minMaxThickness", e.target.value)} data-testid="input-thickness" /></div>
                    <div className="space-y-2"><Label>{tsLbl("averageLineSpeed", "Average line speed (mt/min)")}</Label><Input placeholder="e.g. 5-15" value={technicalSpecs.averageLineSpeed} onChange={(e) => updateSpec("averageLineSpeed", e.target.value)} data-testid="input-line-speed" /></div>
                    <div className="space-y-2"><Label>{tsLbl("controlSide", "Control side")}</Label><Input placeholder="e.g. Right / Left" value={technicalSpecs.controlSide} onChange={(e) => updateSpec("controlSide", e.target.value)} data-testid="input-control-side" /></div>
                    <div className="space-y-2"><Label>{tsLbl("maxBow", "Max. bow of the panel")}</Label><Input value={technicalSpecs.maxBow} onChange={(e) => updateSpec("maxBow", e.target.value)} data-testid="input-max-bow" /></div>
                    <div className="space-y-2"><Label>{tsLbl("paint", "Paint")}</Label><Input value={technicalSpecs.paint} onChange={(e) => updateSpec("paint", e.target.value)} data-testid="input-paint" /></div>
                    <div className="space-y-2"><Label>{tsLbl("substrate", "Substrate")}</Label><Input value={technicalSpecs.substrate} onChange={(e) => updateSpec("substrate", e.target.value)} data-testid="input-substrate" /></div>
                    <div className="space-y-2"><Label>{tsLbl("finishing", "Finishing")}</Label><Input value={technicalSpecs.finishing} onChange={(e) => updateSpec("finishing", e.target.value)} data-testid="input-finishing" /></div>
                  </div>
                  <h3 className="font-semibold text-lg border-b pb-2 mt-8">Standard Specifications</h3>
                  <div className="space-y-4">
                    <div className="space-y-2"><Label>{tsLbl("standardVoltage", "Standard voltage")}</Label><Input value={technicalSpecs.standardVoltage} onChange={(e) => updateSpec("standardVoltage", e.target.value)} data-testid="input-voltage" /></div>
                    <div className="space-y-2"><Label>{tsLbl("standardColors", "Standard colors")}</Label><Input value={technicalSpecs.standardColors} onChange={(e) => updateSpec("standardColors", e.target.value)} data-testid="input-colors" /></div>
                    <div className="space-y-2"><Label>{tsLbl("components", "Components")}</Label><textarea className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md bg-background resize-vertical focus:outline-none focus:ring-2 focus:ring-ring" style={{ fieldSizing: "content" } as any} value={technicalSpecs.components} onChange={(e) => updateSpec("components", e.target.value)} data-testid="input-components" /></div>
                    <div className="space-y-2"><Label>{tsLbl("precautions", "Precautions")}</Label><textarea className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md bg-background resize-vertical focus:outline-none focus:ring-2 focus:ring-ring" style={{ fieldSizing: "content" } as any} value={technicalSpecs.precautions} onChange={(e) => updateSpec("precautions", e.target.value)} data-testid="input-precautions" /></div>
                    <div className="space-y-2"><Label>{tsLbl("commissioning", "Commissioning and start-up")}</Label><textarea className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md bg-background resize-vertical focus:outline-none focus:ring-2 focus:ring-ring" style={{ fieldSizing: "content" } as any} value={technicalSpecs.commissioning} onChange={(e) => updateSpec("commissioning", e.target.value)} data-testid="input-commissioning" /></div>
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "specs" && isDealerEdit && (
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

              {currentStepDef?.id === "composition" && !isDealerEdit && (
                <motion.div key="composition" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
                  <div className={cn(showAiPanel && isLargeScreen && isSalesman && "flex gap-4")}>
                    <div className={cn("space-y-8 min-w-0", showAiPanel && isLargeScreen && isSalesman && "flex-1")}>
                      <div className="space-y-4 p-4 bg-muted/30 rounded-xl border border-border/50">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-lg">Add Line Item</h3>
                          {isSalesman && isCreate && (
                            <Button variant="outline" size="sm" onClick={handleRecommendMachines} disabled={recommendMachines.isPending} data-testid="btn-ai-recommend">
                              {recommendMachines.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                              AI Suggest
                            </Button>
                          )}
                        </div>
                        {isSalesman && machines && (
                          <>
                            <Button onClick={handleAddMachine} disabled={!activeMachineId} className="w-full" data-testid="button-add-item-above">Add to Offer</Button>
                            <MachinePicker
                              machines={machines as any[]}
                              value={activeMachineId}
                              onChange={(id) => { setActiveMachineId(id); }}
                              onAddCustomMachine={handleAddCustomMachine}
                              contentLanguage={contentLanguage}
                            />
                            <Button onClick={handleAddMachine} disabled={!activeMachineId} className="w-full" data-testid="button-add-item-top">Add to Offer</Button>
                            {selectedMachine && (
                              <div className="rounded-lg border-2 border-green-500 p-3 space-y-1 bg-green-50 dark:bg-green-950/20" data-testid="selected-machine-info">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Selezionata</span>
                                  <span className="text-xs font-mono font-bold text-primary">{selectedMachine.machineCode || ""}</span>
                                </div>
                                <p className="text-sm font-semibold" data-testid="text-selected-machine-name">{selectedMachine.name}</p>
                                {selectedMachine.description && (
                                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2" data-testid="text-selected-machine-description">{selectedMachine.description}</p>
                                )}
                              </div>
                            )}
                            {selectedMachine && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-4">
                                <div className="flex items-center gap-4">
                                  <Label>Quantity</Label>
                                  <Input type="number" min="1" value={activeQuantity} onChange={(e) => setActiveQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="w-20" data-testid="input-quantity" />
                                  <span className="ml-auto font-bold text-[#000000] text-[18px]">Base: €{parseFloat(selectedMachine.basePrice as unknown as string).toLocaleString()}</span>
                                </div>
                                {selectedMachine.options?.length > 0 && (
                                  <div className="space-y-2">
                                    <Label>Options</Label>
                                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {[...selectedMachine.options].sort((a: any, b: any) => ((a as any).seqNum ?? 999999) - ((b as any).seqNum ?? 999999)).map((opt: any) => {
                                        const isChecked = activeOptions.includes(opt.id);
                                        return (
                                          <div key={opt.id} className="flex items-center gap-2 p-2 border rounded-md text-[#000000] bg-[#f5ebeb]">
                                            <Checkbox id={`opt-${opt.id}`} checked={isChecked} onCheckedChange={(checked) => {
                                              if (checked) { setActiveOptions([...activeOptions, opt.id]); setActiveOptionQuantities(q => ({ ...q, [opt.id]: 1 })); }
                                              else { setActiveOptions(activeOptions.filter(id => id !== opt.id)); setActiveOptionQuantities(q => { const n = { ...q }; delete n[opt.id]; return n; }); }
                                            }} />
                                            <label htmlFor={`opt-${opt.id}`} className="text-sm leading-tight cursor-pointer flex-1 min-w-0">
                                              <span className="font-medium">{opt.name}</span>
                                              <span className="block font-bold text-[14px] text-[#1b00ff]">+€{parseFloat(opt.priceModifier as unknown as string).toLocaleString()}</span>
                                            </label>
                                            {isChecked && (
                                              <Input type="number" min="1" value={activeOptionQuantities[opt.id] ?? 1} onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 1); setActiveOptionQuantities(q => ({ ...q, [opt.id]: v })); }} className="w-14 h-7 text-xs shrink-0" data-testid={`input-opt-qty-${opt.id}`} />
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </>
                        )}
                        {isDealer && isCreate && (
                          <p className="text-sm text-muted-foreground">Machine composition is pre-filled from the source offer. Edit prices in the pricing step.</p>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-lg">Current Items</h3>
                          <p className="text-xs text-muted-foreground">Drag items to reorder positions</p>
                        </div>
                        {cart.length === 0 ? (
                          <div className="h-32 flex items-center justify-center border-2 border-dashed border-muted-foreground/20 rounded-xl text-muted-foreground text-sm">No items added yet.</div>
                        ) : (
                          <DragDropContext onDragEnd={handleDragEnd}>
                            <Droppable droppableId="cart-items">
                              {(provided) => (
                                <div className="space-y-3" {...provided.droppableProps} ref={provided.innerRef}>
                                  {cart.map((item, index) => {
                                    const machine = isSalesman && machines ? (machines as any[]).find((m: any) => m.id === item.machineId) : null;
                                    const machineName = machine?.name ?? item.snapshotMachineName ?? `Machine #${item.machineId}`;
                                    const allOptions = isSalesman && machine ? [...(machine.options ?? [])].sort((a: any, b: any) => ((a as any).seqNum ?? 999999) - ((b as any).seqNum ?? 999999)) : [];
                                    const totalItemPrice = (item.basePrice + getItemOptionsTotal(item)) * item.quantity;
                                    return (
                                      <Draggable key={item.tempId} draggableId={item.tempId} index={index}>
                                        {(provided, snapshot) => (
                                          <div ref={provided.innerRef} {...provided.draggableProps} className={cn("p-4 bg-card border rounded-lg shadow-sm", snapshot.isDragging && "shadow-lg ring-2 ring-primary/20")}>
                                            <div className="flex items-center gap-2 mb-3">
                                              <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground shrink-0" data-testid={`drag-handle-${index}`}><GripVertical className="w-4 h-4" /></div>
                                              <span className="font-bold text-primary shrink-0">Pos. {index + 1}</span>
                                              <span className="font-medium flex-1 truncate">{machineName}</span>
                                              <div className="flex items-center gap-2 shrink-0">
                                                <Label className="text-xs text-muted-foreground">Qty</Label>
                                                <Input type="number" min="1" value={item.quantity} onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 1); setCart(prev => prev.map(c => c.tempId === item.tempId ? { ...c, quantity: v } : c)); }} className="w-16 h-7 text-sm" data-testid={`input-cart-qty-${index}`} />
                                                <span className="font-mono font-semibold text-sm">€{totalItemPrice.toLocaleString()}</span>
                                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleRemoveItem(item.tempId)} data-testid={`button-remove-item-${index}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                                              </div>
                                            </div>
                                            {isSalesman && allOptions.length > 0 && (() => {
                                              const isExpanded = showAllOptions.has(item.tempId);
                                              const visibleOptions = isExpanded ? allOptions : allOptions.filter((o: any) => item.selectedOptionIds.includes(o.id));
                                              const hiddenCount = allOptions.length - item.selectedOptionIds.length;
                                              return (
                                                <div className="ml-8 space-y-1.5">
                                                  {visibleOptions.length > 0 && (
                                                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                                      {visibleOptions.map((opt: any) => {
                                                        const isChecked = item.selectedOptionIds.includes(opt.id);
                                                        const qty = item.optionQuantities?.[opt.id] ?? 1;
                                                        return (
                                                          <div key={opt.id} className="flex items-center gap-2 px-2 py-1.5 rounded border border-transparent hover:border-border hover:bg-muted/30 transition-colors">
                                                            <Checkbox id={`cart-opt-${item.tempId}-${opt.id}`} checked={isChecked} onCheckedChange={(checked) => {
                                                              setCart(prev => prev.map(c => {
                                                                if (c.tempId !== item.tempId) return c;
                                                                const ids = checked ? [...c.selectedOptionIds, opt.id] : c.selectedOptionIds.filter(id => id !== opt.id);
                                                                const oq = { ...c.optionQuantities }; if (checked) oq[opt.id] = 1; else delete oq[opt.id];
                                                                return { ...c, selectedOptionIds: ids, optionQuantities: oq };
                                                              }));
                                                            }} data-testid={`checkbox-cart-opt-${index}-${opt.id}`} />
                                                            <label htmlFor={`cart-opt-${item.tempId}-${opt.id}`} className="text-xs leading-tight cursor-pointer flex-1 min-w-0">
                                                              <span className={isChecked ? "font-medium" : "text-muted-foreground"}>{opt.name}</span>
                                                              <span className="block text-muted-foreground">+€{parseFloat(opt.priceModifier as unknown as string).toLocaleString()}</span>
                                                            </label>
                                                            {isChecked && <Input type="number" min="1" value={qty} onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 1); setCart(prev => prev.map(c => c.tempId === item.tempId ? { ...c, optionQuantities: { ...c.optionQuantities, [opt.id]: v } } : c)); }} className="w-14 h-6 text-xs shrink-0" data-testid={`input-cart-opt-qty-${index}-${opt.id}`} />}
                                                          </div>
                                                        );
                                                      })}
                                                    </div>
                                                  )}
                                                  {hiddenCount > 0 && (
                                                    <button type="button" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowAllOptions(prev => { const next = new Set(prev); if (next.has(item.tempId)) next.delete(item.tempId); else next.add(item.tempId); return next; })} data-testid={`btn-toggle-options-${index}`}>
                                                      {isExpanded ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                      {isExpanded ? "Hide unselected options" : `Show ${hiddenCount} more option${hiddenCount !== 1 ? "s" : ""}`}
                                                    </button>
                                                  )}
                                                </div>
                                              );
                                            })()}
                                            {item.isCustom && (
                                              <div className="ml-8 space-y-2">
                                                {item.snapshotMachineDescription && (
                                                  <p className="text-xs text-muted-foreground italic">{item.snapshotMachineDescription}</p>
                                                )}
                                                <div className="flex items-center gap-2">
                                                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Prezzo Base €</Label>
                                                  <Input type="number" min="0" step="0.01" value={item.basePrice} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setCart(prev => prev.map(c => c.tempId === item.tempId ? { ...c, basePrice: v } : c)); }} className="w-28 h-7 text-xs font-mono" data-testid={`input-custom-base-price-${index}`} />
                                                </div>
                                                {item.selectedOptionIds.length > 0 && (
                                                  <div className="space-y-1.5">
                                                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Optional</Label>
                                                    {item.selectedOptionIds.map((optId) => (
                                                      <div key={optId} className="flex items-center gap-2 px-2 py-1 rounded border bg-muted/20">
                                                        <Input value={item.snapshotOptionNames?.[optId] ?? ""} onChange={(e) => { setCart(prev => prev.map(c => c.tempId === item.tempId ? { ...c, snapshotOptionNames: { ...c.snapshotOptionNames, [optId]: e.target.value } } : c)); }} className="h-6 text-xs flex-1" data-testid={`input-custom-opt-name-cart-${index}-${optId}`} />
                                                        <span className="text-[10px] text-muted-foreground shrink-0">Qty</span>
                                                        <Input type="number" min="1" value={item.optionQuantities?.[optId] ?? 1} onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 1); setCart(prev => prev.map(c => c.tempId === item.tempId ? { ...c, optionQuantities: { ...c.optionQuantities, [optId]: v } } : c)); }} className="w-14 h-6 text-xs font-mono shrink-0" data-testid={`input-custom-opt-qty-cart-${index}-${optId}`} />
                                                        <span className="text-xs text-muted-foreground shrink-0">€</span>
                                                        <Input type="number" min="0" step="0.01" value={item.optionPrices[optId] ?? 0} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setCart(prev => prev.map(c => c.tempId === item.tempId ? { ...c, optionPrices: { ...c.optionPrices, [optId]: v } } : c)); }} className="w-24 h-6 text-xs font-mono shrink-0" data-testid={`input-custom-opt-price-cart-${index}-${optId}`} />
                                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive shrink-0" onClick={() => { setCart(prev => prev.map(c => { if (c.tempId !== item.tempId) return c; const ids = c.selectedOptionIds.filter(id => id !== optId); const prices = { ...c.optionPrices }; delete prices[optId]; const names = { ...c.snapshotOptionNames }; delete names[optId]; const qtys = { ...c.optionQuantities }; delete qtys[optId]; return { ...c, selectedOptionIds: ids, optionPrices: prices, snapshotOptionNames: names, optionQuantities: qtys }; })); }} data-testid={`btn-remove-custom-opt-cart-${index}-${optId}`}>
                                                          <Trash2 className="w-3 h-3" />
                                                        </Button>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { const fakeId = -(Date.now()); setCart(prev => prev.map(c => { if (c.tempId !== item.tempId) return c; return { ...c, selectedOptionIds: [...c.selectedOptionIds, fakeId], optionPrices: { ...c.optionPrices, [fakeId]: 0 }, snapshotOptionNames: { ...c.snapshotOptionNames, [fakeId]: "" }, optionQuantities: { ...c.optionQuantities, [fakeId]: 1 } }; })); }} data-testid={`btn-add-custom-opt-cart-${index}`}>
                                                  <Plus className="w-3 h-3 mr-1" /> OPTIONAL NUOVO
                                                </Button>
                                              </div>
                                            )}
                                            {!item.isCustom && isDealer && item.selectedOptionIds.length > 0 && (
                                              <div className="ml-8 space-y-1">
                                                {item.selectedOptionIds.map(optId => {
                                                  const optName = item.snapshotOptionNames?.[optId] ?? `Option #${optId}`;
                                                  return (
                                                    <div key={optId} className="text-xs text-muted-foreground">+ {optName}</div>
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
                            <div className="border-t pt-4 flex justify-between items-center font-bold text-lg">
                              <span>Total</span>
                              <span>€{calcTotal().toLocaleString()}</span>
                            </div>
                          </DragDropContext>
                        )}
                      </div>
                    </div>
                    {isSalesman && showAiPanel && isLargeScreen && (
                      <div className="w-80 shrink-0 sticky top-0 self-start animate-in slide-in-from-right-5 duration-300">
                        <AIAssistantPanel
                          isLoading={aiLoading}
                          error={aiError}
                          run={aiRun}
                          output={aiOutput}
                          workflowType={aiWorkflowType}
                          onFeedback={handleAiFeedback}
                          onDismiss={() => setShowAiPanel(false)}
                          onRetry={aiRetry}
                          feedbackPending={submitFeedback.isPending}
                          title={aiTitle}
                          {...(aiPanelMode === "recommend" ? { onAddMachine: handleAddRecommendedMachine, onViewMachine: handleViewMachine, addedMachineIds: addedFromAi } : {})}
                          {...(aiPanelMode === "draft" ? { draftCallbacks } : {})}
                        />
                      </div>
                    )}
                  </div>
                  {isSalesman && !isLargeScreen && showAiPanel && (
                    <div className="mt-6 border rounded-xl bg-card" data-testid="ai-panel-inline-mobile">
                      <AIAssistantPanel
                        isLoading={aiLoading}
                        error={aiError}
                        run={aiRun}
                        output={aiOutput}
                        workflowType={aiWorkflowType}
                        onFeedback={handleAiFeedback}
                        onDismiss={() => setShowAiPanel(false)}
                        onRetry={aiRetry}
                        feedbackPending={submitFeedback.isPending}
                        title={aiTitle}
                        {...(aiPanelMode === "recommend" ? { onAddMachine: handleAddRecommendedMachine, onViewMachine: handleViewMachine, addedMachineIds: addedFromAi } : {})}
                        {...(aiPanelMode === "draft" ? { draftCallbacks } : {})}
                      />
                    </div>
                  )}
                </motion.div>
              )}

              {currentStepDef?.id === "pricing" && !isDealerEdit && (() => {
                // 5-column grid keeps Discount controls (override % + NET
                // toggle) on their own track so the per-line action icons
                // (comment, eye, trash, INCLUDED/EXCLUDED pill) never have
                // to share the same cell — that was the source of the
                // overlapping/squashed icons reported by the user.
                // Responsive grid:
                //  • mobile (<md): 2 columns. The first cell (Voce/label)
                //    spans both columns thanks to the [&>*:first-child]
                //    arbitrary variant, so each row reflows into 3 sub-rows:
                //      Row 1 → label (full width)
                //      Row 2 → dettaglio | totale
                //      Row 3 → sconto    | azioni
                //  • md+: original 5-column inline layout.
                const PO_COLS = "grid grid-cols-2 gap-x-2 gap-y-1.5 items-center md:grid-cols-[minmax(220px,1.5fr)_minmax(110px,160px)_minmax(90px,120px)_minmax(80px,96px)_minmax(120px,150px)] md:gap-x-3 md:gap-y-0 [&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1";
                const PO_CELL_TOTAL = "text-right font-mono text-sm tabular-nums tracking-tight";
                const PO_CELL_DISCOUNT = "flex items-center justify-end gap-1.5 flex-wrap";
                const PO_CELL_ACTIONS = "flex items-center justify-end gap-1.5 flex-wrap";
                return (
                  <motion.div key="pricing" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-2 gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg">{currentStepDef?.label ?? "Price Overview"}</h3>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setShowNetOnly(!showNetOnly)} className={cn("text-xs font-medium px-3 py-1 rounded-full border transition-colors", showNetOnly ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-foreground border-border")} data-testid="toggle-show-net-only">
                          {showNetOnly ? "Mostra solo prezzi netti: ON" : "Mostra solo prezzi netti"}
                        </button>
                        <button type="button" onClick={() => setShowDetailedPrices(!showDetailedPrices)} className={cn("text-xs font-medium px-3 py-1 rounded-full border transition-colors", showDetailedPrices ? "bg-muted text-foreground border-border" : "bg-primary/10 text-primary border-primary/30")} data-testid="toggle-detailed-prices">
                          {showDetailedPrices ? "Hide Individual Prices" : "Show Individual Prices"}
                        </button>
                      </div>
                    </div>
                    {/* Column header — hidden on mobile because rows wrap to
                        multiple sub-rows and labels are self-explanatory. */}
                    <div className={cn(PO_COLS, "hidden md:grid sticky top-0 z-10 bg-background py-2 px-3 border border-transparent border-b-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground")}>
                      <span>Voce</span>
                      <span className="text-right">Dettaglio</span>
                      <span className="text-right">Totale €</span>
                      <span className="text-right">Sconto</span>
                      <span className="text-right pr-1">Azioni</span>
                    </div>
                    {/* MACHINES */}
                    <div className="space-y-2">
                      {cart.map((item, index) => {
                        const machine = isSalesman && machines ? (machines as any[]).find((m: any) => m.id === item.machineId) : null;
                        const machineName = machine?.name ?? item.snapshotMachineName ?? `Machine #${item.machineId}`;
                        const itemTotal = (item.basePrice + getItemOptionsTotal(item)) * item.quantity;
                        const hiddenSum = getItemHiddenOptionsTotal(item);
                        const displayedUnit = getDisplayedUnitPrice(item);
                        const machineGrossLine = (item.basePrice + hiddenSum) * item.quantity;
                        const machineNetLine = applyLineDiscount(machineGrossLine, item.discountOverridePercent ?? null, item.isNet ?? false, discountPercent);
                        const visibleOptsNetSum = item.selectedOptionIds.reduce((sum, oid) => {
                          if (item.optionPriceHidden?.[oid]) return sum;
                          const subtotal = (item.optionPrices[oid] ?? 0) * (item.optionQuantities?.[oid] ?? 1) * item.quantity;
                          const od = item.optionDiscounts?.[oid];
                          return sum + applyLineDiscount(subtotal, od?.discountOverridePercent ?? null, od?.isNet ?? false, discountPercent);
                        }, 0);
                        const itemNetTotal = machineNetLine + visibleOptsNetSum;
                        const itemShownTotal = showNetOnly ? itemNetTotal : itemTotal;
                        const hiddenDetails = item.selectedOptionIds
                          .filter(id => item.optionPriceHidden?.[id])
                          .map(id => {
                            const optName = machine?.options?.find((o: any) => o.id === id)?.name ?? item.snapshotOptionNames?.[id] ?? `Option #${id}`;
                            const qty = item.optionQuantities?.[id] ?? 1;
                            const price = (item.optionPrices[id] ?? 0) * qty;
                            return { name: optName, price };
                          });
                        return (
                          <div key={item.tempId} className="border rounded-lg overflow-hidden">
                            {/* Machine header row */}
                            <div className={cn(PO_COLS, "px-3 py-2 bg-muted/30")}>
                              <span className="font-medium text-sm truncate">Pos. {index + 1}: {machineName} ×{item.quantity}</span>
                              {showDetailedPrices ? (
                                <div className="flex justify-end">
                                  <Input type="number" value={displayedUnit || ""} onChange={(e) => { const val = parseFloat(e.target.value) || 0; const newBase = val - hiddenSum; setCart(cart.map(ci => ci.tempId === item.tempId ? { ...ci, basePrice: newBase } : ci)); }} className="w-full max-w-[160px] h-7 text-xs font-mono text-right" data-testid={`input-machine-price-${index}`} title={hiddenSum > 0 ? `Include ${hiddenDetails.length} opzion${hiddenDetails.length === 1 ? "e" : "i"} nascost${hiddenDetails.length === 1 ? "a" : "e"}: ${hiddenDetails.map(h => `${h.name} (€${h.price.toLocaleString()})`).join(", ")}` : undefined} />
                                </div>
                              ) : <span />}
                              <span className={PO_CELL_TOTAL} data-testid={`text-line-total-machine-${index}`} title={showDetailedPrices ? "Prezzo della sola macchina base (senza optional). Il totale di posizione è mostrato nel Subtotal qui sotto." : undefined}>
                                €{(showDetailedPrices
                                  ? (showNetOnly ? machineNetLine : machineGrossLine)
                                  : itemShownTotal
                                ).toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                              </span>
                              <div className={PO_CELL_DISCOUNT}>
                                {item.isNet ? (
                                  <span className="w-12 h-6 inline-flex items-center justify-center text-[10px] font-mono text-muted-foreground border border-dashed rounded" data-testid={`input-discount-line-machine-${index}`} title="NETTO: nessuno sconto applicato">—</span>
                                ) : (
                                  <Input type="number" placeholder={`${discountPercent || 0}`} value={item.discountOverridePercent ?? ""} onChange={e => { const raw = e.target.value; const v = raw === "" ? null : Math.max(0, Math.min(100, parseFloat(raw) || 0)); setCart(cart.map(ci => ci.tempId === item.tempId ? { ...ci, discountOverridePercent: v } : ci)); }} className="w-12 h-6 text-[10px] font-mono text-right px-1" data-testid={`input-discount-line-machine-${index}`} title="Override sconto % (vuoto = globale)" />
                                )}
                                <button type="button" onClick={() => setCart(cart.map(ci => ci.tempId === item.tempId ? { ...ci, isNet: !ci.isNet } : ci))} className={cn("shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors", item.isNet ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" : "bg-muted/40 text-muted-foreground border-border hover:bg-muted")} data-testid={`toggle-net-line-machine-${index}`} title="NETTO: escluso da qualsiasi sconto">NET</button>
                              </div>
                              <div className={PO_CELL_ACTIONS}>
                                <CommentButton comment={item.comment} onChange={(v) => setCart(cart.map(ci => ci.tempId === item.tempId ? { ...ci, comment: v } : ci))} data-testid={`comment-machine-${index}`} />
                              </div>
                            </div>
                            {showDetailedPrices && hiddenSum > 0 && (
                              <div className="px-3 pb-1.5 pt-1 text-[10px] text-muted-foreground italic" data-testid={`text-hidden-options-hint-${index}`}>
                                include {hiddenDetails.length} opzion{hiddenDetails.length === 1 ? "e" : "i"} "Incl." (+€{hiddenSum.toLocaleString()}): {hiddenDetails.map(h => h.name).join(", ")}
                              </div>
                            )}
                            {showDetailedPrices && item.selectedOptionIds.map(optId => {
                              const opt = machine?.options?.find((o: any) => o.id === optId);
                              const optName = opt?.name ?? item.snapshotOptionNames?.[optId] ?? `Option #${optId}`;
                              if (!optName) return null;
                              const isHidden = !!item.optionPriceHidden?.[optId];
                              const toggleHidden = () => setCart(cart.map(ci => ci.tempId === item.tempId ? { ...ci, optionPriceHidden: { ...ci.optionPriceHidden, [optId]: !isHidden } } : ci));
                              const optQty = item.optionQuantities?.[optId] ?? 1;
                              const unitPrice = item.optionPrices[optId] ?? 0;
                              return (
                                <div key={optId} className={cn(PO_COLS, "px-3 py-1.5 border-t text-xs")}>
                                  <span className="text-muted-foreground pl-6 truncate">+ {optName}{optQty > 1 ? ` ×${optQty}` : ""}</span>
                                  <div className="flex justify-end">
                                    {isHidden ? <span className="text-xs text-muted-foreground font-mono italic">incl.</span> : (
                                      <Input type="number" value={item.optionPrices[optId] ?? ""} onChange={(e) => { const val = parseFloat(e.target.value) || 0; setCart(cart.map(ci => ci.tempId === item.tempId ? { ...ci, optionPrices: { ...ci.optionPrices, [optId]: val } } : ci)); }} className="w-full max-w-[160px] h-7 text-xs font-mono text-right" data-testid={`input-option-price-${index}-${optId}`} />
                                    )}
                                  </div>
                                  <span className="text-right font-mono text-xs text-muted-foreground tabular-nums" data-testid={`text-line-total-option-${index}-${optId}`}>{isHidden ? "—" : `€${((() => { const gross = unitPrice * optQty; if (!showNetOnly) return gross; const optDisc = item.optionDiscounts?.[optId] ?? { discountOverridePercent: null, isNet: false }; return applyLineDiscount(gross, optDisc.discountOverridePercent ?? null, optDisc.isNet ?? false, discountPercent); })()).toLocaleString("it-IT", { maximumFractionDigits: 2 })}`}</span>
                                  <div className={PO_CELL_DISCOUNT}>
                                    {!isHidden ? (() => {
                                      const optDisc = item.optionDiscounts?.[optId] ?? { discountOverridePercent: null, isNet: false };
                                      return <>
                                        {optDisc.isNet ? (
                                          <span className="w-11 h-6 inline-flex items-center justify-center text-[10px] font-mono text-muted-foreground border border-dashed rounded" data-testid={`input-discount-line-option-${index}-${optId}`} title="NETTO: nessuno sconto applicato">—</span>
                                        ) : (
                                          <Input type="number" placeholder={`${discountPercent ?? 0}`} value={optDisc.discountOverridePercent ?? ""} onChange={e => { const raw = e.target.value; const v = raw === "" ? null : Math.max(0, Math.min(100, parseFloat(raw) || 0)); setCart(cart.map(ci => ci.tempId === item.tempId ? { ...ci, optionDiscounts: { ...ci.optionDiscounts, [optId]: { ...optDisc, discountOverridePercent: v } } } : ci)); }} className="w-11 h-6 text-[10px] font-mono text-right px-1" data-testid={`input-discount-line-option-${index}-${optId}`} title="Override sconto opzione (vuoto = globale)" />
                                        )}
                                        <button type="button" onClick={() => setCart(cart.map(ci => ci.tempId === item.tempId ? { ...ci, optionDiscounts: { ...ci.optionDiscounts, [optId]: { ...optDisc, isNet: !optDisc.isNet } } } : ci))} className={cn("shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors", optDisc.isNet ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" : "bg-muted/40 text-muted-foreground border-border hover:bg-muted")} data-testid={`toggle-net-line-option-${index}-${optId}`} title="NETTO: escluso da qualsiasi sconto">NET</button>
                                      </>;
                                    })() : <span className="text-[10px] text-muted-foreground/60">—</span>}
                                  </div>
                                  <div className={PO_CELL_ACTIONS}>
                                    <CommentButton comment={item.optionComments[optId] ?? ""} onChange={(v) => setCart(cart.map(ci => ci.tempId === item.tempId ? { ...ci, optionComments: { ...ci.optionComments, [optId]: v } } : ci))} data-testid={`input-option-comment-${index}-${optId}`} />
                                    <button type="button" onClick={toggleHidden} className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" data-testid={`btn-toggle-option-price-${index}-${optId}`} title={isHidden ? "Mostra prezzo opzione" : "Nascondi prezzo opzione"}>
                                      {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            {showDetailedPrices && (
                              <div className={cn(PO_COLS, "px-3 py-1.5 border-t text-sm font-medium bg-muted/10")}>
                                <span className="text-muted-foreground text-right">Subtotal</span>
                                <span /><span className="text-right font-mono" data-testid={`text-line-subtotal-machine-${index}`}>€{itemShownTotal.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span><span /><span />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className={cn(PO_COLS, "px-3 py-1 border border-transparent font-medium text-sm pt-1")}>
                        <span>Machines Total</span>
                        <span />
                        <span className={PO_CELL_TOTAL} data-testid="text-machines-total">
                          €{(showNetOnly
                            ? cart.reduce((sum, item) => {
                                const hidden = getItemHiddenOptionsTotal(item);
                                const grossBase = (item.basePrice + hidden) * item.quantity;
                                const netBase = applyLineDiscount(grossBase, item.discountOverridePercent ?? null, item.isNet ?? false, discountPercent);
                                const netVisible = item.selectedOptionIds.reduce((s, oid) => {
                                  if (item.optionPriceHidden?.[oid]) return s;
                                  const sub = (item.optionPrices[oid] ?? 0) * (item.optionQuantities?.[oid] ?? 1) * item.quantity;
                                  const od = item.optionDiscounts?.[oid];
                                  return s + applyLineDiscount(sub, od?.discountOverridePercent ?? null, od?.isNet ?? false, discountPercent);
                                }, 0);
                                return sum + netBase + netVisible;
                              }, 0)
                            : calcMachinesTotal()
                          ).toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                        </span>
                        <span />
                        <span />
                      </div>
                    </div>
                    {/* INTERLOCKING */}
                    <div className={cn(PO_COLS, "border rounded-lg px-3 py-2 bg-muted/30")}>
                      <Input value={priceLabels.interlocking} onChange={e => setPriceLabels(prev => ({ ...prev, interlocking: e.target.value }))} className="h-7 text-sm font-medium" data-testid="label-interlocking" />
                      <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                        <span className="shrink-0">{cart.length} pos. ×</span>
                        <span>€</span>
                        <Input type="number" value={interlockingPricePerPosition || ""} onChange={e => setInterlockingPricePerPosition(parseFloat(e.target.value) || 0)} className="w-20 h-7 text-xs font-mono text-right" data-testid="input-interlocking-price" />
                      </div>
                      <span className={PO_CELL_TOTAL} data-testid="text-line-total-interlocking">€{(showNetOnly ? applyLineDiscount(calcInterlocking(), null, false, discountPercent) : calcInterlocking()).toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span>
                      <span />
                      <div className={PO_CELL_ACTIONS}>
                        <CommentButton comment={priceComments.interlocking} onChange={v => setPriceComments(prev => ({ ...prev, interlocking: v }))} data-testid="comment-interlocking" />
                      </div>
                    </div>
                    {/* EXTRAS */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <h4 className="font-medium text-sm text-muted-foreground">Extra Items</h4>
                        <Button size="sm" variant="outline" onClick={addExtraItem} data-testid="button-add-extra"><Plus className="w-3 h-3 mr-1" /> Add Extra</Button>
                      </div>
                      {extraItems.map((extra, idx) => (
                        <div key={extra.id} className={cn(PO_COLS, "border rounded-lg px-3 py-2")}>
                          <Input placeholder="Description" value={extra.description} onChange={e => updateExtraItem(extra.id, "description", e.target.value)} className="h-7 text-sm" data-testid={`input-extra-desc-${idx}`} />
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-muted-foreground">€</span>
                            <Input type="number" placeholder="0" value={extra.price || ""} onChange={e => updateExtraItem(extra.id, "price", parseFloat(e.target.value) || 0)} className="w-full max-w-[140px] h-7 text-xs font-mono text-right" data-testid={`input-extra-price-${idx}`} />
                          </div>
                          <span className={PO_CELL_TOTAL} data-testid={`text-line-total-extra-${idx}`}>€{(showNetOnly ? applyLineDiscount(extra.price || 0, extra.discountOverridePercent ?? null, extra.isNet ?? false, discountPercent) : (extra.price || 0)).toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span>
                          <div className={PO_CELL_DISCOUNT}>
                            {extra.isNet ? (
                              <span className="w-12 h-6 inline-flex items-center justify-center text-[10px] font-mono text-muted-foreground border border-dashed rounded" data-testid={`input-discount-line-extra-${idx}`} title="NETTO: nessuno sconto applicato">—</span>
                            ) : (
                              <Input type="number" placeholder={`${discountPercent || 0}`} value={extra.discountOverridePercent ?? ""} onChange={e => { const raw = e.target.value; const v = raw === "" ? null : Math.max(0, Math.min(100, parseFloat(raw) || 0)); updateExtraDiscount(extra.id, { discountOverridePercent: v }); }} className="w-12 h-6 text-[10px] font-mono text-right px-1" data-testid={`input-discount-line-extra-${idx}`} title="Override sconto % (vuoto = globale)" />
                            )}
                            <button type="button" onClick={() => updateExtraDiscount(extra.id, { isNet: !extra.isNet })} className={cn("shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors", extra.isNet ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" : "bg-muted/40 text-muted-foreground border-border hover:bg-muted")} data-testid={`toggle-net-line-extra-${idx}`} title="NETTO: escluso da qualsiasi sconto">NET</button>
                          </div>
                          <div className={PO_CELL_ACTIONS}>
                            <CommentButton comment={priceComments.extras[extra.id] || ""} onChange={v => setPriceComments(prev => ({ ...prev, extras: { ...prev.extras, [extra.id]: v } }))} data-testid={`comment-extra-${idx}`} />
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeExtraItem(extra.id)} data-testid={`button-remove-extra-${idx}`}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                          </div>
                        </div>
                      ))}
                      {extraItems.length > 0 && (
                        <div className={cn(PO_COLS, "px-3 py-1 border border-transparent font-medium text-sm pt-1")}>
                          <span>Extras Total</span>
                          <span />
                          <span className={PO_CELL_TOTAL} data-testid="text-extras-total">
                            €{(showNetOnly
                              ? extraItems.reduce((sum, e) => sum + applyLineDiscount(e.price || 0, e.discountOverridePercent ?? null, e.isNet ?? false, discountPercent), 0)
                              : calcExtrasTotal()
                            ).toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                          </span>
                          <span />
                          <span />
                        </div>
                      )}
                    </div>
                    {/* TOTAL LIST / NET PRICE
                        In gross mode the box shows the (editable) "TOTAL LIST
                        PRICE (ex works, installation excluded)" label and the
                        gross list total. When the user enables "Mostra solo
                        prezzi netti" the same box stays visible but flips to
                        a non-editable "TOTAL NET PRICES (ex works, installation
                        excluded)" caption and shows the net list total
                        (list price minus the global discount). */}
                    <div className={cn(PO_COLS, "border-2 border-primary/30 rounded-lg px-3 py-2 bg-primary/5")}>
                      {showNetOnly ? (
                        <span className="h-7 inline-flex items-center text-sm font-bold uppercase tracking-wide" data-testid="label-total-net-price">
                          TOTAL NET PRICES (ex works, installation excluded)
                        </span>
                      ) : (
                        <Input value={priceLabels.totalListPrice} onChange={e => setPriceLabels(prev => ({ ...prev, totalListPrice: e.target.value }))} className="h-7 text-sm font-bold" data-testid="label-total-list-price" />
                      )}
                      <span />
                      <span className="text-right font-mono font-bold" data-testid={showNetOnly ? "text-total-net-price" : "text-total-list-price"}>
                        €{(showNetOnly ? Math.max(0, calcTotalListPrice() - calcDiscount()) : calcTotalListPrice()).toLocaleString()}
                      </span>
                      <span /><span />
                    </div>
                    {/* DISCOUNT (sempre visibile per modificare la % globale; nascosto in showNetOnly) */}
                    {!showNetOnly && (
                      <div className={cn(PO_COLS, "border rounded-lg px-3 py-2 bg-muted/30")}>
                        <span className="font-medium text-sm">Discount (%)</span>
                        <div className="flex items-center justify-end gap-1">
                          <Input type="number" min="0" max="100" value={discountPercent || ""} onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)} className="w-20 h-7 text-xs font-mono text-right" data-testid="input-discount" />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                        <span className={cn(PO_CELL_TOTAL, calcDiscount() > 0 && "text-destructive")}>{calcDiscount() > 0 ? `-€${calcDiscount().toLocaleString()}` : "—"}</span>
                        <span /><span />
                      </div>
                    )}
                    {/* SERVICES */}
                    <h4 className="font-medium text-sm text-muted-foreground pt-2">Services</h4>
                    <div className="border rounded-lg divide-y">
                      {/* Installation */}
                      <div>
                        <div className={cn(PO_COLS, "px-3 py-2")}>
                          <Input value={priceLabels.installation} onChange={(e) => setPriceLabels(prev => ({ ...prev, installation: e.target.value }))} className="h-7 text-sm font-medium" data-testid="label-installation" />
                          <span className="text-right text-xs text-muted-foreground">€{(installationConfig.dailyFee || 0).toLocaleString()}/g × {installationConfig.totalDays}g</span>
                          <span className={PO_CELL_TOTAL}>€{(installationConfig.totalPrice || 0).toLocaleString()}</span>
                          <span />
                          <div className={PO_CELL_ACTIONS}>
                            <CommentButton comment={priceComments.installation} onChange={(v) => setPriceComments(prev => ({ ...prev, installation: v }))} data-testid="comment-installation" />
                            <button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, included: !prev.included }))} className={cn("shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors", installationConfig.included ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-installation-included">{installationConfig.included ? "INCLUDED" : "EXCLUDED"}</button>
                          </div>
                        </div>
                        <div className="px-3 pb-3 pt-1 bg-muted/20 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center justify-between"><span className="text-[10px] text-muted-foreground">Daily fee</span><button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, hideDailyFee: !prev.hideDailyFee }))} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="toggle-hide-daily-fee">{installationConfig.hideDailyFee ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button></div>
                              <div className="flex items-center gap-1"><Input type="number" value={installationConfig.dailyFee || ""} onChange={(e) => { const dailyFee = parseFloat(e.target.value) || 0; setInstallationConfig(prev => { const td = prev.travelDays + prev.mechanicalDays + prev.electricalDays + prev.testingDays + prev.installTrainingDays; return { ...prev, dailyFee, totalDays: td }; }); }} className="flex-1 h-7 text-xs font-mono" data-testid="input-installation-daily-fee" /><span className="text-[10px] text-muted-foreground shrink-0">€/day</span></div>
                            </div>
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center justify-between"><span className="text-[10px] text-muted-foreground">Total days</span><button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, hideTotalDays: !prev.hideTotalDays }))} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="toggle-hide-installation-days">{installationConfig.hideTotalDays ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button></div>
                              <div className="flex items-center gap-1"><Input type="number" value={installationConfig.totalDays || ""} readOnly className="flex-1 h-7 text-xs font-mono bg-muted/50" data-testid="input-installation-days" /><span className="text-[10px] text-muted-foreground shrink-0">days</span></div>
                            </div>
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center justify-between"><span className="text-[10px] text-muted-foreground">Total</span><button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, hideTotalPrice: !prev.hideTotalPrice }))} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="toggle-hide-installation-total">{installationConfig.hideTotalPrice ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button></div>
                              <div className="flex items-center gap-1"><span className="text-[10px] text-muted-foreground shrink-0">€</span><Input type="number" value={installationConfig.totalPrice || ""} readOnly className="flex-1 h-7 text-xs font-mono bg-muted/50" data-testid="input-installation-total" /></div>
                            </div>
                          </div>
                          <div className="grid grid-cols-5 gap-2">
                            {([
                              { key: "travelDays" as const, label: "Travel", hideKey: "hideBreakdownTravel" as const },
                              { key: "mechanicalDays" as const, label: "Mech. assembly", hideKey: "hideBreakdownMechanical" as const },
                              { key: "electricalDays" as const, label: "Elec. assembly", hideKey: "hideBreakdownElectrical" as const },
                              { key: "testingDays" as const, label: "Testing", hideKey: "hideBreakdownTesting" as const },
                              { key: "installTrainingDays" as const, label: "Training", hideKey: "hideBreakdownTraining" as const },
                            ] as const).map(({ key, label, hideKey }) => (
                              <div key={key} className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-muted-foreground leading-tight block">{label}</span>
                                  <button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, [hideKey]: !prev[hideKey] }))} className="text-muted-foreground hover:text-foreground transition-colors" data-testid={`toggle-hide-breakdown-${key}`}>{installationConfig[hideKey] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}</button>
                                </div>
                                <Input type="number" min="0" value={installationConfig[key] || ""} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setInstallationConfig(prev => { const updated = { ...prev, [key]: v }; const td = updated.travelDays + updated.mechanicalDays + updated.electricalDays + updated.testingDays + updated.installTrainingDays; return { ...updated, totalDays: td }; }); }} className="h-7 text-xs font-mono" data-testid={`input-installation-${key}`} />
                              </div>
                            ))}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground text-right">
                            Mech + Elec + Test + Train = {(installationConfig.mechanicalDays + installationConfig.electricalDays + installationConfig.testingDays + installationConfig.installTrainingDays)} days
                          </div>
                        </div>
                      </div>

                      {/* Travel */}
                      {(() => {
                        const rentalDailyFee = serviceItems.travelCostsDailyFee || 0;
                        const rentalDays = serviceItems.travelCostsDays || 0;
                        const rentalTotal = rentalDailyFee * rentalDays;
                        const flightTicket = serviceItems.travelFlightTicket || 0;
                        const travelTotal = rentalTotal + flightTicket;
                        return (
                          <div>
                            <div className={cn(PO_COLS, "px-3 py-2")}>
                              <Input value={priceLabels.travelCosts} onChange={e => setPriceLabels(prev => ({ ...prev, travelCosts: e.target.value }))} className="h-7 text-sm" data-testid="label-travel" />
                              <span className="text-right text-xs text-muted-foreground">{rentalTotal > 0 || flightTicket > 0 ? `${rentalDays}g + flight` : "—"}</span>
                              <span className={PO_CELL_TOTAL}>€{travelTotal.toLocaleString()}</span>
                              <span />
                              <div className={PO_CELL_ACTIONS}>
                                <CommentButton comment={priceComments.travel} onChange={v => setPriceComments(prev => ({ ...prev, travel: v }))} data-testid="comment-travel" />
                                <button type="button" onClick={() => setServiceItems({ ...serviceItems, travelCosts: !serviceItems.travelCosts })} className={cn("shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors", serviceItems.travelCosts ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-travel">{serviceItems.travelCosts ? "INCLUDED" : "EXCLUDED"}</button>
                              </div>
                            </div>
                            <div className="px-3 pb-3 pt-1 bg-muted/20 space-y-1">
                              <div className="flex items-center gap-x-1 gap-y-1 flex-wrap">
                                <span className="text-[10px] text-muted-foreground shrink-0 w-20">Rental car</span>
                                <Input type="number" min="0" value={rentalDailyFee || ""} onChange={e => setServiceItems({ ...serviceItems, travelCostsDailyFee: parseFloat(e.target.value) || 0 })} className="w-20 h-7 text-xs font-mono" data-testid="input-travel-daily-fee" />
                                <span className="text-[10px] text-muted-foreground shrink-0">€/day ×</span>
                                <Input type="number" min="0" value={rentalDays || ""} onChange={e => setServiceItems({ ...serviceItems, travelCostsDays: parseFloat(e.target.value) || 0 })} className="w-16 h-7 text-xs font-mono" data-testid="input-travel-days" />
                                <span className="text-[10px] text-muted-foreground shrink-0">days = €{rentalTotal.toLocaleString()}</span>
                              </div>
                              <div className="flex items-center gap-x-1 gap-y-1 flex-wrap">
                                <span className="text-[10px] text-muted-foreground shrink-0 w-20">Flight ticket</span>
                                <Input type="number" min="0" value={flightTicket || ""} onChange={e => setServiceItems({ ...serviceItems, travelFlightTicket: parseFloat(e.target.value) || 0 })} className="w-20 h-7 text-xs font-mono" data-testid="input-travel-flight-ticket" />
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Board & Lodging */}
                      <div className={cn(PO_COLS, "px-3 py-2")}>
                        <Input value={priceLabels.boardLodging} onChange={e => setPriceLabels(prev => ({ ...prev, boardLodging: e.target.value }))} className="h-7 text-sm" data-testid="label-board" />
                        <span />
                        <span className={cn(PO_CELL_TOTAL, "text-muted-foreground")}>—</span>
                        <span />
                        <div className={PO_CELL_ACTIONS}>
                          <CommentButton comment={priceComments.boardLodging} onChange={v => setPriceComments(prev => ({ ...prev, boardLodging: v }))} data-testid="comment-board" />
                          <button type="button" onClick={() => setServiceItems({ ...serviceItems, boardLodging: !serviceItems.boardLodging })} className={cn("shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors", serviceItems.boardLodging ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-board">{serviceItems.boardLodging ? "INCLUDED" : "EXCLUDED"}</button>
                        </div>
                      </div>

                      {/* Training */}
                      <div className={cn(PO_COLS, "px-3 py-2")}>
                        <Input value={priceLabels.training} onChange={e => setPriceLabels(prev => ({ ...prev, training: e.target.value }))} className="h-7 text-sm" data-testid="label-training" />
                        <div className="flex items-center justify-end gap-1">
                          <Input value={installationConfig.installTrainingDays || ""} readOnly className="w-14 h-7 text-xs font-mono text-right bg-muted/50" data-testid="input-training-days" />
                          <span className="text-[10px] text-muted-foreground">days</span>
                        </div>
                        <span className={cn(PO_CELL_TOTAL, "text-muted-foreground italic")}>incl.</span>
                        <span />
                        <div className={PO_CELL_ACTIONS}>
                          <CommentButton comment={priceComments.training} onChange={v => setPriceComments(prev => ({ ...prev, training: v }))} data-testid="comment-training" />
                          <button type="button" onClick={() => setServiceItems({ ...serviceItems, trainingIncluded: !serviceItems.trainingIncluded })} className={cn("shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors", serviceItems.trainingIncluded ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-training">{serviceItems.trainingIncluded ? "INCLUDED" : "EXCLUDED"}</button>
                        </div>
                      </div>

                      {/* Packaging */}
                      <div className={cn(PO_COLS, "px-3 py-2")}>
                        <Input value={priceLabels.packaging} onChange={e => setPriceLabels(prev => ({ ...prev, packaging: e.target.value }))} className="h-7 text-sm" data-testid="label-packaging" />
                        <span />
                        <span className={cn(PO_CELL_TOTAL, "text-muted-foreground")}>—</span>
                        <span />
                        <div className={PO_CELL_ACTIONS}>
                          <CommentButton comment={priceComments.packaging} onChange={v => setPriceComments(prev => ({ ...prev, packaging: v }))} data-testid="comment-packaging" />
                          <button type="button" onClick={() => setServiceItems({ ...serviceItems, packaging: !serviceItems.packaging })} className={cn("shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors", serviceItems.packaging ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-packaging">{serviceItems.packaging ? "INCLUDED" : "EXCLUDED"}</button>
                        </div>
                      </div>

                      {/* Transport */}
                      {(() => {
                        // Transport can be flagged INCLUDED only when a price
                        // has been entered. If the price is 0/empty, force the
                        // toggle to EXCLUDED and disable it.
                        const transportPrice = serviceItems.transportPrice || 0;
                        const canIncludeTransport = transportPrice > 0;
                        const transportEffectivelyIncluded = serviceItems.transportIncluded && canIncludeTransport;
                        return (
                          <div className={cn(PO_COLS, "px-3 py-2")}>
                            <Input value={priceLabels.transport} onChange={e => setPriceLabels(prev => ({ ...prev, transport: e.target.value }))} className="h-7 text-sm" data-testid="label-transport" />
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-[10px] text-muted-foreground">€</span>
                              <Input type="number" value={serviceItems.transportPrice || ""} onChange={e => {
                                const newPrice = parseFloat(e.target.value) || 0;
                                setServiceItems({
                                  ...serviceItems,
                                  transportPrice: newPrice,
                                  // auto-clear the included flag if the price is wiped
                                  transportIncluded: newPrice > 0 ? serviceItems.transportIncluded : false,
                                });
                              }} className="w-24 h-7 text-xs font-mono text-right" data-testid="input-transport-price" />
                            </div>
                            <span className={PO_CELL_TOTAL}>€{transportPrice.toLocaleString()}</span>
                            <span />
                            <div className={PO_CELL_ACTIONS}>
                              <CommentButton comment={priceComments.transport} onChange={v => setPriceComments(prev => ({ ...prev, transport: v }))} data-testid="comment-transport" />
                              <button
                                type="button"
                                onClick={() => { if (canIncludeTransport) setServiceItems({ ...serviceItems, transportIncluded: !serviceItems.transportIncluded }); }}
                                disabled={!canIncludeTransport}
                                title={canIncludeTransport ? undefined : "Inserisci un prezzo trasporto per poterlo marcare come INCLUDED"}
                                className={cn("shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors", transportEffectivelyIncluded ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700", !canIncludeTransport && "opacity-50 cursor-not-allowed")}
                                data-testid="toggle-transport"
                              >{transportEffectivelyIncluded ? "INCLUDED" : "EXCLUDED"}</button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className={cn(PO_COLS, "px-1 font-medium text-sm pt-1")}>
                      <span>Services Total</span><span /><span className={PO_CELL_TOTAL}>€{calcServicesTotal().toLocaleString()}</span><span /><span />
                    </div>
                    {/* TOTALS */}
                    <div className="border-t-2 pt-3 space-y-2">
                      {!showNetOnly && (
                        <div className={cn(PO_COLS, "text-base")}>
                          <Input value={priceLabels.grossTotal} onChange={e => setPriceLabels(prev => ({ ...prev, grossTotal: e.target.value }))} className="h-7 font-medium" data-testid="label-gross-total" />
                          <span /><span className="text-right font-mono font-bold">€{calcGrossTotal().toLocaleString()}</span><span /><span />
                        </div>
                      )}
                      {(showNetOnly || calcDiscount() > 0) && (
                        <div className={cn(PO_COLS, "text-base text-primary")}>
                          <Input value={priceLabels.netTotal} onChange={e => setPriceLabels(prev => ({ ...prev, netTotal: e.target.value }))} className="h-7 font-medium" data-testid="label-net-total" />
                          <span /><span className="text-right font-mono font-bold">€{calcNetTotal().toLocaleString()}</span><span /><span />
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })()}

              {currentStepDef?.id === "pricing" && isDealerEdit && offer && (
                <motion.div key="pricing" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="font-semibold text-lg">Price Overview</h3>
                    <button type="button" onClick={() => setShowDetailedPrices(!showDetailedPrices)} className={cn("text-xs font-medium px-3 py-1 rounded-full border transition-colors", showDetailedPrices ? "bg-muted text-foreground border-border" : "bg-primary/10 text-primary border-primary/30")} data-testid="toggle-detailed-prices">{showDetailedPrices ? "Hide Individual Prices" : "Show Individual Prices"}</button>
                  </div>
                  <div className="space-y-2">
                    {showDetailedPrices && (
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-1 mb-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item</span>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28 text-right">Unit Price €</span>
                        <span className="w-6" /><span className="w-7" />
                      </div>
                    )}
                    {offer.items.map((item: any, index: number) => {
                      const base = dealerBasePrices[item.id] ?? parseFloat(item.snapshotBasePrice) ?? 0;
                      const visibleOptTotal = (item.options ?? []).reduce((oa: number, opt: any) => {
                        if (dealerOptionPriceHidden[opt.id]) return oa;
                        return oa + (dealerOptionPrices[opt.id] ?? parseFloat(opt.snapshotPriceModifier) ?? 0) * (opt.quantity || 1);
                      }, 0);
                      const hiddenOptTotal = (item.options ?? []).reduce((oa: number, opt: any) => {
                        if (!dealerOptionPriceHidden[opt.id]) return oa;
                        return oa + (dealerOptionPrices[opt.id] ?? parseFloat(opt.snapshotPriceModifier) ?? 0) * (opt.quantity || 1);
                      }, 0);
                      const itemTotal = (base + visibleOptTotal + hiddenOptTotal) * item.quantity;
                      const displayedUnit = base + hiddenOptTotal;
                      const hiddenDetails = (item.options ?? [])
                        .filter((opt: any) => dealerOptionPriceHidden[opt.id])
                        .map((opt: any) => ({
                          name: opt.snapshotOptionName,
                          price: (dealerOptionPrices[opt.id] ?? parseFloat(opt.snapshotPriceModifier) ?? 0) * (opt.quantity || 1),
                        }));
                      return (
                        <div key={item.id} className="border rounded-lg p-3 space-y-1.5">
                          <div className={cn("items-center", showDetailedPrices ? "grid grid-cols-[1fr_auto_auto_auto] gap-x-2" : "flex justify-between")}>
                            <span className="font-medium text-sm">Pos. {index + 1}: {item.snapshotMachineName} ×{item.quantity}</span>
                            {showDetailedPrices ? (
                              <>
                                <div className="flex items-center gap-1 shrink-0"><Input type="number" value={displayedUnit || ""} onChange={e => { const val = parseFloat(e.target.value) || 0; setDealerBasePrices(prev => ({ ...prev, [item.id]: val - hiddenOptTotal })); }} className="w-28 h-7 text-xs font-mono text-right" data-testid={`input-machine-price-${index}`} title={hiddenOptTotal > 0 ? `Include ${hiddenDetails.length} opzion${hiddenDetails.length === 1 ? "e" : "i"} nascost${hiddenDetails.length === 1 ? "a" : "e"}: ${hiddenDetails.map((h: any) => `${h.name} (€${h.price.toLocaleString()})`).join(", ")}` : undefined} /></div>
                                <CommentButton comment={dealerItemComments[item.id] ?? ""} onChange={v => setDealerItemComments(prev => ({ ...prev, [item.id]: v }))} data-testid={`comment-machine-${index}`} />
                                <span className="w-7" />
                              </>
                            ) : (
                              <CommentButton comment={dealerItemComments[item.id] ?? ""} onChange={v => setDealerItemComments(prev => ({ ...prev, [item.id]: v }))} data-testid={`comment-machine-${index}`} />
                            )}
                          </div>
                          {showDetailedPrices && hiddenOptTotal > 0 && (
                            <div className="text-[10px] text-muted-foreground italic pl-1" data-testid={`text-hidden-options-hint-${index}`}>
                              include {hiddenDetails.length} opzion{hiddenDetails.length === 1 ? "e" : "i"} "Incl." (+€{hiddenOptTotal.toLocaleString()}): {hiddenDetails.map((h: any) => h.name).join(", ")}
                            </div>
                          )}
                          {showDetailedPrices && (item.options ?? []).map((opt: any) => {
                            const isHidden = !!dealerOptionPriceHidden[opt.id];
                            return (
                              <div key={opt.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center pl-4">
                                <span className="text-xs text-muted-foreground">+ {opt.snapshotOptionName}{opt.quantity > 1 ? ` ×${opt.quantity}` : ""}</span>
                                <div className="flex items-center gap-1 shrink-0 w-28 justify-end">
                                  {isHidden ? <span className="text-xs text-muted-foreground font-mono italic">incl.</span> : (
                                    <Input type="number" value={dealerOptionPrices[opt.id] ?? ""} onChange={e => setDealerOptionPrices(prev => ({ ...prev, [opt.id]: parseFloat(e.target.value) || 0 }))} className="w-28 h-7 text-xs font-mono text-right" data-testid={`input-option-price-${index}-${opt.id}`} />
                                  )}
                                </div>
                                <CommentButton comment={dealerOptionComments[opt.id] ?? ""} onChange={v => setDealerOptionComments(prev => ({ ...prev, [opt.id]: v }))} data-testid={`input-option-comment-${index}-${opt.id}`} />
                                <button type="button" onClick={() => setDealerOptionPriceHidden(prev => ({ ...prev, [opt.id]: !isHidden }))} className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" data-testid={`btn-toggle-option-price-${index}-${opt.id}`}>
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
                      <span className="font-mono">€{dealerCalcMachinesTotal().toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="border rounded-lg p-3 bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Input value={priceLabels.interlocking} onChange={e => setPriceLabels(prev => ({ ...prev, interlocking: e.target.value }))} className="h-7 text-sm font-medium w-40 shrink-0" data-testid="label-interlocking" />
                      <span className="text-xs text-muted-foreground shrink-0">({offer.items.length} pos. ×</span>
                      <div className="flex items-center gap-1"><span className="text-sm">€</span><Input type="number" value={interlockingPricePerPosition || ""} onChange={e => setInterlockingPricePerPosition(parseFloat(e.target.value) || 0)} className="w-20 h-7 text-xs font-mono" data-testid="input-interlocking-price" /><span className="text-xs text-muted-foreground">)</span></div>
                      <span className="font-mono font-medium ml-auto">€{dealerCalcInterlocking().toLocaleString()}</span>
                      <CommentButton comment={priceComments.interlocking} onChange={v => setPriceComments(prev => ({ ...prev, interlocking: v }))} data-testid="comment-interlocking" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center"><h4 className="font-medium text-sm text-muted-foreground">Extra Items</h4><Button size="sm" variant="outline" onClick={addExtraItem} data-testid="button-add-extra"><Plus className="w-3 h-3 mr-1" /> Add Extra</Button></div>
                    {extraItems.map((extra, idx) => (
                      <div key={extra.id} className="flex gap-3 items-center">
                        <Input placeholder="Description" value={extra.description} onChange={e => updateExtraItem(extra.id, "description", e.target.value)} className="flex-1" data-testid={`input-extra-desc-${idx}`} />
                        <div className="flex items-center gap-1"><span>€</span><Input type="number" placeholder="0" value={extra.price || ""} onChange={e => updateExtraItem(extra.id, "price", parseFloat(e.target.value) || 0)} className="w-28" data-testid={`input-extra-price-${idx}`} /></div>
                        <CommentButton comment={priceComments.extras[extra.id] || ""} onChange={v => setPriceComments(prev => ({ ...prev, extras: { ...prev.extras, [extra.id]: v } }))} data-testid={`comment-extra-${idx}`} />
                        <Button size="icon" variant="ghost" onClick={() => removeExtraItem(extra.id)} data-testid={`button-remove-extra-${idx}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    ))}
                    {extraItems.length > 0 && <div className="flex justify-between items-center font-medium pt-2"><span>Extras Total</span><span className="font-mono">€{calcExtrasTotal().toLocaleString()}</span></div>}
                  </div>
                  <div className="border-2 border-primary/30 rounded-lg p-3 bg-primary/5">
                    <div className="flex items-center gap-3"><Input value={priceLabels.totalListPrice} onChange={e => setPriceLabels(prev => ({ ...prev, totalListPrice: e.target.value }))} className="h-7 text-sm font-bold flex-1" data-testid="label-total-list-price" /><span className="font-mono font-bold shrink-0">€{dealerCalcTotalListPrice().toLocaleString()}</span></div>
                  </div>
                  <div className="border rounded-lg p-3 bg-muted/30">
                    <div className="flex justify-between items-center gap-4"><span className="font-medium">Discount (%)</span><div className="flex items-center gap-2"><Input type="number" min="0" max="100" value={discountPercent || ""} onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)} className="w-24" data-testid="input-discount" /><span className="text-muted-foreground">%</span></div></div>
                    {discountPercent > 0 && <div className="flex justify-between items-center text-sm mt-2 text-destructive"><span>Discount Amount</span><span className="font-mono">-€{dealerCalcDiscount().toLocaleString()}</span></div>}
                  </div>
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground">Services</h4>
                    <div className="border rounded-lg p-3 space-y-3">
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Input value={priceLabels.installation} onChange={e => setPriceLabels(prev => ({ ...prev, installation: e.target.value }))} className="text-sm font-medium w-full" data-testid="label-installation" />
                          <div className="flex items-center justify-end gap-2">
                            <CommentButton comment={priceComments.installation} onChange={v => setPriceComments(prev => ({ ...prev, installation: v }))} data-testid="comment-installation" />
                            <button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, included: !prev.included }))} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", installationConfig.included ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-installation-included">{installationConfig.included ? "INCLUDED" : "EXCLUDED"}</button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="space-y-1 flex-1"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Daily fee</span><button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, hideDailyFee: !prev.hideDailyFee }))} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="toggle-hide-daily-fee">{installationConfig.hideDailyFee ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button></div><div className="flex items-center gap-1"><Input type="number" value={installationConfig.dailyFee || ""} onChange={e => { const dailyFee = parseFloat(e.target.value) || 0; setInstallationConfig(prev => { const td = prev.travelDays + prev.mechanicalDays + prev.electricalDays + prev.testingDays + prev.installTrainingDays; return { ...prev, dailyFee, totalDays: td }; }); }} className="flex-1 h-7 text-xs font-mono" data-testid="input-installation-daily-fee" /><span className="text-xs text-muted-foreground shrink-0">€/day</span></div></div>
                          <div className="space-y-1 flex-1"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Total days</span><button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, hideTotalDays: !prev.hideTotalDays }))} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="toggle-hide-installation-days">{installationConfig.hideTotalDays ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button></div><div className="flex items-center gap-1"><Input type="number" value={installationConfig.totalDays || ""} readOnly className="flex-1 h-7 text-xs font-mono bg-muted/50" data-testid="input-installation-days" /><span className="text-xs text-muted-foreground shrink-0">days</span></div></div>
                          <div className="space-y-1 flex-1"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Total</span><button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, hideTotalPrice: !prev.hideTotalPrice }))} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="toggle-hide-installation-total">{installationConfig.hideTotalPrice ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button></div><div className="flex items-center gap-1"><span className="text-xs text-muted-foreground shrink-0">€</span><Input type="number" value={installationConfig.totalPrice || ""} readOnly className="flex-1 h-7 text-xs font-mono bg-muted/50" data-testid="input-installation-total" /></div></div>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {([
                            { key: "travelDays" as const, label: "Travel", hideKey: "hideBreakdownTravel" as const },
                            { key: "mechanicalDays" as const, label: "Mech. assembly", hideKey: "hideBreakdownMechanical" as const },
                            { key: "electricalDays" as const, label: "Elec. assembly", hideKey: "hideBreakdownElectrical" as const },
                            { key: "testingDays" as const, label: "Testing", hideKey: "hideBreakdownTesting" as const },
                            { key: "installTrainingDays" as const, label: "Training", hideKey: "hideBreakdownTraining" as const },
                          ] as const).map(({ key, label, hideKey }) => (
                            <div key={key} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-muted-foreground leading-tight block">{label}</span>
                                <button type="button" onClick={() => setInstallationConfig(prev => ({ ...prev, [hideKey]: !prev[hideKey] }))} className="text-muted-foreground hover:text-foreground transition-colors" data-testid={`toggle-hide-breakdown-${key}`}>{installationConfig[hideKey] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}</button>
                              </div>
                              <Input type="number" min="0" value={installationConfig[key] || ""} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setInstallationConfig(prev => { const updated = { ...prev, [key]: v }; const td = updated.travelDays + updated.mechanicalDays + updated.electricalDays + updated.testingDays + updated.installTrainingDays; return { ...updated, totalDays: td }; }); }} className="h-7 text-xs font-mono" data-testid={`input-installation-${key}`} />
                            </div>
                          ))}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground text-right">
                          Mech + Elec + Test + Train = {(installationConfig.mechanicalDays + installationConfig.electricalDays + installationConfig.testingDays + installationConfig.installTrainingDays)} days
                        </div>
                      </div>
                      {(() => {
                        const rentalDailyFee = serviceItems.travelCostsDailyFee || 0;
                        const rentalDays = serviceItems.travelCostsDays || 0;
                        const rentalTotal = rentalDailyFee * rentalDays;
                        const flightTicket = serviceItems.travelFlightTicket || 0;
                        const travelTotal = rentalTotal + flightTicket;
                        return (
                        <div className="space-y-1">
                          <Input value={priceLabels.travelCosts} onChange={e => setPriceLabels(prev => ({ ...prev, travelCosts: e.target.value }))} className="text-sm w-full" data-testid="label-travel" />
                          <div className="flex items-center gap-2">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground shrink-0">Rental car</span>
                                <Input type="number" min="0" value={rentalDailyFee || ""} onChange={e => setServiceItems({ ...serviceItems, travelCostsDailyFee: parseFloat(e.target.value) || 0 })} className="w-20 h-7 text-xs font-mono" data-testid="input-travel-daily-fee" />
                                <span className="text-[10px] text-muted-foreground shrink-0">€/day</span>
                                <span className="text-[10px] text-muted-foreground shrink-0">×</span>
                                <Input type="number" min="0" value={rentalDays || ""} onChange={e => setServiceItems({ ...serviceItems, travelCostsDays: parseFloat(e.target.value) || 0 })} className="w-16 h-7 text-xs font-mono" data-testid="input-travel-days" />
                                <span className="text-[10px] text-muted-foreground shrink-0">days</span>
                                <span className="text-xs font-mono text-muted-foreground shrink-0">= €{rentalTotal.toLocaleString()}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground shrink-0">Flight ticket</span>
                                <Input type="number" min="0" value={flightTicket || ""} onChange={e => setServiceItems({ ...serviceItems, travelFlightTicket: parseFloat(e.target.value) || 0 })} className="w-20 h-7 text-xs font-mono" data-testid="input-travel-flight-ticket" />
                              </div>
                              {(rentalTotal > 0 || flightTicket > 0) && (
                                <div className="text-[10px] font-mono text-muted-foreground">Total: €{travelTotal.toLocaleString()}</div>
                              )}
                            </div>
                            <CommentButton comment={priceComments.travel} onChange={v => setPriceComments(prev => ({ ...prev, travel: v }))} data-testid="comment-travel" />
                            <button type="button" onClick={() => setServiceItems({ ...serviceItems, travelCosts: !serviceItems.travelCosts })} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.travelCosts ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-travel">{serviceItems.travelCosts ? "INCLUDED" : "EXCLUDED"}</button>
                          </div>
                        </div>
                        );
                      })()}
                      <div className="space-y-1">
                        <Input value={priceLabels.boardLodging} onChange={e => setPriceLabels(prev => ({ ...prev, boardLodging: e.target.value }))} className="text-sm w-full" data-testid="label-board" />
                        <div className="flex items-center justify-end gap-2">
                          <CommentButton comment={priceComments.boardLodging} onChange={v => setPriceComments(prev => ({ ...prev, boardLodging: v }))} data-testid="comment-board" />
                          <button type="button" onClick={() => setServiceItems({ ...serviceItems, boardLodging: !serviceItems.boardLodging })} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.boardLodging ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-board">{serviceItems.boardLodging ? "INCLUDED" : "EXCLUDED"}</button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Input value={priceLabels.training} onChange={e => setPriceLabels(prev => ({ ...prev, training: e.target.value }))} className="text-sm w-full" data-testid="label-training" />
                        <div className="flex items-center justify-end gap-2">
                          <CommentButton comment={priceComments.training} onChange={v => setPriceComments(prev => ({ ...prev, training: v }))} data-testid="comment-training" />
                          <div className="flex items-center gap-1"><Input value={installationConfig.installTrainingDays || ""} readOnly className="w-16 bg-muted/50" data-testid="input-training-days" /><span className="text-sm text-muted-foreground">days</span></div>
                          <button type="button" onClick={() => setServiceItems({ ...serviceItems, trainingIncluded: !serviceItems.trainingIncluded })} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.trainingIncluded ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-training">{serviceItems.trainingIncluded ? "INCLUDED" : "EXCLUDED"}</button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Input value={priceLabels.packaging} onChange={e => setPriceLabels(prev => ({ ...prev, packaging: e.target.value }))} className="text-sm w-full" data-testid="label-packaging" />
                        <div className="flex items-center justify-end gap-2">
                          <CommentButton comment={priceComments.packaging} onChange={v => setPriceComments(prev => ({ ...prev, packaging: v }))} data-testid="comment-packaging" />
                          <button type="button" onClick={() => setServiceItems({ ...serviceItems, packaging: !serviceItems.packaging })} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.packaging ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-green-700")} data-testid="toggle-packaging">{serviceItems.packaging ? "INCLUDED" : "EXCLUDED"}</button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Input value={priceLabels.transport} onChange={e => setPriceLabels(prev => ({ ...prev, transport: e.target.value }))} className="text-sm w-full" data-testid="label-transport" />
                        <div className="flex items-center justify-end gap-2">
                          <CommentButton comment={priceComments.transport} onChange={v => setPriceComments(prev => ({ ...prev, transport: v }))} data-testid="comment-transport" />
                          <div className="flex items-center gap-1"><span className="text-xs text-muted-foreground">€</span><Input type="number" value={serviceItems.transportPrice || ""} onChange={e => setServiceItems({ ...serviceItems, transportPrice: parseFloat(e.target.value) || 0 })} className="w-24 h-7 text-xs font-mono" data-testid="input-transport-price" /></div>
                          <button type="button" onClick={() => setServiceItems({ ...serviceItems, transportIncluded: !serviceItems.transportIncluded })} className={cn("shrink-0 text-xs font-bold px-3 py-1 rounded-full border transition-colors", serviceItems.transportIncluded ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")} data-testid="toggle-transport">{serviceItems.transportIncluded ? "INCLUDED" : "EXCLUDED"}</button>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center font-medium pt-2"><span>Services Total</span><span className="font-mono">€{calcServicesTotal().toLocaleString()}</span></div>
                  </div>
                  <div className="border-t-2 pt-4 space-y-2">
                    <div className="flex justify-between items-center gap-4"><Input value={priceLabels.grossTotal} onChange={e => setPriceLabels(prev => ({ ...prev, grossTotal: e.target.value }))} className="h-7 text-base font-medium w-48" data-testid="label-gross-total" /><span className="font-mono font-bold text-lg">€{dealerCalcGrossTotal().toLocaleString()}</span></div>
                    {discountPercent > 0 && <div className="flex justify-between items-center gap-4 text-primary"><Input value={priceLabels.netTotal} onChange={e => setPriceLabels(prev => ({ ...prev, netTotal: e.target.value }))} className="h-7 text-base font-medium w-48" data-testid="label-net-total" /><span className="font-mono font-bold text-lg">€{dealerCalcNetTotal().toLocaleString()}</span></div>}
                  </div>
                </motion.div>
              )}

              {currentStepDef?.id === "terms" && !isDealerEdit && (() => {
                const finalTotal = calcTotal();
                const percentSum = paymentSchedule.reduce((s, r) => s + r.percentage, 0);
                const amountSum = paymentSchedule.reduce((s, r) => s + r.amount, 0);
                const isBalanced = paymentMode === "percentage" ? Math.abs(percentSum - 100) < 0.01 : Math.abs(amountSum - finalTotal) < 0.01;
                return (
                  <motion.div key="terms" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                    <h3 className="font-semibold text-lg border-b pb-2">{currentStepDef?.label ?? "Terms & Conditions"}</h3>
                    <div className="space-y-3 p-4 border rounded-lg bg-muted/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-primary" />
                          <Label className="text-sm font-semibold uppercase tracking-wide">Consegna</Label>
                        </div>
                        <div className="flex border rounded-md overflow-hidden">
                          <button type="button" className={cn("px-3 py-1 text-xs font-medium transition-colors", deliveryMode === "days" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")} onClick={() => setDeliveryMode("days")} data-testid="btn-delivery-mode-days">Giorni</button>
                          <button type="button" className={cn("px-3 py-1 text-xs font-medium transition-colors", deliveryMode === "date" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")} onClick={() => setDeliveryMode("date")} data-testid="btn-delivery-mode-date">Data</button>
                        </div>
                      </div>
                      {deliveryMode === "days" ? (
                        <div className="flex items-center gap-2">
                          <div className="w-24">
                            <Input type="number" min="1" value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} placeholder="90" className="text-sm font-mono text-center" data-testid="input-delivery-days" />
                          </div>
                          <span className="text-sm text-muted-foreground shrink-0">giorni</span>
                          <Input value={deliveryDescription} onChange={(e) => setDeliveryDescription(e.target.value)} placeholder="dalla conferma dell'ordine" className="text-sm flex-1" data-testid="input-delivery-description" />
                        </div>
                      ) : (
                        <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="text-sm w-auto" data-testid="input-delivery-date" />
                      )}
                    </div>
                    <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-primary" />
                          <Label className="text-sm font-semibold uppercase tracking-wide">Pagamento</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Modalità:</span>
                          <div className="flex border rounded-md overflow-hidden">
                            <button type="button" className={cn("px-3 py-1 text-xs font-medium transition-colors", paymentMode === "percentage" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")} onClick={() => setPaymentMode("percentage")} data-testid="btn-payment-mode-percent">%</button>
                            <button type="button" className={cn("px-3 py-1 text-xs font-medium transition-colors", paymentMode === "amount" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")} onClick={() => setPaymentMode("amount")} data-testid="btn-payment-mode-amount">€</button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {paymentSchedule.map((row, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="flex-1">
                              <Input value={row.description} onChange={(e) => setPaymentSchedule(prev => prev.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} placeholder="Descrizione..." className="text-sm" data-testid={`input-payment-desc-${i}`} />
                            </div>
                            {paymentMode === "percentage" ? (
                              <div className="w-24 flex items-center gap-1">
                                <Input type="number" min="0" max="100" step="1" value={row.percentage} onChange={(e) => setPaymentSchedule(prev => prev.map((r, j) => j === i ? { ...r, percentage: parseFloat(e.target.value) || 0 } : r))} className="text-sm font-mono text-right" data-testid={`input-payment-pct-${i}`} />
                                <span className="text-sm text-muted-foreground">%</span>
                              </div>
                            ) : (
                              <div className="w-32 flex items-center gap-1">
                                <span className="text-sm text-muted-foreground">€</span>
                                <Input type="number" min="0" step="0.01" value={row.amount} onChange={(e) => setPaymentSchedule(prev => prev.map((r, j) => j === i ? { ...r, amount: parseFloat(e.target.value) || 0 } : r))} className="text-sm font-mono text-right" data-testid={`input-payment-amt-${i}`} />
                              </div>
                            )}
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive/70 hover:text-destructive" onClick={() => setPaymentSchedule(prev => prev.filter((_, j) => j !== i))} data-testid={`btn-remove-payment-${i}`}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPaymentSchedule(prev => [...prev, { description: "", percentage: 0, amount: 0 }])} data-testid="btn-add-payment-row">
                        <Plus className="w-3.5 h-3.5" /> Aggiungi riga
                      </Button>

                      <div className={cn("flex items-center justify-between p-2 rounded-md text-sm font-medium", isBalanced ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400")}>
                        <div className="flex items-center gap-1.5">
                          {isBalanced ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                          <span>{paymentMode === "percentage" ? `Totale: ${percentSum}%` : `Totale: €${amountSum.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`}</span>
                        </div>
                        <span className="text-xs">{paymentMode === "percentage" ? (isBalanced ? "= 100%" : percentSum > 100 ? `eccedenza ${percentSum - 100}%` : `mancano ${100 - percentSum}%`) : (isBalanced ? `= €${finalTotal.toLocaleString("it-IT", { minimumFractionDigits: 2 })}` : amountSum > finalTotal ? `eccedenza €${(amountSum - finalTotal).toLocaleString("it-IT", { minimumFractionDigits: 2 })}` : `mancano €${(finalTotal - amountSum).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`)}</span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">Altre Condizioni</Label>
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer hover:text-foreground transition-colors">Placeholder disponibili</summary>
                          <div className="mt-2 p-3 bg-muted/40 rounded-md space-y-1 font-mono text-[11px]">
                            <p><code className="bg-muted px-1 rounded">{"{{DATA_OGGI}}"}</code> — Data odierna (es. 10/04/2026)</p>
                            <p><code className="bg-muted px-1 rounded">{"{{NOME_CLIENTE}}"}</code> — Nome azienda cliente</p>
                            <p><code className="bg-muted px-1 rounded">{"{{CONTATTO_CLIENTE}}"}</code> — Contatto cliente</p>
                            <p><code className="bg-muted px-1 rounded">{"{{EMAIL_CLIENTE}}"}</code> — Email cliente</p>
                            <p><code className="bg-muted px-1 rounded">{"{{INDIRIZZO_CLIENTE}}"}</code> — Indirizzo cliente</p>
                            <p><code className="bg-muted px-1 rounded">{"{{NUMERO_OFFERTA}}"}</code> — Numero offerta</p>
                          </div>
                        </details>
                      </div>
                      <div className="grid gap-3">
                        {(presets ?? []).length === 0 && <p className="text-sm text-muted-foreground italic">No terms & conditions entries yet. Add them in the Terms & Conditions page.</p>}
                        {(presets ?? []).map((preset: any) => {
                          const selected = (projectData.selectedPresets || []).some((p: any) => p.id === preset.id);
                          const lang = contentLanguage || "it";
                          const tr = lang !== "it" && preset.translations?.[lang];
                          const resolvedTitle = tr?.title || preset.title;
                          const resolvedContent = tr?.content || preset.content;
                          const noTranslation = lang !== "it" && !tr;
                          const replacePlaceholders = (text: string) => {
                            const today = new Date();
                            const dateStr = today.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
                            return text
                              .replace(/\{\{DATA_OGGI\}\}/g, dateStr)
                              .replace(/\{\{NOME_CLIENTE\}\}/g, headerCustomerName || "—")
                              .replace(/\{\{CONTATTO_CLIENTE\}\}/g, headerCustomerContact || "—")
                              .replace(/\{\{EMAIL_CLIENTE\}\}/g, headerCustomerEmail || "—")
                              .replace(/\{\{INDIRIZZO_CLIENTE\}\}/g, headerCustomerAddress || "—")
                              .replace(/\{\{NUMERO_OFFERTA\}\}/g, projectData.offerNumber || projectData.headerInfo?.offerNumber || "—");
                          };
                          const displayTitle = replacePlaceholders(resolvedTitle);
                          const displayContent = replacePlaceholders(resolvedContent);
                          return (
                            <div key={preset.id} className={`flex items-start space-x-2 p-3 border rounded-md ${noTranslation ? "opacity-60" : ""}`}>
                              <Checkbox id={`preset-${preset.id}`} checked={selected} onCheckedChange={(checked) => {
                                const current = projectData.selectedPresets || [];
                                if (checked) setProjectData({ ...projectData, selectedPresets: [...current, { id: preset.id, title: displayTitle, content: displayContent }] });
                                else setProjectData({ ...projectData, selectedPresets: current.filter((p: any) => p.id !== preset.id) });
                              }} data-testid={`checkbox-preset-${preset.id}`} />
                              <div>
                                <label htmlFor={`preset-${preset.id}`} className="font-medium text-sm block cursor-pointer">{displayTitle || "(no title)"}</label>
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{displayContent}</p>
                                {noTranslation && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 italic">No translation available — showing Italian</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                );
              })()}

              {currentStepDef?.id === "crm" && !isDealerEdit && (
                <motion.div key="crm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <OfferCrmStep
                    form={crmInfo}
                    onChange={(updater) => setCrmInfo(updater)}
                    pendingReminders={pendingReminders}
                    onPendingChange={(updater) => setPendingReminders(updater)}
                  />
                </motion.div>
              )}

              {currentStepDef?.id === "review" && (
                <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  {editingSection !== null ? (
                    <div className="flex flex-col gap-6">
                      <div className="flex items-center gap-3 border-b pb-4">
                        <Button variant="outline" type="button" onClick={() => { setEditingSection(null); generatePreviewPdf(); }} data-testid="btn-section-edit-back">
                          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Review
                        </Button>
                        <h2 className="font-semibold text-lg flex-1">
                          Edit: {SECTION_LABELS[editingSection] || editingSection}
                        </h2>
                        <Button type="button" onClick={() => { setEditingSection(null); generatePreviewPdf(); }} data-testid="btn-section-edit-save">
                          Save &amp; Return
                        </Button>
                      </div>
                      <div className="max-w-6xl mx-auto w-full flex flex-col gap-6">
                        {editingSection === "machine_line" && (() => {
                          const orderedCartForEdit = getOrderedCart();
                          return (
                            <>
                              <p className="text-sm text-muted-foreground">Override the description shown for each machine in this offer (does not change the source data).</p>
                              {orderedCartForEdit.map((item, idx) => {
                                if (item.isCustom) {
                                  return (
                                    <div key={item.tempId} className="flex flex-col gap-1.5">
                                      <label className="text-sm font-bold">Pos. {idx + 1} — {item.snapshotMachineName ?? "Custom Machine"} <span className="text-xs font-normal text-muted-foreground">(macchina nuova)</span></label>
                                      <Textarea className="min-h-[200px]" style={{ height: "auto", overflow: "hidden" }} ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = Math.max(200, el.scrollHeight) + "px"; } }} value={item.snapshotMachineDescription ?? ""} onChange={(e) => { const el = e.target; el.style.height = "auto"; el.style.height = Math.max(200, el.scrollHeight) + "px"; setCart(prev => prev.map(c => c.tempId === item.tempId ? { ...c, snapshotMachineDescription: e.target.value } : c)); }} data-testid={`textarea-machinedesc-custom-${idx}`} />
                                    </div>
                                  );
                                }
                                const machine = isSalesman && machines ? (machines as any[]).find((m: any) => m.id === item.machineId) : null;
                                const currentVal = machineDescOverrides[item.machineId] ?? machine?.description ?? "";
                                return (
                                  <div key={item.tempId} className="flex flex-col gap-1.5">
                                    <label className="text-sm font-bold">Pos. {idx + 1} — {machine?.name ?? item.snapshotMachineName ?? `Machine #${item.machineId}`}</label>
                                    <Textarea className="min-h-[200px]" style={{ height: "auto", overflow: "hidden" }} ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = Math.max(200, el.scrollHeight) + "px"; } }} value={currentVal} onChange={(e) => { const el = e.target; el.style.height = "auto"; el.style.height = Math.max(200, el.scrollHeight) + "px"; setMachineDescOverrides(prev => ({ ...prev, [item.machineId]: e.target.value })); }} data-testid={`textarea-machinedesc-${item.machineId}`} />
                                  </div>
                                );
                              })}
                            </>
                          );
                        })()}
                        {editingSection === "terms_conditions" && (
                          <>
                            <div className="space-y-3 p-4 border rounded-lg bg-muted/20">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Truck className="w-4 h-4 text-primary" />
                                  <Label className="text-sm font-semibold uppercase tracking-wide">Consegna</Label>
                                </div>
                                <div className="flex border rounded-md overflow-hidden">
                                  <button type="button" className={cn("px-3 py-1 text-xs font-medium transition-colors", deliveryMode === "days" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")} onClick={() => setDeliveryMode("days")} data-testid="btn-review-delivery-mode-days">Giorni</button>
                                  <button type="button" className={cn("px-3 py-1 text-xs font-medium transition-colors", deliveryMode === "date" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")} onClick={() => setDeliveryMode("date")} data-testid="btn-review-delivery-mode-date">Data</button>
                                </div>
                              </div>
                              {deliveryMode === "days" ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-24"><Input type="number" min="1" value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} placeholder="90" className="text-sm font-mono text-center" data-testid="input-review-delivery-days" /></div>
                                  <span className="text-sm text-muted-foreground shrink-0">giorni</span>
                                  <Input value={deliveryDescription} onChange={(e) => setDeliveryDescription(e.target.value)} placeholder="dalla conferma dell'ordine" className="text-sm flex-1" data-testid="input-review-delivery-description" />
                                </div>
                              ) : (
                                <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="text-sm w-auto" data-testid="input-review-delivery-date" />
                              )}
                            </div>

                            {(() => {
                              const rFinalTotal = calcTotal();
                              const rPercentSum = paymentSchedule.reduce((s, r) => s + r.percentage, 0);
                              const rAmountSum = paymentSchedule.reduce((s, r) => s + r.amount, 0);
                              const rIsBalanced = paymentMode === "percentage" ? Math.abs(rPercentSum - 100) < 0.01 : Math.abs(rAmountSum - rFinalTotal) < 0.01;
                              return (
                            <div className="space-y-3 p-4 border rounded-lg bg-muted/20">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <CreditCard className="w-4 h-4 text-primary" />
                                  <Label className="text-sm font-semibold uppercase tracking-wide">Pagamento</Label>
                                </div>
                                <div className="flex border rounded-md overflow-hidden">
                                  <button type="button" className={cn("px-3 py-1 text-xs font-medium transition-colors", paymentMode === "percentage" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")} onClick={() => setPaymentMode("percentage")} data-testid="btn-review-payment-mode-percent">%</button>
                                  <button type="button" className={cn("px-3 py-1 text-xs font-medium transition-colors", paymentMode === "amount" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")} onClick={() => setPaymentMode("amount")} data-testid="btn-review-payment-mode-amount">€</button>
                                </div>
                              </div>
                              {paymentSchedule.map((row, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <Input value={row.description} onChange={(e) => setPaymentSchedule(prev => prev.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} className="flex-1 text-sm" placeholder="Descrizione..." data-testid={`input-review-payment-desc-${i}`} />
                                  {paymentMode === "percentage" ? (
                                    <div className="w-20 flex items-center gap-1"><Input type="number" value={row.percentage} onChange={(e) => setPaymentSchedule(prev => prev.map((r, j) => j === i ? { ...r, percentage: parseFloat(e.target.value) || 0 } : r))} className="text-sm font-mono" data-testid={`input-review-payment-pct-${i}`} /><span className="text-xs">%</span></div>
                                  ) : (
                                    <div className="w-28 flex items-center gap-1"><span className="text-xs">€</span><Input type="number" value={row.amount} onChange={(e) => setPaymentSchedule(prev => prev.map((r, j) => j === i ? { ...r, amount: parseFloat(e.target.value) || 0 } : r))} className="text-sm font-mono" data-testid={`input-review-payment-amt-${i}`} /></div>
                                  )}
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive/70" onClick={() => setPaymentSchedule(prev => prev.filter((_, j) => j !== i))} data-testid={`btn-review-remove-payment-${i}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                                </div>
                              ))}
                              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPaymentSchedule(prev => [...prev, { description: "", percentage: 0, amount: 0 }])} data-testid="btn-review-add-payment-row"><Plus className="w-3.5 h-3.5" /> Aggiungi riga</Button>
                              <div className={cn("flex items-center justify-between p-2 rounded-md text-xs font-medium", rIsBalanced ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400")}>
                                <div className="flex items-center gap-1">{rIsBalanced ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}<span>{paymentMode === "percentage" ? `${rPercentSum}%` : `€${rAmountSum.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`}</span></div>
                                <span>{paymentMode === "percentage" ? (rIsBalanced ? "= 100%" : rPercentSum > 100 ? `eccedenza ${rPercentSum - 100}%` : `mancano ${100 - rPercentSum}%`) : (rIsBalanced ? `= target` : rAmountSum > rFinalTotal ? `eccedenza` : `mancano €${(rFinalTotal - rAmountSum).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`)}</span>
                              </div>
                            </div>
                              );
                            })()}

                            {(projectData.selectedPresets ?? []).length > 0 && <Label className="text-sm font-semibold mt-4">Altre Condizioni</Label>}
                            {(projectData.selectedPresets ?? []).map((preset: any, idx: number) => (
                              <div key={idx} className="flex flex-col gap-1.5">
                                <Input className="font-semibold" value={preset.title ?? ""} onChange={(e) => { const updated = [...(projectData.selectedPresets ?? [])]; updated[idx] = { ...updated[idx], title: e.target.value }; setProjectData((prev: any) => ({ ...prev, selectedPresets: updated })); }} placeholder="Section title" data-testid={`input-preset-title-${idx}`} />
                                <Textarea className="min-h-[200px]" style={{ height: "auto", overflow: "hidden" }} ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = Math.max(200, el.scrollHeight) + "px"; } }} value={preset.content ?? ""} onChange={(e) => { const el = e.target; el.style.height = "auto"; el.style.height = Math.max(200, el.scrollHeight) + "px"; const updated = [...(projectData.selectedPresets ?? [])]; updated[idx] = { ...updated[idx], content: e.target.value }; setProjectData((prev: any) => ({ ...prev, selectedPresets: updated })); }} data-testid={`textarea-preset-content-${idx}`} />
                              </div>
                            ))}
                          </>
                        )}
                        {editingSection !== "machine_line" && editingSection !== "terms_conditions" && (() => {
                          const hi = projectData.headerInfo ?? {};
                          return (
                          <div className="flex flex-col gap-6">

                              {editingSection === "metadata" && (
                                <div className="bg-muted/30 rounded-lg p-4 grid md:grid-cols-2 gap-4">
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Company Name</Label><Input value={headerCustomerName} onChange={(e) => setHeaderCustomerName(e.target.value)} data-testid="edit-section-customer-name" /></div>
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Contact Person</Label><Input value={headerCustomerContact} onChange={(e) => setHeaderCustomerContact(e.target.value)} data-testid="edit-section-customer-contact" /></div>
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Email</Label><Input value={headerCustomerEmail} onChange={(e) => setHeaderCustomerEmail(e.target.value)} data-testid="edit-section-customer-email" /></div>
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Address</Label><Input value={headerCustomerAddress} onChange={(e) => setHeaderCustomerAddress(e.target.value)} data-testid="edit-section-customer-address" /></div>
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Salesman Name</Label><Input value={headerSalesmanName} onChange={(e) => setHeaderSalesmanName(e.target.value)} data-testid="edit-section-salesman-name" /></div>
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Salesman Email</Label><Input value={headerSalesmanEmail} onChange={(e) => setHeaderSalesmanEmail(e.target.value)} data-testid="edit-section-salesman-email" /></div>
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Salesman Mobile</Label><Input value={headerSalesmanMobile} onChange={(e) => setHeaderSalesmanMobile(e.target.value)} data-testid="edit-section-salesman-mobile" /></div>
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Date</Label><Input type="date" value={headerDate} onChange={(e) => setHeaderDate(e.target.value)} data-testid="edit-section-date" /></div>
                                </div>
                              )}

                              {editingSection === "offer_title" && (
                                <div className="bg-muted/30 rounded-lg p-4 space-y-4">
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Subject / Offer Title</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="edit-section-subject" /></div>
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Layout</Label><Input value={layout} onChange={(e) => setLayout(e.target.value)} data-testid="edit-section-layout" /></div>
                                </div>
                              )}

                              {editingSection === "technical_specs" && (
                                <div className="bg-muted/30 rounded-lg p-4 space-y-4">
                                  <div className="grid md:grid-cols-2 gap-4">
                                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Min/Max Length (mm)</Label><Input value={technicalSpecs.minMaxLength} onChange={(e) => updateSpec("minMaxLength", e.target.value)} data-testid="edit-section-minmax-length" /></div>
                                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Max Width (mm)</Label><Input value={technicalSpecs.maxWidth} onChange={(e) => updateSpec("maxWidth", e.target.value)} data-testid="edit-section-max-width" /></div>
                                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Min/Max Thickness (mm)</Label><Input value={technicalSpecs.minMaxThickness} onChange={(e) => updateSpec("minMaxThickness", e.target.value)} data-testid="edit-section-thickness" /></div>
                                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Avg. Line Speed (mt/min)</Label><Input value={technicalSpecs.averageLineSpeed} onChange={(e) => updateSpec("averageLineSpeed", e.target.value)} data-testid="edit-section-line-speed" /></div>
                                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Control Side</Label><Input value={technicalSpecs.controlSide} onChange={(e) => updateSpec("controlSide", e.target.value)} data-testid="edit-section-control-side" /></div>
                                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Max Bow</Label><Input value={technicalSpecs.maxBow} onChange={(e) => updateSpec("maxBow", e.target.value)} data-testid="edit-section-max-bow" /></div>
                                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Paint</Label><Input value={technicalSpecs.paint} onChange={(e) => updateSpec("paint", e.target.value)} data-testid="edit-section-paint" /></div>
                                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Substrate</Label><Input value={technicalSpecs.substrate} onChange={(e) => updateSpec("substrate", e.target.value)} data-testid="edit-section-substrate" /></div>
                                    <div className="space-y-1"><Label className="text-xs text-muted-foreground">Finishing</Label><Input value={technicalSpecs.finishing} onChange={(e) => updateSpec("finishing", e.target.value)} data-testid="edit-section-finishing" /></div>
                                  </div>
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Standard Voltage</Label><Input value={technicalSpecs.standardVoltage} onChange={(e) => updateSpec("standardVoltage", e.target.value)} data-testid="edit-section-voltage" /></div>
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Standard Colors</Label><Input value={technicalSpecs.standardColors} onChange={(e) => updateSpec("standardColors", e.target.value)} data-testid="edit-section-colors" /></div>
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Components</Label><Textarea className="min-h-[80px]" value={technicalSpecs.components} onChange={(e) => updateSpec("components", e.target.value)} data-testid="edit-section-components" /></div>
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Precautions</Label><Textarea className="min-h-[80px]" value={technicalSpecs.precautions} onChange={(e) => updateSpec("precautions", e.target.value)} data-testid="edit-section-precautions" /></div>
                                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Commissioning</Label><Textarea className="min-h-[80px]" value={technicalSpecs.commissioning} onChange={(e) => updateSpec("commissioning", e.target.value)} data-testid="edit-section-commissioning" /></div>
                                </div>
                              )}

                              {editingSection === "utilities_summary" && (
                                <div className="bg-muted/30 rounded-lg p-4">
                                  <p className="text-sm text-muted-foreground">Utilities are auto-calculated from the machines in this offer.</p>
                                  {cart.length > 0 && (
                                    <div className="mt-3 space-y-1">
                                      {cart.map((item, idx) => {
                                        const machine = isSalesman && machines ? (machines as any[]).find((m: any) => m.id === item.machineId) : null;
                                        return (
                                          <div key={item.tempId} className="text-xs text-muted-foreground">Pos. {idx + 1}: {machine?.name ?? item.snapshotMachineName ?? "—"}</div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}

                              {editingSection === "price_overview" && (
                                <div className="bg-muted/30 rounded-lg p-4">
                                  <p className="text-sm text-muted-foreground">Prices are auto-calculated from machine composition and pricing step.</p>
                                </div>
                              )}
                          </div>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                  <div className="flex flex-col lg:flex-row gap-6">
                    <div className="lg:w-2/5 flex flex-col gap-4">
                      <div>
                        <h3 className="font-semibold text-lg border-b pb-2">Page Layout</h3>
                        <p className="text-sm text-muted-foreground mt-2">Drag sections to set their order. Use the page-break button to force a section to start on a new page. Uncheck to hide a section.</p>
                      </div>
                      {(() => {
                        const orderedCart = getOrderedCart();
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
                                    const secColors: Record<string, { border: string; bg: string; text: string }> = {
                                      metadata: { border: "border-blue-300", bg: "bg-blue-50/50 dark:bg-blue-950/20", text: "text-blue-800 dark:text-blue-300" },
                                      offer_title: { border: "border-violet-300", bg: "bg-violet-50/50 dark:bg-violet-950/20", text: "text-violet-800 dark:text-violet-300" },
                                      technical_specs: { border: "border-teal-300", bg: "bg-teal-50/50 dark:bg-teal-950/20", text: "text-teal-800 dark:text-teal-300" },
                                      machine_line: { border: "border-green-300", bg: "bg-green-50/50 dark:bg-green-950/20", text: "text-green-800 dark:text-green-300" },
                                      utilities_summary: { border: "border-orange-300", bg: "bg-orange-50/50 dark:bg-orange-950/20", text: "text-orange-800 dark:text-orange-300" },
                                      price_overview: { border: "border-indigo-300", bg: "bg-indigo-50/50 dark:bg-indigo-950/20", text: "text-indigo-800 dark:text-indigo-300" },
                                      terms_conditions: { border: "border-amber-300", bg: "bg-amber-50/50 dark:bg-amber-950/20", text: "text-amber-800 dark:text-amber-300" },
                                    };
                                    const sc = secColors[secId] ?? { border: "border-gray-300", bg: "bg-gray-50/50 dark:bg-gray-950/20", text: "text-gray-800 dark:text-gray-300" };
                                    return (
                                      <Draggable key={secId} draggableId={secId} index={index}>
                                        {(provided, snapshot) => (
                                          <div ref={provided.innerRef} {...provided.draggableProps}>
                                            {hasPageBreak && (
                                              <div className="flex items-center gap-2 py-1 px-1 my-1">
                                                <div className="flex-1 border-t-2 border-dashed border-primary/40" />
                                                <span className="text-xs text-primary/70 font-medium flex items-center gap-1 shrink-0"><CornerDownLeft className="w-3 h-3" />New page</span>
                                                <div className="flex-1 border-t-2 border-dashed border-primary/40" />
                                              </div>
                                            )}
                                            <div className={`flex items-center gap-3 p-3 border rounded-md transition-colors ${snapshot.isDragging ? "shadow-md bg-background" : isVisible ? "hover:bg-muted/30" : "opacity-50"} ${sc.border} ${sc.bg}`}>
                                              <div {...provided.dragHandleProps} className="cursor-grab text-muted-foreground shrink-0" data-testid={`drag-handle-${secId}`}><GripVertical className="w-4 h-4" /></div>
                                              <label htmlFor={`section-vis-${secId}`} className={`font-medium text-sm flex-1 cursor-pointer ${sc.text}`}>
                                                {label}
                                                {isMachineLine && cart.length > 0 && (
                                                  <span className="ml-1.5 text-xs font-normal text-green-600">({cart.length} position{cart.length !== 1 ? "s" : ""})</span>
                                                )}
                                                {secId === "terms_conditions" && (
                                                  <span className="ml-1.5 text-xs font-normal text-amber-600">
                                                    {(deliveryMode === "days" ? deliveryDays : deliveryDate) ? "✓ " : ""}{paymentSchedule.length > 0 ? `${paymentSchedule.length} rate` : ""}{(projectData.selectedPresets ?? []).length > 0 ? ` + ${(projectData.selectedPresets as any[]).length} clausole` : ""}
                                                  </span>
                                                )}
                                              </label>
                                              {!isDealerEdit && (
                                                <Button variant="ghost" size="sm" type="button" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary" onClick={() => setEditingSection(secId)} title="Edit section content" data-testid={`btn-edit-section-${secId}`}>
                                                  <Pencil className="w-3.5 h-3.5" />
                                                </Button>
                                              )}
                                              <Button variant="ghost" size="sm" type="button" className={`h-7 w-7 p-0 ${hasPageBreak ? "text-primary bg-primary/10" : "text-muted-foreground"}`} onClick={() => setPageBreaks(prev => prev.includes(secId) ? prev.filter(x => x !== secId) : [...prev, secId])} title={hasPageBreak ? "Remove page break" : "Start on new page"} data-testid={`btn-pagebreak-${secId}`}>
                                                <CornerDownLeft className="w-3.5 h-3.5" />
                                              </Button>
                                              <Checkbox id={`section-vis-${secId}`} checked={isVisible} onCheckedChange={(checked) => setHiddenSections(prev => checked ? prev.filter(x => x !== secId) : [...prev, secId])} data-testid={`checkbox-section-${secId}`} />
                                            </div>

                                            {isMachineLine && isVisible && orderedCart.length > 0 && (
                                              <div className="ml-6 mt-1 mb-1 flex flex-col gap-1 border-l-2 border-green-200 pl-2">
                                                {orderedCart.map((item, posIdx) => {
                                                  const machine = isSalesman && machines ? (machines as any[]).find((m: any) => m.id === item.machineId) : null;
                                                  const hasMachBreak = machinePageBreaks.includes(item.tempId);
                                                  const sourceSpeed = technicalSpecs.averageLineSpeed || "";
                                                  const overrideVal = lineSpeedOverrides[item.machineId];
                                                  const isOverridden = overrideVal !== undefined && overrideVal !== "" && overrideVal !== sourceSpeed;
                                                  return (
                                                    <div key={item.tempId} className="flex flex-col gap-0.5">
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
                                                        <span className="text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">{machine?.name ?? item.snapshotMachineName ?? "—"}</span>
                                                        {posIdx > 0 && (
                                                          <Button variant="ghost" size="sm" type="button" className={`h-5 w-5 p-0 shrink-0 ${hasMachBreak ? "text-primary bg-primary/10" : "text-muted-foreground/60"}`} onClick={() => setMachinePageBreaks(prev => hasMachBreak ? prev.filter(t => t !== item.tempId) : [...prev, item.tempId])} title={hasMachBreak ? "Remove page break before this position" : "Start this position on a new page"} data-testid={`btn-machinebreak-${item.tempId}`}>
                                                            <CornerDownLeft className="w-2.5 h-2.5" />
                                                          </Button>
                                                        )}
                                                      </div>
                                                      {!isDealerEdit && !item.isCustom && (
                                                        <div className="flex items-center gap-2 px-2 py-1 rounded-sm bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                                                          <Gauge className="w-3 h-3 text-blue-500 shrink-0" />
                                                          <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 shrink-0">Speed</span>
                                                          <Input
                                                            className={`h-6 text-xs flex-1 ${isOverridden ? "border-blue-400 bg-blue-100/50 dark:bg-blue-900/30" : ""}`}
                                                            placeholder={sourceSpeed || "n/a"}
                                                            value={overrideVal ?? sourceSpeed}
                                                            onChange={(e) => {
                                                              const val = e.target.value;
                                                              setLineSpeedOverrides(prev => {
                                                                if (val === sourceSpeed || val === "") {
                                                                  const next = { ...prev };
                                                                  delete next[item.machineId];
                                                                  return next;
                                                                }
                                                                return { ...prev, [item.machineId]: val };
                                                              });
                                                            }}
                                                            data-testid={`input-linespeed-${item.machineId}`}
                                                          />
                                                          {isOverridden && (
                                                            <span className="text-[10px] text-blue-500 shrink-0">edited</span>
                                                          )}
                                                        </div>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                                {!isDealerEdit && !technicalSpecs.averageLineSpeed && (
                                                  <p className="text-[10px] text-amber-600 mt-0.5 px-2">No default speed set. Set "Avg. line speed" in Technical Specifications.</p>
                                                )}
                                              </div>
                                            )}

                                            {secId === "terms_conditions" && isVisible && (
                                              <div className="ml-6 mt-1 mb-1 flex flex-col gap-0.5 border-l-2 border-amber-200 pl-2">
                                                {(deliveryMode === "days" ? deliveryDays : deliveryDate) && (
                                                  <div className="flex items-center gap-2 px-2 py-1 rounded-sm bg-blue-50 dark:bg-blue-950/30 border border-blue-100">
                                                    <Truck className="w-3 h-3 text-blue-500 shrink-0" />
                                                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate">Consegna: {deliveryMode === "days" ? `${deliveryDays} giorni ${deliveryDescription}` : deliveryDate}</span>
                                                  </div>
                                                )}
                                                {paymentSchedule.length > 0 && (
                                                  <div className="flex items-center gap-2 px-2 py-1 rounded-sm bg-green-50 dark:bg-green-950/30 border border-green-100">
                                                    <CreditCard className="w-3 h-3 text-green-500 shrink-0" />
                                                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate">Pagamento: {paymentSchedule.length} rate ({paymentMode === "percentage" ? "%" : "€"})</span>
                                                  </div>
                                                )}
                                                {((projectData.selectedPresets ?? []) as Array<{ id: number; title: string; content: string }>).map((preset, pidx) => {
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
                                                          <Button variant="ghost" size="sm" type="button" className={`h-5 w-5 p-0 shrink-0 ${hasTermBreak ? "text-primary bg-primary/10" : "text-muted-foreground/60"}`} onClick={() => setTermsPageBreaks(prev => hasTermBreak ? prev.filter(id => id !== preset.id) : [...prev, preset.id])} title={hasTermBreak ? "Remove page break before this preset" : "Start this preset on a new page"} data-testid={`btn-termsbreak-${preset.id}`}>
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

                      {(() => {
                        const hasLayoutPdf = !!layoutDrawing || !!selectedDrawingData?.pdfFilename;
                        if (!hasLayoutPdf) return null;
                        const sourceLabel = layoutDrawing ? layoutDrawing.originalName : selectedDrawingData?.pdfOriginalName ?? "Disegno collegato";
                        return (
                          <div className="flex items-center gap-3 p-3 border rounded-md bg-rose-50/50 dark:bg-rose-950/20 border-rose-300">
                            <FileText className="w-4 h-4 text-red-500 shrink-0" />
                            <label htmlFor="include-layout-pdf" className="text-sm font-medium flex-1 cursor-pointer">
                              Include layout drawing in offer PDF
                              <span className="block text-xs text-muted-foreground font-normal">{sourceLabel}</span>
                            </label>
                            <Checkbox
                              id="include-layout-pdf"
                              checked={includeLayoutInPdf}
                              onCheckedChange={(checked) => setIncludeLayoutInPdf(!!checked)}
                              data-testid="checkbox-include-layout-pdf"
                            />
                          </div>
                        );
                      })()}

                      {isDealerEdit && (
                        <div className="border-t pt-4">
                          <h4 className="font-medium text-sm text-muted-foreground mb-2">Machine Page Breaks</h4>
                          {(offer?.items ?? []).map((item: any, idx: number) => {
                            const hasBreak = machinePageBreakItemIds.includes(item.id);
                            return (
                              <div key={item.id} className="flex items-center gap-2 p-2 text-sm">
                                <span className="flex-1 truncate">{item.snapshotMachineName}</span>
                                {idx > 0 && (
                                  <button type="button" onClick={() => setMachinePageBreakItemIds(prev => prev.includes(item.id) ? prev.filter(x => x !== item.id) : [...prev, item.id])} className={cn("text-[10px] rounded px-1.5 py-0.5 border", hasBreak ? "bg-green-100 border-green-300 text-green-700" : "text-muted-foreground border-transparent hover:border-border")} data-testid={`btn-machine-break-${idx}`}>
                                    <CornerDownLeft className="w-3 h-3 inline" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {!isDealerEdit && isSalesman && isEdit && (
                        <div className="flex gap-2 flex-wrap">
                          <Button variant="outline" size="sm" onClick={handleGenerateDraft} disabled={draftOfferText.isPending} data-testid="btn-ai-draft"><Sparkles className="w-3.5 h-3.5 mr-1" />Draft Text</Button>
                          <Button variant="outline" size="sm" onClick={handleReviewRisks} disabled={reviewRisks.isPending} data-testid="btn-ai-risk"><ShieldCheck className="w-3.5 h-3.5 mr-1" />Risk Review</Button>
                          <Button variant="outline" size="sm" onClick={handleSafetyCheck} disabled={configSafetyGuard.isPending} data-testid="btn-ai-safety"><ShieldCheck className="w-3.5 h-3.5 mr-1" />Safety</Button>
                          <Button variant="outline" size="sm" onClick={handleShowBrain} data-testid="btn-ai-brain"><Brain className="w-3.5 h-3.5 mr-1" />Brain</Button>
                        </div>
                      )}

                      {!isDealerEdit && isSalesman && customerId && (
                        <div className="flex items-center gap-2">
                          {drawingRequestConfirmed ? (
                            <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 rounded px-3 py-1.5" data-testid="badge-drawing-request-confirmed">
                              <CheckCircle2 className="h-4 w-4" />
                              Richiesta disegno inviata ✓
                            </div>
                          ) : isEdit && existingOfferRequests.length > 0 ? (
                            <div className="flex items-center gap-1.5 text-sm border rounded px-3 py-1.5" data-testid="badge-existing-drawing-request">
                              {existingOfferRequests[0].status === "fulfilled" ? (
                                <><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-emerald-600">Disegno evaso</span></>
                              ) : (
                                <><Ruler className="h-4 w-4 text-amber-500" /><span className="text-amber-600">Richiesta in attesa</span></>
                              )}
                            </div>
                          ) : isCreate ? (
                            <Button variant="outline" size="sm" onClick={() => setShowDrawingRequestDialog(true)} data-testid="button-request-drawing">
                              <Ruler className="h-4 w-4 mr-1" />
                              Richiedi Disegno
                            </Button>
                          ) : null}
                        </div>
                      )}

                      <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                        <h4 className="font-medium mb-2">Summary</h4>
                        <p className="text-sm text-muted-foreground">Items: {cart.length}</p>
                        <p className="text-sm text-muted-foreground">Visible sections: {(formatSettings?.sections ?? []).filter((s: any) => s.enabled).length - hiddenSections.length} of {(formatSettings?.sections ?? []).filter((s: any) => s.enabled).length}</p>
                        {pageBreaks.length > 0 && <p className="text-sm text-muted-foreground">Page breaks: {pageBreaks.length}</p>}
                      </div>
                    </div>

                    <div className="lg:w-3/5 flex flex-col gap-2" style={{ minHeight: "75vh" }}>
                      <p className="text-sm font-medium text-muted-foreground shrink-0">PDF Preview</p>
                      {isPdfGenerating && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 border rounded-xl bg-muted/20"><Loader2 className="w-8 h-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Generating preview…</p></div>
                      )}
                      {!isPdfGenerating && pdfBlobUrl && <iframe src={pdfBlobUrl} className="flex-1 w-full rounded-xl border shadow-sm" title="Offer PDF Preview" style={{ minHeight: "70vh" }} />}
                      {!isPdfGenerating && !pdfBlobUrl && <div className="flex-1 flex items-center justify-center border rounded-xl bg-muted/20 text-sm text-muted-foreground">Preview will appear here</div>}
                    </div>
                  </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex justify-between items-center mt-8 pt-6 border-t">
              <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 1} data-testid="button-back" size="lg">
                <ChevronLeft className="w-5 h-5 mr-1" /> Back
              </Button>
              <span className="text-sm text-muted-foreground font-medium">{step} / {wizardSteps.length}</span>
              {step < wizardSteps.length ? (
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={
                    !isDealerEdit && (
                      (currentStepDef?.id === "customer" && (
                        !customerId ||
                        ((offerScenario === "with_dealer" || offerScenario === "to_dealer") && !dealerCompanyId)
                      )) ||
                      (currentStepDef?.id === "composition" && cart.length === 0)
                    )
                  }
                  data-testid="button-next"
                  size="lg"
                >
                  Next <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={(!isDealerEdit && (!subject || cart.length === 0)) || submitting} className="bg-primary hover:bg-primary/90" data-testid="button-create" size="lg">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                  {submitLabel}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      {isSalesman && isEdit && showAiPanel && (
        isLargeScreen ? (
          <div className="fixed right-6 top-24 w-80 z-50 animate-in slide-in-from-right-5 duration-300">
            <AIAssistantPanel
              isLoading={aiLoading}
              error={aiError}
              run={aiRun}
              output={aiOutput}
              workflowType={aiWorkflowType}
              onFeedback={handleAiFeedback}
              onDismiss={() => setShowAiPanel(false)}
              onRetry={aiRetry}
              feedbackPending={submitFeedback.isPending}
              title={aiTitle}
              {...(aiPanelMode === "draft" ? { draftCallbacks } : {})}
            />
          </div>
        ) : (
          <div className="mt-6 border rounded-xl bg-card" data-testid="ai-panel-inline-review">
            <AIAssistantPanel
              isLoading={aiLoading}
              error={aiError}
              run={aiRun}
              output={aiOutput}
              workflowType={aiWorkflowType}
              onFeedback={handleAiFeedback}
              onDismiss={() => setShowAiPanel(false)}
              onRetry={aiRetry}
              feedbackPending={submitFeedback.isPending}
              title={aiTitle}
              {...(aiPanelMode === "draft" ? { draftCallbacks } : {})}
            />
          </div>
        )
      )}
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
              La richiesta verrà inviata immediatamente al tecnico commerciale.
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
                  <Button variant="ghost" size="sm" type="button" className="h-6 w-6 p-0 text-destructive shrink-0" onClick={() => setDrawingRequestFile(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" type="button" onClick={() => drawingRequestFileRef.current?.click()} data-testid="btn-attach-drawing-request">
                  <Paperclip className="w-3.5 h-3.5 mr-1" />
                  Allega file
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDrawingRequestDialog(false); setDrawingRequestNotes(""); setDrawingRequestFile(null); }}>
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
    </LayoutWrapper>
  );
}
