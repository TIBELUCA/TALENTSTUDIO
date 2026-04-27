import { Layout } from "@/components/Layout";
import { PdfViewer } from "@/components/PdfViewer";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import {
  Loader2,
  FolderOpen,
  AlertCircle,
  HardDrive,
  AlertTriangle,
  Settings as SettingsIcon,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  File as FileIcon,
  ExternalLink,
  Download,
  Search,
  X,
} from "lucide-react";

interface DriveSettings {
  rootFolderId: string | null;
  rootFolderName: string | null;
  accountEmail: string | null;
  connected: boolean;
  needsReauth?: boolean;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink: string | null;
  iconLink: string | null;
  webViewLink: string | null;
  size: number | null;
  modifiedTime: string | null;
}

type Crumb = { id: string; name: string; driveId: string };

function isImage(mime: string) {
  return mime.startsWith("image/");
}
function isVideo(mime: string) {
  return mime.startsWith("video/");
}
function isAudio(mime: string) {
  return mime.startsWith("audio/");
}
function isPdf(mime: string) {
  return mime === "application/pdf";
}

function FileTypeIcon({ mime }: { mime: string }) {
  if (isImage(mime)) return <FileImage className="w-5 h-5 text-purple-600" />;
  if (isVideo(mime)) return <FileVideo className="w-5 h-5 text-rose-600" />;
  if (isAudio(mime)) return <FileAudio className="w-5 h-5 text-emerald-600" />;
  if (isPdf(mime)) return <FileText className="w-5 h-5 text-red-600" />;
  return <FileIcon className="w-5 h-5 text-slate-500" />;
}

