export interface IntegrationEvent {
  type: string;
  timestamp: Date;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

export type WebhookEventType =
  | "offer.created"
  | "offer.updated"
  | "offer.status_changed"
  | "offer.exported"
  | "offer.versioned"
  | "enquiry.created"
  | "enquiry.submitted"
  | "enquiry.status_changed"
  | "customer.created"
  | "customer.updated"
  | "customer.deleted"
  | "dealer.login"
  | "dealer.registered"
  | "dealer.price.updated"
  | "offer.permanently_deleted"
  | "enquiry.deleted";

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  data: Record<string, any>;
}

export interface IntegrationLogEntry {
  service: string;
  action: string;
  status: "success" | "failure";
  message?: string;
  durationMs?: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface IntegrationConfig {
  email: {
    enabled: boolean;
    provider: string;
  };
  crm: {
    enabled: boolean;
    provider: string;
  };
  fileStorage: {
    enabled: boolean;
    provider: string;
  };
  webhooks: {
    enabled: boolean;
    endpoints: string[];
  };
}
