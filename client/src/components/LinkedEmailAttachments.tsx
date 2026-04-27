import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Paperclip, Download, Trash2, Loader2, Mail, Eye, FolderInput,
  FileText, AlertTriangle, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PdfViewer } from "@/components/PdfViewer";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { EmailAttachmentLink, LinkEntityType } from "@shared/schema";

interface Props {
  entityType: LinkEntityType;
  entityId: number;
  className?: string;
}

function fmtSize(n: number | null | undefined): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function sniffMimeFromBytes(blob: Blob): Promise<string | null> {
  const head = await blob.slice(0, 16).arrayBuffer();
  const b = new Uint8Array(head);
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return "application/pdf";
  }
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return "image/gif";
  }
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return "image/webp";
  }
  if (b.length >= 4 && b[0] === 0x42 && b[1] === 0x4d) {
    return "image/bmp";
  }
  return null;
}

async function fetchFileBlob(id: number): Promise<{ blob: Blob; mime: string }> {
  const res = await fetch(`/api/email-attachments/linked/${id}/file`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  let mime = res.headers.get("content-type") || blob.type || "application/octet-stream";
  if (mime === "application/octet-stream" || !mime) {
    const sniffed = await sniffMimeFromBytes(blob);
    if (sniffed) mime = sniffed;
  }
  return { blob, mime };
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "attachment";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

type MoveTarget = "offer_document" | "order_document" | "drawing";

function getMoveTargets(entityType: LinkEntityType): Array<{ value: MoveTarget; label: string }> {
  if (entityType === "offer") {
    return [
      { value: "offer_document", label: "Sposta in Documenti dell'offerta" },
      { value: "drawing", label: "Sposta in Disegni / Layout" },
    ];
  }
  if (entityType === "order") {
    return [
      { value: "order_document", label: "Sposta in Documenti della commessa" },
      { value: "drawing", label: "Sposta in Disegni / Layout" },
    ];
  }
  if (entityType === "customer") {
    return [{ value: "drawing", label: "Sposta in Disegni / Layout" }];
  }
  return [];
}

export function LinkedEmailAttachments({ entityType, entityId, className }: Props) {
  const { toast } = useToast();
  const queryKey = ["/api/email-attachments/linked", entityType, entityId] as const;

  const { data: links = [], isLoading } = useQuery<EmailAttachmentLink[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/email-attachments/linked?entityType=${entityType}&entityId=${entityId}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: Number.isFinite(entityId) && entityId > 0,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/email-attachments/linked/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Allegato rimosso" });
    },
    onError: (err: Error) => toast({
      title: "Errore", description: err.message, variant: "destructive",
    }),
  });

  const moveMutation = useMutation({
    mutationFn: async (vars: { id: number; target: MoveTarget }) =>
      apiRequest("POST", `/api/email-attachments/linked/${vars.id}/move-to`, { target: vars.target }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey });
      if (vars.target === "offer_document") {
        queryClient.invalidateQueries({ queryKey: ["/api/offers", entityId, "documents"] });
      }
      if (vars.target === "order_document") {
        queryClient.invalidateQueries({ queryKey: ["/api/orders", String(entityId)] });
      }
      if (vars.target === "drawing") {
        queryClient.invalidateQueries({ queryKey: ["/api/drawings"] });
      }
      toast({ title: "Allegato spostato" });
    },
    onError: (err: Error) => toast({
      title: "Spostamento fallito", description: err.message, variant: "destructive",
    }),
  });

  // Preview state
  const [preview, setPreview] = useState<EmailAttachmentLink | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewPdfData, setPreviewPdfData] = useState<ArrayBuffer | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);

  useEffect(() => {
    if (!preview) {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
      setPreviewPdfData(null);
      setPreviewMime(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewPdfData(null);
    setPreviewMime(null);
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    setPreviewBlobUrl(null);
    fetchFileBlob(preview.id)
      .then(async ({ blob, mime }) => {
        if (cancelled) return;
        const isPdf = mime === "application/pdf"
          || /\.pdf$/i.test(preview.originalName)
          || (preview.mimeType ?? "") === "application/pdf";
        if (!cancelled) setPreviewMime(mime);
        if (isPdf) {
          const ab = await blob.arrayBuffer();
          if (!cancelled) setPreviewPdfData(ab);
        } else {
          const url = URL.createObjectURL(blob);
          createdUrl = url;
          if (!cancelled) {
            setPreviewBlobUrl(url);
          } else {
            URL.revokeObjectURL(url);
          }
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setPreviewError(err.message || "Errore caricamento anteprima");
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.id]);

  const handleDownload = async (link: EmailAttachmentLink) => {
    try {
      const res = await fetch(
        `/api/email-attachments/linked/${link.id}/file?download=1`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      triggerBlobDownload(blob, link.originalName);
    } catch (err) {
      toast({
        title: "Download fallito",
        description: String((err as Error)?.message ?? err),
        variant: "destructive",
      });
    }
  };

  const moveTargets = getMoveTargets(entityType);

  return (
    <div className={className} data-testid={`linked-attachments-${entityType}-${entityId}`}>
      <div className="flex items-center gap-2 mb-3">
        <Mail className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Allegati da Email</h3>
        {links.length > 0 && (
          <span className="text-xs text-muted-foreground">({links.length})</span>
        )}
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : links.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Nessun allegato collegato.</p>
      ) : (
        <ul className="space-y-2">
          {links.map(link => {
            return (
              <li
                key={link.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm ${
                  link.kind === "message" ? "bg-blue-50/60 dark:bg-blue-950/30 border-blue-200/60 dark:border-blue-900/40" : "bg-muted/30"
                }`}
                data-testid={`linked-attachment-row-${link.id}`}
              >
                {link.kind === "message" ? (
                  <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                ) : (
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">
                      {link.kind === "message"
                        ? (link.sourceSubject || link.originalName)
                        : link.originalName}
                    </span>
                    {link.kind === "message" && (
                      <span
                        className="shrink-0 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-600/90 text-white"
                        data-testid={`badge-email-${link.id}`}
                      >
                        Email completa
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {fmtSize(link.size)}
                    {link.sourceFrom && ` · da ${link.sourceFrom}`}
                    {link.uploadedAt && ` · ${fmtDate(link.uploadedAt)}`}
                  </div>
                  {link.kind !== "message" && link.sourceSubject && (
                    <div className="text-[10px] text-muted-foreground truncate">
                      Oggetto: {link.sourceSubject}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPreview(link)}
                  data-testid={`button-preview-linked-${link.id}`}
                  title="Anteprima"
                >
                  <Eye className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleDownload(link)}
                  data-testid={`button-download-linked-${link.id}`}
                  title="Scarica"
                >
                  <Download className="w-3.5 h-3.5" />
                </Button>
                {moveTargets.length > 0 && link.kind !== "message" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={moveMutation.isPending}
                        data-testid={`button-move-linked-${link.id}`}
                        title="Sposta in…"
                      >
                        <FolderInput className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {moveTargets.map(t => (
                        <DropdownMenuItem
                          key={t.value}
                          onClick={() => moveMutation.mutate({ id: link.id, target: t.value })}
                          data-testid={`menu-move-${t.value}-${link.id}`}
                        >
                          {t.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Rimuovere "${link.originalName}"?`)) deleteMutation.mutate(link.id);
                  }}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-linked-${link.id}`}
                  title="Rimuovi"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent
          className="p-0 gap-0 max-w-[95vw]"
        >
          {preview && (() => {
            const effectiveMime = previewMime || preview.mimeType || "";
            const isPdf = effectiveMime === "application/pdf"
              || /\.pdf$/i.test(preview.originalName);
            const isImage = effectiveMime.startsWith("image/")
              || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(preview.originalName);
            return (
              <>
                <DialogHeader className="px-6 py-4 border-b">
                  <DialogTitle className="flex items-center gap-2 pr-8 truncate">
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="truncate">{preview.originalName}</span>
                    <span className="text-xs font-normal text-muted-foreground shrink-0">
                      {fmtSize(preview.size)}
                    </span>
                  </DialogTitle>
                </DialogHeader>
                <div className="px-6 py-4 bg-muted/20 min-w-0 overflow-hidden">
                  {previewLoading ? (
                    <div className="flex items-center justify-center py-24">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : previewError ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                      <AlertTriangle className="w-12 h-12 text-destructive" />
                      <p className="text-sm text-muted-foreground">{previewError}</p>
                    </div>
                  ) : isPdf && previewPdfData ? (
                    <PdfViewer
                      data={previewPdfData}
                      title={preview.originalName}
                      testId="pdf-linked-attachment-preview"
                      height="80vh"
                    />
                  ) : isImage && previewBlobUrl ? (
                    <div className="flex items-center justify-center" style={{ maxHeight: "85vh" }}>
                      <img
                        src={previewBlobUrl}
                        alt={preview.originalName}
                        className="max-w-full max-h-[85vh] object-contain"
                        data-testid="img-linked-attachment-preview"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                      <FileText className="w-12 h-12 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Anteprima non disponibile per questo tipo di file.
                      </p>
                      <p className="text-xs text-muted-foreground">{preview.mimeType || "tipo sconosciuto"}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 px-6 py-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      let url: string | null = null;
                      let revoke = false;
                      if (previewPdfData) {
                        url = URL.createObjectURL(new Blob([previewPdfData], { type: "application/pdf" }));
                        revoke = true;
                      } else if (previewBlobUrl) {
                        url = previewBlobUrl;
                      }
                      if (!url) return;
                      const win = window.open(url, "_blank", "noopener,noreferrer");
                      if (!win) {
                        if (revoke) URL.revokeObjectURL(url);
                        toast({ title: "Popup bloccato", description: "Consenti i popup.", variant: "destructive" });
                        return;
                      }
                      if (revoke) setTimeout(() => URL.revokeObjectURL(url!), 60000);
                    }}
                    disabled={!previewPdfData && !previewBlobUrl}
                    data-testid="link-open-linked-newtab"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Apri in nuova scheda
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleDownload(preview)}
                    data-testid="button-download-linked-dialog"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Scarica
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreview(null)}
                    data-testid="button-close-linked-preview"
                  >
                    Chiudi
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
