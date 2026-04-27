import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type {
  AiRun,
  AiWorkflowOutput,
  EnquirySummaryOutput,
  MachineRecommendationOutput,
  OfferTextDraftOutput,
  PresetRecommendationOutput,
  RiskReviewOutput,
  AutoQuoteOutput,
  SimilarOffersOutput,
  ConfigSafetyGuardOutput,
  SalesInsight,
  MachineUsageStat,
  OptionUsageStat,
  PricingDistribution,
  OfferPattern,
  QuoteContext,
} from "@/components/ai/types";

interface AiWorkflowResult<T extends AiWorkflowOutput> {
  run: AiRun;
  output: T | null;
}

async function postAssistant<T extends AiWorkflowOutput>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<AiWorkflowResult<T>> {
  const res = await fetch(`/api/assistant/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function useSummarizeEnquiry() {
  return useMutation<
    AiWorkflowResult<EnquirySummaryOutput>,
    Error,
    {
      enquirySubject: string;
      enquiryNotes: string;
      customerName: string;
      customerAddress?: string;
      dealerName?: string;
      attachmentNames?: string[];
      existingItems?: Array<{ machineName: string; quantity: number }>;
      language?: "en" | "it";
      enquiryId?: number;
    }
  >({
    mutationFn: (body) => postAssistant("summarize-enquiry", body),
  });
}

export function useRecommendMachines() {
  return useMutation<
    AiWorkflowResult<MachineRecommendationOutput>,
    Error,
    {
      requirements: string;
      customerIndustry?: string;
      budget?: string;
      availableMachines: Array<{
        id: number;
        name: string;
        macroType: string | null;
        description: string;
        basePrice: string;
        options: Array<{ id: number; name: string; priceModifier: string }>;
      }>;
      language?: "en" | "it";
      offerId?: number;
    }
  >({
    mutationFn: (body) => postAssistant("recommend-machines", body),
  });
}

export function useDraftOfferText() {
  return useMutation<
    AiWorkflowResult<OfferTextDraftOutput>,
    Error,
    {
      offerSubject: string;
      customerName: string;
      selectedMachines: Array<{ name: string; description: string; quantity: number }>;
      availableSections: Array<{ id: string; name: string }>;
      availablePresets: Array<{ id: number; title: string; content: string }>;
      notes?: string;
      tone?: "formal" | "concise" | "persuasive";
      language?: "en" | "it";
      offerId?: number;
    }
  >({
    mutationFn: (body) => postAssistant("draft-offer-text", body),
  });
}

export function useRecommendPresets() {
  return useMutation<
    AiWorkflowResult<PresetRecommendationOutput>,
    Error,
    {
      offerSubject: string;
      customerName: string;
      selectedMachines: Array<{
        id: number;
        name: string;
        macroType: string | null;
        options: Array<{ id: number; name: string }>;
      }>;
      availablePresets: Array<{ id: number; title: string; content: string; category?: string }>;
      availableOptions: Array<{ id: number; name: string; machineId: number; machineName: string }>;
      notes?: string;
      language?: "en" | "it";
      offerId?: number;
    }
  >({
    mutationFn: (body) => postAssistant("recommend-presets", body),
  });
}

export function useReviewRisks() {
  return useMutation<
    AiWorkflowResult<RiskReviewOutput>,
    Error,
    {
      offerSubject: string;
      customerName: string;
      customerAddress?: string;
      totalPrice?: string;
      selectedMachines: Array<{ name: string; quantity: number; unitPrice?: string }>;
      selectedPresets?: Array<{ title: string; content: string }>;
      offerNotes?: string;
      enquiryNotes?: string;
      language?: "en" | "it";
      offerId?: number;
    }
  >({
    mutationFn: (body) => postAssistant("review-risks", body),
  });
}

export function useAutoQuote() {
  return useMutation<
    AiWorkflowResult<AutoQuoteOutput>,
    Error,
    {
      enquirySubject: string;
      enquiryNotes: string;
      customerName: string;
      customerAddress?: string;
      dealerName?: string;
      attachmentNames?: string[];
      salesmanNotes?: string;
      availableMachines: Array<{
        id: number;
        name: string;
        macroType: string | null;
        description: string;
        basePrice: string;
        options: Array<{ id: number; name: string; priceModifier: string }>;
      }>;
      availableSections?: Array<{ id: string; name: string }>;
      availablePresets?: Array<{ id: number; title: string; content: string }>;
      language?: "en" | "it";
      enquiryId?: number;
    }
  >({
    mutationFn: (body) => postAssistant("auto-quote", body),
  });
}

export function useGenerateEmbedding() {
  return useMutation<
    { stored: boolean },
    Error,
    {
      offerId: number;
      subject: string;
      customerName?: string;
      machines: Array<{
        name: string;
        macroType?: string | null;
        description?: string;
        options?: string[];
      }>;
      presets?: string[];
      notes?: string;
    }
  >({
    mutationFn: async (body) => {
      const res = await fetch("/api/assistant/generate-embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(err.message ?? "Embedding generation failed");
      }
      return res.json();
    },
  });
}

export function useConfigSafetyGuard() {
  return useMutation<
    AiWorkflowResult<ConfigSafetyGuardOutput>,
    Error,
    {
      offerSubject: string;
      customerName: string;
      customerAddress?: string;
      totalPrice?: string;
      selectedMachines: Array<{
        name: string;
        quantity: number;
        unitPrice?: string;
        macroType?: string | null;
        options: Array<{ name: string; priceModifier?: string }>;
      }>;
      selectedPresets: Array<{ title: string; content: string }>;
      offerNotes?: string;
      enquiryNotes?: string;
      historicalContext?: string;
      language?: "en" | "it";
      offerId?: number;
    }
  >({
    mutationFn: (body) => postAssistant("config-safety-guard", body as unknown as Record<string, unknown>),
  });
}

export function useSimilarOffers() {
  return useMutation<
    AiWorkflowResult<SimilarOffersOutput>,
    Error,
    {
      queryText: string;
      topK?: number;
      excludeOfferIds?: number[];
      enquiryId?: number;
    }
  >({
    mutationFn: (body) => postAssistant("similar-offers", body as unknown as Record<string, unknown>),
  });
}

export function useSubmitFeedback() {
  return useMutation<
    unknown,
    Error,
    {
      runId: string;
      rating: "accepted" | "rejected" | "modified";
      feedbackType?: "overall" | "field_level" | "suggestion";
      fieldKey?: string;
      originalValue?: string;
      modifiedValue?: string;
      score?: number;
      comment?: string;
    }
  >({
    mutationFn: async (body) => {
      const res = await fetch("/api/assistant/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(err.message ?? "Feedback submission failed");
      }
      return res.json();
    },
  });
}

export function useSalesInsights() {
  return useQuery<SalesInsight[]>({
    queryKey: ["/api/sales-brain/insights"],
  });
}

export function useMachineStats(macroType?: string) {
  const url = macroType
    ? `/api/sales-brain/machine-stats?macroType=${encodeURIComponent(macroType)}`
    : "/api/sales-brain/machine-stats";
  return useQuery<MachineUsageStat[]>({
    queryKey: [url],
  });
}

export function useOptionStats(machineId: number | undefined) {
  return useQuery<OptionUsageStat[]>({
    queryKey: ["/api/sales-brain/option-stats", machineId],
    enabled: machineId !== undefined,
  });
}

export function usePricingDistribution(machineId: number | undefined) {
  return useQuery<PricingDistribution | null>({
    queryKey: ["/api/sales-brain/pricing", machineId],
    enabled: machineId !== undefined,
  });
}

export function useOfferPatterns(type?: string) {
  const url = type
    ? `/api/sales-brain/patterns?type=${encodeURIComponent(type)}`
    : "/api/sales-brain/patterns";
  return useQuery<OfferPattern[]>({
    queryKey: [url],
  });
}

export function useQuoteContext(machineIds: number[]) {
  const params = machineIds.map((id) => `machineIds=${id}`).join("&");
  const url = params
    ? `/api/sales-brain/quote-context?${params}`
    : "/api/sales-brain/quote-context";
  return useQuery<QuoteContext>({
    queryKey: [url],
    enabled: machineIds.length > 0,
  });
}

export function useRefreshAnalytics() {
  return useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sales-brain/refresh");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/sales-brain");
        },
      });
    },
  });
}
