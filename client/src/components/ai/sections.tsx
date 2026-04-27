import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  CircleAlert,
  Copy,
  CheckCheck,
  ExternalLink,
  Info,
  Lightbulb,
  ListChecks,
  FileText,
  Plus,
  Sparkles,
  Search,
  Link2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  CircleDollarSign,
  Wrench,
  Package,
  TrendingDown,
  Ban,
} from "lucide-react";
import type {
  RiskFlag,
  MissingInfoItem,
  MachineRecommendation,
  DraftSection,
  RiskReviewItem,
  PresetSuggestion,
  OptionSuggestion,
  AutoQuoteOutput,
  AutoQuoteRequirement,
  SimilarOffersOutput,
  SimilarOfferMatchItem,
  ConfigSafetyGuardOutput,
  ConfigurationIssue,
  MissingElement,
  PricingWarning,
  SuggestedFix,
} from "./types";

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard API may not be available */ }
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0"
      onClick={handleCopy}
      aria-label={label ?? "Copy to clipboard"}
      data-testid="button-copy"
    >
      {copied ? <CheckCheck className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </Button>
  );
}

function severityColor(severity: "low" | "medium" | "high"): string {
  switch (severity) {
    case "high": return "text-red-600 dark:text-red-400";
    case "medium": return "text-amber-600 dark:text-amber-400";
    case "low": return "text-green-600 dark:text-green-400";
  }
}

function severityBg(severity: "low" | "medium" | "high"): string {
  switch (severity) {
    case "high": return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
    case "medium": return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    case "low": return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
  }
}

function importanceBadge(importance: "required" | "recommended" | "optional") {
  switch (importance) {
    case "required": return <Badge variant="destructive" data-testid="badge-importance-required">Required</Badge>;
    case "recommended": return <Badge variant="default" data-testid="badge-importance-recommended">Recommended</Badge>;
    case "optional": return <Badge variant="secondary" data-testid="badge-importance-optional">Optional</Badge>;
  }
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="confidence-bar">
      <span>Confidence</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-medium">{pct}%</span>
    </div>
  );
}

