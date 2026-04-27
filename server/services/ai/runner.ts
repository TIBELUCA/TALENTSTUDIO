import { randomUUID } from "crypto";
import { z } from "zod";
import type { AiProvider, AiCompletionMessage } from "./provider";
import type { AiRun, AiRunWorkflow } from "./types";
import { aiRunRepository } from "../../repositories/aiRuns";
import { logIntegration } from "../integrations/logger";

function toAiRun(record: {
  id: string;
  workflow: string;
  status: string;
  input: unknown;
  output: unknown;
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
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}): AiRun {
  return {
    id: record.id,
    workflow: record.workflow as AiRunWorkflow,
    status: record.status as AiRun["status"],
    input: (record.input ?? {}) as Record<string, unknown>,
    output: (record.output ?? null) as Record<string, unknown> | null,
    error: record.error,
    model: record.model,
    provider: record.provider,
    promptTokens: record.promptTokens,
    completionTokens: record.completionTokens,
    durationMs: record.durationMs,
    triggeredBy: record.triggeredBy,
    entityType: record.entityType,
    entityId: record.entityId,
    offerId: record.offerId,
    enquiryId: record.enquiryId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
  };
}

export async function executeAiWorkflow<T>(params: {
  provider: AiProvider;
  workflow: AiRunWorkflow;
  messages: AiCompletionMessage[];
  outputSchema: z.ZodType<T>;
  triggeredBy: string;
  offerId?: number | null;
  enquiryId?: number | null;
  input: Record<string, unknown>;
}): Promise<{ run: AiRun; output: T | null }> {
  const runId = randomUUID();
  const dbRun = await aiRunRepository.create({
    id: runId,
    workflow: params.workflow,
    status: "pending",
    input: params.input,
    output: null,
    error: null,
    model: params.provider.getDefaultModel(),
    provider: null,
    promptTokens: null,
    completionTokens: null,
    durationMs: null,
    triggeredBy: params.triggeredBy,
    entityType: null,
    entityId: null,
    offerId: params.offerId ?? null,
    enquiryId: params.enquiryId ?? null,
    completedAt: null,
  });

  let run = toAiRun(dbRun);

  if (!params.provider.isAvailable()) {
    const updated = await aiRunRepository.update(runId, {
      status: "failed",
      error: "AI provider not configured",
      completedAt: new Date(),
    });
    run = toAiRun(updated);

    logIntegration({
      service: "ai",
      action: params.workflow,
      status: "failure",
      message: "AI provider not available",
    });

    return { run, output: null };
  }

  await aiRunRepository.update(runId, { status: "running" });
  const startTime = Date.now();

  try {
    const result = await params.provider.complete({
      messages: params.messages,
      responseFormat: "json",
    });

    const durationMs = Date.now() - startTime;

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      const updated = await aiRunRepository.update(runId, {
        status: "failed",
        error: "AI returned invalid JSON",
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        durationMs,
        completedAt: new Date(),
      });
      run = toAiRun(updated);
      logIntegration({
        service: "ai",
        action: params.workflow,
        status: "failure",
        message: "Invalid JSON in AI response",
        durationMs,
      });
      return { run, output: null };
    }

    const validation = params.outputSchema.safeParse(parsed);
    if (!validation.success) {
      const errorMsg = `Output validation failed: ${validation.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
      const updated = await aiRunRepository.update(runId, {
        status: "failed",
        output: parsed,
        error: errorMsg,
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        durationMs,
        completedAt: new Date(),
      });
      run = toAiRun(updated);
      logIntegration({
        service: "ai",
        action: params.workflow,
        status: "failure",
        message: `Schema validation failed: ${errorMsg}`,
        durationMs,
      });
      return { run, output: null };
    }

    const updated = await aiRunRepository.update(runId, {
      status: "completed",
      output: validation.data as Record<string, unknown>,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      durationMs,
      completedAt: new Date(),
    });
    run = toAiRun(updated);

    logIntegration({
      service: "ai",
      action: params.workflow,
      status: "success",
      durationMs,
      message: `Completed ${params.workflow} (${result.promptTokens}+${result.completionTokens} tokens)`,
    });

    return { run, output: validation.data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;
    const updated = await aiRunRepository.update(runId, {
      status: "failed",
      error: message,
      durationMs,
      completedAt: new Date(),
    });
    run = toAiRun(updated);
    logIntegration({
      service: "ai",
      action: params.workflow,
      status: "failure",
      message: `Provider error: ${message}`,
      durationMs,
    });
    return { run, output: null };
  }
}

export async function getAiRuns(filter?: {
  workflow?: AiRunWorkflow;
  status?: AiRun["status"];
  offerId?: number;
  enquiryId?: number;
  limit?: number;
}): Promise<AiRun[]> {
  const records = await aiRunRepository.getAll(filter);
  return records.map(toAiRun);
}

export async function getAiRunById(id: string): Promise<AiRun | undefined> {
  const record = await aiRunRepository.getById(id);
  return record ? toAiRun(record) : undefined;
}
