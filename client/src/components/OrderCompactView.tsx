import { displayVersion } from "@shared/version";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CircleProgress } from "@/components/CircleProgress";
import {
  ChevronLeft, ChevronRight, Building2, Truck, CreditCard,
  CheckCircle2, Circle, FileText, Receipt, User, Handshake, AlertTriangle,
} from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import type {
  OrderBillingInfo, OrderShippingInfo, OrderLineItem, OrderPriceSummary,
  OrderPaymentTerm, OrderLogistics, OrderInvoiceEntry,
} from "@shared/schema";

function fmtCurrency(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy"); } catch { return "—"; }
}

const statusColor: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  on_hold: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const statusLabel: Record<string, string> = {
  active: "Attiva",
  completed: "Completata",
  cancelled: "Annullata",
  on_hold: "Sospesa",
};

interface OrderCompactViewProps {
  jobNumber: string;
  currentVersion: number;
  customerName: string;
  status: string;
  createdAt: string | Date;
  billing: OrderBillingInfo;
  shipping: OrderShippingInfo;
  items: OrderLineItem[];
  pricing: OrderPriceSummary;
  payments: OrderPaymentTerm[];
  logistics: OrderLogistics;
  invoicing: OrderInvoiceEntry[];
  notes: string;
  slotAfterCircles?: React.ReactNode;
  jobLeader?: string;
  dealerName?: string;
}

function computeDeliveryPercent(createdAt: string | Date, deliveryDate: string): { percent: number; overdue: boolean } {
  if (!deliveryDate) return { percent: 0, overdue: false };
  const now = new Date();
  const start = new Date(createdAt);
  const end = new Date(deliveryDate);
  const totalMs = end.getTime() - start.getTime();
  if (totalMs <= 0) return { percent: 100, overdue: now > end };
  const elapsedMs = now.getTime() - start.getTime();
  const pct = (elapsedMs / totalMs) * 100;
  return { percent: Math.max(0, pct), overdue: pct > 100 };
}

function computePaymentPercent(payments: OrderPaymentTerm[]): number {
  if (payments.length === 0) return 0;
  const paidCount = payments.filter(p => p.paid).length;
  return (paidCount / payments.length) * 100;
}

function computeInvoicingPercent(invoicing: OrderInvoiceEntry[], totalOrderPrice: number): number {
  if (totalOrderPrice <= 0) return 0;
  const invoicedTotal = invoicing.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  return Math.min((invoicedTotal / totalOrderPrice) * 100, 100);
}

