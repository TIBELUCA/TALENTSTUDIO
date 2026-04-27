import { Router } from "express";
import { requireSalesmanOrMaster } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import { getAiProvider } from "../services/ai";
import { loadRecapEvents } from "./recap";
import type { RecapEvent } from "@shared/recap";
import { format as dfFormat } from "date-fns";
import { it } from "date-fns/locale";
import { createHash } from "crypto";

const router = Router();

interface BriefingItem {
  title: string;
  detail?: string;
  link?: string | null;
  priority?: "alta" | "media" | "bassa";
}

type BriefingScopeKind = "daily" | "weekly" | "monthly" | "custom";

interface BriefingResponse {
  generatedAt: string;
  scopeKind: BriefingScopeKind;
  yesterdaySummary: string;
  todayHighlights: BriefingItem[];
  upcomingActions: BriefingItem[];
  reminders: BriefingItem[];
  warnings: BriefingItem[];
  /** How many events the AI actually saw (post-cap). */
  analyzedCount: number;
  /** How many events were available in the period (pre-cap). */
  totalCount: number;
  /** True when totalCount > analyzedCount (events were dropped). */
  truncated: boolean;
  /** Server processing time in ms (excludes network). */
  durationMs: number;
  /** Served from cache instead of a fresh AI call. */
  cached: boolean;
  /** Number of deterministic facts injected into the prompt. */
  factsUsed: number;
}

function compactEventForAi(e: RecapEvent): Record<string, any> {
  return {
    id: e.id,
    type: e.type,
    subtype: e.subtype ?? undefined,
    when: e.date,
    timePosition: e.timePosition,
    title: e.title,
    description: e.description ?? undefined,
    customer: e.customerName ?? undefined,
    contact: e.contactName ?? undefined,
    offer: e.offerReference ?? undefined,
    offerStatus: e.offerStatus ?? undefined,
    order: e.jobOrderReference ?? undefined,
    orderStatus: e.orderStatus ?? undefined,
    href: e.href ?? undefined,
  };
}

/**
 * Whitelist for AI-suggested links. The model is allowed to point only to
 * internal app paths (relative URLs starting with a single "/"). Anything
 * else (absolute URL, javascript:, protocol-relative "//", path traversal)
 * is dropped and replaced with null. Keeps the briefing safe to render
 * via <Link href={...}>.
 */
function sanitizeLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  if (v.toLowerCase().startsWith("/javascript:")) return null;
  if (v.includes("..")) return null;
  return v.slice(0, 200);
}

/**
 * Decide the scope kind from raw inputs. Defaults to "weekly" since the UI
 * defaults to a weekly window, but the FE typically passes scopeKind
 * explicitly. The kind drives both the prompt phrasing (today-centric vs
 * period-centric) and the cap.
 */
function normalizeScopeKind(raw: unknown): BriefingScopeKind {
  if (raw === "daily" || raw === "weekly" || raw === "monthly" || raw === "custom") return raw;
  return "weekly";
}

/**
 * Cap the events fed to the AI. Longer scopes get a bigger budget so a
 * monthly briefing doesn't silently truncate after 250 events.
 */
function capForScope(scope: BriefingScopeKind): number {
  if (scope === "monthly") return 600;
  if (scope === "custom") return 500;
  if (scope === "weekly") return 300;
  return 200;
}

/**
 * Precompute deterministic risk/attention facts from the loaded events.
 * The AI is then asked to *narrate and prioritize* these facts instead of
 * discovering them from scratch — this dramatically reduces hallucinations
 * and missed signals on long lists.
 */
