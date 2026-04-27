import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import logoScritta from "@assets/logo_scritta_1777299867539.png";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed: "Devi usare un account autorizzato.",
  user_not_found: "Account non abilitato. Contatta l'amministratore.",
  user_disabled: "Account disabilitato. Contatta l'amministratore.",
  oauth_failed: "Accesso con Google non riuscito. Riprova.",
  oauth_not_configured: "Login con Google non configurato.",
};

export default function Login() {
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errCode = params.get("error");
    const reason = params.get("reason");
    if (errCode) {
      const baseMsg = OAUTH_ERROR_MESSAGES[errCode] ?? "Errore durante l'accesso. Riprova.";
      setOauthError(reason ? `${baseMsg} [${errCode}: ${reason}]` : baseMsg);
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.pathname + url.hash);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/master/login", { email: email.trim(), password });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      window.location.href = "/";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Accesso non riuscito.";
      setFormError(msg.replace(/^\d+:\s*/, "") || "Credenziali non valide.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[45%]" aria-hidden>
        <div className="absolute -left-20 top-10 w-72 h-72 rounded-full bg-pink-500 opacity-60 blur-2xl" />
        <div className="absolute -left-10 top-40 w-56 h-56 rounded-full bg-purple-500 opacity-50 blur-2xl" />
        <div className="absolute left-0 bottom-16 w-80 h-80 rounded-full bg-rose-400 opacity-50 blur-2xl" />
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[45%]" aria-hidden>
        <div className="absolute -right-20 top-8 w-72 h-72 rounded-full bg-amber-300 opacity-60 blur-2xl" />
        <div className="absolute -right-10 top-60 w-56 h-56 rounded-full bg-orange-400 opacity-50 blur-2xl" />
        <div className="absolute right-0 bottom-20 w-80 h-80 rounded-full bg-fuchsia-400 opacity-50 blur-2xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/40 p-10">
          <div className="text-center mb-8">
            <img
              src={logoScritta}
              alt="Talent Studio"
              className="h-12 mx-auto"
              data-testid="img-app-logo"
            />
            <p className="text-sm text-muted-foreground mt-3">
              Gestionale per talent manager.
            </p>
          </div>

          {(oauthError || formError) && (
            <div
              className="mb-5 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              data-testid="text-login-error"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{formError ?? oauthError}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-password"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full h-12 text-base"
              disabled={submitting}
              data-testid="button-login"
            >
              {submitting && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
              Accedi
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Login con Google temporaneamente disabilitato.
          </p>
        </div>
      </div>
    </div>
  );
}
