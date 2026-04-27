import { pgTable, text, serial, integer, boolean, timestamp, jsonb, decimal } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Import auth models to ensure they are included in the schema
export * from "./models/auth";

// Companies (multi-company foundation)
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  email: text("email"),
  website: text("website"),
  address: text("address"),
  phone: text("phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true });
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

// Customers (Companies)
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  name: text("name").notNull(),
  customerCode: text("customer_code"),
  accountStatus: text("account_status"),
  structure: text("structure"),
  relatedAccount: text("related_account"),
  language: text("language"),
  type: text("type"),
  description: text("description"),
  email: text("email"),
  contactPerson: text("contact_person"),
  address: text("address"),
  postalCode: text("postal_code"),
  city: text("city"),
  country: text("country"),
  region: text("region"),
  province: text("province"),
  officePhone: text("office_phone"),
  fax: text("fax"),
  pec: text("pec"),
  webSite: text("web_site"),
  fiscalCode: text("fiscal_code"),
  vatNumber: text("vat_number"),
  publicAdminCode: text("public_admin_code"),
  insolved: text("insolved"),
  company: text("company"),
  dealerId: integer("dealer_id"),
  salesmanId: integer("salesman_id"),
  customerCategory: text("customer_category").array(),
  materialType: text("material_type").array(),
  industry: text("industry").array(),
  size: text("size"),
  sales: text("sales"),
  abcAnalysis: text("abc_analysis"),
  groupAbcAnalysis: text("group_abc_analysis"),
  machineFamily: text("machine_family"),
  notes: text("notes"),
  conversionDate: text("conversion_date"),
  directoryId: text("directory_id"),
  mergedIntoId: integer("merged_into_id"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: text("created_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: text("updated_by"),
});

// Production Facilities
export const productionFacilities = pgTable("production_facilities", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  postalCode: text("postal_code"),
  city: text("city"),
  country: text("country"),
  region: text("region"),
  province: text("province"),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: text("created_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: text("updated_by"),
});

// Contacts
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  contactRole: text("contact_role").array(),
  contactStatus: text("contact_status"),
  email: text("email"),
  mobile: text("mobile"),
  fax: text("fax"),
  officePhone: text("office_phone"),
  dateOfBirth: text("date_of_birth"),
  language: text("language"),
  newsletterBlock: text("newsletter_block"),
  description: text("description"),
  commercial: text("commercial"),
  expiringDateSales: text("expiring_date_sales"),
  newsletter: text("newsletter"),
  unsubscribeDate: text("unsubscribe_date"),
  profiling: text("profiling"),
  expiringDateProfiling: text("expiring_date_profiling"),
  privacyAcknowledged: text("privacy_acknowledged"),
  anonymized: text("anonymized"),
  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code"),
  country: text("country"),
  region: text("region"),
  district: text("district"),
  company: text("company"),
  salesmanId: integer("salesman_id"),
  sourceOfContact: text("source_of_contact"),
  exhibitionYear: text("exhibition_year"),
  exhibitionName: text("exhibition_name"),
  areaOfInterest: text("area_of_interest"),
  areaOfInterestDescription: text("area_of_interest_description"),
  lastCall: text("last_call"),
  nextRecall: text("next_recall"),
  tipo: text("tipo"),
  nMarketing: text("n_marketing"),
  conversionDate: text("conversion_date"),
  isExternalRecord: text("is_external_record"),
  phone: text("phone"),
  role: text("role"),
  notes: text("notes"),
  externalId: text("external_id"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: text("created_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: text("updated_by"),
});

// Machines
export const machines = pgTable("machines", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  seqNum: integer("seq_num"),
  machineCode: text("machine_code"),
  macroType: text("macro_type"),
  name: text("name").notNull(),
  description: text("description").notNull(),
  titles: jsonb("titles").$type<Record<string, string>>(),
  descriptions: jsonb("descriptions").$type<Record<string, string>>(),
  imageUrl: text("image_url"),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  electricalPower: decimal("electrical_power", { precision: 10, scale: 2 }),
  compressedAir: decimal("compressed_air", { precision: 10, scale: 2 }),
  exhaustedAir: decimal("exhausted_air", { precision: 10, scale: 2 }),
  airIntroduced: decimal("air_introduced", { precision: 10, scale: 2 }),
  installationDays: decimal("installation_days", { precision: 8, scale: 2 }),
  youtubeLinks: jsonb("youtube_links").$type<string[]>(),
  catalogLinks: jsonb("catalog_links").$type<{ label: string; url: string }[]>(),
  driveLinks: jsonb("drive_links").$type<{ label: string; url: string }[]>(),
  source: text("source").default("excel"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Machine Options (Configurable parts of a machine)
export const machineOptions = pgTable("machine_options", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  machineId: integer("machine_id").notNull(),
  seqNum: integer("seq_num"),
  name: text("name").notNull(),
  description: text("description"),
  titles: jsonb("titles").$type<Record<string, string>>(),
  descriptions: jsonb("descriptions").$type<Record<string, string>>(),
  priceModifier: decimal("price_modifier", { precision: 10, scale: 2 }).notNull(),
  electricalPower: decimal("electrical_power", { precision: 10, scale: 2 }),
  compressedAir: decimal("compressed_air", { precision: 10, scale: 2 }),
  exhaustedAir: decimal("exhausted_air", { precision: 10, scale: 2 }),
  airIntroduced: decimal("air_introduced", { precision: 10, scale: 2 }),
});

// Custom Machines (user-created, reusable across offers)
export const customMachines = pgTable("custom_machines", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull().default("0"),
  imageUrl: text("image_url"),
  detailImages: jsonb("detail_images").$type<string[]>(),
  titles: jsonb("titles").$type<Record<string, string>>(),
  descriptions: jsonb("descriptions").$type<Record<string, string>>(),
  createdBy: integer("created_by"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCustomMachineSchema = createInsertSchema(customMachines).omit({ id: true, createdAt: true, updatedAt: true });
export type CustomMachine = typeof customMachines.$inferSelect;
export type InsertCustomMachine = z.infer<typeof insertCustomMachineSchema>;

export const customMachineOptions = pgTable("custom_machine_options", {
  id: serial("id").primaryKey(),
  customMachineId: integer("custom_machine_id").notNull(),
  name: text("name").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull().default("0"),
  quantity: integer("quantity").notNull().default(1),
});

export const insertCustomMachineOptionSchema = createInsertSchema(customMachineOptions).omit({ id: true });
export type CustomMachineOptionRow = typeof customMachineOptions.$inferSelect;
export type InsertCustomMachineOption = z.infer<typeof insertCustomMachineOptionSchema>;

// Presets (Terms & Conditions items)
export const presets = pgTable("presets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  type: text("type").notNull().default("general"),
  title: text("title").notNull().default(""),
  content: text("content").notNull(),
  translations: jsonb("translations").$type<Record<string, { title: string; content: string }>>(),
});

export const dealerPresets = pgTable("dealer_presets", {
  id: serial("id").primaryKey(),
  dealerCompanyId: integer("dealer_company_id").notNull(),
  type: text("type").notNull().default("general"),
  title: text("title").notNull().default(""),
  content: text("content").notNull(),
  translations: jsonb("translations").$type<Record<string, { title: string; content: string }>>(),
});

export type DealerPreset = typeof dealerPresets.$inferSelect;
export type InsertDealerPreset = typeof dealerPresets.$inferInsert;

// Dealer Companies (the company entity — primary dealer record)
export const dealerCompanies = pgTable("dealer_companies", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  companyName: text("company_name").notNull(),
  address: text("address").notNull().default(""),
  vatNumber: text("vat_number").notNull().default(""),
  state: text("state").notNull().default(""),
  city: text("city").default(""),
  postalCode: text("postal_code").default(""),
  email: text("email").default(""),
  phone: text("phone").default(""),
  notes: text("notes").default(""),
  linkedSalesmanId: integer("linked_salesman_id"),
  isActive: boolean("is_active").notNull().default(true),
  docLogoUrl: text("doc_logo_url"),
  docFooterLines: jsonb("doc_footer_lines"),
  docTermsText: text("doc_terms_text"),
  assignedCountries: jsonb("assigned_countries").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Dealer Users / Contacts (sales persons under a dealer company; use email+password auth)
export const dealerUsers = pgTable("dealer_users", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  dealerCompanyId: integer("dealer_company_id"),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  surname: text("surname").notNull().default(""),
  mobileNumber: text("mobile_number").default(""),
  role: text("role").default(""),
  isActive: boolean("is_active").notNull().default(true),
  linkedSalesmanId: integer("linked_salesman_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Dealer Login Records
export const dealerLoginRecords = pgTable("dealer_login_records", {
  id: serial("id").primaryKey(),
  dealerId: integer("dealer_id").notNull(),
  loggedInAt: timestamp("logged_in_at").defaultNow().notNull(),
});

// Catalog Imports
export const catalogImports = pgTable("catalog_imports", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  filename: text("filename").notNull(),
  fileHash: text("file_hash").notNull(),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  machineCount: integer("machine_count").notNull().default(0),
  optionCount: integer("option_count").notNull().default(0),
});

// Offers
export const offers = pgTable("offers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  referenceNumber: text("reference_number").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  date: timestamp("date").defaultNow().notNull(),
  subject: text("subject").notNull(),
  salesmanName: text("salesman_name").notNull(),
  salesmanEmail: text("salesman_email"),
  salesmanMobile: text("salesman_mobile"),
  salesmanUserId: integer("salesman_user_id"),
  projectData: jsonb("project_data"),
  status: text("status").notNull().default("Draft"),
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }).notNull(),
  version: integer("version").notNull().default(1),
  parentOfferId: integer("parent_offer_id"),
  deletedAt: timestamp("deleted_at"),
  offerType: text("offer_type").notNull().default("offer"),
  dealerId: integer("dealer_id"),
  salesScenario: text("sales_scenario"),
  sourceEnquiryId: integer("source_enquiry_id"),
  sourceOfferId: integer("source_offer_id"),
  sharedByUserId: integer("shared_by_user_id"),
  claimedByUserId: integer("claimed_by_user_id"),
  claimedAt: timestamp("claimed_at"),
  forwardedByUserId: integer("forwarded_by_user_id"),
  originDealerId: integer("origin_dealer_id"),
  originEnquiryId: integer("origin_enquiry_id"),
  language: text("language").notNull().default("it"),
  catalogVersionId: integer("catalog_version_id"),
  crmInfo: jsonb("crm_info").$type<OfferCrmInfo | null>(),
});

export type OfferCrmCompetitor = {
  name: string;
  notes?: string;
};

export type OfferCrmInfo = {
  expectedCloseDate?: string | null;
  winProbability?: number | null;
  budget?: number | null;
  decisionMaker?: string | null;
  competitors?: OfferCrmCompetitor[];
  nextSteps?: string | null;
  notes?: string | null;
  updatedAt?: string | null;
  updatedByUserId?: number | null;
};

export const offerCrmCompetitorSchema = z.object({
  name: z.string().min(1, "Nome competitor richiesto").max(120),
  notes: z.string().max(500).optional(),
});

export const offerCrmInfoSchema = z.object({
  expectedCloseDate: z.string().nullish(),
  winProbability: z.number().int().min(0).max(100).nullish(),
  budget: z.number().nonnegative().nullish(),
  decisionMaker: z.string().max(200).nullish(),
  competitors: z.array(offerCrmCompetitorSchema).max(20).optional(),
  nextSteps: z.string().max(2000).nullish(),
  notes: z.string().max(4000).nullish(),
});

export type OfferCrmInfoInput = z.infer<typeof offerCrmInfoSchema>;

// Offer Items (Lines in an offer)
export const offerItems = pgTable("offer_items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  offerId: integer("offer_id").notNull(),
  machineId: integer("machine_id").notNull(),
  position: integer("position").notNull().default(1),
  quantity: integer("quantity").notNull().default(1),
  // Snapshots — name, description, price, image
  snapshotMachineName: text("snapshot_machine_name").notNull(),
  snapshotMachineDescription: text("snapshot_machine_description"),
  snapshotTitles: jsonb("snapshot_titles").$type<Record<string, string>>(),
  snapshotDescriptions: jsonb("snapshot_descriptions").$type<Record<string, string>>(),
  snapshotBasePrice: decimal("snapshot_base_price", { precision: 10, scale: 2 }).notNull(),
  snapshotMacroType: text("snapshot_macro_type"),
  snapshotImageUrl: text("snapshot_image_url"),
  // Utility snapshots
  snapshotElectricalPower: decimal("snapshot_electrical_power", { precision: 10, scale: 2 }),
  snapshotCompressedAir: decimal("snapshot_compressed_air", { precision: 10, scale: 2 }),
  snapshotExhaustedAir: decimal("snapshot_exhausted_air", { precision: 10, scale: 2 }),
  snapshotAirIntroduced: decimal("snapshot_air_introduced", { precision: 10, scale: 2 }),
  snapshotInstallationDays: decimal("snapshot_installation_days", { precision: 8, scale: 2 }),
});

// Selected Options for an Offer Item
export const offerItemOptions = pgTable("offer_item_options", {
  id: serial("id").primaryKey(),
  offerItemId: integer("offer_item_id").notNull(),
  machineOptionId: integer("machine_option_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  snapshotOptionName: text("snapshot_option_name").notNull(),
  snapshotOptionTitles: jsonb("snapshot_option_titles").$type<Record<string, string>>(),
  snapshotOptionDescriptions: jsonb("snapshot_option_descriptions").$type<Record<string, string>>(),
  snapshotPriceModifier: decimal("snapshot_price_modifier", { precision: 10, scale: 2 }).notNull(),
  snapshotElectricalPower: decimal("snapshot_electrical_power", { precision: 10, scale: 2 }),
  snapshotCompressedAir: decimal("snapshot_compressed_air", { precision: 10, scale: 2 }),
  snapshotExhaustedAir: decimal("snapshot_exhausted_air", { precision: 10, scale: 2 }),
  snapshotAirIntroduced: decimal("snapshot_air_introduced", { precision: 10, scale: 2 }),
});

// App-wide settings (key-value store)
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  companyId: integer("company_id"),
  value: jsonb("value"),
});

