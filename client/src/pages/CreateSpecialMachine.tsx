import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { useLocation, Link } from "wouter";
import { useState, useRef } from "react";
import { ArrowLeft, Sparkles, Loader2, Plus, Trash2, Zap, Wind, Clock, Upload, Image } from "lucide-react";

interface OptionRow {
  key: string;
  name: string;
  description: string;
  priceModifier: string;
  electricalPower: string;
  compressedAir: string;
  exhaustedAir: string;
  airIntroduced: string;
}

function emptyOption(): OptionRow {
  return {
    key: crypto.randomUUID(),
    name: "",
    description: "",
    priceModifier: "0",
    electricalPower: "",
    compressedAir: "",
    exhaustedAir: "",
    airIntroduced: "",
  };
}

export default function CreateSpecialMachine() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("0");
  const [electricalPower, setElectricalPower] = useState("");
  const [compressedAir, setCompressedAir] = useState("");
  const [exhaustedAir, setExhaustedAir] = useState("");
  const [airIntroduced, setAirIntroduced] = useState("");
  const [installationDays, setInstallationDays] = useState("");
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const addOption = () => setOptions([...options, emptyOption()]);
  const removeOption = (key: string) => setOptions(options.filter(o => o.key !== key));
  const updateOption = (key: string, field: keyof OptionRow, value: string) => {
    setOptions(options.map(o => o.key === key ? { ...o, [field]: value } : o));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Only JPEG, PNG, GIF, and WebP are allowed.", variant: "destructive" });
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const machineRes = await apiRequest("POST", api.machines.create.path, {
        machineCode: code.trim() || undefined,
        name: name.trim(),
        description: description.trim() || "",
        basePrice: basePrice || "0",
        macroType: "SPECIAL",
        source: "manual",
        electricalPower: electricalPower ? parseFloat(electricalPower) : null,
        compressedAir: compressedAir ? parseFloat(compressedAir) : null,
        exhaustedAir: exhaustedAir ? parseFloat(exhaustedAir) : null,
        airIntroduced: airIntroduced ? parseFloat(airIntroduced) : null,
        installationDays: installationDays ? parseFloat(installationDays) : null,
      });
      const machine = await machineRes.json();

      for (const opt of options) {
        if (!opt.name.trim()) continue;
        await apiRequest("POST", `/api/machines/${machine.id}/options`, {
          name: opt.name.trim(),
          description: opt.description.trim() || "",
          priceModifier: opt.priceModifier || "0",
          electricalPower: opt.electricalPower ? parseFloat(opt.electricalPower) : null,
          compressedAir: opt.compressedAir ? parseFloat(opt.compressedAir) : null,
          exhaustedAir: opt.exhaustedAir ? parseFloat(opt.exhaustedAir) : null,
          airIntroduced: opt.airIntroduced ? parseFloat(opt.airIntroduced) : null,
        });
      }

      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);
        await fetch(`/api/machines/${machine.id}/image`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
      }

      queryClient.removeQueries({ queryKey: ["/api/machines/families"] });
      queryClient.removeQueries({ queryKey: ["/api/machines/family", "SPECIAL"] });
      toast({ title: "Special machine created successfully" });
      setLocation("/machines/family/SPECIAL");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-amber-500" />
              Add Special Machine
            </span>
          }
          subtitle="Create a custom machine not in the Excel catalog"
          actions={
            <Link href="/machines/family/SPECIAL">
              <Button variant="outline" data-testid="button-back-special">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            </Link>
          }
        />

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Machine Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="sp-code">Code</Label>
                <Input
                  id="sp-code"
                  data-testid="input-special-code"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="e.g. SPM-100"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sp-name">Name *</Label>
                <Input
                  id="sp-name"
                  data-testid="input-special-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Machine name"
                  required
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="sp-desc">Description</Label>
                <Textarea
                  id="sp-desc"
                  data-testid="input-special-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Machine description"
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sp-price">Base Price (€)</Label>
                <Input
                  id="sp-price"
                  data-testid="input-special-price"
                  type="number"
                  step="0.01"
                  value={basePrice}
                  onChange={e => setBasePrice(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                Utilities
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="sp-ep" className="flex items-center gap-1.5 text-sm">
                  <Zap className="w-3.5 h-3.5 text-yellow-500" /> Electrical Power (kW)
                </Label>
                <Input id="sp-ep" data-testid="input-special-electrical-power" type="number" step="0.01" value={electricalPower} onChange={e => setElectricalPower(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sp-ca" className="flex items-center gap-1.5 text-sm">
                  <Wind className="w-3.5 h-3.5 text-sky-500" /> Compressed Air (Nl/min)
                </Label>
                <Input id="sp-ca" data-testid="input-special-compressed-air" type="number" step="0.01" value={compressedAir} onChange={e => setCompressedAir(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sp-ea" className="flex items-center gap-1.5 text-sm">
                  <Wind className="w-3.5 h-3.5 text-orange-500" /> Exhausted Air (m³/h)
                </Label>
                <Input id="sp-ea" data-testid="input-special-exhausted-air" type="number" step="0.01" value={exhaustedAir} onChange={e => setExhaustedAir(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sp-ai" className="flex items-center gap-1.5 text-sm">
                  <Wind className="w-3.5 h-3.5 text-green-500" /> Air Introduced (m³/h)
                </Label>
                <Input id="sp-ai" data-testid="input-special-air-introduced" type="number" step="0.01" value={airIntroduced} onChange={e => setAirIntroduced(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sp-id" className="flex items-center gap-1.5 text-sm">
                  <Clock className="w-3.5 h-3.5 text-purple-500" /> Installation Days
                </Label>
                <Input id="sp-id" data-testid="input-special-installation-days" type="number" step="0.5" value={installationDays} onChange={e => setInstallationDays(e.target.value)} placeholder="0" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Options</span>
                <Button type="button" size="sm" variant="outline" onClick={addOption} data-testid="button-add-option">
                  <Plus className="w-4 h-4 mr-1" /> Add Option
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {options.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No options added yet. Click "Add Option" to include machine options with prices.</p>
              )}
              <div className="space-y-4">
                {options.map((opt, idx) => (
                  <div key={opt.key} className="rounded-lg border p-4 space-y-3 relative" data-testid={`option-row-${idx}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase">Option {idx + 1}</span>
                      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => removeOption(opt.key)} data-testid={`button-remove-option-${idx}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Name *</Label>
                        <Input data-testid={`input-option-name-${idx}`} value={opt.name} onChange={e => updateOption(opt.key, "name", e.target.value)} placeholder="Option name" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Description</Label>
                        <Input data-testid={`input-option-desc-${idx}`} value={opt.description} onChange={e => updateOption(opt.key, "description", e.target.value)} placeholder="Description" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Price (€)</Label>
                        <Input data-testid={`input-option-price-${idx}`} type="number" step="0.01" value={opt.priceModifier} onChange={e => updateOption(opt.key, "priceModifier", e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1"><Zap className="w-3 h-3 text-yellow-500" /> kW</Label>
                        <Input data-testid={`input-option-ep-${idx}`} type="number" step="0.01" value={opt.electricalPower} onChange={e => updateOption(opt.key, "electricalPower", e.target.value)} placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1"><Wind className="w-3 h-3 text-sky-500" /> Nl/min</Label>
                        <Input data-testid={`input-option-ca-${idx}`} type="number" step="0.01" value={opt.compressedAir} onChange={e => updateOption(opt.key, "compressedAir", e.target.value)} placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1"><Wind className="w-3 h-3 text-orange-500" /> m³/h out</Label>
                        <Input data-testid={`input-option-ea-${idx}`} type="number" step="0.01" value={opt.exhaustedAir} onChange={e => updateOption(opt.key, "exhaustedAir", e.target.value)} placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1"><Wind className="w-3 h-3 text-green-500" /> m³/h in</Label>
                        <Input data-testid={`input-option-ai-${idx}`} type="number" step="0.01" value={opt.airIntroduced} onChange={e => updateOption(opt.key, "airIntroduced", e.target.value)} placeholder="0" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Image className="w-4 h-4 text-muted-foreground" />
                Picture
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone-image"
              >
                {imagePreview ? (
                  <div className="space-y-3">
                    <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded-lg object-contain" />
                    <p className="text-xs text-muted-foreground">{imageFile?.name} — click to change</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">Click to upload a machine picture</p>
                    <p className="text-xs text-muted-foreground">JPEG, PNG, GIF, or WebP</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleImageSelect}
                data-testid="input-image-file"
              />
            </CardContent>
          </Card>

          <div className="flex gap-3 pb-8">
            <Button type="submit" disabled={saving} size="lg" data-testid="button-create-special">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Sparkles className="w-4 h-4 mr-2" />
              Create Special Machine
            </Button>
            <Link href="/machines/family/SPECIAL">
              <Button type="button" variant="outline" size="lg">Cancel</Button>
            </Link>
          </div>
        </form>
      </div>
    </Layout>
  );
}
