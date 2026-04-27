import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  X,
} from "lucide-react";
import {
  SummaryCard,
  MissingInfoList,
  RecommendationsList,
  DraftTextBlock,
  RiskAlerts,
  FullRiskReviewCard,
  PresetRecommendationsList,
  AutoQuoteCard,
  SimilarOffersCard,
  ConfigSafetyGuardCard,
} from "./sections";
import { SalesBrainCard } from "./SalesBrainCard";
import type {
  AiRun,
  EnquirySummaryOutput,
  MachineRecommendationOutput,
  MachineRecommendation,
  OfferTextDraftOutput,
  PresetRecommendationOutput,
  RiskReviewOutput,
  AutoQuoteOutput,
  SimilarOffersOutput,
  ConfigSafetyGuardOutput,
  SalesBrainData,
  AiWorkflowOutput,
  AiWorkflowType,
} from "./types";

export interface DraftInsertCallbacks {
  onInsertSubject?: (text: string) => void;
  onInsertSection?: (sectionId: string, text: string) => void;
  onInsertIntroduction?: (text: string) => void;
  onInsertClosing?: (text: string) => void;
  editedTexts?: Record<string, string>;
  onEditText?: (key: string, text: string) => void;
  insertedKeys?: Set<string>;
}

export interface AIAssistantPanelProps {
  isLoading?: boolean;
  error?: string | null;
  run?: AiRun | null;
  output?: AiWorkflowOutput | null;
  workflowType?: AiWorkflowType;
  onFeedback?: (runId: string, rating: "accepted" | "rejected" | "modified", comment?: string) => void;
  onDismiss?: () => void;
  onRetry?: () => void;
  feedbackPending?: boolean;
  defaultOpen?: boolean;
  title?: string;
  onAddMachine?: (rec: MachineRecommendation) => void;
  onViewMachine?: (machineId: number) => void;
  addedMachineIds?: Set<number>;
  draftCallbacks?: DraftInsertCallbacks;
}

function isEnquirySummary(output: AiWorkflowOutput, type?: AiWorkflowType): output is EnquirySummaryOutput {
  if (type === "enquiry_summary") return true;
  return "customerIntent" in output && "summary" in output && "keyRequirements" in output;
}
function isMachineRecommendation(output: AiWorkflowOutput, type?: AiWorkflowType): output is MachineRecommendationOutput {
  if (type === "machine_recommendation") return true;
  return "recommendations" in output && Array.isArray((output as MachineRecommendationOutput).recommendations);
}
function isOfferDraft(output: AiWorkflowOutput, type?: AiWorkflowType): output is OfferTextDraftOutput {
  if (type === "offer_text_draft") return true;
  return "subject" in output && "sections" in output && "suggestedPresetIds" in output;
}
function isPresetRecommendation(output: AiWorkflowOutput, type?: AiWorkflowType): output is PresetRecommendationOutput {
  if (type === "preset_recommendation") return true;
  return "suggestedPresets" in output && "suggestedOptions" in output;
}
function isRiskReview(output: AiWorkflowOutput, type?: AiWorkflowType): output is RiskReviewOutput {
  if (type === "risk_review") return true;
  return "overallRiskLevel" in output && "items" in output && "recommendedActions" in output;
}
function isAutoQuote(output: AiWorkflowOutput, type?: AiWorkflowType): output is AutoQuoteOutput {
  if (type === "auto_quote") return true;
  return "extractedRequirements" in output && "recommendedMachines" in output && "draftSubject" in output;
}
function isSimilarOffers(output: AiWorkflowOutput, type?: AiWorkflowType): output is SimilarOffersOutput {
  if (type === "similar_offers") return true;
  return "matches" in output && "queryContext" in output && "confidence" in output;
}
function isConfigSafetyGuard(output: AiWorkflowOutput, type?: AiWorkflowType): output is ConfigSafetyGuardOutput {
  if (type === "config_safety_guard") return true;
  return "configurationIssues" in output && "marginRisk" in output && "overallSafetyScore" in output;
}
function isSalesBrainData(output: AiWorkflowOutput, type?: AiWorkflowType): output is SalesBrainData {
  if (type === "sales_brain") return true;
  return "insights" in output && "machineStats" in output && "pricingDistributions" in output && "patterns" in output;
}

