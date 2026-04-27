import { logIntegration } from "./logger";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  send(params: SendEmailParams): Promise<SendEmailResult>;
  sendOfferPdf(to: string, offerReference: string, pdfBuffer: Buffer): Promise<SendEmailResult>;
  sendEnquiryNotification(to: string, enquiryReference: string, dealerName: string): Promise<SendEmailResult>;
}

export class NoOpEmailProvider implements EmailProvider {
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    logIntegration({
      service: "email",
      action: "send",
      status: "success",
      message: `No-op: would send to ${Array.isArray(params.to) ? params.to.join(", ") : params.to}: "${params.subject}"`,
    });
    return { success: true, messageId: `noop-${Date.now()}` };
  }

  async sendOfferPdf(to: string, offerReference: string, pdfBuffer: Buffer): Promise<SendEmailResult> {
    logIntegration({
      service: "email",
      action: "sendOfferPdf",
      status: "success",
      message: `No-op: would send offer ${offerReference} PDF (${pdfBuffer.length} bytes) to ${to}`,
    });
    return { success: true, messageId: `noop-${Date.now()}` };
  }

  async sendEnquiryNotification(to: string, enquiryReference: string, dealerName: string): Promise<SendEmailResult> {
    logIntegration({
      service: "email",
      action: "sendEnquiryNotification",
      status: "success",
      message: `No-op: would notify ${to} about enquiry ${enquiryReference} from ${dealerName}`,
    });
    return { success: true, messageId: `noop-${Date.now()}` };
  }
}