function formatBytes(n: number | null) {
  if (n == null) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export default function DriveArchive() {
  const { isMaster, user } = useAuth();
  const isInternalUser = !!user && user.type !== "dealer";
  const [path, setPath] = useState<Crumb[]>([]);
  const [preview, setPreview] = useState<DriveFile | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: settings, isLoading: settingsLoading } = useQuery<DriveSettings | null>({
    queryKey: ["/api/drive/settings"],
  });

  const sharedDrivesEnabled = !!settings?.connected && !settings?.needsReauth;
  const current = path[path.length - 1] || null;

  const { data: sharedDrivesData, isLoading: drivesLoading, error: drivesError } = useQuery<{
    drives: { id: string; name: string }[];
  }>({
    queryKey: ["/api/drive/shared-drives"],
    enabled: sharedDrivesEnabled && path.length === 0,
  });
  const sharedDrives = sharedDrivesData?.drives ?? [];

  const { data: foldersData, isLoading: foldersLoading, error: foldersError } = useQuery<{
    folders: { id: string; name: string }[];
  }>({
    queryKey: ["/api/drive/folders", current?.id, current?.driveId],
    enabled: sharedDrivesEnabled && !!current,
    queryFn: async () => {
      const params = new URLSearchParams({ parentId: current!.id, driveId: current!.driveId });
      const res = await fetch(`/api/drive/folders?${params}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || "Errore caricamento cartelle");
      }
      return res.json();
    },
  });
  const folders = foldersData?.folders ?? [];

  const { data: filesData, isLoading: filesLoading, error: filesError } = useQuery<{ files: DriveFile[] }>({
    queryKey: ["/api/drive/files", current?.id, current?.driveId],
    enabled: sharedDrivesEnabled && !!current,
    queryFn: async () => {
      const params = new URLSearchParams({ parentId: current!.id, driveId: current!.driveId });
      const res = await fetch(`/api/drive/files?${params}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || "Errore caricamento file");
      }
      return res.json();
    },
  });
  const files = filesData?.files ?? [];

  const searchActive = searchQuery.length >= 2;
  const { data: searchData, isLoading: searchLoading, error: searchError } = useQuery<{
    folders: { id: string; name: string; driveId: string | null }[];
    files: DriveFile[];
  }>({
    queryKey: ["/api/drive/search", searchQuery, current?.driveId ?? null],
    enabled: sharedDrivesEnabled && searchActive,
    queryFn: async () => {
      const params = new URLSearchParams({ q: searchQuery });
      if (current?.driveId) params.set("driveId", current.driveId);
      const res = await fetch(`/api/drive/search?${params}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error(
          res.ok
            ? "Risposta non valida dal server. Ricarica la pagina e riprova."
            : `Errore ricerca (${res.status}). Ricarica la pagina e riprova.`,
        );
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Errore ricerca");
      return data;
    },
  });
  const searchFolders = searchData?.folders ?? [];
  const searchFiles = searchData?.files ?? [];

  if (!isInternalUser) {
    return (
      <Layout>
        <div className="max-w-5xl">
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Accesso riservato agli utenti interni.
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const openFile = (f: DriveFile) => {
    if (isImage(f.mimeType) || isVideo(f.mimeType) || isAudio(f.mimeType) || isPdf(f.mimeType)) {
      setPreview(f);
    } else if (f.webViewLink) {
      window.open(f.webViewLink, "_blank", "noopener,noreferrer");
    }
  };

  const previewSrc = preview ? `/api/drive/files/${preview.id}/content` : "";

  return (
    <Layout>
      <div className="max-w-5xl space-y-6">
        <PageHeader
          title="Drive Condivisi"
          subtitle="Esplora cartelle, foto, video e documenti dei Drive Condivisi collegati."
        />

        <div className="text-sm">
          <Link href="/drive-settings">
            <Button variant="outline" size="sm" data-testid="link-drive-settings">
              <SettingsIcon className="w-3.5 h-3.5 mr-1.5" /> Impostazioni Drive
            </Button>
          </Link>
        </div>

        {settingsLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" /> Caricamento…
            </CardContent>
          </Card>
        ) : !settings?.connected ? (
          <Card data-testid="card-not-connected">
            <CardContent className="py-10 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 mx-auto text-amber-500" />
              <div className="text-sm text-muted-foreground">
                Nessun account Google collegato. Vai in <strong>Impostazioni Drive</strong> per collegarne uno.
              </div>
              <Link href="/drive-settings">
                <Button data-testid="button-go-settings">
                  <SettingsIcon className="w-4 h-4 mr-2" /> Apri Impostazioni Drive
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : settings.needsReauth ? (
          <Card data-testid="card-needs-reauth">
            <CardContent className="py-10 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 mx-auto text-amber-500" />
              <div className="text-sm text-muted-foreground">
                I permessi Google sono cambiati: per vedere i Drive Condivisi devi riconnettere l'account dalla pagina
                Impostazioni Drive.
              </div>
              <Link href="/drive-settings">
                <Button data-testid="button-go-settings">
                  <SettingsIcon className="w-4 h-4 mr-2" /> Apri Impostazioni Drive
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card data-testid="card-shared-drives">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="w-4 h-4" /> Esplora
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  type="search"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder={
                    current
                      ? `Cerca in "${current.name}" (cartelle e file)…`
                      : "Cerca in tutti i Drive Condivisi (cartelle e file)…"
                  }
                  className="pl-9 pr-9"
                  data-testid="input-drive-search"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput("");
                      setSearchQuery("");
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover-elevate active-elevate-2 text-muted-foreground"
                    data-testid="button-clear-search"
                    aria-label="Cancella ricerca"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Breadcrumb */}
              <div className="flex items-center gap-1 text-sm flex-wrap" data-testid="breadcrumb-drive">
                <button
                  type="button"
                  onClick={() => setPath([])}
                  className="px-2 py-1 rounded hover-elevate active-elevate-2 text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  data-testid="breadcrumb-root"
                >
                  <HardDrive className="w-3.5 h-3.5" /> Drive Condivisi
                </button>
                {path.map((c, i) => (
                  <span key={c.id} className="inline-flex items-center gap-1">
                    <span className="text-muted-foreground">/</span>
                    <button
                      type="button"
                      onClick={() => setPath(path.slice(0, i + 1))}
                      className="px-2 py-1 rounded hover-elevate active-elevate-2 inline-flex items-center gap-1"
                      data-testid={`breadcrumb-${i}`}
                    >
                      <FolderOpen className="w-3.5 h-3.5" /> {c.name}
                    </button>
                  </span>
                ))}
                {path.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2"
                    onClick={() => setPath(path.slice(0, -1))}
                    data-testid="button-go-up"
                  >
                    Cartella superiore
                  </Button>
                )}
              </div>

              {/* Listing */}
              {searchActive ? (
                searchError ? (
                  <div className="text-sm text-red-600 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{(searchError as Error)?.message || "Errore ricerca"}</span>
                  </div>
                ) : searchLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Ricerca in corso…
                  </div>
                ) : searchFolders.length === 0 && searchFiles.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-6 text-center" data-testid="text-search-empty">
                    Nessun risultato per "{searchQuery}".
                  </div>
                ) : (
                  <div className="space-y-4" data-testid="search-results">
                    <div className="text-xs text-muted-foreground">
                      {searchFolders.length + searchFiles.length} risultati per "{searchQuery}"
                      {current ? ` in "${current.name}"` : " in tutti i Drive"}
                    </div>
                    {searchFolders.length > 0 && (
                      <div>
                        <div className="text-xs uppercase text-muted-foreground mb-1.5">Cartelle</div>
                        <div className="flex flex-col rounded-md border bg-card divide-y" data-testid="grid-search-folders">
                          {searchFolders.map(f => (
                            <button
                              type="button"
                              key={f.id}
                              onClick={() => {
                                if (f.driveId) {
                                  setPath([{ id: f.id, name: f.name, driveId: f.driveId }]);
                                  setSearchInput("");
                                  setSearchQuery("");
                                }
                              }}
                              disabled={!f.driveId}
                              className="flex items-center gap-3 px-3 py-2.5 hover-elevate active-elevate-2 text-left text-sm disabled:opacity-50"
                              data-testid={`button-search-folder-${f.id}`}
                            >
                              <FolderOpen className="w-4 h-4 text-amber-600 shrink-0" />
                              <span className="break-words flex-1 min-w-0">{f.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {searchFiles.length > 0 && (
                      <div>
                        <div className="text-xs uppercase text-muted-foreground mb-1.5">File</div>
                        <div className="flex flex-col rounded-md border bg-card divide-y" data-testid="grid-search-files">
                          {searchFiles.map(f => {
                            const isMedia = isImage(f.mimeType) || isVideo(f.mimeType);
                            return (
                              <button
                                type="button"
                                key={f.id}
                                onClick={() => openFile(f)}
                                className="flex items-center gap-3 px-3 py-2 hover-elevate active-elevate-2 text-left text-sm"
                                data-testid={`button-search-file-${f.id}`}
                              >
                                <div className="w-24 h-24 shrink-0 bg-muted/40 rounded overflow-hidden flex items-center justify-center relative">
                                  {isMedia && f.thumbnailLink ? (
                                    <img
                                      src={f.thumbnailLink}
                                      alt={f.name}
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                      onError={e => {
                                        (e.currentTarget as HTMLImageElement).style.display = "none";
                                      }}
                                    />
                                  ) : (
                                    <FileTypeIcon mime={f.mimeType} />
                                  )}
                                  {isVideo(f.mimeType) && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                      <FileVideo className="w-4 h-4 text-white drop-shadow" />
                                    </div>
                                  )}
                                </div>
                                <span className="break-words flex-1 min-w-0">{f.name}</span>
                                {f.size != null && (
                                  <span className="text-xs text-muted-foreground shrink-0">{formatBytes(f.size)}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              ) : path.length === 0 ? (
                drivesError ? (
                  <div className="text-sm text-red-600 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{(drivesError as Error)?.message || "Errore caricamento Drive Condivisi"}</span>
                  </div>
                ) : drivesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Caricamento Drive Condivisi…
                  </div>
                ) : sharedDrives.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-6 text-center">
                    Nessun Drive Condiviso visibile per questo account.
                  </div>
                ) : (
                  <div className="flex flex-col rounded-md border bg-card divide-y" data-testid="grid-shared-drives">
                    {sharedDrives.map(d => (
                      <button
                        type="button"
                        key={d.id}
                        onClick={() => setPath([{ id: d.id, name: d.name, driveId: d.id }])}
                        className="flex items-center gap-3 px-3 py-2.5 hover-elevate active-elevate-2 text-left text-sm"
                        data-testid={`button-open-drive-${d.id}`}
                      >
                        <HardDrive className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="break-words flex-1 min-w-0">{d.name}</span>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  {/* Folders */}
                  {foldersError ? (
                    <div className="text-sm text-red-600 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{(foldersError as Error)?.message || "Errore caricamento cartelle"}</span>
                    </div>
                  ) : foldersLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                      <Loader2 className="w-4 h-4 animate-spin" /> Caricamento cartelle…
                    </div>
                  ) : folders.length > 0 ? (
                    <div>
                      <div className="text-xs uppercase text-muted-foreground mb-1.5">Cartelle</div>
                      <div className="flex flex-col rounded-md border bg-card divide-y" data-testid="grid-folders">
                        {folders.map(f => (
                          <button
                            type="button"
                            key={f.id}
                            onClick={() => setPath([...path, { id: f.id, name: f.name, driveId: current!.driveId }])}
                            className="flex items-center gap-3 px-3 py-2.5 hover-elevate active-elevate-2 text-left text-sm"
                            data-testid={`button-open-folder-${f.id}`}
                          >
                            <FolderOpen className="w-4 h-4 text-amber-600 shrink-0" />
                            <span className="break-words flex-1 min-w-0">{f.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Files */}
                  {filesError ? (
                    <div className="text-sm text-red-600 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{(filesError as Error)?.message || "Errore caricamento file"}</span>
                    </div>
                  ) : filesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                      <Loader2 className="w-4 h-4 animate-spin" /> Caricamento file…
                    </div>
                  ) : files.length > 0 ? (
                    <div>
                      <div className="text-xs uppercase text-muted-foreground mb-1.5">File</div>
                      <div
                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
                        data-testid="grid-files"
                      >
                        {files.map(f => {
                          const isMedia = isImage(f.mimeType) || isVideo(f.mimeType);
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => openFile(f)}
                              className="group flex flex-col gap-1.5 p-2 rounded-md border bg-card hover-elevate active-elevate-2 text-left"
                              data-testid={`button-open-file-${f.id}`}
                              title={f.name}
                            >
                              <div className="aspect-square w-full bg-muted/40 rounded overflow-hidden flex items-center justify-center relative">
                                {isMedia && f.thumbnailLink ? (
                                  <img
                                    src={f.thumbnailLink}
                                    alt={f.name}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                    onError={e => {
                                      (e.currentTarget as HTMLImageElement).style.display = "none";
                                    }}
                                  />
                                ) : (
                                  <FileTypeIcon mime={f.mimeType} />
                                )}
                                {isVideo(f.mimeType) && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <FileVideo className="w-7 h-7 text-white drop-shadow" />
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 min-w-0">
                                <FileTypeIcon mime={f.mimeType} />
                                <span className="text-xs truncate flex-1" data-testid={`text-filename-${f.id}`}>
                                  {f.name}
                                </span>
                              </div>
                              {f.size != null && (
                                <span className="text-[10px] text-muted-foreground">{formatBytes(f.size)}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : folders.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-6 text-center">Cartella vuota.</div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Preview lightbox */}
      <Dialog open={!!preview} onOpenChange={open => !open && setPreview(null)}>
        <DialogContent className="max-w-4xl" data-testid="dialog-preview">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              {preview && <FileTypeIcon mime={preview.mimeType} />}
              <span className="truncate" data-testid="text-preview-name">{preview?.name}</span>
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="bg-black/90 rounded-md overflow-hidden flex items-center justify-center min-h-[300px] max-h-[70vh]">
                {isImage(preview.mimeType) && (
                  <img
                    src={previewSrc}
                    alt={preview.name}
                    className="max-w-full max-h-[70vh] object-contain"
                    data-testid="img-preview"
                  />
                )}
                {isVideo(preview.mimeType) && (
                  <video
                    src={previewSrc}
                    controls
                    autoPlay
                    className="max-w-full max-h-[70vh]"
                    data-testid="video-preview"
                  />
                )}
                {isAudio(preview.mimeType) && (
                  <audio src={previewSrc} controls autoPlay className="w-full" data-testid="audio-preview" />
                )}
                {isPdf(preview.mimeType) && (
                  <PdfViewer
                    src={previewSrc}
                    title={preview.name}
                    testId="iframe-preview"
                    height="70vh"
                    bordered={false}
                    resizable={false}
                    className="w-full bg-white"
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
                <span>{preview.mimeType}</span>
                {preview.size != null && <span>· {formatBytes(preview.size)}</span>}
                <span className="flex-1" />
                <a href={previewSrc} download={preview.name}>
                  <Button variant="outline" size="sm" data-testid="button-download">
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Scarica
                  </Button>
                </a>
                {preview.webViewLink && (
                  <a href={preview.webViewLink} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" data-testid="button-open-drive">
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Apri in Drive
                    </Button>
                  </a>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
