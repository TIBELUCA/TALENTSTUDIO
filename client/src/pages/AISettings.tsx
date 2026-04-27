import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface AiSettings {
  enabled: boolean;
  hasKey: boolean;
}

export default function AISettings() {
  const { toast } = useToast();
  const { isMaster } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AiSettings>({
    queryKey: ["/api/settings/ai"],
    queryFn: async () => {
      const res = await fetch("/api/settings/ai", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load AI settings");
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PUT", "/api/settings/ai", { enabled });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["/api/settings/ai"], (old: AiSettings | undefined) =>
        old ? { ...old, enabled: result.enabled } : old
      );
      toast({
        title: result.enabled ? "AI Services enabled" : "AI Services disabled",
        description: result.enabled
          ? "AI features are now available across the application."
          : "AI features have been turned off.",
      });
    },
    onError: () => {
      toast({ title: "Failed to update AI settings", variant: "destructive" });
    },
  });

  return (
    <Layout>
      <div className="max-w-2xl space-y-6">
        <PageHeader
          title="AI Services"
          subtitle="Configure and control AI-powered features across QuotePilot."
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-6 space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-violet-600 shrink-0">
                  <Sparkles className="w-6 h-6 text-white" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Enable AI Services</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    When enabled, AI-powered features such as "Analyze with AI", machine recommendations,
                    offer text drafting, risk review, and auto-quote become available.
                  </p>
                </div>
                {isMaster ? (
                  <Switch
                    checked={data?.enabled ?? false}
                    onCheckedChange={(checked) => toggleMutation.mutate(checked)}
                    disabled={toggleMutation.isPending}
                    data-testid="switch-ai-enabled"
                  />
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Read-only
                  </Badge>
                )}
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Configuration Status
                </p>
                <div className="flex items-center gap-2 text-sm">
                  {data?.hasKey ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  )}
                  <span className={data?.hasKey ? "text-foreground" : "text-muted-foreground"}>
                    OpenAI API key {data?.hasKey ? "configured" : "not configured"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {data?.enabled ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className={data?.enabled ? "text-foreground" : "text-muted-foreground"}>
                    AI services {data?.enabled ? "enabled" : "disabled"}
                  </span>
                </div>
                {data?.enabled && !data?.hasKey && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      AI services are enabled but no API key is configured. AI features will not
                      work until a valid <code className="font-mono text-xs">OPENAI_API_KEY</code> is set.
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Available AI Features
              </p>
              <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground">
                {[
                  "Analyze enquiry with AI (summarize customer requirements)",
                  "Machine recommendations based on requirements",
                  "Draft offer introduction and conclusion text",
                  "Recommend Terms & Conditions presets",
                  "Review offer for commercial and technical risks",
                  "Auto-quote generation from enquiry",
                  "Configuration safety guard",
                  "Similar offers search",
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${data?.enabled && data?.hasKey ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
