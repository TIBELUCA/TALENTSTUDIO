import { displayVersion } from "@shared/version";
import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ChevronLeft, ChevronDown, ChevronRight, Loader2,
  ClipboardList, Building2, Calendar, CreditCard, Settings2, FileText, Wrench,
  History, Eye, Truck, AlertTriangle, User, Download
} from "lucide-react";
import { format } from "date-fns";
import { computeWordDiff, computeLineDiff } from "@/lib/textDiff";
import type {
  OrderBillingInfo, OrderShippingInfo, OrderLineItem, OrderPriceSummary,
  OrderShippingTerms, OrderAgentInfo, OrderPaymentTerm, OrderTechnicalSheet,
  OrderLogistics, OrderLineTechnicalData,
} from "@shared/schema";

const STATUS_LABELS: Record<string, string> = {
  active: "Attiva", on_hold: "Sospesa", completed: "Completata", cancelled: "Annullata",
};
const statusColor: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  on_hold: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

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
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of allKeys) {
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function computeFieldChange(curVal: any, prevVal: any): ChangeType {
  const curEmpty = curVal == null || curVal === "" || (typeof curVal === "object" && Object.keys(curVal).length === 0);
  const prevEmpty = prevVal == null || prevVal === "" || (typeof prevVal === "object" && Object.keys(prevVal).length === 0);
  if (curEmpty && prevEmpty) return null;
  if (curEmpty && !prevEmpty) return "removed";
  if (!curEmpty && prevEmpty) return "added";
  if (!deepEqual(curVal, prevVal)) return "modified";
  return null;
}

function computeChanges(current: Record<string, any>, prev: Record<string, any> | null): Record<string, ChangeType> {
  if (!prev) return {};
  const changes: Record<string, ChangeType> = {};
  const fields = ["settore", "jobCode", "status", "responsibleUserId", "deliveryDate", "assemblyDate", "testingDate", "bankName", "notes"];
  for (const f of fields) changes[f] = computeFieldChange(current[f], prev[f]);
  const jsonbFields = ["billingInfo", "shippingInfo", "agentInfo", "shippingTerms", "priceSummary", "lineTechnicalData", "logistics"];
  for (const f of jsonbFields) {
    const cur = current[f];
    const old = prev[f];
    changes[f] = computeFieldChange(cur, old);
    const curObj = (cur && typeof cur === "object") ? cur : {};
    const oldObj = (old && typeof old === "object") ? old : {};
    const allSubKeys = new Set([...Object.keys(curObj), ...Object.keys(oldObj)]);
    for (const k of allSubKeys) changes[`${f}.${k}`] = computeFieldChange(curObj[k], oldObj[k]);
  }
  const arrayFields = ["paymentTerms", "orderItems", "additionalItems", "technicalSheets"];
  for (const f of arrayFields) {
    changes[f] = computeFieldChange(current[f], prev[f]);
    const curArr = current[f] ?? [];
    const prevArr = prev[f] ?? [];
    const maxLen = Math.max(curArr.length, prevArr.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= curArr.length) changes[`${f}[${i}]`] = "removed";
      else if (i >= prevArr.length) changes[`${f}[${i}]`] = "added";
      else if (!deepEqual(curArr[i], prevArr[i])) changes[`${f}[${i}]`] = "modified";
    }
  }
  return changes;
}

