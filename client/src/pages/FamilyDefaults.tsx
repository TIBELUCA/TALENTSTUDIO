import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export const FAMILIES = ["rullo", "spruzzatrici", "robot", "profilo", "velo"] as const;
export type FamilyKey = typeof FAMILIES[number];

export const FAMILY_LANGS = ["it", "en", "de", "fr", "es", "pt"] as const;
export type FamilyLang = typeof FAMILY_LANGS[number];

const LANG_LABELS: Record<FamilyLang, string> = {
  it: "IT",
  en: "GB",
  de: "DE",
  fr: "FR",
  es: "ES",
  pt: "PT",
};

export interface FamilyDefaultValues {
  minMaxLength: string;
  maxWidth: string;
  minMaxThickness: string;
  averageLineSpeed: string;
  controlSide: string;
  maxBow: string;
  paint: string;
  substrate: string;
  finishing: string;
  standardVoltage: string;
  standardColors: string;
  components: string;
  precautions: string;
  commissioning: string;
}

export type FamilyLangDefaults = Record<FamilyLang, FamilyDefaultValues>;
export type FamilyDefaults = Record<FamilyKey, FamilyLangDefaults>;

const EMPTY_VALUES: FamilyDefaultValues = {
  minMaxLength: "",
  maxWidth: "",
  minMaxThickness: "",
  averageLineSpeed: "",
  controlSide: "",
  maxBow: "",
  paint: "",
  substrate: "",
  finishing: "",
  standardVoltage: "",
  standardColors: "",
  components: "",
  precautions: "",
  commissioning: "",
};

const FIELD_LABELS: Record<keyof FamilyDefaultValues, string> = {
  minMaxLength: "Min/Max. length (mm)",
  maxWidth: "Max. width (mm)",
  minMaxThickness: "Min/Max. thickness (mm)",
  averageLineSpeed: "Avg. line speed (mt/min)",
  controlSide: "Control side",
  maxBow: "Max. bow of panel",
  paint: "Paint",
  substrate: "Substrate",
  finishing: "Finishing Level",
  standardVoltage: "Standard voltage",
  standardColors: "Standard colors",
  components: "Components",
  precautions: "Precautions",
  commissioning: "Commissioning and start-up",
};

const FIELD_PLACEHOLDERS: Record<keyof FamilyDefaultValues, string> = {
  minMaxLength: "e.g. 300-2500",
  maxWidth: "e.g. 1300",
  minMaxThickness: "e.g. 8-50",
  averageLineSpeed: "e.g. 5-15",
  controlSide: "e.g. Right",
  maxBow: "e.g. 10 mm",
  paint: "e.g. Water based",
  substrate: "e.g. MDF",
  finishing: "e.g. Matt",
  standardVoltage: "e.g. 400V 50Hz 3Ph+N+PE",
  standardColors: "e.g. RAL 9010 / RAL 7035",
  components: "e.g. Bonfiglioli, Schneider Telemecanique...",
  precautions: "e.g. Safety guards, emergency stops...",
  commissioning: "e.g. Included on-site, 2 days...",
};

const TEXTAREA_FIELDS = new Set<keyof FamilyDefaultValues>([
  "components",
  "precautions",
  "commissioning",
]);

function emptyLangDefaults(): FamilyLangDefaults {
  return Object.fromEntries(FAMILY_LANGS.map(l => [l, { ...EMPTY_VALUES }])) as FamilyLangDefaults;
}

export function makeDefaultFamilyDefaults(): FamilyDefaults {
  return Object.fromEntries(FAMILIES.map(f => [f, emptyLangDefaults()])) as FamilyDefaults;
}

// Normalize incoming data: supports both legacy flat shape (per family: FamilyDefaultValues)
// and new nested shape (per family: { lang: FamilyDefaultValues }).
function normalize(raw: any): FamilyDefaults {
  const out = makeDefaultFamilyDefaults();
  if (!raw || typeof raw !== "object") return out;
  for (const family of FAMILIES) {
    const fv = raw[family];
    if (!fv || typeof fv !== "object") continue;
    const isNested = FAMILY_LANGS.some(l => fv[l] && typeof fv[l] === "object");
    if (isNested) {
      for (const lang of FAMILY_LANGS) {
        out[family][lang] = { ...EMPTY_VALUES, ...(fv[lang] ?? {}) };
      }
    } else {
      // legacy flat → put under "it"
      out[family].it = { ...EMPTY_VALUES, ...fv };
    }
  }
  return out;
}

export type FamilyLabelOverrides = Partial<Record<FamilyKey, Partial<Record<FamilyLang, Partial<Record<keyof FamilyDefaultValues, string>>>>>>;

function normalizeLabels(raw: any): FamilyLabelOverrides {
  const out: FamilyLabelOverrides = {};
  if (!raw || typeof raw !== "object" || !raw.__labels || typeof raw.__labels !== "object") return out;
  const lbls = raw.__labels;
  for (const family of FAMILIES) {
    const fv = lbls[family];
    if (!fv || typeof fv !== "object") continue;
    out[family] = {};
    for (const lang of FAMILY_LANGS) {
      const lv = fv[lang];
      if (!lv || typeof lv !== "object") continue;
      const langOut: Partial<Record<keyof FamilyDefaultValues, string>> = {};
      for (const field of Object.keys(FIELD_LABELS) as (keyof FamilyDefaultValues)[]) {
        if (typeof lv[field] === "string") langOut[field] = lv[field];
      }
      out[family]![lang] = langOut;
    }
  }
  return out;
}

