import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";

import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, UserCog } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type SalesmanFeatures, DEFAULT_SALESMAN_FEATURES, USER_ROLES, USER_ROLE_LABELS, type UserRole } from "@shared/schema";

interface UserData {
  id: number;
  email: string;
  name: string;
  surname: string;
  mobileNumber: string;
  isActive: boolean;
  isMasterSalesman: boolean;
  role: UserRole;
  features: SalesmanFeatures;
}

export default function EditUser() {
  const [, params] = useRoute("/users/:id/edit");
  const [, paramsNew] = useRoute("/users/new");
  const [, setLocation] = useLocation();

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isNew = !!paramsNew;
  const userId = params?.id ? Number(params.id) : null;

  const [form, setForm] = useState({
    email: "",
    name: "",
    surname: "",
    mobileNumber: "",
    isActive: true,
    role: "talent" as UserRole,
  });
  const [loaded, setLoaded] = useState(isNew);

  const { data: userData, isLoading } = useQuery<UserData>({
    queryKey: ["/api/users", userId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load user");
      return res.json();
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (userData && !loaded) {
      setForm({
        email: userData.email,
        name: userData.name,
        surname: userData.surname ?? "",
        mobileNumber: userData.mobileNumber ?? "",
        isActive: userData.isActive,
        role: (userData.role as UserRole) ?? "talent",
      });
      setLoaded(true);
    }
  }, [userData, loaded]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Utente creato" });
      setLocation("/users");
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", `/api/users/${userId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      toast({ title: "Utente aggiornato" });
      setLocation("/users");
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      email: form.email,
      name: form.name,
      surname: form.surname,
      mobileNumber: form.mobileNumber,
      isActive: form.isActive,
      isMasterSalesman: form.role === "head_of_talent",
      role: form.role,
      features: { ...DEFAULT_SALESMAN_FEATURES },
      parentSalesmanIds: [],
      assignedCountries: null,
    };

    if (isNew) {
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (!isNew && isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  const roleDescription: Record<UserRole, string> = {
    head_of_talent: "Responsabile dell'agenzia — accesso completo a talent, clienti, campagne e impostazioni.",
    talent_manager: "Gestisce i talent assegnati e le loro campagne.",
    talent: "Talent dell'agenzia — vede solo i propri dati e le proprie campagne.",
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <PageHeader
          title={isNew ? "Nuovo utente" : "Modifica utente"}
          subtitle={isNew ? "Crea un nuovo account" : `Modifica: ${userData?.name ?? ""} ${userData?.surname ?? ""}`}
          icon={<UserCog className="w-6 h-6 text-primary" />}
        />

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-lg border bg-card p-6 space-y-5">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Dati account</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nome *</Label>
                <Input data-testid="input-user-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Cognome</Label>
                <Input data-testid="input-user-surname" value={form.surname} onChange={e => setForm(f => ({ ...f, surname: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Email *</Label>
                <Input data-testid="input-user-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Telefono</Label>
                <Input data-testid="input-user-mobile" type="tel" value={form.mobileNumber} onChange={e => setForm(f => ({ ...f, mobileNumber: e.target.value }))} />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Gli utenti accedono con il proprio account Google aziendale (quando OAuth è abilitato). Assicurati che l'email
              sopra corrisponda all'account che useranno per il login.
            </p>
          </div>

          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Ruolo e stato</h3>

            <div className="space-y-2">
              <Label>Ruolo *</Label>
              <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v as UserRole }))}>
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue placeholder="Seleziona un ruolo" />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map(r => (
                    <SelectItem key={r} value={r}>{USER_ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{roleDescription[form.role]}</p>
            </div>

            <div className="flex items-center justify-between py-1">
              <Label>Account attivo</Label>
              <Switch data-testid="switch-user-active" checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={isPending} data-testid="button-save-user">
              {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Save className="w-4 h-4 mr-1.5" />
              {isNew ? "Crea utente" : "Salva modifiche"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setLocation("/users")}>Annulla</Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
