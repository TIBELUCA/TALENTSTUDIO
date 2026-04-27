# replit.md

## Overview

This project is **Talent Studio**, a talent-management system for influencer/creator agencies (single tenant: Giovanna's team). It is the result of repurposing a former industrial-machinery quoting tool (QuotePilot) into a talent-first vertical: roster of influencers, brand CRM, campaign quotes, and tracking/payments.

Core users:
- **Admin (Giovanna)** — full access, manages roster, brands, quotes, campaigns and finances.
- **Collaborators** — internal teammates who help operate the roster and CRM. They share the master/salesman roles in the user table; legacy granular roles (backoffice / amministrazione / tecnico / produzione / service / tecnico_commerciale) survive in the schema for historic data but are no longer surfaced in the UI.

Key capabilities:
- **Talent roster** with anagraphic data, social handles + manual stats (followers, engagement %), base rates per deliverable type, default commission %, internal notes.
- **CRM** for the brand customers (tables labelled "Brand" in the IT UI), contacts, interactions, calendar.
- **Quotes (Preventivi)** and **Campaigns** (currently rendered by the legacy `/offers` and `/orders` flows behind a "in ridisegno per Talent Management" banner — they will be re-shaped in the next task).
- **Email client + Recap + Drive archive** unchanged from the previous product.

Removed / no longer surfaced (kept on disk and in the DB schema for now to keep the migration small):
- Dealer portal (`/dealer/*`, dealer login, dealer CRM, dealer enquiries, share-hub).
- Machine catalog, custom machines, technical drawings, travel-pack, YouTube tile, family defaults, format/presets pages.
- Multilingua catalogo for machines.

The corresponding server routers (`dealersRouter`, `enquiriesRouter`, `shareHubRouter`, `drawingsRouter`, `customMachinesRouter`, `machinesRouter`, `presetsRouter`, `travelPackRouter`, `youtubeRouter`) are no longer mounted in `server/routes.ts` even though the route files still exist on disk. A follow-up cleanup task will physically remove the orphan files and drop the obsolete tables.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React 18, TypeScript, TanStack React Query, shadcn/ui, Tailwind CSS, Framer Motion.
- **Backend**: Node.js, Express, TypeScript, ESM modules.
- **Database**: PostgreSQL with Drizzle ORM.

### Architectural Patterns
- **API Design**: RESTful endpoints with Zod validation.
- **Backend Architecture**: Domain-based modules, centralized middleware for authentication, multi-tenancy, and error handling. Layers include Repository for data access, Service for business logic (document generation, file storage, external integrations), and a dedicated AI Service layer.
- **Multi-tenancy**: Achieved via `companyId` in all core database tables.
- **UI/UX Architecture**: Zero overlays policy, global back navigation, reusable selection mode for lists.

### Key Features and Design Decisions

#### Talent Management (new core domain)
- **Schema** (`shared/schema.ts`, also DDL in `server/schemaSync.ts`): `talents` (anagrafica + bio + commissione default + tags + multi-tenancy via companyId), `talent_socials` (platform ∈ instagram/tiktok/youtube/x, handle, profileUrl, followers, engagementPct, statsUpdatedAt), `talent_rates` (deliverableType ∈ post/reel/story/video/event, basePriceEur), `talent_documents` (filename/originalName/mimeType/kind/label).
- **Repository**: `server/repositories/talents.ts` — CRUD + `replaceSocials` / `replaceRates` (full-replace per save) + `addDocument` / `deleteDocument`.
- **Routes**: `server/routes/talents.ts` mounted as `talentsRouter` — `GET /api/talents`, `GET /api/talents/:id`, `POST /api/talents`, `PUT /api/talents/:id`, `DELETE /api/talents/:id`, all behind `requireSalesRole` and scoped by `req.companyId`.
- **UI**: `/talents` (grid roster with search + tag filter), `/talents/new` and `/talents/:id/edit` (react-hook-form + zodResolver + useFieldArray for socials and rates; avatar via URL), `/talents/:id` (header card + tabs Anagrafica & Tariffe / Storico Campagne / Performance / Documenti / Interazioni CRM — placeholders for the campaign-related tabs until Task #2).

#### Talent Quotes & Campaigns (Task #2 — parallel stack)
- **Goal**: replace the legacy industrial flow (offers → orders) with the talent-agency flow (preventivi → campagne) without touching the existing `offers`/`orders` tables. The two systems live side-by-side; only the new stack is reachable from the UI (legacy `/offers` and `/orders` paths redirect to `/quotes` and `/campaigns`).
- **Schema** (`shared/schema.ts` + `server/schemaSync.ts`, all scoped by `companyId`):
  - `talent_quotes` (code `Q-YY-NNNN`, customerId/contactId, talentId, validUntil, status ∈ `bozza|inviato|accettato|rifiutato`, totals, notes) + `talent_quote_items` (deliverableType, talentId, quantity, unit/total prices, commissionPct, snapshot fields).
  - `campaigns` (code `C-YY-NNNN`, customerId/contactId, name, period, status ∈ `pianificata|in_corso|in_revisione|completata|chiusa`, valueEur, generatedFromQuoteId) + `campaign_deliverables` (talentId, type, dueAt, status ∈ `da_produrre|in_revisione|approvato|pubblicato`, publishedUrl, position) + `deliverable_metrics` (per deliverable: views/likes/comments/shares/saves/reach/engagementPct/measuredAt) + `campaign_payments_in` (incoming from brand) + `campaign_payments_out` (outgoing to talent).
  - Shared label dictionaries: `TALENT_DELIVERABLE_LABELS` (post/reel/story/video/event), quote/campaign status enums.
- **Backend**:
  - Repositories: `server/repositories/talentQuotes.ts`, `server/repositories/campaigns.ts` (campaigns repo also exposes `getTalentAggregate(talentId, companyId)` which returns campaign history + perf KPIs for the talent profile).
  - Routes (all `requireSalesRole`, tenant-scoped via `req.companyId`):
    - `/api/quotes` — CRUD, `POST /:id/status`, `POST /:id/duplicate`, `GET /:id/pdf`, `POST /:id/create-campaign` (only when `status=accettato`; copies items into `campaign_deliverables`).
    - `/api/campaigns` — CRUD + nested `/:id/deliverables` (CRUD + reorder), `/:id/metrics` (per-deliverable upsert), `/:id/payments-in`, `/:id/payments-out` (gated by `payments_module_enabled`).
    - `/api/talents/:id/aggregates` — campaign history + aggregated performance.
    - `/api/talent-settings` — `GET` (any sales user) and `PUT` (master only) the company-scoped switch `payments_module_enabled` (stored in `settings` keyed `payments_module_enabled:${companyId}`; default `false`).
  - PDF: `server/talentQuotePdf.ts` (Puppeteer) renders the talent-quote PDF with brand header, talent block, deliverables table, totals, validity and notes.
  - Activity logging: every state change writes an `activity_logs` row with the new action names (`quote_sent`, `quote_accepted`, `campaign_created`, `deliverable_published`, `campaign_payment_in_recorded`, `campaign_payment_out_recorded`). The recap loader (`server/routes/recap.ts`) promotes them via `PROMOTED_ACTIVITY_ACTIONS` and exposes them as the `RecapEventType`s `quote_sent`, `quote_accepted`, `deliverable_published`, `campaign_payment_in`, `campaign_payment_out` (Italian titles "Preventivo inviato", "Preventivo accettato", "Deliverable pubblicato", "Pagamento in entrata", "Pagamento talent"). The `meta` payload carries `quoteId` / `campaignId` / `talentName` / `amountEur` so the timeline cards link back to the correct detail page and render the relevant value.
- **Frontend** (Italian UI; uses `Layout`/`PageHeader`, shadcn, `lucide-react`):
  - `/quotes` — list filtered by status tabs (Bozza / Inviato / Accettato / Rifiutato), with create / duplicate / status actions.
  - `/quotes/new` and `/quotes/:id/edit` — 4-step wizard (Brand & contatto → Talent & deliverable → Termini & validità → Riepilogo & PDF). Last step renders the live PDF in `<PdfViewer>`.
  - `/quotes/:id` — detail page with status actions, PDF preview, "Crea campagna" (when `accettato`), and "Componi email" (deep-links to `/email?compose=1&to=&subject=&body=&quoteId=`).
  - `/campaigns` — list grouped by year, each row showing brand, period, deliverable progress (`<Progress>`), status badge.
  - `/campaigns/:id` — header with key data + 4 tabs: **Deliverable** (table CRUD + reorder + status transitions + publish URL), **Metriche** (per-deliverable form for views/likes/comments/shares/saves/reach/engagementPct), **Pagamenti** (in/out tables, only visible when the toggle is ON), **Documenti** (placeholder linking to existing CRM Documents).
  - `/talent-settings` — master-only page exposing the `payments_module_enabled` switch.
- **Routing & redirects** (`client/src/App.tsx`): mounts `/quotes`, `/quotes/new`, `/quotes/:id`, `/quotes/:id/edit`, `/campaigns`, `/campaigns/:id`, `/talent-settings`. Legacy paths `/offers`, `/offers/new`, `/offers/:rest*` redirect to `/quotes`; `/orders` and `/orders/:rest*` redirect to `/campaigns`. Dashboard tiles point to the new routes; the "Sezione in ridisegno" banners on `Offers.tsx` / `Orders.tsx` were removed (the pages are no longer reachable but kept as dormant components for safety).
- **Talent profile integration** (`client/src/pages/TalentDetail.tsx`): tabs **Storico campagne** and **Performance** are wired to `/api/talents/:id/aggregates` (`<TalentCampaignsHistory>` + `<TalentPerformance>` components at the bottom of the file). Each campaign row links to `/campaigns/:id`.
- **Recap integration** (`server/routes/recap.ts`): `ALL_TYPES`, `PROMOTED_ACTIVITY_ACTIONS`, and the `QUOTE_ACTIONS` loop were extended to load and surface activity_logs rows for the new event types, with tenant guards via `talentQuotes.companyId` / `campaigns.companyId` and `companyUserIdSet` scoping.
- **Email integration** (`client/src/pages/EmailPage.tsx`): the page now reads `?compose=1&to=&subject=&body=` deep-link params and opens the compose dialog prefilled (used by the "Componi email" buttons on Quote and Campaign detail). Params are stripped from the URL after the dialog opens to avoid re-triggering on refresh.
- **End-to-end happy path**: crea brand → talent → preventivo (wizard 4 step + PDF) → invia → accetta → "Crea campagna" → aggiungi deliverable → registra metriche → (con toggle pagamenti ON) registra pagamenti in/out → torna alla scheda talent e visualizza Storico campagne + Performance aggregata.

#### Offer Management
- **Offer Workflow**: Unified component for creation/editing, pricing, machine configuration, AI assistance, and PDF previews.
- **Unified PDF Viewer**: All in-app PDF previews (order layouts, technical drawings, order/offer documents, email attachments, attachments linked to orders/offers/contacts/companies, Drive archive) use the shared `client/src/components/PdfViewer.tsx` component, which renders an iframe inside a resizable bordered container (the same pattern previously used for technical drawings). Accepts either `src` (URL) or `data` (ArrayBuffer/Uint8Array/Blob) — when `data` is provided a blob URL is created internally and revoked on unmount.
- **Document Generation**: Server-side PDF generation with dynamic content, configurable elements, and layout merging.
- **Document Customization**: Extensive controls for section reordering, visibility, and formatting with live preview.
- **Custom Machines**: Management of non-catalog machines with custom options and templates.

#### CRM Module
- **Comprehensive CRM**: Manages Companies, Contacts, Interactions, and Calendar.
- **Detailed Profiles**: Tabbed layouts for company and contact profiles.
- **Import/Export**: Excel import/export for companies and contacts.

#### Order Management (Commesse)
- **Internal Order System**: Links directly to accepted offers for generating internal order documents.
- **Detailed Order Structure**: Comprehensive fields for billing, shipping, payments, items, logistics, and technical data.
- **Order PDF Generation**: Generates full Ordine Interno PDFs via Puppeteer, allowing section toggling and merging attached PDFs.
- **Manual Order Creation**: Supports orders not linked to an offer, with AI Vision PDF extraction for automated data entry.
- **Soft-Deletion and Versioning**: Implements soft-delete and comprehensive versioning for all order modifications.
- **Production Progress**: Per-machine progress bars with role-based controls and notification system.
- **In-App Notifications**: Database-backed notification system for production updates and other events.

#### Drawings Module
- **Technical Drawing Library**: CRUD for technical drawings with PDF and DWG attachments.
- **Drawing Requests**: Salesmen can request drawings from `tecnico_commerciale` users.
- **In-Offer Drawing Integration**: Integration within the offer wizard to select and request drawings.
- **Per-Commessa Versioning**: When an email attachment is moved to Drawings/Layout from a job order context (`server/routes/emailAttachmentLinks.ts`, target `drawing`), the new drawing becomes the official "head" for that commessa and the previous head is linked via `drawings.replacesDrawingId`. The previous version remains visible in the main Drawings list with a "Versione precedente · sostituito da #N" badge and a dashed/muted style. Concurrency is enforced inside a single transaction via `SELECT … FOR UPDATE` on the parent `job_orders` row plus the candidate `drawings` rows scoped by `jobOrderId` + `companyId`. The move endpoint also recognises the file type via magic-byte sniffing (`%PDF-` / `AC1xxx`) when the attachment lacks a usable filename or mime, fixing 400 rejections of valid PDFs sent as `application/octet-stream` named "attachment".
- **Machine Extraction from PDF**: AI-powered text-based PDF extraction to identify machine names with fuzzy matching and verification.
- **Machine History/Statistics**: Aggregated statistics on machine popularity and usage.

#### User and Access Management
- **Authentication**: Email + password against a single bootstrap admin master account (currently `gtmpilot7@gmail.com` / `Pass1`, seeded by `server/ensureMaster.ts`). Google OAuth is implemented (`server/routes/googleAuth.ts`, `/api/auth/google`) and remains available on the backend, but the Google button on the login screen is hidden while OAuth is being finalised. The optional `GOOGLE_ALLOWED_DOMAIN` env var can be set to restrict OAuth to a single Workspace domain when re-enabled.

#### Repository & Secret Management
- **Origin**: `https://github.com/TIBELUCA/TALENTSTUDIO.git` (single canonical repository on Giovanna's GitHub account; old `TIBELUCA/Gmgmt` aka `prevenda/QuotePilot` is deprecated and not used as remote).
- **Secret hygiene**: Third-party API credentials (Google OAuth, OpenAI, Microsoft OAuth) must live exclusively in **Replit Secrets** (vault) and be consumed via `process.env.*` — never in `.replit`, source files, or `attached_assets/`. The `.replit` file's `[userenv.*]` blocks contain only feature toggles (`AI_PROVIDER`, `AI_MODEL`, `COOKIE_SECURE`) and one transitional default placeholder (`EMAIL_TOKEN_ENCRYPTION_KEY = "quotepilot-default-key-change-me!!"`) that should be moved to Secrets in a follow-up — changing it now would invalidate the AES-encrypted Gmail/Outlook OAuth tokens already persisted in `email_connections` and `google_drive_settings`.
- **Required Secrets** for full functionality:
  - `GOOGLE_CLIENT_ID` — Google OAuth Client ID (used by Google login, Drive archive, Gmail integration)
  - `GOOGLE_CLIENT_SECRET` — Google OAuth Client Secret
  - `GOOGLE_CALLBACK_URL` — `https://<repl-domain>/api/auth/google/callback`
  - `OPENAI_API_KEY` — OpenAI API key for the AI assistant
- **Gitignore**: `attached_assets/` (chat-paste artefacts, can contain leaked snippets) and `.git.backup-*` (local git history backups) are excluded from commits.

#### Authorization & Roles
- **Effective Roles**: Admin (master) + Collaborator (salesman). The eight historical USER_ROLES enum values still exist in the schema for backwards compatibility with legacy users/data but are no longer used to scope UI routes.
- **Auth Middleware**: `requireRole` / `requireSalesRole` for backend protection.
- **Activity Logging**: Tracks user actions.

#### Internationalization (i18n)
- **App UI Language**: Italian (default) and English.
- **Translation System**: `client/src/lib/i18n/translations.ts` with namespaced keys.
- **Machine/Option Content Language**: 6 languages (it/en/de/fr/es/pt) for machine names/descriptions.

#### Email Integration & Gmail Client
- **Per-User OAuth**: Each user connects their own Gmail and/or Outlook account.
- **Full Email Client**: Dedicated page with 3-column layout for folders, message list, and detail.
- **Compose/Reply/Forward**: Dialog-based compose with threading support.
- **Draft Management**: Create, update, delete Gmail drafts with auto-save.
- **AI Email Assistant**: Features for summarizing, extracting to-dos, suggesting replies, improving text, and generating inbox recaps.
- **XSS Protection**: HTML content sanitized with DOMPurify.
- **Send Email from Offers**: Compose with auto-prefilled recipient, subject, body, and PDF attachment.
- **CRM Logging**: Sent emails automatically create CRM interactions.

#### Offline Capabilities (Travel Pack)
- **Offline Access**: Bundles essential data for offline use.
- **IndexedDB Storage**: Stores offline data in the browser.
- **Auto-Sync**: Automatically downloads and refreshes data when online.
- **Offline Drafts**: Allows creating offers offline and syncing later.

#### Maintenance Endpoints
- **Detail-image placeholder migration** (`POST /api/machines/migrate-detail-image-placeholders`, master-only): re-applies the `[[IMG{n}]]` → `[[IMG:filename]]` substitution on every existing machine and machine option in the current company, scanning the `description` field to recover the detail-image filename list and patching all language entries in `descriptions`. Idempotent. Run once after upgrading to fix the regression that left raw `[[IMG1]]`, `[[IMG2]]`, ... placeholders in multilingual descriptions.
- **Offer snapshot placeholder migration** (`POST /api/offers/migrate-image-placeholders`, master-only): rewrites `[[IMGn]]` → `[[IMG:filename]]` inside `snapshotMachineDescription` and per-language `snapshotDescriptions` of every offer item in the caller's company. Looks up each item's source machine `detailImages` (the `photos` column from index 1 onwards). Idempotent; safe to re-run.

#### Offer-language localization (Task #81)
- **Goal**: render the on-screen offer view (`OfferView.tsx`), the print/preview page (`OfferPrint.tsx`), and the server PDF (`server/pdf.ts`) in the offer's chosen language (`offers.language` ∈ `it/en/de/fr/es/pt`) instead of the active app UI language.
- **Shared helpers**: `shared/i18n/offerLabels.ts` exposes `tOffer(key, lang)` plus `normalizeOfferLang`. Used by all three renderers as the fallback when the document-format `sec.labels` map does not provide an explicit override.
- **Image placeholders**: `shared/lib/imagePlaceholders.ts` exports `expandNumericImagePlaceholders` (numeric `[[IMGn]]` → `[[IMG:filename]]` resolution against the source machine's `detailImages`) and `stripAllImagePlaceholders` (used by `server/lib/offerDiff.ts` so placeholder-only diffs don't trigger a "Modified" badge or appear as raw text in the change-summary).
- **PDF pipeline**: `server/services/documents.ts:generateOfferPdf` now calls `expandSnapshotPlaceholders(offer)` before localization, fetching each machine's `detailImages` and rewriting numeric placeholders so the PDF renders the same images as the on-screen view even for legacy snapshots.

#### Google Drive Archive (Task #53)
- **Purpose**: Auto-archive offer PDFs, linked drawings (PDF + DWG), and drawing-request attachments to Google Drive in `Root/{year}/{offerCode - customer}/v{version}/`.
- **Schema**: `google_drive_settings` (per-company OAuth tokens + root folder) and `drive_archive_items` (per-file queue with status, hash, retries).
- **Service**: `server/services/googleDrive.ts` — OAuth client, AES-256-CBC token encryption (reuses `EMAIL_TOKEN_ENCRYPTION_KEY`), folder find-or-create, sha256 dedup, in-process queue with exponential backoff (max 5 attempts, capped at 1 hour) and a 2-minute periodic sweep.
- **Routes**: `server/routes/googleDrive.ts` — master-only admin (`PUT /api/drive/settings/folder`, `DELETE /api/drive/settings`, OAuth `/api/drive/oauth/start|callback` with scope `drive.file`, `POST /api/drive/test`, queue listing/retry `/api/drive/items*`, `POST /api/drive/backfill`). Browse/read endpoints accessible to any internal user via `requireSalesmanOrMaster`: `GET /api/drive/settings`, `/shared-drives`, `/folders`, `/files`, `/search`, `/files/:id/content`. Read-only `GET /api/drive/status` and `GET /api/drive/items/by-offer/:id` for any authenticated user (used by offer view badge).
- **Triggers**: offer create/update/version (`server/routes/offers.ts`), drawing upload and drawing-request creation/link (`server/routes/drawings.ts`) all fire-and-forget call into `queueOffer / queueDrawing / queueDrawingRequest`.
- **UI**: master-only Settings card → `/drive-archive` page (`client/src/pages/DriveArchive.tsx`) for connect/folder/test/queue/retry/backfill. Offer detail (`OfferView.tsx`) shows a `DriveBadge` linking to the Drive folder with last-sync tooltip.

#### Recap (Timeline) — Interattività & AI Briefing
- **Toolbar**: ricerca client-side full-text (input-search), selettore "Raggruppa per" (none/customer/offer), filtri e tipi collassabili (button-toggle-filters / button-toggle-types), export PDF/Excel.
- **Hover preview**: ogni evento mostra una HoverCard portale con titolo, tipo, data formattata, descrizione, cliente/contatto/offerta/ordine/area e link "Apri scheda".
- **Animazione**: stagger fade/slide-in sugli eventi all'interno di ogni colonna.
- **AI Briefing card** (in cima a /recap): card collassabile con bottone "Genera/Rigenera" (button-generate-briefing). Sezioni: ieri (briefing-yesterday), oggi (briefing-today), prossime azioni (briefing-upcoming), promemoria (briefing-reminders), segnali di attenzione (briefing-warnings). Priorità alta/media/bassa colorate.
- **Endpoint**: `POST /api/recap/ai/briefing` (server/routes/recapAi.ts) — server-authoritative: riceve solo i parametri di filtro/visible-window e ricarica gli eventi via `loadRecapEvents` (esportato da server/routes/recap.ts) prima di inviarli al provider AI. Usa `getAiProvider()` (OpenAI gpt-4o-mini) con `responseFormat: "json"` e schema sanitizzato.
- **RecapEventType (Task #109)**: oltre ai tipi storici (interaction, offer_created, offer_close_forecast, order_created, order_milestone, reminder, contact_recall, activity), il recap traccia 9 nuovi tipi:
  - **Famiglia ordine** (indigo/blue/sky): `order_approved` (jobOrders.confirmedAt + confirmationStatus + currentVersion → /orders/:id), `order_versioned` (jobOrderVersions vN>0, titolo "v{vN+1}" → /orders/:id), `order_email_link` (emailAttachmentLinks entityType='order', uno per allegato/messaggio, scoping companyId su entrambe le tabelle), `order_layout_added`/`order_layout_changed` (interactions promosse, distinte in base al precedente layoutPdfFilename), `order_document_added` (interactions promosse).
  - **Famiglia offerta** (violet/fuchsia): `offer_status_changed` (activityLogs.action='offer_status_changed', promossa via PROMOTED_ACTIVITY_ACTIONS), `offer_drawing_added` (drawings.offerId NOT NULL), `offer_drawing_ready` (drawingRequests fulfilled, fallback href `/drawings` quando l'offerta non è linkabile).
  - Le interactions promosse (layout/document) sono inserite in `server/routes/orders.ts` con `companyId: req.companyId` e `linkedJobOrderId`, all'interno della stessa transazione dell'update dell'ordine; sono escluse dal generic interaction loader via `PROMOTED_INTERACTION_TYPES` per evitare doppioni.
  - Stili coerenti tra `client/src/pages/Recap.tsx`, `client/src/components/recap/WeekAgenda.tsx` (TYPE_STYLE + eventIcon) e l'export PDF (`TYPE_COLORS` in `server/routes/recap.ts`). Eventi cliccabili e raggruppabili (strong:true) tramite same-order/same-offer.

#### Deployment
- **Multi-Method**: Supports Dockerfile, Nixpacks, Docker Compose, Heroku, and bare metal.
- **Health Check**: `GET /api/health` endpoint.
- **Schema Sync**: Automatic at startup via drizzle-orm migrator.
- **GCP Production Deployment**: Infrastructure scripts for Compute Engine VM + Cloud SQL PostgreSQL deployment on Google Cloud Platform.

## External Dependencies

- **Database**: PostgreSQL
- **Authentication**: `bcryptjs`, `express-session`, `connect-pg-simple`, Google OAuth 2.0, Microsoft OAuth.
- **Document Generation**: `docx` package, Puppeteer.
- **AI Services**: OpenAI GPT-4o Vision API.
- **File Conversion**: `pdftoppm`.
- **Open Banking**: TrueLayer Data API.
- **Google Fonts**