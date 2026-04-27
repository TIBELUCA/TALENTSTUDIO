import rateLimit from "express-rate-limit";
import type { Request } from "express";

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

function keyGenerator(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = typeof forwarded === "string"
    ? forwarded.split(",")[0].trim()
    : req.socket?.remoteAddress ?? "unknown";
  return ip;
}

const rateLimitMessage = { message: "Too many requests, please try again later", code: "RATE_LIMITED" };

export const authRateLimiter = rateLimit({
  windowMs: envInt("RATE_LIMIT_AUTH_WINDOW_MS", 15 * 60 * 1000),
  max: envInt("RATE_LIMIT_AUTH_MAX", 20),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: rateLimitMessage,
  skipSuccessfulRequests: false,
});

export const pdfRateLimiter = rateLimit({
  windowMs: envInt("RATE_LIMIT_PDF_WINDOW_MS", 60 * 1000),
  max: envInt("RATE_LIMIT_PDF_MAX", 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: rateLimitMessage,
});

export const aiRateLimiter = rateLimit({
  windowMs: envInt("RATE_LIMIT_AI_WINDOW_MS", 60 * 1000),
  max: envInt("RATE_LIMIT_AI_MAX", 5),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: rateLimitMessage,
});

export const globalApiRateLimiter = rateLimit({
  windowMs: envInt("RATE_LIMIT_GLOBAL_WINDOW_MS", 60 * 1000),
  max: envInt("RATE_LIMIT_GLOBAL_MAX", 200),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: rateLimitMessage,
  skip: (req: Request) => !req.path.startsWith("/api"),
});
