import type { IntegrationLogEntry } from "./types";

const integrationLogs: IntegrationLogEntry[] = [];
const MAX_LOG_ENTRIES = 500;

export function logIntegration(entry: Omit<IntegrationLogEntry, "timestamp">): void {
  const logEntry: IntegrationLogEntry = {
    ...entry,
    timestamp: new Date(),
  };

  integrationLogs.push(logEntry);
  if (integrationLogs.length > MAX_LOG_ENTRIES) {
    integrationLogs.splice(0, integrationLogs.length - MAX_LOG_ENTRIES);
  }

  const prefix = `[integration:${entry.service}]`;
  if (entry.status === "failure") {
    console.error(`${prefix} ${entry.action} FAILED: ${entry.message ?? "unknown error"}`);
  } else if (process.env.INTEGRATION_DEBUG === "true") {
    console.log(`${prefix} ${entry.action} OK${entry.durationMs ? ` (${entry.durationMs}ms)` : ""}`);
  }
}

export function getIntegrationLogs(
  filter?: { service?: string; status?: "success" | "failure"; limit?: number },
): IntegrationLogEntry[] {
  let result = [...integrationLogs];
  if (filter?.service) result = result.filter((e) => e.service === filter.service);
  if (filter?.status) result = result.filter((e) => e.status === filter.status);
  result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  if (filter?.limit) result = result.slice(0, filter.limit);
  return result;
}