function getChange(changes: Record<string, ChangeType> | null, path: string): ChangeType {
  if (!changes) return null;
  return changes[path] ?? null;
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

function sectionHasChanges(changes: Record<string, ChangeType> | null, prefix: string): boolean {
  if (!changes) return false;
  return Object.entries(changes).some(([k, v]) => k.startsWith(prefix) && v != null);
}

function ChangeSummaryDot({ changes, prefix }: { changes: Record<string, ChangeType> | null; prefix: string }) {
  if (!sectionHasChanges(changes, prefix)) return null;
  return <span className="w-2 h-2 rounded-full bg-blue-500 inline-block ml-2" title="Sezione modificata" />;
}

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

function ViewField({ label, value, changeType, previousValue, className }: { label: string; value: string | React.ReactNode; changeType?: ChangeType; previousValue?: any; className?: string }) {
  const changeBorder = changeType === "added" ? "border-l-2 border-l-green-500 pl-2" :
                        changeType === "modified" ? "border-l-2 border-l-blue-500 pl-2" :
                        changeType === "removed" ? "border-l-2 border-l-red-500 pl-2 opacity-60" : "";
  const changeBadge = changeType === "added" ? <span className="ml-1 text-[9px] font-bold text-green-600 uppercase">nuovo</span> :
                      changeType === "modified" ? <span className="ml-1 text-[9px] font-bold text-blue-600 uppercase">modificato</span> :
                      changeType === "removed" ? <span className="ml-1 text-[9px] font-bold text-red-600 uppercase">rimosso</span> : null;
  const showDiff = changeType === "modified" && typeof value === "string" && typeof previousValue === "string";
  const showAdded = changeType === "added" && typeof value === "string";
  const showRemoved = changeType === "removed" && typeof previousValue === "string";
  return (
    <div className={`${changeBorder} ${className ?? ""}`}>
      {label && <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">{label}{changeBadge}</span>}
      {!label && changeBadge}
      <span className="text-sm mt-0.5 block">
        {showDiff ? <InlineDiff current={value as string} previous={previousValue as string} /> :
         showAdded ? <span className="text-green-600 dark:text-green-400 underline">{value}</span> :
         showRemoved ? <span className="text-red-600 dark:text-red-400 line-through">{previousValue}</span> :
         (value || "—")}
      </span>
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

export default function OrderVersionView() {
  const { id, versionNumber } = useParams<{ id: string; versionNumber: string }>();
  const [, setLocation] = useLocation();
  const vNum = Number(versionNumber);
  const [showChanges, setShowChanges] = useState(true);

  const expandedSections: Record<string, boolean> = {
    overview: true, billing: true, shipments: true, assembly: true, payments: true, pricing: true, techSheets: true, notes: true,
  };

  const { data: versions, isLoading: loadingVersions } = useQuery<any[]>({
    queryKey: ["/api/orders", id, "versions"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}/versions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: order } = useQuery<any>({
    queryKey: ["/api/orders", id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const historicalVersions = useMemo(() => {
    if (!versions) return [];
    return versions.filter((v: any) => !v.isCurrent && v.snapshot);
  }, [versions]);

  const version = historicalVersions.find((v: any) => v.versionNumber === vNum);
  const snap = version?.snapshot as Record<string, any> | undefined;

  const prevVersion = useMemo(() => {
    if (!historicalVersions.length || vNum <= 0) return null;
    return historicalVersions.find((v: any) => v.versionNumber === vNum - 1);
  }, [historicalVersions, vNum]);
  const prevSnap = prevVersion?.snapshot as Record<string, any> | null ?? null;

  const nextVersionNum = useMemo(() => {
    if (!historicalVersions.length) return null;
    const next = historicalVersions.find((v: any) => v.versionNumber === vNum + 1);
    return next ? vNum + 1 : null;
  }, [historicalVersions, vNum]);

  const changes = useMemo(() => {
    if (!showChanges || !snap || !prevSnap) return null;
    return computeChanges(snap, prevSnap);
  }, [showChanges, snap, prevSnap]);

  if (loadingVersions) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      </Layout>
    );
  }

  if (!version || !snap) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto py-20 text-center">
          <p className="text-muted-foreground">Versione non trovata.</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation(`/orders/${id}`)} data-testid="btn-back-order">
            <ChevronLeft className="w-4 h-4 mr-1" /> Torna alla Commessa
          </Button>
        </div>
      </Layout>
    );
  }

  const billing: OrderBillingInfo = snap.billingInfo ?? { name: "", city: "", address: "", country: "", vatId: "", phone: "", fax: "" };
  const shipping: OrderShippingInfo = snap.shippingInfo ?? { name: "", city: "", address: "", country: "", phone: "", fax: "" };
  const oItems: OrderLineItem[] = snap.orderItems ?? [];
  const addItems: OrderLineItem[] = snap.additionalItems ?? [];
  const pricing: OrderPriceSummary = snap.priceSummary ?? { machinesTotal: 0, assemblyPrice: 0, assemblyNotes: "", transportPrice: 0, transportNotes: "", totalOrderPrice: 0 };
  const shipTerms: OrderShippingTerms = snap.shippingTerms ?? { incoterms: "", exchangeRate: null, packaging: "" };
  const agent: OrderAgentInfo = snap.agentInfo ?? { code: "" };
  const payments: OrderPaymentTerm[] = snap.paymentTerms ?? [];
  const techSheets: OrderTechnicalSheet[] = snap.technicalSheets ?? [];
  const lineTechData: OrderLineTechnicalData | null = snap.lineTechnicalData ?? null;
  const logisticsData: OrderLogistics = snap.logistics ?? { contractualDeliveryDate: "", hasPenalties: false, penaltiesDescription: "", contractualAssemblyStartDate: "", contractualTestingEndDate: "", shipments: [], phases: [] };
  const statusLabel = STATUS_LABELS[snap.status] || snap.status;

  const gc = (path: string) => getChange(changes, path);
  const gp = (path: string) => getPrevValue(prevSnap, path);

  const sectionHeader = (title: string, icon: React.ReactNode, sectionKey: string) => (
    <div className="flex items-center gap-2 select-none">
      {expandedSections[sectionKey] ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      {icon}
      <span className="font-semibold text-base">{title}</span>
    </div>
  );

  const labels = pricing.priceLabels ?? {};

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-5 pb-20">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/orders/${id}`)} data-testid="btn-back-order">
            <ChevronLeft className="w-4 h-4 mr-1" /> Torna alla Commessa
          </Button>
          <div className="flex-1" />
          <h1 className="text-2xl font-bold font-mono" data-testid="text-version-title">
            {order?.jobNumber ?? `Ordine #${id}`}
          </h1>
          <Badge variant="secondary" className={`text-sm ${statusColor[snap.status] || ""}`}>{statusLabel}</Badge>
          <Badge variant="outline" className="text-xs font-mono">v{displayVersion(vNum)}</Badge>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex flex-wrap items-center gap-3 text-sm" data-testid="version-info-banner">
          <History className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-amber-800 dark:text-amber-300">
              Stai visualizzando la versione {displayVersion(vNum)} (sola lettura)
            </p>
            <p className="text-amber-600 dark:text-amber-400 text-xs mt-0.5">
              Salvata da <strong>{version.modifiedByName || "—"}</strong> il {fmtDateTime(version.createdAt)}
              {version.changeNotes && <> — {version.changeNotes}</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Navigation hrefs use the DB-indexed version (`vNum - 1`) because
                the version route resolves snapshots by stored value; only the
                visible label is converted with displayVersion(). */}
            {vNum > 1 && (
              <Link href={`/orders/${id}/version/${vNum - 1}`}>
                <Button variant="outline" size="sm" data-testid="btn-prev-version">
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> v{displayVersion(vNum - 1)}
                </Button>
              </Link>
            )}
            {nextVersionNum && (
              <Link href={`/orders/${id}/version/${nextVersionNum}`}>
                <Button variant="outline" size="sm" data-testid="btn-next-version">
                  v{displayVersion(nextVersionNum)} <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            )}
            <Link href={`/orders/${id}`}>
              <Button variant="outline" size="sm" data-testid="btn-go-current">Versione Corrente</Button>
            </Link>
          </div>
        </div>

        {prevSnap && (
          <>
            <Button
              variant={showChanges ? "default" : "outline"}
              size="sm"
              onClick={() => setShowChanges(!showChanges)}
              data-testid="btn-show-changes"
              className={showChanges ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              <Eye className="w-4 h-4 mr-1.5" /> {showChanges ? "Nascondi Modifiche" : "Mostra Modifiche"}
            </Button>
            {showChanges && changes && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3" data-testid="changes-legend">
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1.5">Modifiche rispetto alla versione {displayVersion(vNum - 1)}</p>
                <div className="flex gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="text-green-600 dark:text-green-400 underline font-medium">Testo aggiunto</span></span>
                  <span className="flex items-center gap-1.5"><span className="text-red-600 dark:text-red-400 line-through font-medium">Testo rimosso</span></span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-500 inline-block" /> <span className="text-blue-700 dark:text-blue-400 font-medium">Sezione modificata</span></span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── OVERVIEW ── */}
        <Card data-testid="card-overview">
          <CardContent className="pt-4 space-y-4">
            {sectionHeader("Panoramica Ordine", <ClipboardList className="w-5 h-5 text-primary" />, "overview")}
            {expandedSections.overview && (
              <div className="space-y-4 pt-2">
                <div className="grid sm:grid-cols-4 gap-4">
                  <ViewField label="Settore" value={snap.settore ?? "Legno"} changeType={gc("settore")} previousValue={gp("settore")} />
                  <ViewField label="Job" value={snap.jobCode} changeType={gc("jobCode")} previousValue={gp("jobCode")} />
                  <ViewField label="Data Ordine" value={fmtDate(snap.createdAt || version.createdAt)} />
                  <ViewField label="Ultimo Aggiornamento" value={fmtDateTime(version.createdAt)} />
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Agente <ChangeSummaryDot changes={changes} prefix="agentInfo." />
                  </p>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <ViewField label="Azienda" value={agent.dealerCompanyName || "—"} changeType={gc("agentInfo.dealerCompanyName")} previousValue={gp("agentInfo.dealerCompanyName")} />
                    <ViewField label="Contatto" value={agent.dealerContactName || "—"} changeType={gc("agentInfo.dealerContactName")} previousValue={gp("agentInfo.dealerContactName")} />
                    <ViewField label="Codice / Nome" value={agent.code || "—"} changeType={gc("agentInfo.code")} previousValue={gp("agentInfo.code")} />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── BILLING & SHIPPING ── */}
        <Card data-testid="card-billing-shipping">
          <CardContent className="pt-4 space-y-4">
            {sectionHeader("Fatturazione & Destinazione", <Building2 className="w-5 h-5 text-primary" />, "billing")}
            {expandedSections.billing && (
              <div className="grid lg:grid-cols-2 gap-6 pt-2">
                <AddressView title="Fatturazione" data={billing} showVat changes={changes} changePrefix="billingInfo" prevSnap={prevSnap} />
                <AddressView title="Destinazione" data={{ ...shipping, vatId: "" }} changes={changes} changePrefix="shippingInfo" prevSnap={prevSnap} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── CONSEGNA CONTRATTUALE ── */}
        <Card data-testid="card-shipping-logistics">
          <CardContent className="pt-4 space-y-4">
            {sectionHeader("Consegna", <Calendar className="w-5 h-5 text-primary" />, "shipments")}
            {expandedSections.shipments && (
              <div className="space-y-6 pt-2">
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data Consegna Contrattuale</p>
                  <ViewField label="Data Consegna Contrattuale" value={logisticsData.contractualDeliveryDate ? fmtDate(logisticsData.contractualDeliveryDate) : "Non definita"} changeType={gc("logistics.contractualDeliveryDate")} previousValue={gp("logistics.contractualDeliveryDate") ? fmtDate(gp("logistics.contractualDeliveryDate")) : undefined} />

                  {logisticsData.hasPenalties && (
                    <div className={`flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 ${gc("logistics.hasPenalties") ? "ring-1 ring-blue-300" : ""}`}>
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <ViewField label="Penali contrattuali" value={logisticsData.penaltiesDescription || "Sì"} changeType={gc("logistics.penaltiesDescription") || gc("logistics.hasPenalties")} previousValue={gp("logistics.penaltiesDescription")} />
                      </div>
                    </div>
                  )}
                  {!logisticsData.hasPenalties && gc("logistics.hasPenalties") && (
                    <ViewField label="Penali" value="Rimosse" changeType="removed" previousValue={gp("logistics.penaltiesDescription") || "Sì"} />
                  )}
                </div>

                <div className="border-t pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <Truck className="w-4 h-4" /> Spedizioni Effettuate
                  </p>
                  {logisticsData.shipments && logisticsData.shipments.length > 0 ? (
                    <div className="space-y-3 pt-2">
                      {logisticsData.shipments.map((s: any, i: number) => (
                        <div key={s.id || i} className="border rounded-lg p-3 space-y-3" data-testid={`shipment-row-${i}`}>
                          <div className="grid sm:grid-cols-4 gap-3">
                            <ViewField label="Data" value={fmtDate(s.date)} />
                            <ViewField label="N. Bolla" value={s.ddtNumber || "—"} />
                            <ViewField label="Descrizione" value={s.description || "—"} className="col-span-2" />
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">CMR:</span>
                              {s.cmrFilename ? (
                                <a href={`/order-certificates/${s.cmrFilename}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                                  <FileText className="w-3.5 h-3.5" /> {s.cmrOriginalName || "CMR"}
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Bolla:</span>
                              {s.ddtFilename ? (
                                <a href={`/order-certificates/${s.ddtFilename}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                                  <FileText className="w-3.5 h-3.5" /> {s.ddtOriginalName || "Bolla"}
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground pt-2">Nessuna spedizione registrata.</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── MONTAGGIO (unified) ── */}
        <Card data-testid="card-assembly">
          <CardContent className="pt-4 space-y-4">
            {sectionHeader("Montaggio", <Wrench className="w-5 h-5 text-primary" />, "assembly")}
            {expandedSections.assembly && (
              <div className="space-y-6 pt-2">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Data Inizio Montaggio (Contratto)</p>
                    <ViewField label="Data Inizio Montaggio (Contratto)" value={logisticsData.contractualAssemblyStartDate ? fmtDate(logisticsData.contractualAssemblyStartDate) : "Non definita"} changeType={gc("logistics.contractualAssemblyStartDate")} previousValue={gp("logistics.contractualAssemblyStartDate") ? fmtDate(gp("logistics.contractualAssemblyStartDate")) : undefined} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Data Fine Collaudo (Contratto)</p>
                    <ViewField label="Data Fine Collaudo (Contratto)" value={logisticsData.contractualTestingEndDate ? fmtDate(logisticsData.contractualTestingEndDate) : "Non definita"} changeType={gc("logistics.contractualTestingEndDate")} previousValue={gp("logistics.contractualTestingEndDate") ? fmtDate(gp("logistics.contractualTestingEndDate")) : undefined} />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Giorni di Montaggio Venduti</p>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="bg-muted/30 rounded-lg p-3 border">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Giorni Venduti</p>
                      <p className="text-lg font-bold" data-testid="text-assembly-sold-days">{pricing.assemblySoldDays ?? 0} giorni</p>
                      <p className="text-xs text-muted-foreground">Tariffa giornaliera: {fmtCurrency(pricing.assemblyDailyRate ?? 0)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 border">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Montaggio Puro</p>
                      <p className="text-lg font-bold font-mono" data-testid="text-assembly-pure-price">{fmtCurrency(pricing.assemblyPurePrice ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">{fmtCurrency(pricing.assemblyDailyRate ?? 0)} × {pricing.assemblySoldDays ?? 0} giorni</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 border">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Servizi (Viaggi, Hotel, Spese)</p>
                      <p className="text-lg font-bold font-mono" data-testid="text-assembly-services-cost">{fmtCurrency(pricing.assemblyServicesCost ?? 0)}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${pricing.travelIncluded ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                          Viaggi: {pricing.travelIncluded ? "INCLUSI" : "ESCLUSI"}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${pricing.hotelIncluded ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                          Hotel: {pricing.hotelIncluded ? "INCLUSO" : "ESCLUSO"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">TOTALE MONTAGGIO VENDUTO:</span>
                    <span className="text-sm font-bold font-mono text-blue-700 dark:text-blue-300" data-testid="text-assembly-total-sold">{fmtCurrency(pricing.assemblyPrice)}</span>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Fasi di Montaggio</p>
                  {logisticsData.phases.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nessuna fase registrata.</p>
                  )}
                  <div className="space-y-4">
                    {logisticsData.phases.map((phase: any, idx: number) => {
                      const ap = computeAutoProgress(phase.startDate, phase.expectedDurationDays);
                      const pct = ap.isAuto ? ap.percent : phase.progressPercent;
                      const overdue = ap.isAuto && ap.percent > 100;
                      const progressColor = pct >= 100
                        ? "text-green-600 dark:text-green-400"
                        : pct >= 50
                        ? "text-blue-600 dark:text-blue-400"
                        : pct > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground";

                      return (
                        <div key={phase.id || idx} className="border rounded-lg overflow-hidden" data-testid={`assembly-phase-${idx}`}>
                          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
                            <Badge variant={phase.phaseType === "mechanical" ? "default" : phase.phaseType === "electrical" ? "secondary" : "outline"}
                              className="text-xs" data-testid={`badge-phase-type-${idx}`}>
                              {phase.phaseType === "mechanical" ? "Meccanico" : phase.phaseType === "electrical" ? "Elettrico" : "Collaudo"}
                            </Badge>
                            {pct > 0 && (
                              <span className={`ml-auto text-xs font-mono font-bold ${
                                overdue ? "text-red-500" :
                                pct >= 100 ? "text-green-600 dark:text-green-400" :
                                pct >= 50 ? "text-blue-600 dark:text-blue-400" :
                                "text-amber-600 dark:text-amber-400"
                              }`}>{pct}%{overdue ? " ⚠" : ""}</span>
                            )}
                          </div>
                          <div className="p-3 space-y-4">
                            <div className="grid sm:grid-cols-4 gap-4">
                              <ViewField label="Data Inizio" value={fmtDate(phase.startDate)} />
                              <ViewField label="Durata Prevista" value={phase.expectedDurationDays ? `${phase.expectedDurationDays} giorni lav.` : "—"} />
                              <ViewField label="Data Fine" value={fmtDate(phase.endDate)} />
                              <div>
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">Avanzamento</span>
                                <div className="flex items-center gap-2 mt-1">
                                  <Progress value={pct} className={`flex-1 h-3 ${overdue ? "[&>div]:bg-red-500" : ""}`} />
                                  <span className={`text-sm font-mono font-bold ${progressColor}`}>{pct}%</span>
                                </div>
                                {ap.isAuto && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {ap.elapsedDays} / {phase.expectedDurationDays} giorni lav. (dom. escluse)
                                    {overdue && <span className="text-red-500 font-semibold"> — IN RITARDO</span>}
                                  </p>
                                )}
                              </div>
                            </div>

                            {phase.notes && (
                              <div>
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">Note</span>
                                <p className="text-sm mt-0.5 whitespace-pre-wrap">{phase.notes}</p>
                              </div>
                            )}

                            <div className="border-t pt-3">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                {phase.phaseType === "testing" ? "Collaudatori" : "Montatori"}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {(phase.workers ?? []).length === 0 && (
                                  <span className="text-sm text-muted-foreground">Nessun nominativo inserito.</span>
                                )}
                                {(phase.workers ?? []).map((w: string, wi: number) => (
                                  <Badge key={wi} variant="secondary" className="text-sm py-1 px-2 gap-1" data-testid={`worker-badge-${wi}`}>
                                    <User className="w-3 h-3" /> {w}
                                  </Badge>
                                ))}
                              </div>
                            </div>

                            <div className="border-t pt-3">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                Certificati {phase.phaseType === "mechanical" ? "Montaggio Meccanico" : phase.phaseType === "electrical" ? "Montaggio Elettrico" : "Collaudo"}
                              </p>
                              {(phase.certificates ?? []).length === 0 ? (
                                <p className="text-sm text-muted-foreground">Nessun certificato caricato.</p>
                              ) : (
                                <div className="space-y-2">
                                  {(phase.certificates ?? []).map((cert: any) => (
                                    <div key={cert.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md border" data-testid={`cert-row-${cert.id}`}>
                                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                                      <span className="text-sm flex-1 truncate">{cert.originalName}</span>
                                      <a href={`/order-certificates/${cert.filename}`} target="_blank" rel="noopener noreferrer">
                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Download className="w-3.5 h-3.5" /></Button>
                                      </a>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── PAYMENT TERMS ── */}
        <Card data-testid="card-payments">
          <CardContent className="pt-4 space-y-4">
            {sectionHeader("Condizioni di Pagamento", <CreditCard className="w-5 h-5 text-primary" />, "payments")}
            {expandedSections.payments && (
              <div className="space-y-1 pt-2">
                {payments.length > 0 ? payments.map((p, i) => {
                  const ct = gc(`paymentTerms[${i}]`);
                  return (
                    <div key={i} className={ct ? "border-l-2 border-l-blue-500 pl-2" : ""}>
                      <p className="text-sm">{i + 1}. {p.condition || "—"}
                        {ct === "added" && <span className="ml-1 text-[9px] font-bold text-green-600 uppercase">nuovo</span>}
                        {ct === "modified" && <span className="ml-1 text-[9px] font-bold text-blue-600 uppercase">modificato</span>}
                      </p>
                    </div>
                  );
                }) : <p className="text-sm text-muted-foreground">Nessuna condizione inserita.</p>}
                <ViewField label="Banca" value={snap.bankName || "—"} changeType={gc("bankName")} previousValue={gp("bankName")} className="mt-2" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── PRICE OVERVIEW ── */}
        <Card data-testid="card-pricing">
          <CardContent className="pt-4 space-y-4">
            {sectionHeader("Price Overview", <FileText className="w-5 h-5 text-primary" />, "pricing")}
            {expandedSections.pricing && (
              <div className="pt-2 space-y-6" data-testid="price-overview">
                <table className="w-full text-sm" data-testid="table-price-overview">
                  {oItems.map((item, idx) => {
                    const opts = item.options ?? [];
                    const itemChange = gc(`orderItems[${idx}]`);
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
                        {opts.map((opt: any, oi: number) => (
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

                    {addItems.filter(a => a.description !== "Interlocking").map((item, i) => {
                      const addChange = gc(`additionalItems[${i}]`);
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

                    <tr className={`border-t-2 border-b-2 ${gc("priceSummary.totalListPrice") ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}>
                      <td className="py-2 px-3 font-bold">
                        {labels.totalListPrice || "TOTAL LIST PRICE (ex works, installation excluded)"}
                        {gc("priceSummary.totalListPrice") && <span className="ml-1 text-[9px] font-bold text-blue-600 uppercase">modificato</span>}
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
                  <ViewField label="Resa (Incoterms)" value={shipTerms.incoterms} changeType={gc("shippingTerms.incoterms")} previousValue={gp("shippingTerms.incoterms")} />
                  <ViewField label="Imballo" value={shipTerms.packaging} changeType={gc("shippingTerms.packaging")} previousValue={gp("shippingTerms.packaging")} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── TECHNICAL SHEETS ── */}
        {(lineTechData || techSheets.length > 0) && (
          <Card data-testid="card-technical-sheets">
            <CardContent className="pt-4 space-y-4">
              {sectionHeader("Schede Tecniche", <Wrench className="w-5 h-5 text-primary" />, "techSheets")}
              {expandedSections.techSheets && (
                <TechnicalSheetsReadOnly lineTechData={lineTechData} sheets={techSheets} orderItems={oItems} />
              )}
            </CardContent>
          </Card>
        )}

        {/* ── NOTES ── */}
        <Card data-testid="card-notes">
          <CardContent className="pt-4 space-y-3">
            {sectionHeader("Note", <FileText className="w-5 h-5 text-primary" />, "notes")}
            {expandedSections.notes && (
              <ViewField label="" value={snap.notes || <span className="text-muted-foreground">Nessuna nota.</span>} changeType={gc("notes")} previousValue={gp("notes")} className="mt-2" />
            )}
          </CardContent>
        </Card>

        {/* ── LAYOUT PDF & DOCUMENTS ── */}
        {order && (
          <div className="grid lg:grid-cols-2 gap-5">
            <Card data-testid="card-layout">
              <CardContent className="pt-4 space-y-3">
                <span className="font-semibold text-base flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Layout PDF</span>
                {order.layoutPdfFilename ? (
                  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-md border">
                    <FileText className="w-5 h-5 text-red-500 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{order.layoutPdfOriginalName || order.layoutPdfFilename}</span>
                    <a href={`/order-layouts/${order.layoutPdfFilename}`} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5 mr-1" /> Apri</Button>
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nessun layout PDF caricato.</p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-documents">
              <CardContent className="pt-4 space-y-3">
                <span className="font-semibold text-base flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Documenti</span>
                {order.documents && order.documents.length > 0 ? (
                  <div className="space-y-2">
                    {order.documents.map((doc: any) => (
                      <div key={doc.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md border" data-testid={`doc-row-${doc.id}`}>
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.originalName}</p>
                          {doc.description && <p className="text-xs text-muted-foreground">{doc.description}</p>}
                        </div>
                        <a href={`/order-documents/${doc.filename}`} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Download className="w-3.5 h-3.5" /></Button>
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nessun documento.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}

function AddressView({ title, data, showVat = false, changes, changePrefix, prevSnap }: {
  title: string; data: OrderBillingInfo; showVat?: boolean;
  changes?: Record<string, ChangeType> | null; changePrefix?: string; prevSnap?: Record<string, any> | null;
}) {
  const gc = (field: string) => changePrefix ? getChange(changes ?? null, `${changePrefix}.${field}`) : null;
  const gp = (field: string) => changePrefix && prevSnap ? getPrevValue(prevSnap, `${changePrefix}.${field}`) : undefined;
  const hasAnyChange = changePrefix ? sectionHasChanges(changes ?? null, changePrefix) : false;
  const showRemoved = (field: string, value: string | undefined) => !!value || gc(field) === "removed";
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

function TechnicalSheetsReadOnly({ lineTechData, sheets, orderItems }: {
  lineTechData: OrderLineTechnicalData | null;
  sheets: OrderTechnicalSheet[];
  orderItems?: OrderLineItem[];
}) {
  const enrichedSheets = useMemo(() => {
    if (!orderItems || orderItems.length === 0) return sheets;
    return sheets.map(sheet => {
      const matchingItem = orderItems.find(it => it.position === sheet.machinePosition);
      if (!matchingItem) return sheet;
      const optNames = (matchingItem.options ?? []).filter((o: any) => o.name).map((o: any) => o.name);
      if (optNames.length > 0 && (sheet.optionals?.length ?? 0) === 0) {
        return { ...sheet, optionals: optNames };
      }
      return sheet;
    });
  }, [sheets, orderItems]);

  const techField = (label: string, value: string) => (
    <div>
      <span className="text-[10px] text-muted-foreground block">{label}</span>
      <span className="text-sm block">{value || "—"}</span>
    </div>
  );

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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Dati Progetto</p>
              <div className="grid grid-cols-3 gap-3">
                {techField("Min/Max. Lunghezza (mm)", lineTechData.minMaxLength ?? "")}
                {techField("Max. Larghezza (mm)", lineTechData.workingWidth ?? "")}
                {techField("Min/Max. Spessore (mm)", lineTechData.minMaxThickness ?? "")}
                {techField("Velocità Media Linea (mt/min)", lineTechData.workingSpeed ?? "")}
                {techField("Lato Comandi", lineTechData.controlSide ?? "")}
                {techField("Max. Arco Pannello", lineTechData.maxBow ?? "")}
                {techField("Verniciatura", lineTechData.paint ?? "")}
                {techField("Substrato", lineTechData.substrate ?? "")}
                {techField("Livello Finitura", lineTechData.finishing ?? "")}
              </div>
            </div>

            {lineTechData.energySources && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Fonti di Energia</p>
                <div className="grid grid-cols-3 gap-3">
                  {techField("Energia per Riscaldamento", lineTechData.energySources?.heating ?? "")}
                  {techField("Aliment. Elettrica", lineTechData.energySources?.electrical ?? "")}
                  {techField("Aliment. Pneumatica", lineTechData.energySources?.pneumatic ?? "")}
                </div>
              </div>
            )}

            {lineTechData.performance && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Prestazioni Richieste</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {techField("Velocità m/1'", lineTechData.performance?.speed ?? "")}
                  {techField("Turni Lavoro", lineTechData.performance?.shifts ?? "")}
                  {techField("Dim. Minime Pezzi mm", lineTechData.performance?.minPieceDimensions ?? "")}
                  {techField("Dim. Massime Pezzi mm", lineTechData.performance?.maxPieceDimensions ?? "")}
                  {techField("Peso Massimo KG", lineTechData.performance?.maxPieceWeight ?? "")}
                </div>
              </div>
            )}

            {lineTechData.automations && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Automatismi Richiesti</p>
                <div className="grid grid-cols-3 gap-3">
                  {techField("Automatismi", lineTechData.automations?.requested ?? "")}
                  {techField("Controllo", lineTechData.automations?.control ?? "")}
                  {techField("Controllo Extra", lineTechData.automations?.extraControl ?? "")}
                </div>
              </div>
            )}

            {lineTechData.commissioning && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Montaggio e Messa in Funzione</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {techField("Data Inizio Montaggio", lineTechData.commissioning?.assemblyStartDate ?? "")}
                  {techField("Data Inizio Produzione", lineTechData.commissioning?.productionStartDate ?? "")}
                  {techField("Cablaggi Elettrici", lineTechData.commissioning?.electricalWiring ?? "")}
                  {techField("Cavi Elettrici", lineTechData.commissioning?.electricalCables ?? "")}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {enrichedSheets.length > 0 && (
        <div className="space-y-3" data-testid="tech-sheets-list">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 px-1">
            <Settings2 className="w-3.5 h-3.5" /> Schede per Posizione
          </p>
          {enrichedSheets.map((sheet, i) => (
            <div key={i} className="border rounded-lg overflow-hidden" data-testid={`tech-sheet-${i}`}>
              <div className="flex items-center gap-2 p-3 bg-muted/30">
                <span className="font-mono text-xs text-muted-foreground">Pos. {sheet.machinePosition}</span>
                <span className="font-semibold text-sm">{sheet.machineName}</span>
              </div>
              <div className="p-4 space-y-4">
                {(sheet.optionals?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Optionals Richiesti</p>
                    <div className="space-y-1.5">
                      {sheet.optionals.map((opt: string, oi: number) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground w-4">{oi + 1}</span>
                          <span className="text-sm">{opt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Ricambi Richiesti</p>
                  <div className="space-y-1.5">
                    {(sheet.spareParts ?? []).length === 0 && (
                      <p className="text-sm text-muted-foreground">Nessun ricambio.</p>
                    )}
                    {(sheet.spareParts ?? []).length > 0 && (
                      <div className="grid grid-cols-[40px_60px_1fr_120px] gap-2 mb-1">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">#</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Qtà</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Descrizione</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Codice</span>
                      </div>
                    )}
                    {(sheet.spareParts ?? []).map((sp: any, si: number) => {
                      const spObj = typeof sp === "string" ? { quantity: "", description: sp, code: "" } : sp;
                      return (
                      <div key={si} className="grid grid-cols-[40px_60px_1fr_120px] gap-2">
                        <span className="text-xs font-mono text-muted-foreground">{si + 1}</span>
                        <span className="text-sm font-semibold">{spObj.quantity || "—"}</span>
                        <span className="text-sm">{spObj.description || "—"}</span>
                        <span className="text-sm font-mono text-muted-foreground">{spObj.code || "—"}</span>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
