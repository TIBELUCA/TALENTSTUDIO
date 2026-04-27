import type { Request, Response, NextFunction } from "express";

const SENSITIVE_PATHS = ["/api/salesman/login", "/api/dealer/login", "/api/auth"];

function sanitizePath(path: string): string {
  return path.replace(/\/enquiry-attachments\/[^/]+/, "/enquiry-attachments/[file]");
}

function shouldLog(path: string): boolean {
  return path.startsWith("/api") || path.startsWith("/enquiry-attachments");
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const method = req.method;
  const path = sanitizePath(req.path);

  if (!shouldLog(req.path)) {
    return next();
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const isSensitive = SENSITIVE_PATHS.some(p => req.path.startsWith(p));

    const parts: string[] = [
      `${method} ${path} ${status} ${duration}ms`,
    ];

    if (!isSensitive && req.query && Object.keys(req.query).length > 0) {
      const safeQuery = Object.keys(req.query).join(",");
      parts.push(`qs=[${safeQuery}]`);
    }

    const contentLength = res.getHeader("content-length");
    if (contentLength) {
      parts.push(`len=${contentLength}`);
    }

    const level = status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO";
    const ts = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    console.log(`${ts} [${level}] ${parts.join(" ")}`);
  });

  next();
}
