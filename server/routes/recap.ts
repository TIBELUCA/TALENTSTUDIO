import { Router, type Request } from "express";
import { db } from "../db";
import {
  interactions, offers, customers, contacts, jobOrders, jobOrderVersions, jobOrderDocuments,
  offerReminders, activityLogs, emailSendLog, emailAttachmentLinks, salesmanUsers, dealerUsers,
  drawings, drawingRequests,
  gmailMessageIndex,
  talentQuotes, campaigns,
} from "@shared/schema";
import { and, eq, gte, lte, isNull, isNotNull, inArray, asc, desc, sql } from "drizzle-orm";
import { requireSalesmanOrMaster, getSalesmanId, isMaster, getUserRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import { getGmailConnection } from "./email";
import { triggerConnectionSync } from "../services/gmailIndexScheduler";
import { type RecapEvent, type RecapEventType, RECAP_EVENT_TYPE_LABELS, type RecapGranularity } from "@shared/recap";
import { displayVersion } from "@shared/version";
import ExcelJS from "exceljs";
import puppeteer from "puppeteer";
import { execSync } from "child_process";
import { format as dfFormat, addDays, addWeeks, addMonths, addYears, startOfDay, startOfWeek, startOfMonth, startOfYear, isSameDay, parseISO } from "date-fns";
import { it } from "date-fns/locale";

const router = Router();

const ALL_TYPES: RecapEventType[] = [
  "interaction", "offer_created", "offer_close_forecast",
  "offer_status_changed", "offer_drawing_added", "offer_drawing_ready",
  "order_created", "order_milestone",
  "order_approved", "order_versioned", "order_email_link",
  "order_layout_added", "order_layout_changed", "order_document_added",
  "reminder", "contact_recall", "activity",
  "quote_sent", "quote_accepted", "deliverable_published",
  "campaign_payment_in", "campaign_payment_out",
];

// Interaction.type values that are surfaced as their own RecapEvent type
// (not as the generic "interaction" card). Loaded from the interactions
// table but skipped by the standard interaction loader.
const PROMOTED_INTERACTION_TYPES = new Set<string>([
  "order_layout_added",
  "order_layout_changed",
  "order_document_added",
]);

// activityLogs.action values that are surfaced as their own RecapEvent type
// (skipped by the generic "activity" loader).
const PROMOTED_ACTIVITY_ACTIONS = new Set<string>([
  "offer_status_changed",
  "quote_sent",
  "quote_accepted",
  "deliverable_published",
  "campaign_payment_in_recorded",
  "campaign_payment_out_recorded",
]);

function parseDate(s: any, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(String(s));
  return isNaN(d.getTime()) ? fallback : d;
}

function classifyTimePosition(date: Date, type: RecapEventType): "past" | "future" | "projection" {
  const now = Date.now();
  if (type === "offer_close_forecast") return "projection";
  if (date.getTime() <= now) return "past";
  return "future";
}

function customerArea(c?: { country?: string | null; region?: string | null } | null): string | null {
  if (!c) return null;
  return c.country || c.region || null;
}

const ACTIVITY_TITLE_MAP: Record<string, string> = {
  // Internal salesman/master actions on offers
  offer_status_changed: "Cambio stato offerta",
  offer_saved_from_share: "Offerta importata da Share Hub",
  offer_catalog_refreshed: "Catalogo offerta aggiornato",
  offer_created: "Creazione offerta",
  offer_edited: "Modifica offerta",
  offer_deleted: "Eliminazione offerta",
  offer_restored: "Ripristino offerta",
  offer_duplicated: "Duplicazione offerta",
  offer_sent: "Invio offerta",
  offer_pdf_generated: "PDF offerta generato",
  // Dealer actions
  dealer_login: "Accesso dealer",
  dealer_logout: "Uscita dealer",
  dealer_viewed_offer: "Dealer ha visualizzato offerta",
  dealer_downloaded_pdf: "Dealer ha scaricato PDF",
  dealer_edited_prices: "Dealer ha modificato prezzi",
  dealer_changed_presentation_mode: "Dealer ha cambiato modalità presentazione",
  dealer_requested_revision: "Dealer ha richiesto revisione",
  dealer_deleted_offer: "Dealer ha eliminato offerta",
  // Enquiries
  enquiry_submitted: "Richiesta inviata da dealer",
  enquiry_deleted: "Richiesta eliminata",
  enquiry_permanently_deleted: "Richiesta eliminata definitivamente",
  offer_created_from_enquiry: "Offerta creata da richiesta",
  // Validations / approvals
  company_validated: "Azienda validata",
  company_rejected: "Azienda rifiutata",
  contact_validated: "Contatto validato",
  contact_rejected: "Contatto rifiutato",
  company_deletion_approved: "Eliminazione azienda approvata",
  contact_deletion_approved: "Eliminazione contatto approvata",
};

function humanizeAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatActivityTitle(action: string, offerReference: string | null): string {
  const base = ACTIVITY_TITLE_MAP[action] ?? humanizeAction(action);
  return offerReference ? `${base} ${offerReference}`.trim() : base;
}

// ─── Inbound emails (Gmail inbox) for the requesting user ──────────────
// Best-effort: returns empty list if no Gmail connection or any error.
type InboundEmail = {
  id: string;
  date: Date;
  senderName: string;
  senderEmail: string;
  senderDomain: string;
  subject: string;
  // Gmail conversation id (RFC822). Lets the Recap chain inbound replies
  // to outbound sends under one "same-email-thread" link cluster.
  threadId: string | null;
  // "inbound" = INBOX (someone wrote to us). "outbound" = SENT (we wrote
  // to someone) — both are stored in the same gmail_message_index table.
  direction: "inbound" | "outbound";
  // For outbound rows: lowercased first recipient address. Null for inbound.
  recipientEmail: string | null;
};

// Soft cap on how many messages are pulled from the local index per Recap
// query. Heavy mailboxes (lots of newsletters) can easily exceed this
// across a 4-month window; when we do, we surface a small banner in the UI
// so the user understands the timeline is partial and can narrow the search.
const INBOUND_EMAILS_MAX = 1000;

type FetchInboundOpts = {
  /** Hard cap on returned rows. When the cap is hit `truncated` becomes true
   *  and only the most recent `limit` messages within the window are kept. */
  limit?: number;
  /** When provided, only messages whose senderEmail (lowercased) is in this
   *  list are read. Used to skip the cap entirely when the user has already
   *  narrowed by customer/contact, since the result set is naturally small.
   *  Applies to inbound rows only (we always pull all outbound — they are
   *  already scoped to the user's own mailbox). */
  senderEmails?: string[] | null;
};

async function fetchInboundEmails(
  req: Request,
  from: Date,
  to: Date,
  opts: FetchInboundOpts = {},
): Promise<{ emails: InboundEmail[]; truncated: boolean }> {
  try {
    // Resolve the requesting user's default Gmail connection. This is the
    // same logic used by the live email client so the Recap mailbox stays
    // consistent with what the user sees in /email.
    const conn = await getGmailConnection(req);

    // If the local index has not been backfilled yet for this connection,
    // kick off a background sync so the next page load has data. The current
    // request still returns whatever (possibly empty) rows are already
    // present in the index — this keeps the response fast and unblocked from
    // Gmail rate limits.
    if (!conn.gmailIndexBackfilledAt) {
      triggerConnectionSync(conn.id);
    }

    // Inbound (INBOX) and outbound (SENT) are pulled with two separate
    // queries because they have very different filtering: inbound can be
    // narrowed by sender (when the user has filtered by customer/contact)
    // and capped, while outbound is always pulled in full — the user's own
    // mailbox SENT folder is naturally bounded and dedupes against
    // emailSendLog downstream.
    const baseConds = [
      eq(gmailMessageIndex.emailConnectionId, conn.id),
      gte(gmailMessageIndex.internalDate, from),
      lte(gmailMessageIndex.internalDate, to),
    ];

    // ── Inbound branch (legacy rows with NULL direction also fall through
    //    here so we keep showing them after migration / before the next
    //    background sync overwrites them with a populated direction).
    const inboundConds: any[] = [
      ...baseConds,
      // direction IS NULL OR direction = 'inbound'
      sql`(${gmailMessageIndex.direction} IS NULL OR ${gmailMessageIndex.direction} = 'inbound')`,
    ];
    if (opts.senderEmails && opts.senderEmails.length > 0) {
      inboundConds.push(inArray(gmailMessageIndex.senderEmail, opts.senderEmails));
    }

    const limit = opts.limit && opts.limit > 0 ? opts.limit : null;
    const inboundBase = db.select({
      messageId: gmailMessageIndex.messageId,
      internalDate: gmailMessageIndex.internalDate,
      senderEmail: gmailMessageIndex.senderEmail,
      senderName: gmailMessageIndex.senderName,
      senderDomain: gmailMessageIndex.senderDomain,
      subject: gmailMessageIndex.subject,
      threadId: gmailMessageIndex.threadId,
      direction: gmailMessageIndex.direction,
      recipientEmail: gmailMessageIndex.recipientEmail,
    }).from(gmailMessageIndex).where(and(...inboundConds));

    const inboundRows = limit
      ? await inboundBase.orderBy(desc(gmailMessageIndex.internalDate)).limit(limit + 1)
      : await inboundBase.orderBy(asc(gmailMessageIndex.internalDate));

    const truncated = limit != null && inboundRows.length > limit;
    const inboundKept = truncated ? inboundRows.slice(0, limit!) : inboundRows;

    // ── Outbound branch — always pulled in full within the date window.
    //    No sender filter (the sender is the user themselves); no cap
    //    (size is naturally bounded by the user's own send activity).
    const outboundRows = await db.select({
      messageId: gmailMessageIndex.messageId,
      internalDate: gmailMessageIndex.internalDate,
      senderEmail: gmailMessageIndex.senderEmail,
      senderName: gmailMessageIndex.senderName,
      senderDomain: gmailMessageIndex.senderDomain,
      subject: gmailMessageIndex.subject,
      threadId: gmailMessageIndex.threadId,
      direction: gmailMessageIndex.direction,
      recipientEmail: gmailMessageIndex.recipientEmail,
    }).from(gmailMessageIndex).where(and(
      ...baseConds,
      eq(gmailMessageIndex.direction, "outbound"),
    ));

    const merged = [...inboundKept, ...outboundRows]
      .sort((a, b) => a.internalDate.getTime() - b.internalDate.getTime());

    return {
      emails: merged.map(r => ({
        id: r.messageId,
        date: new Date(r.internalDate),
        senderName: r.senderName ?? "",
        senderEmail: r.senderEmail ?? "",
        senderDomain: r.senderDomain ?? "",
        subject: r.subject ?? "(senza oggetto)",
        threadId: r.threadId ?? null,
        direction: (r.direction === "outbound" ? "outbound" : "inbound") as "inbound" | "outbound",
        recipientEmail: r.recipientEmail ?? null,
      })),
      truncated,
    };
  } catch {
    return { emails: [], truncated: false };
  }
}

interface RecapLoadResult {
  events: RecapEvent[];
  from: Date;
  to: Date;
  filters: {
    types: RecapEventType[];
    customerId: number | null;
    contactId: number | null;
    area: string | null;
    offerStatus: string | null;
    orderStatus: string | null;
  };
  /** True when the inbound mailbox read was capped at `inboundLimit` and
   *  older messages within the requested window are not in the response.
   *  Lets the UI display a "showing only the most recent N emails" banner. */
  inboundTruncated: boolean;
  /** Cap that was applied to the inbound mailbox read, or null when no cap
   *  was applied (e.g. when the user has filtered by customer/contact). */
  inboundLimit: number | null;
}

export async function loadRecapEvents(req: Request): Promise<RecapLoadResult> {
  const companyId = (req as any).companyId as number | undefined;
  if (!companyId) throw AppError.badRequest("Company non risolta");
  const salesmanId = getSalesmanId(req);
  const master = isMaster(req);
  const role = getUserRole(req);
  const ownerScope = master || role === "backoffice" || role === "amministrazione" ? null : salesmanId;

  const now = new Date();
  const defaultFrom = new Date(now); defaultFrom.setDate(defaultFrom.getDate() - 30);
  const defaultTo = new Date(now); defaultTo.setDate(defaultTo.getDate() + 60);
  const from = parseDate(req.query.from, defaultFrom);
  const to = parseDate(req.query.to, defaultTo);
  if (to.getTime() < from.getTime()) throw AppError.badRequest("Intervallo non valido");
  const MAX_RANGE_DAYS = 400;
  const rangeDays = Math.ceil((to.getTime() - from.getTime()) / (24 * 3600 * 1000));
  if (rangeDays > MAX_RANGE_DAYS) {
    throw AppError.badRequest(`Intervallo troppo ampio: massimo ${MAX_RANGE_DAYS} giorni`);
  }

  const typesParam = String(req.query.types ?? "").trim();
  const requestedTypes: Set<RecapEventType> = typesParam
    ? new Set(typesParam.split(",").map(t => t.trim()).filter(Boolean) as RecapEventType[])
    : new Set(ALL_TYPES);

  const customerIdFilter = req.query.customerId ? Number(req.query.customerId) : null;
  const contactIdFilter = req.query.contactId ? Number(req.query.contactId) : null;
  const areaFilter = (req.query.area ? String(req.query.area).trim() : "") || null;
  const offerStatusFilter = (req.query.offerStatus ? String(req.query.offerStatus).trim() : "") || null;
  const orderStatusFilter = (req.query.orderStatus ? String(req.query.orderStatus).trim() : "") || null;

  const customerRows = await db.select({
    id: customers.id, name: customers.name, country: customers.country, region: customers.region,
    salesmanId: customers.salesmanId,
  }).from(customers).where(eq(customers.companyId, companyId));
  const customerById = new Map<number, typeof customerRows[number]>();
  customerRows.forEach(c => customerById.set(c.id, c));

  const matchesArea = (customerId: number | null | undefined): boolean => {
    if (!areaFilter) return true;
    if (!customerId) return false;
    const c = customerById.get(customerId);
    const a = (c?.country || c?.region || "").toLowerCase();
    return a.includes(areaFilter.toLowerCase());
  };

  const customerFilterIds: number[] | null = customerIdFilter ? [customerIdFilter] : null;

  // Pre-load contacts so we can match inbound emails by sender address.
  const contactRows = await db.select({
    id: contacts.id,
    firstName: contacts.firstName,
    lastName: contacts.lastName,
    email: contacts.email,
    customerId: contacts.customerId,
  }).from(contacts).innerJoin(customers, eq(contacts.customerId, customers.id))
    .where(eq(customers.companyId, companyId));
  const contactsByEmail = new Map<string, typeof contactRows[number]>();
  for (const c of contactRows) {
    if (c.email) {
      const key = c.email.trim().toLowerCase();
      if (key && !contactsByEmail.has(key)) contactsByEmail.set(key, c);
    }
  }

  // Pre-load all user IDs in this company (used to scope sources that are not
  // directly tied to an offer/customer, e.g. email_send_log and activity_logs).
  const [companyUserRows, companyDealerRows] = await Promise.all([
    db.select({ id: salesmanUsers.id }).from(salesmanUsers).where(eq(salesmanUsers.companyId, companyId)),
    db.select({ id: dealerUsers.id }).from(dealerUsers).where(eq(dealerUsers.companyId, companyId)),
  ]);
  const companyUserIds = companyUserRows.map(u => u.id);
  const companyUserIdSet = new Set(companyUserIds);
  const companyDealerIdSet = new Set(companyDealerRows.map(u => u.id));

  const events: RecapEvent[] = [];
  const seenInteractionIds = new Set<number>();
  // Provider-side message IDs already covered by emailSendLog rows (or
  // their backing interactions). Used to dedupe outbound rows pulled from
  // the Gmail index so an email sent through QuotePilot does not appear
  // twice (once as `email_send:` from the log + once as `email_inbox:`
  // from the SENT folder mirror).
  const seenSentProviderMessageIds = new Set<string>();
  // Resolution: interactionId → Gmail threadId. Built while reading
  // emailSendLog so we can backfill `emailThreadId` on the corresponding
  // `interaction:` events for "same-email-thread" link grouping.
  const interactionIdToThreadId = new Map<number, string>();
  // Whether the inbound mailbox read hit the soft cap. Computed inside the
  // interaction block (which is the only consumer of fetchInboundEmails) and
  // surfaced via the result so the UI can show a banner.
  let inboundTruncated = false;

  if (requestedTypes.has("interaction")) {
    const conds: any[] = [
      eq(interactions.companyId, companyId),
      gte(interactions.date, from),
      lte(interactions.date, to),
    ];
    if (ownerScope != null) conds.push(eq(interactions.salesmanUserId, ownerScope));
    if (customerFilterIds) conds.push(inArray(interactions.customerId, customerFilterIds));
    if (contactIdFilter) conds.push(eq(interactions.contactId, contactIdFilter));

    // Pre-resolve provider thread ids for any email interactions in this
    // window. Done in a single SELECT so the per-row interaction loop
    // below can stamp `emailThreadId` on the events without an extra
    // round-trip per row. The same dictionary is also enriched while
    // processing emailSendLog later (covers rows whose interactionId
    // dropped out of the time window — defensive only).
    if (companyUserIds.length > 0) {
      const threadRows = await db.select({
        interactionId: emailSendLog.interactionId,
        threadId: emailSendLog.providerThreadId,
      }).from(emailSendLog).where(and(
        gte(emailSendLog.sentAt, from),
        lte(emailSendLog.sentAt, to),
        inArray(emailSendLog.salesmanUserId, companyUserIds),
      ));
      for (const t of threadRows) {
        if (t.interactionId != null && t.threadId) {
          interactionIdToThreadId.set(t.interactionId, t.threadId);
        }
      }
    }

    const rows = await db.select({
      i: interactions,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
      offerRef: offers.referenceNumber,
      jobNumber: jobOrders.jobNumber,
    }).from(interactions)
      .leftJoin(contacts, eq(interactions.contactId, contacts.id))
      .leftJoin(offers, eq(interactions.linkedOfferId, offers.id))
      .leftJoin(jobOrders, eq(interactions.linkedJobOrderId, jobOrders.id))
      .where(and(...conds));

    for (const r of rows) {
      const i = r.i;
      seenInteractionIds.add(i.id);
      // Skip auto-generated "offer_created" interactions: the canonical event
      // for an offer creation is the "offer_created" card derived from the
      // offers table (see #84). Historical rows remain visible in CRM/timeline
      // pages but stop producing duplicate Recap cards.
      if (i.type === "offer_created") continue;
      // Skip promoted interaction types: they are surfaced as their own
      // RecapEvent type (order_layout_added/_changed, order_document_added)
      // by dedicated loaders below, not as generic interactions.
      if (PROMOTED_INTERACTION_TYPES.has(i.type)) continue;
      if (!matchesArea(i.customerId)) continue;
      const cust = customerById.get(i.customerId);
      const contactName = r.contactFirst ? `${r.contactFirst}${r.contactLast ? " " + r.contactLast : ""}` : null;
      const isVisit = i.type === "visit";
      const titleType = i.type === "phone_call" ? "Telefonata"
        : i.type === "email" ? "Email"
        : i.type === "visit" ? "Visita"
        : i.type === "whatsapp" ? "WhatsApp"
        : i.type === "video_call" ? "Video call"
        : i.type === "offer_created" ? "Offerta creata"
        : i.type === "offer_versioned" ? "Nuova versione offerta"
        : i.type === "todo" ? "To Do"
        : i.type;
      events.push({
        id: `interaction:${i.id}`,
        type: "interaction",
        date: new Date(i.date).toISOString(),
        title: `${titleType}${i.direction === "inbound" ? " ←" : " →"} ${cust?.name ?? ""}`.trim(),
        description: i.notes ?? undefined,
        timePosition: classifyTimePosition(new Date(i.date), "interaction"),
        customerId: i.customerId,
        customerName: cust?.name ?? null,
        contactId: i.contactId,
        contactName,
        offerId: i.linkedOfferId,
        offerReference: r.offerRef ?? null,
        jobOrderId: i.linkedJobOrderId,
        jobOrderReference: r.jobNumber ?? null,
        area: customerArea(cust),
        href: `/crm/interactions/${i.id}/edit`,
        subtype: `${i.type}:${i.direction}${isVisit ? ":visit" : ""}`,
        // Stamp the Gmail thread id when this interaction is the
        // CRM-side mirror of an email we sent (joined via emailSendLog
        // above). Used by the Recap to draw "same-email-thread" links
        // between this card and any inbound reply pulled from the index.
        emailThreadId: i.type === "email" ? (interactionIdToThreadId.get(i.id) ?? null) : null,
      });
    }

    // ─── email_send_log: outbound emails actually sent through the system.
    // De-duplicated against interactions via interactionId when present.
    if (companyUserIds.length > 0) {
      const emailConds: any[] = [
        gte(emailSendLog.sentAt, from),
        lte(emailSendLog.sentAt, to),
        inArray(emailSendLog.salesmanUserId, companyUserIds),
      ];
      if (ownerScope != null) emailConds.push(eq(emailSendLog.salesmanUserId, ownerScope));
      if (customerFilterIds) emailConds.push(inArray(emailSendLog.customerId, customerFilterIds));

      const emailRows = await db.select({
        e: emailSendLog,
        offerRef: offers.referenceNumber,
        offerCompanyId: offers.companyId,
        jobNumber: jobOrders.jobNumber,
        jobCompanyId: jobOrders.companyId,
      }).from(emailSendLog)
        .leftJoin(offers, eq(emailSendLog.offerId, offers.id))
        .leftJoin(jobOrders, eq(emailSendLog.jobOrderId, jobOrders.id))
        .where(and(...emailConds));

      for (const row of emailRows) {
        const e = row.e;
        // Always seed the dedupe sets — even when this row is suppressed
        // because its interaction was already emitted: we still want the
        // SENT folder mirror (gmailMessageIndex) to skip the same message.
        if (e.providerMessageId) seenSentProviderMessageIds.add(e.providerMessageId);
        if (e.interactionId && e.providerThreadId) {
          interactionIdToThreadId.set(e.interactionId, e.providerThreadId);
        }
        if (e.interactionId && seenInteractionIds.has(e.interactionId)) continue;
        // Tenant guard: never expose offer/job references that don't belong
        // to this company even if the email_send_log row was scoped via user.
        const offerSafe = e.offerId != null && row.offerCompanyId === companyId;
        const jobSafe = e.jobOrderId != null && row.jobCompanyId === companyId;
        if (!matchesArea(e.customerId)) continue;
        const cust = e.customerId ? customerById.get(e.customerId) : undefined;
        // Skip rows whose customer isn't part of this company's known customers
        // (customerById is already filtered by companyId).
        if (e.customerId != null && !cust) continue;
        const d = new Date(e.sentAt);
        const recipientShort = e.recipient.length > 60 ? e.recipient.slice(0, 57) + "…" : e.recipient;
        events.push({
          id: `email_send:${e.id}`,
          type: "interaction",
          date: d.toISOString(),
          title: `Email → ${recipientShort}`,
          description: e.subject || undefined,
          timePosition: classifyTimePosition(d, "interaction"),
          customerId: e.customerId ?? null,
          customerName: cust?.name ?? null,
          offerId: offerSafe ? e.offerId : null,
          offerReference: offerSafe ? (row.offerRef ?? null) : null,
          jobOrderId: jobSafe ? e.jobOrderId : null,
          jobOrderReference: jobSafe ? (row.jobNumber ?? null) : null,
          area: customerArea(cust ?? null),
          // Deep-link to the sent message in the SENT folder when we know its
          // provider message id. For old rows (logged before the column
          // existed) fall back to a SENT-folder search by recipient/subject,
          // and finally to the offer or customer page.
          href: (() => {
            if (e.providerMessageId) {
              return `/email?messageId=${encodeURIComponent(e.providerMessageId)}&folder=SENT`;
            }
            const parts: string[] = [];
            if (e.recipient) parts.push(`to:${e.recipient}`);
            if (e.subject) parts.push(`subject:"${e.subject.replace(/"/g, "")}"`);
            if (parts.length > 0) {
              return `/email?folder=SENT&q=${encodeURIComponent(parts.join(" "))}`;
            }
            return offerSafe ? `/offers/${e.offerId}` : (cust ? `/crm/customers/${e.customerId}` : null);
          })(),
          subtype: `email:outbound:sent`,
          emailThreadId: e.providerThreadId ?? null,
        });
      }
    }

    // ─── Inbound emails (Gmail inbox) for the requesting user only.
    // Best-effort: silently skipped if the user has no Gmail connection.
    // We deliberately skip this call for export endpoints (Excel/PDF) so a
    // slow Gmail API never delays a download.
    const isExport = /\/export\.(xlsx|pdf)/.test(req.originalUrl || req.url || "");

    // When the user has narrowed by customer/contact we can pre-filter the
    // mailbox query by sender address. This both keeps the result set small
    // and lets us drop the global cap — narrowing always returns the full
    // set of matching messages from the local index. With no filter we apply
    // INBOUND_EMAILS_MAX so a heavy mailbox can't blow up the timeline.
    let narrowSenderEmails: string[] | null = null;
    if (customerFilterIds || contactIdFilter) {
      const matchedContacts = contactRows.filter(c => {
        if (contactIdFilter && c.id !== contactIdFilter) return false;
        if (customerFilterIds && !customerFilterIds.includes(c.customerId)) return false;
        return true;
      });
      narrowSenderEmails = matchedContacts
        .map(c => (c.email || "").trim().toLowerCase())
        .filter(Boolean);
      // No matching contacts → no inbound to fetch.
      if (narrowSenderEmails.length === 0) narrowSenderEmails = ["__no_match__"];
    }

    const inboundLimit = narrowSenderEmails ? null : INBOUND_EMAILS_MAX;
    const inboundResult = isExport
      ? { emails: [] as InboundEmail[], truncated: false }
      : await fetchInboundEmails(req, from, to, {
          limit: inboundLimit ?? undefined,
          senderEmails: narrowSenderEmails,
        });
    const inbound = inboundResult.emails;
    inboundTruncated = inboundResult.truncated;
    if (inbound.length > 0) {
      // Index offers/orders by reference for inline detection inside subjects.
      const offerByRef = new Map<string, { id: number; ref: string; customerId: number | null }>();
      const orderByRef = new Map<string, { id: number; ref: string; customerId: number | null }>();
      // Lazy-load only if we have inbound to match.
      const [allOffers, allOrders] = await Promise.all([
        db.select({ id: offers.id, ref: offers.referenceNumber, customerId: offers.customerId })
          .from(offers).where(eq(offers.companyId, companyId)),
        db.select({ id: jobOrders.id, ref: jobOrders.jobNumber, customerId: jobOrders.customerId })
          .from(jobOrders).where(and(eq(jobOrders.companyId, companyId), isNull(jobOrders.deletedAt))),
      ]);
      for (const o of allOffers) {
        if (o.ref && o.ref.length >= 3) offerByRef.set(o.ref.toLowerCase(), o as any);
      }
      for (const o of allOrders) {
        if (o.ref && o.ref.length >= 3) orderByRef.set(o.ref.toLowerCase(), o as any);
      }

      for (const m of inbound) {
        // Outbound rows arrive from the SENT folder mirror in the index.
        // Skip the ones we already emitted via emailSendLog (same provider
        // message id) so we don't double-count emails sent through QP.
        if (m.direction === "outbound" && seenSentProviderMessageIds.has(m.id)) {
          continue;
        }

        // Direction-aware "counterparty" resolution. Inbound = sender;
        // outbound = recipient. The contact lookup uses whichever address
        // is available so the same customer/offer detection logic applies.
        const counterpartyEmail = m.direction === "outbound"
          ? (m.recipientEmail || "").toLowerCase()
          : m.senderEmail;
        const counterpartyDisplay = m.direction === "outbound"
          ? (m.recipientEmail || "destinatario")
          : (m.senderName || m.senderEmail || "Mittente");
        const contact = counterpartyEmail ? contactsByEmail.get(counterpartyEmail) : undefined;
        let resolvedCustomerId: number | null = contact?.customerId ?? null;
        let resolvedContactId: number | null = contact?.id ?? null;
        let resolvedContactName: string | null = contact
          ? `${contact.firstName}${contact.lastName ? " " + contact.lastName : ""}`
          : (m.direction === "outbound" ? (m.recipientEmail || null) : (m.senderName || null));

        // Subject → offer/order detection (same heuristic for both directions).
        const haystack = m.subject.toLowerCase();
        let resolvedOffer: { id: number; ref: string; customerId: number | null } | null = null;
        let resolvedOrder: { id: number; ref: string; customerId: number | null } | null = null;
        for (const [ref, o] of offerByRef) {
          if (haystack.includes(ref)) { resolvedOffer = o; break; }
        }
        for (const [ref, o] of orderByRef) {
          if (haystack.includes(ref)) { resolvedOrder = o; break; }
        }
        if (!resolvedCustomerId) {
          resolvedCustomerId = resolvedOffer?.customerId ?? resolvedOrder?.customerId ?? null;
        }

        // Apply current filters consistently with other interaction sources.
        if (ownerScope != null) {
          // Inbound/outbound mailbox messages belong to the requesting user;
          // if a non-master scope is active, only show them when they map
          // to a customer owned by the same scope.
          const cust = resolvedCustomerId ? customerById.get(resolvedCustomerId) : undefined;
          if (resolvedCustomerId && cust && cust.salesmanId != null && cust.salesmanId !== ownerScope) continue;
        }
        if (customerFilterIds && (!resolvedCustomerId || !customerFilterIds.includes(resolvedCustomerId))) continue;
        if (contactIdFilter && resolvedContactId !== contactIdFilter) continue;
        if (!matchesArea(resolvedCustomerId)) continue;

        const cust = resolvedCustomerId ? customerById.get(resolvedCustomerId) : undefined;
        const counterpartyShort = (counterpartyDisplay || "").slice(0, 60);
        const isOutbound = m.direction === "outbound";
        events.push({
          // Distinct id prefixes per direction so React keys stay stable
          // even when the same Gmail messageId could (in degenerate cases)
          // appear as both INBOX and SENT (self-addressed mail).
          id: isOutbound ? `email_sent_idx:${m.id}` : `email_inbox:${m.id}`,
          type: "interaction",
          date: m.date.toISOString(),
          title: isOutbound ? `Email → ${counterpartyShort}` : `Email ← ${counterpartyShort}`,
          description: m.subject,
          timePosition: classifyTimePosition(m.date, "interaction"),
          customerId: resolvedCustomerId,
          customerName: cust?.name ?? null,
          contactId: resolvedContactId,
          contactName: resolvedContactName,
          offerId: resolvedOffer?.id ?? null,
          offerReference: resolvedOffer?.ref ?? null,
          jobOrderId: resolvedOrder?.id ?? null,
          jobOrderReference: resolvedOrder?.ref ?? null,
          area: customerArea(cust ?? null),
          href: isOutbound
            ? `/email?messageId=${encodeURIComponent(m.id)}&folder=SENT`
            : `/email?messageId=${encodeURIComponent(m.id)}`,
          subtype: isOutbound ? `email:outbound:sent` : `email:inbound:received`,
          emailThreadId: m.threadId ?? null,
        });
      }
    }
  }

  const needOffersCreated = requestedTypes.has("offer_created");
  const needOffersForecast = requestedTypes.has("offer_close_forecast");
  if (needOffersCreated || needOffersForecast) {
    const offerConds: any[] = [
      eq(offers.companyId, companyId),
      isNull(offers.deletedAt),
      eq(offers.offerType, "offer"),
    ];
    if (ownerScope != null) offerConds.push(eq(offers.salesmanUserId, ownerScope));
    if (customerFilterIds) offerConds.push(inArray(offers.customerId, customerFilterIds));
    if (offerStatusFilter) offerConds.push(eq(offers.status, offerStatusFilter));

    const offerRows = await db.select().from(offers).where(and(...offerConds));
    for (const o of offerRows) {
      if (!matchesArea(o.customerId)) continue;
      const cust = customerById.get(o.customerId);
      if (needOffersCreated) {
        const created = new Date(o.date);
        if (created >= from && created <= to) {
          events.push({
            id: `offer_created:${o.id}`,
            type: "offer_created",
            date: created.toISOString(),
            title: `Offerta ${o.referenceNumber}`,
            description: o.subject || undefined,
            timePosition: classifyTimePosition(created, "offer_created"),
            customerId: o.customerId,
            customerName: cust?.name ?? null,
            offerId: o.id,
            offerReference: o.referenceNumber,
            offerStatus: o.status,
            offerTotal: o.totalPrice ? Number(o.totalPrice) : null,
            area: customerArea(cust),
            href: `/offers/${o.id}`,
            subtype: o.status,
          });
        }
      }
      if (needOffersForecast) {
        const ec = (o.crmInfo as any)?.expectedCloseDate;
        if (ec) {
          const ecd = new Date(String(ec));
          if (!isNaN(ecd.getTime()) && ecd >= from && ecd <= to) {
            events.push({
              id: `offer_close_forecast:${o.id}`,
              type: "offer_close_forecast",
              date: ecd.toISOString(),
              title: `Chiusura prevista ${o.referenceNumber}`,
              description: o.subject || undefined,
              timePosition: "projection",
              customerId: o.customerId,
              customerName: cust?.name ?? null,
              offerId: o.id,
              offerReference: o.referenceNumber,
              offerStatus: o.status,
              offerTotal: o.totalPrice ? Number(o.totalPrice) : null,
              area: customerArea(cust),
              href: `/offers/${o.id}`,
              subtype: o.status,
            });
          }
        }
      }
    }
  }

  const needOrdersCreated = requestedTypes.has("order_created");
  const needOrdersMilestones = requestedTypes.has("order_milestone");
  if (needOrdersCreated || needOrdersMilestones) {
    const conds: any[] = [
      eq(jobOrders.companyId, companyId),
      isNull(jobOrders.deletedAt),
    ];
    if (ownerScope != null) conds.push(eq(jobOrders.responsibleUserId, ownerScope));
    if (customerFilterIds) conds.push(inArray(jobOrders.customerId, customerFilterIds as any));
    if (orderStatusFilter) conds.push(eq(jobOrders.status, orderStatusFilter));

    const orderRows = await db.select().from(jobOrders).where(and(...conds));
    for (const jo of orderRows) {
      if (jo.customerId != null && !matchesArea(jo.customerId)) continue;
      const cust = jo.customerId ? customerById.get(jo.customerId) : undefined;
      if (needOrdersCreated) {
        const created = new Date(jo.createdAt);
        if (created >= from && created <= to) {
          events.push({
            id: `order_created:${jo.id}`,
            type: "order_created",
            date: created.toISOString(),
            title: `Ordine ${jo.jobNumber}`,
            description: jo.notes || undefined,
            timePosition: classifyTimePosition(created, "order_created"),
            customerId: jo.customerId ?? null,
            customerName: cust?.name ?? null,
            jobOrderId: jo.id,
            jobOrderReference: jo.jobNumber,
            orderStatus: jo.status,
            area: customerArea(cust ?? null),
            href: `/orders/${jo.id}`,
            subtype: jo.status,
          });
        }
      }
      if (needOrdersMilestones) {
        const milestones: { date: Date | null; label: string; key: string }[] = [
          { date: jo.deliveryDate ? new Date(jo.deliveryDate) : null, label: "Consegna", key: "delivery" },
          { date: jo.assemblyDate ? new Date(jo.assemblyDate) : null, label: "Montaggio", key: "assembly" },
          { date: jo.testingDate ? new Date(jo.testingDate) : null, label: "Collaudo", key: "testing" },
        ];
        const logTimeline = (jo.logistics as any)?.timeline as any[] | undefined;
        if (Array.isArray(logTimeline)) {
          for (const t of logTimeline) {
            const planned = t?.plannedDate ? new Date(String(t.plannedDate)) : null;
            const actual = t?.actualDate ? new Date(String(t.actualDate)) : null;
            const d = actual ?? planned;
            if (!d || isNaN(d.getTime())) continue;
            milestones.push({
              date: d,
              label: String(t?.label ?? t?.type ?? "Milestone"),
              key: `log_${t?.type ?? "evt"}_${d.getTime()}`,
            });
          }
        }
        for (const m of milestones) {
          if (!m.date || isNaN(m.date.getTime())) continue;
          if (m.date < from || m.date > to) continue;
          events.push({
            id: `order_milestone:${jo.id}:${m.key}`,
            type: "order_milestone",
            date: m.date.toISOString(),
            title: `${m.label} ordine ${jo.jobNumber}`,
            timePosition: classifyTimePosition(m.date, "order_milestone"),
            customerId: jo.customerId ?? null,
            customerName: cust?.name ?? null,
            jobOrderId: jo.id,
            jobOrderReference: jo.jobNumber,
            orderStatus: jo.status,
            area: customerArea(cust ?? null),
            href: `/orders/${jo.id}`,
            subtype: m.key,
          });
        }
      }
    }
  }

  if (requestedTypes.has("reminder")) {
    const conds: any[] = [
      eq(offerReminders.companyId, companyId),
      eq(offerReminders.isDismissed, false),
      gte(offerReminders.remindAt, from),
      lte(offerReminders.remindAt, to),
    ];
    if (ownerScope != null) conds.push(eq(offerReminders.userId, ownerScope));
    if (offerStatusFilter) conds.push(eq(offers.status, offerStatusFilter));

    const rmRows = await db.select({
      r: offerReminders,
      offerRef: offers.referenceNumber,
      offerCustomerId: offers.customerId,
      offerStatus: offers.status,
    }).from(offerReminders)
      .innerJoin(offers, and(
        eq(offerReminders.offerId, offers.id),
        eq(offers.companyId, companyId),
      ))
      .where(and(...conds));

    for (const row of rmRows) {
      const r = row.r;
      const custId = row.offerCustomerId ?? null;
      if (customerFilterIds && custId !== customerFilterIds[0]) continue;
      if (!matchesArea(custId)) continue;
      const cust = custId ? customerById.get(custId) : undefined;
      const d = new Date(r.remindAt);
      events.push({
        id: `reminder:${r.id}`,
        type: "reminder",
        date: d.toISOString(),
        title: `Promemoria offerta ${row.offerRef ?? ""}`.trim(),
        description: r.note || undefined,
        timePosition: classifyTimePosition(d, "reminder"),
        customerId: custId,
        customerName: cust?.name ?? null,
        offerId: r.offerId,
        offerReference: row.offerRef ?? null,
        offerStatus: row.offerStatus ?? null,
        area: customerArea(cust ?? null),
        href: `/offers/${r.offerId}`,
      });
    }
  }

  if (requestedTypes.has("contact_recall")) {
    const scopedCustomerIds = ownerScope != null
      ? customerRows.filter(c => c.salesmanId === ownerScope).map(c => c.id)
      : customerRows.map(c => c.id);
    if (scopedCustomerIds.length > 0) {
      const conds: any[] = [
        inArray(contacts.customerId, scopedCustomerIds),
        isNotNull(contacts.nextRecall),
      ];
      if (contactIdFilter) conds.push(eq(contacts.id, contactIdFilter));
      if (customerFilterIds) conds.push(inArray(contacts.customerId, customerFilterIds));
      const cRows = await db.select().from(contacts).where(and(...conds));
      for (const c of cRows) {
        const raw = c.nextRecall;
        if (!raw) continue;
        const d = new Date(String(raw));
        if (isNaN(d.getTime()) || d < from || d > to) continue;
        if (!matchesArea(c.customerId)) continue;
        const cust = customerById.get(c.customerId);
        events.push({
          id: `contact_recall:${c.id}`,
          type: "contact_recall",
          date: d.toISOString(),
          title: `Recall ${c.firstName} ${c.lastName}`.trim(),
          timePosition: classifyTimePosition(d, "contact_recall"),
          customerId: c.customerId,
          customerName: cust?.name ?? null,
          contactId: c.id,
          contactName: `${c.firstName} ${c.lastName}`.trim(),
          area: customerArea(cust ?? null),
          href: `/crm/contacts/${c.id}`,
        });
      }
    }
  }

  if (requestedTypes.has("activity")) {
    // Unified activity fetch: pull rows in window scoped to *any* user that
    // belongs to the company (salesman or dealer), then classify per-row.
    // This catches: offer-linked activities, validations (which misuse
    // offerId as customerId), dealer-only events (login/logout), and
    // generic system activity logged by company users.
    const baseConds: any[] = [
      gte(activityLogs.createdAt, from),
      lte(activityLogs.createdAt, to),
    ];
    if (ownerScope != null) baseConds.push(eq(activityLogs.salesmanUserId, ownerScope));

    const rawRows = await db.select({
      a: activityLogs,
      offerCustomerId: offers.customerId,
      offerCompanyId: offers.companyId,
      offerStatus: offers.status,
    }).from(activityLogs)
      .leftJoin(offers, eq(activityLogs.offerId, offers.id))
      .where(and(...baseConds));

    for (const row of rawRows) {
      const a = row.a;
      // Tenant scoping: keep only rows that belong to this company through any
      // of: a real offer in this company, a salesman in this company, or a
      // dealer assigned to this company.
      const offerInCompany = row.offerCompanyId === companyId;
      const salesmanInCompany = a.salesmanUserId != null && companyUserIdSet.has(a.salesmanUserId);
      const dealerInCompany = a.dealerUserId != null && companyDealerIdSet.has(a.dealerUserId);
      if (!offerInCompany && !salesmanInCompany && !dealerInCompany) continue;

      // Offer status filter applies only to rows that actually carry a real
      // offer (otherwise it would silently drop validations/logins).
      if (offerStatusFilter) {
        if (!offerInCompany || row.offerStatus !== offerStatusFilter) continue;
      }

      // Resolve customer link only when offerId points to a real offer.
      const linkedCustomerId: number | null = offerInCompany ? (row.offerCustomerId ?? null) : null;
      if (customerFilterIds && linkedCustomerId !== customerFilterIds[0]) continue;
      if (areaFilter && linkedCustomerId == null) continue;
      if (!matchesArea(linkedCustomerId)) continue;

      // Skip "offer_created" activity entries: the canonical Recap card for an
      // offer creation comes from the offers table itself (see #84). The audit
      // trail in activity_logs remains untouched.
      if (a.action === "offer_created") continue;
      // Skip promoted activity actions: surfaced as their own RecapEvent type
      // (e.g. offer_status_changed) by dedicated loaders below.
      if (PROMOTED_ACTIVITY_ACTIONS.has(a.action)) continue;

      // Tenant guard: never expose the foreign offerReference text when the
      // joined offer doesn't belong to this company. (For validations the
      // offerReference field stores customer/contact name, which is always
      // safe to display, but a stale FK could otherwise leak.)
      const safeOfferRef = offerInCompany ? a.offerReference : null;
      const refForTitle = offerInCompany ? a.offerReference : null;
      const d = new Date(a.createdAt);
      events.push({
        id: `activity:${a.id}`,
        type: "activity",
        date: d.toISOString(),
        title: formatActivityTitle(a.action, refForTitle),
        description: `Eseguito da ${a.performedBy}`,
        timePosition: classifyTimePosition(d, "activity"),
        customerId: linkedCustomerId,
        offerId: offerInCompany ? a.offerId : null,
        offerReference: safeOfferRef,
        href: offerInCompany && a.offerId ? `/offers/${a.offerId}` : null,
        subtype: a.action,
      });
    }
  }

  // ─── Task #109: New RecapEvent loaders ────────────────────────────────
  // For all order_* loaders we scope by jobOrders.companyId; for all
  // offer_* loaders we scope by offers.companyId. Customer/area/owner
  // filters are applied via the customer matching and ownerScope checks
  // (responsibleUserId for orders, salesmanUserId for offers).

  // ── order_approved: one event per order whose confirmedAt falls in the
  // window AND whose confirmationStatus is 'confirmed' (the event name is
  // "approved" — rejection and revision_requested outcomes are intentionally
  // excluded so this loader stays semantically consistent with its label).
  if (requestedTypes.has("order_approved")) {
    const conds: any[] = [
      eq(jobOrders.companyId, companyId),
      isNotNull(jobOrders.confirmedAt),
      gte(jobOrders.confirmedAt, from),
      lte(jobOrders.confirmedAt, to),
      isNull(jobOrders.deletedAt),
      eq(jobOrders.confirmationStatus, "confirmed"),
    ];
    if (ownerScope != null) conds.push(eq(jobOrders.responsibleUserId, ownerScope));
    if (customerFilterIds) conds.push(inArray(jobOrders.customerId, customerFilterIds));

    const rows = await db.select({
      id: jobOrders.id,
      jobNumber: jobOrders.jobNumber,
      customerId: jobOrders.customerId,
      currentVersion: jobOrders.currentVersion,
      confirmedAt: jobOrders.confirmedAt,
      confirmationStatus: jobOrders.confirmationStatus,
      confirmedByUserId: jobOrders.confirmedByUserId,
    }).from(jobOrders).where(and(...conds));

    for (const r of rows) {
      if (!r.confirmedAt) continue;
      if (r.customerId == null) continue;
      if (!matchesArea(r.customerId)) continue;
      const cust = customerById.get(r.customerId);
      const d = new Date(r.confirmedAt);
      events.push({
        id: `order_approved:${r.id}`,
        type: "order_approved",
        date: d.toISOString(),
        title: `Ordine ${r.jobNumber} approvato (v${displayVersion(r.currentVersion)})`,
        timePosition: classifyTimePosition(d, "order_approved"),
        customerId: r.customerId,
        customerName: cust?.name ?? null,
        jobOrderId: r.id,
        jobOrderReference: r.jobNumber,
        area: customerArea(cust ?? null),
        href: `/orders/${r.id}`,
        subtype: "confirmed",
      });
    }
  }

  // ── order_versioned: one event per jobOrderVersions row with
  // versionNumber > 0. The row stores the OLD snapshot; the new version the
  // order moved to is versionNumber + 1.
  if (requestedTypes.has("order_versioned")) {
    const conds: any[] = [
      eq(jobOrders.companyId, companyId),
      isNull(jobOrders.deletedAt),
      gte(jobOrderVersions.createdAt, from),
      lte(jobOrderVersions.createdAt, to),
      // Skip the v0 creation snapshot; order_created already covers it.
      // (drizzle: use sql template for inequality on integer)
    ];
    if (ownerScope != null) conds.push(eq(jobOrders.responsibleUserId, ownerScope));
    if (customerFilterIds) conds.push(inArray(jobOrders.customerId, customerFilterIds));

    const rows = await db.select({
      id: jobOrderVersions.id,
      jobOrderId: jobOrderVersions.jobOrderId,
      versionNumber: jobOrderVersions.versionNumber,
      createdAt: jobOrderVersions.createdAt,
      // changeSummary describes the diff that produced the NEXT version
      // (the one the order moved to: versionNumber + 1). It's stored on the
      // archived OLD snapshot row at write time — see the manual-edit and
      // re-import handlers in server/routes/orders.ts.
      changeSummary: jobOrderVersions.changeSummary,
      changeNotes: jobOrderVersions.changeNotes,
      jobNumber: jobOrders.jobNumber,
      customerId: jobOrders.customerId,
    }).from(jobOrderVersions)
      .innerJoin(jobOrders, eq(jobOrderVersions.jobOrderId, jobOrders.id))
      .where(and(...conds));

    for (const r of rows) {
      if ((r.versionNumber ?? 0) <= 0) continue;
      if (r.customerId == null) continue;
      if (!matchesArea(r.customerId)) continue;
      const cust = customerById.get(r.customerId);
      const d = new Date(r.createdAt);
      const newVer = (r.versionNumber ?? 0) + 1;
      // Normalize the changeSummary into a clean string[] (filter out blanks
      // and duplicates) so the UI can render a stable bullet list.
      const rawSummary: unknown[] = Array.isArray(r.changeSummary) ? r.changeSummary : [];
      const summary = Array.from(new Set(
        rawSummary.map(x => (typeof x === "string" ? x.trim() : ""))
                  .filter(s => s.length > 0)
      ));
      // Description fallback: a compact one-line preview used by the smaller
      // popover surfaces that don't render the structured list — at most the
      // first 3 bullets, with an ellipsis if there are more.
      const previewBullets = summary.slice(0, 3).map(s => `• ${s}`).join("\n");
      const previewSuffix = summary.length > 3 ? `\n… +${summary.length - 3} altre modifiche` : "";
      const description = summary.length > 0
        ? `${previewBullets}${previewSuffix}`
        : (r.changeNotes ?? undefined);
      events.push({
        id: `order_versioned:${r.id}`,
        type: "order_versioned",
        date: d.toISOString(),
        title: `Ordine ${r.jobNumber} — nuova versione (v${displayVersion(newVer)})`,
        description,
        timePosition: classifyTimePosition(d, "order_versioned"),
        customerId: r.customerId,
        customerName: cust?.name ?? null,
        jobOrderId: r.jobOrderId,
        jobOrderReference: r.jobNumber,
        area: customerArea(cust ?? null),
        // Always link to the order page rather than a specific version snapshot:
        // OrderVersionView only renders historical (non-current) snapshots, so
        // when newVer is still the current version the diff route would 404.
        // The order page exposes the version timeline in its banner, so the
        // user can drill in from there. The recap card itself surfaces the
        // diff inline via `changeSummary` without requiring a click.
        href: `/orders/${r.jobOrderId}`,
        subtype: `v${displayVersion(newVer)}`,
        changeSummary: summary.length > 0 ? summary : null,
      });
    }
  }

  // ── order_email_link: one event per email attachment / message linked to
  // an order via emailAttachmentLinks (entityType='order').
  if (requestedTypes.has("order_email_link")) {
    const conds: any[] = [
      eq(emailAttachmentLinks.entityType, "order"),
      // Defense-in-depth: scope by both the link's company and the joined
      // jobOrder's company so cross-tenant rows can't leak through either.
      eq(emailAttachmentLinks.companyId, companyId),
      eq(jobOrders.companyId, companyId),
      isNull(jobOrders.deletedAt),
      gte(emailAttachmentLinks.uploadedAt, from),
      lte(emailAttachmentLinks.uploadedAt, to),
    ];
    if (ownerScope != null) conds.push(eq(jobOrders.responsibleUserId, ownerScope));
    if (customerFilterIds) conds.push(inArray(jobOrders.customerId, customerFilterIds));

    const rows = await db.select({
      id: emailAttachmentLinks.id,
      kind: emailAttachmentLinks.kind,
      originalName: emailAttachmentLinks.originalName,
      sourceSubject: emailAttachmentLinks.sourceSubject,
      sourceFrom: emailAttachmentLinks.sourceFrom,
      uploadedAt: emailAttachmentLinks.uploadedAt,
      jobOrderId: jobOrders.id,
      jobNumber: jobOrders.jobNumber,
      customerId: jobOrders.customerId,
    }).from(emailAttachmentLinks)
      .innerJoin(jobOrders, eq(emailAttachmentLinks.entityId, jobOrders.id))
      .where(and(...conds));

    for (const r of rows) {
      if (r.customerId == null) continue;
      if (!matchesArea(r.customerId)) continue;
      const cust = customerById.get(r.customerId);
      const d = new Date(r.uploadedAt);
      const isMessage = r.kind === "message";
      const label = isMessage ? "Email allegata" : "Allegato email";
      const subject = r.sourceSubject?.trim();
      const desc = subject || r.sourceFrom || r.originalName;
      events.push({
        id: `order_email_link:${r.id}`,
        type: "order_email_link",
        date: d.toISOString(),
        title: `${label} → ${r.jobNumber}: ${r.originalName}`,
        description: desc || undefined,
        timePosition: classifyTimePosition(d, "order_email_link"),
        customerId: r.customerId,
        customerName: cust?.name ?? null,
        jobOrderId: r.jobOrderId,
        jobOrderReference: r.jobNumber,
        area: customerArea(cust ?? null),
        href: `/orders/${r.jobOrderId}`,
        subtype: r.kind ?? "attachment",
      });
    }
  }

  // ── order_layout_added / order_layout_changed: emitted at upload time as
  // interactions with type=order_layout_added|_changed and linkedJobOrderId.
  // The standard interaction loader skips them (PROMOTED_INTERACTION_TYPES).
  // ── order_document_added: same emission pattern.
  {
    const wantLayoutAdd = requestedTypes.has("order_layout_added");
    const wantLayoutChg = requestedTypes.has("order_layout_changed");
    const wantDocAdd = requestedTypes.has("order_document_added");
    const promotedWanted: string[] = [];
    if (wantLayoutAdd) promotedWanted.push("order_layout_added");
    if (wantLayoutChg) promotedWanted.push("order_layout_changed");
    if (wantDocAdd) promotedWanted.push("order_document_added");

    if (promotedWanted.length > 0) {
      const conds: any[] = [
        eq(interactions.companyId, companyId),
        gte(interactions.date, from),
        lte(interactions.date, to),
        inArray(interactions.type, promotedWanted),
      ];
      if (ownerScope != null) conds.push(eq(interactions.salesmanUserId, ownerScope));
      if (customerFilterIds) conds.push(inArray(interactions.customerId, customerFilterIds));

      const rows = await db.select({
        i: interactions,
        jobNumber: jobOrders.jobNumber,
        jobCompanyId: jobOrders.companyId,
      }).from(interactions)
        .leftJoin(jobOrders, eq(interactions.linkedJobOrderId, jobOrders.id))
        .where(and(...conds));

      for (const r of rows) {
        const i = r.i;
        // Tenant guard: do not surface a job link that doesn't belong to
        // this company.
        const jobSafe = i.linkedJobOrderId != null && r.jobCompanyId === companyId;
        if (!jobSafe) continue;
        if (!matchesArea(i.customerId)) continue;
        const cust = customerById.get(i.customerId);
        const d = new Date(i.date);
        const t = i.type as RecapEventType;
        const titleVerb = t === "order_layout_added" ? "Layout caricato"
          : t === "order_layout_changed" ? "Layout sostituito"
          : "Documento caricato";
        events.push({
          id: `${t}:${i.id}`,
          type: t,
          date: d.toISOString(),
          title: `${titleVerb} → ${r.jobNumber}`,
          description: i.notes ?? undefined,
          timePosition: classifyTimePosition(d, t),
          customerId: i.customerId,
          customerName: cust?.name ?? null,
          jobOrderId: i.linkedJobOrderId,
          jobOrderReference: r.jobNumber ?? null,
          area: customerArea(cust ?? null),
          href: `/orders/${i.linkedJobOrderId}`,
          subtype: t,
        });
        seenInteractionIds.add(i.id);
      }
    }
  }

  // ── offer_status_changed: from activityLogs where action='offer_status_changed'.
  if (requestedTypes.has("offer_status_changed")) {
    const conds: any[] = [
      eq(activityLogs.action, "offer_status_changed"),
      gte(activityLogs.createdAt, from),
      lte(activityLogs.createdAt, to),
      eq(offers.companyId, companyId),
    ];
    if (ownerScope != null) conds.push(eq(activityLogs.salesmanUserId, ownerScope));

    const rows = await db.select({
      a: activityLogs,
      offerCustomerId: offers.customerId,
      offerStatus: offers.status,
    }).from(activityLogs)
      .innerJoin(offers, eq(activityLogs.offerId, offers.id))
      .where(and(...conds));

    for (const row of rows) {
      const a = row.a;
      const custId = row.offerCustomerId ?? null;
      // Read the actual transition captured at write time (Task #109).
      // Falls back gracefully for legacy rows that pre-date the meta column.
      const meta = (a.meta ?? {}) as { fromStatus?: string | null; toStatus?: string | null };
      const fromStatus = meta.fromStatus ?? null;
      const toStatus = meta.toStatus ?? null;
      // The user-selectable status filter targets the resulting status of
      // the transition (toStatus), not the offer's current status — which
      // would otherwise misclassify historical events for offers that have
      // since changed status again.
      if (offerStatusFilter && toStatus !== offerStatusFilter) continue;
      if (customerFilterIds && custId !== customerFilterIds[0]) continue;
      if (!matchesArea(custId)) continue;
      const cust = custId ? customerById.get(custId) : undefined;
      const d = new Date(a.createdAt);
      const transitionLabel = fromStatus && toStatus
        ? `${fromStatus} → ${toStatus}`
        : toStatus ?? fromStatus ?? "?";
      events.push({
        id: `offer_status_changed:${a.id}`,
        type: "offer_status_changed",
        date: d.toISOString(),
        title: `Offerta ${a.offerReference ?? ""}: ${transitionLabel}`.trim(),
        description: `Eseguito da ${a.performedBy}`,
        timePosition: classifyTimePosition(d, "offer_status_changed"),
        customerId: custId,
        customerName: cust?.name ?? null,
        offerId: a.offerId,
        offerReference: a.offerReference ?? null,
        // Surface the resulting (toStatus) for downstream UI, not the
        // offer's current status which is unrelated to this event.
        offerStatus: toStatus,
        area: customerArea(cust ?? null),
        href: a.offerId ? `/offers/${a.offerId}` : null,
        subtype: toStatus ?? "unknown",
      });
    }
  }

  // ── offer_drawing_added: drawings linked to an offer (offerId NOT NULL).
  if (requestedTypes.has("offer_drawing_added")) {
    const conds: any[] = [
      isNotNull(drawings.offerId),
      eq(offers.companyId, companyId),
      gte(drawings.createdAt, from),
      lte(drawings.createdAt, to),
    ];
    if (ownerScope != null) conds.push(eq(drawings.createdByUserId, ownerScope));
    if (customerFilterIds) conds.push(inArray(drawings.customerId, customerFilterIds));

    const rows = await db.select({
      id: drawings.id,
      createdAt: drawings.createdAt,
      pdfOriginalName: drawings.pdfOriginalName,
      dwgOriginalName: drawings.dwgOriginalName,
      notes: drawings.notes,
      customerId: drawings.customerId,
      offerId: drawings.offerId,
      offerRef: offers.referenceNumber,
    }).from(drawings)
      .innerJoin(offers, eq(drawings.offerId, offers.id))
      .where(and(...conds));

    for (const r of rows) {
      if (!matchesArea(r.customerId)) continue;
      const cust = customerById.get(r.customerId);
      const d = new Date(r.createdAt);
      const fileLabel = r.pdfOriginalName || r.dwgOriginalName || "(senza nome)";
      events.push({
        id: `offer_drawing_added:${r.id}`,
        type: "offer_drawing_added",
        date: d.toISOString(),
        title: `Disegno offerta ${r.offerRef ?? ""}: ${fileLabel}`.trim(),
        description: r.notes || undefined,
        timePosition: classifyTimePosition(d, "offer_drawing_added"),
        customerId: r.customerId,
        customerName: cust?.name ?? null,
        offerId: r.offerId,
        offerReference: r.offerRef ?? null,
        area: customerArea(cust ?? null),
        href: r.offerId ? `/offers/${r.offerId}` : null,
        subtype: r.pdfOriginalName ? "pdf" : "dwg",
      });
    }
  }

  // ── offer_drawing_ready: drawingRequests fulfilled in the window.
  if (requestedTypes.has("offer_drawing_ready")) {
    const conds: any[] = [
      eq(drawingRequests.companyId, companyId),
      eq(drawingRequests.status, "fulfilled"),
      isNotNull(drawingRequests.fulfilledAt),
      gte(drawingRequests.fulfilledAt, from),
      lte(drawingRequests.fulfilledAt, to),
    ];
    if (ownerScope != null) conds.push(eq(drawingRequests.requestedByUserId, ownerScope));
    if (customerFilterIds) conds.push(inArray(drawingRequests.customerId, customerFilterIds));

    const rows = await db.select({
      id: drawingRequests.id,
      fulfilledAt: drawingRequests.fulfilledAt,
      notes: drawingRequests.notes,
      customerId: drawingRequests.customerId,
      offerId: drawingRequests.offerId,
      offerRef: offers.referenceNumber,
      offerCompanyId: offers.companyId,
    }).from(drawingRequests)
      .leftJoin(offers, eq(drawingRequests.offerId, offers.id))
      .where(and(...conds));

    for (const r of rows) {
      if (!r.fulfilledAt) continue;
      if (!matchesArea(r.customerId)) continue;
      const cust = customerById.get(r.customerId);
      const d = new Date(r.fulfilledAt);
      // Tenant guard for the joined offer reference.
      const offerSafe = r.offerId != null && r.offerCompanyId === companyId;
      const offerLabel = offerSafe ? (r.offerRef ?? `#${r.offerId}`) : "(senza offerta)";
      events.push({
        id: `offer_drawing_ready:${r.id}`,
        type: "offer_drawing_ready",
        date: d.toISOString(),
        title: `Disegno evaso per offerta ${offerLabel}`,
        description: r.notes || undefined,
        timePosition: classifyTimePosition(d, "offer_drawing_ready"),
        customerId: r.customerId,
        customerName: cust?.name ?? null,
        offerId: offerSafe ? r.offerId : null,
        offerReference: offerSafe ? (r.offerRef ?? null) : null,
        area: customerArea(cust ?? null),
        // Always provide a clickable destination: prefer the linked offer
        // when safe, fall back to the drawings index so the user can find
        // the fulfilled request.
        href: offerSafe && r.offerId ? `/offers/${r.offerId}` : "/drawings",
        subtype: "fulfilled",
      });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  // ─── Compute lightweight relations between events in this payload.
  // Priority: same-order > same-offer > same-contact > same-customer.
  // The first two surface the strongest business chain (mail+offerta,
  // mail+ordine, milestones+ordine). Contact and customer links are also
  // emitted so emails to the same person/company are visually connected,
  // but with a small per-kind cap to avoid one giant cluster.
  const byOffer = new Map<number, string[]>();
  const byOrder = new Map<number, string[]>();
  const byContact = new Map<number, string[]>();
  const byCustomer = new Map<number, string[]>();
  // Group events by Gmail thread id so the timeline can visually connect a
  // sent email with all replies in the same thread (and any auto-generated
  // CRM interaction). Built from the `emailThreadId` stamped earlier on
  // interaction/email events.
  const byEmailThread = new Map<string, string[]>();
  for (const e of events) {
    if (e.offerId != null) {
      const arr = byOffer.get(e.offerId) ?? [];
      arr.push(e.id);
      byOffer.set(e.offerId, arr);
    }
    if (e.jobOrderId != null) {
      const arr = byOrder.get(e.jobOrderId) ?? [];
      arr.push(e.id);
      byOrder.set(e.jobOrderId, arr);
    }
    if (e.contactId != null) {
      const arr = byContact.get(e.contactId) ?? [];
      arr.push(e.id);
      byContact.set(e.contactId, arr);
    }
    if (e.customerId != null) {
      const arr = byCustomer.get(e.customerId) ?? [];
      arr.push(e.id);
      byCustomer.set(e.customerId, arr);
    }
    if (e.emailThreadId) {
      const arr = byEmailThread.get(e.emailThreadId) ?? [];
      arr.push(e.id);
      byEmailThread.set(e.emailThreadId, arr);
    }
  }
  const MAX_LINKS_PER_EVENT = 24;
  const MAX_THREAD_LINKS = 12;
  const MAX_CONTACT_LINKS = 6;
  const MAX_CUSTOMER_LINKS = 4;
  for (const e of events) {
    const seen = new Set<string>();
    // Strong links = business chains (offer/order/email-thread). Weak links =
    // context-only (contact/customer). The Recap UI uses `strong` to decide
    // what deserves satellite chips, temporal clustering and counter badges
    // (#85). Email-thread links are emitted first so a Send/Reply pair always
    // wins room over softer same-customer ties when the per-event cap bites.
    const links: { targetId: string; kind: "same-offer" | "same-order" | "same-contact" | "same-customer" | "same-email-thread"; strong: boolean }[] = [];
    if (e.emailThreadId) {
      let added = 0;
      for (const tid of byEmailThread.get(e.emailThreadId) ?? []) {
        if (tid === e.id || seen.has(tid)) continue;
        seen.add(tid);
        links.push({ targetId: tid, kind: "same-email-thread", strong: true });
        added++;
        if (added >= MAX_THREAD_LINKS || links.length >= MAX_LINKS_PER_EVENT) break;
      }
    }
    if (e.offerId != null && links.length < MAX_LINKS_PER_EVENT) {
      for (const tid of byOffer.get(e.offerId) ?? []) {
        if (tid === e.id || seen.has(tid)) continue;
        seen.add(tid);
        links.push({ targetId: tid, kind: "same-offer", strong: true });
        if (links.length >= MAX_LINKS_PER_EVENT) break;
      }
    }
    if (e.jobOrderId != null && links.length < MAX_LINKS_PER_EVENT) {
      for (const tid of byOrder.get(e.jobOrderId) ?? []) {
        if (tid === e.id || seen.has(tid)) continue;
        seen.add(tid);
        links.push({ targetId: tid, kind: "same-order", strong: true });
        if (links.length >= MAX_LINKS_PER_EVENT) break;
      }
    }
    if (e.contactId != null && links.length < MAX_LINKS_PER_EVENT) {
      let added = 0;
      for (const tid of byContact.get(e.contactId) ?? []) {
        if (tid === e.id || seen.has(tid)) continue;
        seen.add(tid);
        links.push({ targetId: tid, kind: "same-contact", strong: false });
        added++;
        if (added >= MAX_CONTACT_LINKS || links.length >= MAX_LINKS_PER_EVENT) break;
      }
    }
    if (e.customerId != null && links.length < MAX_LINKS_PER_EVENT) {
      let added = 0;
      for (const tid of byCustomer.get(e.customerId) ?? []) {
        if (tid === e.id || seen.has(tid)) continue;
        seen.add(tid);
        links.push({ targetId: tid, kind: "same-customer", strong: false });
        added++;
        if (added >= MAX_CUSTOMER_LINKS || links.length >= MAX_LINKS_PER_EVENT) break;
      }
    }
    if (links.length > 0) e.links = links;
  }

  // ── Talent quotes / campaigns events (from activity_logs).
  const QUOTE_ACTIONS: Array<{ action: string; type: RecapEventType; titlePrefix: string; hrefBuilder: (a: any) => string | null }> = [
    { action: "quote_sent", type: "quote_sent", titlePrefix: "Preventivo inviato", hrefBuilder: (a) => a.meta?.quoteId ? `/quotes/${a.meta.quoteId}` : null },
    { action: "quote_accepted", type: "quote_accepted", titlePrefix: "Preventivo accettato", hrefBuilder: (a) => a.meta?.quoteId ? `/quotes/${a.meta.quoteId}` : null },
    { action: "deliverable_published", type: "deliverable_published", titlePrefix: "Deliverable pubblicato", hrefBuilder: (a) => a.meta?.campaignId ? `/campaigns/${a.meta.campaignId}` : null },
    { action: "campaign_payment_in_recorded", type: "campaign_payment_in", titlePrefix: "Pagamento in entrata", hrefBuilder: (a) => a.meta?.campaignId ? `/campaigns/${a.meta.campaignId}` : null },
    { action: "campaign_payment_out_recorded", type: "campaign_payment_out", titlePrefix: "Pagamento talent", hrefBuilder: (a) => a.meta?.campaignId ? `/campaigns/${a.meta.campaignId}` : null },
  ];
  for (const cfg of QUOTE_ACTIONS) {
    if (!requestedTypes.has(cfg.type)) continue;
    const conds: any[] = [
      eq(activityLogs.action, cfg.action),
      gte(activityLogs.createdAt, from),
      lte(activityLogs.createdAt, to),
    ];
    if (ownerScope != null) conds.push(eq(activityLogs.salesmanUserId, ownerScope));
    const rows = await db.select().from(activityLogs).where(and(...conds));
    for (const a of rows) {
      // Tenant scope: only rows where the salesman belongs to this company.
      if (a.salesmanUserId != null && !companyUserIdSet.has(a.salesmanUserId)) continue;
      // Resolve campaign/quote brand for tenant guard + customer link.
      let brandCustomerId: number | null = null;
      let refLabel: string | null = a.offerReference ?? null;
      const meta = (a.meta ?? {}) as any;
      try {
        if (meta.quoteId) {
          const [q] = await db.select().from(talentQuotes).where(eq(talentQuotes.id, Number(meta.quoteId)));
          if (!q || q.companyId !== companyId) continue;
          brandCustomerId = q.brandCustomerId;
          refLabel = refLabel ?? q.referenceNumber;
        } else if (meta.campaignId) {
          const [c] = await db.select().from(campaigns).where(eq(campaigns.id, Number(meta.campaignId)));
          if (!c || c.companyId !== companyId) continue;
          brandCustomerId = c.brandCustomerId;
          refLabel = refLabel ?? c.code;
        }
      } catch { continue; }
      if (customerFilterIds && (!brandCustomerId || !customerFilterIds.includes(brandCustomerId))) continue;
      if (!matchesArea(brandCustomerId)) continue;
      const cust = brandCustomerId ? customerById.get(brandCustomerId) : undefined;
      const d = new Date(a.createdAt);
      const detail = cfg.action === "deliverable_published" && meta.talentName
        ? ` — ${meta.talentName}${meta.deliverableType ? ` (${meta.deliverableType})` : ""}`
        : (cfg.action.startsWith("campaign_payment") && meta.amountEur)
          ? ` — € ${meta.amountEur}`
          : "";
      events.push({
        id: `${cfg.type}:${a.id}`,
        type: cfg.type,
        date: d.toISOString(),
        title: `${cfg.titlePrefix} ${refLabel ?? ""}${detail}`.trim(),
        description: `Eseguito da ${a.performedBy}`,
        timePosition: classifyTimePosition(d, cfg.type),
        customerId: brandCustomerId,
        customerName: cust?.name ?? null,
        offerReference: refLabel,
        area: customerArea(cust ?? null),
        href: cfg.hrefBuilder(a),
        subtype: meta.status ?? null,
      });
    }
  }

  return {
    events,
    from,
    to,
    filters: {
      types: Array.from(requestedTypes),
      customerId: customerIdFilter,
      contactId: contactIdFilter,
      area: areaFilter,
      offerStatus: offerStatusFilter,
      orderStatus: orderStatusFilter,
    },
    inboundTruncated,
    inboundLimit: inboundTruncated ? INBOUND_EMAILS_MAX : null,
  };
}

router.get("/api/recap/events", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const { events, from, to, inboundTruncated, inboundLimit } = await loadRecapEvents(req);
  res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    count: events.length,
    events,
    inboundTruncated,
    inboundLimit,
  });
}));

