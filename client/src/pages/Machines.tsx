import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useMachines, useCreateMachine, useUpdateMachine, useCreateMachineOption, useUpdateMachineOption, useDeleteMachine, useDeleteMachineOption } from "@/hooks/use-machines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useState } from "react";
import { useLocation } from "wouter";
import { Plus, Loader2, Edit2, Trash2, FileSpreadsheet, Zap, Wind, X, Save } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { getLocalizedField } from "@/lib/i18n/localize";
import { InlineConfirmButton } from "@/components/InlineConfirm";
import { CatalogLanguageSwitcher, useCatalogLanguage } from "@/components/CatalogLanguageSwitcher";

export default function Machines() {
  const { data: machines, isLoading } = useMachines();
  const createMachine = useCreateMachine();
  const updateMachine = useUpdateMachine();
  const deleteMachine = useDeleteMachine();
  const createOption = useCreateMachineOption();
  const updateOption = useUpdateMachineOption();
  const deleteOption = useDeleteMachineOption();
  const { t } = useLanguage();
  const [catalogLang, setCatalogLang] = useCatalogLanguage();
  const [, setLocation] = useLocation();

  const [showMachineForm, setShowMachineForm] = useState(false);
  const [editingMachineId, setEditingMachineId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");

  const [showOptionForm, setShowOptionForm] = useState<number | null>(null);
  const [editingOptionId, setEditingOptionId] = useState<number | null>(null);
  const [optName, setOptName] = useState("");
  const [optPrice, setOptPrice] = useState("");

  const handleMachineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name, description: desc, basePrice: parseFloat(price).toString() };
    if (editingMachineId) {
      await updateMachine.mutateAsync({ id: editingMachineId, machine: payload });
    } else {
      await createMachine.mutateAsync(payload as any);
    }
    resetMachineForm();
  };

  const resetMachineForm = () => {
    setShowMachineForm(false);
    setEditingMachineId(null);
    setName(""); setDesc(""); setPrice("");
  };

  const openEditMachine = (machine: any) => {
    setEditingMachineId(machine.id);
    setName(machine.name);
    setDesc(machine.description);
    setPrice(machine.basePrice);
    setShowMachineForm(true);
  };

  const handleOptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showOptionForm) return;
    const payload = { name: optName, priceModifier: parseFloat(optPrice).toString(), description: "" };
    if (editingOptionId) {
      await updateOption.mutateAsync({ optionId: editingOptionId, option: payload });
    } else {
      await createOption.mutateAsync({ machineId: showOptionForm, ...payload });
    }
    resetOptionForm();
  };

  const resetOptionForm = () => {
    setShowOptionForm(null);
    setEditingOptionId(null);
    setOptName(""); setOptPrice("");
  };

  const openEditOption = (machineId: number, option: any) => {
    setShowOptionForm(machineId);
    setEditingOptionId(option.id);
    setOptName(option.name);
    setOptPrice(option.priceModifier);
  };

  const machinesByType = machines?.reduce((acc, m) => {
    const type = (m as any).macroType || "Other";
    if (!acc[type]) acc[type] = [];
    acc[type].push(m);
    return acc;
  }, {} as Record<string, typeof machines>) ?? {};

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title={t("machines.title")}
          subtitle={t("machines.subtitle")}
          actions={
            <>
              <Button
                variant="outline"
                data-testid="button-import-excel"
                onClick={() => setLocation("/machines/import")}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" /> {t("machines.importExcel")}
              </Button>
              <Button
                data-testid="button-new-machine"
                onClick={() => { resetMachineForm(); setShowMachineForm(true); }}
              >
                <Plus className="mr-2 h-4 w-4" /> {t("machines.newMachine")}
              </Button>
            </>
          }
        />

        <CatalogLanguageSwitcher value={catalogLang} onChange={setCatalogLang} />

        {showMachineForm && (
          <Card className="border-primary/30" data-testid="machine-form-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{editingMachineId ? t("machines.editMachine") : t("machines.newMachineModel")}</CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetMachineForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleMachineSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t("machines.modelName")}</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} required data-testid="input-machine-name" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("machines.basePrice")}</Label>
                    <Input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} required data-testid="input-machine-price" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("common.description")}</Label>
                    <Input value={desc} onChange={e => setDesc(e.target.value)} data-testid="input-machine-desc" />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={resetMachineForm}>{t("common.cancel")}</Button>
                  <Button type="submit" disabled={createMachine.isPending || updateMachine.isPending} data-testid="button-save-machine">
                    <Save className="h-4 w-4 mr-2" />
                    {editingMachineId ? t("machines.updateModel") : t("machines.createModel")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {showOptionForm && (
          <Card className="border-blue-300/50" data-testid="option-form-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{editingOptionId ? t("machines.editOption") : t("machines.addOption")}</CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetOptionForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleOptionSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("machines.optionName")}</Label>
                    <Input value={optName} onChange={e => setOptName(e.target.value)} required data-testid="input-option-name" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("machines.priceModifier")}</Label>
                    <Input type="number" step="0.01" value={optPrice} onChange={e => setOptPrice(e.target.value)} required data-testid="input-option-price" />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={resetOptionForm}>{t("common.cancel")}</Button>
                  <Button type="submit" disabled={createOption.isPending || updateOption.isPending} data-testid="button-save-option">
                    <Save className="h-4 w-4 mr-2" />
                    {editingOptionId ? t("machines.updateOption") : t("machines.createOption")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
        ) : !machines?.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">{t("machines.noMachines")}</p>
            <p className="text-sm mt-1">{t("machines.noMachinesDesc")}</p>
          </div>
        ) : (
          Object.entries(machinesByType)
            .sort(([a], [b]) => {
              if (a === "Other") return 1;
              if (b === "Other") return -1;
              return a.localeCompare(b);
            })
            .map(([type, group]) => (
              <div key={type} className="space-y-3">
                <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2">{type}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group?.map((machine: any) => (
                    <MachineCard
                      key={machine.id}
                      machine={machine}
                      onEdit={() => openEditMachine(machine)}
                      onDelete={() => deleteMachine.mutate(machine.id)}
                      deletePending={deleteMachine.isPending}
                      onAddOption={() => { setShowOptionForm(machine.id); setEditingOptionId(null); setOptName(""); setOptPrice(""); }}
                      onEditOption={(opt) => openEditOption(machine.id, opt)}
                      onDeleteOption={(id) => deleteOption.mutate(id)}
                    />
                  ))}
                </div>
              </div>
            ))
        )}
      </div>
    </Layout>
  );
}