export function OrderCompactView({
  jobNumber, currentVersion, customerName, status, createdAt,
  billing, shipping, items, pricing, payments, logistics, invoicing, notes,
  slotAfterCircles, jobLeader, dealerName,
}: OrderCompactViewProps) {
  const [positionIndex, setPositionIndex] = useState(0);

  const deliveryDate = logistics.contractualDeliveryDate || "";
  const deliveryInfo = computeDeliveryPercent(createdAt, deliveryDate);
  const invoicedTotal = invoicing.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const invoicingPct = computeInvoicingPercent(invoicing, pricing.totalOrderPrice);
  const paymentPct = invoicingPct;

  const currentItem = items[positionIndex];
  const hasPrev = positionIndex > 0;
  const hasNext = positionIndex < items.length - 1;

  const billingShippingSame =
    (billing.name || "").trim() === (shipping.name || "").trim() &&
    (billing.address || "").trim() === (shipping.address || "").trim() &&
    (billing.city || "").trim() === (shipping.city || "").trim() &&
    (billing.country || "").trim() === (shipping.country || "").trim();

  return (
    <div className="space-y-4" data-testid="compact-view-container">
      {/* ── ROW 1: COMMESSA HEADER ── */}
      <Card data-testid="compact-header">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-xl font-extrabold" data-testid="compact-job-number">{jobNumber}</span>
            <Badge variant="outline" className="font-mono font-bold text-sm">v{displayVersion(currentVersion)}</Badge>
            <Badge className={`${statusColor[status] || statusColor.active} text-xs`}>{statusLabel[status] || status}</Badge>
            {customerName && <span className="text-sm font-semibold text-foreground/80">— {customerName}</span>}
            <div className="flex-1" />
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {jobLeader && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> Job: {jobLeader}</span>}
              {dealerName && <span className="flex items-center gap-1"><Handshake className="w-3.5 h-3.5" /> Dealer: {dealerName}</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── ROW 2: THREE CIRCULAR INDICATORS ── */}
      <div className="grid grid-cols-3 gap-4">
        <Card data-testid="compact-circle-delivery">
          <CardContent className="pt-4 pb-3 flex flex-col items-center gap-2">
            <CircleProgress
              percent={deliveryInfo.percent}
              label="Consegna"
              centerText={deliveryDate ? fmtDate(deliveryDate) : "N/D"}
              overdue={deliveryInfo.overdue}
            />
            {logistics.hasPenalties && (
              <div className="flex items-start gap-1.5 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 w-full" data-testid="compact-penalties">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-tight">
                  <span className="font-semibold">Penali:</span> {logistics.penaltiesDescription || "Sì"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card data-testid="compact-circle-payment">
          <CardContent className="pt-4 pb-3 flex justify-center">
            <CircleProgress
              percent={paymentPct}
              label="Pagamento"
              sublabel={`${invoicedTotal.toLocaleString("it-IT", { style: "currency", currency: "EUR" })} ricevuti`}
            />
          </CardContent>
        </Card>
        <Card data-testid="compact-circle-invoicing">
          <CardContent className="pt-4 pb-3 flex justify-center">
            <CircleProgress
              percent={invoicingPct}
              label="Fatturazione"
              sublabel={`${fmtCurrency(invoicedTotal)} / ${fmtCurrency(pricing.totalOrderPrice)}`}
            />
          </CardContent>
        </Card>
      </div>

      {slotAfterCircles}

      {/* ── ROW 3: POSITIONS CAROUSEL ── */}
      {items.length > 0 && (
        <Card data-testid="compact-positions">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <FileText className="w-3 h-3" /> Posizione {positionIndex + 1} di {items.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={!hasPrev} onClick={() => setPositionIndex(positionIndex - 1)} data-testid="btn-prev-position">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={!hasNext} onClick={() => setPositionIndex(positionIndex + 1)} data-testid="btn-next-position">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {currentItem && (
              <div className="border rounded-lg p-3 bg-muted/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground">Pos. {currentItem.position}</span>
                    <p className="text-sm font-semibold mt-0.5" data-testid={`compact-item-desc-${positionIndex}`}>{currentItem.description || "—"}</p>
                  </div>
                  <span className="text-sm font-bold font-mono shrink-0" data-testid={`compact-item-price-${positionIndex}`}>{fmtCurrency(currentItem.unitPrice)}</span>
                </div>
                {currentItem.options && currentItem.options.length > 0 && (
                  <div className="mt-2 border-t pt-2 space-y-0.5">
                    {currentItem.options.map((opt, oi) => (
                      <div key={oi} className="flex justify-between text-xs">
                        <span className="text-muted-foreground truncate mr-2">{opt.name}</span>
                        <span className="font-mono shrink-0">{fmtCurrency(opt.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── ROW 5: PRICE SUMMARY ── */}
      <Card data-testid="compact-pricing">
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Macchine</p>
              <p className="text-sm font-bold font-mono">{fmtCurrency(pricing.machinesTotal)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Montaggio</p>
              <p className="text-sm font-bold font-mono">{fmtCurrency(pricing.assemblyPrice)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trasporto</p>
              <p className="text-sm font-bold font-mono">{fmtCurrency(pricing.transportPrice)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Totale Ordine</p>
              <p className="text-base font-extrabold font-mono text-primary">{fmtCurrency(pricing.totalOrderPrice)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── ROW 6: PAYMENTS + INVOICING COMPACT ── */}
      <div className="grid grid-cols-2 gap-4">
        <Card data-testid="compact-payments">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-2">
              <CreditCard className="w-3 h-3" /> Pagamenti
            </p>
            {payments.length > 0 ? (
              <div className="space-y-1">
                {payments.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    {p.paid ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    ) : (
                      <Circle className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                    )}
                    <span className={`truncate ${p.paid ? "text-green-700 dark:text-green-400 font-medium" : "text-muted-foreground"}`}>{p.condition || `#${i + 1}`}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Nessun pagamento</p>
            )}
          </CardContent>
        </Card>
        <Card data-testid="compact-invoicing">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-2">
              <Receipt className="w-3 h-3" /> Fatture Emesse
            </p>
            {invoicing.length > 0 ? (
              <div className="space-y-1">
                {invoicing.map((inv, i) => (
                  <div key={i} className="flex items-center justify-between gap-1.5 text-xs">
                    <span className="truncate text-foreground">{inv.invoiceNumber || `#${i + 1}`}</span>
                    <span className="font-mono shrink-0">{fmtCurrency(inv.amount)}</span>
                  </div>
                ))}
                <div className="border-t pt-1 mt-1 flex justify-between text-xs font-semibold">
                  <span>Totale</span>
                  <span className="font-mono">{fmtCurrency(invoicedTotal)}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Nessuna fattura</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── BILLING + SHIPPING COMPACT ── */}
      <Card data-testid="compact-addresses">
        <CardContent className="pt-4 pb-3">
          <div className={`grid ${billingShippingSame ? "grid-cols-1" : "grid-cols-2"} gap-4`}>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1">
                <Building2 className="w-3 h-3" /> Fatturazione{billingShippingSame ? " / Destinazione" : ""}
              </p>
              <p className="text-sm font-medium">{billing.name || "—"}</p>
              <p className="text-xs text-muted-foreground">{[billing.address, billing.city, billing.country].filter(Boolean).join(", ") || "—"}</p>
            </div>
            {!billingShippingSame && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1">
                  <Truck className="w-3 h-3" /> Destinazione
                </p>
                <p className="text-sm font-medium">{shipping.name || "—"}</p>
                <p className="text-xs text-muted-foreground">{[shipping.address, shipping.city, shipping.country].filter(Boolean).join(", ") || "—"}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── NOTES (truncated) ── */}
      {notes && (
        <Card data-testid="compact-notes">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Note</p>
            <NoteTruncated text={notes} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NoteTruncated({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;
  return (
    <div>
      <p className={`text-sm whitespace-pre-line ${!expanded && isLong ? "line-clamp-3" : ""}`} data-testid="compact-notes-text">{text}</p>
      {isLong && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-primary mt-1 hover:underline" data-testid="btn-expand-notes">
          {expanded ? "Mostra meno" : "Mostra tutto"}
        </button>
      )}
    </div>
  );
}
