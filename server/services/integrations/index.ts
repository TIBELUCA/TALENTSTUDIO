import { loadIntegrationConfig } from "./config";
import { type EmailProvider, NoOpEmailProvider } from "./email";
import { type CrmProvider, NoOpCrmProvider } from "./crm";
import { type ExternalStorageProvider, NoOpExternalStorageProvider } from "./externalStorage";
import { type WebhookProvider, NoOpWebhookProvider, createWebhookEvent } from "./webhooks";
import { logIntegration, getIntegrationLogs } from "./logger";
import type { WebhookEventType } from "./types";

let emailProvider: EmailProvider;
let crmProvider: CrmProvider;
let externalStorageProvider: ExternalStorageProvider;
let webhookProvider: WebhookProvider;

const KNOWN_EMAIL_PROVIDERS = ["noop"];
const KNOWN_CRM_PROVIDERS = ["noop"];
const KNOWN_STORAGE_PROVIDERS = ["noop"];

export function initIntegrations(): void {
  const config = loadIntegrationConfig();

  if (config.email.enabled && !KNOWN_EMAIL_PROVIDERS.includes(config.email.provider)) {
    console.warn(`[integrations] Unknown email provider "${config.email.provider}", falling back to noop`);
  }
  if (config.crm.enabled && !KNOWN_CRM_PROVIDERS.includes(config.crm.provider)) {
    console.warn(`[integrations] Unknown CRM provider "${config.crm.provider}", falling back to noop`);
  }
  if (config.fileStorage.enabled && !KNOWN_STORAGE_PROVIDERS.includes(config.fileStorage.provider)) {
    console.warn(`[integrations] Unknown storage provider "${config.fileStorage.provider}", falling back to noop`);
  }

  emailProvider = new NoOpEmailProvider();
  crmProvider = new NoOpCrmProvider();
  externalStorageProvider = new NoOpExternalStorageProvider();
  webhookProvider = new NoOpWebhookProvider();

  if (config.webhooks.enabled) {
    for (const endpoint of config.webhooks.endpoints) {
      webhookProvider.registerEndpoint(endpoint);
    }
  }

  logIntegration({
    service: "core",
    action: "init",
    status: "success",
    message: `Integrations initialized — email: ${config.email.provider}, crm: ${config.crm.provider}, storage: ${config.fileStorage.provider}, webhooks: ${config.webhooks.enabled ? config.webhooks.endpoints.length + " endpoints" : "disabled"}`,
  });
}

export function getEmailProvider(): EmailProvider {
  if (!emailProvider) initIntegrations();
  return emailProvider;
}

export function getCrmProvider(): CrmProvider {
  if (!crmProvider) initIntegrations();
  return crmProvider;
}

export function getExternalStorageProvider(): ExternalStorageProvider {
  if (!externalStorageProvider) initIntegrations();
  return externalStorageProvider;
}

export function getWebhookProvider(): WebhookProvider {
  if (!webhookProvider) initIntegrations();
  return webhookProvider;
}

export async function dispatchWebhookEvent(
  type: WebhookEventType,
  data: Record<string, any>,
): Promise<void> {
  const provider = getWebhookProvider();
  const event = createWebhookEvent(type, data);
  try {
    await provider.dispatch(event);
  } catch (err: any) {
    logIntegration({
      service: "webhooks",
      action: "dispatch",
      status: "failure",
      message: `Failed to dispatch ${type}: ${err.message}`,
    });
  }
}

export {
  type EmailProvider,
  type SendEmailParams,
  type SendEmailResult,
  NoOpEmailProvider,
} from "./email";
export {
  type CrmProvider,
  type CrmContact,
  type CrmDeal,
  type CrmSyncResult,
  NoOpCrmProvider,
} from "./crm";
export {
  type ExternalStorageProvider,
  type ExternalStorageUploadResult,
  NoOpExternalStorageProvider,
} from "./externalStorage";
export {
  type WebhookProvider,
  type WebhookDispatchResult,
  NoOpWebhookProvider,
  createWebhookEvent,
} from "./webhooks";
export {
  type IntegrationEvent,
  type WebhookEvent,
  type WebhookEventType,
  type IntegrationLogEntry,
  type IntegrationConfig,
} from "./types";
export { loadIntegrationConfig } from "./config";
export { logIntegration, getIntegrationLogs } from "./logger";