function MachineCard({ machine, onEdit, onDelete, deletePending, onAddOption, onEditOption, onDeleteOption }: {
  machine: any;
  onEdit: () => void;
  onDelete: () => void;
  deletePending?: boolean;
  onAddOption: () => void;
  onEditOption: (opt: any) => void;
  onDeleteOption: (id: number) => void;
}) {
  const { language, t } = useLanguage();
  const numVal = (v: any) => v != null ? parseFloat(v) : null;

  const elec = numVal(machine.electricalPower);
  const compAir = numVal(machine.compressedAir);
  const exhAir = numVal(machine.exhaustedAir);
  const airIn = numVal(machine.airIntroduced);
  const instDays = numVal(machine.installationDays);
  const hasUtilities = elec || compAir || exhAir || airIn || instDays;

  return (
    <Card className="flex flex-col" data-testid={`card-machine-${machine.id}`}>
      <CardHeader>
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm leading-tight">{getLocalizedField(machine.titles, machine.name, catalogLang)}</CardTitle>
            {machine.machineCode && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{machine.machineCode}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} data-testid={`button-edit-machine-${machine.id}`}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <InlineConfirmButton
              title={t("machines.deleteConfirm", { name: machine.name })}
              confirmLabel={t("common.delete")}
              onConfirm={onDelete}
              isPending={deletePending}
              buttonContent={<Trash2 className="h-3.5 w-3.5" />}
              buttonVariant="ghost"
              buttonSize="icon"
              buttonClassName="h-7 w-7 text-destructive hover:text-destructive"
              data-testid={`button-delete-machine-${machine.id}`}
            />
          </div>
        </div>
        {(machine.description || machine.descriptions) && (
          <CardDescription className="line-clamp-2 text-xs">{getLocalizedField(machine.descriptions, machine.description, catalogLang)}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <div className="text-xl font-bold">€{parseFloat(machine.basePrice).toLocaleString()}</div>

        {hasUtilities && (
          <div className="flex flex-wrap gap-1">
            {elec != null && elec > 0 && (
              <Badge variant="outline" className="text-xs gap-1">
                <Zap className="h-3 w-3" />{elec} kW
              </Badge>
            )}
            {compAir != null && compAir > 0 && (
              <Badge variant="outline" className="text-xs gap-1">
                <Wind className="h-3 w-3" />{compAir} Nl/min
              </Badge>
            )}
            {instDays != null && instDays > 0 && (
              <Badge variant="outline" className="text-xs">{t("machines.install", { days: String(instDays) })}</Badge>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t("machines.options", { count: String(machine.options.length) })}
            </p>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onAddOption}>
              <Plus className="h-3 w-3 mr-1" /> {t("common.add")}
            </Button>
          </div>
          <ul className="space-y-1">
            {machine.options.map((opt: any) => (
              <li key={opt.id} className="text-xs flex items-center justify-between p-1.5 bg-muted/30 rounded gap-2">
                <span className="font-medium truncate">{getLocalizedField(opt.titles, opt.name, catalogLang)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-muted-foreground">+€{parseFloat(opt.priceModifier).toLocaleString()}</span>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onEditOption(opt)}>
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive" onClick={() => onDeleteOption(opt.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
