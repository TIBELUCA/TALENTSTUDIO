export type AiRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type AiRunWorkflow =
  | "enquiry_summary"
  | "offer_text_draft"
  | "machine_recommendation"
  | "preset_recommendation"
  | "risk_review"
  | "auto_quote"
  | "similar_offers"
  | "config_safety_guard"
  | "email_summarize"
  | "email_extract_todos"
  | "email_suggest_replies"
  | "email_improve"
  | "email_recap";
export type AiFeedbackRating = "accepted" | "rejected" | "modified";
export type AiFeedbackType = "overall" | "field_level" | "suggestion";
export type AiLanguage = "en" | "it";

export interface AiRun {
  id: string;
  workflow: AiRunWorkflow;
  status: AiRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  model: string;
  provider: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number | null;
  triggeredBy: string;
  entityType: string | null;
  entityId: number | null;
  offerId: number | null;
  enquiryId: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface AiFeedback {
  id: string;
  runId: string;
  rating: AiFeedbackRating;
  feedbackType: AiFeedbackType;
  fieldKey: string | null;
  originalValue: string | null;
  modifiedValue: string | null;
  score: number | null;
  comment: string | null;
  submittedBy: string;
  createdAt: string;
}
