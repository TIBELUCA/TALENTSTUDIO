import { Layout } from "@/components/Layout";
import { LinkedEmailAttachments } from "@/components/LinkedEmailAttachments";
import { PdfViewer } from "@/components/PdfViewer";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, useSearch, Link } from "wouter";
import { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { InlineConfirm } from "@/components/InlineConfirm";
import {
  ClipboardList, Building2, FileText, Upload, Trash2, Loader2,
  ChevronLeft, Calendar, Eye, Download, Plus, Phone,
  ExternalLink, ChevronDown, ChevronRight, CreditCard, Settings2, Wrench,
  Printer, Pencil, Save, X, History, Clock, User, Truck, AlertTriangle,
  ArrowUp, ArrowDown, CheckCircle2, Circle, ShieldCheck, MessageSquare, Send,
  RotateCcw, XCircle, Lock, Receipt, Layers
} from "lucide-react";
import { format } from "date-fns";
import { computeWordDiff, computeLineDiff } from "@/lib/textDiff";
import type {
  OrderBillingInfo, OrderShippingInfo, OrderLineItem, OrderLineItemOption, OrderPriceSummary,
  OrderShippingTerms, OrderAgentInfo, OrderPaymentTerm, OrderLineTechnicalData, OrderTechnicalSheet,
  OrderLogistics, OrderShipment, OrderPhaseData, AssemblyPhase, AssemblyPhaseType,
  OfferHistoryEntry, TimelineEvent, TimelineEventStatus, SectionComment, ProductionProgressEntry,
  UserRole, OrderInvoiceEntry,
} from "@shared/schema";
import { canEditSection } from "@shared/schema";
import { displayVersion } from "@shared/version";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { OrderCompactView } from "@/components/OrderCompactView";
import { CircleProgress } from "@/components/CircleProgress";

const STATUS_OPTIONS = [
  { value: "active", label: "Attiva" },
  { value: "on_hold", label: "Sospesa" },
  { value: "completed", label: "Completata" },
  { value: "cancelled", label: "Annullata" },
];

const statusColor: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  on_hold: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const TIMELINE_STATUS_STYLES: Record<TimelineEventStatus, { dot: string; line: string; badge: string; label: string }> = {
  pending: { dot: "bg-gray-300 dark:bg-gray-600", line: "bg-gray-200 dark:bg-gray-700", badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", label: "In attesa" },
  in_progress: { dot: "bg-blue-500", line: "bg-blue-200 dark:bg-blue-800", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", label: "In corso" },
  completed: { dot: "bg-green-500", line: "bg-green-500", badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", label: "Completato" },
  skipped: { dot: "bg-amber-400", line: "bg-amber-200 dark:bg-amber-800", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", label: "Saltato" },
};

const TIMELINE_STATUS_OPTIONS: { value: TimelineEventStatus; label: string }[] = [
  { value: "pending", label: "In attesa" },
  { value: "in_progress", label: "In corso" },
  { value: "completed", label: "Completato" },
  { value: "skipped", label: "Saltato" },
];

function fmtCurrency(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
}

function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy HH:mm"); } catch { return "—"; }
}

type ChangeType = "added" | "modified" | "removed" | null;

function InlineDiff({ current, previous }: { current: string; previous: string }) {
  const origNorm = (previous ?? "").replace(/\r\n/g, "\n");
  const modNorm = (current ?? "").replace(/\r\n/g, "\n");
  if (origNorm === modNorm) return <span>{modNorm || "—"}</span>;
  const lineDiffs = computeLineDiff(origNorm, modNorm);
  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {lineDiffs.map((ld, i) => {
        const nl = i < lineDiffs.length - 1 ? "\n" : "";
        if (ld.type === "equal") return <span key={i}>{ld.text}{nl}</span>;
        if (ld.type === "removed") return <span key={i} className="text-red-600 dark:text-red-400 line-through">{ld.oldLine}{nl}</span>;
        if (ld.type === "added") return <span key={i} className="text-green-600 dark:text-green-400 underline">{ld.newLine}{nl}</span>;
        const segs = computeWordDiff(ld.oldLine!, ld.newLine!);
        return (
          <span key={i}>
            {segs.map((seg, j) => {
              if (seg.type === "equal") return <span key={j}>{seg.text}</span>;
              if (seg.type === "removed") return <span key={j} className="text-red-600 dark:text-red-400 line-through">{seg.text}</span>;
              return <span key={j} className="text-green-600 dark:text-green-400 underline">{seg.text}</span>;
            })}
            {nl}
          </span>
        );
      })}
    </span>
  );
}

function ViewField({ label, value, className = "", changeType, previousValue }: { label: string; value: string | React.ReactNode; className?: string; changeType?: ChangeType; previousValue?: any }) {
  const changeClass = changeType === "added" ? "animate-change-added pl-3 rounded-md py-1" :
                      changeType === "modified" ? "animate-change-modified pl-3 rounded-md py-1" :
                      changeType === "removed" ? "animate-change-removed pl-3 rounded-md py-1 opacity-60" : "";
  const changeBadge = changeType === "added" ? <span className="ml-1.5 text-[9px] font-extrabold text-green-600 dark:text-green-400 uppercase bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded">nuovo</span> :
                      changeType === "modified" ? <span className="ml-1.5 text-[9px] font-extrabold text-blue-600 dark:text-blue-400 uppercase bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded">modificato</span> :
                      changeType === "removed" ? <span className="ml-1.5 text-[9px] font-extrabold text-red-600 dark:text-red-400 uppercase bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded">rimosso</span> : null;

  const showDiff = changeType === "modified" && typeof value === "string" && typeof previousValue === "string";
  const showAdded = changeType === "added" && typeof value === "string";
  const showRemoved = changeType === "removed" && typeof previousValue === "string";

  return (
    <div className={`${className} ${changeClass}`}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
        {label}{changeBadge}
      </span>
      <span className="mt-0.5 block text-[18px] font-bold">
        {showDiff ? (
          <InlineDiff current={value as string} previous={previousValue as string} />
        ) : showAdded ? (
          <span className="text-green-600 dark:text-green-400 underline font-extrabold">{value}</span>
        ) : showRemoved ? (
          <span className="text-red-600 dark:text-red-400 line-through font-extrabold">{previousValue}</span>
        ) : (
          value || "—"
        )}
      </span>
    </div>
  );
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return String(a) === String(b);
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v: any, i: number) => deepEqual(v, b[i]));
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  const allKeys = new Set([...keysA, ...keysB]);
  for (const k of allKeys) {
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function computeFieldChange(currentVal: any, prevVal: any): ChangeType {
  const curEmpty = currentVal == null || currentVal === "" || (typeof currentVal === "object" && Object.keys(currentVal).length === 0);
  const prevEmpty = prevVal == null || prevVal === "" || (typeof prevVal === "object" && Object.keys(prevVal).length === 0);
  if (curEmpty && prevEmpty) return null;
  if (curEmpty && !prevEmpty) return "removed";
  if (!curEmpty && prevEmpty) return "added";
  if (!deepEqual(currentVal, prevVal)) return "modified";
  return null;
}

interface VersionRow {
  id: number;
  jobOrderId: number;
  versionNumber: number;
  snapshot: Record<string, unknown> | null;
  modifiedByUserId: number | null;
  modifiedByName: string | null;
  changeNotes: string | null;
  changeSummary: string[] | null;
  createdAt: string;
  isCurrent?: boolean;
}

function useOrderChanges(currentOrder: any, versions: VersionRow[] | undefined, showChanges: boolean): { changes: Record<string, ChangeType> | null; prev: any } {
  return useMemo(() => {
    if (!showChanges || !currentOrder || !versions || versions.length < 1) return { changes: null, prev: null };
    const previousVersion = versions.find((v) => !v.isCurrent && v.snapshot);
    const prev = previousVersion?.snapshot;
    if (!prev) return { changes: null, prev: null };

    const changes: Record<string, ChangeType> = {};
    const fieldsToCompare = [
      "settore", "jobCode", "status", "responsibleUserId",
      "deliveryDate", "assemblyDate", "testingDate", "bankName", "notes",
    ];
    for (const f of fieldsToCompare) {
      changes[f] = computeFieldChange(currentOrder[f], prev[f]);
    }

    const jsonbFields = [
      "billingInfo", "shippingInfo", "agentInfo", "shippingTerms",
      "priceSummary", "lineTechnicalData", "logistics",
    ];
    for (const f of jsonbFields) {
      const cur = currentOrder[f];
      const old = prev[f];
      changes[f] = computeFieldChange(cur, old);
      const curObj = (cur && typeof cur === "object") ? cur : {};
      const oldObj = (old && typeof old === "object") ? old : {};
      const allSubKeys = new Set([...Object.keys(curObj), ...Object.keys(oldObj)]);
      for (const k of allSubKeys) {
        changes[`${f}.${k}`] = computeFieldChange(curObj[k], oldObj[k]);
      }
    }

    const arrayFields = ["paymentTerms", "orderItems", "additionalItems", "technicalSheets"];
    for (const f of arrayFields) {
      changes[f] = computeFieldChange(currentOrder[f], prev[f]);
      const curArr = currentOrder[f] ?? [];
      const prevArr = prev[f] ?? [];
      const maxLen = Math.max(curArr.length, prevArr.length);
      for (let i = 0; i < maxLen; i++) {
        if (i >= curArr.length) {
          changes[`${f}[${i}]`] = "removed";
        } else if (i >= prevArr.length) {
          changes[`${f}[${i}]`] = "added";
        } else if (!deepEqual(curArr[i], prevArr[i])) {
          changes[`${f}[${i}]`] = "modified";
        }
      }
    }

    const nestedArraysInJsonb: Record<string, string[]> = {
      logistics: ["shipments", "phases"],
    };
    for (const [parent, arrays] of Object.entries(nestedArraysInJsonb)) {
      const curParent = currentOrder[parent];
      const oldParent = prev[parent];
      for (const arrKey of arrays) {
        const curArr = curParent?.[arrKey] ?? [];
        const prevArr = oldParent?.[arrKey] ?? [];
        changes[`${parent}.${arrKey}`] = computeFieldChange(curArr, prevArr);
        const maxLen = Math.max(curArr.length, prevArr.length);
        for (let i = 0; i < maxLen; i++) {
          const key = `${parent}.${arrKey}[${i}]`;
          if (i >= curArr.length) {
            changes[key] = "removed";
          } else if (i >= prevArr.length) {
            changes[key] = "added";
          } else if (!deepEqual(curArr[i], prevArr[i])) {
            changes[key] = "modified";
            const curItem = curArr[i] && typeof curArr[i] === "object" ? curArr[i] : {};
            const prevItem = prevArr[i] && typeof prevArr[i] === "object" ? prevArr[i] : {};
            const allItemKeys = new Set([...Object.keys(curItem), ...Object.keys(prevItem)]);
            for (const ik of allItemKeys) {
              changes[`${key}.${ik}`] = computeFieldChange(curItem[ik], prevItem[ik]);
            }
          }
        }
      }
    }

    const ltd = currentOrder.lineTechnicalData;
    const prevLtd = prev.lineTechnicalData;
    if (ltd || prevLtd) {
      const deepNested = ["energySources", "performance", "automations", "commissioning"];
      for (const nk of deepNested) {
        const curN = ltd?.[nk];
        const prevN = prevLtd?.[nk];
        changes[`lineTechnicalData.${nk}`] = computeFieldChange(curN, prevN);
        if (curN || prevN) {
          const curObj2 = (curN && typeof curN === "object") ? curN : {};
          const oldObj2 = (prevN && typeof prevN === "object") ? prevN : {};
          const allK = new Set([...Object.keys(curObj2), ...Object.keys(oldObj2)]);
          for (const k of allK) {
            changes[`lineTechnicalData.${nk}.${k}`] = computeFieldChange(curObj2[k], oldObj2[k]);
          }
        }
      }
    }

    return { changes, prev };
  }, [showChanges, currentOrder, versions]);
}

function getPrevValue(prev: any, path: string): any {
  if (!prev) return undefined;
  const parts = path.split(".");
  let val = prev;
  for (const p of parts) {
    if (val == null || typeof val !== "object") return undefined;
    val = val[p];
  }
  return val;
}

function getChange(changes: Record<string, ChangeType> | null, path: string): ChangeType {
  if (!changes) return null;
  return changes[path] ?? null;
}

function sectionHasChanges(changes: Record<string, ChangeType> | null, prefix: string): boolean {
  if (!changes) return false;
  return Object.entries(changes).some(([k, v]) => k.startsWith(prefix) && v != null);
}

function ChangeSummaryDot({ changes, prefix }: { changes: Record<string, ChangeType> | null; prefix: string }) {
  if (!sectionHasChanges(changes, prefix)) return null;
  return <span className="ml-2 inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" /><span className="text-[9px] font-extrabold text-blue-600 dark:text-blue-400 uppercase bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded animate-pulse">modificato</span></span>;
}

function RequestProductionUpdateButton({ orderId }: { orderId: number }) {
  const { toast } = useToast();
  const [sent, setSent] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/orders/${orderId}/request-production-update`);
    },
    onSuccess: (_, __, ___) => {
      setSent(true);
      toast({ title: "Richiesta inviata", description: "Il team produzione riceverà la notifica." });
    },
    onError: () => {
      toast({ title: "Errore nell'invio della richiesta", variant: "destructive" });
    },
  });

  if (sent) {
    return (
      <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1" data-testid="text-update-requested">
        <CheckCircle2 className="w-3.5 h-3.5" /> Richiesta inviata
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-xs h-7 shrink-0"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      data-testid="btn-request-production-update"
    >
      {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
      Richiedi Aggiornamento
    </Button>
  );
}

function ProductionProgressEditor({ orderId, positionIndex, currentPercent, currentNotes }: {
  orderId: number; positionIndex: number; currentPercent: number; currentNotes: string;
}) {
  const [percent, setPercent] = useState(currentPercent);
  const [progressNotes, setProgressNotes] = useState(currentNotes);
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  useEffect(() => { setPercent(currentPercent); setProgressNotes(currentNotes); }, [currentPercent, currentNotes]);

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/orders/${orderId}/production-progress`, {
        positionIndex,
        progressPercent: percent,
        notes: progressNotes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", String(orderId)] });
      setIsEditing(false);
      toast({ title: "Avanzamento aggiornato" });
    },
    onError: () => {
      toast({ title: "Errore nell'aggiornamento", variant: "destructive" });
    },
  });

  if (!isEditing) {
    return (
      <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setIsEditing(true)} data-testid={`btn-edit-progress-${positionIndex}`}>
        <Pencil className="w-3 h-3 mr-1" /> Aggiorna
      </Button>
    );
  }

  return (
    <div className="space-y-2 pt-1 border-t mt-2" data-testid={`production-editor-${positionIndex}`}>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground whitespace-nowrap w-8">{percent}%</span>
        <Slider
          value={[percent]}
          onValueChange={([v]) => setPercent(v)}
          min={0}
          max={100}
          step={5}
          className="flex-1"
          data-testid={`slider-progress-${positionIndex}`}
        />
      </div>
      <Textarea
        value={progressNotes}
        onChange={(e) => setProgressNotes(e.target.value)}
        placeholder="Note avanzamento..."
        className="min-h-[40px] text-sm"
        data-testid={`textarea-progress-notes-${positionIndex}`}
      />
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid={`btn-save-progress-${positionIndex}`}>
          {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
          Salva
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setIsEditing(false); setPercent(currentPercent); setProgressNotes(currentNotes); }} data-testid={`btn-cancel-progress-${positionIndex}`}>
          <X className="w-3 h-3 mr-1" /> Annulla
        </Button>
      </div>
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const { isMaster, role } = useAuth();

  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const isNewMode = !id;
  const offerId = searchParams.get("offerId");
  const customerId = searchParams.get("customerId");

  const layoutFileRef = useRef<HTMLInputElement>(null);
  const confirmationFileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const [docDescription, setDocDescription] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const editing = isEditing || isNewMode;
  const [showVersions, setShowVersions] = useState(false);
  const [showLayoutPdf, setShowLayoutPdf] = useState(false);
  const [previewDocId, setPreviewDocId] = useState<number | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [showChangeOffer, setShowChangeOffer] = useState(false);
  const [compactView, setCompactView] = useState(() => {
    try { return localStorage.getItem("order-view-mode") === "compact"; } catch { return false; }
  });
  const [commentAction, setCommentAction] = useState<"revision" | "reject" | null>(null);
  const [commentText, setCommentText] = useState("");
  const expandedSections: Record<string, boolean> = {
    overview: true, billing: true, pricing: true,
    shipments: true, assembly: true, payments: true,
    techSheets: true, notes: true, timeline: true, production: true,
  };

  const [draft, setDraft] = useState<Record<string, any>>({});

  const { data: previewData, isLoading: isPreviewLoading } = useQuery<any>({
    queryKey: ["/api/orders/preview", offerId, customerId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/preview?offerId=${offerId}&customerId=${customerId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load preview");
      return res.json();
    },
    enabled: isNewMode && !!offerId && !!customerId,
  });

  const { data: order, isLoading: isOrderLoading } = useQuery<any>({
    queryKey: ["/api/orders", id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load order");
      return res.json();
    },
    enabled: !isNewMode && !!id,
  });

  const isLoading = isNewMode ? isPreviewLoading : isOrderLoading;
  const displayData = isNewMode ? previewData : order;

  const isManualOrder = !isNewMode && !!order && !order.offerId;

  const { data: versions } = useQuery<any[]>({
    queryKey: ["/api/orders", id, "versions"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}/versions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load versions");
      return res.json();
    },
    enabled: !isNewMode && !!id,
  });

  const { changes, prev: prevSnapshot } = useOrderChanges(displayData, versions, showChanges && !editing && !isNewMode);

  const { data: salesmenList } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: dealersList } = useQuery<any[]>({
    queryKey: ["/api/dealers"],
    queryFn: async () => {
      const res = await fetch("/api/dealers", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.dealers ?? [];
    },
  });

  const { data: interactionsList } = useQuery<any[]>({
    queryKey: ["/api/interactions", { linkedJobOrderId: id }],
    queryFn: async () => {
      const res = await fetch(`/api/interactions?linkedJobOrderId=${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load interactions");
      return res.json();
    },
    enabled: !isNewMode && !!id,
  });

  const { data: previewPagesData } = useQuery<{ pages: string[] }>({
    queryKey: ["/api/orders", id, "previews"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}/previews`, { credentials: "include" });
      if (!res.ok) return { pages: [] };
      return res.json();
    },
    enabled: !isNewMode && !!id,
  });

  function buildDraftFromData(data: any) {
    return {
      jobNumber: data.jobNumber ?? "",
      status: data.status ?? "active",
      settore: data.settore ?? "Legno",
      jobCode: data.jobCode ?? "",
      agentInfo: data.agentInfo ?? { code: "" },
      billingInfo: data.billingInfo ?? { name: "", city: "", address: "", country: "", vatId: "", phone: "", fax: "" },
      shippingInfo: data.shippingInfo ?? { name: "", city: "", address: "", country: "", phone: "", fax: "" },
      paymentTerms: data.paymentTerms ?? [],
      invoicing: data.invoicing ?? [],
      bankName: data.bankName ?? "",
      orderItems: data.orderItems ?? [],
      additionalItems: data.additionalItems ?? [],
      priceSummary: data.priceSummary ?? { machinesTotal: 0, assemblyPrice: 0, assemblyNotes: "", transportPrice: 0, transportNotes: "", totalOrderPrice: 0 },
      shippingTerms: data.shippingTerms ?? { incoterms: "", exchangeRate: null, packaging: "" },
      lineTechnicalData: data.lineTechnicalData ?? null,
      technicalSheets: data.technicalSheets ?? [],
      logistics: data.logistics ?? null,
      notes: data.notes ?? "",
      responsibleUserId: data.responsibleUserId ?? null,
    };
  }

  useEffect(() => {
    if (displayData && (!isEditing || isNewMode)) {
      setDraft(buildDraftFromData(displayData));
    }
  }, [displayData]);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          offerId: Number(offerId),
          customerId: Number(customerId),
          ...data,
        }),
      });
      if (!res.ok) throw new Error("Failed to create order");
      return res.json();
    },
    onSuccess: (newOrder) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Commessa creata", description: `Numero: ${newOrder.jobNumber}` });
      setLocation(`/orders/${newOrder.id}`);
    },
    onError: () => {
      toast({ title: "Errore nella creazione", description: "Riprova.", variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      await apiRequest("PATCH", `/api/orders/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id, "versions"] });
      setIsEditing(false);
      toast({ title: "Ordine salvato" });
    },
    onError: () => {
      toast({ title: "Errore nel salvataggio", description: "Riprova.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/orders/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Commessa spostata nel cestino" });
      setLocation("/orders");
    },
    onError: () => {
      toast({ title: "Errore nell'eliminazione", variant: "destructive" });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/orders/${id}/confirm`);
      if (!res.ok) throw new Error("Confirm failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Commessa confermata dalla direzione" });
    },
    onError: () => {
      toast({ title: "Errore nella conferma", variant: "destructive" });
    },
  });

  const revisionMutation = useMutation({
    mutationFn: async (comment: string) => {
      const res = await apiRequest("PATCH", `/api/orders/${id}/request-revision`, { comment });
      if (!res.ok) throw new Error("Revision request failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Revisione richiesta" });
    },
    onError: () => {
      toast({ title: "Errore nella richiesta di revisione", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (comment: string) => {
      const res = await apiRequest("PATCH", `/api/orders/${id}/reject`, { comment });
      if (!res.ok) throw new Error("Reject failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Ordine rifiutato" });
    },
    onError: () => {
      toast({ title: "Errore nel rifiuto", variant: "destructive" });
    },
  });

  const handleSave = () => {
    const payload = {
      ...draft,
    };
    if (isNewMode) {
      createMutation.mutate(payload);
    } else {
      saveMutation.mutate({
        ...payload,
        _createVersion: true,
        _changeNotes: "",
      });
    }
  };

  const isSaving = isNewMode ? createMutation.isPending : saveMutation.isPending;

  const handleCancel = () => {
    if (isNewMode) {
      setLocation(offerId ? `/offers/${offerId}` : "/orders");
      return;
    }
    setIsEditing(false);
    if (order) setDraft(buildDraftFromData(order));
  };

  const startEditing = () => {
    if (order) setDraft(buildDraftFromData(order));
    setIsEditing(true);
  };

  const [openCommentSection, setOpenCommentSection] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const allComments: SectionComment[] = displayData?.sectionComments ?? [];

  const addCommentMutation = useMutation({
    mutationFn: async ({ sectionKey, text }: { sectionKey: string; text: string }) => {
      const newComment: SectionComment = {
        id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sectionKey,
        text,
        userId: user?.id ?? 0,
        userName: [user?.name, user?.surname].filter(Boolean).join(" ") || user?.username || "Utente",
        version: displayData?.currentVersion ?? 1,
        createdAt: new Date().toISOString(),
      };
      const existing: SectionComment[] = displayData?.sectionComments ?? [];
      await apiRequest("PATCH", `/api/orders/${id}`, {
        sectionComments: [...existing, newComment],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
    },
    onError: () => {
      toast({ title: "Errore nel salvataggio commento", variant: "destructive" });
    },
  });

  const handleAddComment = (sectionKey: string) => {
    const text = (commentInputs[sectionKey] || "").trim();
    if (!text) return;
    addCommentMutation.mutate({ sectionKey, text });
    setCommentInputs(prev => ({ ...prev, [sectionKey]: "" }));
  };

  const uploadLayout = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/orders/${id}/layout`, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      toast({ title: "Layout PDF caricato" });
    },
  });

  const uploadOrderConfirmation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/orders/${id}/order-confirmation`, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      toast({ title: "Conferma d'ordine caricata" });
    },
  });

  const uploadDoc = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      if (docDescription) formData.append("description", docDescription);
      const res = await fetch(`/api/orders/${id}/documents`, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      setDocDescription("");
      toast({ title: "Documento caricato" });
    },
  });

  const deleteDoc = useMutation({
    mutationFn: async (docId: number) => {
      await apiRequest("DELETE", `/api/orders/${id}/documents/${docId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      toast({ title: "Documento eliminato" });
    },
  });

  const togglePayment = useMutation({
    mutationFn: async ({ index, paid }: { index: number; paid: boolean }) => {
      await apiRequest("PATCH", `/api/orders/${id}/toggle-payment`, { index, paid });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
    },
  });

  useEffect(() => {
    if (!editing) return;
    const currentItems: OrderLineItem[] = draft.orderItems ?? [];
    const currentSheets: OrderTechnicalSheet[] = draft.technicalSheets ?? [];
    if (currentItems.length === 0) return;

    const sheetMap = new Map(currentSheets.map(s => [s.machinePosition, s]));
    let changed = false;

    const newSheets: OrderTechnicalSheet[] = currentItems.map(item => {
      const existing = sheetMap.get(item.position);
      const optNames = (item.options ?? []).filter(o => o.name).map(o => o.name);

      if (existing) {
        const nameChanged = existing.machineName !== item.description;
        const optsChanged = JSON.stringify(existing.optionals) !== JSON.stringify(optNames);
        if (nameChanged || optsChanged) {
          changed = true;
          return { ...existing, machineName: item.description, optionals: optNames };
        }
        return existing;
      } else {
        changed = true;
        return {
          machinePosition: item.position,
          machineName: item.description,
          lamps: {},
          optionals: optNames,
          spareParts: [],
        };
      }
    });

    if (newSheets.length !== currentSheets.length) changed = true;

    if (changed) {
      setDraft(prev => ({ ...prev, technicalSheets: newSheets }));
    }
  }, [editing, draft.orderItems]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!displayData) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto py-20 text-center">
          <p className="text-muted-foreground">Commessa non trovata.</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation("/orders")}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Torna alle Commesse
          </Button>
        </div>
      </Layout>
    );
  }

  const emptyBilling: OrderBillingInfo = { name: "", city: "", address: "", country: "", vatId: "", phone: "", fax: "" };
  const emptyShipping: OrderShippingInfo = { name: "", city: "", address: "", country: "", phone: "", fax: "" };
  const emptyPricing: OrderPriceSummary = { machinesTotal: 0, assemblyPrice: 0, assemblyNotes: "", transportPrice: 0, transportNotes: "", totalOrderPrice: 0 };
  const emptyShipTerms: OrderShippingTerms = { incoterms: "", exchangeRate: null, packaging: "" };
  const emptyAgent: OrderAgentInfo = { code: "" };
  const emptyPhase: OrderPhaseData = { startDate: "", expectedDurationDays: 0, endDate: "", progressPercent: 0, workers: [], notes: "", certificates: [] };
  const normalizePhase = (p: any): OrderPhaseData => ({
    startDate: p?.startDate ?? "", expectedDurationDays: p?.expectedDurationDays ?? 0,
    endDate: p?.endDate ?? "", progressPercent: p?.progressPercent ?? 0,
    workers: Array.isArray(p?.workers) ? p.workers : [], notes: p?.notes ?? "",
    certificates: Array.isArray(p?.certificates) ? p.certificates : [],
  });
  const normalizeLogistics = (raw: any): OrderLogistics => {
    let phases: AssemblyPhase[] = [];
    if (Array.isArray(raw?.phases) && raw.phases.length > 0) {
      phases = raw.phases.map((p: any) => ({
        ...normalizePhase(p),
        id: p?.id ?? `phase-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        phaseType: p?.phaseType ?? "mechanical",
      }));
    } else if (raw?.mechanicalAssembly || raw?.electricalAssembly || raw?.testing) {
      const hasData = (p: any) => p && (p.startDate || p.endDate || p.progressPercent > 0 || (p.workers?.length > 0) || p.notes);
      if (hasData(raw.mechanicalAssembly)) phases.push({ ...normalizePhase(raw.mechanicalAssembly), id: "migrated-mech", phaseType: "mechanical" });
      if (hasData(raw.electricalAssembly)) phases.push({ ...normalizePhase(raw.electricalAssembly), id: "migrated-elec", phaseType: "electrical" });
      if (hasData(raw.testing)) phases.push({ ...normalizePhase(raw.testing), id: "migrated-test", phaseType: "testing" });
    }
    return {
      contractualDeliveryDate: raw?.contractualDeliveryDate ?? "",
      hasPenalties: raw?.hasPenalties ?? false,
      penaltiesDescription: raw?.penaltiesDescription ?? "",
      contractualAssemblyStartDate: raw?.contractualAssemblyStartDate ?? "",
      contractualTestingEndDate: raw?.contractualTestingEndDate ?? "",
      shipments: Array.isArray(raw?.shipments) ? raw.shipments : [],
      phases,
      timeline: (() => {
        if (Array.isArray(raw?.timeline) && raw.timeline.length > 0) {
          const deprecatedEmpty = new Set(["preliminary_drawings", "final_drawings", "technical_meeting"]);
          const deprecatedAssembly = new Set(["mechanical_assembly", "electrical_assembly", "testing"]);
          return raw.timeline
            .filter((e: any) => {
              if (deprecatedEmpty.has(e?.type) && !e?.plannedDate && !e?.actualDate && !e?.notes) return false;
              if (deprecatedAssembly.has(e?.type) && e?.id && !String(e.id).startsWith("evt-phase-") && !e?.plannedDate && !e?.actualDate && !e?.notes) return false;
              if (e?.type === "delivery" && e?.id && !String(e.id).startsWith("evt-shipment-") && !e?.plannedDate && !e?.actualDate && !e?.notes) return false;
              return true;
            })
            .map((e: any) => ({
              id: e?.id ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: e?.type ?? "custom",
              label: e?.label ?? "Fase",
              plannedDate: e?.plannedDate ?? "",
              actualDate: e?.actualDate ?? "",
              status: (["pending", "in_progress", "completed", "skipped"].includes(e?.status) ? e.status : "pending") as TimelineEventStatus,
              notes: e?.notes ?? "",
              autoCalculated: e?.autoCalculated ?? false,
            }));
        }
        const cdd = raw?.contractualDeliveryDate ?? "";
        const cte = raw?.contractualTestingEndDate ?? "";
        return [
          { id: "evt-order", type: "order_date", label: "Data Ordine", plannedDate: "", actualDate: "", status: "completed" as TimelineEventStatus, notes: "", autoCalculated: false },
          { id: "evt-contract-del", type: "contractual_delivery", label: "Consegna da Contratto", plannedDate: cdd, actualDate: "", status: "pending" as TimelineEventStatus, notes: "", autoCalculated: false },
          { id: "evt-contract-test", type: "contractual_testing", label: "Collaudo da Contratto", plannedDate: cte, actualDate: "", status: "pending" as TimelineEventStatus, notes: "", autoCalculated: false },
        ];
      })(),
    };
  };
  const emptyLogistics: OrderLogistics = normalizeLogistics(null);

  const billing: OrderBillingInfo = (editing ? draft.billingInfo : displayData.billingInfo) ?? emptyBilling;
  const shipping: OrderShippingInfo = (editing ? draft.shippingInfo : displayData.shippingInfo) ?? emptyShipping;
  const oItems: OrderLineItem[] = (editing ? draft.orderItems : displayData.orderItems) ?? [];
  const addItems: OrderLineItem[] = (editing ? draft.additionalItems : displayData.additionalItems) ?? [];
  const pricing: OrderPriceSummary = (editing ? draft.priceSummary : displayData.priceSummary) ?? emptyPricing;
  const shipTerms: OrderShippingTerms = (editing ? draft.shippingTerms : displayData.shippingTerms) ?? emptyShipTerms;
  const agent: OrderAgentInfo = (editing ? draft.agentInfo : displayData.agentInfo) ?? emptyAgent;
  const payments: OrderPaymentTerm[] = (editing ? draft.paymentTerms : displayData.paymentTerms) ?? [];
  const lineTechData: OrderLineTechnicalData | null = (editing ? draft.lineTechnicalData : displayData.lineTechnicalData) ?? null;
  const techSheets: OrderTechnicalSheet[] = (editing ? draft.technicalSheets : displayData.technicalSheets) ?? [];
  const notes: string = (editing ? draft.notes : displayData.notes) ?? "";
  const invoicingData: OrderInvoiceEntry[] = (editing ? draft.invoicing : displayData.invoicing) ?? [];
  const logisticsData: OrderLogistics = normalizeLogistics(editing ? draft.logistics : displayData.logistics);
  const currentStatus = (editing ? draft.status : undefined) ?? displayData.status ?? "active";
  const statusLabel = STATUS_OPTIONS.find(s => s.value === currentStatus)?.label || currentStatus;

  const sectionEditable = (sectionKey: string) => (isNewMode || isEditing) && canEditSection(sectionKey, role);
  const ALL_SECTION_KEYS = ["overview", "billing", "shipping", "payments", "pricing", "techData", "techSheets", "logistics", "shipments", "assembly", "timeline", "production", "notes", "documents"];
  const canEditAny = ALL_SECTION_KEYS.some(k => canEditSection(k, role));

  const productionProgress: ProductionProgressEntry[] = displayData?.productionProgress ?? [];

  const SectionHeader = ({ title, icon, sectionKey, changePrefixes }: { title: string; icon: React.ReactNode; sectionKey: string; changePrefixes?: string[] }) => {
    const sectionCmts = allComments.filter(c => c.sectionKey === sectionKey);
    const isOpen = openCommentSection === sectionKey;
    const commentCount = sectionCmts.length;
    const canEdit = canEditSection(sectionKey, role);

    return (
      <div data-testid={`section-header-${sectionKey}`}>
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-bold text-[20px] text-[#000000]">{title}</span>
          {editing && !canEdit && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5" data-testid={`section-locked-${sectionKey}`}>
              <Lock className="w-3 h-3" /> Sola lettura
            </span>
          )}
          {changePrefixes && changePrefixes.some(p => sectionHasChanges(changes, p)) && (
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" title="Sezione modificata" />
          )}
          {editing && (
            <button
              type="button"
              className="relative ml-auto p-1 rounded hover:bg-muted transition-colors group"
              onClick={() => setOpenCommentSection(isOpen ? null : sectionKey)}
              title={commentCount > 0 ? `${commentCount} commento/i` : "Aggiungi commento"}
              data-testid={`btn-comment-${sectionKey}`}
            >
              <MessageSquare className={`w-4 h-4 ${commentCount > 0 ? "text-blue-500" : "text-muted-foreground group-hover:text-foreground"}`} />
              {commentCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 text-[9px] font-bold rounded-full bg-blue-500 text-white flex items-center justify-center">
                  {commentCount}
                </span>
              )}
            </button>
          )}
        </div>
        {editing && isOpen && (
          <div className="mt-3 border rounded-lg p-3 bg-muted/30 space-y-3" data-testid={`comments-panel-${sectionKey}`}>
            {sectionCmts.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {sectionCmts.map(c => (
                  <div key={c.id} className="bg-background rounded-md p-2.5 border text-sm space-y-1">
                    <p className="text-foreground whitespace-pre-wrap">{c.text}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-medium">{c.userName}</span>
                      <span>•</span>
                      <span>{fmtDateTime(c.createdAt)}</span>
                      <span>•</span>
                      <span>v{displayVersion(c.version)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nessun commento per questa sezione.</p>
            )}
            {!isNewMode && (
              <div className="flex gap-2">
                <Input
                  placeholder="Scrivi un commento..."
                  value={commentInputs[sectionKey] || ""}
                  onChange={e => setCommentInputs(prev => ({ ...prev, [sectionKey]: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(sectionKey); } }}
                  className="flex-1 text-sm h-8"
                  data-testid={`input-comment-${sectionKey}`}
                />
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 px-3"
                  disabled={!(commentInputs[sectionKey] || "").trim() || addCommentMutation.isPending}
                  onClick={() => handleAddComment(sectionKey)}
                  data-testid={`btn-send-comment-${sectionKey}`}
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const updateDraft = (key: string, value: any) => setDraft(prev => ({ ...prev, [key]: value }));

  const syncTimelineFromLogistics = (merged: OrderLogistics): TimelineEvent[] => {
    let tl: TimelineEvent[] = Array.isArray(merged.timeline) ? [...merged.timeline] : [];
    const syncDateToTimeline = (type: string, date: string) => {
      const idx = tl.findIndex(e => e.type === type);
      if (idx >= 0) tl[idx] = { ...tl[idx], plannedDate: date };
    };
    if (merged.contractualDeliveryDate !== undefined) syncDateToTimeline("contractual_delivery", merged.contractualDeliveryDate);
    if (merged.contractualTestingEndDate !== undefined) syncDateToTimeline("contractual_testing", merged.contractualTestingEndDate);
    if (merged.contractualAssemblyStartDate !== undefined) syncDateToTimeline("mechanical_assembly", merged.contractualAssemblyStartDate);

    const existingShipmentIds = new Set(tl.filter(e => e.type === "delivery").map(e => e.id));
    const shipments = merged.shipments ?? [];
    const activeShipmentIds = new Set(shipments.map((_: any, i: number) => `evt-shipment-${i}`));
    tl = tl.filter(e => e.type !== "delivery" || activeShipmentIds.has(e.id));
    shipments.forEach((s: any, i: number) => {
      const evtId = `evt-shipment-${i}`;
      if (!existingShipmentIds.has(evtId)) {
        tl.push({
          id: evtId, type: "delivery", label: `Consegna ${i + 1}`,
          plannedDate: s.date || "", actualDate: s.date || "", status: s.date ? "completed" : "pending",
          notes: s.description || "", autoCalculated: false,
        });
      } else {
        const idx = tl.findIndex(e => e.id === evtId);
        if (idx >= 0) {
          tl[idx] = { ...tl[idx], label: `Consegna ${i + 1}`, plannedDate: s.date || tl[idx].plannedDate, notes: s.description || tl[idx].notes };
        }
      }
    });

    const phaseTypeLabels: Record<string, string> = { mechanical: "Montaggio Meccanico", electrical: "Montaggio Elettrico", testing: "Collaudo" };
    const phaseTypeToTimeline: Record<string, string> = { mechanical: "mechanical_assembly", electrical: "electrical_assembly", testing: "testing" };
    const existingPhaseIds = new Set(tl.filter(e => ["mechanical_assembly", "electrical_assembly", "testing"].includes(e.type)).map(e => e.id));
    const phases = merged.phases ?? [];
    const activePhaseIds = new Set(phases.map((p: any) => `evt-phase-${p.id}`));
    tl = tl.filter(e => !["mechanical_assembly", "electrical_assembly", "testing"].includes(e.type) || activePhaseIds.has(e.id));
    phases.forEach((p: any) => {
      const evtId = `evt-phase-${p.id}`;
      const evtType = phaseTypeToTimeline[p.phaseType] || "mechanical_assembly";
      if (!existingPhaseIds.has(evtId)) {
        tl.push({
          id: evtId, type: evtType, label: phaseTypeLabels[p.phaseType] || p.phaseType,
          plannedDate: p.startDate || "", actualDate: "", status: p.progressPercent >= 100 ? "completed" : p.progressPercent > 0 ? "in_progress" : "pending",
          notes: p.notes || "", autoCalculated: false,
        });
      } else {
        const idx = tl.findIndex(e => e.id === evtId);
        if (idx >= 0) {
          tl[idx] = { ...tl[idx], type: evtType, label: phaseTypeLabels[p.phaseType] || tl[idx].label, plannedDate: p.startDate || tl[idx].plannedDate };
        }
      }
    });

    return tl;
  };

  const updateLogisticsWithSync = (updates: Partial<OrderLogistics>) => {
    const merged = { ...logisticsData, ...updates };
    merged.timeline = syncTimelineFromLogistics(merged);
    updateDraft("logistics", merged);
  };


  const layoutDocsBlock = !isNewMode ? (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card data-testid="card-layout" className={showLayoutPdf ? "lg:col-span-2" : ""}>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-base flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Layout PDF</span>
            <div>
              <input ref={layoutFileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) uploadLayout.mutate(e.target.files[0]); }} />
              <Button variant="outline" size="sm" onClick={() => layoutFileRef.current?.click()} disabled={uploadLayout.isPending} data-testid="btn-upload-layout">
                {uploadLayout.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                {displayData.layoutPdfFilename ? "Sostituisci" : "Carica"}
              </Button>
            </div>
          </div>
          {displayData.layoutPdfFilename ? (
            <>
              <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-md border">
                <FileText className="w-5 h-5 text-red-500 shrink-0" />
                <span className="text-sm font-medium flex-1 truncate">{displayData.layoutPdfOriginalName || displayData.layoutPdfFilename}</span>
                <Button variant="ghost" size="sm" onClick={() => setShowLayoutPdf(!showLayoutPdf)} data-testid="btn-toggle-layout-pdf">
                  {showLayoutPdf ? <X className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
                  {showLayoutPdf ? "Chiudi" : "Apri"}
                </Button>
              </div>
              {showLayoutPdf && (
                <PdfViewer
                  src={`/order-layouts/${displayData.layoutPdfFilename}`}
                  title="Layout PDF"
                  testId="layout-pdf-viewer"
                />
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nessun layout PDF caricato.</p>
          )}
        </CardContent>
      </Card>

      {previewPagesData && previewPagesData.pages.length > 0 && (
        <Card data-testid="card-document-preview" className="lg:col-span-2">
          <CardContent className="pt-4 space-y-3">
            <span className="font-semibold text-base flex items-center gap-2"><Eye className="w-5 h-5 text-primary" /> Anteprima Documento Originale</span>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {previewPagesData.pages.map((pagePath: string, idx: number) => (
                <a
                  key={idx}
                  href={pagePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative border rounded-lg overflow-hidden bg-muted/20 hover:shadow-md transition-shadow aspect-[210/297]"
                  data-testid={`preview-page-${idx}`}
                >
                  <img
                    src={pagePath}
                    alt={`Pagina ${idx + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                    <span className="text-[10px] text-white font-medium">Pag. {idx + 1}</span>
                  </div>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow" />
                  </div>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-documents" className={previewDocId != null ? "lg:col-span-2" : ""}>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-base flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Documenti</span>
            <div className="flex items-center gap-2">
              <Input placeholder="Descrizione" value={docDescription} onChange={(e) => setDocDescription(e.target.value)} className="w-32 h-8 text-xs" data-testid="input-doc-description" />
              <input ref={docFileRef} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) uploadDoc.mutate(e.target.files[0]); }} />
              <Button variant="outline" size="sm" onClick={() => docFileRef.current?.click()} disabled={uploadDoc.isPending} data-testid="btn-upload-doc">
                {uploadDoc.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                Aggiungi
              </Button>
            </div>
          </div>
          {displayData.documents && displayData.documents.length > 0 ? (
            <div className="space-y-2">
              {displayData.documents.map((doc: any) => {
                const name = (doc.originalName || doc.filename || "").toLowerCase();
                const isPdf = /\.pdf$/i.test(name);
                const isImage = /\.(jpe?g|png|gif|webp|svg|bmp|tiff?)$/i.test(name);
                const canPreview = isPdf || isImage;
                const isOpen = previewDocId === doc.id;
                return (
                  <div key={doc.id} className="space-y-2">
                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md border" data-testid={`doc-row-${doc.id}`}>
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.originalName}</p>
                        {doc.description && <p className="text-xs text-muted-foreground">{doc.description}</p>}
                      </div>
                      {canPreview && (
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setPreviewDocId(isOpen ? null : doc.id)} data-testid={`btn-preview-doc-${doc.id}`}>
                          {isOpen ? <X className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
                          <span className="text-xs">{isOpen ? "Chiudi" : "Apri"}</span>
                        </Button>
                      )}
                      <a href={`/order-documents/${doc.filename}`} download>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid={`btn-download-doc-${doc.id}`}><Download className="w-3.5 h-3.5" /></Button>
                      </a>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteDoc.mutate(doc.id)} data-testid={`btn-delete-doc-${doc.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {isOpen && isPdf && (
                      <PdfViewer
                        src={`/order-documents/${doc.filename}`}
                        title={doc.originalName}
                        testId={`doc-pdf-viewer-${doc.id}`}
                      />
                    )}
                    {isOpen && isImage && (
                      <div
                        className="rounded-md border overflow-hidden bg-muted/10 p-4 flex justify-center"
                        style={{ resize: "vertical", overflow: "auto", minHeight: "200px" }}
                        data-testid={`doc-img-viewer-${doc.id}`}
                      >
                        <img
                          src={`/order-documents/${doc.filename}`}
                          alt={doc.originalName}
                          className="max-w-full object-contain"
                          style={{ maxHeight: "85vh" }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nessun documento.</p>
          )}
        </CardContent>
      </Card>
    </div>
  ) : null;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-5 pb-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/orders")} data-testid="btn-back-orders">
            <ChevronLeft className="w-4 h-4 mr-1" /> Commesse
          </Button>
        </div>

        {/* ── HEADER BAR ── */}
        <div className="flex flex-wrap items-center gap-3">
          {sectionEditable("overview") ? (
            <>
              <Input
                value={draft.jobNumber ?? ""}
                onChange={(e) => updateDraft("jobNumber", e.target.value)}
                placeholder={isNewMode ? "Nome commessa (es. JOB-2026-005)" : "Nome commessa"}
                className="text-2xl font-bold font-mono h-10 w-[320px] border-dashed"
                data-testid="input-job-number"
              />
              {isNewMode && (
                <Badge variant="secondary" className="text-sm bg-amber-100 text-amber-700">Bozza</Badge>
              )}
              {isNewMode && displayData.offerRef && (
                <Badge variant="outline" className="text-xs">da {displayData.offerRef}</Badge>
              )}
              {!isNewMode && (
                <Badge variant="outline" className="text-xs font-mono">v{displayVersion(displayData.currentVersion)}</Badge>
              )}
            </>
          ) : (
            <>
              <h1 className="font-mono text-[30px] font-extrabold" data-testid="text-job-number">{displayData.jobNumber}</h1>
              <Badge variant="outline" className="font-mono font-extrabold text-[#000000] text-[18px]">v{displayVersion(displayData.currentVersion)}</Badge>
            </>
          )}
          <div className="flex-1" />

          {isNewMode ? (
            <>
              <Button variant="default" size="sm" onClick={handleSave} disabled={isSaving} data-testid="btn-save">
                {isSaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                Crea Commessa
              </Button>
              <Button variant="outline" size="sm" onClick={handleCancel} data-testid="btn-cancel-edit">
                <X className="w-4 h-4 mr-1.5" /> Annulla
              </Button>
            </>
          ) : (
            <>
              <Button
                variant={compactView ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const next = !compactView;
                  setCompactView(next);
                  try { localStorage.setItem("order-view-mode", next ? "compact" : "extended"); } catch {}
                }}
                data-testid="btn-toggle-compact"
              >
                <Layers className="w-4 h-4 mr-1.5" /> {compactView ? "Estesa" : "Compatta"}
              </Button>
              {canEditAny && !isEditing && (
                <Button variant="outline" size="sm" onClick={() => { if (compactView) { setCompactView(false); try { localStorage.setItem("order-view-mode", "extended"); } catch {} } startEditing(); }} data-testid="btn-edit">
                  <Pencil className="w-4 h-4 mr-1.5" /> Modifica
                </Button>
              )}
              <Link href={`/orders/${id}/pdf-review`}>
                <Button variant="outline" size="sm" data-testid="btn-print-pdf">
                  <Printer className="w-4 h-4 mr-1.5" /> Stampa PDF
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={() => setShowVersions(!showVersions)} data-testid="btn-versions">
                <History className="w-4 h-4 mr-1.5" /> Versioni ({(versions?.length ?? 0)})
              </Button>
              {versions && versions.length >= 1 && (
                <Button
                  variant={showChanges ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowChanges(!showChanges)}
                  data-testid="btn-show-changes"
                  className={showChanges ? "bg-blue-600 hover:bg-blue-700" : ""}
                >
                  <Eye className="w-4 h-4 mr-1.5" /> {showChanges ? "Nascondi Modifiche" : "Mostra Modifiche"}
                </Button>
              )}
              <InlineConfirm
                trigger={
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" data-testid="btn-delete-order">
                    <Trash2 className="w-4 h-4 mr-1.5" /> Elimina
                  </Button>
                }
                title="Spostare nel cestino?"
                description="La commessa verrà spostata nel cestino e potrà essere ripristinata in seguito."
                confirmLabel="Elimina"
                cancelLabel="Annulla"
                onConfirm={() => deleteMutation.mutate()}
                isPending={deleteMutation.isPending}
              />
            </>
          )}
        </div>

        {/* ── VERSION INFO BAR ── */}
        {!isNewMode && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground border-b pb-2">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Ultima modifica: {fmtDateTime(displayData.updatedAt)}</span>
            {displayData.lastModifiedByName && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {displayData.lastModifiedByName}</span>}
            <span>Salvataggi effettuati: <strong>{displayVersion(displayData.currentVersion)}</strong></span>
            {isManualOrder && (
              <Badge variant="secondary" className="text-[10px]">Ordine Interno</Badge>
            )}
            {displayData.offerId && (
              <Link href={`/offers/${displayData.offerId}`}>
                <span className="flex items-center gap-1 text-primary hover:underline cursor-pointer">
                  <FileText className="w-3.5 h-3.5" /> Offerta {displayData.offerRef || `#${displayData.offerId}`}
                  <ExternalLink className="w-3 h-3" />
                </span>
              </Link>
            )}
            {displayData.offerId && !editing && (
              <button
                onClick={() => setShowChangeOffer(!showChangeOffer)}
                className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                data-testid="btn-toggle-change-offer"
              >
                <History className="w-3 h-3" /> {showChangeOffer ? "Chiudi" : "Cambia Offerta"}
              </button>
            )}
            {(displayData.offerHistory ?? []).length > 0 && (
              <span className="text-[10px] text-muted-foreground">({(displayData.offerHistory ?? []).length} precedent{(displayData.offerHistory ?? []).length === 1 ? "e" : "i"})</span>
            )}
            {!editing && (
              <>
                <input ref={confirmationFileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { uploadOrderConfirmation.mutate(e.target.files[0]); e.target.value = ""; } }} />
                <button
                  onClick={() => confirmationFileRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  disabled={uploadOrderConfirmation.isPending}
                  data-testid="btn-upload-order-confirmation"
                >
                  {uploadOrderConfirmation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  {displayData.orderConfirmationFilename ? "Sostituisci Conferma" : "Carica Conferma d'Ordine"}
                </button>
                {displayData.orderConfirmationFilename && (
                  <a
                    href={`/order-confirmations/${displayData.orderConfirmationFilename}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:underline cursor-pointer"
                    data-testid="link-view-order-confirmation"
                  >
                    <Eye className="w-3 h-3" />
                    {displayData.orderConfirmationOriginalName || "Conferma d'Ordine"}
                  </a>
                )}
              </>
            )}
          </div>
        )}
        {isNewMode && displayData.offerRef && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground border-b pb-2">
            <Link href={`/offers/${offerId}`}>
              <span className="flex items-center gap-1 text-primary hover:underline cursor-pointer">
                <FileText className="w-3.5 h-3.5" /> Offerta {displayData.offerRef}
                <ExternalLink className="w-3 h-3" />
              </span>
            </Link>
            {displayData.customerName && <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {displayData.customerName}</span>}
          </div>
        )}

        {/* ── CONFIRMATION STATUS BOX ── */}
        {!isNewMode && (() => {
          const confStatus = displayData.confirmationStatus ?? "pending";
          const isConfirmed = confStatus === "confirmed";
          const isRevision = confStatus === "revision_requested";
          const isRejected = confStatus === "rejected";
          const isPending = confStatus === "pending";

          const statusConfig = isConfirmed
            ? { bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-300 dark:border-green-700", icon: <ShieldCheck className="w-5 h-5 shrink-0 text-green-600 dark:text-green-400" />, text: "Confermato", textClass: "text-green-700 dark:text-green-300" }
            : isRevision
            ? { bg: "bg-orange-50 dark:bg-orange-950/30", border: "border-orange-300 dark:border-orange-700", icon: <RotateCcw className="w-5 h-5 shrink-0 text-orange-600 dark:text-orange-400" />, text: "Revisione Richiesta", textClass: "text-orange-700 dark:text-orange-300" }
            : isRejected
            ? { bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-300 dark:border-red-700", icon: <XCircle className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400" />, text: "Rifiutato", textClass: "text-red-700 dark:text-red-300" }
            : { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-300 dark:border-amber-700", icon: <ShieldCheck className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />, text: "In attesa di conferma", textClass: "text-amber-700 dark:text-amber-300" };

          

          const handleSubmitComment = () => {
            if (commentAction === "revision") {
              revisionMutation.mutate(commentText, { onSuccess: () => { setCommentAction(null); setCommentText(""); } });
            } else if (commentAction === "reject") {
              rejectMutation.mutate(commentText, { onSuccess: () => { setCommentAction(null); setCommentText(""); } });
            }
          };

          return (
            <div className={`rounded-lg border ${statusConfig.bg} ${statusConfig.border}`} data-testid="box-confirmation-status">
              <div className="flex items-center gap-3 px-4 py-3">
                {statusConfig.icon}
                <span className={`text-sm font-semibold ${statusConfig.textClass}`}>
                  {statusConfig.text}
                </span>
                {isConfirmed && displayData.confirmedAt && (
                  <span className="text-xs text-green-600 dark:text-green-400 ml-auto">
                    {fmtDateTime(displayData.confirmedAt)}
                  </span>
                )}
                {(isPending || isRevision || isRejected) && isMaster && !editing && !commentAction && (
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                      onClick={() => confirmMutation.mutate()}
                      disabled={confirmMutation.isPending}
                      data-testid="btn-confirm-order"
                    >
                      {confirmMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Conferma
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-600 dark:text-orange-400 dark:hover:bg-orange-950/50"
                      onClick={() => { setCommentAction("revision"); setCommentText(""); }}
                      data-testid="btn-request-revision"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Revisione
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-950/50"
                      onClick={() => { setCommentAction("reject"); setCommentText(""); }}
                      data-testid="btn-reject-order"
                    >
                      <XCircle className="w-4 h-4" />
                      Rifiuta
                    </Button>
                  </div>
                )}
              </div>

              {(isRevision || isRejected) && displayData.confirmationComment && !commentAction && (
                <div className={`mx-4 mb-3 p-3 rounded-md border ${isRevision ? "bg-orange-100/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800" : "bg-red-100/50 dark:bg-red-950/20 border-red-200 dark:border-red-800"}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${isRevision ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400"}`}>
                    {isRevision ? "Commento revisione" : "Motivo rifiuto"}
                  </p>
                  <p className="text-sm whitespace-pre-line" data-testid="text-confirmation-comment">{displayData.confirmationComment}</p>
                  {displayData.confirmedAt && (
                    <p className={`text-[10px] mt-1 ${isRevision ? "text-orange-500 dark:text-orange-500" : "text-red-500 dark:text-red-500"}`}>{fmtDateTime(displayData.confirmedAt)}</p>
                  )}
                </div>
              )}

              {commentAction && (
                <div className="mx-4 mb-3 p-3 rounded-md border bg-background space-y-2">
                  <p className="text-sm font-semibold">
                    {commentAction === "revision" ? "Commento per la revisione" : "Motivo del rifiuto"}
                  </p>
                  <Textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={commentAction === "revision" ? "Descrivi le modifiche richieste..." : "Indica il motivo del rifiuto..."}
                    className="min-h-[80px] text-sm"
                    data-testid="textarea-confirmation-comment"
                    autoFocus
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCommentAction(null)}
                      data-testid="btn-cancel-comment"
                    >
                      Annulla
                    </Button>
                    <Button
                      size="sm"
                      className={commentAction === "revision"
                        ? "bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
                        : "bg-red-600 hover:bg-red-700 text-white gap-1.5"
                      }
                      onClick={handleSubmitComment}
                      disabled={!commentText.trim() || revisionMutation.isPending || rejectMutation.isPending}
                      data-testid="btn-submit-comment"
                    >
                      {(revisionMutation.isPending || rejectMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : (commentAction === "revision" ? <RotateCcw className="w-4 h-4" /> : <XCircle className="w-4 h-4" />)}
                      {commentAction === "revision" ? "Richiedi Revisione" : "Rifiuta Ordine"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── VERSION HISTORY (inline) ── */}
        {showChangeOffer && !isNewMode && !editing && (
          <ChangeOfferSection
            orderId={Number(id)}
            currentOfferId={displayData.offerId}
            currentOfferRef={displayData.offerRef}
            customerId={displayData.customerId}
            offerHistory={displayData.offerHistory ?? []}
            onComplete={() => { setShowChangeOffer(false); queryClient.invalidateQueries({ queryKey: ["/api/orders", id] }); }}
          />
        )}

        {showVersions && versions && versions.length > 0 && (
          <Card data-testid="card-versions">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <History className="w-5 h-5 text-primary" />
                <span className="font-semibold text-base">Storico Versioni</span>
              </div>
              <div className="space-y-2">
                {(versions as VersionRow[]).map((v, idx) => {
                  const isCurrent = v.isCurrent;
                  return (
                    <div key={v.id ?? `current-${idx}`} className={`p-3 rounded-lg ${isCurrent ? "border-2 border-primary/30 bg-primary/5" : "border bg-muted/20"}`} data-testid={isCurrent ? "version-row-current" : `version-row-${v.versionNumber}`}>
                      <div className="flex items-center gap-3">
                        <Badge variant={isCurrent ? "default" : "outline"} className={`font-mono text-xs shrink-0 ${isCurrent ? "bg-primary text-primary-foreground" : ""}`}>
                          v{displayVersion(v.versionNumber)}{isCurrent ? " — Attuale" : ""}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium">{v.modifiedByName || "—"}</span>
                            <span className="text-muted-foreground text-xs">{fmtDateTime(v.createdAt)}</span>
                          </div>
                          {isCurrent ? (
                            <p className="text-xs text-muted-foreground mt-0.5">Stato corrente della commessa — quello che stai visualizzando</p>
                          ) : (
                            v.changeNotes && <p className="text-xs text-muted-foreground mt-0.5">{v.changeNotes}</p>
                          )}
                        </div>
                        {!isCurrent && (
                          <Link href={`/orders/${id}/version/${v.versionNumber}`}>
                            <Button variant="ghost" size="sm" data-testid={`btn-view-version-${v.versionNumber}`}>
                              <Eye className="w-3.5 h-3.5 mr-1" /> Vedi
                            </Button>
                          </Link>
                        )}
                      </div>
                      {v.changeSummary && v.changeSummary.length > 0 && (
                        <ul className="mt-2 ml-9 space-y-0.5">
                          {v.changeSummary.map((change: string, ci: number) => (
                            <li key={ci} className="text-xs text-muted-foreground flex items-start gap-1.5" data-testid={`version-change-${isCurrent ? "current" : v.versionNumber}-${ci}`}>
                              <span className="text-primary mt-0.5 shrink-0">•</span>
                              <span>{change}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {showChanges && changes && !editing && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3" data-testid="changes-legend">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1.5">Modifiche rispetto alla versione precedente</p>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="text-green-600 dark:text-green-400 underline font-medium">Testo aggiunto</span></span>
              <span className="flex items-center gap-1.5"><span className="text-red-600 dark:text-red-400 line-through font-medium">Testo rimosso</span></span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-500 inline-block" /> <span className="text-blue-700 dark:text-blue-400 font-medium">Sezione modificata</span></span>
            </div>
          </div>
        )}

        {/* ── COMPACT VIEW ── */}
        {compactView && !editing && !isNewMode && (
          <OrderCompactView
            jobNumber={displayData.jobNumber}
            currentVersion={displayData.currentVersion}
            customerName={displayData.customerName ?? ""}
            status={currentStatus}
            createdAt={displayData.createdAt}
            billing={billing}
            shipping={shipping}
            items={oItems}
            pricing={pricing}
            payments={payments}
            logistics={logisticsData}
            invoicing={invoicingData}
            notes={notes}
            slotAfterCircles={layoutDocsBlock}
            jobLeader={displayData.jobCode || ""}
            dealerName={agent.dealerCompanyName || ""}
          />
        )}

        {/* ── EXTENDED VIEW ── */}
        {(!compactView || editing || isNewMode) && (<>
        {/* ── COMMESSA BOX ── */}
        <Card data-testid="box-commessa-header">
          <CardContent className="pt-4">
            <p className="font-bold tracking-wide text-[#000000] text-[20px]">
              COMMESSA: <span className="font-mono text-[25px] text-[#ff0000]">{displayData.jobNumber}</span>
              <span className="ml-1 text-[18px] font-bold text-[#000000]">v{displayVersion(displayData.currentVersion)}</span>
              {displayData.customerName && <span className="font-bold text-[#000000cc]"> — {displayData.customerName}</span>}
            </p>
          </CardContent>
        </Card>

        {/* ── MANUAL ORDER READ-ONLY VIEW ── */}
        {isManualOrder && (() => {
          const mfd = displayData.manualFormData ?? {};
          const ps = displayData.priceSummary as any;
          const fmtManualDate = (v: string) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
              const [y, m, d] = v.split("-");
              return `${d}-${m}-${y}`;
            }
            return v;
          };
          const manualField = (label: string, value: any) => (
            value && String(value).trim() ? (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
                <p className="text-sm mt-0.5">{fmtManualDate(String(value))}</p>
              </div>
            ) : null
          );
          const items: { description: string; price: string }[] = mfd.orderItems ?? [];
          const sheets: any[] = mfd.technicalSheets ?? [];
          return (
            <div className="space-y-5">
              <Card data-testid="card-manual-header">
                <CardContent className="pt-4 space-y-4">
                  <span className="font-semibold text-base flex items-center gap-2"><ClipboardList className="w-5 h-5 text-primary" /> Intestazione</span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
                    {manualField("N° Ordine", mfd.orderNumber)}
                    {manualField("Data Ordine", mfd.orderDate)}
                    {manualField("Data Modifica", mfd.modifyDate)}
                    {manualField("Settore", mfd.settore || displayData.settore)}
                    {manualField("Job", mfd.job)}
                    {manualField("Agente", mfd.agent)}
                    {manualField("Provvigione Agente", mfd.agentCommission ? `€ ${mfd.agentCommission}` : null)}
                    {manualField("Agente 2", mfd.agent2Commission ? `€ ${mfd.agent2Commission}` : null)}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-manual-billing">
                <CardContent className="pt-4 space-y-4">
                  <span className="font-semibold text-base flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" /> Fatturazione</span>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                    {manualField("Cliente", mfd.customerName || displayData.customerName)}
                    {manualField("Città", mfd.city)}
                    {manualField("Nazione", mfd.country)}
                    {manualField("Indirizzo", mfd.address)}
                    {manualField("Telefono", mfd.phone)}
                    {manualField("Fax", mfd.fax)}
                  </div>
                </CardContent>
              </Card>

              {mfd.destination && (
                <Card data-testid="card-manual-destination">
                  <CardContent className="pt-4 space-y-4">
                    <span className="font-semibold text-base flex items-center gap-2"><Truck className="w-5 h-5 text-primary" /> Destinazione</span>
                    <p className="text-sm">{mfd.destination}</p>
                  </CardContent>
                </Card>
              )}

              {(mfd.deliveryDate || mfd.paymentTerms) && (
                <Card data-testid="card-manual-payment">
                  <CardContent className="pt-4 space-y-4">
                    <span className="font-semibold text-base flex items-center gap-2"><CreditCard className="w-5 h-5 text-primary" /> Condizioni di Pagamento</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                      {manualField("Consegna", mfd.deliveryDate)}
                      {mfd.paymentTerms && (
                        <div className="md:col-span-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Termini di Pagamento</p>
                          <p className="text-sm mt-0.5 whitespace-pre-line">{mfd.paymentTerms}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {items.length > 0 && items.some(i => i.description) && (
                <Card data-testid="card-manual-items">
                  <CardContent className="pt-4 space-y-4">
                    <span className="font-semibold text-base flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Dettagli Ordine</span>
                    <div className="space-y-1">
                      <div className="grid grid-cols-[1fr_120px] gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 border-b pb-1">
                        <span>Descrizione</span>
                        <span className="text-right">Prezzo €</span>
                      </div>
                      {items.filter((i: any) => i.description).map((item: any, idx: number) => (
                        <div key={idx} className="grid grid-cols-[1fr_120px] gap-2 py-1.5 border-b border-dashed last:border-0" data-testid={`manual-item-${idx}`}>
                          <span className="text-sm">{item.description}</span>
                          <span className="text-sm font-mono text-right">{item.price || "—"}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card data-testid="card-manual-summary">
                <CardContent className="pt-4 space-y-4">
                  <span className="font-semibold text-base flex items-center gap-2"><Settings2 className="w-5 h-5 text-primary" /> Riepilogo</span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
                    {manualField("Totale Macchine", mfd.totalMachines ? `€ ${mfd.totalMachines}` : null)}
                    {manualField("Montaggio e Collaudo", mfd.assemblyAndTesting ? `€ ${mfd.assemblyAndTesting}${mfd.assemblyAndTestingNotes ? ` — ${mfd.assemblyAndTestingNotes}` : ""}` : null)}
                    {manualField("Trasporto", mfd.transport ? `€ ${mfd.transport}` : null)}
                    {manualField("Importo Totale", ps?.totalOrderPrice ? `€ ${ps.totalOrderPrice.toLocaleString("it-IT")}` : (mfd.totalOrder ? `€ ${mfd.totalOrder}` : null))}
                    {manualField("Resa", mfd.resa)}
                    {manualField("Imballo", mfd.packaging)}
                    {manualField("Cambio", mfd.exchangeRate)}
                    {manualField("Anno", mfd.year)}
                  </div>
                </CardContent>
              </Card>

              {sheets.length > 0 && (
                <Card data-testid="card-manual-tech-sheets">
                  <CardContent className="pt-4 space-y-4">
                    <span className="font-semibold text-base flex items-center gap-2"><Wrench className="w-5 h-5 text-primary" /> Schede Tecniche</span>
                    {sheets.map((sheet: any, si: number) => (
                      <div key={si} className="border rounded-lg p-4 space-y-2" data-testid={`manual-tech-sheet-${si}`}>
                        <p className="font-semibold text-sm">{sheet.machineName || `Scheda ${si + 1}`}</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
                          {manualField("N° Scheda", sheet.sheetNumber)}
                          {manualField("Lato Comandi", sheet.commandSide)}
                          {manualField("Larghezza Lavoro", sheet.workWidth ? `${sheet.workWidth} mm` : null)}
                          {manualField("Colore RAL", sheet.colorRAL)}
                          {manualField("Normative", sheet.regulations)}
                          {manualField("Lingua", sheet.language)}
                          {manualField("Riscaldamento", sheet.heatingEnergy)}
                          {manualField("Alimentazione Elettrica", sheet.electricSupply)}
                          {manualField("Alimentazione Pneumatica", sheet.pneumaticSupply)}
                          {manualField("Velocità Lavoro", sheet.workSpeed)}
                          {manualField("Turni", sheet.dailyShifts)}
                          {manualField("Dim. min pezzi", sheet.minPieceDimensions)}
                          {manualField("Dim. max pezzi", sheet.maxPieceDimensions)}
                          {manualField("Altezza Piano Lavoro", sheet.workPlaneHeight)}
                        </div>
                        {sheet.optionals?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Optionals</p>
                            <ul className="mt-1 space-y-0.5">
                              {sheet.optionals.map((o: string, oi: number) => (
                                <li key={oi} className="text-sm">• {o}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {sheet.spareParts?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ricambi</p>
                            <ul className="mt-1 space-y-0.5">
                              {sheet.spareParts.map((s: string, si2: number) => (
                                <li key={si2} className="text-sm">• {s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {sheet.notes && manualField("Note", sheet.notes)}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })()}

        {!isManualOrder && (<>
        {/* ── TIMELINE PROGETTO ── */}
        <Card data-testid="card-timeline">
          <CardContent className="pt-4 space-y-4">
            {SectionHeader({ title: "Timeline Progetto", icon: <Clock className="w-5 h-5 text-primary" />, sectionKey: "timeline", changePrefixes: ["logistics.timeline"] })}
            {expandedSections.timeline && (() => {
              const timelineEvents: TimelineEvent[] = logisticsData.timeline ?? [];
              const sorted = [...timelineEvents].sort((a, b) => {
                const da = a.plannedDate || a.actualDate || "9999";
                const db2 = b.plannedDate || b.actualDate || "9999";
                if (da === db2) return 0;
                if (da === "9999") return 1;
                if (db2 === "9999") return -1;
                return da.localeCompare(db2);
              });

              const updateTimelineEvent = (eventId: string, updates: Partial<TimelineEvent>) => {
                const updated = timelineEvents.map(ev => ev.id === eventId ? { ...ev, ...updates } : ev);
                const merged = { ...logisticsData, timeline: updated };
                const changedEvt = updated.find(e => e.id === eventId);
                if (changedEvt) {
                  const effectiveDate = changedEvt.actualDate || changedEvt.plannedDate || "";
                  if (changedEvt.type === "contractual_delivery") merged.contractualDeliveryDate = effectiveDate;
                  if (changedEvt.type === "contractual_testing") merged.contractualTestingEndDate = effectiveDate;
                  if (changedEvt.type === "mechanical_assembly") merged.contractualAssemblyStartDate = effectiveDate;
                }
                updateDraft("logistics", merged);
              };

              const addCustomEvent = () => {
                const newEvt: TimelineEvent = {
                  id: `evt-custom-${Date.now()}`,
                  type: "custom",
                  label: "Nuova Fase",
                  plannedDate: "",
                  actualDate: "",
                  status: "pending",
                  notes: "",
                  autoCalculated: false,
                };
                updateDraft("logistics", { ...logisticsData, timeline: [...timelineEvents, newEvt] });
              };

              const removeEvent = (eventId: string) => {
                updateDraft("logistics", { ...logisticsData, timeline: timelineEvents.filter(ev => ev.id !== eventId) });
              };

              if (!sectionEditable("timeline")) {
                const PER_ROW = 6;
                const rows: TimelineEvent[][] = [];
                for (let i = 0; i < sorted.length; i += PER_ROW) {
                  rows.push(sorted.slice(i, i + PER_ROW));
                }

                return (
                  <div className="space-y-4" data-testid="timeline-container">
                    {sorted.length === 0 && (
                      <p className="text-sm text-muted-foreground italic py-4">Nessuna fase nella timeline.</p>
                    )}
                    {rows.map((row, rowIdx) => (
                      <div key={rowIdx} className="flex items-start">
                        {row.map((evt, idx) => {
                          const style = TIMELINE_STATUS_STYLES[evt.status];
                          const isLast = idx === row.length - 1;
                          const displayDate = evt.actualDate || evt.plannedDate;
                          const globalIdx = rowIdx * PER_ROW + idx;

                          return (
                            <div key={evt.id} className="flex flex-col items-center flex-1 min-w-0" data-testid={`timeline-event-${evt.id}`}>
                              <div className="flex items-center w-full">
                                {idx > 0 && (() => {
                                  const prevStatus = row[idx - 1].status;
                                  const curStatus = evt.status;
                                  const bothDone = prevStatus === "completed" && curStatus === "completed";
                                  const lineClass = bothDone ? TIMELINE_STATUS_STYLES.completed.line : TIMELINE_STATUS_STYLES.pending.line;
                                  return <div className={`${bothDone ? "h-1 rounded-full" : "h-0.5"} flex-1 ${lineClass}`} />;
                                })()}
                                {idx === 0 && <div className="flex-1" />}
                                <div className={`w-3 h-3 rounded-full border-2 border-background ring-1 ring-background z-10 shrink-0 ${style.dot}`} />
                                {!isLast && (() => {
                                  const curStatus = evt.status;
                                  const nextStatus = row[idx + 1]?.status;
                                  const bothDone = curStatus === "completed" && nextStatus === "completed";
                                  const lineClass = bothDone ? TIMELINE_STATUS_STYLES.completed.line : TIMELINE_STATUS_STYLES.pending.line;
                                  return <div className={`${bothDone ? "h-1 rounded-full" : "h-0.5"} flex-1 ${lineClass}`} />;
                                })()}
                                {isLast && <div className="flex-1" />}
                              </div>
                              <div className="text-center mt-1 px-0.5 w-full">
                                <p className="text-[10px] font-medium leading-tight truncate" title={evt.label}>{evt.label}</p>
                                {displayDate ? (
                                  <p className="text-[9px] font-mono text-muted-foreground">{fmtDate(displayDate)}</p>
                                ) : (
                                  <p className="text-[9px] text-muted-foreground italic">—</p>
                                )}
                                {evt.actualDate && evt.plannedDate && evt.actualDate !== evt.plannedDate && (
                                  <p className="text-[8px] text-muted-foreground line-through">{fmtDate(evt.plannedDate)}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              }

              return (
                <div className="space-y-2" data-testid="timeline-container">
                  {sorted.length === 0 && (
                    <p className="text-sm text-muted-foreground italic py-4">Nessuna fase nella timeline.</p>
                  )}
                  <div className="relative">
                    {sorted.map((evt, idx) => {
                      const style = TIMELINE_STATUS_STYLES[evt.status];
                      const isLast = idx === sorted.length - 1;

                      return (
                        <div key={evt.id} className="flex gap-4 relative" data-testid={`timeline-event-${evt.id}`}>
                          <div className="flex flex-col items-center w-8 shrink-0">
                            <div className={`w-3.5 h-3.5 rounded-full border-2 border-background ring-2 ring-background z-10 ${style.dot}`} />
                            {!isLast && <div className={`w-0.5 flex-1 -mt-0.5 ${style.line}`} />}
                          </div>
                          <div className={`flex-1 pb-6`}>
                            <div className="space-y-2 p-3 border rounded-lg bg-muted/10">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Input
                                  value={evt.label}
                                  onChange={(e) => updateTimelineEvent(evt.id, { label: e.target.value })}
                                  className="text-sm font-medium flex-1 min-w-[150px] h-8"
                                  data-testid={`input-timeline-label-${evt.id}`}
                                />
                                <Select value={evt.status} onValueChange={(v) => updateTimelineEvent(evt.id, { status: v as TimelineEventStatus })}>
                                  <SelectTrigger className="w-[130px] h-8 text-xs" data-testid={`select-timeline-status-${evt.id}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {TIMELINE_STATUS_OPTIONS.map(opt => (
                                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {evt.type === "custom" && (
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive/70" onClick={() => removeEvent(evt.id)} data-testid={`btn-remove-timeline-${evt.id}`}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Pianificata</Label>
                                  <Input type="date" value={evt.plannedDate} onChange={(e) => updateTimelineEvent(evt.id, { plannedDate: e.target.value })} className="text-xs h-7 w-[140px]" data-testid={`input-timeline-planned-${evt.id}`} />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Effettiva</Label>
                                  <Input type="date" value={evt.actualDate} onChange={(e) => updateTimelineEvent(evt.id, { actualDate: e.target.value })} className="text-xs h-7 w-[140px]" data-testid={`input-timeline-actual-${evt.id}`} />
                                </div>
                              </div>
                              <Input value={evt.notes} onChange={(e) => updateTimelineEvent(evt.id, { notes: e.target.value })} placeholder="Note..." className="text-xs h-7" data-testid={`input-timeline-notes-${evt.id}`} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={addCustomEvent} data-testid="btn-add-timeline-event">
                    <Plus className="w-3.5 h-3.5" /> Aggiungi Fase
                  </Button>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* ── OVERVIEW ── */}
        <Card data-testid="card-overview">
          <CardContent className="pt-4 space-y-4">
            {SectionHeader({ title: "Panoramica Ordine", icon: <ClipboardList className="w-5 h-5 text-primary" />, sectionKey: "overview", changePrefixes: ["settore", "jobCode", "status", "responsibleUserId", "agentInfo"] })}
            {expandedSections.overview && (
              <div className="space-y-4 pt-2">
                <div className="grid sm:grid-cols-4 gap-4">
                  {sectionEditable("overview") ? (
                    <>
                      <EditField label="Settore" value={draft.settore ?? ""} onChange={(v) => updateDraft("settore", v)} testId="input-settore" />
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Job (Responsabile)</Label>
                        <Select
                          value={draft.responsibleUserId ? String(draft.responsibleUserId) : ""}
                          onValueChange={(v) => {
                            const uid = Number(v);
                            const sm = (salesmenList ?? []).find((s: any) => s.id === uid);
                            const fullName = sm ? [sm.name, sm.surname].filter(Boolean).join(" ") : "";
                            updateDraft("responsibleUserId", uid);
                            updateDraft("jobCode", fullName);
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm mt-0.5" data-testid="select-job-salesman"><SelectValue placeholder="Seleziona salesman..." /></SelectTrigger>
                          <SelectContent>
                            {(salesmenList ?? []).map((sm: any) => (
                              <SelectItem key={sm.id} value={String(sm.id)}>{[sm.name, sm.surname].filter(Boolean).join(" ")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  ) : (
                    <>
                      <ViewField label="Settore" value={displayData.settore ?? "Legno"} changeType={getChange(changes, "settore")} previousValue={getPrevValue(prevSnapshot, "settore")} />
                      <ViewField label="Job" value={displayData.jobCode} changeType={getChange(changes, "jobCode")} previousValue={getPrevValue(prevSnapshot, "jobCode")} />
                      <ViewField label="Data Ordine" value={fmtDate(displayData.createdAt)} />
                      <ViewField label="Ultimo Aggiornamento" value={fmtDateTime(displayData.updatedAt)} />
                    </>
                  )}
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Agente <ChangeSummaryDot changes={changes} prefix="agentInfo." />
                  </p>
                  {sectionEditable("overview") ? (
                    <div className="grid sm:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Azienda</Label>
                        <Select
                          value={agent.dealerId ? String(agent.dealerId) : ""}
                          onValueChange={(v) => {
                            if (v === "__none__") {
                              updateDraft("agentInfo", { ...agent, dealerId: null, dealerCompanyName: "", dealerContactName: "", code: "" });
                              return;
                            }
                            const dealerCompany = (dealersList ?? []).find((d: any) => String(d.id) === v);
                            updateDraft("agentInfo", { ...agent, dealerId: Number(v), dealerCompanyName: dealerCompany?.companyName ?? "", dealerContactName: "", code: "" });
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm mt-0.5" data-testid="select-agent-company"><SelectValue placeholder="Seleziona azienda dealer..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Nessuno —</SelectItem>
                            {(dealersList ?? []).map((d: any) => (
                              <SelectItem key={d.id} value={String(d.id)}>{d.companyName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <DealerContactSelector
                        dealerCompanyId={agent.dealerId}
                        value={agent.dealerContactName ?? ""}
                        onChange={(contactName) => updateDraft("agentInfo", { ...agent, dealerContactName: contactName, code: contactName })}
                      />
                      <EditField label="Codice / Nome" value={agent.code} onChange={(v) => updateDraft("agentInfo", { ...agent, code: v })} testId="input-agent-code" />
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-3 gap-4">
                      <ViewField label="Azienda" value={agent.dealerCompanyName || "—"} changeType={getChange(changes, "agentInfo.dealerCompanyName")} previousValue={getPrevValue(prevSnapshot, "agentInfo.dealerCompanyName")} />
                      <ViewField label="Contatto" value={agent.dealerContactName || "—"} changeType={getChange(changes, "agentInfo.dealerContactName")} previousValue={getPrevValue(prevSnapshot, "agentInfo.dealerContactName")} />
                      <ViewField label="Codice / Nome" value={agent.code || "—"} changeType={getChange(changes, "agentInfo.code")} previousValue={getPrevValue(prevSnapshot, "agentInfo.code")} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── BILLING & SHIPPING ── */}
        <Card data-testid="card-billing-shipping">
          <CardContent className="pt-4 space-y-4">
            {SectionHeader({ title: "Fatturazione", icon: <Building2 className="w-5 h-5 text-primary" />, sectionKey: "billing", changePrefixes: ["billingInfo"] })}
            {expandedSections.billing && (
              <div className="pt-2">
                <AddressBlock title="Fatturazione" data={billing} editing={sectionEditable("billing")} showVat
                  onChange={(d) => updateDraft("billingInfo", d)}
                  changes={changes} changePrefix="billingInfo" prevSnapshot={prevSnapshot} />
              </div>
            )}
            <div className="border-t pt-4 mt-4">
              {SectionHeader({ title: "Destinazione", icon: <Truck className="w-5 h-5 text-primary" />, sectionKey: "shipping", changePrefixes: ["shippingInfo"] })}
              {(() => {
                const billingShippingSame = !sectionEditable("shipping") &&
                  (billing.name || "").trim() === (shipping.name || "").trim() &&
                  (billing.address || "").trim() === (shipping.address || "").trim() &&
                  (billing.city || "").trim() === (shipping.city || "").trim() &&
                  (billing.country || "").trim() === (shipping.country || "").trim();
                if (billingShippingSame && (billing.name || billing.address)) {
                  return (
                    <div className="pt-2">
                      <p className="text-sm text-muted-foreground italic flex items-center gap-2" data-testid="text-shipping-same">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        Uguale alla fatturazione
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="pt-2">
                    <AddressBlock title="Destinazione"
                      data={{ ...shipping, vatId: "" }}
                      editing={sectionEditable("shipping")}
                      facilities={displayData.facilities ?? []}
                      billingInfo={billing}
                      onChange={(d) => { const { vatId, ...rest } = d; updateDraft("shippingInfo", rest); }}
                      changes={changes} changePrefix="shippingInfo" prevSnapshot={prevSnapshot} />
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>

        {/* ── CONSEGNA CONTRATTUALE ── */}
        <Card data-testid="card-shipping-logistics">
          <CardContent className="pt-4 space-y-4">
            {SectionHeader({ title: "Consegna", icon: <Calendar className="w-5 h-5 text-primary" />, sectionKey: "shipments", changePrefixes: ["logistics.contractualDeliveryDate", "logistics.hasPenalties", "logistics.penaltiesDescription", "logistics.shipments"] })}
            {expandedSections.shipments && (
              <div className="space-y-6 pt-2">
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data Consegna Contrattuale</p>
                  {sectionEditable("shipments") ? (
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Data Consegna</Label>
                        <Input
                          type="date"
                          value={logisticsData.contractualDeliveryDate}
                          onChange={(e) => updateLogisticsWithSync({ contractualDeliveryDate: e.target.value })}
                          className="h-8 text-sm"
                          data-testid="input-contractual-delivery-date"
                        />
                      </div>
                    </div>
                  ) : (
                    <ViewField label="Data Consegna Contrattuale" value={logisticsData.contractualDeliveryDate ? fmtDate(logisticsData.contractualDeliveryDate) : "Non definita"} changeType={getChange(changes, "logistics.contractualDeliveryDate")} previousValue={getPrevValue(prevSnapshot, "logistics.contractualDeliveryDate") ? fmtDate(getPrevValue(prevSnapshot, "logistics.contractualDeliveryDate")) : undefined} />
                  )}

                  {sectionEditable("shipments") ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors ${
                          logisticsData.hasPenalties
                            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300"
                            : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                        }`}
                        onClick={() => updateDraft("logistics", { ...logisticsData, hasPenalties: !logisticsData.hasPenalties, penaltiesDescription: logisticsData.hasPenalties ? "" : logisticsData.penaltiesDescription })}
                        data-testid="btn-toggle-penalties"
                      >
                        <AlertTriangle className={`w-4 h-4 ${logisticsData.hasPenalties ? "text-amber-600 dark:text-amber-400" : ""}`} />
                        {logisticsData.hasPenalties ? "Penali presenti" : "Nessuna penale"}
                      </button>
                      {logisticsData.hasPenalties && (
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Descrizione Penali</Label>
                          <Textarea
                            value={logisticsData.penaltiesDescription}
                            onChange={(e) => updateDraft("logistics", { ...logisticsData, penaltiesDescription: e.target.value })}
                            className="min-h-[60px] text-sm mt-0.5"
                            placeholder="Descrivere le penali contrattuali..."
                            data-testid="textarea-penalties"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {logisticsData.hasPenalties && (
                        <div className={`flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 ${getChange(changes, "logistics.hasPenalties") ? "ring-1 ring-blue-300" : ""}`}>
                          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <ViewField label="Penali contrattuali" value={logisticsData.penaltiesDescription || "Sì"} changeType={getChange(changes, "logistics.penaltiesDescription") || getChange(changes, "logistics.hasPenalties")} previousValue={getPrevValue(prevSnapshot, "logistics.penaltiesDescription")} />
                          </div>
                        </div>
                      )}
                      {!logisticsData.hasPenalties && getChange(changes, "logistics.hasPenalties") && (
                        <ViewField label="Penali" value="Rimosse" changeType="removed" previousValue={getPrevValue(prevSnapshot, "logistics.penaltiesDescription") || "Sì"} />
                      )}
                    </>
                  )}
                </div>

                <div className="border-t pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <Truck className="w-4 h-4" /> Spedizioni Effettuate
                  </p>
                  <ShipmentsSection
                    shipments={logisticsData.shipments}
                    editing={sectionEditable("shipments")}
                    orderId={isNewMode ? undefined : Number(id)}
                    onChange={(shipments) => updateLogisticsWithSync({ shipments })}
                    changes={changes}
                    prevSnapshot={prevSnapshot}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── MONTAGGIO (unified) ── */}
        <Card data-testid="card-assembly">
          <CardContent className="pt-4 space-y-4">
            {SectionHeader({ title: "Montaggio", icon: <Wrench className="w-5 h-5 text-primary" />, sectionKey: "assembly", changePrefixes: ["logistics.contractualAssemblyStartDate", "logistics.contractualTestingEndDate", "logistics.phases", "priceSummary.assembly", "priceSummary.travel", "priceSummary.hotel"] })}
            {expandedSections.assembly && (
              <div className="space-y-6 pt-2">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Data Inizio Montaggio (Contratto)</p>
                    {sectionEditable("assembly") ? (
                      <Input type="date" value={logisticsData.contractualAssemblyStartDate}
                        onChange={(e) => updateLogisticsWithSync({ contractualAssemblyStartDate: e.target.value })}
                        className="h-8 text-sm" data-testid="input-contractual-assembly-start" />
                    ) : (
                      <ViewField label="Data Inizio Montaggio (Contratto)" value={logisticsData.contractualAssemblyStartDate ? fmtDate(logisticsData.contractualAssemblyStartDate) : "Non definita"} changeType={getChange(changes, "logistics.contractualAssemblyStartDate")} previousValue={getPrevValue(prevSnapshot, "logistics.contractualAssemblyStartDate") ? fmtDate(getPrevValue(prevSnapshot, "logistics.contractualAssemblyStartDate")) : undefined} />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Data Fine Collaudo (Contratto)</p>
                    {sectionEditable("assembly") ? (
                      <Input type="date" value={logisticsData.contractualTestingEndDate}
                        onChange={(e) => updateLogisticsWithSync({ contractualTestingEndDate: e.target.value })}
                        className="h-8 text-sm" data-testid="input-contractual-testing-end" />
                    ) : (
                      <ViewField label="Data Fine Collaudo (Contratto)" value={logisticsData.contractualTestingEndDate ? fmtDate(logisticsData.contractualTestingEndDate) : "Non definita"} changeType={getChange(changes, "logistics.contractualTestingEndDate")} previousValue={getPrevValue(prevSnapshot, "logistics.contractualTestingEndDate") ? fmtDate(getPrevValue(prevSnapshot, "logistics.contractualTestingEndDate")) : undefined} />
                    )}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Giorni di Montaggio Venduti</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className={`bg-muted/30 rounded-lg p-3 border ${getChange(changes, "priceSummary.assemblySoldDays") || getChange(changes, "priceSummary.assemblyDailyRate") ? "ring-1 ring-blue-300" : ""}`}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Suddivisione Giorni</p>
                      <p className="text-lg font-bold" data-testid="text-assembly-sold-days">{pricing.assemblySoldDays ?? 0} giorni totali</p>
                      <p className="text-xs text-muted-foreground mb-2">Tariffa giornaliera: {fmtCurrency(pricing.assemblyDailyRate ?? 0)}</p>
                      {(pricing.travelDays || pricing.mechanicalDays || pricing.electricalDays || pricing.testingDays || pricing.installTrainingDays) ? (
                        <div className="space-y-1 border-t pt-2 mt-2">
                          {(pricing.travelDays ?? 0) > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Viaggio</span>
                              <span className="font-mono font-medium">{pricing.travelDays} gg</span>
                            </div>
                          )}
                          {(pricing.mechanicalDays ?? 0) > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Montaggio Meccanico</span>
                              <span className="font-mono font-medium">{pricing.mechanicalDays} gg</span>
                            </div>
                          )}
                          {(pricing.electricalDays ?? 0) > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Montaggio Elettrico</span>
                              <span className="font-mono font-medium">{pricing.electricalDays} gg</span>
                            </div>
                          )}
                          {(pricing.testingDays ?? 0) > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Collaudo</span>
                              <span className="font-mono font-medium">{pricing.testingDays} gg</span>
                            </div>
                          )}
                          {(pricing.installTrainingDays ?? 0) > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Training</span>
                              <span className="font-mono font-medium">{pricing.installTrainingDays} gg</span>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-4">
                      <div className={`bg-muted/30 rounded-lg p-3 border ${getChange(changes, "priceSummary.assemblyPurePrice") ? "ring-1 ring-blue-300" : ""}`}>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Montaggio Puro</p>
                        <p className="text-lg font-bold font-mono" data-testid="text-assembly-pure-price">{fmtCurrency(pricing.assemblyPurePrice ?? 0)}</p>
                        <p className="text-xs text-muted-foreground">{fmtCurrency(pricing.assemblyDailyRate ?? 0)} × {pricing.assemblySoldDays ?? 0} giorni</p>
                      </div>
                      <div className={`bg-muted/30 rounded-lg p-3 border ${getChange(changes, "priceSummary.assemblyServicesCost") || getChange(changes, "priceSummary.travelIncluded") || getChange(changes, "priceSummary.hotelIncluded") ? "ring-1 ring-blue-300" : ""}`}>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Spese Viaggio & Servizi</p>
                        <p className="text-lg font-bold font-mono" data-testid="text-assembly-services-cost">{fmtCurrency(pricing.assemblyServicesCost ?? 0)}</p>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${pricing.travelIncluded ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                            Viaggi: {pricing.travelIncluded ? "INCLUSI" : "ESCLUSI"}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${pricing.hotelIncluded ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                            Hotel: {pricing.hotelIncluded ? "INCLUSO" : "ESCLUSO"}
                          </span>
                        </div>
                        {((pricing.rentalCarDailyFee ?? 0) > 0 || (pricing.flightTicketCost ?? 0) > 0) && (
                          <div className="space-y-1 border-t pt-2 mt-2">
                            {(pricing.rentalCarDailyFee ?? 0) > 0 && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Rental Car</span>
                                <span className="font-mono font-medium">{fmtCurrency(pricing.rentalCarDailyFee ?? 0)} × {pricing.rentalCarDays ?? 0} gg = {fmtCurrency(pricing.rentalCarTotal ?? 0)}</span>
                              </div>
                            )}
                            {(pricing.flightTicketCost ?? 0) > 0 && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Biglietto Aereo</span>
                                <span className="font-mono font-medium">{fmtCurrency(pricing.flightTicketCost ?? 0)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={`mt-3 flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 ${getChange(changes, "priceSummary.assemblyPrice") ? "ring-1 ring-blue-300" : ""}`}>
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">TOTALE MONTAGGIO VENDUTO:</span>
                    <span className="text-sm font-bold font-mono text-blue-700 dark:text-blue-300" data-testid="text-assembly-total-sold">{fmtCurrency(pricing.assemblyPrice)}</span>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Fasi di Montaggio</p>
                  {logisticsData.phases.length === 0 && !sectionEditable("assembly") && (
                    <p className="text-sm text-muted-foreground">Nessuna fase registrata.</p>
                  )}
                  <div className="space-y-4">
                    {logisticsData.phases.map((phase, idx) => (
                      <div key={phase.id} className={`border rounded-lg overflow-hidden ${getChange(changes, `logistics.phases[${idx}]`) ? "ring-1 ring-blue-300" : ""}`} data-testid={`assembly-phase-${idx}`}>
                        <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
                          <Badge variant={phase.phaseType === "mechanical" ? "default" : phase.phaseType === "electrical" ? "secondary" : "outline"}
                            className="text-xs" data-testid={`badge-phase-type-${idx}`}>
                            {phase.phaseType === "mechanical" ? "Meccanico" : phase.phaseType === "electrical" ? "Elettrico" : "Collaudo"}
                          </Badge>
                          {sectionEditable("assembly") && (
                            <>
                              <Select value={phase.phaseType} onValueChange={(v: AssemblyPhaseType) => {
                                const next = logisticsData.phases.map((p, i) => i === idx ? { ...p, phaseType: v } : p);
                                updateLogisticsWithSync({ phases: next });
                              }}>
                                <SelectTrigger className="h-7 text-xs w-auto min-w-[130px]" data-testid={`select-phase-type-${idx}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="mechanical">Meccanico</SelectItem>
                                  <SelectItem value="electrical">Elettrico</SelectItem>
                                  <SelectItem value="testing">Collaudo</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive ml-auto"
                                onClick={() => updateLogisticsWithSync({ phases: logisticsData.phases.filter((_, i) => i !== idx) })}
                                data-testid={`btn-remove-phase-${idx}`}>
                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Rimuovi
                              </Button>
                            </>
                          )}
                          {!sectionEditable("assembly") && (() => {
                            const ap = computeAutoProgress(phase.startDate, phase.expectedDurationDays);
                            const pct = ap.isAuto ? ap.percent : phase.progressPercent;
                            if (pct <= 0) return null;
                            return (
                              <span className={`ml-auto text-xs font-mono font-bold ${
                                ap.isAuto && ap.percent > 100 ? "text-red-500" :
                                pct >= 100 ? "text-green-600 dark:text-green-400" :
                                pct >= 50 ? "text-blue-600 dark:text-blue-400" :
                                "text-amber-600 dark:text-amber-400"
                              }`}>{pct}%{ap.isAuto && ap.percent > 100 ? " ⚠" : ""}</span>
                            );
                          })()}
                        </div>
                        <div className="p-3">
                          <PhaseSection
                            phase={phase}
                            editing={sectionEditable("assembly")}
                            phaseLabel={phase.phaseType === "mechanical" ? "Montaggio Meccanico" : phase.phaseType === "electrical" ? "Montaggio Elettrico" : "Collaudo"}
                            orderId={isNewMode ? undefined : Number(id)}
                            onChange={(updated) => {
                              const next = logisticsData.phases.map((p, i) => i === idx ? { ...updated, id: phase.id, phaseType: phase.phaseType } as AssemblyPhase : p);
                              updateLogisticsWithSync({ phases: next });
                            }}
                            changes={changes}
                            phasePrefix={`logistics.phases[${idx}]`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {sectionEditable("assembly") && (
                    <div className="flex items-center gap-2 mt-3">
                      <Button variant="outline" size="sm" onClick={() => {
                        const newPhase: AssemblyPhase = {
                          id: `phase-${Date.now()}`,
                          phaseType: "mechanical",
                          startDate: "", expectedDurationDays: 0, endDate: "",
                          progressPercent: 0, workers: [], notes: "", certificates: [],
                        };
                        updateLogisticsWithSync({ phases: [...logisticsData.phases, newPhase] });
                      }} data-testid="btn-add-phase">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi Fase
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── PAYMENT TERMS ── */}
        <Card data-testid="card-payments">
          <CardContent className="pt-4 space-y-4">
            {SectionHeader({ title: "Condizioni di Pagamento", icon: <CreditCard className="w-5 h-5 text-primary" />, sectionKey: "payments", changePrefixes: ["paymentTerms", "bankName"] })}
            {expandedSections.payments && (
              sectionEditable("payments") ? (
                <PaymentTermsEditor
                  terms={payments}
                  bankName={draft.bankName ?? ""}
                  onChange={(terms, bankName) => { updateDraft("paymentTerms", terms); updateDraft("bankName", bankName); }}
                  orderId={isNewMode ? undefined : id}
                  onTogglePaid={(index, paid) => {
                    const today = new Date().toISOString().slice(0, 10);
                    const updated = payments.map((t, idx) => idx === index ? { ...t, paid, paidDate: paid ? today : "" } : t);
                    updateDraft("paymentTerms", updated);

                    const currentLogistics = (draft.logistics as any) ?? {};
                    const timeline: any[] = [...(currentLogistics.timeline ?? [])];
                    const payEvtId = `evt-payment-${index}`;
                    if (paid) {
                      const existingIdx = timeline.findIndex((e: any) => e.id === payEvtId);
                      if (existingIdx < 0) {
                        timeline.push({
                          id: payEvtId,
                          type: "payment_received",
                          label: `Pagamento: ${updated[index]?.condition || `#${index + 1}`}`,
                          notes: "",
                          status: "completed",
                          actualDate: today,
                          plannedDate: today,
                          autoCalculated: false,
                        });
                      } else {
                        timeline[existingIdx] = { ...timeline[existingIdx], status: "completed", actualDate: today };
                      }
                    } else {
                      const evtIdx = timeline.findIndex((e: any) => e.id === payEvtId);
                      if (evtIdx >= 0) timeline.splice(evtIdx, 1);
                    }
                    updateDraft("logistics", { ...currentLogistics, timeline });

                    togglePayment.mutate({ index, paid });
                  }}
                />
              ) : (
                <div className="space-y-1.5 pt-2">
                  {payments.length > 0 ? payments.map((p, i) => (
                    <div key={i} className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${p.paid ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800" : ""} ${getChange(changes, `paymentTerms[${i}]`) ? "border-l-2 border-l-blue-500 pl-2" : ""}`}>
                      {!isNewMode && (
                        <span className="shrink-0" data-testid={`payment-status-${i}`}>
                          {p.paid ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                          ) : (
                            <Circle className="w-4 h-4 text-muted-foreground/30" />
                          )}
                        </span>
                      )}
                      <p className={`text-sm flex-1 ${p.paid ? "text-green-800 dark:text-green-300 font-medium" : ""}`}>
                        {i + 1}. {p.condition || "—"}
                        {getChange(changes, `paymentTerms[${i}]`) === "added" && <span className="ml-1 text-[9px] font-bold text-green-600 uppercase">nuovo</span>}
                        {getChange(changes, `paymentTerms[${i}]`) === "modified" && <span className="ml-1 text-[9px] font-bold text-blue-600 uppercase">modificato</span>}
                      </p>
                      {p.paid && p.paidDate && (
                        <span className="text-[10px] font-mono text-green-600 dark:text-green-400 font-semibold shrink-0">{fmtDate(p.paidDate)}</span>
                      )}
                    </div>
                  )) : <p className="text-sm text-muted-foreground">Nessuna condizione inserita.</p>}
                  <ViewField label="Banca" value={displayData.bankName || "—"} changeType={getChange(changes, "bankName")} previousValue={getPrevValue(prevSnapshot, "bankName")} className="mt-2" />
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* ── FATTURAZIONE EMESSA ── */}
        <Card data-testid="card-invoicing">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              {SectionHeader({ title: "Fatturazione Emessa", icon: <Receipt className="w-5 h-5 text-primary" />, sectionKey: "payments", changePrefixes: ["invoicing"] })}
              {sectionEditable("payments") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newEntry: OrderInvoiceEntry = { invoiceNumber: "", date: "", amount: 0, notes: "" };
                    updateDraft("invoicing", [...invoicingData, newEntry]);
                  }}
                  data-testid="btn-add-invoice"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi
                </Button>
              )}
            </div>
            {(() => {
              const totalInvoiced = invoicingData.reduce((s, e) => s + (e.amount || 0), 0);
              const orderTotal = pricing.totalOrderPrice || 0;
              const pct = orderTotal > 0 ? Math.min(100, Math.round((totalInvoiced / orderTotal) * 100)) : 0;
              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <CircleProgress percent={pct} size={48} strokeWidth={5} />
                    <div>
                      <p className="text-sm font-medium">
                        {totalInvoiced.toLocaleString("it-IT", { style: "currency", currency: "EUR" })} / {orderTotal.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                      </p>
                      <p className="text-xs text-muted-foreground">{pct}% fatturato</p>
                    </div>
                  </div>
                  {invoicingData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nessuna fattura registrata.</p>
                  ) : (
                    <div className="space-y-2">
                      {invoicingData.map((inv, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-2 border rounded-md" data-testid={`invoice-row-${idx}`}>
                          {sectionEditable("payments") ? (
                            <>
                              <Input
                                className="w-28 h-8 text-xs"
                                placeholder="N. Fattura"
                                value={inv.invoiceNumber}
                                onChange={(e) => {
                                  const updated = [...invoicingData];
                                  updated[idx] = { ...updated[idx], invoiceNumber: e.target.value };
                                  updateDraft("invoicing", updated);
                                }}
                                data-testid={`invoice-number-${idx}`}
                              />
                              <Input
                                type="date"
                                className="w-32 h-8 text-xs"
                                value={inv.date}
                                onChange={(e) => {
                                  const updated = [...invoicingData];
                                  updated[idx] = { ...updated[idx], date: e.target.value };
                                  updateDraft("invoicing", updated);
                                }}
                                data-testid={`invoice-date-${idx}`}
                              />
                              <Input
                                type="number"
                                className="w-28 h-8 text-xs"
                                placeholder="Importo €"
                                value={inv.amount || ""}
                                onChange={(e) => {
                                  const updated = [...invoicingData];
                                  updated[idx] = { ...updated[idx], amount: parseFloat(e.target.value) || 0 };
                                  updateDraft("invoicing", updated);
                                }}
                                data-testid={`invoice-amount-${idx}`}
                              />
                              <Input
                                className="flex-1 h-8 text-xs"
                                placeholder="Note"
                                value={inv.notes || ""}
                                onChange={(e) => {
                                  const updated = [...invoicingData];
                                  updated[idx] = { ...updated[idx], notes: e.target.value };
                                  updateDraft("invoicing", updated);
                                }}
                                data-testid={`invoice-notes-${idx}`}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive shrink-0"
                                onClick={() => {
                                  const updated = invoicingData.filter((_, i) => i !== idx);
                                  updateDraft("invoicing", updated);
                                }}
                                data-testid={`invoice-delete-${idx}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <span className="text-sm font-mono font-medium w-28">{inv.invoiceNumber || "—"}</span>
                              <span className="text-xs text-muted-foreground w-24">{inv.date ? format(new Date(inv.date), "dd/MM/yyyy") : "—"}</span>
                              <span className="text-sm font-medium w-28">{(inv.amount || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
                              <span className="text-xs text-muted-foreground flex-1 truncate">{inv.notes || ""}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* ── PRICE OVERVIEW ── */}
        <Card data-testid="card-pricing">
          <CardContent className="pt-4 space-y-4">
            {SectionHeader({ title: "Price Overview", icon: <FileText className="w-5 h-5 text-primary" />, sectionKey: "pricing", changePrefixes: ["priceSummary", "orderItems", "additionalItems", "shippingTerms"] })}
            {expandedSections.pricing && (
              sectionEditable("pricing") ? (
                <PricingSummaryEditor
                  pricing={pricing}
                  shipTerms={shipTerms}
                  items={oItems}
                  additionalItems={addItems}
                  onChangePricing={(p) => updateDraft("priceSummary", p)}
                  onChangeShipTerms={(s) => updateDraft("shippingTerms", s)}
                  onChangeItems={(it) => updateDraft("orderItems", it)}
                  onChangeAdditional={(a) => updateDraft("additionalItems", a)}
                  orderId={id}
                />
              ) : (
                <PriceOverviewView items={oItems} additionalItems={addItems} pricing={pricing} shipTerms={shipTerms} changes={changes} />
              )
            )}
          </CardContent>
        </Card>

        {/* ── TECHNICAL SHEETS ── */}
        {(lineTechData || techSheets.length > 0) && (
          <Card data-testid="card-technical-sheets">
            <CardContent className="pt-4 space-y-4">
              {SectionHeader({ title: "Schede Tecniche", icon: <Wrench className="w-5 h-5 text-primary" />, sectionKey: "techSheets", changePrefixes: ["lineTechnicalData", "technicalSheets"] })}
              {expandedSections.techSheets && (
                <TechnicalSheetsView
                  lineTechData={lineTechData}
                  sheets={techSheets}
                  editing={sectionEditable("techSheets")}
                  orderItems={oItems}
                  onChangeLineData={(d) => updateDraft("lineTechnicalData", d)}
                  onChange={(sheets) => updateDraft("technicalSheets", sheets)}
                  changes={changes}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* ── NOTES ── */}
        <Card data-testid="card-notes">
          <CardContent className="pt-4 space-y-3">
            {SectionHeader({ title: "Note", icon: <FileText className="w-5 h-5 text-primary" />, sectionKey: "notes", changePrefixes: ["notes"] })}
            {expandedSections.notes && (
              sectionEditable("notes") ? (
                <Textarea className="min-h-[80px] mt-2" value={notes} onChange={(e) => updateDraft("notes", e.target.value)} placeholder="Aggiungi note..." data-testid="textarea-notes" />
              ) : (
                <ViewField label="" value={notes || <span className="text-muted-foreground">Nessuna nota.</span>} changeType={getChange(changes, "notes")} previousValue={getPrevValue(prevSnapshot, "notes")} className="mt-2" />
              )
            )}
          </CardContent>
        </Card>
        </>)}

        {/* ── PRODUCTION PROGRESS ── */}
        {!isNewMode && oItems.length > 0 && (
          <Card data-testid="card-production-progress">
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                {SectionHeader({ title: "Avanzamento Produzione", icon: <Settings2 className="w-5 h-5 text-primary" />, sectionKey: "production" })}
                {!canEditSection("production", role) && (
                  <RequestProductionUpdateButton orderId={Number(id)} />
                )}
              </div>
              <div className="space-y-3 pt-2">
                {oItems.map((item, idx) => {
                  const entry = productionProgress.find(p => p.positionIndex === item.position);
                  const pct = entry?.progressPercent ?? 0;
                  const canEdit = sectionEditable("production");
                  return (
                    <div key={idx} className="border rounded-lg p-3 space-y-2" data-testid={`production-item-${idx}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-muted-foreground">Pos. {item.position}</span>
                          <p className="text-sm font-medium truncate" data-testid={`production-machine-${idx}`}>{item.description || "—"}</p>
                        </div>
                        <span className={`text-sm font-bold font-mono shrink-0 ${
                          pct >= 100 ? "text-green-600 dark:text-green-400" :
                          pct >= 50 ? "text-blue-600 dark:text-blue-400" :
                          pct > 0 ? "text-amber-600 dark:text-amber-400" :
                          "text-muted-foreground"
                        }`} data-testid={`production-percent-${idx}`}>{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                      {canEdit && (
                        <ProductionProgressEditor
                          orderId={Number(id)}
                          positionIndex={item.position}
                          currentPercent={pct}
                          currentNotes={entry?.notes ?? ""}
                        />
                      )}
                      {entry?.lastUpdatedByName && (
                        <p className="text-[10px] text-muted-foreground">
                          Aggiornato da {entry.lastUpdatedByName} — {fmtDateTime(entry.lastUpdatedAt)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── INTERACTIONS ── */}
        {!isNewMode && (
          <Card data-testid="card-interactions">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-base flex items-center gap-2"><Phone className="w-5 h-5 text-primary" /> Interazioni</span>
                <Link href={`/crm/interactions/new?jobOrderId=${id}&customerId=${displayData.customerId}`}>
                  <Button variant="outline" size="sm" data-testid="btn-new-interaction">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Nuova
                  </Button>
                </Link>
              </div>
              {interactionsList && interactionsList.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-2">
                  {interactionsList.map((int: any) => (
                    <Link key={int.id} href={`/crm/interactions/${int.id}/edit`}>
                      <div className="p-2 border rounded-md hover:bg-muted/30 cursor-pointer transition-colors" data-testid={`interaction-row-${int.id}`}>
                        <div className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="text-xs">{int.type === "phone_call" ? "Chiamata" : int.type === "email" ? "Email" : int.type === "visit" ? "Visita" : int.type === "whatsapp" ? "WhatsApp" : int.type === "video_call" ? "Video" : int.type === "offer_created" ? "Offerta creata" : int.type === "offer_versioned" ? "Nuova versione offerta" : int.type === "todo" ? "To Do" : int.type}</Badge>
                          <span className="text-xs text-muted-foreground">{fmtDate(int.date)}</span>
                        </div>
                        {int.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{int.notes}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nessuna interazione collegata.</p>
              )}
            </CardContent>
          </Card>
        )}

        {layoutDocsBlock}

        </>)}

        {/* ── STICKY SAVE BAR (when editing) ── */}
        {editing && (
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg p-3 flex items-center justify-center gap-3">
            <span className="text-sm text-muted-foreground mr-4">
              {isNewMode ? "Stai creando l'ordine" : "Modifica in corso"}
            </span>
            <Button variant="default" onClick={handleSave} disabled={isSaving} data-testid="btn-save-bottom">
              {isSaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              {isNewMode ? "Crea Commessa" : "Salva Tutto"}
            </Button>
            <Button variant="outline" onClick={handleCancel} data-testid="btn-cancel-bottom">
              <X className="w-4 h-4 mr-1.5" /> Annulla Tutto
            </Button>
          </div>
        )}
        {!isNewMode && order && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <LinkedEmailAttachments entityType="order" entityId={order.id} />
          </div>
        )}
      </div>
    </Layout>
  );
}

function EditField({ label, value, onChange, type = "text", testId = "" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; testId?: string;
}) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm mt-0.5" data-testid={testId} />
    </div>
  );
}

function AddressBlock({ title, data, editing, onChange, showVat = false, facilities = [], billingInfo, changes, changePrefix, prevSnapshot }: {
  title: string; data: OrderBillingInfo; editing: boolean; onChange: (d: OrderBillingInfo) => void; showVat?: boolean;
  facilities?: any[]; billingInfo?: OrderBillingInfo; changes?: Record<string, ChangeType> | null; changePrefix?: string; prevSnapshot?: any;
}) {
  const hasFacilities = facilities.length > 0;
  const showSelector = editing && !showVat && (hasFacilities || billingInfo);

  const applyFacility = (facilityId: string) => {
    if (facilityId === "__sede__" && billingInfo) {
      onChange({ ...data, name: billingInfo.name, city: billingInfo.city, address: billingInfo.address, country: billingInfo.country, phone: billingInfo.phone, fax: billingInfo.fax, vatId: "" });
      return;
    }
    const fac = facilities.find((f: any) => String(f.id) === facilityId);
    if (fac) {
      onChange({ ...data, name: fac.name ?? "", city: fac.city ?? "", address: fac.address ?? "", country: fac.country ?? "", phone: fac.phone ?? "", fax: "", vatId: "" });
    }
  };

  const gc = (field: string) => changePrefix ? getChange(changes ?? null, `${changePrefix}.${field}`) : null;
  const gp = (field: string) => changePrefix ? getPrevValue(prevSnapshot, `${changePrefix}.${field}`) : undefined;
  const hasAnyChange = changePrefix ? sectionHasChanges(changes ?? null, changePrefix) : false;

  const showRemoved = (field: string, value: string | undefined) => !!value || gc(field) === "removed";

  if (!editing) {
    return (
      <div className={`border rounded-lg p-4 space-y-1 ${hasAnyChange ? "ring-1 ring-blue-300" : ""}`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {title} <ChangeSummaryDot changes={changes ?? null} prefix={changePrefix ?? ""} />
        </p>
        <ViewField label="Ragione Sociale" value={data.name || "—"} changeType={gc("name")} previousValue={gp("name")} />
        {showRemoved("address", data.address) && <ViewField label="Indirizzo" value={data.address || "—"} changeType={gc("address")} previousValue={gp("address")} />}
        <ViewField label="Città / Nazione" value={[data.city, data.country].filter(Boolean).join(" — ") || "—"} changeType={gc("city") || gc("country")} previousValue={gc("city") ? [gp("city"), gp("country")].filter(Boolean).join(" — ") : gc("country") ? [gp("city"), gp("country")].filter(Boolean).join(" — ") : undefined} />
        {showVat && showRemoved("vatId", data.vatId) && <ViewField label="P.IVA/C.F." value={data.vatId || "—"} changeType={gc("vatId")} previousValue={gp("vatId")} />}
        {showRemoved("phone", data.phone) && <ViewField label="Tel" value={data.phone || "—"} changeType={gc("phone")} previousValue={gp("phone")} />}
        {showRemoved("fax", data.fax) && <ViewField label="Fax" value={data.fax || "—"} changeType={gc("fax")} previousValue={gp("fax")} />}
      </div>
    );
  }

  const update = (key: keyof OrderBillingInfo, val: string) => onChange({ ...data, [key]: val });

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        {showSelector && (
          <Select onValueChange={applyFacility}>
            <SelectTrigger className="h-7 text-xs w-auto min-w-[160px]" data-testid="select-facility">
              <SelectValue placeholder="Seleziona sede..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__sede__">Sede principale</SelectItem>
              {facilities.map((f: any) => (
                <SelectItem key={f.id} value={String(f.id)}>{f.name}{f.city ? ` — ${f.city}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-[10px] text-muted-foreground">Ragione Sociale</Label>
          <Input value={data.name} onChange={(e) => update("name", e.target.value)} className="h-8 text-sm" data-testid={`input-${title.toLowerCase()}-name`} />
        </div>
        <div><Label className="text-[10px] text-muted-foreground">Città</Label><Input value={data.city} onChange={(e) => update("city", e.target.value)} className="h-8 text-sm" /></div>
        <div><Label className="text-[10px] text-muted-foreground">Nazione</Label><Input value={data.country} onChange={(e) => update("country", e.target.value)} className="h-8 text-sm" /></div>
        <div className="col-span-2"><Label className="text-[10px] text-muted-foreground">Indirizzo</Label><Input value={data.address} onChange={(e) => update("address", e.target.value)} className="h-8 text-sm" /></div>
        {showVat && <div><Label className="text-[10px] text-muted-foreground">P.IVA / C.F.</Label><Input value={data.vatId} onChange={(e) => update("vatId", e.target.value)} className="h-8 text-sm" /></div>}
        <div><Label className="text-[10px] text-muted-foreground">Tel.</Label><Input value={data.phone} onChange={(e) => update("phone", e.target.value)} className="h-8 text-sm" /></div>
        <div><Label className="text-[10px] text-muted-foreground">Fax</Label><Input value={data.fax} onChange={(e) => update("fax", e.target.value)} className="h-8 text-sm" /></div>
      </div>
    </div>
  );
}

function PaymentTermsEditor({ terms, bankName, onChange, orderId, onTogglePaid }: {
  terms: OrderPaymentTerm[]; bankName: string; onChange: (terms: OrderPaymentTerm[], bankName: string) => void;
  orderId?: string; onTogglePaid?: (index: number, paid: boolean) => void;
}) {
  const updateTerm = (i: number, val: string) => {
    const next = terms.map((t, idx) => idx === i ? { ...t, condition: val } : t);
    onChange(next, bankName);
  };
  const addTerm = () => { if (terms.length < 7) onChange([...terms, { condition: "" }], bankName); };
  const removeTerm = (i: number) => onChange(terms.filter((_, idx) => idx !== i), bankName);

  return (
    <div className="space-y-3 pt-2">
      {terms.map((term, i) => (
        <div key={i} className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${term.paid ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800" : ""}`}>
          {orderId && onTogglePaid && (
            <button
              type="button"
              className="shrink-0 focus:outline-none"
              onClick={() => onTogglePaid(i, !term.paid)}
              data-testid={`btn-toggle-payment-${i}`}
            >
              {term.paid ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground/40 hover:text-muted-foreground" />
              )}
            </button>
          )}
          <span className="text-xs font-mono text-muted-foreground w-4 shrink-0">{i + 1}</span>
          <Input value={term.condition} onChange={(e) => updateTerm(i, e.target.value)} placeholder={`Condizione ${i + 1}...`} className={`h-8 text-sm flex-1 ${term.paid ? "bg-green-50/50 dark:bg-green-950/20" : ""}`} data-testid={`input-payment-${i}`} />
          {term.paid && term.paidDate && (
            <span className="text-[10px] font-mono text-green-600 dark:text-green-400 font-semibold shrink-0">{term.paidDate}</span>
          )}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeTerm(i)} data-testid={`btn-remove-payment-${i}`}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      {terms.length < 7 && (
        <Button variant="outline" size="sm" onClick={addTerm} data-testid="btn-add-payment">
          <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi Condizione
        </Button>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Label className="text-xs text-muted-foreground shrink-0">Banca</Label>
        <Input value={bankName} onChange={(e) => onChange(terms, e.target.value)} className="h-8 text-sm flex-1" placeholder="Nome banca..." data-testid="input-bank" />
      </div>
    </div>
  );
}

function OrderItemsEditor({ items, additionalItems, onChangeItems, onChangeAdditional }: {
  items: OrderLineItem[]; additionalItems: OrderLineItem[];
  onChangeItems: (items: OrderLineItem[]) => void; onChangeAdditional: (items: OrderLineItem[]) => void;
}) {
  const updateItem = (i: number, patch: Partial<OrderLineItem>) => {
    onChangeItems(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  };
  const updateAdditional = (i: number, patch: Partial<OrderLineItem>) => {
    onChangeAdditional(additionalItems.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  };
  const addAdditional = () => {
    onChangeAdditional([...additionalItems, { position: additionalItems.length + 1, description: "", unitPrice: 0 }]);
  };
  const removeAdditional = (i: number) => {
    onChangeAdditional(additionalItems.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-4 pt-2">
      <table className="w-full text-sm" data-testid="table-order-items-edit">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground uppercase">
            <th className="py-2 px-2 w-12">Pos.</th>
            <th className="py-2 px-2">Descrizione</th>
            <th className="py-2 px-2 w-36 text-right">Prezzo EUR</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-b border-dashed">
              <td className="py-1.5 px-2 font-mono text-xs">{item.position}</td>
              <td className="py-1.5 px-2">
                <Input value={item.description} onChange={(e) => updateItem(i, { description: e.target.value })} className="h-7 text-sm border-dashed" data-testid={`input-item-desc-${i}`} />
              </td>
              <td className="py-1.5 px-2">
                <Input type="number" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(i, { unitPrice: parseFloat(e.target.value) || 0 })} className="h-7 text-sm text-right font-mono border-dashed" data-testid={`input-item-price-${i}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {additionalItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Voci Aggiuntive</p>
          <div className="space-y-2">
            {additionalItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={item.description} onChange={(e) => updateAdditional(i, { description: e.target.value })} className="h-7 text-sm flex-1 border-dashed" placeholder="Descrizione..." data-testid={`input-additional-desc-${i}`} />
                <Input type="number" step="0.01" value={item.unitPrice} onChange={(e) => updateAdditional(i, { unitPrice: parseFloat(e.target.value) || 0 })} className="h-7 text-sm w-32 text-right font-mono border-dashed" data-testid={`input-additional-price-${i}`} />
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeAdditional(i)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      <Button variant="outline" size="sm" onClick={addAdditional} data-testid="btn-add-additional-item">
        <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi Voce
      </Button>
    </div>
  );
}

function IncludedBadge({ included, label }: { included: boolean; label?: string }) {
  return included ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800" data-testid={`badge-${label ?? "included"}`}>
      INCLUDED
    </span>
  ) : null;
}

function PriceOverviewView({ items, additionalItems, pricing, shipTerms, changes }: {
  items: OrderLineItem[]; additionalItems: OrderLineItem[]; pricing: OrderPriceSummary; shipTerms: OrderShippingTerms;
  changes?: Record<string, ChangeType> | null;
}) {
  const labels = pricing.priceLabels ?? {};
  return (
    <div className="pt-2 space-y-6" data-testid="price-overview">
      <table className="w-full text-sm" data-testid="table-price-overview">
        {items.map((item, idx) => {
          const opts = item.options ?? [];
          const itemChange = getChange(changes ?? null, `orderItems[${idx}]`);
          const rowHighlight = itemChange === "added" ? "bg-green-50 dark:bg-green-950/20" : itemChange === "modified" ? "bg-blue-50 dark:bg-blue-950/20" : "";
          return (
            <tbody key={item.position}>
              <tr className={`border-b border-dashed ${rowHighlight}`}>
                <td className="py-1.5 px-3 font-semibold">
                  Pos. {item.position}: {item.description}
                  {itemChange === "added" && <span className="ml-1 text-[9px] font-bold text-green-600 uppercase">nuovo</span>}
                  {itemChange === "modified" && <span className="ml-1 text-[9px] font-bold text-blue-600 uppercase">modificato</span>}
                </td>
                <td className="py-1.5 px-3 text-right font-mono whitespace-nowrap">
                  {fmtCurrency(item.unitPrice)}
                </td>
              </tr>
              {opts.map((opt, oi) => (
                <tr key={oi}>
                  <td className="py-0.5 px-3 pl-8 text-xs text-muted-foreground">
                    <span className="mr-1">↳</span>{opt.name}
                  </td>
                  <td className="py-0.5 px-3 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                    +{fmtCurrency(opt.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          );
        })}
        <tbody>
          {(pricing.interlockingTotal ?? 0) > 0 && (
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-3">Interlocking</td>
              <td className="py-1.5 px-3 text-right font-mono whitespace-nowrap">{fmtCurrency(pricing.interlockingTotal)}</td>
            </tr>
          )}

          {additionalItems.filter(a => a.description !== "Interlocking").map((item, i) => {
            const addChange = getChange(changes ?? null, `additionalItems[${i}]`);
            const addHighlight = addChange === "added" ? "bg-green-50 dark:bg-green-950/20" : addChange === "modified" ? "bg-blue-50 dark:bg-blue-950/20" : "";
            return (
              <tr key={`add-${i}`} className={`border-b border-dashed ${addHighlight}`}>
                <td className="py-1.5 px-3">
                  {item.description}
                  {addChange === "added" && <span className="ml-1 text-[9px] font-bold text-green-600 uppercase">nuovo</span>}
                  {addChange === "modified" && <span className="ml-1 text-[9px] font-bold text-blue-600 uppercase">modificato</span>}
                </td>
                <td className="py-1.5 px-3 text-right font-mono whitespace-nowrap">{fmtCurrency(item.unitPrice)}</td>
              </tr>
            );
          })}

          <tr className={`border-t-2 border-b-2 ${getChange(changes ?? null, "priceSummary.totalListPrice") ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}>
            <td className="py-2 px-3 font-bold">
              {labels.totalListPrice || "TOTAL LIST PRICE (ex works, installation excluded)"}
              {getChange(changes ?? null, "priceSummary.totalListPrice") && <span className="ml-1 text-[9px] font-bold text-blue-600 uppercase">modificato</span>}
            </td>
            <td className="py-2 px-3 text-right font-mono font-bold whitespace-nowrap">{fmtCurrency(pricing.totalListPrice)}</td>
          </tr>
        </tbody>
      </table>

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 px-3">NET SERVICE PRICES</p>
        <table className="w-full text-sm" data-testid="table-service-prices">
          <tbody>
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-3">
                {labels.installation || "Installation and start-up"}
                {(pricing.assemblySoldDays ?? 0) > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    ({pricing.assemblySoldDays} days × {fmtCurrency(pricing.assemblyDailyRate ?? 0)}/day)
                  </span>
                )}
              </td>
              <td className="py-1.5 px-3 text-right font-mono whitespace-nowrap">
                {pricing.installationIncluded ? fmtCurrency(pricing.assemblyPrice) : "EXCLUDED"}
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-3">{labels.travelCosts || "Travel and flight costs for our engineers"}</td>
              <td className="py-1.5 px-3 text-right">
                {pricing.travelIncluded ? <IncludedBadge included label="travel" /> : fmtCurrency(0)}
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-3">{labels.boardLodging || "Board and lodging for the engineers"}</td>
              <td className="py-1.5 px-3 text-right">
                {pricing.hotelIncluded ? <IncludedBadge included label="hotel" /> : fmtCurrency(0)}
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-3">
                {labels.training || "Training time after first start-up"}
                {pricing.trainingDays && <span className="text-xs text-muted-foreground ml-1">({pricing.trainingDays} days)</span>}
              </td>
              <td className="py-1.5 px-3 text-right">
                {pricing.trainingIncluded ? <IncludedBadge included label="training" /> : fmtCurrency(0)}
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-3">{labels.packaging || "Package where necessary"}</td>
              <td className="py-1.5 px-3 text-right">
                {pricing.packagingIncluded ? <IncludedBadge included label="packaging" /> : fmtCurrency(0)}
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-3">{labels.transport || "Transport"}</td>
              <td className="py-1.5 px-3 text-right font-mono whitespace-nowrap">
                {(pricing.transportPrice ?? 0) > 0 ? fmtCurrency(pricing.transportPrice) : (pricing.transportIncluded ? <IncludedBadge included label="transport" /> : "EXCLUDED")}
              </td>
            </tr>
            <tr className="border-t-2 border-b border-dashed">
              <td className="py-2 px-3 font-bold">TOTAL GROSS PRICE</td>
              <td className="py-2 px-3 text-right font-mono font-bold whitespace-nowrap">{fmtCurrency(pricing.grossTotal)}</td>
            </tr>
            {(pricing.discountPercent ?? 0) > 0 && (
              <tr className="border-b border-dashed">
                <td className="py-1.5 px-3 text-red-600">Sconto ({pricing.discountPercent}%)</td>
                <td className="py-1.5 px-3 text-right font-mono text-red-600 whitespace-nowrap">-{fmtCurrency(pricing.discountAmount)}</td>
              </tr>
            )}
            <tr className="border-t-2 border-blue-500">
              <td className="py-2 px-3 font-bold text-blue-600 dark:text-blue-400">TOTAL NET PRICE</td>
              <td className="py-2 px-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">{fmtCurrency(pricing.netTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 border-t pt-3">
        <ViewField label="Resa (Incoterms)" value={shipTerms.incoterms} />
        <ViewField label="Imballo" value={shipTerms.packaging} />
      </div>
    </div>
  );
}

function AvailableOptionsSelector({ availableOptions, itemPosition, currentOptions, onSelect, onAddBlank, testId }: {
  availableOptions?: { position: number; machineName: string; options: { name: string; price: number }[] }[] | null;
  itemPosition: number;
  currentOptions: OrderLineItemOption[];
  onSelect: (opt: OrderLineItemOption) => void;
  onAddBlank: () => void;
  testId: string;
}) {
  const machineData = availableOptions?.find(a => a.position === itemPosition);
  const currentNames = new Set(currentOptions.map(o => o.name));
  const remaining = machineData?.options.filter(o => !currentNames.has(o.name)) ?? [];

  if (!machineData || remaining.length === 0) {
    return (
      <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={onAddBlank} data-testid={testId}>
        <Plus className="w-3 h-3 mr-1" /> Optional
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Select onValueChange={(val) => {
        if (val === "__blank__") { onAddBlank(); return; }
        const opt = remaining.find(o => o.name === val);
        if (opt) onSelect({ name: opt.name, price: opt.price });
      }}>
        <SelectTrigger className="h-6 text-xs border-dashed w-auto min-w-[180px]" data-testid={testId}>
          <SelectValue placeholder={`+ Optional (${remaining.length} disp.)`} />
        </SelectTrigger>
        <SelectContent>
          {remaining.map((opt, i) => (
            <SelectItem key={i} value={opt.name}>
              {opt.name} <span className="text-muted-foreground ml-1">(+{fmtCurrency(opt.price)})</span>
            </SelectItem>
          ))}
          <SelectItem value="__blank__">
            <span className="text-muted-foreground">+ Inserisci manuale...</span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function MachineSearchInput({ value, onChange, onSelectMachine, testId }: {
  value: string;
  onChange: (val: string) => void;
  onSelectMachine: (machine: { description: string; unitPrice: number; options: { name: string; price: number }[] }) => void;
  testId?: string;
}) {
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: allMachines } = useQuery<any[]>({
    queryKey: ["/api/machines"],
  });

  const filtered = useMemo(() => {
    if (!query.trim() || !allMachines) return [];
    const q = query.toLowerCase();
    return allMachines
      .filter((m: any) => {
        const code = (m.machineCode ?? "").toLowerCase();
        const name = (m.name ?? "").toLowerCase();
        return code.includes(q) || name.includes(q);
      })
      .slice(0, 12);
  }, [query, allMachines]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (machine: any) => {
    const opts = (machine.options ?? []).map((o: any) => ({
      name: o.name,
      price: parseFloat(o.priceModifier ?? "0") || 0,
    }));
    const desc = machine.machineCode
      ? `${machine.machineCode} — ${machine.name}`
      : machine.name;
    onSelectMachine({
      description: desc,
      unitPrice: parseFloat(machine.basePrice ?? "0") || 0,
      options: opts,
    });
    setQuery("");
    setShowResults(false);
  };

  const isBlank = !value;

  if (!isBlank) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-sm border-dashed"
        data-testid={testId}
      />
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowResults(true);
        }}
        onFocus={() => { if (query.trim()) setShowResults(true); }}
        placeholder="Cerca per codice macchina o nome..."
        className="h-7 text-sm border-dashed"
        data-testid={testId}
      />
      {showResults && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto">
          {filtered.map((m: any) => (
            <button
              key={m.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center justify-between gap-2 border-b last:border-b-0"
              onClick={() => handleSelect(m)}
              data-testid={`machine-result-${m.id}`}
            >
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-xs text-muted-foreground">{m.machineCode || "—"}</span>
                <span className="font-medium truncate">{m.name}</span>
              </div>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">€{parseFloat(m.basePrice ?? "0").toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
            </button>
          ))}
        </div>
      )}
      {showResults && query.trim() && filtered.length === 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg p-3 text-sm text-muted-foreground">
          Nessuna macchina trovata per "{query}"
        </div>
      )}
    </div>
  );
}

function PricingSummaryEditor({ pricing, shipTerms, items, additionalItems, onChangePricing, onChangeShipTerms, onChangeItems, onChangeAdditional, orderId }: {
  pricing: OrderPriceSummary; shipTerms: OrderShippingTerms;
  items: OrderLineItem[]; additionalItems: OrderLineItem[];
  onChangePricing: (p: OrderPriceSummary) => void; onChangeShipTerms: (s: OrderShippingTerms) => void;
  onChangeItems: (items: OrderLineItem[]) => void; onChangeAdditional: (items: OrderLineItem[]) => void;
  orderId?: string;
}) {
  const { data: availableOptions } = useQuery<{ position: number; machineName: string; options: { name: string; price: number }[] }[]>({
    queryKey: ["/api/orders", orderId, "available-options"],
    queryFn: async () => {
      if (!orderId) return [];
      const res = await fetch(`/api/orders/${orderId}/available-options`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!orderId,
  });
  const updateItem = (i: number, patch: Partial<OrderLineItem>) => {
    onChangeItems(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  };
  const addItem = () => {
    onChangeItems([...items, { position: items.length + 1, description: "", unitPrice: 0, options: [] }]);
  };
  const removeItem = (i: number) => {
    onChangeItems(items.filter((_, idx) => idx !== i).map((it, idx) => ({ ...it, position: idx + 1 })));
  };
  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChangeItems(next.map((it, idx) => ({ ...it, position: idx + 1 })));
  };
  const updateOption = (itemIdx: number, optIdx: number, patch: Partial<OrderLineItemOption>) => {
    const opts = [...(items[itemIdx].options ?? [])];
    opts[optIdx] = { ...opts[optIdx], ...patch };
    updateItem(itemIdx, { options: opts });
  };
  const addOption = (itemIdx: number) => {
    const opts = [...(items[itemIdx].options ?? []), { name: "", price: 0 }];
    updateItem(itemIdx, { options: opts });
  };
  const removeOption = (itemIdx: number, optIdx: number) => {
    const opts = (items[itemIdx].options ?? []).filter((_, idx) => idx !== optIdx);
    updateItem(itemIdx, { options: opts });
  };

  const updateAdditional = (i: number, patch: Partial<OrderLineItem>) => {
    onChangeAdditional(additionalItems.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  };
  const addAdditional = () => {
    onChangeAdditional([...additionalItems, { position: additionalItems.length + 1, description: "", unitPrice: 0 }]);
  };
  const removeAdditional = (i: number) => {
    onChangeAdditional(additionalItems.filter((_, idx) => idx !== i));
  };

  const labels = pricing.priceLabels ?? {};
  const updateLabel = (key: string, value: string) => {
    onChangePricing({ ...pricing, priceLabels: { ...labels, [key]: value } });
  };
  const pNum = (v: string) => parseFloat(v) || 0;

  const computedTotalListPrice = useMemo(() => {
    const itemsTotal = items.reduce((s, i) => s + (i.unitPrice || 0) + (i.options ?? []).reduce((os, o) => os + (o.price || 0), 0), 0);
    const additionalTotal = additionalItems.filter(a => a.description !== "Interlocking").reduce((s, i) => s + (i.unitPrice || 0), 0);
    const interlocking = pricing.interlockingTotal ?? 0;
    return itemsTotal + additionalTotal + interlocking;
  }, [items, additionalItems, pricing.interlockingTotal]);

  const computedGrossTotal = useMemo(() => {
    const assemblyPrice = pricing.assemblyPrice ?? 0;
    const transportPrice = pricing.transportIncluded ? (pricing.transportPrice ?? 0) : 0;
    return computedTotalListPrice + assemblyPrice + transportPrice;
  }, [computedTotalListPrice, pricing.assemblyPrice, pricing.transportIncluded, pricing.transportPrice]);

  const computedDiscountAmount = useMemo(() => {
    const pct = pricing.discountPercent ?? 0;
    return pct > 0 ? (computedTotalListPrice * pct / 100) : 0;
  }, [computedTotalListPrice, pricing.discountPercent]);

  const computedNetTotal = useMemo(() => {
    return computedGrossTotal - computedDiscountAmount;
  }, [computedGrossTotal, computedDiscountAmount]);

  useEffect(() => {
    const needsUpdate =
      pricing.totalListPrice !== computedTotalListPrice ||
      pricing.grossTotal !== computedGrossTotal ||
      pricing.discountAmount !== computedDiscountAmount ||
      pricing.netTotal !== computedNetTotal;

    if (needsUpdate) {
      onChangePricing({
        ...pricing,
        totalListPrice: computedTotalListPrice,
        machinesTotal: computedTotalListPrice,
        grossTotal: computedGrossTotal,
        discountAmount: computedDiscountAmount,
        netTotal: computedNetTotal,
        totalOrderPrice: computedNetTotal,
      });
    }
  }, [computedTotalListPrice, computedGrossTotal, computedDiscountAmount, computedNetTotal]);

  const fmt = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="pt-2 space-y-6" data-testid="price-overview-edit">
      <table className="w-full text-sm" data-testid="table-price-overview-edit">
        {items.map((item, i) => {
          const opts = item.options ?? [];
          return (
            <tbody key={i}>
              <tr className="border-b border-dashed">
                <td className="py-1.5 px-2 w-16">
                  <span className="text-xs font-mono font-bold text-[#003bff]">Pos.{item.position}</span>
                </td>
                <td className="py-1.5 px-1">
                  <MachineSearchInput
                    value={item.description}
                    onChange={(val) => updateItem(i, { description: val })}
                    onSelectMachine={(machine) => updateItem(i, { description: machine.description, unitPrice: machine.unitPrice, options: machine.options })}
                    testId={`input-item-desc-${i}`}
                  />
                </td>
                <td className="py-1.5 px-1 w-36">
                  <Input type="number" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(i, { unitPrice: pNum(e.target.value) })} className="h-7 text-sm text-right font-mono border-dashed" data-testid={`input-item-price-${i}`} />
                </td>
                <td className="py-1.5 px-1 w-24">
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0} onClick={() => moveItem(i, i - 1)} data-testid={`btn-move-up-${i}`}>
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === items.length - 1} onClick={() => moveItem(i, i + 1)} data-testid={`btn-move-down-${i}`}>
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeItem(i)} data-testid={`btn-remove-item-${i}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
              {opts.map((opt, oi) => (
                <tr key={oi}>
                  <td className="py-0.5 px-2"></td>
                  <td className="py-0.5 px-1 pl-6">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground shrink-0">↳</span>
                      <Input value={opt.name} onChange={(e) => updateOption(i, oi, { name: e.target.value })} className="h-6 text-xs border-dashed" placeholder="Opzionale..." data-testid={`input-opt-name-${i}-${oi}`} />
                    </div>
                  </td>
                  <td className="py-0.5 px-1">
                    <Input type="number" step="0.01" value={opt.price} onChange={(e) => updateOption(i, oi, { price: pNum(e.target.value) })} className="h-6 text-xs text-right font-mono border-dashed" data-testid={`input-opt-price-${i}-${oi}`} />
                  </td>
                  <td className="py-0.5 px-1 w-8">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeOption(i, oi)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              <tr>
                <td></td>
                <td className="py-0.5 px-1 pl-6" colSpan={3}>
                  <AvailableOptionsSelector
                    availableOptions={availableOptions}
                    itemPosition={item.position}
                    currentOptions={opts}
                    onSelect={(opt) => {
                      const newOpts = [...(items[i].options ?? []), opt];
                      updateItem(i, { options: newOpts });
                    }}
                    onAddBlank={() => addOption(i)}
                    testId={`btn-add-opt-${i}`}
                  />
                </td>
              </tr>
            </tbody>
          );
        })}
        <tbody>
          <tr>
            <td colSpan={4} className="py-2 px-2">
              <Button variant="outline" size="sm" onClick={addItem} data-testid="btn-add-machine-item">
                <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi Macchina
              </Button>
            </td>
          </tr>
        </tbody>
      </table>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">Interlocking e Voci Aggiuntive</p>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-2 text-muted-foreground">Interlocking</td>
              <td className="py-1.5 px-1 w-36">
                <Input type="number" step="0.01" value={pricing.interlockingTotal ?? 0} onChange={(e) => onChangePricing({ ...pricing, interlockingTotal: pNum(e.target.value) })} className="h-7 text-sm text-right font-mono border-dashed" data-testid="input-pricing-interlocking" />
              </td>
              <td className="w-8"></td>
            </tr>
            {additionalItems.filter(a => a.description !== "Interlocking").map((item, i) => (
              <tr key={`add-${i}`} className="border-b border-dashed">
                <td className="py-1.5 px-2">
                  <Input value={item.description} onChange={(e) => updateAdditional(i, { description: e.target.value })} className="h-7 text-sm border-dashed" placeholder="Descrizione..." data-testid={`input-additional-desc-${i}`} />
                </td>
                <td className="py-1.5 px-1 w-36">
                  <Input type="number" step="0.01" value={item.unitPrice} onChange={(e) => updateAdditional(i, { unitPrice: pNum(e.target.value) })} className="h-7 text-sm text-right font-mono border-dashed" data-testid={`input-additional-price-${i}`} />
                </td>
                <td className="py-1.5 px-1 w-8">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeAdditional(i)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="py-2 px-2">
                <Button variant="outline" size="sm" onClick={addAdditional} data-testid="btn-add-additional-item">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi Voce
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <table className="w-full text-sm">
        <tbody>
          <tr className="border-t-2 border-b-2">
            <td className="py-2 px-3 font-bold">
              <Input value={labels.totalListPrice || "TOTAL LIST PRICE (ex works, installation excluded)"} onChange={(e) => updateLabel("totalListPrice", e.target.value)} className="h-7 text-sm font-bold border-dashed" data-testid="input-label-totalListPrice" />
            </td>
            <td className="py-2 px-3 text-right w-40 font-mono font-bold" data-testid="computed-totalListPrice">
              € {fmt(computedTotalListPrice)}
            </td>
          </tr>
        </tbody>
      </table>

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 px-3">NET SERVICE PRICES</p>
        <table className="w-full text-sm" data-testid="table-service-prices-edit">
          <tbody>
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-3">
                <Input value={labels.installation || "Installation and start-up"} onChange={(e) => updateLabel("installation", e.target.value)} className="h-7 text-sm border-dashed" />
                <div className="flex items-center gap-2 mt-1">
                  <Label className="text-[10px] text-muted-foreground shrink-0">Giorni</Label>
                  <Input type="number" value={pricing.assemblySoldDays ?? 0} onChange={(e) => onChangePricing({ ...pricing, assemblySoldDays: pNum(e.target.value) })} className="h-6 text-xs border-dashed w-16" />
                  <Label className="text-[10px] text-muted-foreground shrink-0">× €/giorno</Label>
                  <Input type="number" step="0.01" value={pricing.assemblyDailyRate ?? 0} onChange={(e) => onChangePricing({ ...pricing, assemblyDailyRate: pNum(e.target.value) })} className="h-6 text-xs border-dashed w-20 font-mono" />
                </div>
              </td>
              <td className="py-1.5 px-3 text-right w-40 align-top">
                <div className="flex items-center gap-2 justify-end">
                  <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={pricing.installationIncluded ?? false} onChange={(e) => onChangePricing({ ...pricing, installationIncluded: e.target.checked })} className="rounded" />
                    Incluso
                  </label>
                  <Input type="number" step="0.01" value={pricing.assemblyPrice} onChange={(e) => onChangePricing({ ...pricing, assemblyPrice: pNum(e.target.value) })} className="h-7 text-sm text-right font-mono border-dashed w-28" data-testid="input-pricing-assemblyPrice" />
                </div>
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-3">
                <Input value={labels.travelCosts || "Travel and flight costs for our engineers"} onChange={(e) => updateLabel("travelCosts", e.target.value)} className="h-7 text-sm border-dashed" />
              </td>
              <td className="py-1.5 px-3 text-right w-40">
                <label className="flex items-center gap-1 text-xs justify-end cursor-pointer">
                  <input type="checkbox" checked={pricing.travelIncluded ?? false} onChange={(e) => onChangePricing({ ...pricing, travelIncluded: e.target.checked })} className="rounded" />
                  INCLUDED
                </label>
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-3">
                <Input value={labels.boardLodging || "Board and lodging for the engineers"} onChange={(e) => updateLabel("boardLodging", e.target.value)} className="h-7 text-sm border-dashed" />
              </td>
              <td className="py-1.5 px-3 text-right w-40">
                <label className="flex items-center gap-1 text-xs justify-end cursor-pointer">
                  <input type="checkbox" checked={pricing.hotelIncluded ?? false} onChange={(e) => onChangePricing({ ...pricing, hotelIncluded: e.target.checked })} className="rounded" />
                  INCLUDED
                </label>
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-3">
                <Input value={labels.training || "Training time after first start-up"} onChange={(e) => updateLabel("training", e.target.value)} className="h-7 text-sm border-dashed" />
                <div className="flex items-center gap-2 mt-1">
                  <Label className="text-[10px] text-muted-foreground shrink-0">Giorni</Label>
                  <Input value={pricing.trainingDays ?? ""} onChange={(e) => onChangePricing({ ...pricing, trainingDays: e.target.value })} className="h-6 text-xs border-dashed w-16" />
                </div>
              </td>
              <td className="py-1.5 px-3 text-right w-40">
                <label className="flex items-center gap-1 text-xs justify-end cursor-pointer">
                  <input type="checkbox" checked={pricing.trainingIncluded ?? false} onChange={(e) => onChangePricing({ ...pricing, trainingIncluded: e.target.checked })} className="rounded" />
                  INCLUDED
                </label>
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-3">
                <Input value={labels.packaging || "Package where necessary"} onChange={(e) => updateLabel("packaging", e.target.value)} className="h-7 text-sm border-dashed" />
              </td>
              <td className="py-1.5 px-3 text-right w-40">
                <label className="flex items-center gap-1 text-xs justify-end cursor-pointer">
                  <input type="checkbox" checked={pricing.packagingIncluded ?? false} onChange={(e) => onChangePricing({ ...pricing, packagingIncluded: e.target.checked })} className="rounded" />
                  INCLUDED
                </label>
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-3">
                <Input value={labels.transport || "Transport"} onChange={(e) => updateLabel("transport", e.target.value)} className="h-7 text-sm border-dashed" />
              </td>
              <td className="py-1.5 px-3 text-right w-40">
                <div className="flex items-center gap-2 justify-end">
                  <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer shrink-0">
                    <input type="checkbox" checked={pricing.transportIncluded ?? false} onChange={(e) => onChangePricing({ ...pricing, transportIncluded: e.target.checked })} className="rounded" />
                    Incluso
                  </label>
                  <Input type="number" step="0.01" value={pricing.transportPrice ?? 0} onChange={(e) => onChangePricing({ ...pricing, transportPrice: pNum(e.target.value) })} className="h-7 text-sm text-right font-mono border-dashed w-28" data-testid="input-pricing-transportPrice" />
                </div>
              </td>
            </tr>
            <tr className="border-t-2 border-b border-dashed">
              <td className="py-2 px-3 font-bold">TOTAL GROSS PRICE</td>
              <td className="py-2 px-3 text-right w-40 font-mono font-bold" data-testid="computed-grossTotal">
                € {fmt(computedGrossTotal)}
              </td>
            </tr>
            <tr className="border-b border-dashed">
              <td className="py-1.5 px-3 text-red-600">
                <div className="flex items-center gap-2">
                  <span>Sconto</span>
                  <Input type="number" step="0.1" value={pricing.discountPercent ?? 0} onChange={(e) => onChangePricing({ ...pricing, discountPercent: pNum(e.target.value) })} className="h-6 text-xs border-dashed w-16 text-red-600 font-mono" data-testid="input-pricing-discountPercent" />
                  <span className="text-xs">%</span>
                </div>
              </td>
              <td className="py-1.5 px-3 text-right w-40 font-mono text-red-600" data-testid="computed-discountAmount">
                {computedDiscountAmount > 0 ? `- € ${fmt(computedDiscountAmount)}` : "—"}
              </td>
            </tr>
            <tr className="border-t-2 border-blue-500">
              <td className="py-2 px-3 font-bold text-blue-600 dark:text-blue-400">TOTAL NET PRICE</td>
              <td className="py-2 px-3 text-right w-40 font-mono font-bold text-blue-600 dark:text-blue-400" data-testid="computed-netTotal">
                € {fmt(computedNetTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t">
        <EditField label="Resa (Incoterms)" value={shipTerms.incoterms} onChange={(v) => onChangeShipTerms({ ...shipTerms, incoterms: v })} testId="input-incoterms" />
        <EditField label="Imballo" value={shipTerms.packaging} onChange={(v) => onChangeShipTerms({ ...shipTerms, packaging: v })} testId="input-packaging" />
      </div>
    </div>
  );
}

function DealerContactSelector({ dealerCompanyId, value, onChange }: {
  dealerCompanyId?: number | null;
  value: string;
  onChange: (contactName: string) => void;
}) {
  const { data: contacts } = useQuery<any[]>({
    queryKey: ["/api/dealers", dealerCompanyId, "contacts"],
    queryFn: async () => {
      const res = await fetch(`/api/dealers/${dealerCompanyId}/contacts`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!dealerCompanyId,
  });

  if (!dealerCompanyId) {
    return (
      <div>
        <Label className="text-[10px] text-muted-foreground">Contatto</Label>
        <Input value={value} disabled placeholder="Seleziona azienda..." className="h-8 text-sm mt-0.5" />
      </div>
    );
  }

  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">Contatto</Label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-sm mt-0.5" data-testid="select-agent-contact"><SelectValue placeholder="Seleziona contatto..." /></SelectTrigger>
        <SelectContent>
          {(contacts ?? []).map((c: any) => {
            const fullName = [c.name, c.surname].filter(Boolean).join(" ");
            return <SelectItem key={c.id} value={fullName}>{fullName}{c.role ? ` (${c.role})` : ""}</SelectItem>;
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

function WordDiffLine({ original, modified }: { original: string; modified: string }) {
  const segments = computeWordDiff(original, modified);
  return (
    <span>
      {segments.map((seg, i) => {
        if (seg.type === "equal") return <span key={i}>{seg.text}</span>;
        if (seg.type === "removed") return <span key={i} className="text-red-600 dark:text-red-400 line-through">{seg.text}</span>;
        return <span key={i} className="text-green-600 dark:text-green-400 underline">{seg.text}</span>;
      })}
    </span>
  );
}

function renderTextWithImages(text: string): (JSX.Element | null)[] {
  return text.split(/\[\[IMG:([^\]]+)\]\]/).map((part, pi) =>
    pi % 2 === 0 ? (
      part ? <span key={pi}>{part}</span> : null
    ) : (
      <img key={pi} src={`/machine-images/${part}`} alt={`Detail`} className="max-w-full h-auto max-h-[260px] object-contain rounded-md bg-gray-50 my-1 inline-block" />
    )
  );
}

function DescriptionDiff({ original, modified }: { original: string; modified: string }) {
  const origNorm = (original ?? "").replace(/\r\n/g, "\n");
  const modNorm = (modified ?? "").replace(/\r\n/g, "\n");
  if (origNorm === modNorm) return null;
  const lineDiffs = computeLineDiff(origNorm, modNorm);
  const hasChanges_ = lineDiffs.some(ld => ld.type !== "equal");
  if (!hasChanges_) return null;
  return (
    <div className="space-y-0.5">
      {lineDiffs.map((ld, i) => {
        if (ld.type === "equal") return <div key={i}>{renderTextWithImages(ld.text || "\u00A0")}</div>;
        if (ld.type === "removed") return <div key={i} className="text-red-600 dark:text-red-400 line-through">{renderTextWithImages(ld.oldLine || "\u00A0")}</div>;
        if (ld.type === "added") return <div key={i} className="text-green-600 dark:text-green-400 underline">{renderTextWithImages(ld.newLine || "\u00A0")}</div>;
        return (
          <div key={i}>
            <WordDiffLine original={ld.oldLine!} modified={ld.newLine!} />
          </div>
        );
      })}
    </div>
  );
}

function TechnicalSheetsView({ lineTechData, sheets, editing, orderItems, onChangeLineData, onChange, changes }: {
  lineTechData: OrderLineTechnicalData | null;
  sheets: OrderTechnicalSheet[];
  editing: boolean;
  orderItems?: OrderLineItem[];
  onChangeLineData: (d: OrderLineTechnicalData) => void;
  onChange: (sheets: OrderTechnicalSheet[]) => void;
  changes?: Record<string, ChangeType> | null;
}) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [descExpanded, setDescExpanded] = useState<Record<number, boolean>>({});
  const [lineExpanded, setLineExpanded] = useState(true);
  const toggleSheet = (i: number) => setExpanded(prev => ({ ...prev, [i]: !prev[i] }));
  const toggleDesc = (i: number) => setDescExpanded(prev => ({ ...prev, [i]: !prev[i] }));

  const enrichedSheets = useMemo(() => {
    if (!orderItems || orderItems.length === 0) return sheets;
    return sheets.map(sheet => {
      const matchingItem = orderItems.find(it => it.position === sheet.machinePosition);
      if (!matchingItem) return sheet;
      const optNames = (matchingItem.options ?? []).filter(o => o.name).map(o => o.name);
      if (optNames.length > 0 && (sheet.optionals?.length ?? 0) === 0) {
        return { ...sheet, optionals: optNames };
      }
      return sheet;
    });
  }, [sheets, orderItems]);

  const updateSheet = (i: number, patch: Partial<OrderTechnicalSheet>) => {
    onChange(sheets.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };

  const updateLine = (patch: Partial<OrderLineTechnicalData>) => {
    if (!lineTechData) return;
    onChangeLineData({ ...lineTechData, ...patch });
  };

  const techField = (label: string, value: string, onEdit?: (v: string) => void, changePath?: string) => {
    const fieldChange = changePath && changes ? (changes[changePath] ?? null) : null;
    const ringCls = fieldChange ? "ring-1 ring-blue-300 rounded p-1" : "";
    return (
      <div className={ringCls}>
        {editing && onEdit ? (
          <>
            <Label className="text-[10px] text-muted-foreground">{label}</Label>
            <Input value={value} onChange={(e) => onEdit(e.target.value)} className="h-7 text-sm border-dashed" />
          </>
        ) : (
          <ViewField label={label} value={value || "—"} changeType={fieldChange} />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 pt-2">
      {lineTechData && (
        <div className="border rounded-lg overflow-hidden" data-testid="tech-line-general">
          <div className="flex items-center gap-2 p-3 bg-primary/5">
            <Wrench className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Dati Tecnici Generali della Linea</span>
          </div>
          <div className="p-4 space-y-4">
              <div>
                <p className="uppercase tracking-wider mb-2 text-[15px] font-bold text-[#000000]">Dati Progetto</p>
                <div className="grid grid-cols-3 gap-3">
                  {techField("Min/Max. Lunghezza (mm)", lineTechData.minMaxLength ?? "", (v) => updateLine({ minMaxLength: v }), "lineTechnicalData.minMaxLength")}
                  {techField("Max. Larghezza (mm)", lineTechData.workingWidth ?? "", (v) => updateLine({ workingWidth: v }), "lineTechnicalData.workingWidth")}
                  {techField("Min/Max. Spessore (mm)", lineTechData.minMaxThickness ?? "", (v) => updateLine({ minMaxThickness: v }), "lineTechnicalData.minMaxThickness")}
                  {techField("Velocità Media Linea (mt/min)", lineTechData.workingSpeed ?? "", (v) => updateLine({ workingSpeed: v }), "lineTechnicalData.workingSpeed")}
                  {techField("Lato Comandi", lineTechData.controlSide ?? "", (v) => updateLine({ controlSide: v }), "lineTechnicalData.controlSide")}
                  {techField("Max. Arco Pannello", lineTechData.maxBow ?? "", (v) => updateLine({ maxBow: v }), "lineTechnicalData.maxBow")}
                  {techField("Verniciatura", lineTechData.paint ?? "", (v) => updateLine({ paint: v }), "lineTechnicalData.paint")}
                  {techField("Substrato", lineTechData.substrate ?? "", (v) => updateLine({ substrate: v }), "lineTechnicalData.substrate")}
                  {techField("Livello Finitura", lineTechData.finishing ?? "", (v) => updateLine({ finishing: v }), "lineTechnicalData.finishing")}
                </div>
              </div>

              <div>
                <p className="uppercase tracking-wider mb-2 font-bold text-[15px] text-[#000000]">Fonti di Energia</p>
                <div className="grid grid-cols-3 gap-3">
                  {techField("Energia per Riscaldamento", lineTechData.energySources?.heating ?? "", (v) => updateLine({ energySources: { ...lineTechData.energySources, heating: v } }), "lineTechnicalData.energySources.heating")}
                  {techField("Aliment. Elettrica", lineTechData.energySources?.electrical ?? "", (v) => updateLine({ energySources: { ...lineTechData.energySources, electrical: v } }), "lineTechnicalData.energySources.electrical")}
                  {techField("Aliment. Pneumatica", lineTechData.energySources?.pneumatic ?? "", (v) => updateLine({ energySources: { ...lineTechData.energySources, pneumatic: v } }), "lineTechnicalData.energySources.pneumatic")}
                </div>
              </div>

              <div>
                <p className="uppercase tracking-wider mb-2 text-[15px] font-bold text-[#000000]">Prestazioni Richieste</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {techField("Velocità m/1'", lineTechData.performance?.speed ?? "", (v) => updateLine({ performance: { ...lineTechData.performance, speed: v } }), "lineTechnicalData.performance.speed")}
                  {techField("Turni Lavoro", lineTechData.performance?.shifts ?? "", (v) => updateLine({ performance: { ...lineTechData.performance, shifts: v } }), "lineTechnicalData.performance.shifts")}
                  {techField("Dim. Minime Pezzi mm", lineTechData.performance?.minPieceDimensions ?? "", (v) => updateLine({ performance: { ...lineTechData.performance, minPieceDimensions: v } }), "lineTechnicalData.performance.minPieceDimensions")}
                  {techField("Dim. Massime Pezzi mm", lineTechData.performance?.maxPieceDimensions ?? "", (v) => updateLine({ performance: { ...lineTechData.performance, maxPieceDimensions: v } }), "lineTechnicalData.performance.maxPieceDimensions")}
                  {techField("Peso Massimo KG", lineTechData.performance?.maxPieceWeight ?? "", (v) => updateLine({ performance: { ...lineTechData.performance, maxPieceWeight: v } }), "lineTechnicalData.performance.maxPieceWeight")}
                </div>
              </div>

              <div>
                <p className="uppercase tracking-wider mb-2 text-[15px] font-bold text-[#000000]">Automatismi Richiesti</p>
                <div className="grid grid-cols-3 gap-3">
                  {techField("Automatismi", lineTechData.automations?.requested ?? "", (v) => updateLine({ automations: { ...lineTechData.automations, requested: v } }), "lineTechnicalData.automations.requested")}
                  {techField("Controllo", lineTechData.automations?.control ?? "", (v) => updateLine({ automations: { ...lineTechData.automations, control: v } }), "lineTechnicalData.automations.control")}
                  {techField("Controllo Extra", lineTechData.automations?.extraControl ?? "", (v) => updateLine({ automations: { ...lineTechData.automations, extraControl: v } }), "lineTechnicalData.automations.extraControl")}
                </div>
              </div>

              <div>
                <p className="uppercase tracking-wider mb-2 font-bold text-[15px] text-[#000000]">Montaggio e Messa in Funzione</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {techField("Data Inizio Montaggio", lineTechData.commissioning?.assemblyStartDate ?? "", (v) => updateLine({ commissioning: { ...lineTechData.commissioning, assemblyStartDate: v } }), "lineTechnicalData.commissioning.assemblyStartDate")}
                  {techField("Data Inizio Produzione", lineTechData.commissioning?.productionStartDate ?? "", (v) => updateLine({ commissioning: { ...lineTechData.commissioning, productionStartDate: v } }), "lineTechnicalData.commissioning.productionStartDate")}
                  {techField("Cablaggi Elettrici", lineTechData.commissioning?.electricalWiring ?? "", (v) => updateLine({ commissioning: { ...lineTechData.commissioning, electricalWiring: v } }), "lineTechnicalData.commissioning.electricalWiring")}
                  {techField("Cavi Elettrici", lineTechData.commissioning?.electricalCables ?? "", (v) => updateLine({ commissioning: { ...lineTechData.commissioning, electricalCables: v } }), "lineTechnicalData.commissioning.electricalCables")}
                </div>
              </div>
            </div>
          </div>
      )}
      {enrichedSheets.length > 0 && (
        <div className="space-y-3" data-testid="tech-sheets-list">
          <p className="uppercase tracking-wider flex items-center gap-2 px-1 text-[15px] font-bold text-[#000000]">
            <Settings2 className="w-3.5 h-3.5" /> Schede per Posizione
          </p>
          {enrichedSheets.map((sheet, i) => {
            const sheetChange = changes ? (changes[`technicalSheets[${i}]`] ?? null) : null;
            const sheetRing = sheetChange ? "ring-1 ring-blue-300" : "";
            return (
              <div key={i} className={`border-2 border-black dark:border-white rounded-lg overflow-hidden ${sheetRing}`} data-testid={`tech-sheet-${i}`}>
                <div className="flex items-center gap-2 p-3 bg-muted/30">
                  <span className="font-mono text-xs font-bold text-[#0018ff]">Pos. {sheet.machinePosition}</span>
                  <span className="font-semibold text-sm">{sheet.machineName}</span>
                </div>
                <div className="p-4 space-y-4">
                    {sheet.currentDescription && (() => {
                      const origDesc = (sheet.originalDescription ?? "").replace(/\r\n/g, "\n");
                      const currDesc = (sheet.currentDescription ?? "").replace(/\r\n/g, "\n");
                      const isModified = origDesc !== "" && origDesc !== currDesc;
                      const descBadge = sheet.isCustomMachine
                        ? { label: "Speciale", cls: "bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-600" }
                        : isModified
                        ? { label: "Modificata", cls: "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600" }
                        : { label: "Standard", cls: "bg-gray-50 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600" };
                      const isOpen = !!descExpanded[i];
                      return (
                        <div data-testid={`tech-sheet-desc-${i}`}>
                          <button
                            type="button"
                            onClick={() => toggleDesc(i)}
                            className="flex items-center gap-2 w-full text-left cursor-pointer hover:bg-muted/40 rounded px-1 py-1 transition-colors"
                            data-testid={`btn-toggle-desc-${i}`}
                          >
                            {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                            <span className="text-xs uppercase tracking-wider font-bold">Descrizione</span>
                            <Badge variant="outline" className={`text-xs ${descBadge.cls}`}>{descBadge.label}</Badge>
                          </button>
                          {isOpen && (
                            <div className="mt-2">
                              {sheet.machineImageUrl && (
                                <div className="mb-3" data-testid={`tech-sheet-photo-${i}`}>
                                  <img
                                    src={`/machine-images/${sheet.machineImageUrl.includes(".") ? sheet.machineImageUrl : `${sheet.machineImageUrl}.png`}`}
                                    alt={sheet.machineName}
                                    className="max-w-full h-auto max-h-[300px] object-contain rounded-md bg-gray-50"
                                  />
                                </div>
                              )}
                              <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                                {isModified ? (
                                  <DescriptionDiff original={origDesc} modified={currDesc} />
                                ) : (
                                  currDesc.split(/\[\[IMG:([^\]]+)\]\]/).map((part: string, pi: number) =>
                                    pi % 2 === 0 ? (
                                      part.trim() ? <p key={pi} className="whitespace-pre-wrap">{part}</p> : null
                                    ) : (
                                      <div key={pi} className="my-2">
                                        <img
                                          src={`/machine-images/${part}`}
                                          alt={`Detail ${Math.ceil(pi / 2)}`}
                                          className="max-w-full h-auto max-h-[260px] object-contain rounded-md bg-gray-50"
                                        />
                                      </div>
                                    )
                                  )
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {(sheet.optionals?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-xs uppercase tracking-wider mb-2 font-bold text-[#ff0000]">Optionals Richiesti</p>
                        <div className="space-y-1.5">
                          {sheet.optionals.map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-2">
                              <span className="text-xs font-mono text-muted-foreground w-4">{oi + 1}</span>
                              {editing ? (
                                <Input value={opt} onChange={(e) => { const next = [...sheet.optionals]; next[oi] = e.target.value; updateSheet(i, { optionals: next }); }} className="h-7 text-sm border-dashed flex-1" data-testid={`input-optional-${i}-${oi}`} />
                              ) : (
                                <span className="text-sm">{opt}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-xs uppercase tracking-wider mb-2 text-[#00c727] font-bold">Ricambi Richiesti</p>
                      <div className="space-y-1.5">
                        {editing && (
                          <div className="grid grid-cols-[60px_2fr_1fr_32px] gap-2 mb-1">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Qtà</span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Descrizione</span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Codice</span>
                            <span />
                          </div>
                        )}
                        {!editing && (sheet.spareParts ?? []).length > 0 && (
                          <div className="grid grid-cols-[40px_60px_1fr_120px] gap-2 mb-1">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">#</span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Qtà</span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Descrizione</span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Codice</span>
                          </div>
                        )}
                        {(sheet.spareParts ?? []).map((sp, si) => {
                          const spObj = typeof sp === "string" ? { quantity: "", description: sp, code: "" } : sp;
                          return editing ? (
                          <div key={si} className="grid grid-cols-[60px_2fr_1fr_32px] gap-2">
                            <Input value={spObj.quantity} onChange={(e) => { const next = [...(sheet.spareParts ?? [])]; next[si] = { ...spObj, quantity: e.target.value }; updateSheet(i, { spareParts: next }); }} className="h-7 text-sm border-dashed" placeholder="1" data-testid={`input-spare-qty-${i}-${si}`} />
                            <Input value={spObj.description} onChange={(e) => { const next = [...(sheet.spareParts ?? [])]; next[si] = { ...spObj, description: e.target.value }; updateSheet(i, { spareParts: next }); }} className="h-7 text-sm border-dashed" placeholder="Descrizione..." data-testid={`input-spare-desc-${i}-${si}`} />
                            <Input value={spObj.code} onChange={(e) => { const next = [...(sheet.spareParts ?? [])]; next[si] = { ...spObj, code: e.target.value }; updateSheet(i, { spareParts: next }); }} className="h-7 text-sm border-dashed" placeholder="Codice" data-testid={`input-spare-code-${i}-${si}`} />
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => {
                              updateSheet(i, { spareParts: (sheet.spareParts ?? []).filter((_: any, idx: number) => idx !== si) });
                            }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                          ) : (
                          <div key={si} className="grid grid-cols-[40px_60px_1fr_120px] gap-2">
                            <span className="text-xs font-mono text-muted-foreground">{si + 1}</span>
                            <span className="text-sm font-semibold">{spObj.quantity || "—"}</span>
                            <span className="text-sm">{spObj.description || "—"}</span>
                            <span className="text-sm font-mono text-muted-foreground">{spObj.code || "—"}</span>
                          </div>
                          );
                        })}
                        {editing && (
                          <Button variant="outline" size="sm" onClick={() => updateSheet(i, { spareParts: [...(sheet.spareParts ?? []), { quantity: "", description: "", code: "" }] })} data-testid={`btn-add-spare-${i}`}>
                            <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi Ricambio
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShipmentsSection({ shipments, editing, orderId, onChange, changes, prevSnapshot }: {
  shipments: OrderShipment[]; editing: boolean; orderId?: number;
  onChange: (s: OrderShipment[]) => void;
  changes?: Record<string, ChangeType> | null; prevSnapshot?: any;
}) {
  const { toast } = useToast();

  const addShipment = () => {
    onChange([...shipments, { id: `ship-${Date.now()}`, date: "", description: "", ddtNumber: "" }]);
  };
  const removeShipment = (i: number) => onChange(shipments.filter((_, idx) => idx !== i));
  const updateShipment = (i: number, patch: Partial<OrderShipment>) => {
    onChange(shipments.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };

  const handleFileUpload = async (file: File, idx: number, type: "ddt" | "cmr") => {
    if (!orderId) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/orders/${orderId}/${type}`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (type === "ddt") {
        updateShipment(idx, { ddtFilename: data.filename, ddtOriginalName: data.originalName });
        toast({ title: "Bolla caricata" });
      } else {
        updateShipment(idx, { cmrFilename: data.filename, cmrOriginalName: data.originalName });
        toast({ title: "CMR caricato" });
      }
    } catch {
      toast({ title: `Errore upload ${type === "ddt" ? "bolla" : "CMR"}`, variant: "destructive" });
    }
  };

  if (!editing && shipments.length === 0) {
    return <p className="text-sm text-muted-foreground pt-2">Nessuna spedizione registrata.</p>;
  }

  return (
    <div className="space-y-3 pt-2">
      {shipments.map((s, i) => {
        const shipKey = `logistics.shipments[${i}]`;
        const shipChange = changes ? (changes[shipKey] ?? null) : null;
        const prevShip = prevSnapshot?.logistics?.shipments?.[i];
        const ringCls = shipChange ? "ring-1 ring-blue-300" : "";
        return (
        <div key={s.id} className={`border rounded-lg p-3 space-y-3 ${ringCls}`} data-testid={`shipment-row-${i}`}>
          <div className="grid sm:grid-cols-4 gap-3">
            {editing ? (
              <>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Data Spedizione</Label>
                  <Input type="date" value={s.date} onChange={(e) => updateShipment(i, { date: e.target.value })} className="h-8 text-sm" data-testid={`input-ship-date-${i}`} />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">N. Bolla (DDT)</Label>
                  <Input value={s.ddtNumber} onChange={(e) => updateShipment(i, { ddtNumber: e.target.value })} className="h-8 text-sm" placeholder="DDT-001" data-testid={`input-ship-ddt-${i}`} />
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px] text-muted-foreground">Descrizione</Label>
                  <Input value={s.description} onChange={(e) => updateShipment(i, { description: e.target.value })} className="h-8 text-sm" placeholder="Contenuto spedizione..." data-testid={`input-ship-desc-${i}`} />
                </div>
              </>
            ) : (
              <>
                <ViewField label="Data" value={fmtDate(s.date)} changeType={changes?.[`${shipKey}.date`] ?? null} previousValue={prevShip?.date ? fmtDate(prevShip.date) : undefined} />
                <ViewField label="N. Bolla" value={s.ddtNumber || "—"} changeType={changes?.[`${shipKey}.ddtNumber`] ?? null} previousValue={prevShip?.ddtNumber} />
                <ViewField label="Descrizione" value={s.description || "—"} className="col-span-2" changeType={changes?.[`${shipKey}.description`] ?? null} previousValue={prevShip?.description} />
              </>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">CMR:</span>
              {s.cmrFilename ? (
                <a href={`/order-certificates/${s.cmrFilename}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline" data-testid={`link-cmr-${i}`}>
                  <FileText className="w-3.5 h-3.5" /> {s.cmrOriginalName || "CMR"}
                </a>
              ) : editing && orderId ? (
                <label className="cursor-pointer">
                  <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], i, "cmr"); }} />
                  <span className="inline-flex items-center gap-1 text-xs border rounded-md px-2 py-1 hover:bg-muted transition-colors" data-testid={`btn-upload-cmr-${i}`}>
                    <Upload className="w-3 h-3" /> Carica CMR
                  </span>
                </label>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Bolla:</span>
              {s.ddtFilename ? (
                <a href={`/order-certificates/${s.ddtFilename}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline" data-testid={`link-ddt-${i}`}>
                  <FileText className="w-3.5 h-3.5" /> {s.ddtOriginalName || "Bolla"}
                </a>
              ) : editing && orderId ? (
                <label className="cursor-pointer">
                  <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], i, "ddt"); }} />
                  <span className="inline-flex items-center gap-1 text-xs border rounded-md px-2 py-1 hover:bg-muted transition-colors" data-testid={`btn-upload-ddt-${i}`}>
                    <Upload className="w-3 h-3" /> Carica Bolla
                  </span>
                </label>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>

            {editing && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive ml-auto" onClick={() => removeShipment(i)} data-testid={`btn-remove-shipment-${i}`}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Rimuovi
              </Button>
            )}
          </div>
        </div>
        );
      })}
      {editing && (
        <Button variant="outline" size="sm" onClick={addShipment} data-testid="btn-add-shipment">
          <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi Spedizione
        </Button>
      )}
    </div>
  );
}

function countWorkingDays(from: Date, to: Date): number {
  let count = 0;
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (d <= end) {
    if (d.getDay() !== 0) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function computeAutoProgress(startDate: string, expectedDurationDays: number): { percent: number; elapsedDays: number; isAuto: boolean } {
  if (!startDate || !expectedDurationDays || expectedDurationDays <= 0) return { percent: 0, elapsedDays: 0, isAuto: false };
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return { percent: 0, elapsedDays: 0, isAuto: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (today < start) return { percent: 0, elapsedDays: 0, isAuto: true };
  const elapsed = countWorkingDays(start, today);
  const percent = Math.min(100, Math.round((elapsed / expectedDurationDays) * 100));
  return { percent, elapsedDays: elapsed, isAuto: true };
}

function PhaseSection({ phase, editing, phaseLabel, orderId, onChange, changes, phasePrefix }: {
  phase: OrderPhaseData; editing: boolean; phaseLabel: string; orderId?: number;
  onChange: (p: OrderPhaseData) => void;
  changes?: Record<string, ChangeType> | null; phasePrefix?: string;
}) {
  const certFileRef = useRef<HTMLInputElement>(null);
  const [workerInput, setWorkerInput] = useState("");
  const { toast } = useToast();

  const update = (patch: Partial<OrderPhaseData>) => onChange({ ...phase, ...patch });

  const autoProgress = useMemo(
    () => computeAutoProgress(phase.startDate, phase.expectedDurationDays),
    [phase.startDate, phase.expectedDurationDays]
  );
  const displayProgress = autoProgress.isAuto ? autoProgress.percent : phase.progressPercent;

  const addWorker = () => {
    const name = workerInput.trim();
    if (name && !phase.workers.includes(name)) {
      update({ workers: [...phase.workers, name] });
      setWorkerInput("");
    }
  };
  const removeWorker = (i: number) => update({ workers: phase.workers.filter((_, idx) => idx !== i) });

  const handleCertUpload = async (file: File) => {
    if (!orderId) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/orders/${orderId}/certificates`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      update({ certificates: [...phase.certificates, { id: data.id, filename: data.filename, originalName: data.originalName }] });
      toast({ title: "Certificato caricato" });
    } catch {
      toast({ title: "Errore upload certificato", variant: "destructive" });
    }
  };

  const removeCert = async (cert: { id: string; filename: string; originalName: string }) => {
    if (orderId) {
      try {
        await fetch(`/api/orders/${orderId}/certificates/${cert.filename}`, { method: "DELETE", credentials: "include" });
      } catch { /* ignore */ }
    }
    update({ certificates: phase.certificates.filter(c => c.id !== cert.id) });
  };

  const progressColor = displayProgress >= 100
    ? "text-green-600 dark:text-green-400"
    : displayProgress >= 50
    ? "text-blue-600 dark:text-blue-400"
    : displayProgress > 0
    ? "text-amber-600 dark:text-amber-400"
    : "text-muted-foreground";

  const overdue = autoProgress.isAuto && autoProgress.percent > 100;

  return (
    <div className="space-y-4 pt-2">
      <div className="grid sm:grid-cols-4 gap-4">
        {editing ? (
          <>
            <div>
              <Label className="text-[10px] text-muted-foreground">Data Inizio</Label>
              <Input type="date" value={phase.startDate} onChange={(e) => update({ startDate: e.target.value })} className="h-8 text-sm" data-testid={`input-phase-start`} />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Durata Prevista (giorni lav.)</Label>
              <Input type="number" min={0} value={phase.expectedDurationDays || ""} onChange={(e) => update({ expectedDurationDays: parseInt(e.target.value) || 0 })} className="h-8 text-sm" data-testid={`input-phase-duration`} />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Data Fine Effettiva</Label>
              <Input type="date" value={phase.endDate} onChange={(e) => update({ endDate: e.target.value })} className="h-8 text-sm" data-testid={`input-phase-end`} />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Avanzamento</Label>
              <div className="flex items-center gap-2 mt-0.5">
                <Progress value={displayProgress} className={`flex-1 h-3 ${overdue ? "[&>div]:bg-red-500" : ""}`} />
                <span className={`text-sm font-mono font-bold w-10 text-right ${progressColor}`}>{displayProgress}%</span>
              </div>
              {autoProgress.isAuto && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {autoProgress.elapsedDays} / {phase.expectedDurationDays} giorni lavorativi trascorsi (dom. escluse)
                  {overdue && <span className="text-red-500 font-semibold"> — IN RITARDO</span>}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <ViewField label="Data Inizio" value={fmtDate(phase.startDate)} changeType={phasePrefix && changes ? (changes[`${phasePrefix}.startDate`] ?? null) : null} />
            <ViewField label="Durata Prevista" value={phase.expectedDurationDays ? `${phase.expectedDurationDays} giorni lav.` : "—"} changeType={phasePrefix && changes ? (changes[`${phasePrefix}.expectedDurationDays`] ?? null) : null} />
            <ViewField label="Data Fine" value={fmtDate(phase.endDate)} changeType={phasePrefix && changes ? (changes[`${phasePrefix}.endDate`] ?? null) : null} />
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">Avanzamento</span>
              <div className="flex items-center gap-2 mt-1">
                <Progress value={displayProgress} className={`flex-1 h-3 ${overdue ? "[&>div]:bg-red-500" : ""}`} />
                <span className={`text-sm font-mono font-bold ${progressColor}`}>{displayProgress}%</span>
              </div>
              {autoProgress.isAuto && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {autoProgress.elapsedDays} / {phase.expectedDurationDays} giorni lav. (dom. escluse)
                  {overdue && <span className="text-red-500 font-semibold"> — IN RITARDO</span>}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {editing && (
        <div>
          <Label className="text-[10px] text-muted-foreground">Note</Label>
          <Textarea value={phase.notes} onChange={(e) => update({ notes: e.target.value })} className="min-h-[60px] text-sm mt-0.5" placeholder={`Note ${phaseLabel.toLowerCase()}...`} data-testid={`textarea-phase-notes`} />
        </div>
      )}
      {!editing && phase.notes && (
        <div className={phasePrefix && changes?.[`${phasePrefix}.notes`] ? "ring-1 ring-blue-300 rounded p-1" : ""}>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">Note</span>
          <p className="text-sm mt-0.5 whitespace-pre-wrap">{phase.notes}</p>
        </div>
      )}

      <div className="border-t pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {phaseLabel === "Collaudo" ? "Collaudatori" : "Montatori"}
        </p>
        <div className="flex flex-wrap gap-2 mb-2">
          {phase.workers.length === 0 && !editing && (
            <span className="text-sm text-muted-foreground">Nessun nominativo inserito.</span>
          )}
          {phase.workers.map((w, i) => (
            <Badge key={i} variant="secondary" className="text-sm py-1 px-2 gap-1" data-testid={`worker-badge-${i}`}>
              <User className="w-3 h-3" /> {w}
              {editing && (
                <button onClick={() => removeWorker(i)} className="ml-1 text-muted-foreground hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
        {editing && (
          <div className="flex items-center gap-2">
            <Input value={workerInput} onChange={(e) => setWorkerInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWorker(); } }}
              className="h-8 text-sm w-48" placeholder="Nome..." data-testid={`input-worker-name`} />
            <Button variant="outline" size="sm" onClick={addWorker} data-testid={`btn-add-worker`}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi
            </Button>
          </div>
        )}
      </div>

      <div className="border-t pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Certificati {phaseLabel}
          </p>
          {editing && orderId && (
            <>
              <input ref={certFileRef} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleCertUpload(e.target.files[0]); }} />
              <Button variant="outline" size="sm" onClick={() => certFileRef.current?.click()} data-testid={`btn-upload-cert`}>
                <Upload className="w-3.5 h-3.5 mr-1" /> Carica Certificato
              </Button>
            </>
          )}
        </div>
        {phase.certificates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun certificato caricato.</p>
        ) : (
          <div className="space-y-2">
            {phase.certificates.map((cert) => (
              <div key={cert.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md border" data-testid={`cert-row-${cert.id}`}>
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1 truncate">{cert.originalName}</span>
                <a href={`/order-certificates/${cert.filename}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Download className="w-3.5 h-3.5" /></Button>
                </a>
                {editing && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeCert(cert)} data-testid={`btn-delete-cert-${cert.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChangeOfferSection({ orderId, currentOfferId, currentOfferRef, customerId, offerHistory, onComplete }: {
  orderId: number;
  currentOfferId: number;
  currentOfferRef?: string;
  customerId: number;
  offerHistory: OfferHistoryEntry[];
  onComplete: () => void;
}) {
  const { toast } = useToast();
  const [selectedOfferId, setSelectedOfferId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const { data: availableOffers, isLoading } = useQuery<any[]>({
    queryKey: ["/api/offers", "for-customer", customerId],
    queryFn: async () => {
      const res = await fetch(`/api/offers?customerId=${customerId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/change-offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newOfferId: Number(selectedOfferId), reason }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Errore"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Offerta sostituita con successo" });
      onComplete();
    },
    onError: (err: any) => {
      toast({ title: "Errore nel cambio offerta", description: err.message, variant: "destructive" });
    },
  });

  const filteredOffers = (availableOffers ?? []).filter((o: any) => o.id !== currentOfferId && o.customerId === customerId);

  return (
    <Card data-testid="card-change-offer">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <History className="w-5 h-5 text-amber-500" />
          <span className="font-semibold text-base">Cambia Offerta Collegata</span>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            L'offerta attuale <strong>{currentOfferRef || `#${currentOfferId}`}</strong> verrà archiviata nello storico.
            I dati dell'ordine (macchine, prezzi, dati tecnici) verranno aggiornati dalla nuova offerta.
            Una versione dell'ordine attuale verrà salvata automaticamente.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Nuova Offerta</Label>
            {isLoading ? (
              <div className="flex items-center gap-2 mt-1"><Loader2 className="w-4 h-4 animate-spin" /> <span className="text-sm text-muted-foreground">Caricamento offerte...</span></div>
            ) : filteredOffers.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1">Nessun'altra offerta disponibile per questo cliente.</p>
            ) : (
              <Select value={selectedOfferId} onValueChange={setSelectedOfferId}>
                <SelectTrigger className="h-8 text-sm mt-0.5" data-testid="select-new-offer"><SelectValue placeholder="Seleziona offerta..." /></SelectTrigger>
                <SelectContent>
                  {filteredOffers.map((o: any) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.referenceNumber} — {o.subject || "Senza oggetto"} ({o.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Motivazione (opzionale)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-8 text-sm mt-0.5" placeholder="Es: revisione prezzi, aggiunta macchine..." data-testid="input-change-offer-reason" />
          </div>
        </div>

        {selectedOfferId && !confirmed && (
          <div className="flex items-center gap-3">
            <Button variant="destructive" size="sm" onClick={() => setConfirmed(true)} data-testid="btn-confirm-change-offer">
              Conferma Sostituzione
            </Button>
            <Button variant="outline" size="sm" onClick={onComplete}>Annulla</Button>
          </div>
        )}

        {selectedOfferId && confirmed && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 space-y-3">
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">Sei sicuro? I dati macchine/prezzi verranno sovrascritti dalla nuova offerta.</p>
            <div className="flex items-center gap-3">
              <Button variant="destructive" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()} data-testid="btn-execute-change-offer">
                {mutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                Sostituisci Offerta
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmed(false)}>Torna Indietro</Button>
            </div>
          </div>
        )}

        {offerHistory.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Storico Offerte Precedenti</p>
            <div className="space-y-2">
              {offerHistory.map((h, i) => (
                <div key={i} className="flex items-center gap-3 p-2 bg-muted/30 rounded-md border" data-testid={`offer-history-${i}`}>
                  <Link href={`/offers/${h.offerId}`}>
                    <span className="flex items-center gap-1 text-sm text-primary hover:underline cursor-pointer">
                      <FileText className="w-3.5 h-3.5" /> {h.offerRef}
                      <ExternalLink className="w-3 h-3" />
                    </span>
                  </Link>
                  <span className="text-xs text-muted-foreground">Sostituita il {fmtDateTime(h.replacedAt)}</span>
                  {h.replacedByName && <span className="text-xs text-muted-foreground">da {h.replacedByName}</span>}
                  {h.reason && <span className="text-xs italic text-muted-foreground">— {h.reason}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
