import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Plus, Loader2, Check, X, Edit2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { DealerPreset } from "@shared/schema";

const LANGUAGES = [
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "pt", flag: "🇵🇹", label: "Português" },
] as const;

interface EditState {
  title: string;
  content: string;
}

function hasTranslation(preset: DealerPreset, langCode: string): boolean {
  if (langCode === "it") return !!(preset.title?.trim() || preset.content?.trim());
  const t = preset.translations;
  if (!t || !t[langCode]) return false;
  return !!(t[langCode].title?.trim() || t[langCode].content?.trim());
}

export default function DealerPresets({ embedded }: { embedded?: boolean } = {}) {
  const { data: presets, isLoading } = useQuery<DealerPreset[]>({
    queryKey: ["/api/dealer/presets"],
  });

  const createPreset = useMutation({
    mutationFn: (data: { title: string; content: string }) =>
      apiRequest("POST", "/api/dealer/presets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/presets"] });
      toast({ title: "Preset created" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updatePreset = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { title?: string; content?: string; translations?: Record<string, { title: string; content: string }> | null } }) =>
      apiRequest("PUT", `/api/dealer/presets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/presets"] });
      toast({ title: "Preset updated" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deletePreset = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/dealer/presets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/presets"] });
      toast({ title: "Preset deleted" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { toast } = useToast();

  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingLang, setEditingLang] = useState<string>("it");
  const [editState, setEditState] = useState<EditState>({ title: "", content: "" });

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      toast({ title: "Error", description: "Title cannot be empty", variant: "destructive" });
      return;
    }
    if (!newContent.trim()) {
      toast({ title: "Error", description: "Description cannot be empty", variant: "destructive" });
      return;
    }
    try {
      await createPreset.mutateAsync({ title: newTitle.trim(), content: newContent.trim() });
      setNewTitle("");
      setNewContent("");
      setShowNew(false);
    } catch {}
  };

  const startEdit = (preset: DealerPreset, lang: string = "it") => {
    setEditingId(preset.id);
    setEditingLang(lang);
    if (lang === "it") {
      setEditState({ title: preset.title || "", content: preset.content });
    } else {
      const t = preset.translations;
      const existing = t?.[lang];
      setEditState({ title: existing?.title || "", content: existing?.content || "" });
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingLang("it");
    setEditState({ title: "", content: "" });
  };

  const handleUpdate = async (preset: DealerPreset) => {
    if (editingLang === "it") {
      if (!editState.title.trim()) {
        toast({ title: "Error", description: "Title cannot be empty", variant: "destructive" });
        return;
      }
      if (!editState.content.trim()) {
        toast({ title: "Error", description: "Description cannot be empty", variant: "destructive" });
        return;
      }
      try {
        await updatePreset.mutateAsync({ id: preset.id, data: { title: editState.title.trim(), content: editState.content.trim() } });
        cancelEdit();
      } catch {}
    } else {
      const currentTranslations = { ...(preset.translations || {}) };
      if (editState.title.trim() || editState.content.trim()) {
        currentTranslations[editingLang] = { title: editState.title.trim(), content: editState.content.trim() };
      } else {
        delete currentTranslations[editingLang];
      }
      try {
        await updatePreset.mutateAsync({ id: preset.id, data: { title: preset.title, content: preset.content, translations: currentTranslations } });
        cancelEdit();
      } catch {}
    }
  };

  const handleDelete = (preset: DealerPreset) => {
    if (confirm(`Delete "${preset.title || "this entry"}"?`)) {
      deletePreset.mutate(preset.id);
    }
  };

  const langLabel = LANGUAGES.find(l => l.code === editingLang);

  const content = (
      <div className="space-y-6">
        <PageHeader
          title="Presets & Terms"
          subtitle="Manage reusable terms and conditions for your dealer offers."
          actions={
            !showNew ? (
              <Button data-testid="button-new-dealer-preset" onClick={() => setShowNew(true)}>
                <Plus className="mr-2 h-4 w-4" /> New Entry
              </Button>
            ) : undefined
          }
        />

        {showNew && (
          <div className="border rounded-xl p-5 space-y-4 bg-muted/30" data-testid="card-new-dealer-preset">
            <h2 className="font-semibold text-base">New Entry</h2>
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                data-testid="input-new-dealer-preset-title"
                placeholder="e.g. Payment Terms"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                data-testid="textarea-new-dealer-preset-content"
                placeholder="Enter the full text..."
                className="min-h-32"
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                data-testid="button-save-new-dealer-preset"
                onClick={handleCreate}
                disabled={createPreset.isPending}
              >
                {createPreset.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Save
              </Button>
              <Button
                variant="ghost"
                data-testid="button-cancel-new-dealer-preset"
                onClick={() => { setShowNew(false); setNewTitle(""); setNewContent(""); }}
              >
                <X className="mr-2 h-4 w-4" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : presets?.length === 0 && !showNew ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">No entries yet</p>
            <p className="text-sm mt-1">Click "New Entry" to add your first term or condition preset.</p>
            <p className="text-sm mt-1 text-muted-foreground/70">These presets will be included in your dealer-branded offers.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {presets?.map(preset => (
              <div
                key={preset.id}
                className="border rounded-xl p-5 space-y-3 group"
                data-testid={`card-dealer-preset-${preset.id}`}
              >
                {editingId === preset.id ? (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-medium text-muted-foreground">Editing:</span>
                      <span className="text-sm font-semibold">{langLabel?.flag} {langLabel?.label}</span>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Title {editingLang !== "it" && <span className="text-muted-foreground font-normal">({langLabel?.label})</span>}</label>
                      <Input
                        data-testid={`input-edit-dealer-preset-title-${preset.id}`}
                        value={editState.title}
                        onChange={e => setEditState({ ...editState, title: e.target.value })}
                        placeholder={editingLang !== "it" ? preset.title || "" : ""}
                        autoFocus
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Description {editingLang !== "it" && <span className="text-muted-foreground font-normal">({langLabel?.label})</span>}</label>
                      <Textarea
                        data-testid={`textarea-edit-dealer-preset-content-${preset.id}`}
                        value={editState.content}
                        onChange={e => setEditState({ ...editState, content: e.target.value })}
                        className="min-h-32"
                        placeholder={editingLang !== "it" ? preset.content || "" : ""}
                      />
                    </div>
                    {editingLang !== "it" && (
                      <div className="text-xs text-muted-foreground bg-muted/40 p-2 rounded">
                        Leave both fields empty to remove this translation.
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        data-testid={`button-save-edit-dealer-preset-${preset.id}`}
                        onClick={() => handleUpdate(preset)}
                        disabled={updatePreset.isPending}
                      >
                        {updatePreset.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Check className="mr-2 h-3 w-3" />}
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit} data-testid={`button-cancel-edit-dealer-preset-${preset.id}`}>
                        <X className="mr-2 h-3 w-3" /> Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-start gap-4">
                      <h3 className="font-semibold text-base" data-testid={`text-dealer-preset-title-${preset.id}`}>
                        {preset.title || "(no title)"}
                      </h3>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          data-testid={`button-edit-dealer-preset-${preset.id}`}
                          onClick={() => startEdit(preset)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          data-testid={`button-delete-dealer-preset-${preset.id}`}
                          onClick={() => handleDelete(preset)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed" data-testid={`text-dealer-preset-content-${preset.id}`}>
                      {preset.content}
                    </p>
                    <div className="flex items-center gap-1 pt-1">
                      {LANGUAGES.map(lang => {
                        const filled = hasTranslation(preset, lang.code);
                        return (
                          <button
                            key={lang.code}
                            type="button"
                            className={`text-lg px-1.5 py-0.5 rounded transition-all hover:bg-muted ${filled ? "opacity-100" : "opacity-30 grayscale"}`}
                            title={`${lang.label}${filled ? " ✓" : " (empty)"}`}
                            onClick={() => startEdit(preset, lang.code)}
                            data-testid={`flag-${lang.code}-dealer-preset-${preset.id}`}
                          >
                            {lang.flag}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
  );

  if (embedded) return content;
  return <DealerLayout>{content}</DealerLayout>;
}
