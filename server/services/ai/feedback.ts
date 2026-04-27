import { randomUUID } from "crypto";
import type { AiFeedback, AiFeedbackRating, AiFeedbackType } from "./types";
import { getAiRunById } from "./runner";
import { aiFeedbackRepository } from "../../repositories/aiRuns";

function toAiFeedback(record: {
  id: string;
  runId: string;
  rating: string;
  feedbackType: string;
  fieldKey: string | null;
  originalValue: string | null;
  modifiedValue: string | null;
  score: number | null;
  comment: string | null;
  submittedBy: string;
  createdAt: Date;
}): AiFeedback {
  return {
    id: record.id,
    runId: record.runId,
    rating: record.rating as AiFeedbackRating,
    feedbackType: record.feedbackType as AiFeedback["feedbackType"],
    fieldKey: record.fieldKey,
    originalValue: record.originalValue,
    modifiedValue: record.modifiedValue,
    score: record.score,
    comment: record.comment,
    submittedBy: record.submittedBy,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function recordAiFeedback(params: {
  runId: string;
  rating: AiFeedbackRating;
  feedbackType?: AiFeedbackType;
  fieldKey?: string;
  originalValue?: string;
  modifiedValue?: string;
  score?: number;
  comment?: string;
  submittedBy: string;
}): Promise<AiFeedback> {
  const run = await getAiRunById(params.runId);
  if (!run) throw new Error(`AI run not found: ${params.runId}`);

  const record = await aiFeedbackRepository.create({
    id: randomUUID(),
    runId: params.runId,
    rating: params.rating,
    feedbackType: params.feedbackType ?? "overall",
    fieldKey: params.fieldKey ?? null,
    originalValue: params.originalValue ?? null,
    modifiedValue: params.modifiedValue ?? null,
    score: params.score ?? null,
    comment: params.comment ?? null,
    submittedBy: params.submittedBy,
  });

  return toAiFeedback(record);
}

export async function getFeedbackForRun(runId: string): Promise<AiFeedback[]> {
  const records = await aiFeedbackRepository.getByRunId(runId);
  return records.map(toAiFeedback);
}

export async function getFeedbackStats(): Promise<{
  total: number;
  accepted: number;
  rejected: number;
  modified: number;
}> {
  return aiFeedbackRepository.getStats();
}
