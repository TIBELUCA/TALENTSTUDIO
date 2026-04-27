import type { IntegrationConfig } from "./types";

export function loadIntegrationConfig(): IntegrationConfig {
  return {
    email: {
      enabled: process.env.EMAIL_PROVIDER_ENABLED === "true",
      provider: process.env.EMAIL_PROVIDER ?? "noop",
    },
    crm: {
      enabled: process.env.CRM_PROVIDER_ENABLED === "true",
      provider: process.env.CRM_PROVIDER ?? "noop",
    },
    fileStorage: {
      enabled: process.env.EXTERNAL_STORAGE_ENABLED === "true",
      provider: process.env.EXTERNAL_STORAGE_PROVIDER ?? "noop",
    },
    webhooks: {
      enabled: process.env.WEBHOOKS_ENABLED === "true",
      endpoints: process.env.WEBHOOK_ENDPOINTS
        ? process.env.WEBHOOK_ENDPOINTS.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    },
  };
}
