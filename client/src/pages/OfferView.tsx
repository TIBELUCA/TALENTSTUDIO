import { Layout } from "@/components/Layout";
import { LinkedEmailAttachments } from "@/components/LinkedEmailAttachments";
import { PdfViewer } from "@/components/PdfViewer";
import { useOffer, useCreateOfferVersion, useOfferVersions } from "@/hooks/use-offers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useParams, useLocation } from "wouter";
import { ArrowLeft, Copy, Loader2, Building2, User, Calendar, FileText, Zap, Wind, Gauge, AirVent, Receipt, FileText as FilePdf, Share2, Download, ClipboardList, Mail, Upload, X, Package, Plus, Eye, Trash2, History, Archive, ChevronDown, ChevronUp, Briefcase, Bell, HardDrive } from "lucide-react";
import { OfferCrmDialog } from "@/components/OfferCrmDialog";
import type { OfferCrmInfo, OfferReminder } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { ShareOfferDialog } from "@/components/ShareOfferDialog";
import { PageHeader } from "@/components/PageHeader";
import { BlinkingCommentIcon } from "@/components/CommentButton";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { api } from "@shared/routes";
import type { Drawing } from "@shared/schema";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { computeWordDiff, computeLineDiff, hasChanges, type DiffSegment } from "@/lib/textDiff";
import { getLocalizedField } from "@/lib/i18n/localize";
import { tOffer } from "@shared/i18n/offerLabels";
import { displayVersion } from "@shared/version";
import {
  expandNumericImagePlaceholders,
  stripAllImagePlaceholders,
} from "@shared/lib/imagePlaceholders";
import { calculateSnapshotDiscount, applyLineDiscount } from "@/utils/offerCalculations";
import { cn } from "@/lib/utils";

// Strip inline image placeholders ([[IMG:foo.png]] and [[IMGn]]) from text
// before diffing. They are rendered as real <img> by the normal view; in a
// textual diff they are noise and would also wrongly trigger the "Modified"
// badge.
function stripImagePlaceholders(s: string): string {
  return stripAllImagePlaceholders(s);
}

