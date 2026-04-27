import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Camera, Loader2, Save, KeyRound, User, Eye, EyeOff, ShieldCheck, Building2, FileText, Mail, Trash2, Star, ExternalLink, Pencil, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface DealerCompanyInfo {
  id: number;
  companyName: string;
  address?: string;
  vatNumber?: string;
  state?: string;
  city?: string;
  postalCode?: string;
  email?: string;
  phone?: string;
}

interface AccountProfile {
  type: "master" | "salesman" | "dealer";
  id: string | number;
  name: string;
  surname: string;
  email: string;
  mobileNumber: string;
  photoUrl: string | null;
  isMasterSalesman?: boolean;
  isActive?: boolean;
  role?: string;
  dealerCompany?: DealerCompanyInfo | null;
}

export default function MyAccount() {
  const { user, isDealer } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editForm, setEditForm] = useState<{ name: string; surname: string; mobileNumber: string; email: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: profile, isLoading } = useQuery<AccountProfile>({
    queryKey: ["/api/account"],
    queryFn: () => fetch("/api/account", { credentials: "include" }).then(r => r.json()),
    staleTime: 0,
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/account", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/account"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Profile updated successfully" });
      setEditForm(null);
      setPassword("");
      setConfirmPassword("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update", variant: "destructive" });
    },
  });

  const handleEdit = () => {
    if (!profile) return;
    setEditForm({ name: profile.name, surname: profile.surname, mobileNumber: profile.mobileNumber, email: profile.email });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm) return;
    if (password && password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    const payload: any = { ...editForm };
    if (password) payload.password = password;
    updateMutation.mutate(payload);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/account/photo", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      queryClient.invalidateQueries({ queryKey: ["/api/account"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Photo updated" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isMasterType = profile?.type === "master";

  const content = (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="My Account" subtitle="View and edit your profile information" />

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {profile && (
        <>
          {/* Avatar section */}
          <div className="flex items-center gap-6">
            <div className="relative">
              {profile.photoUrl ? (
                <img
                  src={profile.photoUrl}
                  alt="Profile photo"
                  className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                  data-testid="img-profile-photo"
                />
              ) : (
                <div
                  className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border-4 border-white shadow-lg flex items-center justify-center"
                  data-testid="div-profile-initials"
                >
                  <span className="text-3xl font-bold text-primary">
                    {(profile.name?.[0] || profile.email?.[0] || "U").toUpperCase()}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                data-testid="button-upload-photo"
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handlePhotoUpload}
                data-testid="input-photo-file"
              />
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                {profile.name}{profile.surname ? ` ${profile.surname}` : ""}
              </h2>
              <p className="text-muted-foreground text-sm">{profile.email}</p>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {profile.type === "master" && (
                  <Badge className="bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-100">
                    <ShieldCheck className="w-3 h-3 mr-1" /> Master
                  </Badge>
                )}
                {profile.type === "salesman" && profile.isMasterSalesman && (
                  <Badge className="bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-100">
                    <ShieldCheck className="w-3 h-3 mr-1" /> Master Salesman
                  </Badge>
                )}
                {profile.type === "salesman" && !profile.isMasterSalesman && (
                  <Badge variant="secondary">
                    <User className="w-3 h-3 mr-1" /> Salesman
                  </Badge>
                )}
                {profile.type === "dealer" && (
                  <Badge className="bg-teal-100 text-teal-700 border border-teal-300 hover:bg-teal-100">
                    <User className="w-3 h-3 mr-1" /> Dealer
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Profile form */}
          <div className="rounded-lg border bg-white/60 backdrop-blur-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Profile Information</h3>
              {!editForm && (
                <Button type="button" variant="outline" size="sm" onClick={handleEdit} data-testid="button-edit-profile">
                  Edit
                </Button>
              )}
            </div>

            {!editForm ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">First Name</p>
                  <p className="font-medium" data-testid="text-profile-name">{profile.name || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Surname</p>
                  <p className="font-medium" data-testid="text-profile-surname">{profile.surname || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Email</p>
                  <p className="font-medium" data-testid="text-profile-email">{profile.email || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Mobile</p>
                  <p className="font-medium" data-testid="text-profile-mobile">{profile.mobileNumber || "—"}</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="acc-name">First Name</Label>
                    <Input
                      id="acc-name"
                      data-testid="input-acc-name"
                      value={editForm.name}
                      onChange={e => setEditForm(f => f && ({ ...f, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="acc-surname">Surname</Label>
                    <Input
                      id="acc-surname"
                      data-testid="input-acc-surname"
                      value={editForm.surname}
                      onChange={e => setEditForm(f => f && ({ ...f, surname: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="acc-email">Email {isMasterType && <span className="text-xs text-muted-foreground">(managed by Replit, for display only)</span>}</Label>
                    <Input
                      id="acc-email"
                      data-testid="input-acc-email"
                      type="email"
                      value={editForm.email}
                      onChange={e => setEditForm(f => f && ({ ...f, email: e.target.value }))}
                      readOnly={isMasterType}
                      className={isMasterType ? "bg-muted" : ""}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="acc-mobile">Mobile</Label>
                    <Input
                      id="acc-mobile"
                      data-testid="input-acc-mobile"
                      type="tel"
                      value={editForm.mobileNumber}
                      onChange={e => setEditForm(f => f && ({ ...f, mobileNumber: e.target.value }))}
                      placeholder="+39 333 1234567"
                    />
                  </div>
                </div>

                {!isMasterType && (
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5" />
                      Change Password <span className="text-xs text-muted-foreground font-normal">(leave blank to keep current)</span>
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label htmlFor="acc-password">New Password</Label>
                        <div className="relative">
                          <Input
                            id="acc-password"
                            data-testid="input-acc-password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="New password"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowPassword(v => !v)}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="acc-confirm">Confirm Password</Label>
                        <Input
                          id="acc-confirm"
                          data-testid="input-acc-confirm"
                          type={showPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          placeholder="Confirm password"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-profile">
                    {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    <Save className="w-4 h-4 mr-1.5" />
                    Save Changes
                  </Button>
                  <Button type="button" variant="outline" onClick={() => { setEditForm(null); setPassword(""); setConfirmPassword(""); }}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>

          {/* Dealer Company Info (read-only) */}
          {profile.type === "dealer" && profile.dealerCompany && (
            <div className="rounded-lg border bg-white/60 backdrop-blur-sm p-6 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-teal-600" /> Company Information
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Company Name</p>
                  <p className="font-medium" data-testid="text-company-name">{profile.dealerCompany.companyName || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">VAT Number</p>
                  <p className="font-medium" data-testid="text-company-vat">{profile.dealerCompany.vatNumber || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">State / Country</p>
                  <p className="font-medium" data-testid="text-company-state">{profile.dealerCompany.state || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Address</p>
                  <p className="font-medium" data-testid="text-company-address">
                    {[profile.dealerCompany.address, profile.dealerCompany.city, profile.dealerCompany.postalCode].filter(Boolean).join(", ") || "—"}
                  </p>
                </div>
                {profile.dealerCompany.email && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Company Email</p>
                    <p className="font-medium" data-testid="text-company-email">{profile.dealerCompany.email}</p>
                  </div>
                )}
                {profile.dealerCompany.phone && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Company Phone</p>
                    <p className="font-medium" data-testid="text-company-phone">{profile.dealerCompany.phone}</p>
                  </div>
                )}
                {profile.role && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Your Role</p>
                    <p className="font-medium" data-testid="text-contact-role">{profile.role}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Document Format link (dealer only) */}
          {profile.type === "dealer" && profile.dealerCompany && (
            <div className="rounded-lg border bg-white/60 backdrop-blur-sm p-6 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold">Document Format</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Customize your dealer document format — sections, fonts, colors, header, and footer — from the dedicated format page.
              </p>
              <a href="/dealer/format" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium" data-testid="link-dealer-format">
                Open Document Format Settings →
              </a>
            </div>
          )}

          <EmailIntegrationSection />
        </>
      )}
    </div>
  );

  if (isDealer) {
    return <DealerLayout>{content}</DealerLayout>;
  }
  return <Layout>{content}</Layout>;
}

interface EmailConn {
  id: number;
  provider: string;
  providerAccountEmail: string | null;
  isDefault: boolean;
  senderDisplayName: string | null;
  signature: string | null;
  connectedAt: string;
  // Background-index status (Gmail only). Null on non-gmail providers and on
  // gmail connections that have not yet completed their first backfill.
  gmailIndexBackfilledAt?: string | null;
  gmailIndexLastSyncedAt?: string | null;
  gmailIndexLastError?: string | null;
  gmailIndexLastErrorAt?: string | null;
}

// Human-friendly "X minuti fa" for sync timestamps. Falls back to a date for
// anything older than 24h so users still see a precise reference.
function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "mai";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "mai";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.max(0, Math.round(diffMs / 1000));
  if (sec < 45) return "pochi secondi fa";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} ${min === 1 ? "minuto" : "minuti"} fa`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? "ora" : "ore"} fa`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} ${day === 1 ? "giorno" : "giorni"} fa`;
  return d.toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function EmailIntegrationSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editSignature, setEditSignature] = useState("");

  const { data: connections, isLoading } = useQuery<EmailConn[]>({
    queryKey: ["/api/email/connections"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/email/connections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/connections"] });
      toast({ title: "Account email disconnesso" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/email/connections/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/connections"] });
      setEditingId(null);
      toast({ title: "Impostazioni aggiornate" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/email/connections/${id}`, { isDefault: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/connections"] });
      toast({ title: "Provider predefinito aggiornato" });
    },
  });

  // "Sincronizza adesso" — triggers a Gmail metadata-index sync and shows the
  // outcome via toast. We always invalidate the connections query so the
  // displayed timestamps and error state refresh, even on failure (the server
  // returns the latest persisted state in the response body either way).
  const syncMutation = useMutation({
    mutationFn: async (id: number) => {
      const resp = await fetch(`/api/email/connections/${id}/sync`, {
        method: "POST",
        credentials: "include",
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error || "Sincronizzazione fallita");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/connections"] });
      toast({ title: "Archivio email aggiornato" });
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/connections"] });
      toast({
        title: "Sincronizzazione fallita",
        description: err?.message || "Riprova più tardi.",
        variant: "destructive",
      });
    },
  });

  const startEdit = (conn: EmailConn) => {
    setEditingId(conn.id);
    setEditDisplayName(conn.senderDisplayName || "");
    setEditSignature(conn.signature || "");
  };

  const handleConnect = async (provider: "google" | "outlook") => {
    try {
      const resp = await fetch(`/api/email/oauth/${provider}/start`, { credentials: "include" });
      const data = await resp.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.message) {
        toast({ title: "Errore", description: data.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    }
  };

  const gmailConn = connections?.find(c => c.provider === "gmail");
  const outlookConn = connections?.find(c => c.provider === "outlook");

  return (
    <div className="rounded-lg border bg-white/60 dark:bg-card backdrop-blur-sm p-6 space-y-4" data-testid="section-email-integrations">
      <div className="flex items-center gap-2">
        <Mail className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-lg">Integrazione Email</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Collega il tuo account Gmail o Outlook per inviare offerte direttamente da QuotePilot.
      </p>

      {isLoading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}

      <div className="space-y-3">
        <EmailProviderRow
          label="Gmail"
          provider="gmail"
          conn={gmailConn || null}
          onConnect={() => handleConnect("google")}
          onDisconnect={(id) => deleteMutation.mutate(id)}
          onSetDefault={(id) => setDefaultMutation.mutate(id)}
          onEdit={startEdit}
          onSyncNow={(id) => syncMutation.mutate(id)}
          syncingId={syncMutation.isPending ? syncMutation.variables ?? null : null}
          isDeleting={deleteMutation.isPending}
        />
        <EmailProviderRow
          label="Outlook / Microsoft 365"
          provider="outlook"
          conn={outlookConn || null}
          onConnect={() => handleConnect("outlook")}
          onDisconnect={(id) => deleteMutation.mutate(id)}
          onSetDefault={(id) => setDefaultMutation.mutate(id)}
          onEdit={startEdit}
          onSyncNow={(id) => syncMutation.mutate(id)}
          syncingId={syncMutation.isPending ? syncMutation.variables ?? null : null}
          isDeleting={deleteMutation.isPending}
        />
      </div>

      {editingId && (() => {
        const conn = connections?.find(c => c.id === editingId);
        if (!conn) return null;
        return (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/20" data-testid="email-edit-form">
            <p className="text-sm font-semibold">
              Modifica {conn.provider === "gmail" ? "Gmail" : "Outlook"} — {conn.providerAccountEmail}
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome mittente</Label>
              <Input
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="es. Mario Rossi"
                data-testid="input-sender-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Firma email</Label>
              <Textarea
                value={editSignature}
                onChange={(e) => setEditSignature(e.target.value)}
                placeholder="La tua firma email..."
                className="min-h-[80px]"
                data-testid="textarea-signature"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => updateMutation.mutate({
                  id: editingId,
                  data: { senderDisplayName: editDisplayName, signature: editSignature },
                })}
                disabled={updateMutation.isPending}
                data-testid="btn-save-email-settings"
              >
                {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                Salva
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} data-testid="btn-cancel-email-edit">
                Annulla
              </Button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function EmailProviderRow({
  label, provider, conn, onConnect, onDisconnect, onSetDefault, onEdit, onSyncNow, syncingId, isDeleting,
}: {
  label: string;
  provider: string;
  conn: EmailConn | null;
  onConnect: () => void;
  onDisconnect: (id: number) => void;
  onSetDefault: (id: number) => void;
  onEdit: (conn: EmailConn) => void;
  onSyncNow: (id: number) => void;
  syncingId: number | null;
  isDeleting: boolean;
}) {
  // Sync metadata only exists for Gmail (the only provider with a local
  // background-indexed cache today). For Outlook the row keeps its compact
  // pre-task layout — we just render the connection state and actions.
  const isGmail = provider === "gmail";
  const isSyncing = !!conn && syncingId === conn.id;
  const hasError = !!conn && !!conn.gmailIndexLastError;
  const lastSyncIso = conn?.gmailIndexLastSyncedAt ?? null;
  const lastSyncTitle = lastSyncIso
    ? new Date(lastSyncIso).toLocaleString("it-IT")
    : undefined;

  return (
    <div className="rounded-md border bg-background" data-testid={`email-provider-${provider}`}>
      <div className="flex items-center gap-3 p-3">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          {conn ? (
            <p className="text-xs text-green-600 dark:text-green-400 truncate">{conn.providerAccountEmail || "Collegato"}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Non collegato</p>
          )}
        </div>
        {conn && conn.isDefault && (
          <Badge variant="secondary" className="text-[10px] shrink-0">Predefinito</Badge>
        )}
        {conn ? (
          <div className="flex items-center gap-1 shrink-0">
            {!conn.isDefault && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onSetDefault(conn.id)} data-testid={`btn-set-default-${provider}`}>
                <Star className="w-3.5 h-3.5 mr-1" /> Predefinito
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(conn)} data-testid={`btn-edit-${provider}`}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onConnect()} data-testid={`btn-reconnect-${provider}`}>
              <ExternalLink className="w-3.5 h-3.5 mr-1" /> Ricollega
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => onDisconnect(conn.id)} disabled={isDeleting} data-testid={`btn-disconnect-${provider}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={onConnect} data-testid={`btn-connect-${provider}`}>
            <ExternalLink className="w-3.5 h-3.5 mr-1" /> Collega
          </Button>
        )}
      </div>

      {/* Sync status footer — Gmail only. Always shown when the account is
          connected so the user can tell at a glance whether the local
          archive is fresh (and trigger a manual sync). */}
      {isGmail && conn && (
        <div className="border-t px-3 py-2 flex items-center gap-2 flex-wrap text-xs" data-testid={`gmail-sync-status-${provider}`}>
          {hasError ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          )}
          <span className="text-muted-foreground" title={lastSyncTitle} data-testid={`text-last-sync-${provider}`}>
            Ultima sincronizzazione: <span className="text-foreground font-medium">{formatRelativeTime(lastSyncIso)}</span>
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onSyncNow(conn.id)}
            disabled={isSyncing}
            data-testid={`btn-sync-now-${provider}`}
          >
            {isSyncing
              ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
            Sincronizza adesso
          </Button>
        </div>
      )}

      {isGmail && conn && hasError && (
        <div className="border-t px-3 py-2 flex items-start gap-2 text-xs bg-amber-500/10 text-amber-800 dark:text-amber-300" data-testid={`gmail-sync-error-${provider}`}>
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">Ultima sincronizzazione fallita.</div>
            <div className="opacity-90 break-words">
              {conn.gmailIndexLastError}
              {" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:opacity-80"
                onClick={onConnect}
                data-testid={`link-reconnect-${provider}`}
              >
                Riconnetti Gmail
              </button>
              {" "}se il problema persiste.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
