import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Loader2, ArrowLeft, Zap, Wind, Clock, Box, Edit2, Trash2, Upload, Sparkles, Image, Youtube, FileText, FolderOpen, Plus, X, ExternalLink, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState, useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InlineConfirmButton } from "@/components/InlineConfirm";
import { getLocalizedField } from "@/lib/i18n/localize";
import { CatalogLanguageSwitcher, useCatalogLanguage } from "@/components/CatalogLanguageSwitcher";

function getMachineImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  return `/machine-images/${imageUrl.includes(".") ? imageUrl : `${imageUrl}.png`}`;
}

function getYoutubeEmbedId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default function MachineDetail() {
  const [, params] = useRoute("/machines/:id/detail");
  const id = params?.id ? Number(params.id) : 0;
  const { isMaster, features } = useAuth();
  const { toast } = useToast();
  const [catalogLang, setCatalogLang] = useCatalogLanguage();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);

  const [editingYoutube, setEditingYoutube] = useState(false);
  const [ytLinks, setYtLinks] = useState<string[]>([]);
  const [editingCatalogs, setEditingCatalogs] = useState(false);
  const [catLinks, setCatLinks] = useState<{ label: string; url: string }[]>([]);
  const [editingDrive, setEditingDrive] = useState(false);
  const [drvLinks, setDrvLinks] = useState<{ label: string; url: string }[]>([]);

  const { data: machine, isLoading } = useQuery<any>({
    queryKey: ["/api/machines", id],
    queryFn: () => fetch(`/api/machines/${id}`, { credentials: "include" }).then(r => r.json()),
    enabled: id > 0,
  });

  const clearCatalogCache = () => {
    queryClient.removeQueries({ queryKey: ["/api/machines/families"] });
    queryClient.removeQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === "string" && key.startsWith("/api/machines/family");
    }});
  };

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/machines/${id}`),
    onSuccess: () => {
      clearCatalogCache();
      toast({ title: "Machine deleted" });
      setLocation("/machines/catalog");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", `/api/machines/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machines", id] });
      clearCatalogCache();
      toast({ title: "Machine updated" });
      setOpenEdit(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`/api/machines/${id}/image`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      queryClient.invalidateQueries({ queryKey: ["/api/machines", id] });
      clearCatalogCache();
      toast({ title: "Image uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startEdit = () => {
    if (!machine) return;
    setEditForm({
      name: machine.name,
      description: machine.description,
      basePrice: machine.basePrice,
      electricalPower: machine.electricalPower || "",
      compressedAir: machine.compressedAir || "",
      exhaustedAir: machine.exhaustedAir || "",
      airIntroduced: machine.airIntroduced || "",
      installationDays: machine.installationDays || "",
    });
    setOpenEdit(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm) return;
    updateMutation.mutate({
      name: editForm.name,
      description: editForm.description,
      basePrice: editForm.basePrice,
      electricalPower: editForm.electricalPower || null,
      compressedAir: editForm.compressedAir || null,
      exhaustedAir: editForm.exhaustedAir || null,
      airIntroduced: editForm.airIntroduced || null,
      installationDays: editForm.installationDays || null,
    });
  };

  const isManual = machine?.source === "manual";
  const family = machine?.macroType || "Other";
  const displayName = machine ? getLocalizedField(machine.titles, machine.name, catalogLang) : "";
  const rawDescription = machine ? getLocalizedField(machine.descriptions, machine.description, catalogLang) : "";

  const descriptionParts = rawDescription ? rawDescription.split(/\[\[IMG:([^\]]+)\]\]/) : [];
  const hasDetailImages = descriptionParts.length > 1;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!machine) {
    return (
      <Layout>
        <div className="text-center py-16 text-muted-foreground">
          <p>Machine not found.</p>
          <Link href="/machines/catalog">
            <Button variant="outline" className="mt-4">Back to Catalog</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const specs = [
    { label: "Electrical Power", value: machine.electricalPower, unit: "kW", icon: Zap, color: "text-yellow-600" },
    { label: "Compressed Air", value: machine.compressedAir, unit: "Nl/min", icon: Wind, color: "text-blue-600" },
    { label: "Exhausted Air", value: machine.exhaustedAir, unit: "m³/h", icon: Wind, color: "text-gray-600" },
    { label: "Air Introduced", value: machine.airIntroduced, unit: "m³/h", icon: Wind, color: "text-teal-600" },
    { label: "Installation Days", value: machine.installationDays, unit: "days", icon: Clock, color: "text-purple-600" },
  ].filter(s => s.value != null && parseFloat(s.value) > 0);

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title={displayName}
          subtitle={
            <span className="flex items-center gap-2">
              {machine.machineCode && <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{machine.machineCode}</span>}
              <Link href={`/machines/family/${encodeURIComponent(family)}`}>
                <span className="text-primary hover:underline cursor-pointer">{family}</span>
              </Link>
              {isManual && (
                <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                  <Sparkles className="w-3 h-3 mr-1" /> Special
                </Badge>
              )}
            </span>
          }
          actions={
            <div className="flex gap-2">
              <Link href={`/machines/family/${encodeURIComponent(family)}`}>
                <Button variant="outline" data-testid="button-back-family">
                  <ArrowLeft className="mr-2 h-4 w-4" /> {family}
                </Button>
              </Link>
              {isManual && (isMaster || features?.canManageSpecialMachines) && (
                <>
                  <Button variant="outline" onClick={startEdit} data-testid="button-edit-machine">
                    <Edit2 className="mr-2 h-4 w-4" /> Edit
                  </Button>
                  <InlineConfirmButton
                    title={`Delete "${machine.name}"?`}
                    description="This cannot be undone."
                    confirmLabel="Delete"
                    onConfirm={() => deleteMutation.mutate()}
                    isPending={deleteMutation.isPending}
                    buttonContent={<><Trash2 className="mr-2 h-4 w-4" /> Delete</>}
                    buttonVariant="destructive"
                    buttonSize="default"
                    data-testid="button-delete-machine"
                  />
                </>
              )}
            </div>
          }
        />

        <CatalogLanguageSwitcher value={catalogLang} onChange={setCatalogLang} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <div className="aspect-square bg-muted/20 flex items-center justify-center relative">
                {getMachineImageUrl(machine.imageUrl) ? (
                  <img
                    src={getMachineImageUrl(machine.imageUrl)!}
                    alt={machine.name}
                    className="w-full h-full object-contain p-4"
                    data-testid="img-machine-detail"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                    <Box className="w-16 h-16" />
                    <span className="text-xs">No image</span>
                  </div>
                )}
                {isManual && (isMaster || features?.canManageSpecialMachines) && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute bottom-3 right-3 bg-primary text-primary-foreground rounded-full p-2 shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                    data-testid="button-upload-machine-image"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>
            </div>

            <div className="rounded-xl border bg-card shadow-sm p-5">
              <div className="text-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Base Price</p>
                <p className="text-3xl font-bold text-primary mt-1" data-testid="text-machine-price">
                  €{parseFloat(machine.basePrice).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="rounded-xl border bg-card shadow-sm p-5" data-testid="card-youtube">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Youtube className="w-5 h-5 text-red-600" />
                  Video YouTube
                </h3>
                {isMaster && !editingYoutube && (
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setYtLinks(machine.youtubeLinks || []); setEditingYoutube(true); }} data-testid="btn-edit-youtube">
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              {editingYoutube ? (
                <div className="space-y-2">
                  {ytLinks.map((link, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={link}
                        onChange={e => { const n = [...ytLinks]; n[i] = e.target.value; setYtLinks(n); }}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="text-xs h-8"
                        data-testid={`input-youtube-${i}`}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setYtLinks(ytLinks.filter((_, j) => j !== i))}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => setYtLinks([...ytLinks, ""])} data-testid="btn-add-youtube">
                    <Plus className="w-3 h-3 mr-1" /> Aggiungi video
                  </Button>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="h-7 text-xs" disabled={updateMutation.isPending} onClick={() => {
                      const valid = ytLinks.filter(l => l.trim());
                      updateMutation.mutate({ youtubeLinks: valid.length ? valid : null }, { onSuccess: () => setEditingYoutube(false) });
                    }} data-testid="btn-save-youtube">
                      <Save className="w-3 h-3 mr-1" /> Salva
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingYoutube(false)}>Annulla</Button>
                  </div>
                </div>
              ) : (
                <>
                  {machine.youtubeLinks && machine.youtubeLinks.length > 0 ? (
                    <div className="space-y-3">
                      {machine.youtubeLinks.map((url: string, i: number) => {
                        const embedId = getYoutubeEmbedId(url);
                        return embedId ? (
                          <div key={i} className="aspect-video rounded-lg overflow-hidden border" data-testid={`youtube-embed-${i}`}>
                            <iframe
                              src={`https://www.youtube.com/embed/${embedId}`}
                              title={`Video ${i + 1}`}
                              className="w-full h-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        ) : (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline" data-testid={`youtube-link-${i}`}>
                            <ExternalLink className="w-3.5 h-3.5" /> {url}
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 text-center py-4">Nessun video collegato</p>
                  )}
                </>
              )}
            </div>

            <div className="rounded-xl border bg-card shadow-sm p-5" data-testid="card-catalogs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Cataloghi
                </h3>
                {isMaster && !editingCatalogs && (
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setCatLinks(machine.catalogLinks || []); setEditingCatalogs(true); }} data-testid="btn-edit-catalogs">
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              {editingCatalogs ? (
                <div className="space-y-2">
                  {catLinks.map((link, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={link.label}
                        onChange={e => { const n = [...catLinks]; n[i] = { ...n[i], label: e.target.value }; setCatLinks(n); }}
                        placeholder="Nome catalogo"
                        className="text-xs h-8 w-1/3"
                        data-testid={`input-catalog-label-${i}`}
                      />
                      <Input
                        value={link.url}
                        onChange={e => { const n = [...catLinks]; n[i] = { ...n[i], url: e.target.value }; setCatLinks(n); }}
                        placeholder="https://..."
                        className="text-xs h-8 flex-1"
                        data-testid={`input-catalog-url-${i}`}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCatLinks(catLinks.filter((_, j) => j !== i))}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => setCatLinks([...catLinks, { label: "", url: "" }])} data-testid="btn-add-catalog">
                    <Plus className="w-3 h-3 mr-1" /> Aggiungi catalogo
                  </Button>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="h-7 text-xs" disabled={updateMutation.isPending} onClick={() => {
                      const valid = catLinks.filter(l => l.url.trim());
                      updateMutation.mutate({ catalogLinks: valid.length ? valid : null }, { onSuccess: () => setEditingCatalogs(false) });
                    }} data-testid="btn-save-catalogs">
                      <Save className="w-3 h-3 mr-1" /> Salva
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingCatalogs(false)}>Annulla</Button>
                  </div>
                </div>
              ) : (
                <>
                  {machine.catalogLinks && machine.catalogLinks.length > 0 ? (
                    <div className="space-y-2">
                      {machine.catalogLinks.map((c: { label: string; url: string }, i: number) => (
                        <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group" data-testid={`catalog-link-${i}`}>
                          <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                          <span className="text-sm font-medium flex-1 truncate group-hover:text-primary">{c.label || c.url}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 text-center py-4">Nessun catalogo collegato</p>
                  )}
                </>
              )}
            </div>

            <div className="rounded-xl border bg-card shadow-sm p-5" data-testid="card-drive">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-green-600" />
                  Foto / Video Drive
                </h3>
                {isMaster && !editingDrive && (
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setDrvLinks(machine.driveLinks || []); setEditingDrive(true); }} data-testid="btn-edit-drive">
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              {editingDrive ? (
                <div className="space-y-2">
                  {drvLinks.map((link, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={link.label}
                        onChange={e => { const n = [...drvLinks]; n[i] = { ...n[i], label: e.target.value }; setDrvLinks(n); }}
                        placeholder="Nome cartella"
                        className="text-xs h-8 w-1/3"
                        data-testid={`input-drive-label-${i}`}
                      />
                      <Input
                        value={link.url}
                        onChange={e => { const n = [...drvLinks]; n[i] = { ...n[i], url: e.target.value }; setDrvLinks(n); }}
                        placeholder="https://drive.google.com/..."
                        className="text-xs h-8 flex-1"
                        data-testid={`input-drive-url-${i}`}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setDrvLinks(drvLinks.filter((_, j) => j !== i))}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => setDrvLinks([...drvLinks, { label: "", url: "" }])} data-testid="btn-add-drive">
                    <Plus className="w-3 h-3 mr-1" /> Aggiungi link Drive
                  </Button>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="h-7 text-xs" disabled={updateMutation.isPending} onClick={() => {
                      const valid = drvLinks.filter(l => l.url.trim());
                      updateMutation.mutate({ driveLinks: valid.length ? valid : null }, { onSuccess: () => setEditingDrive(false) });
                    }} data-testid="btn-save-drive">
                      <Save className="w-3 h-3 mr-1" /> Salva
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingDrive(false)}>Annulla</Button>
                  </div>
                </div>
              ) : (
                <>
                  {machine.driveLinks && machine.driveLinks.length > 0 ? (
                    <div className="space-y-2">
                      {machine.driveLinks.map((d: { label: string; url: string }, i: number) => (
                        <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group" data-testid={`drive-link-${i}`}>
                          <FolderOpen className="w-4 h-4 text-green-500 shrink-0" />
                          <span className="text-sm font-medium flex-1 truncate group-hover:text-primary">{d.label || d.url}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/60 text-center py-4">Nessun link Drive collegato</p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {rawDescription && (
              <div className="rounded-xl border bg-card shadow-sm p-5">
                <h3 className="font-semibold mb-2">Description</h3>
                <div className="text-sm text-muted-foreground" data-testid="text-machine-description">
                  {hasDetailImages ? (
                    descriptionParts.map((part, i) => {
                      if (i % 2 === 0) {
                        return part ? <p key={i} className="whitespace-pre-wrap">{part}</p> : null;
                      }
                      return (
                        <div key={i} className="my-3">
                          <img
                            src={`/machine-images/${part}`}
                            alt={`Detail ${Math.ceil(i / 2)}`}
                            className="max-w-full rounded-lg border shadow-sm"
                            data-testid={`img-detail-${Math.ceil(i / 2)}`}
                          />
                        </div>
                      );
                    })
                  ) : (
                    <p className="whitespace-pre-wrap">{rawDescription}</p>
                  )}
                </div>
              </div>
            )}

            {specs.length > 0 && (
              <div className="rounded-xl border bg-card shadow-sm p-5">
                <h3 className="font-semibold mb-3">Technical Specifications</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {specs.map(s => (
                    <div key={s.label} className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30" data-testid={`spec-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>
                      <s.icon className={`w-5 h-5 ${s.color} shrink-0`} />
                      <div>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className="font-semibold text-sm">{parseFloat(s.value).toLocaleString()} {s.unit}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {machine.options && machine.options.length > 0 && (
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="p-5 border-b">
                  <h3 className="font-semibold">Options ({machine.options.length})</h3>
                </div>
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Price Modifier</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {machine.options.map((opt: any) => (
                      <TableRow key={opt.id} data-testid={`row-option-${opt.id}`}>
                        <TableCell className="font-medium">{getLocalizedField(opt.titles, opt.name, catalogLang)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{getLocalizedField(opt.descriptions, opt.description, catalogLang) || "—"}</TableCell>
                        <TableCell className="text-right font-mono">€{parseFloat(opt.priceModifier).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {openEdit && editForm && (
          <div className="rounded-xl border bg-card shadow-sm p-6" data-testid="edit-machine-form">
            <h3 className="font-semibold mb-4">Edit Machine</h3>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" data-testid="input-edit-name" value={editForm.name} onChange={e => setEditForm((f: any) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-desc">Description</Label>
                <Textarea id="edit-desc" data-testid="input-edit-description" value={editForm.description} onChange={e => setEditForm((f: any) => ({ ...f, description: e.target.value }))} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="edit-price">Base Price (€)</Label>
                  <Input id="edit-price" data-testid="input-edit-price" type="number" step="0.01" value={editForm.basePrice} onChange={e => setEditForm((f: any) => ({ ...f, basePrice: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-power">Electrical Power (kW)</Label>
                  <Input id="edit-power" type="number" step="0.01" value={editForm.electricalPower} onChange={e => setEditForm((f: any) => ({ ...f, electricalPower: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-cair">Compressed Air (Nl/min)</Label>
                  <Input id="edit-cair" type="number" step="0.01" value={editForm.compressedAir} onChange={e => setEditForm((f: any) => ({ ...f, compressedAir: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-eair">Exhausted Air (m³/h)</Label>
                  <Input id="edit-eair" type="number" step="0.01" value={editForm.exhaustedAir} onChange={e => setEditForm((f: any) => ({ ...f, exhaustedAir: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-aiair">Air Introduced (m³/h)</Label>
                  <Input id="edit-aiair" type="number" step="0.01" value={editForm.airIntroduced} onChange={e => setEditForm((f: any) => ({ ...f, airIntroduced: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-days">Installation Days</Label>
                  <Input id="edit-days" type="number" step="0.5" value={editForm.installationDays} onChange={e => setEditForm((f: any) => ({ ...f, installationDays: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-edit">
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Save Changes
                </Button>
                <Button type="button" variant="outline" onClick={() => setOpenEdit(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Layout>
  );
}