// ─── Excel export ───────────────────────────────────────────────────────
router.get("/api/recap/export.xlsx", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const { events, from, to, filters } = await loadRecapEvents(req);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Recap");

  ws.addRow([`Recap commerciale`]);
  ws.addRow([`Periodo: ${dfFormat(from, "d MMM yyyy", { locale: it })} – ${dfFormat(to, "d MMM yyyy", { locale: it })}`]);
  const filterParts: string[] = [];
  filterParts.push(`Tipi: ${filters.types.map(t => RECAP_EVENT_TYPE_LABELS[t]).join(", ")}`);
  if (filters.customerId) filterParts.push(`Cliente ID: ${filters.customerId}`);
  if (filters.contactId) filterParts.push(`Contatto ID: ${filters.contactId}`);
  if (filters.area) filterParts.push(`Area: ${filters.area}`);
  if (filters.offerStatus) filterParts.push(`Stato offerta: ${filters.offerStatus}`);
  if (filters.orderStatus) filterParts.push(`Stato ordine: ${filters.orderStatus}`);
  ws.addRow([`Filtri: ${filterParts.join(" · ")}`]);
  ws.addRow([]);

  const header = [
    "Data", "Ora", "Tipo", "Posizione", "Cliente", "Contatto",
    "Riferimento offerta", "Stato offerta", "Totale offerta",
    "Riferimento ordine", "Stato ordine", "Area",
    "Titolo", "Descrizione",
  ];
  const headerRow = ws.addRow(header);
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });

  const tpLabel: Record<string, string> = { past: "Passato", future: "Futuro", projection: "Proiezione" };
  for (const e of events) {
    const d = new Date(e.date);
    ws.addRow([
      dfFormat(d, "yyyy-MM-dd"),
      dfFormat(d, "HH:mm"),
      RECAP_EVENT_TYPE_LABELS[e.type],
      tpLabel[e.timePosition] ?? e.timePosition,
      e.customerName ?? "",
      e.contactName ?? "",
      e.offerReference ?? "",
      e.offerStatus ?? "",
      e.offerTotal ?? "",
      e.jobOrderReference ?? "",
      e.orderStatus ?? "",
      e.area ?? "",
      e.title,
      e.description ?? "",
    ]);
  }

  const widths = [12, 8, 18, 12, 28, 24, 18, 14, 12, 18, 14, 14, 36, 50];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const filename = `recap_${dfFormat(from, "yyyyMMdd")}_${dfFormat(to, "yyyyMMdd")}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
}));

// ─── PDF export ─────────────────────────────────────────────────────────

const TYPE_COLORS: Record<RecapEventType, { bg: string; fg: string; border: string }> = {
  interaction:           { bg: "#D1FAE5", fg: "#065F46", border: "#A7F3D0" },
  offer_created:         { bg: "#EDE9FE", fg: "#5B21B6", border: "#DDD6FE" },
  offer_close_forecast:  { bg: "#F5F3FF", fg: "#6D28D9", border: "#DDD6FE" },
  // Offer family — violet/fuchsia.
  offer_status_changed:  { bg: "#F5F3FF", fg: "#5B21B6", border: "#DDD6FE" },
  offer_drawing_added:   { bg: "#FAE8FF", fg: "#86198F", border: "#F5D0FE" },
  offer_drawing_ready:   { bg: "#FDF4FF", fg: "#A21CAF", border: "#F5D0FE" },
  // Order family — indigo/blue/sky.
  order_created:         { bg: "#E0E7FF", fg: "#3730A3", border: "#C7D2FE" },
  order_milestone:       { bg: "#DBEAFE", fg: "#1E40AF", border: "#BFDBFE" },
  order_approved:        { bg: "#E0E7FF", fg: "#312E81", border: "#A5B4FC" },
  order_versioned:       { bg: "#EEF2FF", fg: "#3730A3", border: "#C7D2FE" },
  order_email_link:      { bg: "#EFF6FF", fg: "#1E40AF", border: "#BFDBFE" },
  order_layout_added:    { bg: "#E0F2FE", fg: "#0369A1", border: "#BAE6FD" },
  order_layout_changed:  { bg: "#F0F9FF", fg: "#0369A1", border: "#BAE6FD" },
  order_document_added:  { bg: "#EFF6FF", fg: "#1E40AF", border: "#BFDBFE" },
  reminder:              { bg: "#FEF3C7", fg: "#92400E", border: "#FDE68A" },
  contact_recall:        { bg: "#FCE7F3", fg: "#9D174D", border: "#FBCFE8" },
  activity:              { bg: "#F1F5F9", fg: "#334155", border: "#E2E8F0" },
  // Talent Studio (Task #2): preventivi/campagne/pagamenti.
  quote_sent:            { bg: "#EDE9FE", fg: "#5B21B6", border: "#DDD6FE" },
  quote_accepted:        { bg: "#D1FAE5", fg: "#065F46", border: "#A7F3D0" },
  deliverable_published: { bg: "#E0F2FE", fg: "#0369A1", border: "#BAE6FD" },
  campaign_payment_in:   { bg: "#D1FAE5", fg: "#065F46", border: "#A7F3D0" },
  campaign_payment_out:  { bg: "#FEE2E2", fg: "#9F1239", border: "#FECACA" },
};

function startOfBucket(d: Date, g: RecapGranularity): Date {
  if (g === "day") return startOfDay(d);
  if (g === "week") return startOfWeek(d, { weekStartsOn: 1 });
  if (g === "month") return startOfMonth(d);
  return startOfYear(d);
}
function addBucket(d: Date, g: RecapGranularity, n: number): Date {
  if (g === "day") return addDays(d, n);
  if (g === "week") return addWeeks(d, n);
  if (g === "month") return addMonths(d, n);
  return addYears(d, n);
}
function bucketLabel(d: Date, g: RecapGranularity): string {
  if (g === "day") return dfFormat(d, "EEE d MMM", { locale: it });
  if (g === "week") return `Sett. ${dfFormat(d, "w", { locale: it })} · ${dfFormat(d, "d MMM", { locale: it })}`;
  if (g === "month") return dfFormat(d, "MMMM yyyy", { locale: it });
  return dfFormat(d, "yyyy");
}
function inBucket(eventDate: Date, bucketStart: Date, g: RecapGranularity): boolean {
  if (g === "day") return isSameDay(eventDate, bucketStart);
  const next = addBucket(bucketStart, g, 1);
  return eventDate.getTime() >= bucketStart.getTime() && eventDate.getTime() < next.getTime();
}

function escapeHtml(s: any): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function getChromiumPath(): string {
  try { return execSync("which chromium", { encoding: "utf-8" }).trim(); }
  catch { return "/usr/bin/chromium"; }
}

router.get("/api/recap/export.pdf", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const { events, from, to, filters } = await loadRecapEvents(req);

  const granularity = ((String(req.query.granularity ?? "week")) as RecapGranularity);
  const validGran: RecapGranularity[] = ["day", "week", "month", "year"];
  const g: RecapGranularity = validGran.includes(granularity) ? granularity : "week";

  // Derive bucket start/end from the loaded range
  const winStart = startOfBucket(from, g);
  // number of buckets covering the range
  let buckets: { start: Date; events: RecapEvent[] }[] = [];
  let cursor = winStart;
  let safety = 0;
  while (cursor.getTime() < to.getTime() && safety < 400) {
    buckets.push({ start: cursor, events: [] });
    cursor = addBucket(cursor, g, 1);
    safety++;
  }
  // Ensure the bucket that contains `to` is included when `to` doesn't sit
  // exactly on a bucket boundary (e.g. arbitrary intervals from API callers).
  if (buckets.length === 0 || addBucket(buckets[buckets.length - 1].start, g, 1).getTime() < to.getTime()) {
    buckets.push({ start: cursor, events: [] });
  }
  if (buckets.length === 0) buckets.push({ start: winStart, events: [] });

  for (const ev of events) {
    const ed = parseISO(ev.date);
    const idx = buckets.findIndex(b => inBucket(ed, b.start, g));
    if (idx >= 0) buckets[idx].events.push(ev);
  }

  const granLabel = g === "day" ? "Giorno" : g === "week" ? "Settimana" : g === "month" ? "Mese" : "Anno";
  const filterChips: string[] = [];
  if (filters.customerId) filterChips.push(`Cliente #${filters.customerId}`);
  if (filters.contactId) filterChips.push(`Contatto #${filters.contactId}`);
  if (filters.area) filterChips.push(`Area: ${filters.area}`);
  if (filters.offerStatus) filterChips.push(`Stato offerta: ${filters.offerStatus}`);
  if (filters.orderStatus) filterChips.push(`Stato ordine: ${filters.orderStatus}`);

  const typeChipsHtml = filters.types.map(t => {
    const c = TYPE_COLORS[t];
    return `<span style="display:inline-block;font-size:9px;padding:2px 7px;border-radius:999px;background:${c.bg};color:${c.fg};border:1px solid ${c.border};margin:1px 3px 1px 0;">${escapeHtml(RECAP_EVENT_TYPE_LABELS[t])}</span>`;
  }).join("");

  const colsHtml = buckets.map(b => {
    const next = addBucket(b.start, g, 1);
    const isCurrent = Date.now() >= b.start.getTime() && Date.now() < next.getTime();
    const isPast = next.getTime() < Date.now();
    const headerBg = isCurrent ? "#FEF3C7" : isPast ? "#F8FAFC" : "#EEF2FF";
    const headerFg = isCurrent ? "#92400E" : "#1E293B";
    const cellsHtml = b.events.length === 0
      ? `<div style="text-align:center;color:#CBD5E1;font-size:10px;padding:14px 0;">·</div>`
      : b.events.map(ev => {
          const c = TYPE_COLORS[ev.type];
          const time = g === "day"
            ? dfFormat(parseISO(ev.date), "HH:mm")
            : dfFormat(parseISO(ev.date), "d MMM HH:mm", { locale: it });
          const projectionStyle = ev.timePosition === "projection" ? "font-style:italic;" : "";
          return `
            <div style="background:${c.bg};color:${c.fg};border:1px solid ${c.border};${projectionStyle}border-radius:6px;padding:5px 7px;font-size:9.5px;line-height:1.3;page-break-inside:avoid;">
              <div style="font-weight:600;">${escapeHtml(ev.title)}</div>
              <div style="font-size:8.5px;opacity:0.85;margin-top:1px;">
                ${escapeHtml(time)}${ev.customerName ? ` · ${escapeHtml(ev.customerName)}` : ""}
              </div>
              ${ev.offerReference || ev.jobOrderReference ? `<div style="font-size:8px;opacity:0.75;margin-top:1px;">${ev.offerReference ? `Off. ${escapeHtml(ev.offerReference)}` : ""}${ev.jobOrderReference ? `${ev.offerReference ? " · " : ""}Ord. ${escapeHtml(ev.jobOrderReference)}` : ""}</div>` : ""}
            </div>`;
        }).join("");

    return `
      <div class="col">
        <div class="col-header" style="background:${headerBg};color:${headerFg};">
          <span>${escapeHtml(bucketLabel(b.start, g))}</span>
          ${b.events.length > 0 ? `<span style="font-weight:400;color:#64748B;">${b.events.length}</span>` : ""}
        </div>
        <div class="col-body">${cellsHtml}</div>
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"/>
<title>Recap</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0F172A; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .header { padding: 0 0 10px 0; border-bottom: 1px solid #E2E8F0; margin-bottom: 12px; }
  .title { font-size: 18px; font-weight: 700; margin: 0 0 2px 0; }
  .sub { font-size: 11px; color: #475569; }
  .filters { font-size: 10px; color: #475569; margin-top: 6px; }
  .grid { display: flex; flex-wrap: wrap; gap: 6px; align-items: stretch; }
  .col { flex: 0 0 calc(25% - 6px); border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; background: #fff; page-break-inside: avoid; }
  .col-header { padding: 5px 8px; font-size: 10.5px; font-weight: 600; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; }
  .col-body { padding: 6px; display: flex; flex-direction: column; gap: 5px; min-height: 30px; }
  .empty { text-align: center; color: #94A3B8; font-size: 11px; padding: 30px 0; }
</style></head>
<body>
  <div class="header">
    <div class="title">Recap commerciale</div>
    <div class="sub">
      Periodo: <strong>${escapeHtml(dfFormat(from, "d MMM yyyy", { locale: it }))} – ${escapeHtml(dfFormat(to, "d MMM yyyy", { locale: it }))}</strong>
       · Granularità: <strong>${escapeHtml(granLabel)}</strong>
       · ${events.length} eventi
    </div>
    <div class="filters">${typeChipsHtml}${filterChips.length ? ` <span style="margin-left:6px;">${filterChips.map(escapeHtml).join(" · ")}</span>` : ""}</div>
  </div>
  ${events.length === 0
    ? `<div class="empty">Nessun evento nel periodo selezionato.</div>`
    : `<div class="grid">${colsHtml}</div>`}
</body></html>`;

  const browser = await puppeteer.launch({
    executablePath: getChromiumPath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.emulateMediaType("print");
    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
    });
    const filename = `recap_${dfFormat(from, "yyyyMMdd")}_${dfFormat(to, "yyyyMMdd")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(pdfBuffer));
  } finally {
    await browser.close();
  }
}));

export default router;