function buildDeterministicFacts(events: RecapEvent[], referenceDate: Date): string[] {
  const facts: string[] = [];
  const refMs = referenceDate.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  // 1. Stale "Sent" offers: created/versioned more than 14 days before refDate.
  const staleOffers = new Map<string, { ref: string; days: number; customer?: string | null }>();
  for (const e of events) {
    const isOfferLike = e.type === "offer_created"
      || (e.type === "interaction" && (e.subtype === "offer_created" || e.subtype === "offer_versioned"));
    if (!isOfferLike) continue;
    if (e.offerStatus !== "Sent") continue;
    const ageDays = Math.floor((refMs - new Date(e.date).getTime()) / dayMs);
    if (ageDays < 14) continue;
    const key = e.offerReference ?? `offer:${e.offerId ?? e.id}`;
    const prev = staleOffers.get(key);
    if (!prev || ageDays > prev.days) {
      staleOffers.set(key, { ref: key, days: ageDays, customer: e.customerName });
    }
  }
  for (const o of Array.from(staleOffers.values()).slice(0, 10)) {
    facts.push(`Offerta ${o.ref}${o.customer ? ` (${o.customer})` : ""} inviata da ${o.days} giorni e ancora "Sent".`);
  }

  // 2. Overdue reminders / contact recalls: due in the past, still surfacing.
  const overdueDue: { kind: "promemoria" | "recall"; title: string; days: number; customer?: string | null; href?: string | null }[] = [];
  for (const e of events) {
    if (e.type !== "reminder" && e.type !== "contact_recall") continue;
    const dueMs = new Date(e.date).getTime();
    if (dueMs >= refMs) continue;
    const days = Math.floor((refMs - dueMs) / dayMs);
    if (days < 1) continue;
    overdueDue.push({
      kind: e.type === "reminder" ? "promemoria" : "recall",
      title: e.title,
      days,
      customer: e.customerName,
      href: e.href,
    });
  }
  overdueDue.sort((a, b) => b.days - a.days);
  for (const r of overdueDue.slice(0, 8)) {
    facts.push(`${r.kind === "promemoria" ? "Promemoria" : "Recall contatto"} scaduto da ${r.days} giorni: "${r.title}"${r.customer ? ` — ${r.customer}` : ""}.`);
  }

  // 3. Missed forecast: offer_close_forecast in the past while offer still
  //    not "Accepted"/"Rejected"/"Expired".
  const missedForecasts: { ref: string; days: number; customer?: string | null; status?: string | null }[] = [];
  for (const e of events) {
    if (e.type !== "offer_close_forecast") continue;
    const dueMs = new Date(e.date).getTime();
    if (dueMs >= refMs) continue;
    if (e.offerStatus === "Accepted" || e.offerStatus === "Rejected" || e.offerStatus === "Expired") continue;
    const days = Math.floor((refMs - dueMs) / dayMs);
    missedForecasts.push({
      ref: e.offerReference ?? `offer:${e.offerId ?? e.id}`,
      days,
      customer: e.customerName,
      status: e.offerStatus,
    });
  }
  missedForecasts.sort((a, b) => b.days - a.days);
  for (const m of missedForecasts.slice(0, 6)) {
    facts.push(`Chiusura prevista di ${m.ref}${m.customer ? ` (${m.customer})` : ""} mancata da ${m.days} giorni (stato: ${m.status ?? "n/d"}).`);
  }

  // 4. Late order milestones: planned in the past, order still active.
  const lateMilestones: { title: string; days: number; order?: string | null; customer?: string | null }[] = [];
  for (const e of events) {
    if (e.type !== "order_milestone") continue;
    if (e.orderStatus && e.orderStatus !== "active") continue;
    const dueMs = new Date(e.date).getTime();
    if (dueMs >= refMs) continue;
    const days = Math.floor((refMs - dueMs) / dayMs);
    if (days < 1) continue;
    lateMilestones.push({
      title: e.title,
      days,
      order: e.jobOrderReference,
      customer: e.customerName,
    });
  }
  lateMilestones.sort((a, b) => b.days - a.days);
  for (const m of lateMilestones.slice(0, 6)) {
    facts.push(`Milestone ordine in ritardo di ${m.days} giorni: "${m.title}"${m.order ? ` (ordine ${m.order})` : ""}${m.customer ? ` — ${m.customer}` : ""}.`);
  }

  return facts;
}

/**
 * Tiny in-memory LRU-ish cache for briefings. Keyed by a hash of the
 * normalized request inputs. Same inputs within TTL => no AI call. The
 * client can pass `forceRefresh: true` to bypass.
 */
