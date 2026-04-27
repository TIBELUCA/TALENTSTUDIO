import { logIntegration } from "./logger";

export interface CrmContact {
  externalId?: string;
  email: string;
  name: string;
  company?: string;
  phone?: string;
  address?: string;
  metadata?: Record<string, any>;
}

export interface CrmDeal {
  externalId?: string;
  title: string;
  value?: number;
  currency?: string;
  stage?: string;
  contactId?: string;
  metadata?: Record<string, any>;
}

export interface CrmSyncResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

export interface CrmProvider {
  syncContact(contact: CrmContact): Promise<CrmSyncResult>;
  syncDeal(deal: CrmDeal): Promise<CrmSyncResult>;
  updateDealStage(externalId: string, stage: string): Promise<CrmSyncResult>;
  deleteContact(externalId: string): Promise<CrmSyncResult>;
}

export class NoOpCrmProvider implements CrmProvider {
  async syncContact(contact: CrmContact): Promise<CrmSyncResult> {
    logIntegration({
      service: "crm",
      action: "syncContact",
      status: "success",
      message: `No-op: would sync contact "${contact.name}" (${contact.email})`,
    });
    return { success: true, externalId: `noop-contact-${Date.now()}` };
  }

  async syncDeal(deal: CrmDeal): Promise<CrmSyncResult> {
    logIntegration({
      service: "crm",
      action: "syncDeal",
      status: "success",
      message: `No-op: would sync deal "${deal.title}" (${deal.value ? `€${deal.value}` : "no value"})`,
    });
    return { success: true, externalId: `noop-deal-${Date.now()}` };
  }

  async updateDealStage(externalId: string, stage: string): Promise<CrmSyncResult> {
    logIntegration({
      service: "crm",
      action: "updateDealStage",
      status: "success",
      message: `No-op: would update deal ${externalId} to stage "${stage}"`,
    });
    return { success: true, externalId };
  }

  async deleteContact(externalId: string): Promise<CrmSyncResult> {
    logIntegration({
      service: "crm",
      action: "deleteContact",
      status: "success",
      message: `No-op: would delete contact ${externalId}`,
    });
    return { success: true, externalId };
  }
}
