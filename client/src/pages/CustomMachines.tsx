import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, ArrowLeft, Pencil, Upload, Image, Images, Loader2, X, Package, Calendar, User,
} from "lucide-react";

interface CustomMachineOption {
  id?: number;
  name: string;
  price: string;
  quantity: number;
}

interface CustomMachineRow {
  id: number;
  name: string;
  description: string;
  basePrice: string;
  imageUrl: string | null;
  detailImages: string[] | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  options: CustomMachineOption[];
}

type ViewMode = "list" | "create" | "edit";

export default function CustomMachines() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [mainImage, setMainImage] = useState("");
  const [detailImages, setDetailImages] = useState<string[]>([]);
  const [options, setOptions] = useState<CustomMachineOption[]>([]);
  const [uploading, setUploading] = useState(false);

  const { data: machines = [], isLoading } = useQuery<CustomMachineRow[]>({
    queryKey: ["/api/custom-machines"],
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setBasePrice("");
    setMainImage("");
    setDetailImages([]);
    setOptions([]);
    setEditingId(null);
  };

  const populateForm = (m: CustomMachineRow) => {
    setName(m.name);
    setDescription(m.description);
    setBasePrice(m.basePrice);
    setMainImage(m.imageUrl || "");
    setDetailImages(m.detailImages || []);
    setOptions(m.options.map(o => ({ ...o, price: String(o.price) })));
    setEditingId(m.id);
    setViewMode("edit");
  };

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

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        description,
        basePrice: parseFloat(basePrice) || 0,
        imageUrl: mainImage || null,
        detailImages: detailImages.length > 0 ? detailImages : null,
        options: options.filter(o => o.name.trim()).map(o => ({
          name: o.name,
          price: parseFloat(o.price) || 0,
          quantity: o.quantity,
        })),
      };
      if (editingId) {
        return apiRequest("PUT", `/api/custom-machines/${editingId}`, payload);
      }
      return apiRequest("POST", "/api/custom-machines", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-machines"] });
      toast({ title: editingId ? "Macchina aggiornata" : "Macchina creata" });
      resetForm();
      setViewMode("list");
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile salvare", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/custom-machines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-machines"] });
      toast({ title: "Macchina eliminata" });
    },
  });

  if (viewMode === "list") {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Macchine Personalizzate</h1>
            <p className="text-sm text-muted-foreground">Macchine create manualmente, riutilizzabili in tutte le offerte</p>
          </div>
          <Button onClick={() => { resetForm(); setViewMode("create"); }} data-testid="btn-new-custom-machine">
            <Plus className="w-4 h-4 mr-2" /> Nuova Macchina
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : machines.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-12 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Nessuna macchina personalizzata</p>
            <p className="text-sm">Crea una macchina per riutilizzarla nelle offerte</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {machines.map(m => (
              <div key={m.id} className="border rounded-lg p-4 flex items-start gap-4 hover:bg-muted/30 transition-colors" data-testid={`card-custom-machine-${m.id}`}>
                {m.imageUrl ? (
                  <img src={`/machine-images/${m.imageUrl}`} alt={m.name} className="w-20 h-16 object-contain rounded border bg-white shrink-0" />
                ) : (
                  <div className="w-20 h-16 rounded border bg-muted/50 flex items-center justify-center shrink-0">
                    <Package className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate" data-testid={`text-machine-name-${m.id}`}>{m.name}</h3>
                    <span className="text-sm font-mono text-muted-foreground shrink-0">€ {parseFloat(m.basePrice).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
                  </div>
                  {m.description && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{m.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                    {m.options.length > 0 && <span>{m.options.length} optional</span>}
                    {m.createdByName && (
                      <span className="flex items-center gap-0.5"><User className="w-2.5 h-2.5" /> {m.createdByName}</span>
                    )}
                    <span className="flex items-center gap-0.5">
                      <Calendar className="w-2.5 h-2.5" /> {new Date(m.createdAt).toLocaleDateString("it-IT")}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {confirmDeleteId === m.id ? (
                    <div className="flex items-center gap-1.5 bg-destructive/10 rounded-md px-2 py-1">
                      <span className="text-xs text-destructive font-medium">Eliminare?</span>
                      <Button variant="destructive" size="sm" className="h-6 px-2 text-xs" onClick={() => { deleteMutation.mutate(m.id); setConfirmDeleteId(null); }} data-testid={`btn-confirm-delete-${m.id}`}>
                        Sì
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setConfirmDeleteId(null)} data-testid={`btn-cancel-delete-${m.id}`}>
                        No
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => populateForm(m)} data-testid={`btn-edit-machine-${m.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => setConfirmDeleteId(m.id)} data-testid={`btn-delete-machine-${m.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => { resetForm(); setViewMode("list"); }} data-testid="btn-back-to-list">
          <ArrowLeft className="w-4 h-4 mr-1" /> Indietro
        </Button>
        <h1 className="text-xl font-bold" data-testid="text-form-title">
          {viewMode === "create" ? "Nuova Macchina Personalizzata" : "Modifica Macchina"}
        </h1>
      </div>

      <div className="space-y-5 border rounded-lg p-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nome Macchina *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es: Levigatrice speciale..." className="mt-1" data-testid="input-machine-name" />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prezzo Base (€)</Label>
            <Input type="number" min="0" step="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="0.00" className="mt-1 font-mono" data-testid="input-machine-price" />
          </div>
        </div>

        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Image className="w-3.5 h-3.5" /> Foto Macchina
          </Label>
          <p className="text-xs text-muted-foreground mb-2">Foto principale visualizzata tra titolo e descrizione nel PDF</p>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" id="edit-main-image" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            const filename = await uploadPhoto(file);
            setUploading(false);
            if (filename) setMainImage(filename);
            e.target.value = "";
          }} data-testid="input-main-image" />
          {mainImage ? (
            <div className="flex items-center gap-3">
              <img src={`/machine-images/${mainImage}`} alt="Foto macchina" className="h-24 w-36 object-contain rounded border bg-white" />
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => setMainImage("")} data-testid="btn-remove-main-image">
                <Trash2 className="w-3 h-3 mr-1" /> Rimuovi
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => document.getElementById("edit-main-image")?.click()} data-testid="btn-upload-main-image">
              {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
              Carica foto macchina
            </Button>
          )}
        </div>

        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descrizione</Label>
          <p className="text-xs text-muted-foreground mb-1">Usa <code className="bg-muted px-1 py-0.5 rounded text-[10px]">[[IMG1]]</code> <code className="bg-muted px-1 py-0.5 rounded text-[10px]">[[IMG2]]</code> per inserire le foto dettaglio nella posizione desiderata</p>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrizione macchina..." className="min-h-[120px] mt-1" data-testid="input-machine-description" />
        </div>

        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Images className="w-3.5 h-3.5" /> Foto Dettagli
          </Label>
          <p className="text-xs text-muted-foreground mb-2">Verranno inserite dove scrivi [[IMG1]], [[IMG2]], etc. nella descrizione</p>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" id="edit-detail-images" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            const filename = await uploadPhoto(file);
            setUploading(false);
            if (filename) setDetailImages(prev => [...prev, filename]);
            e.target.value = "";
          }} data-testid="input-detail-images" />
          {detailImages.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-2">
              {detailImages.map((img, i) => (
                <div key={img} className="relative group">
                  <div className="flex flex-col items-center gap-0.5">
                    <img src={`/machine-images/${img}`} alt={`Dettaglio ${i + 1}`} className="h-16 w-24 object-contain rounded border bg-white" />
                    <span className="text-[10px] font-mono text-muted-foreground">[[IMG{i + 1}]]</span>
                  </div>
                  <button type="button" className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setDetailImages(prev => prev.filter((_, j) => j !== i))} data-testid={`btn-remove-detail-${i}`}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => document.getElementById("edit-detail-images")?.click()} data-testid="btn-upload-detail">
            {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
            Aggiungi foto dettaglio
          </Button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Optional</Label>
            <Button variant="outline" size="sm" onClick={() => setOptions([...options, { name: "", price: "0", quantity: 1 }])} data-testid="btn-add-option">
              <Plus className="w-3 h-3 mr-1" /> Aggiungi Optional
            </Button>
          </div>
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <Input value={opt.name} onChange={(e) => setOptions(prev => prev.map((o, j) => j === i ? { ...o, name: e.target.value } : o))} placeholder="Nome optional..." className="h-8 text-sm flex-1" data-testid={`input-opt-name-${i}`} />
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-muted-foreground">Qty</span>
                <Input type="number" min="1" value={opt.quantity} onChange={(e) => setOptions(prev => prev.map((o, j) => j === i ? { ...o, quantity: Math.max(1, parseInt(e.target.value) || 1) } : o))} className="h-8 text-sm font-mono w-16" data-testid={`input-opt-qty-${i}`} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-muted-foreground">€</span>
                <Input type="number" min="0" step="0.01" value={opt.price} onChange={(e) => setOptions(prev => prev.map((o, j) => j === i ? { ...o, price: e.target.value } : o))} className="h-8 text-sm font-mono w-24" data-testid={`input-opt-price-${i}`} />
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive shrink-0" onClick={() => setOptions(prev => prev.filter((_, j) => j !== i))} data-testid={`btn-remove-opt-${i}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-3 border-t">
          <Button className="flex-1 font-semibold" disabled={!name.trim() || saveMutation.isPending || uploading} onClick={() => saveMutation.mutate()} data-testid="btn-save-machine">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {viewMode === "create" ? "Crea Macchina" : "Salva Modifiche"}
          </Button>
          <Button variant="outline" onClick={() => { resetForm(); setViewMode("list"); }} data-testid="btn-cancel">
            Annulla
          </Button>
        </div>
      </div>
    </div>
  );
}
