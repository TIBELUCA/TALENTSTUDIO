import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors";

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    const body: Record<string, unknown> = { message: err.message, code: err.code };
    if (err.details) body.errors = err.details;
    return res.status(err.status).json(body);
  }

  if (err instanceof ZodError) {
    const errors = err.issues.map(i => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return res.status(400).json({ message: "Validation error", code: "VALIDATION_ERROR", errors });
  }

  const status = (err as Record<string, unknown>)?.status ?? (err as Record<string, unknown>)?.statusCode ?? 500;
  let message = err instanceof Error ? err.message : "Internal Server Error";

  const cause = (err as { cause?: unknown })?.cause as
    | { code?: string; detail?: string; message?: string; constraint?: string; column?: string; table?: string }
    | undefined;
  if (cause && (cause.code || cause.detail || cause.message)) {
    const parts: string[] = [];
    if (cause.code) parts.push(`code ${cause.code}`);
    if (cause.column) parts.push(`column ${cause.column}`);
    if (cause.table) parts.push(`table ${cause.table}`);
    if (cause.constraint) parts.push(`constraint ${cause.constraint}`);
    const detail = cause.detail || cause.message;
    const tag = parts.length ? ` [${parts.join(", ")}]` : "";
    message = detail ? `${detail}${tag}` : message;
  }

  console.error("Unhandled error:", err, cause ? { cause } : undefined);
  return res.status(status as number).json({ message });
}