function WorkflowLabel({ type }: { type?: AiWorkflowType }) {
  const labels: Record<AiWorkflowType, string> = {
    enquiry_summary: "Enquiry Analysis",
    machine_recommendation: "Machine Recommendations",
    offer_text_draft: "Offer Draft",
    preset_recommendation: "Preset Suggestions",
    risk_review: "Risk Review",
    auto_quote: "Auto Quote",
    similar_offers: "Similar Offers",
    config_safety_guard: "Safety Check",
    sales_brain: "Sales Brain",
  };
  if (!type) return null;
  return <Badge variant="secondary" className="text-[10px]" data-testid="badge-workflow-type">{labels[type]}</Badge>;
}

function AIOutputRenderer({ output, workflowType, onAddMachine, onViewMachine, addedMachineIds, draftCallbacks }: {
  output: AiWorkflowOutput;
  workflowType?: AiWorkflowType;
  onAddMachine?: (rec: MachineRecommendation) => void;
  onViewMachine?: (machineId: number) => void;
  addedMachineIds?: Set<number>;
  draftCallbacks?: DraftInsertCallbacks;
}) {
  if (isEnquirySummary(output, workflowType)) {
    return (
      <div className="space-y-3" data-testid="ai-output-enquiry-summary">
        <SummaryCard
          summary={output.summary}
          customerIntent={output.customerIntent}
          keyRequirements={output.keyRequirements}
          suggestedPriority={output.suggestedPriority}
          estimatedComplexity={output.estimatedComplexity}
          confidence={output.confidence}
        />
        <MissingInfoList items={output.missingInformation} />
        <RiskAlerts flags={output.riskFlags} />
      </div>
    );
  }

  if (isMachineRecommendation(output, workflowType)) {
    return (
      <div className="space-y-3" data-testid="ai-output-machine-recommendation">
        <RecommendationsList
          recommendations={output.recommendations}
          confidence={output.confidence}
          dataGaps={output.dataGaps}
          generalNotes={output.generalNotes}
          onAddMachine={onAddMachine}
          onViewMachine={onViewMachine}
          addedMachineIds={addedMachineIds}
        />
      </div>
    );
  }

  if (isOfferDraft(output, workflowType)) {
    return (
      <div className="space-y-3" data-testid="ai-output-offer-draft">
        <DraftTextBlock
          subject={output.subject}
          introduction={output.introduction}
          sections={output.sections}
          closingParagraph={output.closingParagraph}
          tone={output.tone}
          confidence={output.confidence}
          onInsertSubject={draftCallbacks?.onInsertSubject}
          onInsertSection={draftCallbacks?.onInsertSection}
          onInsertIntroduction={draftCallbacks?.onInsertIntroduction}
          onInsertClosing={draftCallbacks?.onInsertClosing}
          editedTexts={draftCallbacks?.editedTexts}
          onEditText={draftCallbacks?.onEditText}
          insertedKeys={draftCallbacks?.insertedKeys}
        />
        <RiskAlerts flags={output.riskFlags} />
      </div>
    );
  }

  if (isPresetRecommendation(output, workflowType)) {
    return (
      <div className="space-y-3" data-testid="ai-output-preset-recommendation">
        <PresetRecommendationsList
          presets={output.suggestedPresets}
          options={output.suggestedOptions}
          exclusionWarnings={output.exclusionWarnings}
          generalNotes={output.generalNotes}
          confidence={output.confidence}
        />
      </div>
    );
  }

  if (isRiskReview(output, workflowType)) {
    return (
      <div className="space-y-3" data-testid="ai-output-risk-review">
        <FullRiskReviewCard
          overallRiskLevel={output.overallRiskLevel}
          items={output.items}
          missingCommercialDetails={output.missingCommercialDetails}
          missingTechnicalDetails={output.missingTechnicalDetails}
          pricingFlags={output.pricingFlags}
          recommendedActions={output.recommendedActions}
          confidence={output.confidence}
        />
      </div>
    );
  }

  if (isConfigSafetyGuard(output, workflowType)) {
    return (
      <div className="space-y-3" data-testid="ai-output-config-safety-guard">
        <ConfigSafetyGuardCard output={output} />
      </div>
    );
  }

  if (isSimilarOffers(output, workflowType)) {
    return (
      <div className="space-y-3" data-testid="ai-output-similar-offers">
        <SimilarOffersCard output={output} />
      </div>
    );
  }

  if (isAutoQuote(output, workflowType)) {
    return (
      <div className="space-y-3" data-testid="ai-output-auto-quote">
        <AutoQuoteCard output={output} />
      </div>
    );
  }

  if (isSalesBrainData(output, workflowType)) {
    return (
      <div className="space-y-3" data-testid="ai-output-sales-brain">
        <SalesBrainCard data={output} />
      </div>
    );
  }

  return (
    <div className="text-sm text-muted-foreground p-3 border rounded-md" data-testid="ai-output-raw">
      <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(output, null, 2)}</pre>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 p-1" data-testid="ai-loading-skeleton">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-4 text-center" data-testid="ai-error-state">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-destructive" data-testid="text-error-message">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} data-testid="button-retry">
          Try Again
        </Button>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 p-6 text-center" data-testid="ai-empty-state">
      <Bot className="h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground" data-testid="text-empty-message">
        Run an AI workflow to see results here
      </p>
    </div>
  );
}

