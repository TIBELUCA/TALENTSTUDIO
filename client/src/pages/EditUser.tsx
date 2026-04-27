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
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, UserCog, Globe, Search, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type SalesmanFeatures, DEFAULT_SALESMAN_FEATURES, USER_ROLES, USER_ROLE_LABELS, type UserRole, WORLD_COUNTRIES } from "@shared/schema";

const FEATURE_LABELS: Record<keyof SalesmanFeatures, string> = {
  canCreateOffers: "Create Offers",
  canEditOffers: "Edit Offers",
  canDeleteOffers: "Delete Offers",
  canManageCustomers: "Manage Customers",
  canViewMachines: "View Machines",
  canViewPresets: "View Presets",
  canUseFormat: "Use Format Editor",
  canManageSpecialMachines: "Manage Special Machines",
};

const ROLES_WITH_OFFER_FEATURES: UserRole[] = ["salesman", "master", "backoffice"];

interface UserData {
  id: number;
  email: string;
  name: string;
  surname: string;
  mobileNumber: string;
  isActive: boolean;
  isMasterSalesman: boolean;
  role: UserRole;
  parentSalesmanId: number | null;
  parentSalesmanIds: number[] | null;
  features: SalesmanFeatures;
  assignedCountries: string[] | null;
}

interface SalesmanOption {
  id: number;
  name: string;
  surname: string;
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
    isMasterSalesman: false,
    role: "salesman" as UserRole,
    parentSalesmanIds: [] as number[],
    features: { ...DEFAULT_SALESMAN_FEATURES } as SalesmanFeatures,
    assignedCountries: [] as string[],
  });
  const [countrySearch, setCountrySearch] = useState("");
  const [salesmanSearch, setSalesmanSearch] = useState("");
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

  const { data: salesmenList } = useQuery<SalesmanOption[]>({
    queryKey: ["/api/users/salesmen-list"],
    queryFn: async () => {
      const res = await fetch("/api/users/salesmen-list", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load salesmen");
      return res.json();
    },
  });

  useEffect(() => {
    if (userData && !loaded) {
      setForm({
        email: userData.email,
        name: userData.name,
        surname: userData.surname ?? "",
        mobileNumber: userData.mobileNumber ?? "",
        isActive: userData.isActive,
        isMasterSalesman: userData.isMasterSalesman ?? false,
        role: (userData.role as UserRole) ?? "salesman",
        parentSalesmanIds: Array.isArray(userData.parentSalesmanIds) && userData.parentSalesmanIds.length > 0
          ? userData.parentSalesmanIds
          : (userData.parentSalesmanId != null ? [userData.parentSalesmanId] : []),
        features: { ...userData.features },
        assignedCountries: userData.assignedCountries ?? [],
      });
      setLoaded(true);
    }
  }, [userData, loaded]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User created" });
      setLocation("/users");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", `/api/users/${userId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      toast({ title: "User updated" });
      setLocation("/users");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      email: form.email,
      name: form.name,
      surname: form.surname,
      mobileNumber: form.mobileNumber,
      isActive: form.isActive,
      isMasterSalesman: form.role === "master",
      role: form.role,
      parentSalesmanIds: form.role === "backoffice" ? form.parentSalesmanIds : [],
      features: form.features,
      assignedCountries: (form.role === "salesman" || form.role === "master") ? (form.assignedCountries.length > 0 ? form.assignedCountries : null) : null,
    };

    if (isNew) {
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate(payload);
    }
  };

  const handleRoleChange = (newRole: UserRole) => {
    setForm(f => ({
      ...f,
      role: newRole,
      isMasterSalesman: newRole === "master",
      parentSalesmanIds: newRole === "backoffice" ? f.parentSalesmanIds : [],
    }));
  };

  const showOfferFeatures = ROLES_WITH_OFFER_FEATURES.includes(form.role);

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
    salesman: "Full CRM access — offers, customers, machines",
    master: "Full administrative access to everything",
    backoffice: "Linked to a salesman — access to orders and related data",
    amministrazione: "Payments, invoices, delivery notes on orders",
    tecnico: "Technical data and specs on orders",
    produzione: "Production progress tracking on orders",
    service: "Assembly and installation management on orders",
    tecnico_commerciale: "Manages technical drawings and fulfils drawing requests from salesmen",
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <PageHeader
          title={isNew ? "Add User" : "Edit User"}
          subtitle={isNew ? "Create a new user account" : `Editing: ${userData?.name ?? ""} ${userData?.surname ?? ""}`}
          icon={<UserCog className="w-6 h-6 text-primary" />}
        />

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-lg border bg-card p-6 space-y-5">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Account Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>First Name *</Label>
                <Input data-testid="input-user-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Surname</Label>
                <Input data-testid="input-user-surname" value={form.surname} onChange={e => setForm(f => ({ ...f, surname: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Email *</Label>
                <Input data-testid="input-user-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Mobile Number</Label>
                <Input data-testid="input-user-mobile" type="tel" value={form.mobileNumber} onChange={e => setForm(f => ({ ...f, mobileNumber: e.target.value }))} />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Internal users sign in with their company Google account (when OAuth is enabled). Make sure the email above matches the account they will use to log in.
            </p>
          </div>

          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Role & Settings</h3>

            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={(v) => handleRoleChange(v as UserRole)}>
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map(r => (
                    <SelectItem key={r} value={r}>{USER_ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{roleDescription[form.role]}</p>
            </div>

            {form.role === "backoffice" && (
              <div className="space-y-2" data-testid="parent-salesmen-card">
                <Label>Parent Salesmen *</Label>

                {form.parentSalesmanIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.parentSalesmanIds.map(pid => {
                      const s = (salesmenList ?? []).find(x => x.id === pid);
                      const label = s ? `${s.name} ${s.surname}`.trim() : `#${pid}`;
                      return (
                        <Badge key={pid} variant="secondary" className="gap-1 pr-1" data-testid={`badge-parent-salesman-${pid}`}>
                          {label}
                          <button
                            type="button"
                            className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                            onClick={() => setForm(f => ({ ...f, parentSalesmanIds: f.parentSalesmanIds.filter(id => id !== pid) }))}
                            data-testid={`remove-parent-salesman-${pid}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca venditori..."
                    value={salesmanSearch}
                    onChange={e => setSalesmanSearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-parent-salesman-search"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                  {(salesmenList ?? [])
                    .filter(s => {
                      if (form.parentSalesmanIds.includes(s.id)) return false;
                      if (!salesmanSearch) return true;
                      const q = salesmanSearch.toLowerCase();
                      return `${s.name} ${s.surname}`.toLowerCase().includes(q);
                    })
                    .map(s => (
                      <button
                        key={s.id}
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
                        onClick={() => {
                          setForm(f => ({ ...f, parentSalesmanIds: [...f.parentSalesmanIds, s.id] }));
                          setSalesmanSearch("");
                        }}
                        data-testid={`add-parent-salesman-${s.id}`}
                      >
                        {s.name} {s.surname}
                      </button>
                    ))}
                  {(salesmenList ?? []).filter(s => !form.parentSalesmanIds.includes(s.id)).length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Nessun venditore disponibile.</p>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">L'utente avrà accesso a commesse, clienti e dealer collegati a tutti i venditori selezionati.</p>
              </div>
            )}

            <div className="flex items-center justify-between py-1">
              <Label>Account Active</Label>
              <Switch data-testid="switch-user-active" checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
            </div>
          </div>

          {showOfferFeatures && (
            <div className="rounded-lg border bg-card p-6 space-y-3">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Permissions</h3>
              {(Object.keys(FEATURE_LABELS) as (keyof SalesmanFeatures)[]).map(key => (
                <div key={key} className="flex items-center justify-between py-1.5">
                  <span className="text-sm">{FEATURE_LABELS[key]}</span>
                  <Switch
                    checked={!!form.features[key]}
                    onCheckedChange={v => setForm(f => ({ ...f, features: { ...f.features, [key]: v } }))}
                  />
                </div>
              ))}
            </div>
          )}

          {(form.role === "salesman" || form.role === "master") && (
            <div className="rounded-lg border bg-card p-6 space-y-4" data-testid="territory-card">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Assigned Territory</h3>
              </div>

              {form.assignedCountries.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.assignedCountries.map(code => {
                    const country = WORLD_COUNTRIES.find(c => c.code === code);
                    return (
                      <Badge key={code} variant="secondary" className="gap-1 pr-1">
                        {country ? country.name : code}
                        <button
                          type="button"
                          className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                          onClick={() => setForm(f => ({ ...f, assignedCountries: f.assignedCountries.filter(c => c !== code) }))}
                          data-testid={`remove-country-${code}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search countries..."
                  value={countrySearch}
                  onChange={e => setCountrySearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-country-search"
                />
              </div>

              <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                {WORLD_COUNTRIES
                  .filter(c => {
                    if (!countrySearch) return !form.assignedCountries.includes(c.code);
                    const q = countrySearch.toLowerCase();
                    return (c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) && !form.assignedCountries.includes(c.code);
                  })
                  .slice(0, 50)
                  .map(c => (
                    <button
                      key={c.code}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center justify-between"
                      onClick={() => {
                        setForm(f => ({ ...f, assignedCountries: [...f.assignedCountries, c.code].sort() }));
                        setCountrySearch("");
                      }}
                      data-testid={`add-country-${c.code}`}
                    >
                      <span>{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.code}</span>
                    </button>
                  ))}
              </div>

              {form.assignedCountries.length === 0 && (
                <p className="text-xs text-muted-foreground">No countries assigned — this user has no territory restrictions.</p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={isPending} data-testid="button-save-user">
              {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Save className="w-4 h-4 mr-1.5" />
              {isNew ? "Create User" : "Save Changes"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setLocation("/users")}>Cancel</Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
