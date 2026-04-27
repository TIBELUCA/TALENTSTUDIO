import { randomUUID } from "crypto";
import { logIntegration } from "./logger";
import type { WebhookEvent, WebhookEventType } from "./types";

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = "***";
      u.password = "***";
    }
    if (u.search) {
      u.search = "?***";
    }
    return u.toString();
  } catch {
    return url.replace(/[?].*$/, "?***");
  }
}

export interface WebhookDispatchResult {
  endpoint: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

export interface WebhookProvider {
  dispatch(event: WebhookEvent): Promise<WebhookDispatchResult[]>;
  registerEndpoint(url: string): void;
  removeEndpoint(url: string): void;
  getEndpoints(): string[];
}

export class NoOpWebhookProvider implements WebhookProvider {
  private endpoints: string[] = [];

  async dispatch(event: WebhookEvent): Promise<WebhookDispatchResult[]> {
    if (this.endpoints.length === 0) {
      logIntegration({
        service: "webhooks",
        action: "dispatch",
        status: "success",
        message: `No-op: event ${event.type} (no endpoints registered)`,
      });
      return [];
    }

    const results: WebhookDispatchResult[] = this.endpoints.map((endpoint) => ({
      endpoint,
      success: true,
    }));

    logIntegration({
      service: "webhooks",
      action: "dispatch",
      status: "success",
      message: `No-op: would dispatch ${event.type} to ${this.endpoints.length} endpoint(s)`,
      metadata: { eventType: event.type, endpointCount: this.endpoints.length },
    });

    return results;
  }

  registerEndpoint(url: string): void {
    if (!this.endpoints.includes(url)) {
      this.endpoints.push(url);
      logIntegration({
        service: "webhooks",
        action: "registerEndpoint",
        status: "success",
        message: `Registered webhook endpoint: ${redactUrl(url)}`,
      });
    }
  }

  removeEndpoint(url: string): void {
    this.endpoints = this.endpoints.filter((e) => e !== url);
    logIntegration({
      service: "webhooks",
      action: "removeEndpoint",
      status: "success",
      message: `Removed webhook endpoint: ${redactUrl(url)}`,
    });
  }

  getEndpoints(): string[] {
    return [...this.endpoints];
  }
}

export function createWebhookEvent(
  type: WebhookEventType,
  data: Record<string, any>,
): WebhookEvent {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    data,
  };
}