// Offer Sequence Counter (monotonically incrementing - never resets on deletion)
export const offerSequence = pgTable("offer_sequence", {
  id: serial("id").primaryKey(),
  lastSequence: integer("last_sequence").notNull().default(0),
  year: integer("year").notNull().unique(),
});

// Enquiry Sequence Counter (independent numbering from offers)
export const enquirySequence = pgTable("enquiry_sequence", {
  id: serial("id").primaryKey(),
  lastSequence: integer("last_sequence").notNull().default(0),
  year: integer("year").notNull().unique(),
});

// Salesman Users (created by master; use email+password auth)
export const USER_ROLES = ["head_of_talent", "talent_manager", "talent"] as const;
export type UserRole = typeof USER_ROLES[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  head_of_talent: "Head of Talent",
  talent_manager: "Talent Manager",
  talent: "Talent",
};

export const salesmanUsers = pgTable("salesman_users", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  surname: text("surname").notNull().default(""),
  mobileNumber: text("mobile_number").default(""),
  isActive: boolean("is_active").notNull().default(true),
  isMasterSalesman: boolean("is_master_salesman").notNull().default(false),
  role: text("role").notNull().default("talent"),
  parentSalesmanId: integer("parent_salesman_id"),
  parentSalesmanIds: integer("parent_salesman_ids").array(),
  features: jsonb("features").notNull().default({
    canCreateOffers: true,
    canEditOffers: true,
    canDeleteOffers: false,
    canManageCustomers: true,
    canViewMachines: true,
    canViewPresets: true,
    canUseFormat: false,
    canManageSpecialMachines: false,
  }),
  assignedCountries: jsonb("assigned_countries").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Salesman Login Records (one row per login)
export const salesmanLoginRecords = pgTable("salesman_login_records", {
  id: serial("id").primaryKey(),
  salesmanUserId: integer("salesman_user_id").notNull(),
  loginAt: timestamp("login_at").defaultNow().notNull(),
  deviceInfo: text("device_info"),
  ipAddress: text("ip_address"),
});

// Enquiry Attachments (files uploaded with a dealer enquiry)
export const enquiryAttachments = pgTable("enquiry_attachments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  enquiryId: integer("enquiry_id").notNull(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimetype: text("mimetype").notNull(),
  size: integer("size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// AI Runs (tracking AI workflow executions)
export const aiRuns = pgTable("ai_runs", {
  id: text("id").primaryKey(),
  workflow: text("workflow").notNull(),
  status: text("status").notNull().default("pending"),
  input: jsonb("input").notNull().default({}),
  output: jsonb("output"),
  error: text("error"),
  model: text("model").notNull(),
  provider: text("provider"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  durationMs: integer("duration_ms"),
  triggeredBy: text("triggered_by").notNull(),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  offerId: integer("offer_id"),
  enquiryId: integer("enquiry_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Offer Embeddings (vector search for similar offers)
export const offerEmbeddings = pgTable("offer_embeddings", {
  id: serial("id").primaryKey(),
  offerId: integer("offer_id").notNull(),
  embedding: jsonb("embedding").notNull(),
  machineReference: text("machine_reference").notNull(),
  optionsSummary: text("options_summary").notNull(),
  textualSummary: text("textual_summary").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type OfferEmbedding = typeof offerEmbeddings.$inferSelect;
export type InsertOfferEmbedding = typeof offerEmbeddings.$inferInsert;

// AI Feedback (user feedback on AI outputs)
export const aiFeedback = pgTable("ai_feedback", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => aiRuns.id, { onDelete: "cascade" }),
  rating: text("rating").notNull(),
  feedbackType: text("feedback_type").notNull().default("overall"),
  fieldKey: text("field_key"),
  originalValue: text("original_value"),
  modifiedValue: text("modified_value"),
  score: integer("score"),
  comment: text("comment"),
  submittedBy: text("submitted_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Activity Logs (offer created/edited/versioned/exported)
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  salesmanUserId: integer("salesman_user_id"),
  dealerUserId: integer("dealer_user_id"),
  performedBy: text("performed_by").notNull(),
  action: text("action").notNull(),
  offerId: integer("offer_id"),
  offerReference: text("offer_reference"),
  // Per-event payload captured at write time. Used by the recap loader
  // for `offer_status_changed` (stores { fromStatus, toStatus }) so the
  // event renders the actual transition rather than the offer's current
  // status. Optional/nullable for backward compatibility.
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Salesman types
export type SalesmanUser = typeof salesmanUsers.$inferSelect;
export type InsertSalesmanUser = Omit<typeof salesmanUsers.$inferSelect, 'id' | 'createdAt' | 'passwordHash'> & { password: string };
export type SalesmanLoginRecord = typeof salesmanLoginRecords.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;

// Dealer types
export type DealerCompany = typeof dealerCompanies.$inferSelect;
export const insertDealerCompanySchema = createInsertSchema(dealerCompanies).omit({ id: true, createdAt: true });
export type InsertDealerCompany = z.infer<typeof insertDealerCompanySchema>;

export type DealerUser = typeof dealerUsers.$inferSelect;
export type InsertDealerUser = Omit<typeof dealerUsers.$inferSelect, 'id' | 'createdAt' | 'passwordHash'> & { password: string };
export type DealerLoginRecord = typeof dealerLoginRecords.$inferSelect;
export const insertDealerUserSchema = createInsertSchema(dealerUsers).omit({ id: true, createdAt: true, passwordHash: true });

// Enquiry attachment types
export type EnquiryAttachment = typeof enquiryAttachments.$inferSelect;
export type InsertEnquiryAttachment = typeof enquiryAttachments.$inferInsert;
export const insertEnquiryAttachmentSchema = createInsertSchema(enquiryAttachments).omit({ id: true, uploadedAt: true });

// AI types
export type AiRunRecord = typeof aiRuns.$inferSelect;
export type InsertAiRun = typeof aiRuns.$inferInsert;
export type AiFeedbackRecord = typeof aiFeedback.$inferSelect;
export type InsertAiFeedback = typeof aiFeedback.$inferInsert;
export const insertAiRunSchema = createInsertSchema(aiRuns).omit({ createdAt: true, updatedAt: true });
export const insertAiFeedbackSchema = createInsertSchema(aiFeedback).omit({ createdAt: true });

export interface SalesmanFeatures {
  canCreateOffers: boolean;
  canEditOffers: boolean;
  canDeleteOffers: boolean;
  canManageCustomers: boolean;
  canViewMachines: boolean;
  canViewPresets: boolean;
  canUseFormat: boolean;
  canManageSpecialMachines: boolean;
}

export const DEFAULT_SALESMAN_FEATURES: SalesmanFeatures = {
  canCreateOffers: true,
  canEditOffers: true,
  canDeleteOffers: false,
  canManageCustomers: true,
  canViewMachines: true,
  canViewPresets: true,
  canUseFormat: false,
  canManageSpecialMachines: false,
};

// Zod Schemas
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMachineSchema = createInsertSchema(machines).omit({ id: true });
export const updateMachineSchema = insertMachineSchema.partial();
export const insertMachineOptionSchema = createInsertSchema(machineOptions).omit({ id: true });
export const insertPresetSchema = createInsertSchema(presets).omit({ id: true });
export const insertOfferSchema = createInsertSchema(offers).omit({ id: true, referenceNumber: true, date: true });
export const insertOfferItemSchema = createInsertSchema(offerItems).omit({ id: true });
export const insertOfferItemOptionSchema = createInsertSchema(offerItemOptions).omit({ id: true });

// Row used in custom sections
export interface SectionRow {
  text: string;
  bold?: boolean;
}

// Document Format Types
export interface DocSection {
  id: string;
  name: string;          // internal name, not editable
  label?: string;        // editable heading shown in the PDF / document
  enabled: boolean;
  // ── Body (description) ──
  fontSize: number;      // in points (8-16)
  alignment: 'left' | 'center' | 'right' | 'justified';
  font: string;          // e.g. "Calibri", "Arial", "Times New Roman"
  textColor: string;     // hex with # prefix, e.g. "#1F2937"
  borderColor: string;   // hex with # prefix, e.g. "#3B82F6" (card border)
  fillColor: string;     // hex with # prefix, e.g. "#EFF6FF"  (card background)
  lineHeight: number;    // e.g. 1.2, 1.45, 1.6
  // ── Title (header bar of section) ──
  titleFont?: string;
  titleFontSize?: number;
  titleTextColor?: string;
  titleFillColor?: string;
  titleAlignment?: 'left' | 'center' | 'right' | 'justified';
  titleBold?: boolean;
  /** @deprecated use borderColor */ accentColor?: string;
  // ── Editable content labels (static text within the section) ──
  labels?: Record<string, string>;
  // ── Custom section content ──
  type?: 'builtin' | 'custom';
  rows?: SectionRow[];
  // ── Technical specs dynamic list rows ──
  specRows?: { label: string; value: string }[];
  // ── Section parts (sub-element formatting) ──
  parts?: SectionPart[];
}

// Default labels for each section's editable static text
export const DEFAULT_SECTION_LABELS: Record<string, Record<string, string>> = {
  metadata: {
    dateBox:     'DATE',
    salesmanBox: 'SALESMAN',
    customerBox: 'CUSTOMER',
    refPrefix:   'Ref.',
  },
  offer_title: {
    intro: '',
  },
  technical_specs: {
    intro:               '',
    minMaxLength:        'Min/Max. length (mm)',
    minMaxLengthVal:     '',
    maxWidth:            'Max. width (mm)',
    maxWidthVal:         '',
    minMaxThickness:     'Min/Max. thickness (mm)',
    minMaxThicknessVal:  '',
    averageLineSpeed:    'Avg. line speed (mt/min)',
    averageLineSpeedVal: '',
    controlSide:         'Control side',
    controlSideVal:      '',
    maxBow:              'Max. bow of panel',
    maxBowVal:           '',
    paint:               'Paint',
    paintVal:            '',
    substrate:           'Substrate',
    substrateVal:        '',
    finishing:           'Finishing',
    finishingVal:        '',
    standardVoltage:    'Standard voltage',
    standardVoltageVal: '',
    standardColors:     'Standard colors',
    standardColorsVal:  '',
    components:         'Components',
    componentsVal:      '',
    precautions:        'Precautions',
    precautionsVal:     '',
    airIntake:          'Air intake',
    airIntakeVal:       '',
    commissioning:      'Commissioning',
    commissioningVal:   '',
  },
  utilities_summary: {
    electricalPower:     'Electrical Power',
    electricalPowerUnit: 'kW',
    compressedAir:       'Compressed Air',
    compressedAirUnit:   'Nl/min',
    exhaustedAir:        'Exhausted Air',
    exhaustedAirUnit:    'm³/h',
    airIntroduced:       'Air Introduced',
    airIntroducedUnit:   'm³/h',
    installationDays:    'Installation days',
    installationDaysUnit:'days',
  },
  machine_line: {
    positionPrefix:  'MACHINE — POS.',
    includedOptions: 'Included Options',
    optionBullet:    '›',
  },
  price_overview: {
    totalListPrice: 'TOTAL LIST PRICE (ex works, installation excluded)',
    installation:   'Installation and start-up',
    travelCosts:    'Travel and flight costs',
    boardLodging:   'Board and lodging',
    training:       'Training',
    packaging:      'Packaging',
    transport:      'Transport',
    interlocking:   'Interlocking',
    discount:       'Discount',
    grossTotal:     'Gross Total',
    netTotal:       'NET TOTAL',
  },
  terms_conditions: {
    intro: '',
  },
};

export interface SectionPart {
  id: string;
  label: string;
  enabled: boolean;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontFamily?: string;
  alignment?: 'left' | 'center' | 'right' | 'justified';
  color?: string;
  spacing?: number;
}

export interface HeaderTextStyle {
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  color: string;
}

export interface HeaderConfig {
  logoEnabled: boolean;
  logoUrl?: string;
  logoSize: number;
  offerNumberEnabled: boolean;
  offerNumberStyle: HeaderTextStyle;
  dateEnabled: boolean;
  dateStyle: HeaderTextStyle;
  layout: 'logo-left' | 'logo-right';
}

export interface FooterConfig {
  companyDataEnabled: boolean;
  companyLines: string[];
  pageNumberEnabled: boolean;
  fontSize: number;
  fontFamily: string;
}

export const DEFAULT_OFFER_NUMBER_STYLE: HeaderTextStyle = {
  fontSize: 9,
  fontFamily: 'Arial',
  bold: true,
  italic: false,
  color: '#111827',
};

export const DEFAULT_DATE_STYLE: HeaderTextStyle = {
  fontSize: 7.5,
  fontFamily: 'Arial',
  bold: false,
  italic: false,
  color: '#9CA3AF',
};

export const DEFAULT_HEADER_CONFIG: HeaderConfig = {
  logoEnabled: true,
  logoSize: 42,
  offerNumberEnabled: true,
  offerNumberStyle: { ...DEFAULT_OFFER_NUMBER_STYLE },
  dateEnabled: true,
  dateStyle: { ...DEFAULT_DATE_STYLE },
  layout: 'logo-left',
};

export const DEFAULT_FOOTER_CONFIG: FooterConfig = {
  companyDataEnabled: true,
  companyLines: [],
  pageNumberEnabled: true,
  fontSize: 6,
  fontFamily: 'Arial',
};

export const DEFAULT_SECTION_PARTS: Record<string, SectionPart[]> = {
  metadata: [
    { id: 'sectionTitle', label: 'Title', enabled: true, fontWeight: 'bold', fontSize: 7.5, color: '#9CA3AF' },
    { id: 'contentA', label: 'Content A', enabled: true, fontWeight: 'bold', fontSize: 11, color: '#111827' },
    { id: 'contentB', label: 'Content B', enabled: true, fontWeight: 'normal', fontSize: 8.5, color: '#6B7280' },
  ],
  offer_title: [
    { id: 'sectionTitle', label: 'Title', enabled: true, fontWeight: 'bold', fontSize: 7.5, color: '#9CA3AF' },
    { id: 'contentA', label: 'Content A', enabled: true, fontWeight: 'bold', fontSize: 14, color: '#111827' },
    { id: 'contentB', label: 'Content B', enabled: true, fontWeight: 'normal', fontSize: 10, color: '#6B7280' },
  ],
  technical_specs: [
    { id: 'sectionTitle', label: 'Title', enabled: true, fontWeight: 'bold', fontSize: 7.5, color: '#9CA3AF' },
    { id: 'boxTitle', label: 'Box Title', enabled: true, fontWeight: 'bold', fontSize: 7.5, color: '#9CA3AF' },
    { id: 'boxValue', label: 'Box Value', enabled: true, fontWeight: 'bold', fontSize: 14, color: '#111827' },
    { id: 'contentA', label: 'Content A', enabled: true, fontWeight: 'bold', fontSize: 10, color: '#111827' },
    { id: 'contentB', label: 'Content B', enabled: true, fontWeight: 'normal', fontSize: 10, color: '#374151' },
  ],
  utilities_summary: [
    { id: 'sectionTitle', label: 'Title', enabled: true, fontWeight: 'bold', fontSize: 7.5, color: '#9CA3AF' },
    { id: 'boxTitle', label: 'Box Title', enabled: true, fontWeight: 'bold', fontSize: 7.5, color: '#9CA3AF' },
    { id: 'boxValue', label: 'Box Value', enabled: true, fontWeight: 'bold', fontSize: 14, color: '#111827' },
    { id: 'unit', label: 'Unit', enabled: true, fontWeight: 'normal', fontSize: 10, color: '#9CA3AF' },
  ],
  machine_line: [
    { id: 'sectionTitle', label: 'Title', enabled: true, fontWeight: 'bold', fontSize: 7.5, color: '#9CA3AF' },
    { id: 'contentA', label: 'Content A', enabled: true, fontWeight: 'normal', fontSize: 9.5, color: '#6B7280' },
    { id: 'contentB', label: 'Content B', enabled: true, fontWeight: 'bold', fontSize: 7.5, color: '#9CA3AF' },
    { id: 'contentC', label: 'Content C', enabled: true, fontWeight: 'normal', fontSize: 9.5, color: '#374151' },
  ],
  price_overview: [
    { id: 'sectionTitle', label: 'Title', enabled: true, fontWeight: 'bold', fontSize: 7.5, color: '#9CA3AF' },
    { id: 'machineName', label: 'Machine Name', enabled: true, fontWeight: 'bold', fontSize: 11, color: '#1F2937' },
    { id: 'machinePrice', label: 'Machine Price', enabled: true, fontWeight: 'bold', fontSize: 11, color: '#1F2937' },
    { id: 'optionName', label: 'Option Name', enabled: true, fontWeight: 'normal', fontSize: 9, color: '#6B7280' },
    { id: 'optionPrice', label: 'Option Price', enabled: true, fontWeight: 'normal', fontSize: 9, color: '#6B7280' },
    { id: 'totalList', label: 'Total List', enabled: true, fontWeight: 'bold', fontSize: 11, color: '#1F2937' },
    { id: 'servicesTitle', label: 'Services Title', enabled: true, fontWeight: 'bold', fontSize: 9, color: '#9CA3AF' },
    { id: 'serviceName', label: 'Service Name', enabled: true, fontWeight: 'normal', fontSize: 10, color: '#1F2937' },
    { id: 'servicePrice', label: 'Service Price', enabled: true, fontWeight: 'normal', fontSize: 10, color: '#1F2937' },
    { id: 'discount', label: 'Discount', enabled: true, fontWeight: 'normal', fontSize: 10, color: '#DC2626' },
    { id: 'totalGross', label: 'Total Gross', enabled: true, fontWeight: 'bold', fontSize: 13, color: '#1F2937' },
    { id: 'totalNet', label: 'Total Net', enabled: true, fontWeight: 'bold', fontSize: 13, color: '#2563EB' },
  ],
  terms_conditions: [
    { id: 'sectionTitle', label: 'Title', enabled: true, fontWeight: 'bold', fontSize: 7.5, color: '#9CA3AF' },
    { id: 'contentA', label: 'Content', enabled: true, fontWeight: 'normal', fontSize: 10, color: '#1F2937' },
  ],
};

export interface OfferReferenceFormatConfig {
  prefix: string;
  separator: string;
  progressivePadding: number;
  versionEnabled: boolean;
  versionSeparator: string;
  versionInitial: number;
}

export const DEFAULT_OFFER_REFERENCE_FORMAT: OfferReferenceFormatConfig = {
  prefix: 'OFF',
  separator: '-',
  progressivePadding: 4,
  versionEnabled: true,
  versionSeparator: '-v',
  versionInitial: 0,
};

export function resolveOfferReferenceFormat(
  raw: Partial<OfferReferenceFormatConfig> | null | undefined,
): OfferReferenceFormatConfig {
  if (!raw) return { ...DEFAULT_OFFER_REFERENCE_FORMAT };
  const padding = Number(raw.progressivePadding);
  const initial = Number(raw.versionInitial);
  return {
    prefix: typeof raw.prefix === 'string' ? raw.prefix : DEFAULT_OFFER_REFERENCE_FORMAT.prefix,
    separator: typeof raw.separator === 'string' ? raw.separator : DEFAULT_OFFER_REFERENCE_FORMAT.separator,
    progressivePadding: Number.isFinite(padding) && padding >= 1 && padding <= 8
      ? Math.floor(padding)
      : DEFAULT_OFFER_REFERENCE_FORMAT.progressivePadding,
    versionEnabled: typeof raw.versionEnabled === 'boolean'
      ? raw.versionEnabled
      : DEFAULT_OFFER_REFERENCE_FORMAT.versionEnabled,
    versionSeparator: typeof raw.versionSeparator === 'string' && raw.versionSeparator.length > 0
      ? raw.versionSeparator
      : DEFAULT_OFFER_REFERENCE_FORMAT.versionSeparator,
    versionInitial: Number.isFinite(initial) && initial >= 0 && initial <= 1
      ? Math.floor(initial)
      : DEFAULT_OFFER_REFERENCE_FORMAT.versionInitial,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildOfferReferenceCore(
  year: number,
  sequence: number,
  config: OfferReferenceFormatConfig,
): string {
  const padded = String(sequence).padStart(config.progressivePadding, '0');
  return `${config.prefix}${config.separator}${year}${config.separator}${padded}`;
}

export function buildOfferReferenceVersionSuffix(
  version: number,
  config: OfferReferenceFormatConfig,
): string {
  if (!config.versionEnabled) return '';
  const offset = config.versionInitial === 0 ? 1 : 0;
  const displayed = Math.max(0, version - offset);
  return `${config.versionSeparator}${displayed}`;
}

export function stripOfferReferenceVersionSuffix(
  ref: string,
  config?: OfferReferenceFormatConfig,
): string {
  let stripped = ref;
  if (config && config.versionSeparator) {
    const re = new RegExp(`${escapeRegex(config.versionSeparator)}\\d+$`);
    stripped = stripped.replace(re, '');
  }
  // Always also strip legacy uppercase `-V<n>` suffix from older offers.
  stripped = stripped.replace(/-V\d+$/, '');
  return stripped;
}

/**
 * Strip a known version suffix from a reference number.
 *
 * The reference layout is `<core><sep><version>` where `<core>` ends in a
 * digit (the padded progressive). Knowing the exact `version` number lets us
 * strip the suffix safely regardless of which separator was originally used,
 * which keeps version recomposition correct even if the configured separator
 * changes between when the reference was created and when a new version is
 * generated.
 */
export function stripKnownVersionSuffix(ref: string, version: number): string {
  if (!Number.isFinite(version) || version < 0) return ref;
  const versionStr = String(version);
  if (!ref.endsWith(versionStr)) return ref;
  const beforeNumIdx = ref.length - versionStr.length;
  if (beforeNumIdx <= 0) return ref;
  // The character immediately before the version digits must be a non-digit
  // (otherwise we would be eating into the core's padded progressive).
  if (/\d/.test(ref[beforeNumIdx - 1])) return ref;
  // Walk back over the separator (any run of non-digit characters).
  let coreEnd = beforeNumIdx;
  while (coreEnd > 0 && /\D/.test(ref[coreEnd - 1])) coreEnd--;
  return ref.slice(0, coreEnd);
}

export function applyOfferReferenceVersion(
  baseRef: string,
  newVersion: number,
  config: OfferReferenceFormatConfig,
  previousVersion?: number,
): string {
  let core = baseRef;
  if (typeof previousVersion === 'number') {
    // versionInitial=0 displays version-1, so the suffix on the existing ref
    // matches `previousVersion - offset` (matching what was rendered).
    const offset = config.versionInitial === 0 ? 1 : 0;
    const displayed = Math.max(0, previousVersion - offset);
    core = stripKnownVersionSuffix(baseRef, displayed);
  }
  // Also strip any obvious legacy `-V<n>` suffix and the configured separator
  // pattern so we don't double-stack suffixes from older data.
  core = stripOfferReferenceVersionSuffix(core, config);
  return `${core}${buildOfferReferenceVersionSuffix(newVersion, config)}`;
}

export interface DocumentFormatSettings {
  sections: DocSection[];
  pageBackground: string;
  borderRadius: number;
  borderWidth: number;
  header?: HeaderConfig;
  footer?: FooterConfig;
  offerReferenceFormat?: OfferReferenceFormatConfig;
}

const SEC = (id: string, name: string): DocSection => ({
  id, name, enabled: true, fontSize: 11, alignment: 'justified', font: 'Calibri',
  textColor: '#1F2937', borderColor: '#E5E7EB', fillColor: '#FFFFFF', lineHeight: 1.45,
});

export const DEFAULT_DOC_SECTIONS: DocSection[] = [
  SEC('metadata',          'Header — Date, Salesman, Customer'),
  SEC('offer_title',       'Offer Title'),
  SEC('technical_specs',   'Project Data & Technical Specifications'),
  SEC('utilities_summary', 'Utilities Summary'),
  SEC('machine_line',      'Machine Cards (one per machine)'),
  SEC('price_overview',    'Price Overview'),
  SEC('terms_conditions',  'Terms & Conditions (one per preset)'),
];

export const DEFAULT_PAGE_BACKGROUND = '#F9FAFB';
export const DEFAULT_BORDER_RADIUS = 6;
export const DEFAULT_BORDER_WIDTH = 1;

// ── Sales Brain Analytics Tables ──

export const machineUsageStats = pgTable("machine_usage_stats", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id").notNull(),
  machineName: text("machine_name").notNull(),
  macroType: text("macro_type"),
  usageCount: integer("usage_count").notNull().default(0),
  avgPrice: decimal("avg_price", { precision: 12, scale: 2 }),
  avgQuantity: decimal("avg_quantity", { precision: 8, scale: 2 }),
  totalRevenue: decimal("total_revenue", { precision: 14, scale: 2 }),
  lastUsedAt: timestamp("last_used_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const optionUsageStats = pgTable("option_usage_stats", {
  id: serial("id").primaryKey(),
  machineOptionId: integer("machine_option_id").notNull(),
  optionName: text("option_name").notNull(),
  machineId: integer("machine_id").notNull(),
  usageCount: integer("usage_count").notNull().default(0),
  coOccurrenceOptionIds: jsonb("co_occurrence_option_ids").$type<number[]>(),
  avgQuantity: decimal("avg_quantity", { precision: 8, scale: 2 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pricingDistributions = pgTable("pricing_distributions", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id").notNull(),
  machineName: text("machine_name").notNull(),
  macroType: text("macro_type"),
  minPrice: decimal("min_price", { precision: 12, scale: 2 }),
  maxPrice: decimal("max_price", { precision: 12, scale: 2 }),
  avgPrice: decimal("avg_price", { precision: 12, scale: 2 }),
  medianPrice: decimal("median_price", { precision: 12, scale: 2 }),
  sampleCount: integer("sample_count").notNull().default(0),
  priceBuckets: jsonb("price_buckets").$type<{ min: number; max: number; count: number }[]>(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const offerPatterns = pgTable("offer_patterns", {
  id: serial("id").primaryKey(),
  patternType: text("pattern_type").notNull(),
  patternData: jsonb("pattern_data").$type<Record<string, unknown>>().notNull(),
  frequency: integer("frequency").notNull().default(1),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  lastSeenAt: timestamp("last_seen_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const salesInsights = pgTable("sales_insights", {
  id: serial("id").primaryKey(),
  insightType: text("insight_type").notNull(),
  insightData: jsonb("insight_data").$type<Record<string, unknown>>().notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
  validUntil: timestamp("valid_until"),
});

export const insertMachineUsageStatSchema = createInsertSchema(machineUsageStats).omit({ id: true, updatedAt: true });
export const insertOptionUsageStatSchema = createInsertSchema(optionUsageStats).omit({ id: true, updatedAt: true });
export const insertPricingDistributionSchema = createInsertSchema(pricingDistributions).omit({ id: true, updatedAt: true });
export const insertOfferPatternSchema = createInsertSchema(offerPatterns).omit({ id: true, updatedAt: true });
export const insertSalesInsightSchema = createInsertSchema(salesInsights).omit({ id: true, computedAt: true });

export type MachineUsageStat = typeof machineUsageStats.$inferSelect;
export type OptionUsageStat = typeof optionUsageStats.$inferSelect;
export type PricingDistribution = typeof pricingDistributions.$inferSelect;
export type OfferPattern = typeof offerPatterns.$inferSelect;
export type SalesInsight = typeof salesInsights.$inferSelect;

// Types
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

export type ProductionFacility = typeof productionFacilities.$inferSelect;

export type Machine = typeof machines.$inferSelect;
export type InsertMachine = z.infer<typeof insertMachineSchema>;

export type MachineOption = typeof machineOptions.$inferSelect;
export type InsertMachineOption = z.infer<typeof insertMachineOptionSchema>;

export type Preset = typeof presets.$inferSelect;
export type InsertPreset = z.infer<typeof insertPresetSchema>;

export type Offer = typeof offers.$inferSelect;
export type InsertOffer = z.infer<typeof insertOfferSchema>;

export type OfferItem = typeof offerItems.$inferSelect;
export type InsertOfferItem = z.infer<typeof insertOfferItemSchema>;

export type OfferItemOption = typeof offerItemOptions.$inferSelect;
export type InsertOfferItemOption = z.infer<typeof insertOfferItemOptionSchema>;

// ─── Share Hub ───────────────────────────────────────────────────────────────

export const shareConversations = pgTable("share_conversations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  subject: text("subject").notNull(),
  createdByType: text("created_by_type").notNull(),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const shareParticipants = pgTable("share_participants", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  participantType: text("participant_type").notNull(),
  participantId: integer("participant_id").notNull(),
  lastReadAt: timestamp("last_read_at"),
  deletedAt: timestamp("deleted_at"),
});

export const shareMessages = pgTable("share_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  senderType: text("sender_type").notNull(),
  senderId: integer("sender_id").notNull(),
  body: text("body"),
  sharedOfferId: integer("shared_offer_id"),
  sharedEnquiryId: integer("shared_enquiry_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const shareAttachments = pgTable("share_attachments", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimetype: text("mimetype").notNull(),
  size: integer("size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export type ShareConversation = typeof shareConversations.$inferSelect;
export type InsertShareConversation = typeof shareConversations.$inferInsert;
export const insertShareConversationSchema = createInsertSchema(shareConversations).omit({ id: true, createdAt: true, updatedAt: true });

export type ShareParticipant = typeof shareParticipants.$inferSelect;
export type InsertShareParticipant = typeof shareParticipants.$inferInsert;
export const insertShareParticipantSchema = createInsertSchema(shareParticipants).omit({ id: true });

export type ShareMessage = typeof shareMessages.$inferSelect;
export type InsertShareMessage = typeof shareMessages.$inferInsert;
export const insertShareMessageSchema = createInsertSchema(shareMessages).omit({ id: true, createdAt: true });

export type ShareAttachment = typeof shareAttachments.$inferSelect;
export type InsertShareAttachment = typeof shareAttachments.$inferInsert;
export const insertShareAttachmentSchema = createInsertSchema(shareAttachments).omit({ id: true, uploadedAt: true });

// CRM Interactions
export const interactions = pgTable("interactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  customerId: integer("customer_id").notNull(),
  contactId: integer("contact_id"),
  salesmanUserId: integer("salesman_user_id"),
  dealerUserId: integer("dealer_user_id"),
  date: timestamp("date").notNull(),
  direction: text("direction").notNull(),
  type: text("type").notNull(),
  classification: text("classification"),
  notes: text("notes"),
  location: text("location"),
  additionalContactIds: jsonb("additional_contact_ids").$type<number[]>(),
  reminders: jsonb("reminders").$type<{ minutesBefore: number }[]>(),
  sendEmail: boolean("send_email").default(false),
  autoGenerated: boolean("auto_generated").default(false),
  linkedOfferId: integer("linked_offer_id"),
  linkedEnquiryId: integer("linked_enquiry_id"),
  linkedJobOrderId: integer("linked_job_order_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Interaction = typeof interactions.$inferSelect;
export type InsertInteraction = typeof interactions.$inferInsert;
export const insertInteractionSchema = createInsertSchema(interactions).omit({ id: true, createdAt: true, updatedAt: true });

// Job Orders / Commesse
export interface OrderBillingInfo {
  name: string;
  city: string;
  address: string;
  country: string;
  vatId: string;
  phone: string;
  fax: string;
}
export interface OrderShippingInfo {
  name: string;
  city: string;
  address: string;
  country: string;
  phone: string;
  fax: string;
}
export interface OrderLineItemOption {
  name: string;
  price: number;
  listPrice?: number;
  discountPercent?: number | null;
  isNet?: boolean;
}
export interface OrderLineItem {
  position: number;
  description: string;
  unitPrice: number;
  options?: OrderLineItemOption[];
  listPrice?: number;
  discountPercent?: number | null;
  isNet?: boolean;
  globalDiscountPercent?: number;
}
export interface OrderPriceSummary {
  machinesTotal: number;
  assemblyPrice: number;
  assemblyNotes: string;
  transportPrice: number;
  transportNotes: string;
  totalOrderPrice: number;
  assemblyDailyRate?: number;
  assemblySoldDays?: number;
  assemblyPurePrice?: number;
  assemblyServicesCost?: number;
  travelIncluded?: boolean;
  hotelIncluded?: boolean;
  travelDays?: number;
  mechanicalDays?: number;
  electricalDays?: number;
  testingDays?: number;
  installTrainingDays?: number;
  rentalCarDailyFee?: number;
  rentalCarDays?: number;
  rentalCarTotal?: number;
  flightTicketCost?: number;
  interlockingTotal?: number;
  totalListPrice?: number;
  trainingIncluded?: boolean;
  trainingDays?: string;
  packagingIncluded?: boolean;
  transportIncluded?: boolean;
  installationIncluded?: boolean;
  discountPercent?: number;
  discountAmount?: number;
  grossTotal?: number;
  netTotal?: number;
  priceLabels?: Record<string, string>;
}
export interface OrderShippingTerms {
  incoterms: string;
  exchangeRate: number | null;
  packaging: string;
}
export interface OrderAgentInfo {
  code: string;
  dealerId?: number | null;
  dealerCompanyName?: string;
  dealerContactName?: string;
}
export interface OrderPaymentTerm {
  condition: string;
  paid?: boolean;
  paidDate?: string;
}
export interface OrderInvoiceEntry {
  invoiceNumber: string;
  date: string;
  amount: number;
  notes: string;
}
export interface OrderLineTechnicalData {
  controlSide: string;
  workingWidth: string;
  ralColor: string;
  workingHeight: string;
  speedRange: string;
  workingSpeed: string;
  motorProtection: string;
  electricalProtection: string;
  rollerHardness: string;
  rubberThickness: string;
  transportType: string;
  transportLength: string;
  hoodLength: string;
  airSupply: string;
  exhaustTower: string;
  minMaxLength: string;
  minMaxThickness: string;
  maxBow: string;
  paint: string;
  substrate: string;
  finishing: string;
  energySources: { heating: string; electrical: string; pneumatic: string };
  performance: { speed: string; shifts: string; minPieceDimensions: string; maxPieceDimensions: string; maxPieceWeight: string };
  automations: { requested: string; control: string; extraControl: string };
  commissioning: { assemblyStartDate: string; productionStartDate: string; electricalWiring: string; electricalCables: string };
}
export interface OrderTechnicalSheet {
  machinePosition: number;
  machineName: string;
  machineImageUrl?: string;
  isCustomMachine?: boolean;
  lamps: Record<string, string>;
  optionals: string[];
  spareParts: { quantity: string; description: string; code: string }[];
  originalDescription?: string;
  currentDescription?: string;
}

export interface OrderShipment {
  id: string;
  date: string;
  description: string;
  ddtNumber: string;
  ddtFilename?: string;
  ddtOriginalName?: string;
  cmrFilename?: string;
  cmrOriginalName?: string;
}

export interface OrderPhaseData {
  startDate: string;
  expectedDurationDays: number;
  endDate: string;
  progressPercent: number;
  workers: string[];
  notes: string;
  certificates: { id: string; filename: string; originalName: string }[];
}

export type AssemblyPhaseType = "mechanical" | "electrical" | "testing";

export interface AssemblyPhase extends OrderPhaseData {
  id: string;
  phaseType: AssemblyPhaseType;
}

export type TimelineEventType =
  | "order_date"
  | "contractual_delivery"
  | "contractual_testing"
  | "preliminary_drawings"
  | "final_drawings"
  | "technical_meeting"
  | "delivery"
  | "mechanical_assembly"
  | "electrical_assembly"
  | "testing"
  | "custom";

export type TimelineEventStatus = "pending" | "in_progress" | "completed" | "skipped";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  label: string;
  plannedDate: string;
  actualDate: string;
  status: TimelineEventStatus;
  notes: string;
  autoCalculated: boolean;
}

export interface OrderLogistics {
  contractualDeliveryDate: string;
  hasPenalties: boolean;
  penaltiesDescription: string;
  contractualAssemblyStartDate: string;
  contractualTestingEndDate: string;
  shipments: OrderShipment[];
  phases: AssemblyPhase[];
  timeline?: TimelineEvent[];
  mechanicalAssembly?: OrderPhaseData;
  electricalAssembly?: OrderPhaseData;
  testing?: OrderPhaseData;
}

export interface SectionComment {
  id: string;
  sectionKey: string;
  text: string;
  userId: number;
  userName: string;
  version: number;
  createdAt: string;
}

export interface OfferHistoryEntry {
  offerId: number;
  offerRef: string;
  replacedAt: string;
  replacedByUserId?: number;
  replacedByName?: string;
  reason?: string;
}

export interface ProductionProgressEntry {
  positionIndex: number;
  machineName: string;
  progressPercent: number;
  notes: string;
  lastUpdatedBy: number | null;
  lastUpdatedByName: string;
  lastUpdatedAt: string;
}

export interface AuditLogEntry {
  action: string;
  timestamp: string;
  performedBy: string;
}

export const ORDER_SECTION_EDIT_ROLES: Record<string, string[]> = {
  overview: ["master", "salesman", "backoffice"],
  billing: ["master", "amministrazione"],
  shipping: ["master", "salesman", "backoffice"],
  payments: ["master", "salesman", "backoffice", "amministrazione"],
  pricing: ["master", "salesman", "backoffice"],
  techData: ["master", "tecnico"],
  techSheets: ["master", "tecnico"],
  logistics: ["master", "salesman", "backoffice"],
  shipments: ["master", "salesman", "backoffice"],
  assembly: ["master", "service"],
  timeline: ["master", "salesman", "backoffice"],
  production: ["master", "produzione"],
  notes: ["master", "salesman", "backoffice", "amministrazione", "tecnico", "produzione", "service"],
  documents: ["master", "salesman", "backoffice"],
};

export function canEditSection(_sectionKey: string, _role: UserRole): boolean {
  return true;
}

export const jobOrders = pgTable("job_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  jobNumber: text("job_number").notNull().unique(),
  offerId: integer("offer_id"),
  customerId: integer("customer_id"),
  contactIds: jsonb("contact_ids").$type<number[]>(),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  responsibleUserId: integer("responsible_user_id"),
  layoutPdfFilename: text("layout_pdf_filename"),
  layoutPdfOriginalName: text("layout_pdf_original_name"),
  orderConfirmationFilename: text("order_confirmation_filename"),
  orderConfirmationOriginalName: text("order_confirmation_original_name"),
  settore: text("settore").default("Legno"),
  jobCode: text("job_code"),
  agentInfo: jsonb("agent_info").$type<OrderAgentInfo>(),
  billingInfo: jsonb("billing_info").$type<OrderBillingInfo>(),
  shippingInfo: jsonb("shipping_info").$type<OrderShippingInfo>(),
  deliveryDate: timestamp("delivery_date"),
  assemblyDate: timestamp("assembly_date"),
  testingDate: timestamp("testing_date"),
  paymentTerms: jsonb("payment_terms").$type<OrderPaymentTerm[]>(),
  bankName: text("bank_name"),
  orderItems: jsonb("order_items").$type<OrderLineItem[]>(),
  additionalItems: jsonb("additional_items").$type<OrderLineItem[]>(),
  priceSummary: jsonb("price_summary").$type<OrderPriceSummary>(),
  shippingTerms: jsonb("shipping_terms").$type<OrderShippingTerms>(),
  lineTechnicalData: jsonb("line_technical_data").$type<OrderLineTechnicalData>(),
  technicalSheets: jsonb("technical_sheets").$type<OrderTechnicalSheet[]>(),
  logistics: jsonb("logistics").$type<OrderLogistics>(),
  manualFormData: jsonb("manual_form_data").$type<Record<string, any>>(),
  sectionComments: jsonb("section_comments").$type<SectionComment[]>(),
  offerHistory: jsonb("offer_history").$type<OfferHistoryEntry[]>(),
  invoicing: jsonb("invoicing").$type<OrderInvoiceEntry[]>(),
  productionProgress: jsonb("production_progress").$type<ProductionProgressEntry[]>(),
  auditLog: jsonb("audit_log").$type<AuditLogEntry[]>(),
  currentVersion: integer("current_version").notNull().default(1),
  lastModifiedByUserId: integer("last_modified_by_user_id"),
  confirmationStatus: text("confirmation_status").notNull().default("pending"),
  confirmationComment: text("confirmation_comment"),
  confirmedByUserId: integer("confirmed_by_user_id"),
  confirmedAt: timestamp("confirmed_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type JobOrder = typeof jobOrders.$inferSelect;
export type InsertJobOrder = z.infer<typeof insertJobOrderSchema>;
export const insertJobOrderSchema = createInsertSchema(jobOrders).omit({ id: true, createdAt: true, updatedAt: true });

export const jobOrderVersions = pgTable("job_order_versions", {
  id: serial("id").primaryKey(),
  jobOrderId: integer("job_order_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, any>>().notNull(),
  modifiedByUserId: integer("modified_by_user_id"),
  modifiedByName: text("modified_by_name"),
  changeNotes: text("change_notes"),
  changeSummary: jsonb("change_summary").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type JobOrderVersion = typeof jobOrderVersions.$inferSelect;

export const jobOrderDocuments = pgTable("job_order_documents", {
  id: serial("id").primaryKey(),
  jobOrderId: integer("job_order_id").notNull(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type"),
  description: text("description"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export type JobOrderDocument = typeof jobOrderDocuments.$inferSelect;
export type InsertJobOrderDocument = z.infer<typeof insertJobOrderDocumentSchema>;
export const insertJobOrderDocumentSchema = createInsertSchema(jobOrderDocuments).omit({ id: true, uploadedAt: true });

// Offer Documents
export const offerDocuments = pgTable("offer_documents", {
  id: serial("id").primaryKey(),
  offerId: integer("offer_id").notNull(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type"),
  description: text("description"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export type OfferDocument = typeof offerDocuments.$inferSelect;
export type InsertOfferDocument = z.infer<typeof insertOfferDocumentSchema>;
export const insertOfferDocumentSchema = createInsertSchema(offerDocuments).omit({ id: true, uploadedAt: true });

// Email Attachment Links (polymorphic: link Gmail attachments OR whole email messages
// to customers/contacts/offers/orders). `kind` distinguishes between a single attachment
// and a full email message saved as .eml.
export const emailAttachmentLinks = pgTable("email_attachment_links", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  kind: text("kind").notNull().default("attachment"), // "attachment" | "message"
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type"),
  size: integer("size"),
  sourceMessageId: text("source_message_id"),
  sourceAttachmentId: text("source_attachment_id"),
  sourceSubject: text("source_subject"),
  sourceFrom: text("source_from"),
  uploadedByUserId: integer("uploaded_by_user_id"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export type EmailAttachmentLink = typeof emailAttachmentLinks.$inferSelect;
export const insertEmailAttachmentLinkSchema = createInsertSchema(emailAttachmentLinks).omit({ id: true, uploadedAt: true });
export type InsertEmailAttachmentLink = z.infer<typeof insertEmailAttachmentLinkSchema>;
export type LinkEntityType = "customer" | "contact" | "offer" | "order";

// In-app Notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  recipientUserId: integer("recipient_user_id").notNull(),
  senderUserId: integer("sender_user_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull().default(""),
  orderId: integer("order_id"),
  offerId: integer("offer_id"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });

// Offer Reminders (CRM panel)
export const offerReminders = pgTable("offer_reminders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  offerId: integer("offer_id").notNull(),
  userId: integer("user_id").notNull(),
  remindAt: timestamp("remind_at").notNull(),
  note: text("note").notNull().default(""),
  createdByUserId: integer("created_by_user_id").notNull(),
  sentAt: timestamp("sent_at"),
  isDismissed: boolean("is_dismissed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type OfferReminder = typeof offerReminders.$inferSelect;
export const insertOfferReminderSchema = createInsertSchema(offerReminders).omit({
  id: true,
  createdAt: true,
  sentAt: true,
  isDismissed: true,
});
export type InsertOfferReminder = z.infer<typeof insertOfferReminderSchema>;

export const createOfferReminderInputSchema = z.object({
  remindAt: z.string().min(1),
  note: z.string().max(1000).optional().default(""),
  userId: z.number().int().positive().optional(),
});
export type CreateOfferReminderInput = z.infer<typeof createOfferReminderInputSchema>;

export const updateOfferReminderInputSchema = z.object({
  remindAt: z.string().min(1).optional(),
  note: z.string().max(1000).optional(),
  isDismissed: z.boolean().optional(),
});
export type UpdateOfferReminderInput = z.infer<typeof updateOfferReminderInputSchema>;

// Email Connections (per-user OAuth for Gmail / Outlook)
export const emailConnections = pgTable("email_connections", {
  id: serial("id").primaryKey(),
  salesmanUserId: integer("salesman_user_id"),
  dealerUserId: integer("dealer_user_id"),
  provider: text("provider").notNull(),
  providerAccountEmail: text("provider_account_email"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  scopes: text("scopes"),
  isDefault: boolean("is_default").default(false),
  senderDisplayName: text("sender_display_name"),
  signature: text("signature"),
  aiEmailEnabled: boolean("ai_email_enabled").default(true),
  // Local Gmail metadata index bookkeeping (used by gmailIndexScheduler).
  // `gmailHistoryId` stores the last seen Gmail historyId so we can use
  // users.history.list for incremental syncs. `gmailIndexBackfilledAt` is set
  // after the initial 6-month backfill completes. `gmailIndexLastSyncedAt`
  // tracks the most recent successful sync attempt. `gmailIndexLastError`
  // (and `gmailIndexLastErrorAt`) hold the last sync failure surface so the
  // account UI can warn the user when the cache is stale (e.g. token expired).
  gmailHistoryId: text("gmail_history_id"),
  gmailIndexBackfilledAt: timestamp("gmail_index_backfilled_at"),
  gmailIndexLastSyncedAt: timestamp("gmail_index_last_synced_at"),
  gmailIndexLastError: text("gmail_index_last_error"),
  gmailIndexLastErrorAt: timestamp("gmail_index_last_error_at"),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type EmailConnection = typeof emailConnections.$inferSelect;
export type InsertEmailConnection = typeof emailConnections.$inferInsert;
export const insertEmailConnectionSchema = createInsertSchema(emailConnections).omit({ id: true, connectedAt: true, updatedAt: true });

// Gmail message index: per-connection cache of mailbox metadata (no body)
// so the Recap timeline can render instantly without calling Gmail live
// every time. Refreshed in background by gmailIndexScheduler. Both INBOX
// and SENT folders are indexed so the Recap can show received AND sent
// messages — even those sent directly from Gmail (outside QuotePilot's
// own send endpoint). Only metadata is stored: message id, internal date,
// sender + (for outbound) recipient, subject, Gmail thread id and the
// derived direction.
export const gmailMessageIndex = pgTable("gmail_message_index", {
  id: serial("id").primaryKey(),
  emailConnectionId: integer("email_connection_id").notNull(),
  messageId: text("message_id").notNull(),
  internalDate: timestamp("internal_date").notNull(),
  senderEmail: text("sender_email"),
  senderName: text("sender_name"),
  senderDomain: text("sender_domain"),
  subject: text("subject"),
  // Gmail thread id (RFC 822 conversation). Two messages with the same
  // threadId belong to the same email conversation regardless of subject
  // shenanigans (Re:/Fwd:/translation). Used by Recap to draw
  // "same-email-thread" links between received & sent messages so they
  // visually cluster on the timeline. Nullable for rows backfilled
  // before this column existed.
  threadId: text("thread_id"),
  // "inbound" = INBOX message (someone wrote to us). "outbound" = SENT
  // message (we wrote to someone). Derived from labelIds at index time.
  // Nullable for legacy rows (treated as "inbound" by the loader).
  direction: text("direction"),
  // For outbound rows: lowercased first recipient address (To header).
  // Used by Recap to render "Email → recipient" titles for sent emails
  // pulled from this index. Null for inbound rows.
  recipientEmail: text("recipient_email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type GmailMessageIndex = typeof gmailMessageIndex.$inferSelect;
export type InsertGmailMessageIndex = typeof gmailMessageIndex.$inferInsert;

// Email Send Log
export const emailSendLog = pgTable("email_send_log", {
  id: serial("id").primaryKey(),
  salesmanUserId: integer("salesman_user_id"),
  dealerUserId: integer("dealer_user_id"),
  provider: text("provider").notNull(),
  recipient: text("recipient").notNull(),
  cc: text("cc"),
  subject: text("subject").notNull(),
  offerId: integer("offer_id"),
  jobOrderId: integer("job_order_id"),
  customerId: integer("customer_id"),
  interactionId: integer("interaction_id"),
  // Provider-side message id (e.g. Gmail "messages/send" response id, Outlook
  // message id). Used to deep-link from the Recap straight to the sent email.
  // Nullable for historical rows logged before this column existed.
  providerMessageId: text("provider_message_id"),
  // Provider-side conversation/thread id (e.g. Gmail threadId). Lets the
  // Recap timeline group sent emails with their inbound replies under
  // the same email thread for "same-email-thread" link curves.
  // Nullable for historical rows.
  providerThreadId: text("provider_thread_id"),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

export type EmailSendLogEntry = typeof emailSendLog.$inferSelect;
export type InsertEmailSendLogEntry = typeof emailSendLog.$inferInsert;
export const insertEmailSendLogSchema = createInsertSchema(emailSendLog).omit({ id: true, sentAt: true });

// ─── Open Banking (TrueLayer) ─────────────────────────────────────

export const bankConnections = pgTable("bank_connections", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("truelayer"),
  userId: integer("user_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  status: text("status").notNull().default("active"),
  providerUserReference: text("provider_user_reference"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type BankConnection = typeof bankConnections.$inferSelect;
export type InsertBankConnection = typeof bankConnections.$inferInsert;

export const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  bankName: text("bank_name"),
  accountName: text("account_name"),
  iban: text("iban"),
  currency: text("currency"),
  accountType: text("account_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = typeof bankAccounts.$inferInsert;

export const bankBalanceSnapshots = pgTable("bank_balance_snapshots", {
  id: serial("id").primaryKey(),
  bankAccountId: integer("bank_account_id").notNull(),
  currentBalance: decimal("current_balance", { precision: 18, scale: 2 }),
  availableBalance: decimal("available_balance", { precision: 18, scale: 2 }),
  currency: text("currency"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

export type BankBalanceSnapshot = typeof bankBalanceSnapshots.$inferSelect;
export type InsertBankBalanceSnapshot = typeof bankBalanceSnapshots.$inferInsert;

export const bankTransactions = pgTable("bank_transactions", {
  id: serial("id").primaryKey(),
  bankAccountId: integer("bank_account_id").notNull(),
  providerTransactionId: text("provider_transaction_id"),
  transactionDate: timestamp("transaction_date"),
  amount: decimal("amount", { precision: 18, scale: 2 }),
  currency: text("currency"),
  description: text("description"),
  reference: text("reference"),
  counterpartyName: text("counterparty_name"),
  rawPayload: jsonb("raw_payload"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

export type BankTransaction = typeof bankTransactions.$inferSelect;
export type InsertBankTransaction = typeof bankTransactions.$inferInsert;

// World Countries (ISO 3166-1 alpha-2)
export const WORLD_COUNTRIES: { code: string; name: string }[] = [
  { code: "AF", name: "Afghanistan" }, { code: "AX", name: "Åland Islands" }, { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" }, { code: "AS", name: "American Samoa" }, { code: "AD", name: "Andorra" },
  { code: "AO", name: "Angola" }, { code: "AI", name: "Anguilla" }, { code: "AQ", name: "Antarctica" },
  { code: "AG", name: "Antigua and Barbuda" }, { code: "AR", name: "Argentina" }, { code: "AM", name: "Armenia" },
  { code: "AW", name: "Aruba" }, { code: "AU", name: "Australia" }, { code: "AT", name: "Austria" },
  { code: "AZ", name: "Azerbaijan" }, { code: "BS", name: "Bahamas" }, { code: "BH", name: "Bahrain" },
  { code: "BD", name: "Bangladesh" }, { code: "BB", name: "Barbados" }, { code: "BY", name: "Belarus" },
  { code: "BE", name: "Belgium" }, { code: "BZ", name: "Belize" }, { code: "BJ", name: "Benin" },
  { code: "BM", name: "Bermuda" }, { code: "BT", name: "Bhutan" }, { code: "BO", name: "Bolivia" },
  { code: "BQ", name: "Bonaire, Sint Eustatius and Saba" }, { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "BW", name: "Botswana" }, { code: "BV", name: "Bouvet Island" }, { code: "BR", name: "Brazil" },
  { code: "IO", name: "British Indian Ocean Territory" }, { code: "BN", name: "Brunei" },
  { code: "BG", name: "Bulgaria" }, { code: "BF", name: "Burkina Faso" }, { code: "BI", name: "Burundi" },
  { code: "CV", name: "Cabo Verde" }, { code: "KH", name: "Cambodia" }, { code: "CM", name: "Cameroon" },
  { code: "CA", name: "Canada" }, { code: "KY", name: "Cayman Islands" }, { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" }, { code: "CL", name: "Chile" }, { code: "CN", name: "China" },
  { code: "CX", name: "Christmas Island" }, { code: "CC", name: "Cocos (Keeling) Islands" },
  { code: "CO", name: "Colombia" }, { code: "KM", name: "Comoros" }, { code: "CG", name: "Congo" },
  { code: "CD", name: "Congo (DRC)" }, { code: "CK", name: "Cook Islands" }, { code: "CR", name: "Costa Rica" },
  { code: "CI", name: "Côte d'Ivoire" }, { code: "HR", name: "Croatia" }, { code: "CU", name: "Cuba" },
  { code: "CW", name: "Curaçao" }, { code: "CY", name: "Cyprus" }, { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" }, { code: "DJ", name: "Djibouti" }, { code: "DM", name: "Dominica" },
  { code: "DO", name: "Dominican Republic" }, { code: "EC", name: "Ecuador" }, { code: "EG", name: "Egypt" },
  { code: "SV", name: "El Salvador" }, { code: "GQ", name: "Equatorial Guinea" }, { code: "ER", name: "Eritrea" },
  { code: "EE", name: "Estonia" }, { code: "SZ", name: "Eswatini" }, { code: "ET", name: "Ethiopia" },
  { code: "FK", name: "Falkland Islands" }, { code: "FO", name: "Faroe Islands" }, { code: "FJ", name: "Fiji" },
  { code: "FI", name: "Finland" }, { code: "FR", name: "France" }, { code: "GF", name: "French Guiana" },
  { code: "PF", name: "French Polynesia" }, { code: "TF", name: "French Southern Territories" },
  { code: "GA", name: "Gabon" }, { code: "GM", name: "Gambia" }, { code: "GE", name: "Georgia" },
  { code: "DE", name: "Germany" }, { code: "GH", name: "Ghana" }, { code: "GI", name: "Gibraltar" },
  { code: "GR", name: "Greece" }, { code: "GL", name: "Greenland" }, { code: "GD", name: "Grenada" },
  { code: "GP", name: "Guadeloupe" }, { code: "GU", name: "Guam" }, { code: "GT", name: "Guatemala" },
  { code: "GG", name: "Guernsey" }, { code: "GN", name: "Guinea" }, { code: "GW", name: "Guinea-Bissau" },
  { code: "GY", name: "Guyana" }, { code: "HT", name: "Haiti" }, { code: "HM", name: "Heard Island and McDonald Islands" },
  { code: "VA", name: "Vatican City" }, { code: "HN", name: "Honduras" }, { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" }, { code: "IS", name: "Iceland" }, { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" }, { code: "IR", name: "Iran" }, { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" }, { code: "IM", name: "Isle of Man" }, { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" }, { code: "JM", name: "Jamaica" }, { code: "JP", name: "Japan" },
  { code: "JE", name: "Jersey" }, { code: "JO", name: "Jordan" }, { code: "KZ", name: "Kazakhstan" },
  { code: "KE", name: "Kenya" }, { code: "KI", name: "Kiribati" }, { code: "KP", name: "North Korea" },
  { code: "KR", name: "South Korea" }, { code: "KW", name: "Kuwait" }, { code: "KG", name: "Kyrgyzstan" },
  { code: "LA", name: "Laos" }, { code: "LV", name: "Latvia" }, { code: "LB", name: "Lebanon" },
  { code: "LS", name: "Lesotho" }, { code: "LR", name: "Liberia" }, { code: "LY", name: "Libya" },
  { code: "LI", name: "Liechtenstein" }, { code: "LT", name: "Lithuania" }, { code: "LU", name: "Luxembourg" },
  { code: "MO", name: "Macao" }, { code: "MG", name: "Madagascar" }, { code: "MW", name: "Malawi" },
  { code: "MY", name: "Malaysia" }, { code: "MV", name: "Maldives" }, { code: "ML", name: "Mali" },
  { code: "MT", name: "Malta" }, { code: "MH", name: "Marshall Islands" }, { code: "MQ", name: "Martinique" },
  { code: "MR", name: "Mauritania" }, { code: "MU", name: "Mauritius" }, { code: "YT", name: "Mayotte" },
  { code: "MX", name: "Mexico" }, { code: "FM", name: "Micronesia" }, { code: "MD", name: "Moldova" },
  { code: "MC", name: "Monaco" }, { code: "MN", name: "Mongolia" }, { code: "ME", name: "Montenegro" },
  { code: "MS", name: "Montserrat" }, { code: "MA", name: "Morocco" }, { code: "MZ", name: "Mozambique" },
  { code: "MM", name: "Myanmar" }, { code: "NA", name: "Namibia" }, { code: "NR", name: "Nauru" },
  { code: "NP", name: "Nepal" }, { code: "NL", name: "Netherlands" }, { code: "NC", name: "New Caledonia" },
  { code: "NZ", name: "New Zealand" }, { code: "NI", name: "Nicaragua" }, { code: "NE", name: "Niger" },
  { code: "NG", name: "Nigeria" }, { code: "NU", name: "Niue" }, { code: "NF", name: "Norfolk Island" },
  { code: "MK", name: "North Macedonia" }, { code: "MP", name: "Northern Mariana Islands" },
  { code: "NO", name: "Norway" }, { code: "OM", name: "Oman" }, { code: "PK", name: "Pakistan" },
  { code: "PW", name: "Palau" }, { code: "PS", name: "Palestine" }, { code: "PA", name: "Panama" },
  { code: "PG", name: "Papua New Guinea" }, { code: "PY", name: "Paraguay" }, { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" }, { code: "PN", name: "Pitcairn" }, { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" }, { code: "PR", name: "Puerto Rico" }, { code: "QA", name: "Qatar" },
  { code: "RE", name: "Réunion" }, { code: "RO", name: "Romania" }, { code: "RU", name: "Russia" },
  { code: "RW", name: "Rwanda" }, { code: "BL", name: "Saint Barthélemy" }, { code: "SH", name: "Saint Helena" },
  { code: "KN", name: "Saint Kitts and Nevis" }, { code: "LC", name: "Saint Lucia" },
  { code: "MF", name: "Saint Martin (French)" }, { code: "PM", name: "Saint Pierre and Miquelon" },
  { code: "VC", name: "Saint Vincent and the Grenadines" }, { code: "WS", name: "Samoa" },
  { code: "SM", name: "San Marino" }, { code: "ST", name: "São Tomé and Príncipe" },
  { code: "SA", name: "Saudi Arabia" }, { code: "SN", name: "Senegal" }, { code: "RS", name: "Serbia" },
  { code: "SC", name: "Seychelles" }, { code: "SL", name: "Sierra Leone" }, { code: "SG", name: "Singapore" },
  { code: "SX", name: "Sint Maarten (Dutch)" }, { code: "SK", name: "Slovakia" }, { code: "SI", name: "Slovenia" },
  { code: "SB", name: "Solomon Islands" }, { code: "SO", name: "Somalia" }, { code: "ZA", name: "South Africa" },
  { code: "GS", name: "South Georgia and the South Sandwich Islands" }, { code: "SS", name: "South Sudan" },
  { code: "ES", name: "Spain" }, { code: "LK", name: "Sri Lanka" }, { code: "SD", name: "Sudan" },
  { code: "SR", name: "Suriname" }, { code: "SJ", name: "Svalbard and Jan Mayen" }, { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" }, { code: "SY", name: "Syria" }, { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" }, { code: "TZ", name: "Tanzania" }, { code: "TH", name: "Thailand" },
  { code: "TL", name: "Timor-Leste" }, { code: "TG", name: "Togo" }, { code: "TK", name: "Tokelau" },
  { code: "TO", name: "Tonga" }, { code: "TT", name: "Trinidad and Tobago" }, { code: "TN", name: "Tunisia" },
  { code: "TR", name: "Turkey" }, { code: "TM", name: "Turkmenistan" }, { code: "TC", name: "Turks and Caicos Islands" },
  { code: "TV", name: "Tuvalu" }, { code: "UG", name: "Uganda" }, { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" }, { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" }, { code: "UM", name: "United States Minor Outlying Islands" },
  { code: "UY", name: "Uruguay" }, { code: "UZ", name: "Uzbekistan" }, { code: "VU", name: "Vanuatu" },
  { code: "VE", name: "Venezuela" }, { code: "VN", name: "Vietnam" }, { code: "VG", name: "Virgin Islands (British)" },
  { code: "VI", name: "Virgin Islands (U.S.)" }, { code: "WF", name: "Wallis and Futuna" },
  { code: "EH", name: "Western Sahara" }, { code: "YE", name: "Yemen" }, { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
];

// Drawing Requests (salesman/backoffice requests a drawing from tecnico_commerciale)
export const drawingRequests = pgTable("drawing_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  offerId: integer("offer_id"),
  customerId: integer("customer_id").notNull(),
  requestedByUserId: integer("requested_by_user_id").notNull(),
  notes: text("notes").notNull().default(""),
  attachmentFilename: text("attachment_filename"),
  attachmentOriginalName: text("attachment_original_name"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  fulfilledAt: timestamp("fulfilled_at"),
});

export type DrawingRequest = typeof drawingRequests.$inferSelect;
export const insertDrawingRequestSchema = createInsertSchema(drawingRequests).omit({ id: true, createdAt: true });

// Drawings (technical drawings uploaded by tecnico_commerciale, optionally linked to an offer/request)
export const drawings = pgTable("drawings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  createdByUserId: integer("created_by_user_id").notNull(),
  customerId: integer("customer_id").notNull(),
  notes: text("notes").notNull().default(""),
  pdfFilename: text("pdf_filename"),
  pdfOriginalName: text("pdf_original_name"),
  dwgFilename: text("dwg_filename"),
  dwgOriginalName: text("dwg_original_name"),
  offerId: integer("offer_id"),
  requestId: integer("request_id"),
  // Optional link to a job order — used to maintain per-order drawing history
  // (versioning of the official drawing for a given commessa).
  jobOrderId: integer("job_order_id"),
  // When this drawing supersedes a previous one (same job order), points to the
  // previous "official" drawing's id. The previous drawing remains visible in
  // the UI but is marked as "versione precedente".
  replacesDrawingId: integer("replaces_drawing_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Drawing = typeof drawings.$inferSelect;
export const insertDrawingSchema = createInsertSchema(drawings).omit({ id: true, createdAt: true });

// Drawing Machines (extracted machine entries per drawing)
export const drawingMachines = pgTable("drawing_machines", {
  id: serial("id").primaryKey(),
  drawingId: integer("drawing_id").notNull(),
  positionLabel: text("position_label"),
  extractedText: text("extracted_text").notNull(),
  matchedMachineId: integer("matched_machine_id"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  verified: boolean("verified").notNull().default(false),
  notInCatalog: boolean("not_in_catalog").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DrawingMachine = typeof drawingMachines.$inferSelect;
export const insertDrawingMachineSchema = createInsertSchema(drawingMachines).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDrawingMachine = z.infer<typeof insertDrawingMachineSchema>;

// Google Drive archive — per-company connection settings + token storage
export const googleDriveSettings = pgTable("google_drive_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().unique(),
  rootFolderId: text("root_folder_id"),
  rootFolderUrl: text("root_folder_url"),
  rootFolderName: text("root_folder_name"),
  accountEmail: text("account_email"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  scopes: text("scopes"),
  connectedAt: timestamp("connected_at"),
  connectedByUserId: integer("connected_by_user_id"),
  lastErrorMessage: text("last_error_message"),
  lastErrorAt: timestamp("last_error_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type GoogleDriveSettings = typeof googleDriveSettings.$inferSelect;

// Tracks each file uploaded to Drive (offer PDF, drawing PDF/DWG, drawing-request attachments)
export const driveArchiveItems = pgTable("drive_archive_items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  kind: text("kind").notNull(), // 'offer_pdf' | 'drawing_pdf' | 'drawing_dwg' | 'drawing_request_attachment'
  offerId: integer("offer_id"),
  offerVersion: integer("offer_version"),
  localId: integer("local_id"),         // drawingId / drawingRequestId
  driveFileId: text("drive_file_id"),
  driveFileName: text("drive_file_name"),
  driveFolderId: text("drive_folder_id"),
  driveFolderUrl: text("drive_folder_url"),
  fileHash: text("file_hash"),
  status: text("status").notNull().default("queued"), // 'ok' | 'queued' | 'error'
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  lastSyncedAt: timestamp("last_synced_at"),
  nextRetryAt: timestamp("next_retry_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type DriveArchiveItem = typeof driveArchiveItems.$inferSelect;

// Composite Types for UI
export type MachineWithOptions = Machine & { options: MachineOption[] };
export type OfferItemWithDetails = OfferItem & { options: OfferItemOption[] };
export type OfferWithDetails = Offer & { items: OfferItemWithDetails[]; customer: Customer };

// =============================================================================
// TALENT MANAGEMENT (new domain — repurposed from machinery sales)
// =============================================================================

// Influencer / Creator anagraphic record
export const talents = pgTable("talents", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  displayName: text("display_name").notNull(),
  realName: text("real_name"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  city: text("city"),
  country: text("country"),
  email: text("email"),
  phone: text("phone"),
  defaultCommissionPct: decimal("default_commission_pct", { precision: 5, scale: 2 }).default("20"),
  tags: text("tags").array().default([]).notNull(),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type Talent = typeof talents.$inferSelect;
export const insertTalentSchema = createInsertSchema(talents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTalent = z.infer<typeof insertTalentSchema>;

// Social-platform metrics (manually entered for now)
export const TALENT_PLATFORMS = ["instagram", "tiktok", "youtube", "x"] as const;
export type TalentPlatform = typeof TALENT_PLATFORMS[number];

export const talentSocials = pgTable("talent_socials", {
  id: serial("id").primaryKey(),
  talentId: integer("talent_id").notNull(),
  platform: text("platform").notNull(),
  handle: text("handle").notNull(),
  profileUrl: text("profile_url"),
  followers: integer("followers").default(0),
  engagementPct: decimal("engagement_pct", { precision: 5, scale: 2 }),
  statsUpdatedAt: timestamp("stats_updated_at"),
});
export type TalentSocial = typeof talentSocials.$inferSelect;
export const insertTalentSocialSchema = createInsertSchema(talentSocials).omit({ id: true });
export type InsertTalentSocial = z.infer<typeof insertTalentSocialSchema>;

// Base rates per deliverable type
export const TALENT_DELIVERABLES = ["post", "reel", "story", "video", "event"] as const;
export type TalentDeliverable = typeof TALENT_DELIVERABLES[number];
export const TALENT_DELIVERABLE_LABELS: Record<TalentDeliverable, string> = {
  post: "Post",
  reel: "Reel",
  story: "Story",
  video: "Video",
  event: "Evento",
};

export const talentRates = pgTable("talent_rates", {
  id: serial("id").primaryKey(),
  talentId: integer("talent_id").notNull(),
  deliverableType: text("deliverable_type").notNull(),
  basePriceEur: decimal("base_price_eur", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
});
export type TalentRate = typeof talentRates.$inferSelect;
export const insertTalentRateSchema = createInsertSchema(talentRates).omit({ id: true });
export type InsertTalentRate = z.infer<typeof insertTalentRateSchema>;

// Documents (contracts, media kit, ID, ...)
export const talentDocuments = pgTable("talent_documents", {
  id: serial("id").primaryKey(),
  talentId: integer("talent_id").notNull(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type"),
  kind: text("kind"),
  label: text("label"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});
export type TalentDocument = typeof talentDocuments.$inferSelect;
export const insertTalentDocumentSchema = createInsertSchema(talentDocuments).omit({ id: true, uploadedAt: true });
export type InsertTalentDocument = z.infer<typeof insertTalentDocumentSchema>;

// Composite types for UI
export type TalentWithDetails = Talent & {
  socials: TalentSocial[];
  rates: TalentRate[];
  documents: TalentDocument[];
};

export type TalentListItem = Talent & {
  primarySocial: TalentSocial | null;
};

// =============================================================================
// PREVENTIVI E CAMPAGNE TALENT
// =============================================================================

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected"] as const;
export type QuoteStatus = typeof QUOTE_STATUSES[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Bozza",
  sent: "Inviato",
  accepted: "Accettato",
  rejected: "Rifiutato",
};

export const talentQuotes = pgTable("talent_quotes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  referenceNumber: text("reference_number").notNull(),
  brandCustomerId: integer("brand_customer_id").notNull(),
  brandContactId: integer("brand_contact_id"),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("draft"),
  date: timestamp("date").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
  acceptedAt: timestamp("accepted_at"),
  rejectedAt: timestamp("rejected_at"),
  validUntil: timestamp("valid_until"),
  paymentTerms: text("payment_terms"),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  campaignId: integer("campaign_id"),
  totalEur: decimal("total_eur", { precision: 12, scale: 2 }).notNull().default("0"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type TalentQuote = typeof talentQuotes.$inferSelect;
export const insertTalentQuoteSchema = createInsertSchema(talentQuotes).omit({
  id: true, createdAt: true, updatedAt: true, referenceNumber: true,
  sentAt: true, acceptedAt: true, rejectedAt: true, campaignId: true, totalEur: true,
});
export type InsertTalentQuote = z.infer<typeof insertTalentQuoteSchema>;

export const talentQuoteItems = pgTable("talent_quote_items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  quoteId: integer("quote_id").notNull(),
  talentId: integer("talent_id").notNull(),
  talentName: text("talent_name").notNull(),
  deliverableType: text("deliverable_type").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceEur: decimal("unit_price_eur", { precision: 12, scale: 2 }).notNull().default("0"),
  discountPct: decimal("discount_pct", { precision: 5, scale: 2 }).default("0"),
  notes: text("notes"),
  position: integer("position").notNull().default(0),
});
export type TalentQuoteItem = typeof talentQuoteItems.$inferSelect;
export const insertTalentQuoteItemSchema = createInsertSchema(talentQuoteItems).omit({ id: true });
export type InsertTalentQuoteItem = z.infer<typeof insertTalentQuoteItemSchema>;

export const CAMPAIGN_STATUSES = ["briefing", "production", "publishing", "closed"] as const;
export type CampaignStatus = typeof CAMPAIGN_STATUSES[number];
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  briefing: "In briefing",
  production: "In produzione",
  publishing: "In pubblicazione",
  closed: "Conclusa",
};

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  code: text("code").notNull(),
  brandCustomerId: integer("brand_customer_id").notNull(),
  brandContactId: integer("brand_contact_id"),
  quoteId: integer("quote_id"),
  name: text("name").notNull(),
  status: text("status").notNull().default("briefing"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  totalValueEur: decimal("total_value_eur", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type Campaign = typeof campaigns.$inferSelect;
export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true, createdAt: true, updatedAt: true, code: true,
});
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

export const DELIVERABLE_STATUSES = ["briefing", "draft_received", "approved", "published"] as const;
export type DeliverableStatus = typeof DELIVERABLE_STATUSES[number];
export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  briefing: "Briefing",
  draft_received: "Bozza ricevuta",
  approved: "Approvato",
  published: "Pubblicato",
};

export const campaignDeliverables = pgTable("campaign_deliverables", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  talentId: integer("talent_id").notNull(),
  talentName: text("talent_name").notNull(),
  deliverableType: text("deliverable_type").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceEur: decimal("unit_price_eur", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("briefing"),
  plannedDate: timestamp("planned_date"),
  publishedDate: timestamp("published_date"),
  postUrl: text("post_url"),
  notes: text("notes"),
  attachments: jsonb("attachments").$type<{ filename: string; originalName: string; mimeType?: string }[]>().default([]),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type CampaignDeliverable = typeof campaignDeliverables.$inferSelect;
export const insertCampaignDeliverableSchema = createInsertSchema(campaignDeliverables, {
  attachments: z.array(z.object({
    filename: z.string(),
    originalName: z.string(),
    mimeType: z.string().optional(),
  })).optional(),
}).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertCampaignDeliverable = z.infer<typeof insertCampaignDeliverableSchema>;

export const deliverableMetrics = pgTable("deliverable_metrics", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  deliverableId: integer("deliverable_id").notNull().unique(),
  views: integer("views").default(0),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  saves: integer("saves").default(0),
  reach: integer("reach").default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type DeliverableMetric = typeof deliverableMetrics.$inferSelect;
export const insertDeliverableMetricSchema = createInsertSchema(deliverableMetrics).omit({ id: true, updatedAt: true });
export type InsertDeliverableMetric = z.infer<typeof insertDeliverableMetricSchema>;

export const PAYMENT_IN_STATUSES = ["to_invoice", "invoiced", "paid"] as const;
export type PaymentInStatus = typeof PAYMENT_IN_STATUSES[number];
export const PAYMENT_IN_STATUS_LABELS: Record<PaymentInStatus, string> = {
  to_invoice: "Da fatturare",
  invoiced: "Fatturato",
  paid: "Pagato",
};

export const campaignPaymentsIn = pgTable("campaign_payments_in", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  amountEur: decimal("amount_eur", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("to_invoice"),
  dueDate: timestamp("due_date"),
  paidDate: timestamp("paid_date"),
  invoiceRef: text("invoice_ref"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type CampaignPaymentIn = typeof campaignPaymentsIn.$inferSelect;
export const insertCampaignPaymentInSchema = createInsertSchema(campaignPaymentsIn).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertCampaignPaymentIn = z.infer<typeof insertCampaignPaymentInSchema>;

export const PAYMENT_OUT_STATUSES = ["to_pay", "paid"] as const;
export type PaymentOutStatus = typeof PAYMENT_OUT_STATUSES[number];
export const PAYMENT_OUT_STATUS_LABELS: Record<PaymentOutStatus, string> = {
  to_pay: "Da pagare",
  paid: "Pagato",
};

export const campaignPaymentsOut = pgTable("campaign_payments_out", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  talentId: integer("talent_id").notNull(),
  amountEur: decimal("amount_eur", { precision: 12, scale: 2 }).notNull().default("0"),
  commissionPct: decimal("commission_pct", { precision: 5, scale: 2 }).default("0"),
  status: text("status").notNull().default("to_pay"),
  paidDate: timestamp("paid_date"),
  method: text("method"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type CampaignPaymentOut = typeof campaignPaymentsOut.$inferSelect;
export const insertCampaignPaymentOutSchema = createInsertSchema(campaignPaymentsOut).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertCampaignPaymentOut = z.infer<typeof insertCampaignPaymentOutSchema>;

// Aggregated views
export type TalentQuoteWithItems = TalentQuote & {
  items: TalentQuoteItem[];
  brandName?: string | null;
  brandContactName?: string | null;
  itemsCount?: number;
};

export type CampaignWithRelations = Campaign & {
  brandName?: string | null;
  brandContactName?: string | null;
  deliverables: (CampaignDeliverable & { metrics?: DeliverableMetric | null })[];
  paymentsIn: CampaignPaymentIn[];
  paymentsOut: CampaignPaymentOut[];
};