function FeedbackActions({ onFeedback, feedbackPending }: {
  onFeedback: (rating: "accepted" | "rejected" | "modified") => void;
  feedbackPending?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 pt-2 border-t" data-testid="ai-feedback-actions">
      <span className="text-xs text-muted-foreground mr-auto">Was this helpful?</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onFeedback("accepted")}
        disabled={feedbackPending}
        aria-label="Accept AI suggestion"
        data-testid="button-feedback-accept"
      >
        <ThumbsUp className="h-3.5 w-3.5 mr-1" />
        Accept
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onFeedback("rejected")}
        disabled={feedbackPending}
        aria-label="Reject AI suggestion"
        data-testid="button-feedback-reject"
      >
        <ThumbsDown className="h-3.5 w-3.5 mr-1" />
        Reject
      </Button>
    </div>
  );
}

export function AIAssistantPanel({
  isLoading = false,
  error = null,
  run = null,
  output = null,
  workflowType,
  onFeedback,
  onDismiss,
  onRetry,
  feedbackPending = false,
  defaultOpen = true,
  title = "AI Assistant",
  onAddMachine,
  onViewMachine,
  addedMachineIds,
  draftCallbacks,
}: AIAssistantPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const resolvedType = workflowType ?? run?.workflow;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className="border-l bg-background flex flex-col h-full"
        data-testid="ai-assistant-panel"
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-muted/30 shrink-0">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label={isOpen ? "Collapse AI panel" : "Expand AI panel"}
              data-testid="button-toggle-panel"
            >
              {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold flex-1" data-testid="text-panel-title">{title}</span>
          <WorkflowLabel type={resolvedType} />
          {run && (
            <span className="text-[10px] text-muted-foreground" data-testid="text-run-duration">
              {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : ""}
            </span>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onDismiss}
              aria-label="Dismiss AI panel"
              data-testid="button-dismiss-panel"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <CollapsibleContent className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-3">
              {isLoading && <LoadingSkeleton />}

              {!isLoading && error && <ErrorState message={error} onRetry={onRetry} />}

              {!isLoading && !error && !output && <EmptyState />}

              {!isLoading && !error && output && (
                <>
                  <AIOutputRenderer
                    output={output}
                    workflowType={resolvedType}
                    onAddMachine={onAddMachine}
                    onViewMachine={onViewMachine}
                    addedMachineIds={addedMachineIds}
                    draftCallbacks={draftCallbacks}
                  />
                  {onFeedback && run && (
                    <FeedbackActions
                      onFeedback={(rating) => onFeedback(run.id, rating)}
                      feedbackPending={feedbackPending}
                    />
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