function WordDiffLine({ original, modified }: { original: string; modified: string }) {
  const orig = stripImagePlaceholders(original);
  const mod = stripImagePlaceholders(modified);
  const segments = computeWordDiff(orig, mod);
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

function DiffDisplay({ original, modified }: { original: string; modified: string }) {
  const origNorm = stripImagePlaceholders((original ?? "").replace(/\r\n/g, "\n"));
  const modNorm = stripImagePlaceholders((modified ?? "").replace(/\r\n/g, "\n"));

  if (origNorm === modNorm) return <span>{modNorm}</span>;

  const lineDiffs = computeLineDiff(origNorm, modNorm);

  return (
    <span>
      {lineDiffs.map((ld, i) => {
        const nl = i < lineDiffs.length - 1 ? "\n" : "";
        if (ld.type === "equal") return <span key={i}>{ld.text}{nl}</span>;
        if (ld.type === "removed") return <span key={i} className="text-red-600 dark:text-red-400 line-through">{ld.oldLine}{nl}</span>;
        if (ld.type === "added") return <span key={i} className="text-green-600 dark:text-green-400 underline">{ld.newLine}{nl}</span>;
        return <span key={i}><WordDiffLine original={ld.oldLine!} modified={ld.newLine!} />{nl}</span>;
      })}
    </span>
  );
}

interface DriveItemDto {
  id: number;
  kind: string;
  status: string;
  driveFolderUrl: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

function DriveBadge({ offerId }: { offerId: number }) {
  const { isMaster } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: status } = useQuery<{ connected: boolean; rootFolderUrl: string | null }>({
    queryKey: ["/api/drive/status"],
  });
  const { data: items = [] } = useQuery<DriveItemDto[]>({
    queryKey: ["/api/drive/items/by-offer", offerId],
    enabled: !!status?.connected && offerId > 0,
    refetchInterval: 10000,
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/drive/offers/${offerId}/retry`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Riprova avviata", description: `${data.count ?? 0} elementi rimessi in coda` });
      queryClient.invalidateQueries({ queryKey: ["/api/drive/items/by-offer", offerId] });
    },
    onError: () => toast({ title: "Errore riprova", variant: "destructive" }),
  });

  if (!status?.connected) return null;

  const folderUrl = items.find(i => i.driveFolderUrl)?.driveFolderUrl ?? null;
  const errored = items.some(i => i.status === "error");
  const queued = items.some(i => i.status === "queued");
  const lastSync = items
    .map(i => i.lastSyncedAt ? new Date(i.lastSyncedAt).getTime() : 0)
    .reduce((a, b) => Math.max(a, b), 0);

  const variantClass = errored
    ? "bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700"
    : queued
    ? "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"
    : "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700";

  const label = errored
    ? "Drive: errore"
    : queued
    ? "Drive: in sync"
    : items.length > 0
    ? "Drive: archiviata"
    : "Drive: in attesa";

  const lastSyncText = lastSync > 0 ? format(new Date(lastSync), "dd/MM/yyyy HH:mm") : null;

  const badge = (
    <Badge variant="outline" className={`flex items-center gap-1 ${variantClass}`} data-testid="badge-drive-status">
      <HardDrive className="w-3 h-3" />
      <span>{label}</span>
    </Badge>
  );

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="container-drive-archive">
      {folderUrl ? (
        <a href={folderUrl} target="_blank" rel="noopener noreferrer" data-testid="link-drive-folder">{badge}</a>
      ) : badge}
      {lastSyncText && (
        <span className="text-xs text-muted-foreground" data-testid="text-drive-last-sync">
          Ultima sync: {lastSyncText}
        </span>
      )}
      {errored && isMaster && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          onClick={() => retryMutation.mutate()}
          disabled={retryMutation.isPending}
          data-testid="button-drive-retry"
        >
          {retryMutation.isPending ? "..." : "Riprova ora"}
        </Button>
      )}
    </div>
  );
}

interface DocSection {
  id: string;
  name: string;
  enabled: boolean;
}

interface DocumentFormatSettings {
  sections: DocSection[];
  pageBackground: string;
}

export default function OfferView() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const offerId = parseInt(params.id || "0");
  const { data: offer, isLoading } = useOffer(offerId);
  const { data: offerVersions } = useOfferVersions(offerId);
  const createVersion = useCreateOfferVersion();
  const [showVersionChanges, setShowVersionChanges] = useState(false);
  const [versionsCardOpen, setVersionsCardOpen] = useState(true);
  const { isMaster, features } = useAuth();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [crmOpen, setCrmOpen] = useState(false);
  const [uploadingLayoutPdf, setUploadingLayoutPdf] = useState(false);
  const [uploadingLayoutDwg, setUploadingLayoutDwg] = useState(false);
  const [docDescription, setDocDescription] = useState("");
  const [previewDocId, setPreviewDocId] = useState<number | null>(null);
  const [showLayoutPdf, setShowLayoutPdf] = useState(false);
  const layoutPdfRef = useRef<HTMLInputElement>(null);
  const layoutDwgRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: crmInfo } = useQuery<OfferCrmInfo | null>({
    queryKey: ["/api/offers", offerId, "crm"],
    enabled: offerId > 0,
  });
  const { data: offerReminders = [] } = useQuery<OfferReminder[]>({
    queryKey: ["/api/offers", offerId, "reminders"],
    enabled: offerId > 0,
  });

  const { data: offerDocs = [] } = useQuery<any[]>({
    queryKey: ["/api/offers", offerId, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/offers/${offerId}/documents`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: offerId > 0,
  });

  const uploadDoc = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      if (docDescription) formData.append("description", docDescription);
      const res = await fetch(`/api/offers/${offerId}/documents`, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers", offerId, "documents"] });
      setDocDescription("");
      toast({ title: "Documento caricato" });
    },
    onError: () => toast({ title: "Errore caricamento", variant: "destructive" }),
  });

  const deleteDoc = useMutation({
    mutationFn: async (docId: number) => {
      const res = await fetch(`/api/offers/${offerId}/documents/${docId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers", offerId, "documents"] });
      toast({ title: "Documento eliminato" });
    },
    onError: () => toast({ title: "Errore eliminazione", variant: "destructive" }),
  });

  const handleCreateCommessa = () => {
    if (!offer) return;
    navigate(`/orders/new?offerId=${offer.id}&customerId=${offer.customerId}`);
  };

  const { data: formatSettings } = useQuery<DocumentFormatSettings>({
    queryKey: ["/api/settings/document-format"],
  });

  const linkedDrawingId = (offer?.projectData as Record<string, unknown> | undefined)?.linkedDrawingId as number | undefined;
  const { data: linkedDrawing } = useQuery<Drawing>({
    queryKey: ["/api/drawings", linkedDrawingId],
    queryFn: () => fetch(`/api/drawings/${linkedDrawingId}`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
    enabled: !!linkedDrawingId,
  });

  // Fetch source machines for each item so we can resolve [[IMGn]] placeholders
  // in legacy snapshots that still reference detail images by index.
  const uniqueMachineIds = Array.from(new Set(
    ((offer?.items ?? []) as any[])
      .map((it: any) => Number(it.machineId))
      .filter((id: number) => Number.isFinite(id) && id > 0)
  ));
  const machineQueries = useQueries({
    queries: uniqueMachineIds.map((id) => ({
      queryKey: ["/api/machines", id] as const,
      enabled: id > 0,
    })),
  });
  const machineDetailImagesById: Record<number, string[]> = {};
  machineQueries.forEach((q, idx) => {
    const m = q.data as any;
    if (m && Array.isArray(m.detailImages)) {
      machineDetailImagesById[uniqueMachineIds[idx]] = m.detailImages;
    }
  });

  const handleDownloadPdf = async () => {
    if (!offer) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/offers/${offer.id}/pdf`, { credentials: "include" });
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

  const handleCreateVersion = () => {
    createVersion.mutate(offerId, {
      onSuccess: (newOffer) => {
        navigate(`/offers/${newOffer.id}/edit`);
      }
    });
  };

  const handleLayoutFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fileType: "pdf" | "dwg") => {
    const file = e.target.files?.[0];
    if (!file || !offer) return;
    const setUploading = fileType === "pdf" ? setUploadingLayoutPdf : setUploadingLayoutDwg;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/offers/${offer.id}/layout-files`, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      queryClient.invalidateQueries({ queryKey: [api.offers.get.path, offerId] });
      toast({ title: `Layout ${fileType.toUpperCase()} uploaded`, description: file.name });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileType === "pdf" && layoutPdfRef.current) layoutPdfRef.current.value = "";
      if (fileType === "dwg" && layoutDwgRef.current) layoutDwgRef.current.value = "";
    }
  };

  const handleRemoveLayoutFile = async (fileType: "pdf" | "dwg") => {
    if (!offer) return;
    try {
      await fetch(`/api/offers/${offer.id}/layout-files/${fileType}`, { method: "DELETE", credentials: "include" });
      queryClient.invalidateQueries({ queryKey: [api.offers.get.path, offerId] });
      toast({ title: `Layout ${fileType.toUpperCase()} removed` });
    } catch {
      toast({ title: "Failed to remove file", variant: "destructive" });
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
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!offer) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground">Offer not found</p>
          <Link href="/offers">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Offers
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const maxChainVersion = (offerVersions ?? []).reduce((m, v) => Math.max(m, v.version ?? 0), 0);
  const isArchivedVersion = !!offer && maxChainVersion > 0 && (offer.version ?? 0) < maxChainVersion;
  const latestVersionRow = (offerVersions ?? []).find(v => v.version === maxChainVersion);
  const currentVersionRow = (offerVersions ?? []).find(v => v.id === offerId);
  const currentChangeSummary: string[] = (currentVersionRow?.changeSummary as string[] | undefined) ?? [];
  const prevVersionRow = (offerVersions ?? [])
    .filter(v => (v.version ?? 0) < (offer?.version ?? 0))
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  const prevItemsByPosition: Record<number, any> = {};
  if (prevVersionRow && Array.isArray(prevVersionRow.items)) {
    for (const it of prevVersionRow.items) {
      prevItemsByPosition[it?.position ?? 0] = it;
    }
  }
  const diffOn = showVersionChanges && !!prevVersionRow;

  const contentLang = (offer as any).language ?? "it";
  const localizeItem = (item: any) => {
    const rawDesc = getLocalizedField(item.snapshotDescriptions, item.snapshotMachineDescription, contentLang);
    const detailImgs = machineDetailImagesById[Number(item.machineId)] ?? [];
    return {
      ...item,
      snapshotMachineName: getLocalizedField(item.snapshotTitles, item.snapshotMachineName, contentLang),
      snapshotMachineDescription: expandNumericImagePlaceholders(rawDesc, detailImgs),
      options: (item.options ?? []).map((opt: any) => ({
        ...opt,
        snapshotOptionName: getLocalizedField(opt.snapshotOptionTitles, opt.snapshotOptionName, contentLang),
      })),
    };
  };
  const localizedItems = offer.items.map(localizeItem);
  const localizedOffer = { ...offer, items: localizedItems };

  const projectData = offer.projectData as any | null;
  const pricing = projectData?.pricing as {
    interlockingTotal?: number;
    interlockingPricePerPosition?: number;
    extraItems?: Array<{ id: string; description: string; price: number; discountOverridePercent?: number | null; isNet?: boolean }>;
    discountPercent?: number;
    discountAmount?: number;
    grossTotal?: number;
    netTotal?: number;
    totalListPrice?: number;
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
    itemDiscounts?: Array<{ discountOverridePercent?: number | null; isNet?: boolean; optionDiscounts?: Record<number, { discountOverridePercent?: number | null; isNet?: boolean }> }>;
    showNetOnly?: boolean;
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
    priceLabels?: {
      totalListPrice?: string;
      installation?: string;
      travelCosts?: string;
      boardLodging?: string;
      training?: string;
      packaging?: string;
      transport?: string;
      grossTotal?: string;
      netTotal?: string;
      interlocking?: string;
    };
  } | undefined;

  const toNum = (v: any) => (v != null ? parseFloat(String(v)) : 0) || 0;

  const utilitiesTotal = localizedItems.reduce((acc, item) => {
    const qty = item.quantity;
    return {
      electricalPower: acc.electricalPower + toNum(item.snapshotElectricalPower) * qty + item.options.reduce((s, o) => s + toNum((o as any).snapshotElectricalPower) * ((o as any).quantity ?? 1), 0),
      compressedAir: acc.compressedAir + toNum(item.snapshotCompressedAir) * qty + item.options.reduce((s, o) => s + toNum((o as any).snapshotCompressedAir) * ((o as any).quantity ?? 1), 0),
      exhaustedAir: acc.exhaustedAir + toNum(item.snapshotExhaustedAir) * qty + item.options.reduce((s, o) => s + toNum((o as any).snapshotExhaustedAir) * ((o as any).quantity ?? 1), 0),
      airIntroduced: acc.airIntroduced + toNum(item.snapshotAirIntroduced) * qty + item.options.reduce((s, o) => s + toNum((o as any).snapshotAirIntroduced) * ((o as any).quantity ?? 1), 0),
      installationDays: acc.installationDays + toNum(item.snapshotInstallationDays) * qty,
    };
  }, { electricalPower: 0, compressedAir: 0, exhaustedAir: 0, airIntroduced: 0, installationDays: 0 });

  const hasUtilities = Object.values(utilitiesTotal).some(v => v > 0);

  const computedMachinesTotal = localizedItems.reduce((acc, item) => {
    const base = toNum(item.snapshotBasePrice);
    const qty = item.quantity ?? 1;
    const optsTotal = item.options.reduce((s, opt) => {
      const optPrice = toNum((opt as any).snapshotPriceModifier);
      const optQty = (opt as any).quantity ?? 1;
      return s + optPrice * optQty;
    }, 0);
    return acc + (base + optsTotal) * qty;
  }, 0);
  const computedInterlocking = Number(pricing?.interlockingTotal ?? 0);
  const computedExtras = (pricing?.extraItems ?? []).reduce((s: number, e: any) => s + Number(e.price), 0);
  const computedTotalListPrice = computedMachinesTotal + computedInterlocking + computedExtras;
  const computedInstallation = pricing?.installationConfig?.included ? Number(pricing.installationConfig.totalPrice ?? 0) : 0;
  const computedTransport = pricing?.serviceItems?.transportIncluded ? Number(pricing.serviceItems.transportPrice ?? 0) : 0;
  const computedGrossTotal = computedTotalListPrice + computedInstallation + computedTransport;
  const computedDiscountPercent = Number(pricing?.discountPercent ?? 0);
  const computedShowNetOnly = Boolean(pricing?.showNetOnly);
  const computedDiscountAmount = calculateSnapshotDiscount(
    localizedItems,
    pricing?.itemDiscounts,
    pricing?.itemComments,
    pricing?.extraItems ?? [],
    computedInterlocking,
    computedDiscountPercent,
  );
  const computedNetTotal = computedGrossTotal - computedDiscountAmount;
  // Mostra la % aggregata fra parentesi solo se nessuna riga ha override o NET
  const hasPerLineDiscountOverrides = (() => {
    const ids = pricing?.itemDiscounts ?? [];
    for (const d of ids) {
      if (d?.discountOverridePercent != null || d?.isNet) return true;
      if (d?.optionDiscounts) {
        for (const k of Object.keys(d.optionDiscounts)) {
          const od = d.optionDiscounts[Number(k)];
          if (od?.discountOverridePercent != null || od?.isNet) return true;
        }
      }
    }
    for (const e of pricing?.extraItems ?? []) {
      if (e?.discountOverridePercent != null || e?.isNet) return true;
    }
    return false;
  })();

  // --- Section JSX map ---
  const sectionMap: Record<string, React.ReactNode> = {

    offer_title: offer.subject ? (
      <Card key="offer_title">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {tOffer("lineTitle", contentLang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold" data-testid="text-offer-subject">
            {diffOn && (prevVersionRow?.subject ?? "") !== (offer.subject ?? "")
              ? <DiffDisplay original={prevVersionRow?.subject ?? ""} modified={offer.subject ?? ""} />
              : offer.subject}
          </p>
          {projectData?.layoutDrawing && (
            <div className="inline-flex items-center gap-4 mt-2">
              <a href={`/layout-drawings/${projectData.layoutDrawing.filename}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline" data-testid="link-layout-drawing">
                <FileText className="w-4 h-4 text-red-500" />
                Layout PDF: {projectData.layoutDrawing.originalName}
              </a>
              <a href={`/layout-drawings/${projectData.layoutDrawing.filename}`} download={projectData.layoutDrawing.originalName} className="text-muted-foreground hover:text-primary" data-testid="button-download-layout-drawing" title="Download">
                <Download className="w-4 h-4" />
              </a>
            </div>
          )}
          {projectData?.layoutDwg && (
            <div className="inline-flex items-center gap-4 mt-2">
              <a href={`/layout-drawings/${projectData.layoutDwg.filename}`} download={projectData.layoutDwg.originalName} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline" data-testid="link-layout-dwg">
                <FileText className="w-4 h-4 text-blue-500" />
                Layout DWG: {projectData.layoutDwg.originalName}
              </a>
              <a href={`/layout-drawings/${projectData.layoutDwg.filename}`} download={projectData.layoutDwg.originalName} className="text-muted-foreground hover:text-primary" data-testid="button-download-layout-dwg" title="Download">
                <Download className="w-4 h-4" />
              </a>
            </div>
          )}
          {!projectData?.layoutDrawing && linkedDrawing?.pdfFilename && (
            <div className="inline-flex items-center gap-4 mt-2">
              <a href={`/drawings-files/${linkedDrawing.pdfFilename}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline" data-testid="link-linked-drawing-pdf">
                <FileText className="w-4 h-4 text-red-500" />
                Disegno PDF: {linkedDrawing.pdfOriginalName}
              </a>
              <a href={`/drawings-files/${linkedDrawing.pdfFilename}`} download={linkedDrawing.pdfOriginalName} className="text-muted-foreground hover:text-primary" title="Download">
                <Download className="w-4 h-4" />
              </a>
            </div>
          )}
          {!projectData?.layoutDwg && linkedDrawing?.dwgFilename && (
            <div className="inline-flex items-center gap-4 mt-2">
              <a href={`/drawings-files/${linkedDrawing.dwgFilename}?download=1&name=${encodeURIComponent(linkedDrawing.dwgOriginalName)}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline" data-testid="link-linked-drawing-dwg">
                <FileText className="w-4 h-4 text-blue-500" />
                Disegno DWG: {linkedDrawing.dwgOriginalName}
              </a>
              <a href={`/drawings-files/${linkedDrawing.dwgFilename}?download=1&name=${encodeURIComponent(linkedDrawing.dwgOriginalName)}`} className="text-muted-foreground hover:text-primary" title="Download">
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
              {tOffer("customer", contentLang)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold" data-testid="text-customer-name">
              {diffOn && (prevVersionRow?.customerName ?? "") !== (offer.customer?.name ?? "")
                ? <DiffDisplay original={prevVersionRow?.customerName ?? ""} modified={offer.customer?.name ?? ""} />
                : (offer.customer?.name || "—")}
            </p>
            {(offer.customer?.contactPerson || projectData?.headerInfo?.customer?.contactPerson) && (
              <p className="text-sm text-muted-foreground">{offer.customer?.contactPerson || projectData?.headerInfo?.customer?.contactPerson}</p>
            )}
            {(offer.customer?.email || projectData?.headerInfo?.customer?.email) && (
              <p className="text-sm text-muted-foreground">{offer.customer?.email || projectData?.headerInfo?.customer?.email}</p>
            )}
            {projectData?.headerInfo?.customer?.address && (
              <p className="text-sm text-muted-foreground whitespace-pre-line">{projectData.headerInfo.customer.address}</p>
            )}
            {(offer.projectData as any)?.commercial?.endCustomerName && (
              <div className="mt-2 pt-2 border-t" data-testid="end-customer-ref">
                <p className="text-xs text-muted-foreground">{tOffer("endCustomer", contentLang)}</p>
                <p className="text-sm font-medium">{(offer.projectData as any).commercial.endCustomerName}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="w-4 h-4" />
              {tOffer("salesman", contentLang)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold" data-testid="text-salesman-name">
              {diffOn && (prevVersionRow?.salesmanName ?? "") !== (offer.salesmanName ?? "")
                ? <DiffDisplay original={prevVersionRow?.salesmanName ?? ""} modified={offer.salesmanName ?? ""} />
                : offer.salesmanName}
            </p>
            {(() => {
              const hi = projectData?.headerInfo?.salesman;
              const hiMatchesSalesman = hi?.name && offer.salesmanName?.includes(hi.name.split(" ")[0]);
              const email = offer.salesmanEmail || (hiMatchesSalesman ? hi?.email : null);
              const mobile = offer.salesmanMobile || (hiMatchesSalesman ? hi?.mobile : null);
              return (
                <>
                  {email && <p className="text-sm text-muted-foreground" data-testid="text-salesman-email">{email}</p>}
                  {mobile && <p className="text-sm text-muted-foreground" data-testid="text-salesman-mobile">{mobile}</p>}
                </>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {tOffer("date", contentLang)}
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
            {tOffer("machinesEquipment", contentLang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {localizedItems.map((item, index) => (
              <div key={item.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold shrink-0">{tOffer("positionPrefix", contentLang)} {item.position || index + 1}</span>
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
                {item.snapshotMachineDescription && (() => {
                  const origDescs: Record<number, string> = projectData?.originalMachineDescs ?? {};
                  const overrides: Record<number, string> = projectData?.machineDescOverrides ?? {};
                  const prevItem = diffOn ? prevItemsByPosition[item.position ?? 0] : null;
                  const baseline = diffOn && prevItem?.snapshotMachineDescription != null
                    ? String(prevItem.snapshotMachineDescription)
                    : (origDescs[item.machineId] ?? "");
                  const origDesc = baseline.replace(/\r\n/g, "\n");
                  const currentDesc = (item.snapshotMachineDescription ?? "").replace(/\r\n/g, "\n");
                  const hasExplicitOverride = item.machineId in overrides && (overrides[item.machineId] ?? "").trim() !== "";
                  // Strip image placeholders from both sides so the
                  // "Modified" badge is not triggered by [[IMG…]] differences.
                  const origForDiff = stripAllImagePlaceholders(origDesc);
                  const currForDiff = stripAllImagePlaceholders(currentDesc);
                  const isModified = diffOn
                    ? origForDiff !== "" && hasChanges(origForDiff, currForDiff)
                    : hasExplicitOverride && hasChanges(origForDiff, currForDiff);
                  return (
                    <div className="text-sm text-muted-foreground mt-1 space-y-2">
                      {isModified && (
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600" data-testid={`badge-desc-modified-${item.id}`}>{tOffer("modified", contentLang)}</Badge>
                        </div>
                      )}
                      {isModified ? (
                        <div className="whitespace-pre-wrap" data-testid={`diff-desc-${item.id}`}>
                          <DiffDisplay original={origDesc} modified={currentDesc} />
                        </div>
                      ) : (
                        currentDesc.split(/\[\[IMG:([^\]]+)\]\]/).map((part: string, pi: number) =>
                          pi % 2 === 0 ? (
                            part.trim() ? <p key={pi} className="whitespace-pre-wrap">{part}</p> : null
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
                        )
                      )}
                    </div>
                  );
                })()}
                {item.options.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{tOffer("includedOptions", contentLang)}</p>
                    <div className="space-y-0.5">
                      {item.options.map((opt) => {
                        const optQty = (opt as any).quantity ?? 1;
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
        [tOffer("minMaxLength", contentLang), specs.minMaxLength],
        [tOffer("maxWidth", contentLang), specs.maxWidth],
        [tOffer("minMaxThickness", contentLang), specs.minMaxThickness],
        [tOffer("averageLineSpeed", contentLang), specs.averageLineSpeed],
        [tOffer("controlSide", contentLang), specs.controlSide],
        [tOffer("maxBow", contentLang), specs.maxBow],
        [tOffer("paint", contentLang), specs.paint],
        [tOffer("substrate", contentLang), specs.substrate],
        [tOffer("finishing", contentLang), specs.finishing],
      ] as [string, string][]).filter(([, v]) => v?.trim());
      const standardFields = ([
        [tOffer("standardVoltage", contentLang), specs.standardVoltage],
        [tOffer("standardColors", contentLang), specs.standardColors],
        [tOffer("components", contentLang), specs.components],
        [tOffer("precautions", contentLang), specs.precautions],
        [tOffer("airIntake", contentLang), specs.airIntake],
        [tOffer("commissioning", contentLang), specs.commissioning],
      ] as [string, string][]).filter(([, v]) => v?.trim());
      return (
        <Card key="technical_specs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {tOffer("projectData", contentLang)}
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
              <p className="text-sm text-muted-foreground italic">{tOffer("noSpecData", contentLang)}</p>
            )}
          </CardContent>
        </Card>
      );
    })(),

    price_overview: pricing ? (() => {
      // Local 5-col responsive grid mirroring /offers/new (OfferWorkflow). On
      // mobile (<md) the first cell spans both columns so each row reflows
      // into 2 sub-rows; on md+ it lays out as 5 inline columns.
      // Responsive 5-column grid (md+):
      //   Voce | Listino | Sconto % | Netto | Azioni
      // Mobile (<md): 2 cols, label spans full width via [&>*:first-child]
      const PO_COLS = "grid grid-cols-2 gap-x-2 gap-y-1.5 items-center md:grid-cols-[minmax(220px,1.5fr)_minmax(100px,130px)_minmax(70px,90px)_minmax(100px,130px)_minmax(110px,140px)] md:gap-x-3 md:gap-y-0 [&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1";
      const PO_CELL_LIST = "text-right font-mono text-sm tabular-nums tracking-tight shrink-0 text-muted-foreground";
      const PO_CELL_NET = "text-right font-mono text-sm tabular-nums tracking-tight shrink-0 font-semibold";
      const PO_CELL_DISCOUNT = "flex items-center justify-end gap-1.5 flex-wrap";
      const PO_CELL_ACTIONS = "flex items-center justify-end gap-1.5 flex-wrap";
      // Helper renderers used inside this scope
      const renderListCell = (gross: number, hidden = false) => (
        <span className={cn(PO_CELL_LIST, hidden && "italic")}>
          {hidden ? tOffer("incl", contentLang) : `€${gross.toLocaleString("it-IT", { maximumFractionDigits: 2 })}`}
        </span>
      );
      const renderDiscPct = (overridePct: number | null | undefined, isNet: boolean, testid: string) => {
        if (isNet) return (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" data-testid={`badge-net-${testid}`}>NETTO</Badge>
        );
        const isOverride = overridePct != null;
        const pct = isOverride ? Number(overridePct) : computedDiscountPercent;
        return pct > 0 ? (
          <span
            className={cn(
              "text-[10px] font-mono px-1 rounded",
              isOverride ? "text-amber-700 bg-amber-100/60 dark:text-amber-300 dark:bg-amber-900/30" : "text-muted-foreground bg-muted/50",
            )}
            title={isOverride ? `Sconto di riga (override): ${pct}%` : `Sconto globale: ${pct}%`}
            data-testid={`text-discount-${testid}`}
          >
            {pct}%
          </span>
        ) : <span className="text-[10px] text-muted-foreground/60">—</span>;
      };
      const renderNetCell = (gross: number, overridePct: number | null | undefined, isNet: boolean, hidden = false, testid?: string) => {
        if (hidden) return <span className={cn(PO_CELL_NET, "text-muted-foreground/60 italic")}>{tOffer("incl", contentLang)}</span>;
        const net = applyLineDiscount(gross, overridePct ?? null, isNet, computedDiscountPercent);
        return <span className={PO_CELL_NET} data-testid={testid}>€{net.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span>;
      };
      const servicesTotal = computedInstallation + computedTransport;
      const machinesTotalLabel = "Machines Total";
      const extrasTotalLabel = "Extras Total";
      const servicesTotalLabel = "Services Total";
      return (
      <Card key="price_overview">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            {tOffer("priceOverview", contentLang)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sticky column header — hidden on mobile */}
          <div className={cn(PO_COLS, "hidden md:grid sticky top-0 z-10 bg-background py-2 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground")}>
            <span>Voce</span>
            <span className="text-right">Listino €</span>
            <span className="text-right">Sconto %</span>
            <span className="text-right">Netto €</span>
            <span className="text-right pr-1">Azioni</span>
          </div>

          {/* MACHINES */}
          <div className="space-y-2">
            {localizedItems.map((item, index) => {
              const basePrice  = toNum(item.snapshotBasePrice);
              const machineQty = item.quantity ?? 1;
              const machineComment = pricing.itemComments?.[index]?.machineComment ?? '';
              const optionCommentsMap = pricing.itemComments?.[index]?.optionComments ?? {};
              const hiddenMap = pricing.itemComments?.[index]?.optionPriceHidden;
              const lineCfg = pricing.itemDiscounts?.[index];
              const hiddenUnitTotal = (item.options ?? []).reduce((s: number, opt: any) => {
                if (!hiddenMap?.[opt.machineOptionId]) return s;
                return s + toNum(opt.snapshotPriceModifier) * (opt.quantity ?? 1);
              }, 0);
              const machineGross = (basePrice + hiddenUnitTotal) * machineQty;
              const machineNetLine = applyLineDiscount(machineGross, lineCfg?.discountOverridePercent ?? null, lineCfg?.isNet ?? false, computedDiscountPercent);
              const allOptsUnit = (item.options ?? []).reduce((s: number, opt: any) => s + toNum(opt.snapshotPriceModifier) * (opt.quantity ?? 1), 0);
              const itemGrossTotal = (basePrice + allOptsUnit) * machineQty;
              const visibleOptsNetSum = (item.options ?? []).reduce((s: number, opt: any) => {
                const moid = opt.machineOptionId;
                if (hiddenMap?.[moid]) return s;
                const optPrice = toNum(opt.snapshotPriceModifier);
                const optQty = opt.quantity ?? 1;
                const subtotal = optPrice * optQty * machineQty;
                const optCfg = lineCfg?.optionDiscounts?.[moid] ?? { discountOverridePercent: null, isNet: false };
                return s + applyLineDiscount(subtotal, optCfg.discountOverridePercent ?? null, optCfg.isNet ?? false, computedDiscountPercent);
              }, 0);
              const itemNetTotal = machineNetLine + visibleOptsNetSum;
              const itemShownTotal = computedShowNetOnly ? itemNetTotal : itemGrossTotal;
              const hiddenDetails = (item.options ?? [])
                .filter((opt: any) => hiddenMap?.[opt.machineOptionId])
                .map((opt: any) => ({
                  name: opt.snapshotOptionName,
                  price: toNum(opt.snapshotPriceModifier) * (opt.quantity ?? 1),
                }));
              return (
                <div key={item.id} className="border rounded-lg overflow-hidden">
                  {/* Machine header row */}
                  <div className={cn(PO_COLS, "px-3 py-2 bg-muted/30")}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="font-medium text-sm truncate"
                        title="Prezzo della sola macchina base (senza optional). Il totale di posizione è mostrato nel Subtotal qui sotto."
                      >
                        Pos. {item.position || index + 1}: {item.snapshotMachineName}{machineQty > 1 ? ` ×${machineQty}` : ""}
                      </span>
                    </div>
                    {renderListCell(machineGross)}
                    <div className={PO_CELL_DISCOUNT}>
                      {renderDiscPct(lineCfg?.discountOverridePercent ?? null, !!lineCfg?.isNet, `machine-${index}`)}
                    </div>
                    {renderNetCell(machineGross, lineCfg?.discountOverridePercent ?? null, !!lineCfg?.isNet, false, `text-view-machine-price-${index}`)}
                    <div className={PO_CELL_ACTIONS}>
                      <BlinkingCommentIcon comment={machineComment} data-testid={`comment-view-machine-${index}`} />
                    </div>
                  </div>

                  {/* Hidden options hint */}
                  {hiddenUnitTotal > 0 && hiddenDetails.length > 0 && (
                    <div className="px-3 pb-1.5 pt-1 text-[10px] text-muted-foreground italic" data-testid={`text-hidden-options-hint-${index}`}>
                      include {hiddenDetails.length} opzion{hiddenDetails.length === 1 ? "e" : "i"} nascost{hiddenDetails.length === 1 ? "a" : "e"} (+€{(hiddenUnitTotal * machineQty).toLocaleString("it-IT")}): {hiddenDetails.map((h: { name: string }) => h.name).join(", ")}
                    </div>
                  )}

                  {/* Option sub-rows */}
                  {(item.options ?? []).map((opt: any) => {
                    const moid = opt.machineOptionId;
                    const optQty = opt.quantity ?? 1;
                    const optPrice = toNum(opt.snapshotPriceModifier);
                    const isHidden = !!hiddenMap?.[moid];
                    const optCfg = lineCfg?.optionDiscounts?.[moid];
                    const optGross = optPrice * optQty * machineQty;
                    const optComment = optionCommentsMap?.[moid] ?? '';
                    return (
                      <div key={opt.id} className={cn(PO_COLS, "px-3 py-1.5 border-t text-xs")}>
                        <span className="text-muted-foreground pl-6 truncate">
                          + {opt.snapshotOptionName}{optQty > 1 ? ` ×${optQty}` : ""}{machineQty > 1 ? ` (×${machineQty})` : ""}
                        </span>
                        {renderListCell(optGross, isHidden)}
                        <div className={PO_CELL_DISCOUNT}>
                          {isHidden
                            ? <span className="text-[10px] text-muted-foreground/60">—</span>
                            : renderDiscPct(optCfg?.discountOverridePercent ?? null, !!optCfg?.isNet, `option-${index}-${moid}`)}
                        </div>
                        {renderNetCell(optGross, optCfg?.discountOverridePercent ?? null, !!optCfg?.isNet, isHidden, `text-view-option-net-${index}-${moid}`)}
                        <div className={PO_CELL_ACTIONS}>
                          <BlinkingCommentIcon comment={optComment} data-testid={`comment-view-option-${index}-${moid}`} />
                        </div>
                      </div>
                    );
                  })}

                  {/* Subtotal */}
                  <div className={cn(PO_COLS, "px-3 py-1.5 border-t text-sm font-medium bg-muted/10")}>
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className={PO_CELL_LIST}>€{itemGrossTotal.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span>
                    <span />
                    <span className={PO_CELL_NET} data-testid={`text-view-machine-subtotal-${index}`}>€{itemNetTotal.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span>
                    <span />
                  </div>
                </div>
              );
            })}
            <div className={cn(PO_COLS, "px-1 font-medium text-sm pt-1")}>
              <span>{machinesTotalLabel}</span>
              <span className={PO_CELL_LIST}>€{computedMachinesGross.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span>
              <span />
              <span className={PO_CELL_NET} data-testid="text-view-machines-net-total">€{computedMachinesTotal.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span>
              <span />
            </div>
          </div>

          {/* INTERLOCKING */}
          {(pricing.interlockingTotal != null && Number(pricing.interlockingTotal) > 0) && (() => {
            const interGross = Number(pricing.interlockingTotal);
            const perPos = localizedItems.length > 0 ? interGross / localizedItems.length : interGross;
            return (
              <div className={cn(PO_COLS, "border rounded-lg px-3 py-2 bg-muted/30")}>
                <span className="text-sm font-medium">
                  {pricing.priceLabels?.interlocking ?? tOffer("interlocking", contentLang)}
                  <span className="block text-[10px] text-muted-foreground/80 font-normal">{localizedItems.length} pos. × €{perPos.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span>
                </span>
                {renderListCell(interGross)}
                <div className={PO_CELL_DISCOUNT}>{renderDiscPct(null, false, "interlocking")}</div>
                {renderNetCell(interGross, null, false, false, "text-view-interlocking-net")}
                <div className={PO_CELL_ACTIONS}>
                  <BlinkingCommentIcon comment={pricing.priceComments?.interlocking ?? ''} data-testid="comment-view-interlocking" />
                </div>
              </div>
            );
          })()}

          {/* EXTRAS */}
          {(pricing.extraItems ?? []).length > 0 && (
            <div className="space-y-2">
              {(pricing.extraItems ?? []).map((extra: any) => {
                const extraGross = Number(extra.price);
                return (
                  <div key={extra.id} className={cn(PO_COLS, "border rounded-lg px-3 py-2")}>
                    <span className="text-sm">{extra.description || "Extra item"}</span>
                    {renderListCell(extraGross)}
                    <div className={PO_CELL_DISCOUNT}>
                      {renderDiscPct(extra.discountOverridePercent ?? null, !!extra.isNet, `extra-${extra.id}`)}
                    </div>
                    {renderNetCell(extraGross, extra.discountOverridePercent ?? null, !!extra.isNet, false, `text-view-extra-net-${extra.id}`)}
                    <div className={PO_CELL_ACTIONS}>
                      <BlinkingCommentIcon comment={pricing.priceComments?.extras?.[extra.id] ?? ''} data-testid={`comment-view-extra-${extra.id}`} />
                    </div>
                  </div>
                );
              })}
              <div className={cn(PO_COLS, "px-1 font-medium text-sm pt-1")}>
                <span>{extrasTotalLabel}</span>
                <span className={PO_CELL_LIST}>€{computedExtrasGross.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span>
                <span />
                <span className={PO_CELL_NET} data-testid="text-view-extras-net-total">€{computedExtras.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span>
                <span />
              </div>
            </div>
          )}

          {/* TOTAL LIST / NET PRICE block */}
          <div className={cn(PO_COLS, "border-2 border-primary/30 rounded-lg px-3 py-2 bg-primary/5")}>
            <span className="h-7 inline-flex items-center text-sm font-bold uppercase tracking-wide" data-testid="label-view-total-list-price">
              {pricing.priceLabels?.totalListPrice ?? tOffer("totalListPrice", contentLang)}
            </span>
            <span className={cn(PO_CELL_LIST, "font-bold")} data-testid="text-view-total-list-price">
              €{computedTotalListPrice.toLocaleString("it-IT", { maximumFractionDigits: 2 })}
            </span>
            <span />
            <span className={cn(PO_CELL_NET, "font-bold")} data-testid="text-view-total-net-price">
              €{Math.max(0, computedTotalListPrice - computedDiscountAmount).toLocaleString("it-IT", { maximumFractionDigits: 2 })}
            </span>
            <span />
          </div>

          {/* DISCOUNT row (only when not showNetOnly and there is a discount) */}
          {!computedShowNetOnly && computedDiscountAmount > 0 && (
            <div className={cn(PO_COLS, "px-1 text-red-500")}>
              <span className="text-sm">
                {tOffer("discount", contentLang)}
                {!hasPerLineDiscountOverrides && computedDiscountPercent > 0 ? ` (${computedDiscountPercent}%)` : ""}
              </span>
              <span /><span />
              <span className={PO_CELL_NET}>-€{computedDiscountAmount.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span>
              <span />
            </div>
          )}

          {/* SERVICES */}
          <h4 className="font-medium text-sm text-muted-foreground pt-2">Services</h4>
          <div className="border rounded-lg divide-y">
            {/* Installation */}
            <div className={cn(PO_COLS, "px-3 py-2")}>
              <span className="text-sm font-medium">{pricing.priceLabels?.installation ?? tOffer("installation", contentLang)}</span>
              <span />
              {pricing.installationConfig?.included ? (
                <span className={PO_CELL_TOTAL}>€{Number(pricing.installationConfig.totalPrice ?? 0).toLocaleString("it-IT")}</span>
              ) : (
                <span className={cn(PO_CELL_TOTAL, "text-muted-foreground/60")}>—</span>
              )}
              <span />
              <div className={PO_CELL_ACTIONS}>
                <BlinkingCommentIcon comment={pricing.priceComments?.installation ?? ''} data-testid="comment-view-installation" />
                <span className={cn("shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border", pricing.installationConfig?.included ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")}>
                  {pricing.installationConfig?.included ? tOffer("included", contentLang) : tOffer("excluded", contentLang)}
                </span>
              </div>
            </div>
            {/* Travel */}
            <div className={cn(PO_COLS, "px-3 py-2")}>
              <span className="text-sm">{pricing.priceLabels?.travelCosts ?? tOffer("travelCosts", contentLang)}</span>
              <span />
              <span className={cn(PO_CELL_TOTAL, "text-muted-foreground/60")}>—</span>
              <span />
              <div className={PO_CELL_ACTIONS}>
                <BlinkingCommentIcon comment={pricing.priceComments?.travel ?? ''} data-testid="comment-view-travel" />
                <span className={cn("shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border", pricing.serviceItems?.travelCosts ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")}>
                  {pricing.serviceItems?.travelCosts ? tOffer("included", contentLang) : tOffer("excluded", contentLang)}
                </span>
              </div>
            </div>
            {/* Board & lodging */}
            <div className={cn(PO_COLS, "px-3 py-2")}>
              <span className="text-sm">{pricing.priceLabels?.boardLodging ?? tOffer("boardLodging", contentLang)}</span>
              <span />
              <span className={cn(PO_CELL_TOTAL, "text-muted-foreground/60")}>—</span>
              <span />
              <div className={PO_CELL_ACTIONS}>
                <BlinkingCommentIcon comment={pricing.priceComments?.boardLodging ?? ''} data-testid="comment-view-board-lodging" />
                <span className={cn("shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border", pricing.serviceItems?.boardLodging ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")}>
                  {pricing.serviceItems?.boardLodging ? tOffer("included", contentLang) : tOffer("excluded", contentLang)}
                </span>
              </div>
            </div>
            {/* Training */}
            <div className={cn(PO_COLS, "px-3 py-2")}>
              <span className="text-sm">{pricing.priceLabels?.training ?? tOffer("training", contentLang)} ({pricing.serviceItems?.trainingDays || '0'} {tOffer("days", contentLang)})</span>
              <span />
              <span className={cn(PO_CELL_TOTAL, "text-muted-foreground/60")}>—</span>
              <span />
              <div className={PO_CELL_ACTIONS}>
                <BlinkingCommentIcon comment={pricing.priceComments?.training ?? ''} data-testid="comment-view-training" />
                <span className={cn("shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border", pricing.serviceItems?.trainingIncluded !== false ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")}>
                  {pricing.serviceItems?.trainingIncluded !== false ? tOffer("included", contentLang) : tOffer("excluded", contentLang)}
                </span>
              </div>
            </div>
            {/* Packaging */}
            <div className={cn(PO_COLS, "px-3 py-2")}>
              <span className="text-sm">{pricing.priceLabels?.packaging ?? tOffer("packaging", contentLang)}</span>
              <span />
              <span className={cn(PO_CELL_TOTAL, "text-muted-foreground/60")}>—</span>
              <span />
              <div className={PO_CELL_ACTIONS}>
                <BlinkingCommentIcon comment={pricing.priceComments?.packaging ?? ''} data-testid="comment-view-packaging" />
                <span className={cn("shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border", pricing.serviceItems?.packaging ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")}>
                  {pricing.serviceItems?.packaging ? tOffer("included", contentLang) : tOffer("excluded", contentLang)}
                </span>
              </div>
            </div>
            {/* Transport */}
            <div className={cn(PO_COLS, "px-3 py-2")}>
              <span className="text-sm">{pricing.priceLabels?.transport ?? tOffer("transport", contentLang)}</span>
              <span />
              {pricing.serviceItems?.transportIncluded ? (
                <span className={PO_CELL_TOTAL}>€{Number(pricing.serviceItems.transportPrice ?? 0).toLocaleString("it-IT")}</span>
              ) : (
                <span className={cn(PO_CELL_TOTAL, "text-muted-foreground/60")}>—</span>
              )}
              <span />
              <div className={PO_CELL_ACTIONS}>
                <BlinkingCommentIcon comment={pricing.priceComments?.transport ?? ''} data-testid="comment-view-transport" />
                <span className={cn("shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border", pricing.serviceItems?.transportIncluded ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700" : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700")}>
                  {pricing.serviceItems?.transportIncluded ? tOffer("included", contentLang) : tOffer("excluded", contentLang)}
                </span>
              </div>
            </div>
          </div>
          <div className={cn(PO_COLS, "px-1 font-medium text-sm pt-1")}>
            <span>{servicesTotalLabel}</span><span /><span className={PO_CELL_TOTAL}>€{servicesTotal.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span><span /><span />
          </div>

          {/* FINAL TOTALS */}
          <div className="border-t-2 pt-3 space-y-2">
            {!computedShowNetOnly && (
              <div className={cn(PO_COLS, "px-1 font-semibold text-sm")}>
                <span>{pricing.priceLabels?.grossTotal ?? tOffer("grossTotal", contentLang)}</span>
                <span /><span className={PO_CELL_TOTAL}>€{computedGrossTotal.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span><span /><span />
              </div>
            )}
            <div className={cn(PO_COLS, "px-1 font-bold text-sm")}>
              <span>{pricing.priceLabels?.netTotal ?? tOffer("netTotal", contentLang)}</span>
              <span /><span className={PO_CELL_TOTAL}>€{computedNetTotal.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</span><span /><span />
            </div>
          </div>
        </CardContent>
      </Card>
      );
    })() : null,

    utilities_summary: localizedItems.length > 0 ? (
      <Card key="utilities_summary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            {tOffer("utilitiesSummary", contentLang)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { icon: <Zap className="w-3.5 h-3.5" />, label: tOffer("electricalPower", contentLang), value: utilitiesTotal.electricalPower.toFixed(1), unit: "kW" },
              { icon: <Gauge className="w-3.5 h-3.5" />, label: tOffer("compressedAir", contentLang), value: utilitiesTotal.compressedAir.toFixed(1), unit: "Nl/min" },
              { icon: <Wind className="w-3.5 h-3.5" />, label: tOffer("exhaustedAir", contentLang), value: utilitiesTotal.exhaustedAir.toFixed(1), unit: "m³/h" },
              { icon: <AirVent className="w-3.5 h-3.5" />, label: tOffer("airIntroduced", contentLang), value: utilitiesTotal.airIntroduced.toFixed(1), unit: "m³/h" },
            ] as Array<{ icon: React.ReactNode; label: string; value: string; unit: string }>).map(row => (
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
            <p className="text-sm text-muted-foreground italic mt-3">{tOffer("noUtilityData", contentLang)}</p>
          )}
        </CardContent>
      </Card>
    ) : null,

    terms_conditions: (projectData?.deliveryTerms || projectData?.paymentSchedule?.length > 0 || (projectData?.selectedPresets && projectData.selectedPresets.length > 0)) ? (
      <Card key="terms_conditions">
        <CardHeader>
          <CardTitle>{tOffer("termsConditions", contentLang)}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {(projectData?.deliveryTerms || projectData?.deliveryDays || projectData?.deliveryDate) && (
              <div className="space-y-1" data-testid="view-delivery-terms">
                <p className="font-semibold text-sm uppercase tracking-wide">{tOffer("delivery", contentLang)}</p>
                <p className="text-sm text-muted-foreground">
                  {projectData.deliveryMode === "date"
                    ? projectData.deliveryDate
                    : projectData.deliveryDays
                      ? `${projectData.deliveryDays} ${tOffer("days", contentLang)} ${projectData.deliveryDescription || ""}`
                      : projectData.deliveryTerms}
                </p>
              </div>
            )}

            {projectData?.paymentSchedule && projectData.paymentSchedule.length > 0 && (
              <div className="space-y-2" data-testid="view-payment-schedule">
                <p className="font-semibold text-sm uppercase tracking-wide">{tOffer("payment", contentLang)}</p>
                <div className="space-y-1.5">
                  {projectData.paymentSchedule.map((row: { description: string; percentage: number; amount: number }, i: number) => (
                    <div key={i} className="flex items-baseline justify-between text-sm">
                      <span className="text-muted-foreground">{row.description}</span>
                      <span className="font-mono font-medium shrink-0 ml-3">
                        {projectData.paymentMode === "amount"
                          ? `€${row.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`
                          : `${row.percentage}%`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {projectData?.selectedPresets && projectData.selectedPresets.length > 0 && (
              <div className="space-y-4">
                {projectData.selectedPresets.map((preset: { id: number; title: string; content: string }, i: number) => {
                  const origPresets: Array<{ id: number; title: string; content: string }> = projectData?.originalPresets ?? [];
                  const prevPresets: Array<{ id: number; title: string; content: string }> =
                    (diffOn && prevVersionRow?.projectData?.selectedPresets) || [];
                  const prevPreset = diffOn ? prevPresets.find((p: any) => p.id === preset.id) : undefined;
                  const origPreset = prevPreset ?? origPresets.find((op: any) => op.id === preset.id);
                  const titleModified = origPreset && hasChanges(origPreset.title, preset.title);
                  const contentModified = origPreset && hasChanges(origPreset.content, preset.content);
                  const anyModified = titleModified || contentModified;
                  return (
                    <div key={i} className="space-y-1">
                      {anyModified && (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600 mb-1" data-testid={`badge-terms-modified-${i}`}>{tOffer("modified", contentLang)}</Badge>
                      )}
                      {titleModified ? (
                        <p className="font-semibold text-sm" data-testid={`diff-terms-title-${i}`}><DiffDisplay original={origPreset.title} modified={preset.title} /></p>
                      ) : (
                        <p className="font-semibold text-sm">{preset.title}</p>
                      )}
                      {contentModified ? (
                        <div className="text-sm whitespace-pre-wrap text-muted-foreground" data-testid={`diff-terms-content-${i}`}><DiffDisplay original={origPreset.content} modified={preset.content} /></div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{preset.content}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    ) : null,
  };

  // Determine ordered, enabled section IDs from format settings (fallback to default order)
  const DEFAULT_ORDER = ["metadata", "offer_title", "technical_specs", "utilities_summary", "machine_line", "price_overview", "terms_conditions"];
  const orderedSectionIds = formatSettings?.sections
    ? formatSettings.sections.filter(s => s.enabled).map(s => s.id)
    : DEFAULT_ORDER;

  return (
    <Layout>
      <div className="flex flex-col gap-6 max-w-6xl mx-auto">
        {/* Top bar — always shown, not part of section ordering */}
        <PageHeader
          title={offer.referenceNumber}
          subtitle={offer.subject}
          actions={
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono">V{displayVersion(offer.version)}</Badge>
              {isArchivedVersion && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600" data-testid="badge-archived-version">
                  <Archive className="w-3 h-3 mr-1" /> Archiviata
                </Badge>
              )}
              {(offer as any).language && (offer as any).language !== "it" && (
                <Badge variant="outline" className="text-[10px] px-1.5 uppercase" data-testid="badge-offer-language">{(offer as any).language}</Badge>
              )}
              <Badge variant="outline" className={getStatusBadgeClasses(offer.status)}>
                {offer.status}
              </Badge>
              <DriveBadge offerId={offer.id} />
            </div>
          }
        />
        {isArchivedVersion && latestVersionRow && (
          <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-700 px-4 py-2 text-sm flex items-center gap-2" data-testid="banner-archived-version">
            <Archive className="w-4 h-4 shrink-0" />
            <span>Stai visualizzando una versione archiviata (V{displayVersion(offer.version)}). La versione corrente è</span>
            <Link href={`/offers/${latestVersionRow.id}`}>
              <span className="font-semibold underline cursor-pointer" data-testid="link-latest-version">V{displayVersion(latestVersionRow.version)} — {latestVersionRow.referenceNumber}</span>
            </Link>
          </div>
        )}
        {prevVersionRow && (offer.version ?? 0) > 1 && (
          <div className="rounded-md border border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-700 px-4 py-2 text-sm" data-testid="banner-version-changes">
            <div className="flex items-center gap-2 flex-wrap">
              <History className="w-4 h-4 shrink-0" />
              <span className="font-semibold">Modifiche rispetto alla versione precedente (V{displayVersion(prevVersionRow.version)}):</span>
              <span className="text-blue-700 dark:text-blue-300" data-testid="text-version-change-count">
                {currentChangeSummary.length === 0
                  ? "Nessuna modifica"
                  : `${currentChangeSummary.length} modifich${currentChangeSummary.length === 1 ? "a" : "e"}`}
              </span>
              {currentChangeSummary.length > 0 && (
                <Button
                  size="sm"
                  variant={showVersionChanges ? "default" : "outline"}
                  className={showVersionChanges ? "bg-blue-600 hover:bg-blue-700 ml-auto" : "ml-auto"}
                  onClick={() => setShowVersionChanges(!showVersionChanges)}
                  data-testid="button-toggle-version-changes-top"
                >
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  {showVersionChanges ? "Nascondi modifiche" : "Mostra modifiche"}
                </Button>
              )}
            </div>
            {showVersionChanges && currentChangeSummary.length > 0 && (
              <ul className="mt-2 ml-6 list-disc space-y-0.5 text-xs" data-testid="list-version-changes-top">
                {currentChangeSummary.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex flex-col md:flex-row justify-end items-start md:items-center gap-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCreateVersion}
              disabled={createVersion.isPending || isArchivedVersion}
              data-testid="button-create-version"
            >
              {createVersion.isPending ? (
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
              {pdfLoading ? "Generating…" : "Download PDF"}
            </Button>
            {!isArchivedVersion && (
              <Link href={`/offers/${offer.id}/send-email`}>
                <Button variant="outline" data-testid="button-send-email">
                  <Mail className="w-4 h-4 mr-2" />
                  Invia Email
                </Button>
              </Link>
            )}
            {offer.status === "Accepted" && (
              <Button
                variant="outline"
                onClick={handleCreateCommessa}
                data-testid="button-create-commessa"
                className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30"
              >
                <ClipboardList className="w-4 h-4 mr-2" />
                Crea Commessa
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
            <Button
              variant="outline"
              onClick={() => setCrmOpen(true)}
              data-testid="button-open-crm"
            >
              <Briefcase className="w-4 h-4 mr-2" />
              CRM
            </Button>
          </div>
        </div>

        {(() => {
          const hasCrm = !!(crmInfo && (crmInfo.expectedCloseDate || crmInfo.winProbability != null || (crmInfo.competitors?.length ?? 0) > 0 || crmInfo.budget != null || crmInfo.decisionMaker || crmInfo.nextSteps || crmInfo.notes));
          const activeReminders = offerReminders.filter(r => !r.isDismissed && !r.sentAt).length;
          if (!hasCrm && activeReminders === 0) return null;
          const parts: string[] = [];
          if (crmInfo?.expectedCloseDate) {
            try {
              parts.push(`Chiusura prevista: ${format(new Date(crmInfo.expectedCloseDate), "dd/MM/yyyy")}`);
            } catch {
              parts.push(`Chiusura prevista: ${crmInfo.expectedCloseDate}`);
            }
          }
          if (crmInfo?.winProbability != null) parts.push(`Probabilità ${crmInfo.winProbability}%`);
          if ((crmInfo?.competitors?.length ?? 0) > 0) {
            const n = crmInfo!.competitors!.length;
            parts.push(`${n} competitor${n === 1 ? "" : "s"}`);
          }
          if (activeReminders > 0) parts.push(`${activeReminders} promemoria attiv${activeReminders === 1 ? "o" : "i"}`);
          if (parts.length === 0) return null;
          return (
            <div
              className="rounded-md border border-primary/20 bg-primary/5 px-4 py-2 text-sm flex items-center gap-2 cursor-pointer hover-elevate"
              onClick={() => setCrmOpen(true)}
              data-testid="banner-crm-summary"
            >
              <Briefcase className="w-4 h-4 shrink-0 text-primary" />
              <span className="flex-1">{parts.join(" · ")}</span>
              {activeReminders > 0 && <Bell className="w-3.5 h-3.5 text-primary" />}
            </div>
          );
        })()}

        {/* Storico Versioni — collapsible, shown directly under actions */}
        {offerVersions && offerVersions.length > 1 && (
          <Card data-testid="card-offer-versions">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="w-5 h-5 text-primary" />
                  Storico Versioni ({offerVersions.length})
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant={showVersionChanges ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowVersionChanges(!showVersionChanges)}
                    data-testid="btn-toggle-version-changes"
                    disabled={!versionsCardOpen}
                  >
                    <Eye className="w-4 h-4 mr-1.5" />
                    {showVersionChanges ? "Nascondi modifiche" : "Mostra modifiche"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVersionsCardOpen(!versionsCardOpen)}
                    data-testid="btn-toggle-versions-card"
                    aria-expanded={versionsCardOpen}
                  >
                    {versionsCardOpen ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                    {versionsCardOpen ? "Nascondi" : "Mostra"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            {versionsCardOpen && (
            <CardContent className="space-y-2">
              {[...offerVersions].sort((a, b) => b.version - a.version).map((v) => {
                const total = typeof v.totalPrice === "string" ? parseFloat(v.totalPrice) : Number(v.totalPrice);
                return (
                  <div
                    key={v.id}
                    className={`p-3 rounded-lg ${v.isCurrent ? "border-2 border-primary/30 bg-primary/5" : "border bg-muted/20"}`}
                    data-testid={`offer-version-row-${v.version}`}
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge variant={v.isCurrent ? "default" : "outline"} className={`font-mono text-xs shrink-0 ${v.isCurrent ? "bg-primary text-primary-foreground" : ""}`}>
                        V{v.displayVersion ?? displayVersion(v.version)}{v.isCurrent ? " — Corrente" : ""}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">{v.referenceNumber}</span>
                      <Badge variant="outline" className={getStatusBadgeClasses(v.status)}>{v.status}</Badge>
                      <span className="text-xs text-muted-foreground">{format(new Date(v.date), "dd/MM/yyyy")}</span>
                      {v.salesmanName && (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1" data-testid={`offer-version-salesman-${v.version}`}>
                          <User className="w-3 h-3" /> {v.salesmanName}
                        </span>
                      )}
                      {isFinite(total) && total > 0 && (
                        <span className="text-xs text-muted-foreground">€ {total.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      )}
                      <div className="ml-auto">
                        {!v.isViewed && (
                          <Link href={`/offers/${v.id}`}>
                            <Button variant="ghost" size="sm" data-testid={`btn-view-offer-version-${v.version}`}>
                              <Eye className="w-3.5 h-3.5 mr-1" /> Vedi
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                    {showVersionChanges && v.changeSummary && v.changeSummary.length > 0 && (
                      <ul className="mt-2 ml-2 space-y-0.5">
                        {v.changeSummary.map((change, ci) => (
                          <li
                            key={ci}
                            className="text-xs text-muted-foreground flex items-start gap-1.5"
                            data-testid={`offer-version-change-${v.version}-${ci}`}
                          >
                            <span className="text-primary mt-0.5 shrink-0">•</span>
                            <span>{change}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {showVersionChanges && v.changeSummary && v.changeSummary.length === 0 && v.version > 1 && (
                      <p className="text-xs text-muted-foreground italic mt-1 ml-2">Nessuna modifica rilevata rispetto alla versione precedente.</p>
                    )}
                  </div>
                );
              })}
            </CardContent>
            )}
          </Card>
        )}

        {/* Ordered sections */}
        {orderedSectionIds.map(id => sectionMap[id] ?? null)}

        {/* Layout Drawing Upload */}
        <Card data-testid="card-layout-drawings">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-base flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Layout PDF</span>
              <div>
                <input ref={layoutPdfRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => handleLayoutFileUpload(e, "pdf")} data-testid="input-view-layout-pdf" />
                <Button variant="outline" size="sm" onClick={() => layoutPdfRef.current?.click()} disabled={uploadingLayoutPdf} data-testid="btn-view-upload-layout-pdf">
                  {uploadingLayoutPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                  {projectData?.layoutDrawing ? "Sostituisci" : "Carica"}
                </Button>
              </div>
            </div>
            {projectData?.layoutDrawing ? (
              <>
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-md border">
                  <FileText className="w-5 h-5 text-red-500 shrink-0" />
                  <span className="text-sm font-medium flex-1 truncate">{projectData.layoutDrawing.originalName}</span>
                  <Button variant="ghost" size="sm" onClick={() => setShowLayoutPdf(!showLayoutPdf)} data-testid="btn-toggle-layout-pdf">
                    {showLayoutPdf ? <X className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
                    {showLayoutPdf ? "Chiudi" : "Apri"}
                  </Button>
                  <a href={`/layout-drawings/${projectData.layoutDrawing.filename}`} download={projectData.layoutDrawing.originalName}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid="btn-download-layout-pdf"><Download className="w-3.5 h-3.5" /></Button>
                  </a>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleRemoveLayoutFile("pdf")} data-testid="btn-view-remove-layout-pdf">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {showLayoutPdf && (
                  <PdfViewer
                    src={`/layout-drawings/${projectData.layoutDrawing.filename}`}
                    title="Layout PDF"
                    testId="layout-pdf-viewer"
                  />
                )}
              </>
            ) : linkedDrawing?.pdfFilename ? (
              <>
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-md border" data-testid="linked-drawing-pdf-row">
                  <FileText className="w-5 h-5 text-red-500 shrink-0" />
                  <span className="text-sm font-medium flex-1 truncate">{linkedDrawing.pdfOriginalName ?? linkedDrawing.pdfFilename}</span>
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">Da disegno collegato</span>
                  <Button variant="ghost" size="sm" onClick={() => setShowLayoutPdf(!showLayoutPdf)} data-testid="btn-toggle-linked-drawing-pdf">
                    {showLayoutPdf ? <X className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
                    {showLayoutPdf ? "Chiudi" : "Apri"}
                  </Button>
                  <a href={`/drawings-files/${linkedDrawing.pdfFilename}`} download={linkedDrawing.pdfOriginalName ?? linkedDrawing.pdfFilename}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid="btn-download-linked-drawing-pdf"><Download className="w-3.5 h-3.5" /></Button>
                  </a>
                </div>
                {showLayoutPdf && (
                  <PdfViewer
                    src={`/drawings-files/${linkedDrawing.pdfFilename}`}
                    title="Layout PDF (disegno collegato)"
                    testId="linked-drawing-pdf-viewer"
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nessun layout PDF caricato.</p>
            )}

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm flex items-center gap-2"><Package className="w-4 h-4 text-blue-500" /> Layout DWG</span>
                <div>
                  <input ref={layoutDwgRef} type="file" accept=".dwg" className="hidden" onChange={(e) => handleLayoutFileUpload(e, "dwg")} data-testid="input-view-layout-dwg" />
                  <Button variant="outline" size="sm" onClick={() => layoutDwgRef.current?.click()} disabled={uploadingLayoutDwg} data-testid="btn-view-upload-layout-dwg">
                    {uploadingLayoutDwg ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                    {projectData?.layoutDwg ? "Sostituisci" : "Carica"}
                  </Button>
                </div>
              </div>
              {projectData?.layoutDwg ? (
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-md border">
                  <Package className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="text-sm font-medium flex-1 truncate">{projectData.layoutDwg.originalName}</span>
                  <a href={`/layout-drawings/${projectData.layoutDwg.filename}`} download={projectData.layoutDwg.originalName}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid="btn-download-layout-dwg"><Download className="w-3.5 h-3.5" /></Button>
                  </a>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleRemoveLayoutFile("dwg")} data-testid="btn-view-remove-layout-dwg">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : linkedDrawing?.dwgFilename ? (
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-md border" data-testid="linked-drawing-dwg-row">
                  <Package className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="text-sm font-medium flex-1 truncate">{linkedDrawing.dwgOriginalName ?? linkedDrawing.dwgFilename}</span>
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">Da disegno collegato</span>
                  <a href={`/drawings-files/${linkedDrawing.dwgFilename}`} download={linkedDrawing.dwgOriginalName ?? linkedDrawing.dwgFilename}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid="btn-download-linked-drawing-dwg"><Download className="w-3.5 h-3.5" /></Button>
                  </a>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nessun layout DWG caricato.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Documenti */}
        <Card data-testid="card-offer-documents">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-base flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Documenti</span>
              <div className="flex items-center gap-2">
                <Input placeholder="Descrizione" value={docDescription} onChange={(e) => setDocDescription(e.target.value)} className="w-32 h-8 text-xs" data-testid="input-offer-doc-description" />
                <input ref={docFileRef} type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) uploadDoc.mutate(e.target.files[0]); }} data-testid="input-offer-doc-file" />
                <Button variant="outline" size="sm" onClick={() => docFileRef.current?.click()} disabled={uploadDoc.isPending} data-testid="btn-upload-offer-doc">
                  {uploadDoc.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                  Aggiungi
                </Button>
              </div>
            </div>
            {offerDocs.length > 0 ? (
              <div className="space-y-2">
                {offerDocs.map((doc: any) => {
                  const name = (doc.originalName || doc.filename || "").toLowerCase();
                  const isPdf = /\.pdf$/i.test(name);
                  const isImage = /\.(jpe?g|png|gif|webp|svg|bmp|tiff?)$/i.test(name);
                  const canPreview = isPdf || isImage;
                  const isOpen = previewDocId === doc.id;
                  return (
                    <div key={doc.id} className="space-y-2">
                      <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md border" data-testid={`offer-doc-row-${doc.id}`}>
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.originalName}</p>
                          {doc.description && <p className="text-xs text-muted-foreground">{doc.description}</p>}
                        </div>
                        {canPreview && (
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setPreviewDocId(isOpen ? null : doc.id)} data-testid={`btn-preview-offer-doc-${doc.id}`}>
                            {isOpen ? <X className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
                            <span className="text-xs">{isOpen ? "Chiudi" : "Apri"}</span>
                          </Button>
                        )}
                        <a href={`/offer-documents/${doc.filename}`} download>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid={`btn-download-offer-doc-${doc.id}`}><Download className="w-3.5 h-3.5" /></Button>
                        </a>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteDoc.mutate(doc.id)} data-testid={`btn-delete-offer-doc-${doc.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      {isOpen && isPdf && (
                        <PdfViewer
                          src={`/offer-documents/${doc.filename}`}
                          title={doc.originalName}
                          testId={`offer-doc-pdf-viewer-${doc.id}`}
                          height="70vh"
                        />
                      )}
                      {isOpen && isImage && (
                        <div className="rounded-md border overflow-hidden bg-muted/10 p-4 text-center">
                          <img src={`/offer-documents/${doc.filename}`} alt={doc.originalName} className="max-w-full max-h-[60vh] mx-auto rounded" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nessun documento caricato.</p>
            )}
          </CardContent>
        </Card>

        {/* Allegati da Email */}
        <Card data-testid="card-linked-email-attachments">
          <CardContent className="pt-4">
            <LinkedEmailAttachments entityType="offer" entityId={offer.id} />
          </CardContent>
        </Card>
      </div>

      <ShareOfferDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        offerId={offer.id}
        offerReference={offer.referenceNumber}
      />
      <OfferCrmDialog
        open={crmOpen}
        onOpenChange={setCrmOpen}
        offerId={offer.id}
        offerReference={offer.referenceNumber}
      />
    </Layout>
  );
}
