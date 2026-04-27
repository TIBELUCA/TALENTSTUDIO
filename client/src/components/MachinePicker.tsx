import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { Search, X, Plus, Trash2, Upload, Image, Images, Loader2, Package, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomOption } from "@/types/offer";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { getLocalizedField } from "@/lib/i18n/localize";

interface MachineOption {
  id: number;
  name: string;
  priceModifier: string | number;
  [key: string]: any;
}

interface Machine {
  id: number;
  name: string;
  machineCode: string | null;
  macroType: string | null;
  basePrice: string | number;
  titles?: Record<string, string> | null;
  descriptions?: Record<string, string> | null;
  options: MachineOption[];
  [key: string]: any;
}

export interface CustomMachineData {
  name: string;
  description: string;
  basePrice: number;
  customOptions: CustomOption[];
  mainImage?: string;
  detailImages?: string[];
  language?: string;
  alreadySaved?: boolean;
}

interface MachinePickerProps {
  machines: Machine[] | undefined;
  value: string;
  onChange: (id: string) => void;
  onAddCustomMachine?: (data: CustomMachineData) => void;
  contentLanguage?: string;
}

function groupByFamily(machines: Machine[]) {
  const map = new Map<string, Machine[]>();
  for (const m of machines) {
    const key = m.macroType || "Other";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  const sorted = Array.from(map.entries()).sort(([a], [b]) => {
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return a.localeCompare(b);
  });
  return sorted;
}

export function MachinePicker({ machines, value, onChange, onAddCustomMachine, contentLanguage }: MachinePickerProps) {
  const { language } = useLanguage();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customOptions, setCustomOptions] = useState<CustomOption[]>([]);
  const [customMainImage, setCustomMainImage] = useState<string>("");
  const [customDetailImages, setCustomDetailImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [savedExpanded, setSavedExpanded] = useState(false);
  const mainImageRef = useRef<HTMLInputElement>(null);
  const detailImageRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: savedCustomMachines = [] } = useQuery<any[]>({
    queryKey: ["/api/custom-machines"],
    enabled: !!onAddCustomMachine,
  });

  const uploadPhoto = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/offers/machine-photo", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      return data.filename;
    } catch {
      toast({ title: "Errore upload", description: "Impossibile caricare l'immagine", variant: "destructive" });
      return null;
    }
  };

  const allMachines = machines ?? [];
  const families = groupByFamily(allMachines);

  const searchResults = query.trim().length >= 1
    ? allMachines.filter((m) => {
        const q = query.toLowerCase();
        const localName = getLocalizedField(m.titles, m.name, language).toLowerCase();
        return (
          (m.machineCode && m.machineCode.toLowerCase().includes(q)) ||
          m.name.toLowerCase().includes(q) ||
          localName.includes(q)
        );
      }).slice(0, 20)
    : [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectMachine(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Search machine</Label>
        <div ref={containerRef} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            data-testid="input-machine-search"
            className="pl-9 pr-9"
            placeholder="Search by code or name..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
          {query && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => { setQuery(""); setOpen(false); }}
              type="button"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {open && searchResults.length > 0 && (
            <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
              {searchResults.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  data-testid={`search-result-machine-${m.id}`}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2",
                    value === m.id.toString() && "bg-accent/50"
                  )}
                  onClick={() => selectMachine(m.id.toString())}
                >
                  <span className="font-mono font-semibold text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">
                    {m.machineCode || "—"}
                  </span>
                  <span className="truncate text-muted-foreground">{getLocalizedField(m.titles, m.name, language)}</span>
                </button>
              ))}
            </div>
          )}
          {open && query.trim().length >= 1 && searchResults.length === 0 && (
            <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-sm px-3 py-2 text-sm text-muted-foreground">
              No machines found.
            </div>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Browse by family</Label>
        <div className="border rounded-lg divide-y overflow-hidden">
          {families.map(([family, fmachines]) => {
            const isExpanded = expandedFamily === family;
            const selectedInFamily = fmachines.find((m) => m.id.toString() === value);
            return (
              <div key={family}>
                <button
                  type="button"
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50 transition-colors",
                    isExpanded && "bg-muted/40",
                    selectedInFamily && "bg-primary/5"
                  )}
                  onClick={() => setExpandedFamily(isExpanded ? null : family)}
                  data-testid={`accordion-family-${family}`}
                >
                  <span className="text-xs font-bold uppercase tracking-wide text-[#354975]">{family}</span>
                  <div className="flex items-center gap-2">
                    {selectedInFamily && (
                      <span className="text-[10px] font-mono text-primary font-semibold">
                        {selectedInFamily.machineCode || selectedInFamily.name}
                      </span>
                    )}
                    <span className="text-muted-foreground text-[10px]">({fmachines.length})</span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-3 py-2 bg-muted/20 flex flex-wrap gap-1.5">
                    {fmachines.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={cn(
                          "px-2 py-1 rounded font-mono border-2 transition-colors font-bold text-[12px]",
                          m.id.toString() === value
                            ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                            : "border-border bg-[#12ff001a] text-[#631212] hover:bg-primary/10 hover:border-primary/30"
                        )}
                        onClick={() => selectMachine(m.id.toString())}
                        data-testid={`chip-machine-${m.id}`}
                      >
                        {m.machineCode || m.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {onAddCustomMachine && (
        <div className="border-t pt-3 space-y-3">
          {!customMode ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex-1 flex items-center justify-center gap-2 h-9 rounded-md border-2 border-dashed text-sm hover:text-foreground hover:border-primary/30 transition-colors font-bold text-[#000000]"
                  onClick={() => setSavedExpanded(!savedExpanded)}
                  data-testid="btn-toggle-saved-machines"
                >
                  <Package className="w-4 h-4" />
                  Salvate {savedCustomMachines.length > 0 && `(${savedCustomMachines.length})`}
                  {savedExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <Button
                  variant="outline"
                  className="flex-1 border-dashed border-2 font-semibold h-9"
                  onClick={() => { setCustomMode(true); onChange(""); }}
                  data-testid="btn-new-custom-machine"
                >
                  <Plus className="w-4 h-4 mr-1" /> Nuova
                </Button>
              </div>
              {savedExpanded && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {savedCustomMachines.length === 0 ? (
                    <div className="text-center py-4 text-xs text-muted-foreground border rounded-md bg-muted/20">
                      <Package className="w-5 h-5 mx-auto mb-1 opacity-40" />
                      <p>Nessuna macchina salvata</p>
                      <p className="text-[10px] mt-0.5">Vai a Catalogo → Personalizzate per crearne</p>
                    </div>
                  ) : (
                    savedCustomMachines.map((sm: any) => {
                      const lang = contentLanguage || "it";
                      const resolvedName = getLocalizedField(sm.titles, sm.name, lang);
                      const resolvedDesc = getLocalizedField(sm.descriptions, sm.description || "", lang);
                      return (
                      <button
                        key={sm.id}
                        type="button"
                        className="w-full flex items-center gap-3 p-2 rounded-md border hover:bg-primary/5 hover:border-primary/30 transition-colors text-left"
                        onClick={() => {
                          let desc = resolvedDesc;
                          if (sm.detailImages && sm.detailImages.length > 0) {
                            sm.detailImages.forEach((img: string, idx: number) => {
                              desc = desc.replace(`[[IMG${idx + 1}]]`, `[[IMG:${img}]]`);
                            });
                          }
                          onAddCustomMachine!({
                            name: resolvedName,
                            description: desc,
                            basePrice: parseFloat(sm.basePrice) || 0,
                            customOptions: (sm.options || []).map((o: any) => ({
                              name: o.name,
                              price: parseFloat(o.price) || 0,
                              quantity: o.quantity || 1,
                            })),
                            mainImage: sm.imageUrl || undefined,
                            detailImages: sm.detailImages || [],
                            language: lang,
                            alreadySaved: true,
                          });
                        }}
                        data-testid={`btn-use-saved-machine-${sm.id}`}
                      >
                        {sm.imageUrl ? (
                          <img src={`/machine-images/${sm.imageUrl}`} alt={resolvedName} className="w-12 h-10 object-contain rounded border bg-white shrink-0" />
                        ) : (
                          <div className="w-12 h-10 rounded border bg-muted/50 flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{resolvedName}</div>
                          <div className="text-xs text-muted-foreground font-mono">€ {parseFloat(sm.basePrice).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</div>
                        </div>
                        <Plus className="w-4 h-4 text-primary shrink-0" />
                      </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 p-3 border-2 border-primary/30 rounded-lg bg-primary/5">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-sm">Nuova Macchina Personalizzata</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                  setCustomMode(false);
                  setCustomName("");
                  setCustomDescription("");
                  setCustomPrice("");
                  setCustomOptions([]);
                  setCustomMainImage("");
                  setCustomDetailImages([]);
                }} data-testid="btn-cancel-custom">
                  <X className="w-3.5 h-3.5 mr-1" /> Annulla
                </Button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Nome Macchina</Label>
                  <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Es: Levigatrice speciale..." className="h-8 text-sm mt-0.5" data-testid="input-custom-machine-name" />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Prezzo Base (€)</Label>
                  <Input type="number" min="0" step="0.01" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder="0.00" className="h-8 text-sm font-mono mt-0.5" data-testid="input-custom-machine-price" />
                </div>
              </div>

              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                  <Image className="w-3 h-3" /> Foto Macchina
                </Label>
                <p className="text-[10px] text-muted-foreground mb-1">Foto principale visualizzata tra titolo e descrizione nel PDF</p>
                <input ref={mainImageRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  const filename = await uploadPhoto(file);
                  setUploading(false);
                  if (filename) setCustomMainImage(filename);
                  e.target.value = "";
                }} data-testid="input-custom-main-image" />
                {customMainImage ? (
                  <div className="flex items-center gap-2">
                    <img src={`/machine-images/${customMainImage}`} alt="Foto macchina" className="h-16 w-24 object-contain rounded border bg-white" />
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setCustomMainImage("")} data-testid="btn-remove-main-image">
                      <Trash2 className="w-3 h-3 mr-1" /> Rimuovi
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 text-xs" disabled={uploading} onClick={() => mainImageRef.current?.click()} data-testid="btn-upload-main-image">
                    {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                    Carica foto macchina
                  </Button>
                )}
              </div>

              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Descrizione</Label>
                <p className="text-[10px] text-muted-foreground mb-1">Usa <code className="bg-muted px-1 py-0.5 rounded text-[9px]">[[IMG1]]</code> <code className="bg-muted px-1 py-0.5 rounded text-[9px]">[[IMG2]]</code> etc. per inserire le foto dettaglio nella posizione desiderata</p>
                <Input value={customDescription} onChange={(e) => setCustomDescription(e.target.value)} placeholder="Descrizione macchina... usa [[IMG1]] per inserire foto" className="h-8 text-sm mt-0.5" data-testid="input-custom-machine-description" />
              </div>

              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                  <Images className="w-3 h-3" /> Foto Dettagli
                </Label>
                <p className="text-[10px] text-muted-foreground mb-1">Le foto dettaglio verranno inserite dove scrivi [[IMG1]], [[IMG2]], etc. nella descrizione</p>
                <input ref={detailImageRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  const filename = await uploadPhoto(file);
                  setUploading(false);
                  if (filename) setCustomDetailImages(prev => [...prev, filename]);
                  e.target.value = "";
                }} data-testid="input-custom-detail-images" />
                {customDetailImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {customDetailImages.map((img, i) => (
                      <div key={img} className="relative group">
                        <div className="flex flex-col items-center gap-0.5">
                          <img src={`/machine-images/${img}`} alt={`Dettaglio ${i + 1}`} className="h-14 w-20 object-contain rounded border bg-white" />
                          <span className="text-[9px] font-mono text-muted-foreground">[[IMG{i + 1}]]</span>
                        </div>
                        <button type="button" className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center text-[9px] opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setCustomDetailImages(prev => prev.filter((_, j) => j !== i))} data-testid={`btn-remove-detail-image-${i}`}>
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={uploading} onClick={() => detailImageRef.current?.click()} data-testid="btn-upload-detail-image">
                  {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                  Aggiungi foto dettaglio
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Optional</Label>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
                    setCustomOptions([...customOptions, { tempId: Math.random().toString(36), name: "", price: 0, quantity: 1 }]);
                  }} data-testid="btn-add-custom-option">
                    <Plus className="w-3 h-3 mr-1" /> OPTIONAL NUOVO
                  </Button>
                </div>
                {customOptions.map((opt, oi) => (
                  <div key={opt.tempId} className="flex items-center gap-2">
                    <Input
                      value={opt.name}
                      onChange={(e) => setCustomOptions(prev => prev.map((o, i) => i === oi ? { ...o, name: e.target.value } : o))}
                      placeholder="Nome optional..."
                      className="h-7 text-xs flex-1"
                      data-testid={`input-custom-opt-name-${oi}`}
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground">Qty</span>
                      <Input
                        type="number"
                        min="1"
                        value={opt.quantity}
                        onChange={(e) => setCustomOptions(prev => prev.map((o, i) => i === oi ? { ...o, quantity: Math.max(1, parseInt(e.target.value) || 1) } : o))}
                        className="h-7 text-xs font-mono w-14"
                        data-testid={`input-custom-opt-qty-${oi}`}
                      />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground">€</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={opt.price || ""}
                        onChange={(e) => setCustomOptions(prev => prev.map((o, i) => i === oi ? { ...o, price: parseFloat(e.target.value) || 0 } : o))}
                        className="h-7 text-xs font-mono w-24"
                        data-testid={`input-custom-opt-price-${oi}`}
                      />
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive shrink-0" onClick={() => setCustomOptions(prev => prev.filter((_, i) => i !== oi))} data-testid={`btn-remove-custom-opt-${oi}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                className="w-full font-semibold"
                disabled={!customName.trim() || uploading}
                onClick={() => {
                  onAddCustomMachine({
                    name: customName.trim(),
                    description: customDescription.trim(),
                    basePrice: parseFloat(customPrice) || 0,
                    customOptions: customOptions.filter(o => o.name.trim()),
                    mainImage: customMainImage || undefined,
                    detailImages: customDetailImages.length > 0 ? customDetailImages : undefined,
                    language: contentLanguage || "it",
                  });
                  setCustomMode(false);
                  setCustomName("");
                  setCustomDescription("");
                  setCustomPrice("");
                  setCustomOptions([]);
                  setCustomMainImage("");
                  setCustomDetailImages([]);
                }}
                data-testid="btn-confirm-custom-machine"
              >
                <Plus className="w-4 h-4 mr-2" /> Aggiungi Macchina Nuova
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