export default function FamilyDefaults() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: saved, isLoading } = useQuery<any>({
    queryKey: ["/api/settings/family-defaults"],
    queryFn: () => fetch("/api/settings/family-defaults", { credentials: "include" }).then(r => r.json()),
  });

  const [local, setLocal] = useState<FamilyDefaults | null>(null);
  const [localLabels, setLocalLabels] = useState<FamilyLabelOverrides | null>(null);
  const effective: FamilyDefaults = local ?? normalize(saved);
  const effectiveLabels: FamilyLabelOverrides = localLabels ?? normalizeLabels(saved);

  const labelOf = (family: FamilyKey, lang: FamilyLang, field: keyof FamilyDefaultValues): string => {
    return effectiveLabels[family]?.[lang]?.[field] ?? FIELD_LABELS[field];
  };

  const mutation = useMutation({
    mutationFn: (data: FamilyDefaults & { __labels?: FamilyLabelOverrides }) =>
      apiRequest("PUT", "/api/settings/family-defaults", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/family-defaults"] });
      toast({ title: "Family defaults saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const updateField = (family: FamilyKey, lang: FamilyLang, field: keyof FamilyDefaultValues, value: string) => {
    setLocal(prev => {
      const base = prev ?? normalize(saved);
      return {
        ...base,
        [family]: {
          ...base[family],
          [lang]: { ...base[family][lang], [field]: value },
        },
      };
    });
  };

  const updateLabel = (family: FamilyKey, lang: FamilyLang, field: keyof FamilyDefaultValues, value: string) => {
    setLocalLabels(prev => {
      const base: FamilyLabelOverrides = prev ?? normalizeLabels(saved);
      const fam = { ...(base[family] ?? {}) };
      const langMap = { ...(fam[lang] ?? {}) };
      if (value === "" || value === FIELD_LABELS[field]) {
        delete (langMap as any)[field];
      } else {
        (langMap as any)[field] = value;
      }
      fam[lang] = langMap;
      return { ...base, [family]: fam };
    });
  };

  const resetLabel = (family: FamilyKey, lang: FamilyLang, field: keyof FamilyDefaultValues) => {
    updateLabel(family, lang, field, "");
  };

  const handleSave = () => mutation.mutate({ ...effective, __labels: effectiveLabels });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6 max-w-6xl">
        <PageHeader
          title="Family Defaults"
          subtitle="Configure default Project Data values for each machine family and language. These values will be pre-filled when creating a new offer."
          actions={
            <Button onClick={handleSave} disabled={mutation.isPending} className="shadow-lg shadow-primary/20">
              {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Defaults
            </Button>
          }
        />

        <Tabs defaultValue="rullo">
          <TabsList className="mb-4">
            {FAMILIES.map(f => (
              <TabsTrigger key={f} value={f} data-testid={`tab-family-${f}`} className="capitalize">
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>

          {FAMILIES.map(family => (
            <TabsContent key={family} value={family}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base capitalize">{family} — Default Project Data</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="it">
                    <TabsList className="mb-4">
                      {FAMILY_LANGS.map(lang => (
                        <TabsTrigger key={lang} value={lang} data-testid={`tab-lang-${family}-${lang}`}>
                          {LANG_LABELS[lang]}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {FAMILY_LANGS.map(lang => (
                      <TabsContent key={lang} value={lang}>
                        <div className="grid md:grid-cols-2 gap-4">
                          {(Object.keys(FIELD_LABELS) as (keyof FamilyDefaultValues)[]).map(field => {
                            const isTextarea = TEXTAREA_FIELDS.has(field);
                            return (
                              <div key={field} className={isTextarea ? "space-y-2 md:col-span-2" : "space-y-2"}>
                                <div className="flex items-center gap-1 group">
                                  <Input
                                    value={labelOf(family, lang, field)}
                                    onChange={e => updateLabel(family, lang, field, e.target.value)}
                                    className="h-7 px-1.5 text-sm font-medium border-transparent bg-transparent hover:border-input focus-visible:border-input focus-visible:bg-background transition-colors"
                                    aria-label={`Edit label for ${field}`}
                                    data-testid={`label-input-${family}-${lang}-${field}`}
                                  />
                                  {effectiveLabels[family]?.[lang]?.[field] !== undefined && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 shrink-0 opacity-60 hover:opacity-100"
                                      onClick={() => resetLabel(family, lang, field)}
                                      title="Ripristina etichetta predefinita"
                                      data-testid={`label-reset-${family}-${lang}-${field}`}
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                                {isTextarea ? (
                                  <Textarea
                                    id={`${family}-${lang}-${field}`}
                                    placeholder={FIELD_PLACEHOLDERS[field]}
                                    value={effective[family]?.[lang]?.[field] ?? ""}
                                    onChange={e => updateField(family, lang, field, e.target.value)}
                                    className="min-h-[80px]"
                                    data-testid={`input-${family}-${lang}-${field}`}
                                  />
                                ) : (
                                  <Input
                                    id={`${family}-${lang}-${field}`}
                                    placeholder={FIELD_PLACEHOLDERS[field]}
                                    value={effective[family]?.[lang]?.[field] ?? ""}
                                    onChange={e => updateField(family, lang, field, e.target.value)}
                                    data-testid={`input-${family}-${lang}-${field}`}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Layout>
  );
}
