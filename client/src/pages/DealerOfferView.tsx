import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  RotateCcw,
  Building2,
  User,
  Calendar,
  FileText,
  Pencil,
  Zap,
  Wind,
  Gauge,
  AirVent,
  Receipt,
  FileText as FilePdf,
  Share2,
  Factory,
  Briefcase,
  Download,
  Copy,
} from "lucide-react";
import { ShareOfferDialog } from "@/components/ShareOfferDialog";
import { useParams, useLocation, Link } from "wouter";
import { displayVersion } from "@shared/version";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { BlinkingCommentIcon } from "@/components/CommentButton";
import { format } from "date-fns";

interface DocSection {
  id: string;
  name: string;
  enabled: boolean;
}

interface DocumentFormatSettings {
  sections: DocSection[];
  pageBackground: string;
}

export default function DealerOfferView() {
  const { id } = useParams<{ id: string }>();
  const offerId = parseInt(id || "0");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState<"manufacturer" | "dealer">("manufacturer");

  const { data: offer, isLoading } = useQuery<any>({
    queryKey: ["/api/dealer/offers", offerId],
    queryFn: () =>
      fetch(`/api/dealer/offers/${offerId}`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: formatSettings } = useQuery<DocumentFormatSettings>({
    queryKey: ["/api/settings/document-format"],
  });

  useEffect(() => {
    if (offer) {
      const serverMode = (offer.projectData as any)?.presentationMode || "manufacturer";
      setPresentationMode(serverMode);
    }
  }, [offer]);

  const modeMutation = useMutation({
    mutationFn: (mode: "manufacturer" | "dealer") =>
      apiRequest("PATCH", `/api/dealer/offers/${offerId}/presentation-mode`, { presentationMode: mode }),
    onSuccess: (_data: any, mode: "manufacturer" | "dealer") => {
      setPresentationMode(mode);
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/offers", offerId] });
      toast({ title: mode === "dealer" ? "Switched to Dealer Offer" : "Switched to Manufacturer Offer" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const revisionMutation = useMutation({
    mutationFn: (notes: string) =>
      apiRequest("POST", `/api/dealer/offers/${offerId}/request-revision`, { notes }),
    onSuccess: () => {
      toast({ title: "Revision requested", description: "Your sales team has been notified." });
      setRevisionOpen(false);
      setRevisionNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/enquiries"] });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createVersionMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/dealer/offers/${offerId}/create-version`),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/offers"] });
      toast({ title: "New version created" });
      navigate(`/dealer/offers/${data.id}`);
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleDownloadPdf = async () => {
    if (!offer) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/dealer/offers/${offer.id}/pdf`, { credentials: "include" });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${offer.referenceNumber}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      toast({ title: "PDF generation failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setPdfLoading(false);
    }
  };

  const getStatusBadgeClasses = (status: string) => {
    switch (status) {
      case "Draft": return "bg-blue-50 text-blue-700 border-blue-200";
      case "Sent": return "bg-yellow-50 text-yellow-700 border-yellow-200";
      case "Accepted": return "bg-green-50 text-green-700 border-green-200";
      case "Rejected": return "bg-red-50 text-red-700 border-red-200";
      case "Expired": return "bg-gray-50 text-gray-700 border-gray-200";
      default: return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  if (isLoading) {
    return (
      <DealerLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </DealerLayout>
    );
  }

  if (!offer || (offer as any).message) {
    return (
      <DealerLayout>
        <div className="text-center py-20 text-muted-foreground">Offer not found or access denied.</div>
      </DealerLayout>
    );
  }

  const projectData = offer.projectData as any | null;
  const isDealerOwnOffer = !!projectData?.dealerVersionOf;
  const pricing = projectData?.pricing as {
    interlockingTotal?: number;
    interlockingPricePerPosition?: number;
    extraItems?: Array<{ id: string; description: string; price: number }>;
    discountPercent?: number;
    discountAmount?: number;
    grossTotal?: number;
    netTotal?: number;
    totalListPrice?: number;
    priceLabels?: Record<string, string>;
    serviceItems?: {
      travelCosts?: boolean;
      boardLodging?: boolean;
      trainingDays?: string;
      trainingIncluded?: boolean;
      packaging?: boolean;
      transportPrice?: number;
      transportIncluded?: boolean;
    };
    installationConfig?: {
      included?: boolean;
      totalPrice?: number;
    };
    itemComments?: Array<{ machineComment: string; optionComments: Record<number, string>; optionPriceHidden?: Record<number, boolean> }>;
    priceComments?: {
      interlocking?: string;
      installation?: string;
      travel?: string;
      boardLodging?: string;
      training?: string;
      packaging?: string;
      transport?: string;
      extras?: Record<string, string>;
    };
  } | undefined;

  const toNum = (v: any) => (v != null ? parseFloat(String(v)) : 0) || 0;

  const utilitiesTotal = offer.items.reduce((acc: any, item: any) => {
    const qty = item.quantity;
    return {
      electricalPower: acc.electricalPower + toNum(item.snapshotElectricalPower) * qty + item.options.reduce((s: number, o: any) => s + toNum(o.snapshotElectricalPower) * ((o.quantity ?? 1)), 0),
      compressedAir: acc.compressedAir + toNum(item.snapshotCompressedAir) * qty + item.options.reduce((s: number, o: any) => s + toNum(o.snapshotCompressedAir) * ((o.quantity ?? 1)), 0),
      exhaustedAir: acc.exhaustedAir + toNum(item.snapshotExhaustedAir) * qty + item.options.reduce((s: number, o: any) => s + toNum(o.snapshotExhaustedAir) * ((o.quantity ?? 1)), 0),
      airIntroduced: acc.airIntroduced + toNum(item.snapshotAirIntroduced) * qty + item.options.reduce((s: number, o: any) => s + toNum(o.snapshotAirIntroduced) * ((o.quantity ?? 1)), 0),
      installationDays: acc.installationDays + toNum(item.snapshotInstallationDays) * qty,
    };
  }, { electricalPower: 0, compressedAir: 0, exhaustedAir: 0, airIntroduced: 0, installationDays: 0 });

  const hasUtilities = Object.values(utilitiesTotal).some((v: any) => v > 0);

  const sectionMap: Record<string, React.ReactNode> = {

    offer_title: offer.subject ? (
      <Card key="offer_title">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Line Title
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold">{offer.subject}</p>
          {projectData?.layoutDrawing && (
            <div className="inline-flex items-center gap-4 mt-2">
              <a href={`/api/layout-drawings/${projectData.layoutDrawing.filename}?name=${encodeURIComponent(projectData.layoutDrawing.originalName)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline" data-testid="link-layout-drawing">
                <FileText className="w-4 h-4 text-red-500" />
                Layout Drawing: {projectData.layoutDrawing.originalName}
              </a>
              <a href={`/api/layout-drawings/${projectData.layoutDrawing.filename}?download=1&name=${encodeURIComponent(projectData.layoutDrawing.originalName)}`} download={projectData.layoutDrawing.originalName} className="text-muted-foreground hover:text-primary" data-testid="button-download-layout-drawing" title="Download">
                <Download className="w-4 h-4" />
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    ) : null,

    metadata: (
      <div key="metadata" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Customer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{offer.customer?.name}</p>
            {offer.customer?.contactPerson && (
              <p className="text-sm text-muted-foreground">{offer.customer.contactPerson}</p>
            )}
            {offer.customer?.email && (
              <p className="text-sm text-muted-foreground">{offer.customer.email}</p>
            )}
            {(offer.projectData as any)?.commercial?.salesModel === "dealer_buys_resells" && (offer.projectData as any)?.commercial?.endCustomerName && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-xs text-muted-foreground">End Customer</p>
                <p className="text-sm font-medium">{(offer.projectData as any).commercial.endCustomerName}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="w-4 h-4" />
              Salesman
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{offer.salesmanName}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{format(new Date(offer.date), "MMMM d, yyyy")}</p>
          </CardContent>
        </Card>
      </div>
    ),

    machine_line: (
      <Card key="machine_line">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Machines & Equipment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {offer.items.map((item: any, index: number) => (
              <div key={item.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold shrink-0">Pos. {item.position || index + 1}</span>
                  <span className="font-semibold">{item.snapshotMachineName}</span>
                  {(item.quantity ?? 1) > 1 && (
                    <Badge variant="secondary" className="text-xs shrink-0">×{item.quantity}</Badge>
                  )}
                </div>
                {item.snapshotImageUrl && (
                  <div className="mt-2 mb-1">
                    <img
                      src={`/machine-images/${item.snapshotImageUrl.includes(".") ? item.snapshotImageUrl : `${item.snapshotImageUrl}.png`}`}
                      alt={item.snapshotMachineName}
                      className="max-w-full h-auto max-h-[300px] object-contain rounded-md bg-gray-50"
                      data-testid={`img-machine-main-${item.id}`}
                    />
                  </div>
                )}
                {item.snapshotMachineDescription && (
                  <div className="text-sm text-muted-foreground mt-1 space-y-2">
                    {item.snapshotMachineDescription.split(/\[\[IMG:([^\]]+)\]\]/).map((part: string, pi: number) =>
                      pi % 2 === 0 ? (
                        part.trim() ? <p key={pi}>{part}</p> : null
                      ) : (
                        <div key={pi} className="my-2">
                          <img
                            src={`/machine-images/${part}`}
                            alt={`Detail ${Math.ceil(pi / 2)}`}
                            className="max-w-full h-auto max-h-[260px] object-contain rounded-md bg-gray-50"
                            data-testid={`img-machine-detail-${item.id}-${Math.ceil(pi / 2)}`}
                          />
                        </div>
                      )
                    )}
                  </div>
                )}
                {item.options.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Options:</p>
                    <div className="space-y-0.5">
                      {item.options.map((opt: any) => {
                        const optQty = opt.quantity ?? 1;
                        return (
                          <p key={opt.id} className="text-xs text-muted-foreground leading-relaxed">
                            ↳ {opt.snapshotOptionName}{optQty > 1 ? ` ×${optQty}` : ""}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    ),

    technical_specs: (() => {
      if (!projectData?.technicalSpecs) return null;
      const specs = projectData.technicalSpecs as Record<string, string>;
      const perOfferFields = ([
        ["Min/Max. length of pieces (mm)", specs.minMaxLength],
        ["Max. width of pieces (mm)", specs.maxWidth],
        ["Min/Max. thickness (mm)", specs.minMaxThickness],
        ["Average line speed (mt/min)", specs.averageLineSpeed],
        ["Control side", specs.controlSide],
        ["Max. bow of panel", specs.maxBow],
        ["Paint", specs.paint],
        ["Substrate", specs.substrate],
        ["Finishing level", specs.finishing],
      ] as [string, string][]).filter(([, v]) => v?.trim());
      const standardFields = ([
        ["Standard voltage", specs.standardVoltage],
        ["Standard colors", specs.standardColors],
        ["Components", specs.components],
        ["Precautions", specs.precautions],
        ["Air intake", specs.airIntake],
        ["Commissioning", specs.commissioning],
      ] as [string, string][]).filter(([, v]) => v?.trim());
      return (
        <Card key="technical_specs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Project Data & Technical Specifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {perOfferFields.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {perOfferFields.map(([label, value]) => (
                  <div key={label} className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                    <p className="text-sm font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            )}
            {standardFields.length > 0 && (
              <div className="space-y-3">
                {perOfferFields.length > 0 && <div className="border-t" />}
                {standardFields.map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                    <p className="text-sm whitespace-pre-wrap">{value}</p>
                  </div>
                ))}
              </div>
            )}
            {!perOfferFields.length && !standardFields.length && (
              <p className="text-sm text-muted-foreground italic">No specification data recorded.</p>
            )}
          </CardContent>
        </Card>
      );
    })(),

    price_overview: pricing ? (
      <Card key="price_overview">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Price Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {offer.items.map((item: any, index: number) => {
            const basePrice = toNum(item.snapshotBasePrice);
            const machineQty = item.quantity ?? 1;
            const machineComment = pricing.itemComments?.[index]?.machineComment ?? "";
            const hiddenMap = pricing.itemComments?.[index]?.optionPriceHidden;
            const hiddenUnitTotal = (item.options ?? []).reduce((s: number, opt: any) => {
              if (!hiddenMap?.[opt.machineOptionId]) return s;
              return s + toNum(opt.snapshotPriceModifier) * (opt.quantity ?? 1);
            }, 0);
            const displayedUnit = basePrice + hiddenUnitTotal;
            return (
              <div key={item.id}>
                <div className="flex justify-between items-center py-1.5 border-b border-dashed">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium">
                      Pos. {item.position || index + 1}: {item.snapshotMachineName}{machineQty > 1 ? ` ×${machineQty}` : ""}
                    </span>
                    <BlinkingCommentIcon comment={machineComment} data-testid={`comment-view-machine-${index}`} />
                  </div>
                  <span className="font-mono text-sm font-semibold shrink-0">€{(displayedUnit * machineQty).toLocaleString()}</span>
                </div>
                {item.options.map((opt: any) => {
                  const optQty = opt.quantity ?? 1;
                  const optPrice = toNum(opt.snapshotPriceModifier);
                  const isHidden = pricing.itemComments?.[index]?.optionPriceHidden?.[opt.machineOptionId];
                  const total = optPrice * optQty * machineQty;
                  return (
                    <div key={opt.id} className="flex justify-between items-center py-0.5 pl-5 border-b border-dashed border-black/5">
                      <span className="text-xs text-muted-foreground">
                        ↳ {opt.snapshotOptionName}{optQty > 1 ? ` ×${optQty}` : ""}{machineQty > 1 ? ` (×${machineQty})` : ""}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground shrink-0">
                        {isHidden ? "Incl." : `+€${total.toLocaleString()}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {(pricing.interlockingTotal != null && Number(pricing.interlockingTotal) > 0) && (
            <div className="flex justify-between items-center py-1.5 border-b border-dashed">
              <div className="flex items-center gap-2">
                <span className="text-sm">Interlocking</span>
                <BlinkingCommentIcon comment={pricing.priceComments?.interlocking ?? ""} data-testid="comment-view-interlocking" />
              </div>
              <span className="font-mono text-sm shrink-0">€{Number(pricing.interlockingTotal).toLocaleString()}</span>
            </div>
          )}

          {(pricing.extraItems ?? []).map((extra: any) => (
            <div key={extra.id} className="flex justify-between items-center py-1.5 border-b border-dashed">
              <div className="flex items-center gap-2">
                <span className="text-sm">{extra.description || "Extra item"}</span>
                <BlinkingCommentIcon comment={pricing.priceComments?.extras?.[extra.id] ?? ""} data-testid={`comment-view-extra-${extra.id}`} />
              </div>
              <span className="font-mono text-sm shrink-0">€{Number(extra.price).toLocaleString()}</span>
            </div>
          ))}

          <div className="flex justify-between items-center py-2 border-b border-dashed font-semibold">
            <span className="text-sm">{pricing.priceLabels?.totalListPrice ?? "TOTAL LIST PRICE (ex works, installation excluded)"}</span>
            <span className="font-mono text-sm shrink-0">€{Number(pricing.totalListPrice ?? pricing.grossTotal ?? toNum(offer.totalPrice)).toLocaleString()}</span>
          </div>

          <div className="pt-3 pb-1">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">NET SERVICE PRICES</span>
          </div>

          <div className="flex justify-between items-center py-1.5 border-b border-dashed">
            <div className="flex items-center gap-2">
              <span className="text-sm">{pricing.priceLabels?.installation ?? "Installation and start-up"}</span>
              <BlinkingCommentIcon comment={pricing.priceComments?.installation ?? ""} data-testid="comment-view-installation" />
            </div>
            {pricing.installationConfig?.included ? (
              <span className="font-mono text-sm shrink-0">€{Number(pricing.installationConfig.totalPrice ?? 0).toLocaleString()}</span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-100 text-red-600 shrink-0">EXCLUDED</span>
            )}
          </div>

          <div className="flex justify-between items-center py-1.5 border-b border-dashed">
            <div className="flex items-center gap-2">
              <span className="text-sm">{pricing.priceLabels?.travelCosts ?? "Travel and flight costs"}</span>
              <BlinkingCommentIcon comment={pricing.priceComments?.travel ?? ""} data-testid="comment-view-travel" />
            </div>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${pricing.serviceItems?.travelCosts ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
              {pricing.serviceItems?.travelCosts ? "INCLUDED" : "EXCLUDED"}
            </span>
          </div>

          <div className="flex justify-between items-center py-1.5 border-b border-dashed">
            <div className="flex items-center gap-2">
              <span className="text-sm">{pricing.priceLabels?.boardLodging ?? "Board and lodging"}</span>
              <BlinkingCommentIcon comment={pricing.priceComments?.boardLodging ?? ""} data-testid="comment-view-board-lodging" />
            </div>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${pricing.serviceItems?.boardLodging ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
              {pricing.serviceItems?.boardLodging ? "INCLUDED" : "EXCLUDED"}
            </span>
          </div>

          <div className="flex justify-between items-center py-1.5 border-b border-dashed">
            <div className="flex items-center gap-2">
              <span className="text-sm">{pricing.priceLabels?.training ?? "Training"} ({pricing.serviceItems?.trainingDays || "0"} days)</span>
              <BlinkingCommentIcon comment={pricing.priceComments?.training ?? ""} data-testid="comment-view-training" />
            </div>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${pricing.serviceItems?.trainingIncluded !== false ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
              {pricing.serviceItems?.trainingIncluded !== false ? "INCLUDED" : "EXCLUDED"}
            </span>
          </div>

          <div className="flex justify-between items-center py-1.5 border-b border-dashed">
            <div className="flex items-center gap-2">
              <span className="text-sm">{pricing.priceLabels?.packaging ?? "Packaging"}</span>
              <BlinkingCommentIcon comment={pricing.priceComments?.packaging ?? ""} data-testid="comment-view-packaging" />
            </div>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${pricing.serviceItems?.packaging ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
              {pricing.serviceItems?.packaging ? "INCLUDED" : "EXCLUDED"}
            </span>
          </div>

          <div className="flex justify-between items-center py-1.5 border-b border-dashed">
            <div className="flex items-center gap-2">
              <span className="text-sm">{pricing.priceLabels?.transport ?? "Transport"}</span>
              <BlinkingCommentIcon comment={pricing.priceComments?.transport ?? ""} data-testid="comment-view-transport" />
            </div>
            {pricing.serviceItems?.transportIncluded ? (
              <span className="font-mono text-sm shrink-0">€{Number(pricing.serviceItems.transportPrice ?? 0).toLocaleString()}</span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-100 text-red-600 shrink-0">EXCLUDED</span>
            )}
          </div>

          <div className="flex justify-between items-center py-2 border-b border-dashed font-semibold">
            <span className="text-sm">{pricing.priceLabels?.grossTotal ?? "Gross Total"}</span>
            <span className="font-mono text-sm shrink-0">€{Number(pricing.grossTotal ?? toNum(offer.totalPrice)).toLocaleString()}</span>
          </div>

          {(pricing.discountPercent ?? 0) > 0 && (
            <div className="flex justify-between items-center py-1.5 border-b border-dashed text-red-500">
              <span className="text-sm">Discount ({pricing.discountPercent}%)</span>
              <span className="font-mono text-sm shrink-0">-€{Number(pricing.discountAmount ?? 0).toLocaleString()}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 font-bold">
            <span className="text-sm">{pricing.priceLabels?.netTotal ?? "NET TOTAL"}</span>
            <span className="font-mono text-sm shrink-0">€{Number(pricing.netTotal ?? toNum(offer.totalPrice)).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>
    ) : null,

    utilities_summary: offer.items.length > 0 ? (
      <Card key="utilities_summary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Utilities Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { icon: <Zap className="w-3.5 h-3.5" />, label: "Electrical Power", value: utilitiesTotal.electricalPower.toFixed(1), unit: "kW" },
              { icon: <Gauge className="w-3.5 h-3.5" />, label: "Compressed Air", value: utilitiesTotal.compressedAir.toFixed(1), unit: "Nl/min" },
              { icon: <Wind className="w-3.5 h-3.5" />, label: "Exhausted Air", value: utilitiesTotal.exhaustedAir.toFixed(1), unit: "m³/h" },
              { icon: <AirVent className="w-3.5 h-3.5" />, label: "Air Introduced", value: utilitiesTotal.airIntroduced.toFixed(1), unit: "m³/h" },
            ] as Array<{ icon: React.ReactNode; label: string; value: string; unit: string }>).map((row) => (
              <div key={row.label} className="flex flex-col gap-1 p-3 bg-muted/40 rounded-lg">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {row.icon}{row.label}
                </div>
                <p className={`text-xl font-bold ${row.value === "0" || row.value === "0.0" ? "text-muted-foreground/50" : ""}`}>
                  {row.value} <span className="text-sm font-normal text-muted-foreground">{row.unit}</span>
                </p>
              </div>
            ))}
          </div>
          {!hasUtilities && (
            <p className="text-sm text-muted-foreground italic mt-3">No utility data available for this offer's machines.</p>
          )}
        </CardContent>
      </Card>
    ) : null,

    terms_conditions: (projectData?.selectedPresets && projectData.selectedPresets.length > 0) ? (
      <Card key="terms_conditions">
        <CardHeader>
          <CardTitle>Terms & Conditions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {projectData.selectedPresets.map((preset: { id: number; title: string; content: string }, i: number) => (
              <div key={i} className="space-y-1">
                <p className="font-semibold text-sm">{preset.title}</p>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{preset.content}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    ) : null,
  };

  const DEFAULT_ORDER = ["metadata", "offer_title", "technical_specs", "utilities_summary", "machine_line", "price_overview", "terms_conditions"];
  const orderedSectionIds = formatSettings?.sections
    ? formatSettings.sections.filter((s) => s.enabled).map((s) => s.id)
    : DEFAULT_ORDER;

  return (
    <DealerLayout>
      <div className="flex flex-col gap-6 max-w-6xl mx-auto">
        <PageHeader
          title={offer.referenceNumber}
          subtitle={offer.subject}
          actions={
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono">V{displayVersion(offer.version)}</Badge>
              <Badge variant="outline" className={getStatusBadgeClasses(offer.status)}>
                {offer.status}
              </Badge>
            </div>
          }
        />

        {isDealerOwnOffer ? (
          <div className="flex flex-col md:flex-row justify-end items-start md:items-center gap-4">
            <div className="flex flex-wrap gap-2">
              <Link href={`/dealer/offers/${offerId}/wizard`}>
                <Button variant="outline" data-testid="button-edit">
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => createVersionMutation.mutate()}
                disabled={createVersionMutation.isPending}
                data-testid="button-create-version"
              >
                {createVersionMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                Create New Version
              </Button>
              <Button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                data-testid="button-download-pdf"
              >
                {pdfLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FilePdf className="w-4 h-4 mr-2" />}
                {pdfLoading ? "Generating…" : "Generate PDF"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShareOpen(true)}
                data-testid="button-share-offer"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
              <span className="text-sm font-medium text-muted-foreground mr-1">Document Mode</span>
              <button
                type="button"
                onClick={() => presentationMode !== "manufacturer" && modeMutation.mutate("manufacturer")}
                disabled={modeMutation.isPending || presentationMode === "manufacturer"}
                data-testid="button-mode-manufacturer"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  presentationMode === "manufacturer"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Factory className="w-3.5 h-3.5" />
                Manufacturer Offer
              </button>
              <button
                type="button"
                onClick={() => presentationMode !== "dealer" && modeMutation.mutate("dealer")}
                disabled={modeMutation.isPending || presentationMode === "dealer"}
                data-testid="button-mode-dealer"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  presentationMode === "dealer"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Briefcase className="w-3.5 h-3.5" />
                Dealer Offer
              </button>
              {modeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-1" />}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRevisionOpen(true)}
                data-testid="button-request-revision"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Request Revision
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (presentationMode === "dealer") {
                    navigate(`/dealer/offers/${offerId}/create-dealer-offer`);
                  } else {
                    navigate(`/dealer/offers/${offerId}/wizard`);
                  }
                }}
                data-testid="button-edit-prices"
              >
                <Pencil className="w-4 h-4 mr-2" />
                {presentationMode === "dealer" ? "Create Dealer Offer" : "Edit Prices & Generate PDF"}
              </Button>
              {presentationMode !== "dealer" && (
                <Button
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                  data-testid="button-download-pdf"
                >
                  {pdfLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FilePdf className="w-4 h-4 mr-2" />}
                  {pdfLoading ? "Generating…" : "Download PDF"}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setShareOpen(true)}
                data-testid="button-share-offer"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            </div>
          </>
        )}

        {orderedSectionIds.map((id) => sectionMap[id] ?? null)}
      </div>

      {offer && (
        <ShareOfferDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          offerId={offer.id}
          offerReference={offer.referenceNumber}
        />
      )}

      {revisionOpen && (
        <div className="rounded-xl border bg-card p-6 mt-6 space-y-3" data-testid="revision-form-inline">
          <h3 className="font-semibold text-base">Request Revision</h3>
          <p className="text-sm text-muted-foreground">
            Describe what needs to be changed. Your sales team will review and update the offer.
          </p>
          <div className="space-y-1">
            <Label>Revision Notes *</Label>
            <Textarea
              data-testid="textarea-revision-notes"
              placeholder="Describe what needs to be revised..."
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              rows={4}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRevisionOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              data-testid="button-confirm-revision"
              disabled={!revisionNotes.trim() || revisionMutation.isPending}
              onClick={() => revisionMutation.mutate(revisionNotes)}
            >
              {revisionMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Submit Revision Request
            </Button>
          </div>
        </div>
      )}
    </DealerLayout>
  );
}