export function SummaryCard({ summary, customerIntent, keyRequirements, suggestedPriority, estimatedComplexity, confidence }: {
  summary: string;
  customerIntent: string;
  keyRequirements: string[];
  suggestedPriority: string;
  estimatedComplexity: string;
  confidence: number;
}) {
  return (
    <Card data-testid="ai-summary-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Summary
          <div className="ml-auto"><CopyButton text={summary} label="Copy summary" /></div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed" data-testid="text-summary">{summary}</p>
        <div className="text-sm">
          <span className="font-medium text-muted-foreground">Customer intent: </span>
          <span data-testid="text-customer-intent">{customerIntent}</span>
        </div>
        {keyRequirements.length > 0 && (
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Key Requirements</span>
            <ul className="mt-1 space-y-1" data-testid="list-requirements">
              {keyRequirements.map((req, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-green-500 shrink-0" />
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-center gap-3 pt-1">
          <Badge variant="outline" data-testid="badge-priority">{suggestedPriority}</Badge>
          <Badge variant="secondary" data-testid="badge-complexity">{estimatedComplexity}</Badge>
        </div>
        <ConfidenceBar value={confidence} />
      </CardContent>
    </Card>
  );
}

export function MissingInfoList({ items }: { items: MissingInfoItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card data-testid="ai-missing-info-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="h-4 w-4 text-amber-500" />
          Missing Information
          <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2" data-testid="list-missing-info">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm border rounded-md p-2" data-testid={`missing-info-${i}`}>
              <Info className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.label}</span>
                  {importanceBadge(item.importance)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{item.reason}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function RecommendationsList({ recommendations, confidence, dataGaps, generalNotes, onAddMachine, onViewMachine, addedMachineIds }: {
  recommendations: MachineRecommendation[];
  confidence: number;
  dataGaps?: string[];
  generalNotes?: string;
  onAddMachine?: (rec: MachineRecommendation) => void;
  onViewMachine?: (machineId: number) => void;
  addedMachineIds?: Set<number>;
}) {
  if (recommendations.length === 0) return null;
  return (
    <Card data-testid="ai-recommendations-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="h-4 w-4 text-primary" />
          Machine Recommendations
          <Badge variant="secondary" className="ml-auto">{recommendations.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          AI suggestions — review before applying
        </p>
        {recommendations.map((rec, i) => {
          const isAdded = addedMachineIds?.has(rec.machineId) ?? false;
          return (
            <div key={i} className="border rounded-md p-3 space-y-1.5" data-testid={`recommendation-${rec.machineId}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm flex-1 min-w-0 truncate" data-testid={`text-machine-name-${rec.machineId}`}>
                  {rec.machineName}
                </span>
                <Badge variant="outline" data-testid={`score-${rec.machineId}`}>
                  {Math.round(rec.score * 100)}%
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground" data-testid={`text-reasoning-${rec.machineId}`}>{rec.reasoning}</p>
              {rec.assumptions && (
                <p className="text-xs italic text-muted-foreground" data-testid={`text-assumptions-${rec.machineId}`}>
                  Assumption: {rec.assumptions}
                </p>
              )}
              {rec.suggestedOptions.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Suggested Options</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {rec.suggestedOptions.map((opt) => (
                      <Badge key={opt.optionId} variant="secondary" className="text-xs" data-testid={`option-${opt.optionId}`}>
                        {opt.optionName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-xs text-muted-foreground" data-testid={`text-qty-${rec.machineId}`}>
                Suggested qty: {rec.suggestedQuantity}
              </div>
              {(onAddMachine || onViewMachine) && (
                <div className="flex items-center gap-2 pt-1.5 border-t mt-2">
                  {onAddMachine && (
                    <Button
                      variant={isAdded ? "secondary" : "default"}
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => onAddMachine(rec)}
                      disabled={isAdded}
                      data-testid={`button-add-machine-${rec.machineId}`}
                    >
                      {isAdded ? (
                        <><CheckCircle2 className="h-3 w-3" /> Added</>
                      ) : (
                        <><Plus className="h-3 w-3" /> Add to Offer</>
                      )}
                    </Button>
                  )}
                  {onViewMachine && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => onViewMachine(rec.machineId)}
                      data-testid={`button-view-machine-${rec.machineId}`}
                    >
                      <ExternalLink className="h-3 w-3" /> View
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {generalNotes && <p className="text-xs text-muted-foreground italic" data-testid="text-general-notes">{generalNotes}</p>}
        {dataGaps && dataGaps.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Data gaps:</span>
            <ul className="text-xs text-muted-foreground space-y-0.5" data-testid="list-data-gaps">
              {dataGaps.map((g, i) => <li key={i}>• {g}</li>)}
            </ul>
          </div>
        )}
        <ConfidenceBar value={confidence} />
      </CardContent>
    </Card>
  );
}

export function PresetRecommendationsList({ presets, options, exclusionWarnings, generalNotes, confidence }: {
  presets: PresetSuggestion[];
  options: OptionSuggestion[];
  exclusionWarnings?: string[];
  generalNotes?: string;
  confidence: number;
}) {
  if (presets.length === 0 && options.length === 0) return null;
  return (
    <Card data-testid="ai-preset-recommendations-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="h-4 w-4 text-primary" />
          Preset & Option Suggestions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {presets.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Presets</span>
            {presets.map((p) => (
              <div key={p.presetId} className="border rounded-md p-2 text-sm" data-testid={`preset-suggestion-${p.presetId}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.presetTitle}</span>
                  <Badge variant="outline">{Math.round(p.relevanceScore * 100)}%</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{p.reasoning}</p>
              </div>
            ))}
          </div>
        )}
        {options.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Options</span>
            {options.map((o) => (
              <div key={`${o.machineId}-${o.optionId}`} className="border rounded-md p-2 text-sm" data-testid={`option-suggestion-${o.optionId}`}>
                <div className="font-medium">{o.optionName} <span className="font-normal text-muted-foreground">for {o.machineName}</span></div>
                <p className="text-xs text-muted-foreground mt-0.5">{o.reasoning}</p>
                {o.compatibilityNotes && <p className="text-xs italic text-amber-600 dark:text-amber-400 mt-0.5">{o.compatibilityNotes}</p>}
              </div>
            ))}
          </div>
        )}
        {exclusionWarnings && exclusionWarnings.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Warnings:</span>
            {exclusionWarnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 dark:text-amber-300">⚠ {w}</p>
            ))}
          </div>
        )}
        {generalNotes && <p className="text-xs text-muted-foreground italic">{generalNotes}</p>}
        <ConfidenceBar value={confidence} />
      </CardContent>
    </Card>
  );
}

export function DraftTextBlock({ subject, introduction, sections, closingParagraph, tone, confidence, onInsertSubject, onInsertSection, onInsertIntroduction, onInsertClosing, editedTexts, onEditText, insertedKeys }: {
  subject: string;
  introduction?: string;
  sections: DraftSection[];
  closingParagraph?: string;
  tone?: string;
  confidence: number;
  onInsertSubject?: (text: string) => void;
  onInsertSection?: (sectionId: string, text: string) => void;
  onInsertIntroduction?: (text: string) => void;
  onInsertClosing?: (text: string) => void;
  editedTexts?: Record<string, string>;
  onEditText?: (key: string, text: string) => void;
  insertedKeys?: Set<string>;
}) {
  const getEdited = (key: string, fallback: string) => editedTexts?.[key] ?? fallback;
  const isInserted = (key: string) => insertedKeys?.has(key) ?? false;

  return (
    <Card data-testid="ai-draft-text-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-primary" />
          Draft Text
          {tone && <Badge variant="secondary" className="ml-auto">{tone}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          AI-generated draft — edit before inserting
        </p>
        <div className="border rounded-md p-2.5 space-y-1.5" data-testid="draft-block-subject">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Subject</span>
            <div className="flex items-center gap-1">
              <CopyButton text={getEdited("subject", subject)} label="Copy subject" />
              {onInsertSubject && (
                <Button
                  variant={isInserted("subject") ? "secondary" : "default"}
                  size="sm"
                  className="h-6 text-[10px] gap-1 px-2"
                  onClick={() => onInsertSubject(getEdited("subject", subject))}
                  disabled={isInserted("subject")}
                  data-testid="button-insert-subject"
                >
                  {isInserted("subject") ? <><CheckCircle2 className="h-3 w-3" /> Inserted</> : <><ArrowDownToLine className="h-3 w-3" /> Insert</>}
                </Button>
              )}
            </div>
          </div>
          {onEditText ? (
            <textarea
              className="w-full min-h-[2rem] px-2 py-1 text-sm border rounded bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              value={getEdited("subject", subject)}
              onChange={(e) => onEditText("subject", e.target.value)}
              data-testid="input-draft-subject"
            />
          ) : (
            <p className="text-sm font-medium" data-testid="text-draft-subject">{subject}</p>
          )}
        </div>
        {introduction && (
          <div className="border rounded-md p-2.5 space-y-1.5" data-testid="draft-block-introduction">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Introduction</span>
              <div className="flex items-center gap-1">
                <CopyButton text={getEdited("introduction", introduction)} label="Copy introduction" />
                {onInsertIntroduction && (
                  <Button
                    variant={isInserted("introduction") ? "secondary" : "default"}
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2"
                    onClick={() => onInsertIntroduction(getEdited("introduction", introduction))}
                    disabled={isInserted("introduction")}
                    data-testid="button-insert-introduction"
                  >
                    {isInserted("introduction") ? <><CheckCircle2 className="h-3 w-3" /> Inserted</> : <><ArrowDownToLine className="h-3 w-3" /> Insert</>}
                  </Button>
                )}
              </div>
            </div>
            {onEditText ? (
              <textarea
                className="w-full min-h-[3rem] px-2 py-1 text-sm border rounded bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                value={getEdited("introduction", introduction)}
                onChange={(e) => onEditText("introduction", e.target.value)}
                data-testid="input-draft-introduction"
              />
            ) : (
              <p className="text-sm whitespace-pre-line" data-testid="text-draft-introduction">{introduction}</p>
            )}
          </div>
        )}
        {sections.map((s) => (
          <div key={s.sectionId} className="border rounded-md p-2.5 space-y-1.5" data-testid={`draft-section-${s.sectionId}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{s.sectionName}</span>
              <div className="flex items-center gap-1">
                <CopyButton text={getEdited(`section-${s.sectionId}`, s.draftText)} label={`Copy ${s.sectionName}`} />
                {onInsertSection && (
                  <Button
                    variant={isInserted(`section-${s.sectionId}`) ? "secondary" : "default"}
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2"
                    onClick={() => onInsertSection(s.sectionId, getEdited(`section-${s.sectionId}`, s.draftText))}
                    disabled={isInserted(`section-${s.sectionId}`)}
                    data-testid={`button-insert-section-${s.sectionId}`}
                  >
                    {isInserted(`section-${s.sectionId}`) ? <><CheckCircle2 className="h-3 w-3" /> Inserted</> : <><ArrowDownToLine className="h-3 w-3" /> Insert</>}
                  </Button>
                )}
              </div>
            </div>
            {onEditText ? (
              <textarea
                className="w-full min-h-[3rem] px-2 py-1 text-sm border rounded bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                value={getEdited(`section-${s.sectionId}`, s.draftText)}
                onChange={(e) => onEditText(`section-${s.sectionId}`, e.target.value)}
                data-testid={`input-draft-section-${s.sectionId}`}
              />
            ) : (
              <p className="text-sm whitespace-pre-line">{s.draftText}</p>
            )}
            {s.notes && <p className="text-xs text-muted-foreground italic mt-1">{s.notes}</p>}
          </div>
        ))}
        {closingParagraph && (
          <div className="border rounded-md p-2.5 space-y-1.5" data-testid="draft-block-closing">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Closing</span>
              <div className="flex items-center gap-1">
                <CopyButton text={getEdited("closing", closingParagraph)} label="Copy closing" />
                {onInsertClosing && (
                  <Button
                    variant={isInserted("closing") ? "secondary" : "default"}
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2"
                    onClick={() => onInsertClosing(getEdited("closing", closingParagraph))}
                    disabled={isInserted("closing")}
                    data-testid="button-insert-closing"
                  >
                    {isInserted("closing") ? <><CheckCircle2 className="h-3 w-3" /> Inserted</> : <><ArrowDownToLine className="h-3 w-3" /> Insert</>}
                  </Button>
                )}
              </div>
            </div>
            {onEditText ? (
              <textarea
                className="w-full min-h-[3rem] px-2 py-1 text-sm border rounded bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                value={getEdited("closing", closingParagraph)}
                onChange={(e) => onEditText("closing", e.target.value)}
                data-testid="input-draft-closing"
              />
            ) : (
              <p className="text-sm whitespace-pre-line" data-testid="text-draft-closing">{closingParagraph}</p>
            )}
          </div>
        )}
        <ConfidenceBar value={confidence} />
      </CardContent>
    </Card>
  );
}

export function RiskAlerts({ flags }: { flags: RiskFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <Card data-testid="ai-risk-alerts-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Risk Alerts
          <Badge variant="secondary" className="ml-auto">{flags.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2" data-testid="list-risk-alerts">
          {flags.map((flag, i) => (
            <div key={i} className={`flex items-start gap-2 text-sm border rounded-md p-2 ${severityBg(flag.severity)}`} data-testid={`risk-alert-${i}`}>
              <CircleAlert className={`h-4 w-4 mt-0.5 shrink-0 ${severityColor(flag.severity)}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={severityColor(flag.severity)}>{flag.severity}</Badge>
                  <span className="text-xs text-muted-foreground">{flag.category}</span>
                </div>
                <p className="text-sm mt-0.5">{flag.message}</p>
                {flag.suggestion && <p className="text-xs text-muted-foreground mt-0.5">{flag.suggestion}</p>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function FullRiskReviewCard({ overallRiskLevel, items, missingCommercialDetails, missingTechnicalDetails, pricingFlags, recommendedActions, confidence }: {
  overallRiskLevel: string;
  items: RiskReviewItem[];
  missingCommercialDetails: string[];
  missingTechnicalDetails: string[];
  pricingFlags: string[];
  recommendedActions: string[];
  confidence: number;
}) {
  return (
    <Card data-testid="ai-full-risk-review-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Risk Review
          <Badge variant="outline" className={`ml-auto ${severityColor(overallRiskLevel as "low" | "medium" | "high")}`} data-testid="badge-overall-risk">
            {overallRiskLevel}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className={`border rounded-md p-2.5 ${severityBg(item.severity)}`} data-testid={`risk-item-${i}`}>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={severityColor(item.severity)}>{item.severity}</Badge>
              <span className="text-xs text-muted-foreground">{item.category}</span>
              {item.requiresManualReview && <Badge variant="destructive" className="text-[10px] ml-auto">Manual Review</Badge>}
            </div>
            <p className="text-sm font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
            <p className="text-xs mt-1"><span className="font-medium">Action: </span>{item.recommendation}</p>
          </div>
        ))}
        {(missingCommercialDetails.length > 0 || missingTechnicalDetails.length > 0) && (
          <div className="grid grid-cols-1 gap-2">
            {missingCommercialDetails.length > 0 && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">Missing commercial details:</span>
                <ul className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                  {missingCommercialDetails.map((d, i) => <li key={i}>• {d}</li>)}
                </ul>
              </div>
            )}
            {missingTechnicalDetails.length > 0 && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">Missing technical details:</span>
                <ul className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                  {missingTechnicalDetails.map((d, i) => <li key={i}>• {d}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
        {pricingFlags.length > 0 && (
          <div>
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Pricing flags:</span>
            <ul className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
              {pricingFlags.map((f, i) => <li key={i}>⚠ {f}</li>)}
            </ul>
          </div>
        )}
        {recommendedActions.length > 0 && (
          <div>
            <span className="text-xs font-medium text-primary">Recommended actions:</span>
            <ol className="text-xs text-muted-foreground mt-0.5 space-y-0.5 list-decimal list-inside">
              {recommendedActions.map((a, i) => <li key={i}>{a}</li>)}
            </ol>
          </div>
        )}
        <ConfidenceBar value={confidence} />
      </CardContent>
    </Card>
  );
}

const requirementCategoryLabels: Record<AutoQuoteRequirement["category"], string> = {
  machine_type: "Machine Type",
  capacity: "Capacity",
  material: "Material",
  dimensions: "Dimensions",
  constraint: "Constraint",
  other: "Other",
};

const confidenceLabelColors: Record<AutoQuoteRequirement["confidence"], string> = {
  explicit: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950",
  inferred: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950",
  uncertain: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950",
};

export function AutoQuoteCard({ output }: { output: AutoQuoteOutput }) {
  return (
    <div className="space-y-3" data-testid="ai-auto-quote-card">
      <p className="text-[10px] text-muted-foreground italic px-1">AI-generated auto-quote — all suggestions require user review before use</p>

      <Card data-testid="auto-quote-summary">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Summary
            <div className="ml-auto flex items-center gap-1.5">
              <Badge variant="outline" className={severityColor(output.suggestedPriority === "urgent" ? "high" : output.suggestedPriority as "low" | "medium" | "high")} data-testid="badge-priority">
                {output.suggestedPriority}
              </Badge>
              <Badge variant="secondary" className="text-[10px]" data-testid="badge-complexity">{output.estimatedComplexity}</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">{output.summary}</p>
          <p className="text-xs text-muted-foreground"><span className="font-medium">Intent:</span> {output.customerIntent}</p>
          <ConfidenceBar value={output.confidence} />
        </CardContent>
      </Card>

      {output.extractedRequirements.length > 0 && (
        <Card data-testid="auto-quote-requirements">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="h-4 w-4 text-primary" />
              Extracted Requirements
              <Badge variant="secondary" className="ml-auto text-[10px]">{output.extractedRequirements.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {output.extractedRequirements.map((req, i) => (
              <div key={i} className="flex items-start gap-2 text-xs border rounded-md p-2" data-testid={`requirement-${i}`}>
                <Badge variant="outline" className="shrink-0 text-[10px]">{requirementCategoryLabels[req.category]}</Badge>
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{req.label}:</span> {req.value}
                </div>
                <Badge className={`shrink-0 text-[9px] ${confidenceLabelColors[req.confidence]}`} variant="outline">{req.confidence}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {output.recommendedMachines.length > 0 && (
        <Card data-testid="auto-quote-machines">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Lightbulb className="h-4 w-4 text-primary" />
              Recommended Machines
              <Badge variant="secondary" className="ml-auto text-[10px]">{output.recommendedMachines.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {output.recommendedMachines.map((m, i) => (
              <div key={i} className="border rounded-md p-2.5" data-testid={`auto-quote-machine-${i}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{m.machineName}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">×{m.suggestedQuantity}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{Math.round(m.score * 100)}%</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{m.reasoning}</p>
                {m.suggestedOptions.length > 0 && (
                  <div className="mt-1.5">
                    <span className="text-[10px] font-medium text-muted-foreground">Options:</span>
                    <ul className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                      {m.suggestedOptions.map((o, j) => (
                        <li key={j}>• {o.optionName} — {o.reasoning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {output.recommendedPresets.length > 0 && (
        <Card data-testid="auto-quote-presets">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-primary" />
              Recommended Presets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {output.recommendedPresets.map((p, i) => (
              <div key={i} className="flex items-start gap-2 text-xs border rounded-md p-2" data-testid={`auto-quote-preset-${i}`}>
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{p.presetTitle}</span>
                  <p className="text-muted-foreground mt-0.5">{p.reasoning}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[10px]">{Math.round(p.relevanceScore * 100)}%</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(output.draftSubject || output.draftSections.length > 0) && (
        <Card data-testid="auto-quote-draft">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-primary" />
              Draft Offer Text
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {output.draftSubject && (
              <div>
                <span className="text-[10px] font-medium text-muted-foreground">Subject:</span>
                <p className="text-sm font-medium mt-0.5">{output.draftSubject}</p>
                <CopyButton text={output.draftSubject} />
              </div>
            )}
            {output.draftIntroduction && (
              <div>
                <span className="text-[10px] font-medium text-muted-foreground">Introduction:</span>
                <p className="text-xs mt-0.5">{output.draftIntroduction}</p>
                <CopyButton text={output.draftIntroduction} />
              </div>
            )}
            {output.draftSections.map((s, i) => (
              <div key={i} className="border-t pt-2" data-testid={`auto-quote-draft-section-${i}`}>
                <span className="text-[10px] font-medium text-muted-foreground">{s.sectionName}:</span>
                <p className="text-xs mt-0.5">{s.draftText}</p>
                <CopyButton text={s.draftText} />
              </div>
            ))}
            {output.draftClosing && (
              <div className="border-t pt-2">
                <span className="text-[10px] font-medium text-muted-foreground">Closing:</span>
                <p className="text-xs mt-0.5">{output.draftClosing}</p>
                <CopyButton text={output.draftClosing} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <MissingInfoList items={output.missingInformation} />
      <RiskAlerts flags={output.riskFlags} />
    </div>
  );
}

function SimilarityBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const variant = pct >= 80 ? "default" : pct >= 60 ? "secondary" : "outline";
  return (
    <Badge variant={variant} className="text-[10px]" data-testid={`similarity-score-${pct}`}>
      {pct}% match
    </Badge>
  );
}

function SimilarOfferRow({
  match,
  onOpen,
}: {
  match: SimilarOfferMatchItem;
  onOpen?: (offerId: number) => void;
}) {
  return (
    <div
      className="border rounded-lg p-3 space-y-1.5 hover:bg-accent/50 transition-colors"
      data-testid={`similar-offer-${match.offerId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium truncate">Offer #{match.offerId}</span>
        </div>
        <SimilarityBadge score={match.similarityScore} />
      </div>

      <div className="text-[11px] text-muted-foreground">
        <span className="font-medium">Machines:</span> {match.machineReference}
      </div>

      {match.optionsSummary && match.optionsSummary !== "No options" && (
        <div className="text-[11px] text-muted-foreground">
          <span className="font-medium">Options:</span> {match.optionsSummary}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground line-clamp-2">{match.textualSummary}</p>

      {onOpen && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] px-2"
          onClick={() => onOpen(match.offerId)}
          data-testid={`open-similar-offer-${match.offerId}`}
        >
          <ExternalLink className="h-3 w-3 mr-1" /> View Offer
        </Button>
      )}
    </div>
  );
}

export function SimilarOffersCard({
  output,
  onOpenOffer,
}: {
  output: SimilarOffersOutput;
  onOpenOffer?: (offerId: number) => void;
}) {
  const { matches, confidence } = output;

  if (!matches || matches.length === 0) {
    return (
      <Card data-testid="similar-offers-empty">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className="h-4 w-4" /> Similar Offers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No similar offers found in the database.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="similar-offers-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Search className="h-4 w-4" /> Similar Offers
          <Badge variant="outline" className="ml-auto text-[10px]">
            {matches.length} found
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {confidence > 0 && (
          <div className="text-[10px] text-muted-foreground">
            Best match confidence: {Math.round(confidence * 100)}%
          </div>
        )}
        {matches.map((m) => (
          <SimilarOfferRow key={m.offerId} match={m} onOpen={onOpenOffer} />
        ))}
      </CardContent>
    </Card>
  );
}

function guardSeverityColor(severity: string): string {
  switch (severity) {
    case "critical": return "text-red-600 dark:text-red-400";
    case "high": return "text-orange-600 dark:text-orange-400";
    case "medium": return "text-yellow-600 dark:text-yellow-400";
    case "low": return "text-blue-600 dark:text-blue-400";
    default: return "text-muted-foreground";
  }
}

function guardSeverityBadgeVariant(severity: string): "default" | "secondary" | "destructive" | "outline" {
  switch (severity) {
    case "critical": return "destructive";
    case "high": return "destructive";
    case "medium": return "secondary";
    default: return "outline";
  }
}

function SeverityIcon({ severity, className }: { severity: string; className?: string }) {
  const cn = `h-3.5 w-3.5 ${guardSeverityColor(severity)} ${className ?? ""}`;
  switch (severity) {
    case "critical": return <ShieldX className={cn} />;
    case "high": return <ShieldAlert className={cn} />;
    case "medium": return <AlertTriangle className={cn} />;
    default: return <Info className={cn} />;
  }
}

function SafetyScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  let variant: "default" | "secondary" | "destructive" | "outline" = "default";
  let label = "Safe";
  if (pct < 50) { variant = "destructive"; label = "Critical"; }
  else if (pct < 70) { variant = "destructive"; label = "Warning"; }
  else if (pct < 85) { variant = "secondary"; label = "Attention"; }
  return (
    <Badge variant={variant} className="text-[10px]" data-testid="safety-score-badge">
      {label} ({pct}%)
    </Badge>
  );
}

function MarginAssessmentBadge({ assessment }: { assessment: string }) {
  let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
  if (assessment === "critical" || assessment === "negative") variant = "destructive";
  else if (assessment === "warning" || assessment === "low") variant = "destructive";
  else if (assessment === "attention" || assessment === "moderate") variant = "secondary";
  return (
    <Badge variant={variant} className="text-[10px] capitalize" data-testid="margin-assessment-badge">
      {assessment}
    </Badge>
  );
}

function ConfigurationIssueRow({ issue, index }: { issue: ConfigurationIssue; index: number }) {
  return (
    <div className="border rounded-lg p-3 space-y-1.5" data-testid={`config-issue-${index}`}>
      <div className="flex items-start gap-2">
        <SeverityIcon severity={issue.severity} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium">{issue.title}</span>
            <Badge variant={guardSeverityBadgeVariant(issue.severity)} className="text-[9px]">{issue.severity}</Badge>
            <Badge variant="outline" className="text-[9px] capitalize">{issue.category.replace(/_/g, " ")}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{issue.description}</p>
          <div className="text-[10px] text-muted-foreground mt-1">
            <span className="font-medium">Machines:</span> {issue.machineNames.join(", ")}
            {issue.optionNames && issue.optionNames.length > 0 && (
              <> | <span className="font-medium">Options:</span> {issue.optionNames.join(", ")}</>
            )}
          </div>
          <div className="text-[10px] mt-1 flex items-center gap-1">
            <Wrench className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">{issue.suggestedFix}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MissingElementRow({ element, index }: { element: MissingElement; index: number }) {
  const importanceVariant = element.importance === "required" ? "destructive" : element.importance === "recommended" ? "secondary" : "outline";
  return (
    <div className="flex items-start gap-2 p-2 border rounded" data-testid={`missing-element-${index}`}>
      <Package className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium">{element.element}</span>
          <Badge variant={importanceVariant} className="text-[9px]">{element.importance}</Badge>
          <Badge variant="outline" className="text-[9px] capitalize">{element.category.replace(/_/g, " ")}</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">{element.description}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 italic">{element.suggestedAction}</p>
      </div>
    </div>
  );
}

function PricingWarningRow({ warning, index }: { warning: PricingWarning; index: number }) {
  return (
    <div className="border rounded-lg p-3 space-y-1" data-testid={`pricing-warning-${index}`}>
      <div className="flex items-start gap-2">
        <CircleDollarSign className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${guardSeverityColor(warning.severity)}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium">{warning.title}</span>
            <Badge variant={guardSeverityBadgeVariant(warning.severity)} className="text-[9px]">{warning.severity}</Badge>
            <Badge variant="outline" className="text-[9px] capitalize">{warning.type.replace(/_/g, " ")}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{warning.description}</p>
          {warning.affectedItems.length > 0 && (
            <div className="text-[10px] text-muted-foreground mt-1">
              <span className="font-medium">Affected:</span> {warning.affectedItems.join(", ")}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-1 italic">{warning.suggestedAction}</p>
        </div>
      </div>
    </div>
  );
}

function SuggestedFixRow({ fix, index }: { fix: SuggestedFix; index: number }) {
  return (
    <div className="flex items-start gap-2 p-2 border rounded" data-testid={`suggested-fix-${index}`}>
      <Lightbulb className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${guardSeverityColor(fix.priority)}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium">{fix.title}</span>
          <Badge variant={guardSeverityBadgeVariant(fix.priority)} className="text-[9px]">{fix.priority}</Badge>
          <Badge variant="outline" className="text-[9px] capitalize">{fix.fixType.replace(/_/g, " ")}</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">{fix.description}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          <span className="font-medium">Impact:</span> {fix.estimatedImpact}
        </p>
      </div>
    </div>
  );
}

export function ConfigSafetyGuardCard({ output }: { output: ConfigSafetyGuardOutput }) {
  const {
    configurationIssues,
    missingElements,
    pricingWarnings,
    marginRisk,
    suggestedFixes,
    overallSafetyScore,
    readyToSend,
    blockers,
    advisoryNotes,
  } = output;

  const totalIssues = configurationIssues.length + missingElements.length + pricingWarnings.length;
  const criticalCount = configurationIssues.filter(i => i.severity === "critical").length
    + pricingWarnings.filter(w => w.severity === "critical").length;

  return (
    <div className="space-y-3" data-testid="config-safety-guard-card">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {readyToSend ? (
              <ShieldCheck className="h-4 w-4 text-green-600" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-red-600" />
            )}
            Configuration Safety Check
            <SafetyScoreBadge score={overallSafetyScore} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3 text-xs" data-testid="safety-summary">
            <span className={readyToSend ? "text-green-700 dark:text-green-400 font-medium" : "text-red-700 dark:text-red-400 font-medium"}>
              {readyToSend ? "Ready to send" : "Not ready — issues found"}
            </span>
            {totalIssues > 0 && (
              <span className="text-muted-foreground">{totalIssues} issue{totalIssues !== 1 ? "s" : ""} found</span>
            )}
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-[9px]">{criticalCount} critical</Badge>
            )}
          </div>

          {blockers.length > 0 && (
            <div className="space-y-1" data-testid="safety-blockers">
              <span className="text-[10px] font-medium text-red-700 dark:text-red-400 flex items-center gap-1">
                <Ban className="h-3 w-3" /> Blockers
              </span>
              {blockers.map((b, i) => (
                <div key={i} className="text-[11px] text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1" data-testid={`blocker-${i}`}>
                  {b}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {configurationIssues.length > 0 && (
        <Card data-testid="config-issues-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" /> Configuration Issues
              <Badge variant="outline" className="ml-auto text-[10px]">{configurationIssues.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {configurationIssues.map((issue, i) => (
              <ConfigurationIssueRow key={i} issue={issue} index={i} />
            ))}
          </CardContent>
        </Card>
      )}

      {missingElements.length > 0 && (
        <Card data-testid="missing-elements-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="h-4 w-4" /> Missing Commercial Elements
              <Badge variant="outline" className="ml-auto text-[10px]">{missingElements.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {missingElements.map((el, i) => (
              <MissingElementRow key={i} element={el} index={i} />
            ))}
          </CardContent>
        </Card>
      )}

      {pricingWarnings.length > 0 && (
        <Card data-testid="pricing-warnings-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4" /> Pricing Warnings
              <Badge variant="outline" className="ml-auto text-[10px]">{pricingWarnings.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pricingWarnings.map((w, i) => (
              <PricingWarningRow key={i} warning={w} index={i} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card data-testid="margin-risk-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingDown className="h-4 w-4" /> Margin Risk Assessment
            <MarginAssessmentBadge assessment={marginRisk.overallMarginAssessment} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Estimated margin:</span>
            <Badge variant="outline" className="text-[10px] capitalize">{marginRisk.estimatedMarginCategory}</Badge>
          </div>
          {marginRisk.factors.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Factors:</span>
              {marginRisk.factors.map((f, i) => (
                <p key={i} className="text-[11px] text-muted-foreground pl-2 border-l-2" data-testid={`margin-factor-${i}`}>{f}</p>
              ))}
            </div>
          )}
          {marginRisk.recommendations.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Recommendations:</span>
              {marginRisk.recommendations.map((r, i) => (
                <p key={i} className="text-[11px] text-muted-foreground pl-2 border-l-2 border-blue-300" data-testid={`margin-recommendation-${i}`}>{r}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {suggestedFixes.length > 0 && (
        <Card data-testid="suggested-fixes-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Suggested Fixes
              <Badge variant="outline" className="ml-auto text-[10px]">{suggestedFixes.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestedFixes.map((fix, i) => (
              <SuggestedFixRow key={i} fix={fix} index={i} />
            ))}
          </CardContent>
        </Card>
      )}

      {advisoryNotes.length > 0 && (
        <Card data-testid="advisory-notes-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4" /> Advisory Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {advisoryNotes.map((note, i) => (
              <p key={i} className="text-[11px] text-muted-foreground" data-testid={`advisory-note-${i}`}>{note}</p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
