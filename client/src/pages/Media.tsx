import { useState, useRef, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileSpreadsheet, Upload, CheckCircle2, Loader2, Trash2,
  ImageIcon, CalendarIcon, PackageIcon,
} from "lucide-react";
import { api } from "@shared/routes";

interface ImportInfo {
  filename: string;
  importedAt: string;
  machines: number;
  options: number;
}

interface MachineImage {
  filename: string;
  url: string;
  size: number;
  uploadedAt: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Media() {
  const { isMaster } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Machine Excel import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ machines: number; options: number; optionsSkipped?: number; skippedCodes?: string[] } | null>(null);
  const [isDragOverExcel, setIsDragOverExcel] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);

  // Image upload state
  const [isDragOverImg, setIsDragOverImg] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { data: importInfo } = useQuery<ImportInfo | null>({
    queryKey: ["/api/media/import-info"],
    queryFn: () => fetch("/api/media/import-info", { credentials: "include" }).then(async r => {
      if (!r.ok) return null;
      return r.json();
    }),
    staleTime: 0,
    enabled: !!isMaster,
  });

  const { data: images, isLoading: imagesLoading } = useQuery<MachineImage[]>({
    queryKey: ["/api/media/images"],
    queryFn: () => fetch("/api/media/images", { credentials: "include" }).then(r => r.json()),
    staleTime: 0,
    enabled: !!isMaster,
  });

  const deleteImageMutation = useMutation({
    mutationFn: (filename: string) =>
      fetch(`/api/media/images/${encodeURIComponent(filename)}`, { method: "DELETE", credentials: "include" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/images"] });
      toast({ title: "Image deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const handleExcelFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|ods|csv)$/i)) {
      toast({ title: "Invalid file", description: "Please select an Excel file (.xlsx or .xls)", variant: "destructive" });
      return;
    }
    setImportResult(null);
    setIsImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(api.machines.import.path, { method: "POST", body: form, credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Import failed" }));
        throw new Error(err.message);
      }
      const data = await res.json();
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: [api.machines.list.path] });
      queryClient.removeQueries({ queryKey: ["/api/machines/families"] });
      queryClient.removeQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/machines/family");
      }});
      queryClient.invalidateQueries({ queryKey: ["/api/media/import-info"] });
      if (data.optionsSkipped > 0) {
        toast({
          title: "Import complete with warnings",
          description: `${data.machines} machines, ${data.options} options imported. ${data.optionsSkipped} option rows skipped — their parent code didn't match any machine code.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Import successful", description: `${data.machines} machines and ${data.options} options imported.` });
      }
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImageFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type === 'image/png');
    if (!arr.length) {
      toast({ title: "Only PNG allowed", description: "Please select PNG image files only.", variant: "destructive" });
      return;
    }
    const oversized = arr.filter(f => f.size > 1 * 1024 * 1024);
    if (oversized.length) {
      toast({ title: "File too large", description: `${oversized.length} file(s) exceed 1 MB limit.`, variant: "destructive" });
      return;
    }
    setIsUploadingImages(true);
    try {
      const form = new FormData();
      arr.forEach(f => form.append("images", f));
      const res = await fetch("/api/media/images", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/media/images"] });
      toast({ title: "Upload complete", description: `${data.uploaded} image${data.uploaded !== 1 ? "s" : ""} uploaded.` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploadingImages(false);
    }
  };

  const onExcelDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverExcel(false);
    const file = e.dataTransfer.files[0];
    if (file) handleExcelFile(file);
  }, []);

  const onImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverImg(false);
    if (e.dataTransfer.files.length) handleImageFiles(e.dataTransfer.files);
  }, []);

  if (!isMaster) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Access denied. Master account required.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <PageHeader
          title="Media"
          subtitle="Manage the machine catalog and image library"
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* === Machine Excel Import Card === */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-green-600" />
                Machine Catalog (Excel)
              </CardTitle>
              <CardDescription>
                Import machines and options from an Excel file. All existing machines will be replaced.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Last import info */}
              {importInfo && (
                <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-muted/50 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span className="font-mono text-xs truncate max-w-[180px]" title={importInfo.filename}>{importInfo.filename}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <CalendarIcon className="w-3.5 h-3.5" />
                    <span className="text-xs">{new Date(importInfo.importedAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <PackageIcon className="w-3.5 h-3.5" />
                    <span className="text-xs">{importInfo.machines} machines · {importInfo.options} options</span>
                  </div>
                </div>
              )}

              {/* Drop zone */}
              <div
                data-testid="import-dropzone"
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragOverExcel ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragOverExcel(true); }}
                onDragLeave={() => setIsDragOverExcel(false)}
                onDrop={onExcelDrop}
                onClick={() => { setImportResult(null); excelInputRef.current?.click(); }}
              >
                {isImporting ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm">Importing...</p>
                  </div>
                ) : importResult ? (
                  <div className={`flex flex-col items-center gap-2 ${importResult.optionsSkipped ? "text-amber-600" : "text-green-600"}`}>
                    <CheckCircle2 className="h-8 w-8" />
                    <p className="font-semibold">Import complete!</p>
                    <p className="text-sm">{importResult.machines} machines · {importResult.options} options</p>
                    {importResult.optionsSkipped ? (
                      <p className="text-xs text-amber-600 text-center">
                        ⚠ {importResult.optionsSkipped} option rows skipped — parent codes didn't match any machine:<br/>
                        <span className="font-mono">{importResult.skippedCodes?.join(', ')}</span>
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground mt-1">Click to import another file</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="h-8 w-8" />
                    <p className="font-medium">Drop your Excel file here</p>
                    <p className="text-sm">or click to browse</p>
                    <p className="text-xs">.xlsx, .xls files supported</p>
                  </div>
                )}
              </div>
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls,.ods,.csv"
                className="hidden"
                data-testid="input-import-file"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleExcelFile(f); e.target.value = ""; }}
              />

              {/* Column reference */}
              <div className="text-xs bg-muted rounded p-3 font-mono space-y-0.5 text-muted-foreground">
                <div><span className="font-bold text-foreground">A</span>: M (machine) / O (option) · <span className="font-bold text-foreground">B</span>: Seq/Ref · <span className="font-bold text-foreground">C</span>: Machine code</div>
                <div><span className="font-bold text-foreground">D</span>: Macro type · <span className="font-bold text-foreground">E–J</span>: Titles (IT, EN, DE, FR, ES, PT)</div>
                <div><span className="font-bold text-foreground">K</span>: Price (€) · <span className="font-bold text-foreground">L–P</span>: Utilities (kW, Nl/min, m³/h, m³/h, install days)</div>
                <div><span className="font-bold text-foreground">Q–V</span>: Descriptions (IT, EN, DE, FR, ES, PT) · <span className="font-bold text-foreground">W</span>: Image filename</div>
              </div>
            </CardContent>
          </Card>

          {/* === Image Library Card === */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-blue-500" />
                Image Library
              </CardTitle>
              <CardDescription>
                Upload machine photos. Images are stored on the server and referenced by filename in the catalog.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Image drop zone */}
              <div
                data-testid="image-dropzone"
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragOverImg ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-muted-foreground/30 hover:border-blue-400/60"
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragOverImg(true); }}
                onDragLeave={() => setIsDragOverImg(false)}
                onDrop={onImageDrop}
                onClick={() => imageInputRef.current?.click()}
              >
                {isUploadingImages ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
                    <p className="text-sm">Uploading...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="h-7 w-7" />
                    <p className="font-medium text-sm">Drop PNG images here or click to browse</p>
                    <p className="text-xs">Only PNG supported · max 1 MB each</p>
                  </div>
                )}
              </div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,.png"
                multiple
                className="hidden"
                data-testid="input-image-files"
                onChange={(e) => { if (e.target.files?.length) handleImageFiles(e.target.files); e.target.value = ""; }}
              />

              {/* Image list */}
              {imagesLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : !images?.length ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  No images uploaded yet
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[480px] overflow-y-auto">
                  {images.map(img => (
                    <div key={img.filename} className="group relative border rounded-lg overflow-hidden bg-muted/30 hover:border-blue-400 transition-colors">
                      <div className="aspect-square flex items-center justify-center p-2 bg-white dark:bg-zinc-900">
                        <img
                          src={img.url}
                          alt={img.filename}
                          className="max-w-full max-h-full object-contain"
                          data-testid={`img-preview-${img.filename}`}
                        />
                      </div>
                      <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                        <span className="text-xs font-mono truncate flex-1" title={img.filename}>{img.filename}</span>
                        <button
                          data-testid={`button-delete-image-${img.filename}`}
                          className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors p-0.5 rounded opacity-0 group-hover:opacity-100"
                          onClick={() => { if (confirm(`Delete "${img.filename}"?`)) deleteImageMutation.mutate(img.filename); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="px-2 pb-1.5 text-[10px] text-muted-foreground">{formatBytes(img.size)}</div>
                    </div>
                  ))}
                </div>
              )}

              {images && images.length > 0 && (
                <p className="text-xs text-muted-foreground text-right">{images.length} image{images.length !== 1 ? "s" : ""}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