const briefingCache = new Map<string, { result: BriefingResponse; expiresAt: number }>();
const BRIEFING_TTL_MS = 60 * 60 * 1000; // 1h
const BRIEFING_CACHE_MAX = 100;

function cacheGet(key: string): BriefingResponse | null {
  const entry = briefingCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    briefingCache.delete(key);
    return null;
  }
  // LRU touch.
  briefingCache.delete(key);
  briefingCache.set(key, entry);
  return entry.result;
}

function cacheSet(key: string, result: BriefingResponse): void {
  if (briefingCache.size >= BRIEFING_CACHE_MAX) {
    const firstKey = briefingCache.keys().next().value;
    if (firstKey) briefingCache.delete(firstKey);
  }
  briefingCache.set(key, { result, expiresAt: Date.now() + BRIEFING_TTL_MS });
}

router.post("/api/recap/ai/briefing", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const tStart = Date.now();
  const ai = getAiProvider();
  if (!ai.isAvailable()) {
    throw AppError.badRequest("Servizio AI non configurato");
  }

  // Server-authoritative: re-load events through the same scoped helper using
  // the filters provided in the body. This avoids trusting the client-supplied
  // event list and guarantees the AI input matches what the user is allowed
  // to see.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const proxyQuery: Record<string, string> = {};
  const copyIfString = (k: string) => {
    const v = body[k];
    if (typeof v === "string" && v.trim().length > 0) proxyQuery[k] = v;
  };
  copyIfString("from");
  copyIfString("to");
  copyIfString("types");
  copyIfString("customerId");
  copyIfString("contactId");
  copyIfString("area");
  copyIfString("offerStatus");
  copyIfString("orderStatus");

  const proxyReq = Object.create(req);
  Object.defineProperty(proxyReq, "query", {
    value: proxyQuery,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  const { events: loadedEvents } = await loadRecapEvents(proxyReq as typeof req);

  // Optional client-side text search (mirrors UI search input).
  const searchQuery = typeof body.search === "string" ? body.search.trim().toLowerCase() : "";
  const events: RecapEvent[] = searchQuery
    ? loadedEvents.filter(e => {
        const hay = [
          e.title, e.description, e.customerName, e.contactName,
          e.offerReference, e.jobOrderReference, e.area, e.subtype,
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(searchQuery);
      })
    : loadedEvents;

  const scopeKind = normalizeScopeKind(body.scopeKind);
  const referenceDate = typeof body.referenceDate === "string" ? new Date(body.referenceDate) : new Date();
  const forceRefresh = body.forceRefresh === true;

  // Cache key: hash of normalized inputs. Reference date is rounded to the
  // hour so closely-spaced regenerations hit cache. We include both companyId
  // (multi-tenant isolation) and a content fingerprint of the events so that
  // edits to titles/statuses in the middle of the list still invalidate.
  const cacheUserId = (req as any).user?.id ?? "anon";
  const cacheCompanyId = (req as any).companyId ?? "no-company";
  const refDateHour = new Date(referenceDate);
  refDateHour.setMinutes(0, 0, 0);
  const eventsFingerprint = createHash("sha1")
    .update(events.map(e => `${e.id}|${e.date}|${e.offerStatus ?? ""}|${e.orderStatus ?? ""}|${(e.title ?? "").length}`).join("\n"))
    .digest("hex");
  const cacheBasis = JSON.stringify({
    c: cacheCompanyId,
    u: cacheUserId,
    q: proxyQuery,
    s: searchQuery,
    sk: scopeKind,
    rd: refDateHour.toISOString(),
    n: events.length,
    fp: eventsFingerprint,
  });
  const cacheKey = createHash("sha1").update(cacheBasis).digest("hex");

  if (!forceRefresh) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true, durationMs: Date.now() - tStart });
    }
  }

  if (events.length === 0) {
    const empty: BriefingResponse = {
      generatedAt: new Date().toISOString(),
      scopeKind,
      yesterdaySummary: "Nessun evento nella finestra selezionata.",
      todayHighlights: [],
      upcomingActions: [],
      reminders: [],
      warnings: [],
      analyzedCount: 0,
      totalCount: 0,
      truncated: false,
      durationMs: Date.now() - tStart,
      cached: false,
      factsUsed: 0,
    };
    cacheSet(cacheKey, empty);
    return res.json(empty);
  }

  const todayStart = new Date(referenceDate); todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const next7End = new Date(todayStart); next7End.setDate(next7End.getDate() + 7);

  // Deterministic facts FIRST, on the FULL scoped list, so risk signals are
  // never lost by the prompt-size cap below.
  const facts = buildDeterministicFacts(events, referenceDate);

  // Cap events fed to the AI prompt. Cap scales with scope so a monthly
  // period doesn't drop most of its content silently.
  const MAX = capForScope(scopeKind);
  const totalCount = events.length;
  // Prefer keeping events closest to referenceDate when truncating.
  const eventsByRelevance = totalCount > MAX
    ? [...events].sort((a, b) => Math.abs(new Date(a.date).getTime() - referenceDate.getTime())
        - Math.abs(new Date(b.date).getTime() - referenceDate.getTime()))
    : events;
  const slice = eventsByRelevance.slice(0, MAX);
  const truncated = totalCount > MAX;
  const analyzedCount = slice.length;

  const isPeriodScope = scopeKind === "monthly" || scopeKind === "custom";

  // For day-centric scopes (daily/weekly) we keep the classic 3-bucket
  // breakdown around referenceDate. For period scopes we instead expose the
  // ENTIRE scoped slice as "PERIOD EVENTS", so the model actually sees the
  // whole month/range and not just the days near referenceDate.
  const yesterdayEvents = isPeriodScope ? [] : slice.filter(e => {
    const d = new Date(e.date);
    return d >= yesterdayStart && d < todayStart;
  });
  const todayEvents = isPeriodScope ? [] : slice.filter(e => {
    const d = new Date(e.date);
    return d >= todayStart && d < tomorrowStart;
  });
  const upcomingEvents = isPeriodScope ? [] : slice.filter(e => {
    const d = new Date(e.date);
    return d >= tomorrowStart && d <= next7End;
  });
  // Period payload, sorted chronologically for readability inside the prompt.
  const periodEvents = isPeriodScope
    ? [...slice].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : [];

  const refDateLabel = dfFormat(referenceDate, "EEEE d MMMM yyyy", { locale: it });

  const isPeriodView = scopeKind === "monthly" || scopeKind === "custom";
  const periodGuidance = isPeriodView
    ? `Stai analizzando un PERIODO (${scopeKind === "monthly" ? "mese" : "intervallo personalizzato"}), non solo la giornata di oggi. Concentrati su:
- Sintesi del periodo (cosa è successo di rilevante, trend, clienti più attivi).
- Azioni consigliate per chiudere offerte aperte, recuperare contatti freddi, gestire ordini in corso.
- Promemoria e segnali aperti che richiedono attenzione adesso.
Le sezioni "yesterdaySummary"/"todayHighlights"/"upcomingActions" devono essere reinterpretate come "sintesi del periodo / cose principali / azioni consigliate".`
    : `Stai analizzando i giorni intorno a ${refDateLabel}. Mantieni l'ottica giornaliera classica (ieri/oggi/prossimi 7 giorni).`;

  const systemPrompt = `Sei l'assistente commerciale di un venditore B2B di macchinari industriali.
Parli SEMPRE in italiano, in tono professionale ma diretto, conciso e operativo.
Riceverai una lista di eventi commerciali (interazioni, offerte, ordini, milestone, promemoria, attività di sistema), un blocco di FATTI già calcolati, e devi produrre un briefing JSON strutturato.
${periodGuidance}
Regole:
- Considera i FATTI come VERI: non ricalcolare i giorni di ritardo, non inventare offerte non presenti. Trasformali in voci di "warnings"/"reminders" con priorità adeguata.
- Identifica priorità (alta/media/bassa) in base a anzianità, urgenza, valore, ricorrenza.
- Suggerisci azioni concrete: chi richiamare, quale offerta sollecitare, quale ordine verificare. Riferisciti per nome cliente/offerta.
- Per ogni voce, se l'evento di origine ha un campo "href" usa quello come "link"; non inventare URL.
- Rispondi ESCLUSIVAMENTE con un oggetto JSON valido conforme allo schema fornito. Niente testo extra, niente markdown.`;

  const schemaHint = `Schema JSON di output:
{
  "yesterdaySummary": "Frase breve (max 2 righe) che riassume cosa è successo ieri (o, in vista periodo, sintesi del periodo).",
  "todayHighlights": [
    { "title": "Titolo breve", "detail": "Dettaglio operativo opzionale", "link": "url interno opzionale (deve iniziare con /)", "priority": "alta|media|bassa" }
  ],
  "upcomingActions": [
    { "title": "Azione consigliata", "detail": "...", "link": "...", "priority": "alta|media|bassa" }
  ],
  "reminders": [
    { "title": "Promemoria proattivo derivato dai dati o dai FATTI", "detail": "...", "link": "...", "priority": "alta|media|bassa" }
  ],
  "warnings": [
    { "title": "Segnale di rischio o anomalia (deriva dai FATTI quando possibile)", "detail": "...", "link": "...", "priority": "alta|media|bassa" }
  ]
}
Massimo 6 elementi per array. Se una sezione non ha contenuto, restituisci array vuoto.`;

  const factsBlock = facts.length
    ? `FATTI DETERMINISTICI GIÀ CALCOLATI (${facts.length}, considerali veri):\n${facts.map(f => `- ${f}`).join("\n")}`
    : `FATTI DETERMINISTICI GIÀ CALCOLATI: nessuno rilevante.`;

  const truncationNote = truncated
    ? `NOTA: ho selezionato ${analyzedCount} eventi sui ${totalCount} del periodo (più vicini alla data di riferimento). Considera che il quadro completo potrebbe contenere altri eventi simili.`
    : "";

  const eventsBlock = isPeriodScope
    ? `EVENTI DEL PERIODO (${periodEvents.length}, ordine cronologico):
${JSON.stringify(periodEvents.map(compactEventForAi))}`
    : `EVENTI DI IERI (${yesterdayEvents.length}):
${JSON.stringify(yesterdayEvents.map(compactEventForAi))}

EVENTI DI OGGI (${todayEvents.length}):
${JSON.stringify(todayEvents.map(compactEventForAi))}

PROSSIMI 7 GIORNI (${upcomingEvents.length}):
${JSON.stringify(upcomingEvents.map(compactEventForAi))}`;

  const userPrompt = `Data di riferimento: ${refDateLabel}
Tipo di analisi: ${scopeKind}
${truncationNote}

${factsBlock}

${eventsBlock}

${schemaHint}`;

  const result = await ai.complete({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: 1800,
    responseFormat: "json",
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(result.content);
  } catch {
    throw AppError.badRequest("Risposta AI non interpretabile");
  }

  const sanitizeArray = (arr: any): BriefingItem[] => {
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 6).map((it: any) => ({
      title: String(it?.title ?? "").slice(0, 240),
      detail: it?.detail ? String(it.detail).slice(0, 480) : undefined,
      link: sanitizeLink(it?.link),
      priority: it?.priority === "alta" || it?.priority === "media" || it?.priority === "bassa" ? it.priority : undefined,
    })).filter(it => it.title.length > 0);
  };

  const response: BriefingResponse = {
    generatedAt: new Date().toISOString(),
    scopeKind,
    yesterdaySummary: typeof parsed?.yesterdaySummary === "string" ? parsed.yesterdaySummary.slice(0, 600) : "",
    todayHighlights: sanitizeArray(parsed?.todayHighlights),
    upcomingActions: sanitizeArray(parsed?.upcomingActions),
    reminders: sanitizeArray(parsed?.reminders),
    warnings: sanitizeArray(parsed?.warnings),
    analyzedCount,
    totalCount,
    truncated,
    durationMs: Date.now() - tStart,
    cached: false,
    factsUsed: facts.length,
  };

  cacheSet(cacheKey, response);
  res.json(response);
}));

export default router;
