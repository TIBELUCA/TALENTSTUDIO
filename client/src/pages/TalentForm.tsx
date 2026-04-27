import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Plus, Trash2, Loader2, ArrowLeft, Save, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TalentWithDetails } from "@shared/schema";
import { TALENT_PLATFORMS, TALENT_DELIVERABLES, type TalentPlatform, type TalentDeliverable } from "@shared/schema";

const isTalentPlatform = (v: string): v is TalentPlatform =>
  (TALENT_PLATFORMS as readonly string[]).includes(v);
const isTalentDeliverable = (v: string): v is TalentDeliverable =>
  (TALENT_DELIVERABLES as readonly string[]).includes(v);

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X (Twitter)",
};

const DELIVERABLE_LABELS: Record<string, string> = {
  post: "Post feed",
  reel: "Reel",
  story: "Story",
  video: "Video lungo",
  event: "Partecipazione evento",
};

const formSchema = z.object({
  talent: z.object({
    displayName: z.string().min(1, "Nome d'arte obbligatorio"),
    realName: z.string().optional().nullable(),
    avatarUrl: z.string().url("URL non valido").or(z.literal("")).optional().nullable(),
    bio: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    email: z.string().email("Email non valida").or(z.literal("")).optional().nullable(),
    phone: z.string().optional().nullable(),
    defaultCommissionPct: z.string().optional().nullable(),
    tags: z.string().optional(),
    notes: z.string().optional().nullable(),
    isActive: z.boolean().default(true),
  }),
  socials: z.array(z.object({
    platform: z.enum(TALENT_PLATFORMS),
    handle: z.string().min(1, "Handle obbligatorio"),
    profileUrl: z.string().optional().nullable(),
    followers: z.coerce.number().int().min(0).optional().nullable(),
    engagementPct: z.string().optional().nullable(),
  })),
  rates: z.array(z.object({
    deliverableType: z.enum(TALENT_DELIVERABLES),
    basePriceEur: z.string().default("0"),
    notes: z.string().optional().nullable(),
  })),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  mode: "create" | "edit";
}

export default function TalentForm({ mode }: Props) {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isEdit = mode === "edit";
  const talentId = isEdit ? Number(id) : null;

  const { data: existing, isLoading: loadingExisting } = useQuery<TalentWithDetails>({
    queryKey: ["/api/talents", talentId],
    enabled: !!talentId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      talent: {
        displayName: "",
        realName: "",
        avatarUrl: "",
        bio: "",
        city: "",
        country: "",
        email: "",
        phone: "",
        defaultCommissionPct: "20",
        tags: "",
        notes: "",
        isActive: true,
      },
      socials: [],
      rates: [],
    },
  });

  const { fields: socialFields, append: appendSocial, remove: removeSocial } = useFieldArray({
    control: form.control,
    name: "socials",
  });

  const { fields: rateFields, append: appendRate, remove: removeRate } = useFieldArray({
    control: form.control,
    name: "rates",
  });

  useEffect(() => {
    if (existing && isEdit) {
      form.reset({
        talent: {
          displayName: existing.displayName,
          realName: existing.realName ?? "",
          avatarUrl: existing.avatarUrl ?? "",
          bio: existing.bio ?? "",
          city: existing.city ?? "",
          country: existing.country ?? "",
          email: existing.email ?? "",
          phone: existing.phone ?? "",
          defaultCommissionPct: existing.defaultCommissionPct ?? "20",
          tags: (existing.tags || []).join(", "),
          notes: existing.notes ?? "",
          isActive: existing.isActive,
        },
        socials: (existing.socials || []).map((s) => ({
          platform: isTalentPlatform(s.platform) ? s.platform : "instagram",
          handle: s.handle,
          profileUrl: s.profileUrl ?? "",
          followers: s.followers ?? 0,
          engagementPct: s.engagementPct ?? "",
        })),
        rates: (existing.rates || []).map((r) => ({
          deliverableType: isTalentDeliverable(r.deliverableType) ? r.deliverableType : "post",
          basePriceEur: r.basePriceEur ?? "0",
          notes: r.notes ?? "",
        })),
      });
    }
  }, [existing, isEdit, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        talent: {
          ...values.talent,
          tags: (values.talent.tags ?? "")
            .split(",")
            .map(t => t.trim())
            .filter(Boolean),
          avatarUrl: values.talent.avatarUrl || null,
          email: values.talent.email || null,
          defaultCommissionPct: values.talent.defaultCommissionPct || "0",
        },
        socials: values.socials,
        rates: values.rates,
      };
      if (isEdit) {
        return await apiRequest("PUT", `/api/talents/${talentId}`, payload);
      }
      return await apiRequest("POST", "/api/talents", payload);
    },
    onSuccess: async (res: Response) => {
      const data = (await res.json()) as { id?: number } | null;
      queryClient.invalidateQueries({ queryKey: ["/api/talents"] });
      if (talentId) queryClient.invalidateQueries({ queryKey: ["/api/talents", talentId] });
      toast({ title: isEdit ? "Talent aggiornato" : "Talent creato" });
      navigate(`/talents/${data?.id ?? talentId}`);
    },
    onError: (err: Error) => {
      toast({
        title: "Errore",
        description: err.message || "Impossibile salvare il talent.",
        variant: "destructive",
      });
    },
  });

  if (isEdit && loadingExisting) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <PageHeader
          title={isEdit ? "Modifica Talent" : "Nuovo Talent"}
          subtitle="Anagrafica, social e tariffe base."
          icon={<Users className="w-5 h-5" />}
        />

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(values => mutation.mutate(values))}
            className="space-y-6"
          >
            {/* Anagrafica */}
            <Card>
              <CardHeader>
                <CardTitle>Anagrafica</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="talent.displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome d'arte *</FormLabel>
                        <FormControl>
                          <Input data-testid="input-display-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="talent.realName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome reale</FormLabel>
                        <FormControl>
                          <Input data-testid="input-real-name" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="talent.avatarUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL foto profilo</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-avatar-url"
                          placeholder="https://..."
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="talent.bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio breve</FormLabel>
                      <FormControl>
                        <Textarea
                          data-testid="input-bio"
                          rows={3}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="talent.email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input data-testid="input-email" type="email" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="talent.phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefono</FormLabel>
                        <FormControl>
                          <Input data-testid="input-phone" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="talent.city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Città</FormLabel>
                        <FormControl>
                          <Input data-testid="input-city" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="talent.country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Paese</FormLabel>
                        <FormControl>
                          <Input data-testid="input-country" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="talent.tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tag (separati da virgola)</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-tags"
                          placeholder="fashion, lifestyle, food"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="talent.defaultCommissionPct"
                  render={({ field }) => (
                    <FormItem className="max-w-xs">
                      <FormLabel>% Commissione di default</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-commission"
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="talent.notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Note interne</FormLabel>
                      <FormControl>
                        <Textarea
                          data-testid="input-notes"
                          rows={3}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Social */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Social & Statistiche</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendSocial({
                    platform: "instagram",
                    handle: "",
                    profileUrl: "",
                    followers: 0,
                    engagementPct: "",
                  })}
                  data-testid="button-add-social"
                >
                  <Plus className="w-4 h-4 mr-1" /> Aggiungi
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {socialFields.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nessun social registrato.</p>
                )}
                {socialFields.map((field, idx) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-end pb-3 border-b last:border-0">
                    <div className="col-span-12 md:col-span-3">
                      <Label>Piattaforma</Label>
                      <Select
                        value={form.watch(`socials.${idx}.platform`)}
                        onValueChange={(v) => {
                          if (isTalentPlatform(v)) form.setValue(`socials.${idx}.platform`, v);
                        }}
                      >
                        <SelectTrigger data-testid={`select-social-platform-${idx}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TALENT_PLATFORMS.map(p => (
                            <SelectItem key={p} value={p}>{PLATFORM_LABELS[p]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <Label>Handle</Label>
                      <Input
                        data-testid={`input-social-handle-${idx}`}
                        placeholder="@username"
                        {...form.register(`socials.${idx}.handle`)}
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label>Followers</Label>
                      <Input
                        data-testid={`input-social-followers-${idx}`}
                        type="number"
                        min="0"
                        {...form.register(`socials.${idx}.followers`)}
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <Label>Engagement %</Label>
                      <Input
                        data-testid={`input-social-engagement-${idx}`}
                        type="number"
                        step="0.1"
                        min="0"
                        {...form.register(`socials.${idx}.engagementPct`)}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-2 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSocial(idx)}
                        data-testid={`button-remove-social-${idx}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Tariffe */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Tariffe base (EUR)</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendRate({
                    deliverableType: "post",
                    basePriceEur: "0",
                    notes: "",
                  })}
                  data-testid="button-add-rate"
                >
                  <Plus className="w-4 h-4 mr-1" /> Aggiungi
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {rateFields.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nessuna tariffa configurata.</p>
                )}
                {rateFields.map((field, idx) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-end pb-3 border-b last:border-0">
                    <div className="col-span-12 md:col-span-4">
                      <Label>Tipo deliverable</Label>
                      <Select
                        value={form.watch(`rates.${idx}.deliverableType`)}
                        onValueChange={(v) => {
                          if (isTalentDeliverable(v)) form.setValue(`rates.${idx}.deliverableType`, v);
                        }}
                      >
                        <SelectTrigger data-testid={`select-rate-type-${idx}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TALENT_DELIVERABLES.map(d => (
                            <SelectItem key={d} value={d}>{DELIVERABLE_LABELS[d]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-8 md:col-span-3">
                      <Label>Prezzo base €</Label>
                      <Input
                        data-testid={`input-rate-price-${idx}`}
                        type="number"
                        step="50"
                        min="0"
                        {...form.register(`rates.${idx}.basePriceEur`)}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <Label>Note</Label>
                      <Input
                        data-testid={`input-rate-notes-${idx}`}
                        {...form.register(`rates.${idx}.notes`)}
                      />
                    </div>
                    <div className="col-span-4 md:col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRate(idx)}
                        data-testid={`button-remove-rate-${idx}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(isEdit ? `/talents/${talentId}` : "/talents")}
                data-testid="button-cancel"
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Annulla
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                data-testid="button-save"
              >
                {mutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salva
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Layout>
  );
}
