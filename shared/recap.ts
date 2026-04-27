// Shared model for the Recap timeline (events aggregated from many sources).

export type RecapEventType =
  | "interaction"
  | "offer_created"
  | "offer_close_forecast"
  | "offer_status_changed"
  | "offer_drawing_added"
  | "offer_drawing_ready"
  | "order_created"
  | "order_milestone"
  | "order_approved"
  | "order_versioned"
  | "order_email_link"
  | "order_layout_added"
  | "order_layout_changed"
  | "order_document_added"
  | "reminder"
  | "contact_recall"
  | "activity"
  | "quote_sent"
  | "quote_accepted"
  | "deliverable_published"
  | "campaign_payment_in"
  | "campaign_payment_out";

export type RecapTimePosition = "past" | "future" | "projection";

export interface RecapEvent {
  /** Stable unique id "type:sourceId[:variant]" — used for React keys & URL refs. */
  id: string;
  type: RecapEventType;
  /** ISO timestamp. */
  date: string;
  title: string;
  description?: string;
  /** Past = already happened. Future = certain future event (visit, reminder, planned milestone). Projection = forecast (offer expected close). */
  timePosition: RecapTimePosition;

  customerId?: number | null;
  customerName?: string | null;
  contactId?: number | null;
  contactName?: string | null;

  offerId?: number | null;
  offerReference?: string | null;
  offerStatus?: string | null;
  offerTotal?: number | null;

  jobOrderId?: number | null;
  jobOrderReference?: string | null;
  orderStatus?: string | null;

  /** Country / region used by area filter. */
  area?: string | null;

  /** In-app deep link to the source entity. */
  href?: string | null;

  /** Sub-type metadata (interaction direction, milestone kind, activity action…). */
  subtype?: string | null;

  /** Provider-side email thread/conversation id (Gmail threadId). Populated
   * for every email-flavoured event so the Recap can group received and
   * sent messages of the same conversation under a "same-email-thread"
   * link. Null when the source row predates thread-id capture. */
  emailThreadId?: string | null;

  /** Optional list of human-readable change descriptions captured at write
   * time. Currently used by `order_versioned` to surface the diff between
   * the new version and the previous one (sourced from
   * `jobOrderVersions.changeSummary`). UI renders these as a bullet list. */
  changeSummary?: string[] | null;

  /** Lightweight relations to other events in the same payload (used by Day Agenda
   * to draw the "network" of connected items, e.g. mail+offerta or mail+ordine).
   * Computed server-side: shared offerId, shared jobOrderId, etc. */
  links?: RecapEventLink[];
}

export type RecapLinkKind =
  | "same-offer"
  | "same-order"
  | "same-customer"
  | "same-contact"
  // Email-flavoured events (interaction:email, email_send, email_inbox,
  // outbound rows from gmail_message_index) that share the same Gmail
  // threadId — i.e. they belong to the same back-and-forth conversation.
  // Treated as a STRONG link because a thread is the most specific
  // grouping for a sequence of received and sent messages.
  | "same-email-thread";

export interface RecapEventLink {
  /** Id of another event in the same response. */
  targetId: string;
  kind: RecapLinkKind;
  /** True for business-critical chains (offer/order). False for context-only
   * links (same-customer, same-contact). The Recap UI uses this flag to
   * decide what deserves a satellite chip / temporal cluster / counter
   * badge vs. just a faint same-day curve. */
  strong: boolean;
}

export interface RecapFilters {
  from: string;
  to: string;
  types?: RecapEventType[];
  customerId?: number;
  contactId?: number;
  area?: string;
  offerStatus?: string;
  orderStatus?: string;
}

export const RECAP_EVENT_TYPE_LABELS: Record<RecapEventType, string> = {
  interaction: "Interazioni",
  offer_created: "Offerte create",
  offer_close_forecast: "Chiusure previste",
  offer_status_changed: "Cambi stato offerta",
  offer_drawing_added: "Disegni offerta",
  offer_drawing_ready: "Disegni evasi",
  order_created: "Ordini creati",
  order_milestone: "Milestone ordini",
  order_approved: "Approvazioni ordine",
  order_versioned: "Versioni ordine",
  order_email_link: "Email allegate a ordine",
  order_layout_added: "Layout ordine caricato",
  order_layout_changed: "Layout ordine sostituito",
  order_document_added: "Documenti ordine",
  reminder: "Promemoria",
  contact_recall: "Recall contatti",
  activity: "Attività di sistema",
  quote_sent: "Preventivi inviati",
  quote_accepted: "Preventivi accettati",
  deliverable_published: "Deliverable pubblicati",
  campaign_payment_in: "Pagamenti in entrata",
  campaign_payment_out: "Pagamenti talent",
};

export const RECAP_GRANULARITIES = ["day", "week", "month", "year"] as const;
export type RecapGranularity = typeof RECAP_GRANULARITIES[number];
