import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Download } from "lucide-react";
import { useParams, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface OfferItem {
  id: number;
  machineId: number;
  position: number;
  quantity: number;
  snapshotMachineName: string;
  snapshotBasePrice: string;
  options: { id: number; machineOptionId: number; snapshotOptionName: string; snapshotPriceModifier: string; quantity: number }[];
}

interface Offer {
  id: number;
  referenceNumber: string;
  subject: string;
  version: number;
  totalPrice: string;
  sourceEnquiryId?: number | null;
  customer: { id: number; companyName: string };
  items: OfferItem[];
  projectData?: any;
}

export default function DealerPriceEdit() {
  const { id } = useParams<{ id: string }>();
  const offerId = parseInt(id || "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: offer, isLoading } = useQuery<Offer>({
    queryKey: ["/api/dealer/offers", offerId],
    queryFn: () => fetch(`/api/dealer/offers/${offerId}`, { credentials: "include" }).then(r => r.json()),
  });

  const [basePrices, setBasePrices] = useState<Record<number, number>>({});
  const [optionPrices, setOptionPrices] = useState<Record<number, number>>({});
  const [discountPercent, setDiscountPercent] = useState(0);
  const [extraItems, setExtraItems] = useState<{ id: string; description: string; price: number }[]>([]);
  const [initialized, setInitialized] = useState(false);

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
      setDiscountPercent(pricing.discountPercent || 0);
      setExtraItems(pricing.extraItems || []);
      setInitialized(true);
    }
  }, [offer, initialized]);

  const machinesTotal = offer?.items.reduce((sum, item) => {
    const base = basePrices[item.id] ?? parseFloat(item.snapshotBasePrice) ?? 0;
    const optTotal = item.options.reduce((os, opt) => os + (optionPrices[opt.id] ?? parseFloat(opt.snapshotPriceModifier) ?? 0) * (opt.quantity || 1), 0);
    return sum + (base + optTotal) * item.quantity;
  }, 0) ?? 0;

  const extrasTotal = extraItems.reduce((s, e) => s + e.price, 0);
  const grossTotal = machinesTotal + extrasTotal;
  const discountAmt = discountPercent > 0 ? (grossTotal * discountPercent / 100) : 0;
  const netTotal = grossTotal - discountAmt;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!offer) throw new Error("No offer");
      const items = offer.items.map(item => ({
        machineId: item.machineId,
        quantity: item.quantity,
        optionIds: item.options.map(o => o.machineOptionId),
        customBasePrice: basePrices[item.id] ?? parseFloat(item.snapshotBasePrice),
        customOptionPrices: Object.fromEntries(
          item.options.map(o => [o.machineOptionId, optionPrices[o.id] ?? parseFloat(o.snapshotPriceModifier)])
        ),
      }));
      const pricing = { discountPercent, extraItems };
      const result = await apiRequest("PUT", `/api/dealer/offers/${offerId}/prices`, {
        pricing,
        items,
        totalPrice: netTotal,
      }) as any;
      return result.newOfferId as number;
    },
    onSuccess: async (newOfferId: number) => {
      toast({ title: "Prices saved!", description: "Downloading your PDF..." });
      const res = await fetch(`/api/dealer/offers/${newOfferId}/pdf`, { credentials: "include" });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `offer-${newOfferId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      setLocation(`/dealer/offers/${newOfferId}`);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const formatPrice = (n: number) => `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (isLoading || !initialized) {
    return (
      <DealerLayout>
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      </DealerLayout>
    );
  }

  if (!offer || (offer as any).message) {
    return <DealerLayout><div className="text-center py-20 text-muted-foreground">Offer not found or access denied.</div></DealerLayout>;
  }

  return (
    <DealerLayout>
      <div className="flex gap-8">
        <div className="flex-1 min-w-0 space-y-6">
          <PageHeader
            title="Edit Prices"
            subtitle={`${offer.referenceNumber} — ${offer.subject}`}
          />

          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 px-1 mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28 text-right">Unit Price €</span>
              <span className="w-6" />
            </div>
            {offer.items.map((item, index) => (
              <div key={item.id} className="border rounded-lg p-3 space-y-1.5">
                <div className="grid grid-cols-[1fr_auto] gap-x-2 items-center">
                  <span className="font-medium text-sm">Pos. {index + 1}: {item.snapshotMachineName} ×{item.quantity}</span>
                  <Input
                    type="number"
                    value={basePrices[item.id] ?? ""}
                    onChange={e => setBasePrices(prev => ({ ...prev, [item.id]: parseFloat(e.target.value) || 0 }))}
                    className="w-28 h-7 text-xs font-mono text-right"
                    data-testid={`input-base-price-${index}`}
                  />
                </div>
                {item.options.map(opt => (
                  <div key={opt.id} className="grid grid-cols-[1fr_auto] gap-x-2 items-center pl-4">
                    <span className="text-xs text-muted-foreground">+ {opt.snapshotOptionName}{opt.quantity > 1 ? ` ×${opt.quantity}` : ""}</span>
                    <Input
                      type="number"
                      value={optionPrices[opt.id] ?? ""}
                      onChange={e => setOptionPrices(prev => ({ ...prev, [opt.id]: parseFloat(e.target.value) || 0 }))}
                      className="w-28 h-7 text-xs font-mono text-right"
                      data-testid={`input-option-price-${index}-${opt.id}`}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="border rounded-lg p-3 space-y-3">
            <h4 className="font-medium text-sm">Extra Items</h4>
            {extraItems.map((ex, i) => (
              <div key={ex.id} className="flex gap-2 items-center">
                <Input
                  placeholder="Description"
                  value={ex.description}
                  onChange={e => setExtraItems(prev => prev.map(x => x.id === ex.id ? { ...x, description: e.target.value } : x))}
                  className="flex-1"
                  data-testid={`input-extra-desc-${i}`}
                />
                <Input
                  type="number"
                  placeholder="0"
                  value={ex.price || ""}
                  onChange={e => setExtraItems(prev => prev.map(x => x.id === ex.id ? { ...x, price: parseFloat(e.target.value) || 0 } : x))}
                  className="w-28"
                  data-testid={`input-extra-price-${i}`}
                />
                <Button size="sm" variant="ghost" onClick={() => setExtraItems(prev => prev.filter(x => x.id !== ex.id))}>✕</Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setExtraItems(prev => [...prev, { id: Math.random().toString(36), description: "", price: 0 }])} data-testid="button-add-extra">
              + Add Extra
            </Button>
          </div>

          <div className="border rounded-lg p-3 flex items-center gap-3">
            <span className="text-sm font-medium">Discount</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={discountPercent || ""}
              onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)}
              className="w-20 h-7 text-xs font-mono"
              data-testid="input-discount"
            />
            <span className="text-sm">%</span>
            {discountPercent > 0 && <span className="text-sm text-red-600 ml-auto">−{formatPrice(discountAmt)}</span>}
          </div>
        </div>

        <div className="w-72 shrink-0 space-y-4 sticky top-4 h-fit">
          <div className="border rounded-xl bg-card p-4 space-y-2">
            <h3 className="font-semibold text-sm">Price Summary</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Machines Total</span>
                <span className="font-mono">{formatPrice(machinesTotal)}</span>
              </div>
              {extrasTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Extra Items</span>
                  <span className="font-mono">{formatPrice(extrasTotal)}</span>
                </div>
              )}
              {discountPercent > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount ({discountPercent}%)</span>
                  <span className="font-mono">−{formatPrice(discountAmt)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-2 border-t">
                <span>Total</span>
                <span className="font-mono">{formatPrice(netTotal)}</span>
              </div>
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-generate-pdf"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Generate PDF
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            This will save your prices as a new version and immediately download the PDF.
          </p>
        </div>
      </div>
    </DealerLayout>
  );
}
