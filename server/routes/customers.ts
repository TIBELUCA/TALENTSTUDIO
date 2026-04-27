import { Router } from "express";
import { customerRepository, contactRepository, userRepository, dealerRepository, activityRepository } from "../repositories";
import { api } from "@shared/routes";
import { requireSalesRole, requireSalesmanOrMaster, getPerformedBy, getBackofficeParentId, getBackofficeParentIds, isBackoffice } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { validate, customerCreateSchema, customerUpdateSchema, contactCreateSchema, contactUpdateSchema, facilityCreateSchema, facilityUpdateSchema } from "../validators";
import { dispatchWebhookEvent } from "../services";
import { geocodeSingleCustomerOnSave, geocodeMissingCustomers } from "../services/geocoding";
import { AppError } from "../errors";
import multer from "multer";
import ExcelJS from "exceljs";
import { db, isNotNull, eq, and, inArray } from "../repositories/base";
import { machines, productionFacilities, customers, contacts, offers as offersTable, type InsertCustomer, type InsertContact, type Contact } from "@shared/schema";

type RichTextRun = { text: string };
type RichTextCell = { richText: RichTextRun[] };
type HyperlinkCell = { text: string; hyperlink: string };
type FormulaCell = { result?: unknown };

function isRichText(v: unknown): v is RichTextCell {
  return typeof v === "object" && v !== null && Array.isArray((v as { richText?: unknown }).richText);
}
function isHyperlink(v: unknown): v is HyperlinkCell {
  return typeof v === "object" && v !== null
    && typeof (v as { text?: unknown }).text === "string"
    && "hyperlink" in (v as object);
}
function hasFormulaResult(v: unknown): v is FormulaCell {
  return typeof v === "object" && v !== null && "result" in (v as object);
}
function hasTextProp(v: unknown): v is { text: string } {
  return typeof v === "object" && v !== null && typeof (v as { text?: unknown }).text === "string";
}

function wsToAoA(ws: ExcelJS.Worksheet): unknown[][] {
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = row.values as unknown[];
    const arr: unknown[] = [];
    for (let i = 1; i < vals.length; i++) {
      const v = vals[i];
      if (isRichText(v)) {
        arr.push(v.richText.map(rt => rt.text).join(""));
      } else if (isHyperlink(v)) {
        arr.push(v.text);
      } else {
        arr.push(v ?? null);
      }
    }
    rows.push(arr);
  });
  return rows;
}

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

async function enforceBackofficeCustomerAccess(req: any, customerId: number): Promise<void> {
  const parentIds = getBackofficeParentIds(req);
  if (parentIds.length === 0) return;
  const customer = await customerRepository.getById(customerId);
  if (!customer || (customer as any).salesmanId == null || !parentIds.includes((customer as any).salesmanId)) {
    throw AppError.forbidden("Access denied: customer not linked to your salesman");
  }
}

router.get(api.customers.list.path, requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  let result = await customerRepository.getAll(req.companyId);
  const backofficeParents = getBackofficeParentIds(req);
  if (backofficeParents.length > 0) {
    result = result.filter((c: any) => c.salesmanId != null && backofficeParents.includes(c.salesmanId));
  }
  res.json(result);
}));

router.get("/api/customers/export", requireSalesRole, asyncHandler(async (req, res) => {
  let all = await customerRepository.getAll(req.companyId);
  const backofficeParentExport = getBackofficeParentIds(req);
  if (backofficeParentExport.length > 0) {
    all = all.filter((c: any) => c.salesmanId != null && backofficeParentExport.includes(c.salesmanId));
  }
  const users = await userRepository.getAll(req.companyId);
  const dealerCompanies = await dealerRepository.getAllCompanies(req.companyId);
  const salesmanMap = new Map(users.map(u => [u.id, u.name]));
  const dealerMap = new Map(dealerCompanies.map(d => [d.id, d.companyName]));

  const header = [
    "Company Name", "Customer Code", "Account Status", "Structure", "Related Account",
    "Language", "Type", "Description", "Email", "Contact Person",
    "Address", "Postal Code", "City", "Country", "Region", "Province",
    "Office Phone", "Fax", "PEC", "Website", "Fiscal Code", "VAT Number",
    "Public Admin Code", "Insolved", "Company Entity",
    "Dealer", "Salesman",
    "Customer Category", "Material Type", "Industry",
    "Size", "Sales", "ABC Analysis", "Group ABC Analysis",
    "Machine Family", "Conversion Date", "Directory ID", "Notes",
    "Created At", "Created By", "Updated At", "Updated By",
  ];
  const data = all.map(c => [
    c.name, c.customerCode || "", c.accountStatus || "", c.structure || "", c.relatedAccount || "",
    c.language || "", c.type || "", c.description || "", c.email || "", c.contactPerson || "",
    c.address || "", c.postalCode || "", c.city || "", c.country || "", c.region || "", c.province || "",
    c.officePhone || "", c.fax || "", c.pec || "", c.webSite || "", c.fiscalCode || "", c.vatNumber || "",
    c.publicAdminCode || "", c.insolved || "", c.company || "",
    (c.dealerId ? dealerMap.get(c.dealerId) : "") || "", (c.salesmanId ? salesmanMap.get(c.salesmanId) : "") || "",
    (c.customerCategory || []).join(", "), (c.materialType || []).join(", "), (c.industry || []).join(", "),
    c.size || "", c.sales || "", c.abcAnalysis || "", c.groupAbcAnalysis || "",
    c.machineFamily || "", c.conversionDate || "", c.directoryId || "", c.notes || "",
    c.createdAt ? new Date(c.createdAt).toISOString() : "", c.createdBy || "",
    c.updatedAt ? new Date(c.updatedAt).toISOString() : "", c.updatedBy || "",
  ]);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Companies");
  ws.addRow(header);
  for (const row of data) ws.addRow(row as ExcelJS.CellValue[]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="companies_export.xlsx"`);
  res.send(buf);
}));

router.post("/api/customers/:id/merge", requireSalesRole, asyncHandler(async (req, res) => {
  const sourceId = Number(req.params.id);
  await enforceBackofficeCustomerAccess(req, sourceId);
  if (!Number.isInteger(sourceId) || sourceId <= 0) throw new AppError(400, "Invalid source ID");
  const { targetId } = req.body;
  if (!targetId || typeof targetId !== "number" || !Number.isInteger(targetId) || targetId <= 0) throw new AppError(400, "targetId must be a positive integer");
  if (sourceId === targetId) throw new AppError(400, "Cannot merge a record into itself");
  await enforceBackofficeCustomerAccess(req, targetId);

  const source = await customerRepository.getById(sourceId);
  if (!source || source.companyId !== req.companyId) throw new AppError(404, "Source company not found");
  if (source.mergedIntoId) throw new AppError(400, "Source company is already merged");
  if (!source.dealerId) throw new AppError(400, "Only dealer-created records can be merged into internal records");

  const target = await customerRepository.getById(targetId);
  if (!target || target.companyId !== req.companyId) throw new AppError(404, "Target company not found");
  if (target.mergedIntoId) throw new AppError(400, "Target company is already merged into another record");
  if (target.dealerId) throw new AppError(400, "Target must be an internal CRM record (not dealer-created)");

  const performedBy = await getPerformedBy(req);
  const result = await customerRepository.mergeInto(sourceId, targetId, req.companyId, performedBy);

  dispatchWebhookEvent("customer.merged", {
    sourceId, targetId,
    sourceName: source.name,
    targetName: target.name,
    ...result,
  });

  res.json({
    message: `"${source.name}" merged into "${target.name}"`,
    sourceId,
    targetId,
    ...result,
  });
}));

router.get("/api/customers/:id", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const customerId = Number(req.params.id);
  await enforceBackofficeCustomerAccess(req, customerId);
  const customer = await customerRepository.getById(customerId);
  if (!customer || customer.companyId !== req.companyId) {
    throw new AppError(404, "Company not found");
  }
  res.json(customer);
}));

router.post(api.customers.create.path, requireSalesRole, validate(customerCreateSchema), asyncHandler(async (req, res) => {
  const userName = await getPerformedBy(req);
  const parentId = getBackofficeParentId(req);
  const body = parentId ? { ...req.body, salesmanId: parentId } : req.body;
  const customer = await customerRepository.create({ ...body, companyId: req.companyId, createdBy: userName, updatedBy: userName });
  dispatchWebhookEvent("customer.created", { customerId: customer.id, name: customer.name });
  geocodeSingleCustomerOnSave(customer.id);
  res.status(201).json(customer);
}));

router.put(api.customers.update.path, requireSalesRole, validate(customerUpdateSchema), asyncHandler(async (req, res) => {
  const customerId = Number(req.params.id);
  await enforceBackofficeCustomerAccess(req, customerId);
  const userName = await getPerformedBy(req);
  const addressFields = ["address", "city", "postalCode", "country", "province", "region"];
  const addressChanged = addressFields.some(f => req.body[f] !== undefined);
  const customer = await customerRepository.update(customerId, { ...req.body, updatedBy: userName });
  if (addressChanged) {
    geocodeSingleCustomerOnSave(customer.id);
  }
  dispatchWebhookEvent("customer.updated", { customerId: customer.id, name: customer.name });
  res.json(customer);
}));

router.delete(api.customers.delete.path, requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeCustomerAccess(req, id);
  await customerRepository.delete(id);
  dispatchWebhookEvent("customer.deleted", { customerId: id });
  res.status(204).end();
}));

router.get("/api/pending-validations", requireSalesRole, asyncHandler(async (req, res) => {
  const pendingStatuses = ["Pending Validation", "Pending Deletion"];
  let pendingCustomers: any[] = await db.select().from(customers).where(
    and(eq(customers.companyId, req.companyId), inArray(customers.accountStatus, pendingStatuses))
  );
  const backofficeParentPending = getBackofficeParentIds(req);
  if (backofficeParentPending.length > 0) {
    pendingCustomers = pendingCustomers.filter((c: any) => c.salesmanId != null && backofficeParentPending.includes(c.salesmanId));
  }
  const pendingContacts = await db.select().from(contacts).where(
    inArray(contacts.contactStatus, pendingStatuses)
  );
  const validPendingContacts = [];
  for (const c of pendingContacts) {
    const cust = await customerRepository.getById(c.customerId);
    if (cust && cust.companyId === req.companyId) {
      if (backofficeParentPending.length > 0 && (cust as any).salesmanId != null && !backofficeParentPending.includes((cust as any).salesmanId)) continue;
      validPendingContacts.push(c);
    }
  }
  res.json({ customers: pendingCustomers, contacts: validPendingContacts });
}));

router.post("/api/customers/:id/validate", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await enforceBackofficeCustomerAccess(req, id);
  const { action } = req.body;
  if (!action || !["approve", "reject"].includes(action)) throw new AppError(400, "action must be 'approve' or 'reject'");
  const customer = await customerRepository.getById(id);
  if (!customer || customer.companyId !== req.companyId) throw AppError.notFound("Company");
  const status = customer.accountStatus;
  if (status !== "Pending Validation" && status !== "Pending Deletion") throw new AppError(400, "Company has no pending action");
  const performedBy = await getPerformedBy(req);
  if (status === "Pending Deletion") {
    if (action === "approve") {
      await customerRepository.delete(id);
      await activityRepository.record({ performedBy, action: "company_deletion_approved", offerId: id, offerReference: customer.name });
      res.json({ deleted: true });
    } else {
      const updated = await customerRepository.update(id, { accountStatus: "Active", updatedBy: performedBy });
      await activityRepository.record({ performedBy, action: "company_deletion_rejected", offerId: id, offerReference: customer.name });
      res.json(updated);
    }
  } else {
    if (action === "approve") {
      const updated = await customerRepository.update(id, { accountStatus: "Active", updatedBy: performedBy });
      await activityRepository.record({ performedBy, action: "company_validated", offerId: id, offerReference: customer.name });
      res.json(updated);
    } else {
      await customerRepository.delete(id);
      await activityRepository.record({ performedBy, action: "company_rejected", offerId: id, offerReference: customer.name });
      res.json({ deleted: true });
    }
  }
}));

router.post("/api/contacts/:id/validate", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { action } = req.body;
  if (!action || !["approve", "reject"].includes(action)) throw new AppError(400, "action must be 'approve' or 'reject'");
  const contact = await contactRepository.getById(id);
  if (!contact) throw AppError.notFound("Contact");
  if (contact.customerId) await enforceBackofficeCustomerAccess(req, contact.customerId);
  const customer = await customerRepository.getById(contact.customerId);
  if (!customer || customer.companyId !== req.companyId) throw AppError.notFound("Contact");
  const status = contact.contactStatus;
  if (status !== "Pending Validation" && status !== "Pending Deletion") throw new AppError(400, "Contact has no pending action");
  const performedBy = await getPerformedBy(req);
  if (status === "Pending Deletion") {
    if (action === "approve") {
      await contactRepository.delete(id);
      await activityRepository.record({ performedBy, action: "contact_deletion_approved", offerId: id, offerReference: `${contact.firstName} ${contact.lastName}`.trim() });
      res.json({ deleted: true });
    } else {
      const updated = await contactRepository.update(id, { contactStatus: "Active" });
      await activityRepository.record({ performedBy, action: "contact_deletion_rejected", offerId: id, offerReference: `${contact.firstName} ${contact.lastName}`.trim() });
      res.json(updated);
    }
  } else {
    if (action === "approve") {
      const updated = await contactRepository.update(id, { contactStatus: "Active" });
      await activityRepository.record({ performedBy, action: "contact_validated", offerId: id, offerReference: `${contact.firstName} ${contact.lastName}`.trim() });
      res.json(updated);
    } else {
      await contactRepository.delete(id);
      await activityRepository.record({ performedBy, action: "contact_rejected", offerId: id, offerReference: `${contact.firstName} ${contact.lastName}`.trim() });
      res.json({ deleted: true });
    }
  }
}));

router.post("/api/customers/import", requireSalesRole, upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  const userName = await getPerformedBy(req);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer);
  const sheet = workbook.worksheets[0];
  const rows: unknown[][] = wsToAoA(sheet);

  const existing = await customerRepository.getAll(req.companyId);
  const existingKeys = new Set(
    existing.map(c => (c.name ?? "").trim().toLowerCase())
  );

  let added = 0;
  let skipped = 0;

  const COMPANY_HEADERS = ["company name", "company", "name", "company / customer name"];

  for (const row of rows) {
    const name = String(row[0] ?? "").trim();
    if (!name) { skipped++; continue; }
    if (COMPANY_HEADERS.includes(name.toLowerCase())) continue;

    const key = name.toLowerCase();
    if (existingKeys.has(key)) { skipped++; continue; }

    const email = String(row[1] ?? "").trim() || undefined;
    const contactPerson = String(row[2] ?? "").trim() || undefined;
    const address = String(row[3] ?? "").trim() || undefined;
    const country = String(row[4] ?? "").trim() || undefined;
    const city = String(row[5] ?? "").trim() || undefined;
    const machineFamily = String(row[6] ?? "").trim() || undefined;
    const notes = String(row[7] ?? "").trim() || undefined;

    const importParent = getBackofficeParentId(req);
    const ownerSalesmanId = importParent ?? (isMaster(req) ? null : (req.session.salesmanId ?? null));
    await customerRepository.create({
      name, email, contactPerson, address, country, city, machineFamily, notes,
      companyId: req.companyId, createdBy: userName, updatedBy: userName,
      ...(ownerSalesmanId ? { salesmanId: ownerSalesmanId } : {}),
    });
    existingKeys.add(key);
    added++;
  }

  if (added > 0) {
    geocodeMissingCustomers(req.companyId!).catch(e =>
      console.error("[geocoding] Batch geocoding after import failed:", e)
    );
  }

  res.json({ added, skipped });
}));

router.get("/api/machine-families", requireSalesRole, asyncHandler(async (_req, res) => {
  const rows = await db.selectDistinct({ macroType: machines.macroType }).from(machines).where(isNotNull(machines.macroType));
  const families = rows.map(r => r.macroType).filter(Boolean).sort();
  res.json(families);
}));

router.get("/api/contacts", requireSalesRole, asyncHandler(async (req, res) => {
  const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
  if (customerId) {
    await enforceBackofficeCustomerAccess(req, customerId);
    const company = await customerRepository.getById(customerId);
    if (!company || company.companyId !== req.companyId) {
      throw new AppError(404, "Company not found");
    }
    const list = await contactRepository.getByCustomerId(customerId);
    return res.json(list);
  }
  let list = await contactRepository.getAllByCompanyId(req.companyId);
  const backofficeParentContacts = getBackofficeParentIds(req);
  if (backofficeParentContacts.length > 0) {
    const parentCustomers = (await customerRepository.getAll(req.companyId)).filter((c: any) => c.salesmanId != null && backofficeParentContacts.includes(c.salesmanId));
    const parentCustomerIds = new Set(parentCustomers.map(c => c.id));
    list = list.filter((c: any) => parentCustomerIds.has(c.customerId));
  }
  res.json(list);
}));

router.get("/api/contacts/export", requireSalesRole, asyncHandler(async (req, res) => {
  let allContacts = await contactRepository.getAllByCompanyId(req.companyId);
  const allCompanies = await customerRepository.getAll(req.companyId);
  const backofficeParentContactExport = getBackofficeParentIds(req);
  if (backofficeParentContactExport.length > 0) {
    const parentCustomerIds = new Set(allCompanies.filter((c: any) => c.salesmanId != null && backofficeParentContactExport.includes(c.salesmanId)).map(c => c.id));
    allContacts = allContacts.filter((c: any) => parentCustomerIds.has(c.customerId));
  }
  const users = await userRepository.getAll(req.companyId);
  const companyMap = new Map(allCompanies.map(c => [c.id, c.name]));
  const salesmanMap = new Map(users.map(u => [u.id, u.name]));

  const header = [
    "Last Name", "First Name", "Account (Company)", "Contact Role", "Contact Status",
    "Email", "Mobile", "Office Phone", "Fax", "Phone",
    "Date of Birth", "Language", "Description",
    "Address", "Postal Code", "City", "Country", "Region", "District",
    "Company Entity", "Salesman",
    "Source of Contact", "Exhibition Year", "Exhibition Name",
    "Area of Interest", "Area of Interest Description",
    "Newsletter Block", "Commercial", "Expiring Date Sales",
    "Newsletter", "Unsubscribe Date",
    "Profiling", "Expiring Date Profiling", "Privacy Acknowledged", "Anonymized",
    "Last Call", "Next Recall", "Tipo", "N. Marketing",
    "Conversion Date", "Is External Record", "Role", "Notes",
    "Created At", "Created By", "Updated At", "Updated By",
  ];
  const data = allContacts.map(c => [
    c.lastName, c.firstName, companyMap.get(c.customerId) || "",
    (c.contactRole || []).join(", "), c.contactStatus || "",
    c.email || "", c.mobile || "", c.officePhone || "", c.fax || "", c.phone || "",
    c.dateOfBirth || "", c.language || "", c.description || "",
    c.address || "", c.postalCode || "", c.city || "", c.country || "", c.region || "", c.district || "",
    c.company || "", (c.salesmanId ? salesmanMap.get(c.salesmanId) : "") || "",
    c.sourceOfContact || "", c.exhibitionYear || "", c.exhibitionName || "",
    c.areaOfInterest || "", c.areaOfInterestDescription || "",
    c.newsletterBlock || "", c.commercial || "", c.expiringDateSales || "",
    c.newsletter || "", c.unsubscribeDate || "",
    c.profiling || "", c.expiringDateProfiling || "", c.privacyAcknowledged || "", c.anonymized || "",
    c.lastCall || "", c.nextRecall || "", c.tipo || "", c.nMarketing || "",
    c.conversionDate || "", c.isExternalRecord || "", c.role || "", c.notes || "",
    c.createdAt ? new Date(c.createdAt).toISOString() : "", c.createdBy || "",
    c.updatedAt ? new Date(c.updatedAt).toISOString() : "", c.updatedBy || "",
  ]);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Contacts");
  ws.addRow(header);
  for (const row of data) ws.addRow(row as ExcelJS.CellValue[]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="contacts_export.xlsx"`);
  res.send(buf);
}));

// --- helpers for contacts import ---

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if (hasTextProp(v)) return v.text;
    if (hasFormulaResult(v) && v.result != null) return String(v.result);
    return "";
  }
  return String(v);
}
function cellToTrimmed(v: unknown): string { return cellToString(v).trim(); }
function cellToOpt(v: unknown): string | undefined { const s = cellToTrimmed(v); return s === "" ? undefined : s; }
function normalizeHeader(h: string): string {
  return h.toLowerCase()
    .replace(/\u200b/g, "")
    .replace(/\s+/g, " ")
    .replace(/[`'"]/g, "")
    .trim();
}

const ZENCRM_HEADER_ALIASES: Record<string, string[]> = {
  externalId: ["id"],
  lastName: ["surname", "last name", "lastname"],
  firstName: ["name", "first name", "firstname"],
  account: ["account", "company name", "company / customer name"],
  contactRole: ["contact role", "role"],
  contactStatus: ["contact status"],
  email: ["email", "e-mail"],
  mobile: ["mobile"],
  fax: ["fax"],
  officePhone: ["office phone", "phone"],
  dateOfBirth: ["date of birth"],
  language: ["language"],
  newsletterBlock: ["newsletter block"],
  description: ["description"],
  commercial: ["commercial"],
  expiringDateSales: ["expiring date for sales purpose processing", "expiring date sales"],
  newsletter: ["newsletter"],
  unsubscribeDate: ["unsubscribe date"],
  profiling: ["profiling"],
  expiringDateProfiling: ["expiring date for profiling purpose processing", "expiring date profiling"],
  privacyAcknowledged: ["company's privacy policy acknowledged", "privacy acknowledged", "companys privacy policy acknowledged"],
  anonymized: ["anonymized"],
  address: ["address"],
  city: ["city"],
  postalCode: ["postal code", "postcode", "zip"],
  country: ["country"],
  region: ["region"],
  district: ["district"],
  company: ["company"],
  assignedTo: ["assigned to"],
  sourceOfContact: ["source of the contact", "source of contact"],
  exhibitionYear: ["anno fiera", "exhibition year"],
  exhibitionName: ["fiera", "exhibition name"],
  areaOfInterest: ["area of interest", "area of  interest"],
  areaOfInterestDescription: ["area of interest - description", "area of  interest - description"],
  createdBy: ["created by"],
  modifiedBy: ["modified by"],
  lastCall: ["last call"],
  nextRecall: ["next recall"],
  tipo: ["tipo"],
  nMarketing: ["n. marketing", "n marketing"],
  conversionDate: ["conversion date"],
  isExternalRecord: ["isexternalrecord", "is external record"],
};

function buildHeaderMap(headerRow: unknown[]): Record<string, number> {
  const found: Record<string, number> = {};
  const norm = headerRow.map(h => normalizeHeader(cellToString(h)));
  for (const [field, aliases] of Object.entries(ZENCRM_HEADER_ALIASES)) {
    for (const alias of aliases) {
      const idx = norm.indexOf(alias);
      if (idx >= 0) { found[field] = idx; break; }
    }
  }
  return found;
}

function isLikelyHeaderRow(headerMap: Record<string, number>): boolean {
  // Need at least lastName + firstName + account to consider it a zencrm header.
  return headerMap.lastName !== undefined && headerMap.firstName !== undefined && headerMap.account !== undefined;
}

router.post("/api/contacts/import", requireSalesRole, upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  const userName = await getPerformedBy(req);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer);
  const sheet = workbook.worksheets[0];
  const rows: unknown[][] = wsToAoA(sheet);
  if (rows.length === 0) return res.json({ created: 0, updated: 0, companiesCreated: 0, skipped: 0, reasons: {}, unmatchedAssignees: [] });

  // Try header-based zencrm format first
  const headerMap = buildHeaderMap(rows[0]);
  const isHeader = isLikelyHeaderRow(headerMap);

  let allCompanies = await customerRepository.getAll(req.companyId);
  const backofficeParents = getBackofficeParentIds(req);
  const backofficeParent = backofficeParents.length > 0 ? backofficeParents[0] : null;
  if (backofficeParents.length > 0) {
    allCompanies = allCompanies.filter((c: any) => c.salesmanId != null && backofficeParents.includes(c.salesmanId));
  }
  const companyByName = new Map<string, number>(
    allCompanies.map(c => [c.name.trim().toLowerCase(), c.id])
  );

  const allUsers = await userRepository.getAll(req.companyId);
  const userByName = new Map<string, number>();
  for (const u of allUsers) {
    if (u.name) userByName.set(u.name.trim().toLowerCase(), u.id);
  }

  let externalIdMap = new Map<string, any>();
  if (isHeader) {
    externalIdMap = await contactRepository.getByCompanyExternalIdMap(req.companyId);
  }

  let created = 0;
  let updated = 0;
  let companiesCreated = 0;
  let skipped = 0;
  const reasons = { noName: 0, noAccount: 0, headerSkipped: 0, error: 0 };
  const unmatchedAssignees = new Set<string>();
  const companiesCreatedNames: string[] = [];

  const dataRows = isHeader ? rows.slice(1) : rows;

  for (const row of dataRows) {
    try {
      let firstName: string;
      let lastName: string;
      let companyName: string;
      let externalId: string | undefined;
      let payload: Partial<InsertContact> & { role?: string } = {};
      let companyGeo: Record<string, string | null | undefined> = {};
      let assignedToName: string | undefined;
      let createdByOverride: string | undefined;
      let modifiedByOverride: string | undefined;
      let contactRoleVal: string | undefined;

      if (isHeader) {
        const get = (field: string) => {
          const idx = headerMap[field];
          return idx === undefined ? undefined : row[idx];
        };
        externalId = cellToOpt(get("externalId"));
        lastName = cellToTrimmed(get("lastName"));
        firstName = cellToTrimmed(get("firstName"));
        // In header (zencrm) mode require both name fields. Skip rather than
        // overwriting existing values with placeholders on re-import.
        if (!firstName || !lastName) { skipped++; reasons.noName++; continue; }
        companyName = cellToTrimmed(get("account"));
        contactRoleVal = cellToOpt(get("contactRole"));
        assignedToName = cellToOpt(get("assignedTo"));
        createdByOverride = cellToOpt(get("createdBy"));
        modifiedByOverride = cellToOpt(get("modifiedBy"));
        payload = {
          contactStatus: cellToOpt(get("contactStatus")),
          email: cellToOpt(get("email")),
          mobile: cellToOpt(get("mobile")),
          fax: cellToOpt(get("fax")),
          officePhone: cellToOpt(get("officePhone")),
          dateOfBirth: cellToOpt(get("dateOfBirth")),
          language: cellToOpt(get("language")),
          newsletterBlock: cellToOpt(get("newsletterBlock")),
          description: cellToOpt(get("description")),
          commercial: cellToOpt(get("commercial")),
          expiringDateSales: cellToOpt(get("expiringDateSales")),
          newsletter: cellToOpt(get("newsletter")),
          unsubscribeDate: cellToOpt(get("unsubscribeDate")),
          profiling: cellToOpt(get("profiling")),
          expiringDateProfiling: cellToOpt(get("expiringDateProfiling")),
          privacyAcknowledged: cellToOpt(get("privacyAcknowledged")),
          anonymized: cellToOpt(get("anonymized")),
          address: cellToOpt(get("address")),
          city: cellToOpt(get("city")),
          postalCode: cellToOpt(get("postalCode")),
          country: cellToOpt(get("country")),
          region: cellToOpt(get("region")),
          district: cellToOpt(get("district")),
          company: cellToOpt(get("company")),
          sourceOfContact: cellToOpt(get("sourceOfContact")),
          exhibitionYear: cellToOpt(get("exhibitionYear")),
          exhibitionName: cellToOpt(get("exhibitionName")),
          areaOfInterest: cellToOpt(get("areaOfInterest")),
          areaOfInterestDescription: cellToOpt(get("areaOfInterestDescription")),
          lastCall: cellToOpt(get("lastCall")),
          nextRecall: cellToOpt(get("nextRecall")),
          tipo: cellToOpt(get("tipo")),
          nMarketing: cellToOpt(get("nMarketing")),
          conversionDate: cellToOpt(get("conversionDate")),
          isExternalRecord: cellToOpt(get("isExternalRecord")),
        };
        companyGeo = {
          address: payload.address,
          city: payload.city,
          postalCode: payload.postalCode,
          country: payload.country,
          region: payload.region,
          // zencrm "District" maps to the customer's `province` column
          province: payload.district,
        };
      } else {
        // Legacy 10-column positional fallback (skip header row of legacy format)
        firstName = cellToTrimmed(row[0]);
        lastName = cellToTrimmed(row[1]);
        if (firstName.toLowerCase() === "first name" && lastName.toLowerCase() === "last name") {
          reasons.headerSkipped++;
          continue;
        }
        if (!firstName && !lastName) { skipped++; reasons.noName++; continue; }
        if (!firstName) firstName = "—";
        if (!lastName) lastName = "—";
        companyName = cellToTrimmed(row[2]);
        payload = {
          email: cellToOpt(row[3]),
          phone: cellToOpt(row[4]),
          sourceOfContact: cellToOpt(row[6]),
          exhibitionName: cellToOpt(row[7]),
          exhibitionYear: cellToOpt(row[8]),
          notes: cellToOpt(row[9]),
        };
        const roleStr = cellToOpt(row[5]);
        if (roleStr) payload.role = roleStr;
      }

      if (!companyName) { skipped++; reasons.noAccount++; continue; }

      // Resolve or create company
      let customerId = companyByName.get(companyName.toLowerCase());
      if (!customerId) {
        const companyPayload: InsertCustomer = {
          name: companyName,
          companyId: req.companyId,
          createdBy: userName,
          updatedBy: userName,
          ...(backofficeParent ? { salesmanId: backofficeParent } : {}),
          ...(companyGeo.address ? { address: companyGeo.address } : {}),
          ...(companyGeo.city ? { city: companyGeo.city } : {}),
          ...(companyGeo.postalCode ? { postalCode: companyGeo.postalCode } : {}),
          ...(companyGeo.country ? { country: companyGeo.country } : {}),
          ...(companyGeo.region ? { region: companyGeo.region } : {}),
          ...(companyGeo.province ? { province: companyGeo.province } : {}),
        };
        const newCompany = await customerRepository.create(companyPayload);
        customerId = newCompany.id;
        companyByName.set(companyName.toLowerCase(), customerId);
        companiesCreated++;
        companiesCreatedNames.push(companyName);
      }

      // Resolve assignee → salesmanId (header mode only).
      // - matched name → sid
      // - explicit but unmatched → null (clears existing salesman, reported)
      // - blank in source → undefined (do not touch existing value)
      let salesmanId: number | null | undefined;
      if (assignedToName) {
        const sid = userByName.get(assignedToName.toLowerCase());
        if (sid) {
          salesmanId = sid;
        } else {
          salesmanId = null;
          unmatchedAssignees.add(assignedToName);
        }
      }

      // contactRole as array
      const contactRoleArr = contactRoleVal
        ? contactRoleVal.split(/[,;]/).map(s => s.trim()).filter(Boolean)
        : undefined;

      const baseFields: Partial<InsertContact> = {
        firstName,
        lastName,
        customerId,
        ...(payload as Partial<InsertContact>),
      };
      if (contactRoleArr && contactRoleArr.length) baseFields.contactRole = contactRoleArr;
      if (externalId) baseFields.externalId = externalId;
      // The `role` field belongs to the legacy positional payload only; not in InsertContact
      if ("role" in payload) delete (payload as { role?: string }).role;

      // Strip undefined keys so updates don't blank fields the user didn't supply.
      // Important: `null` (e.g. from explicit unmatched assignee) is preserved.
      for (const k of Object.keys(baseFields) as (keyof InsertContact)[]) {
        if (baseFields[k] === undefined) delete baseFields[k];
      }
      // Apply assignee resolution last so `null` (clear) is preserved through stripping.
      if (salesmanId !== undefined) baseFields.salesmanId = salesmanId;

      const existing: Contact | undefined = externalId ? externalIdMap.get(externalId) : undefined;
      if (existing) {
        // Backoffice authz: only allow updating contacts whose company is in
        // the backoffice user's scope (matched via the companyByName map above).
        if (backofficeParents.length > 0) {
          const allowedCustomerIds = new Set(allCompanies.map(c => c.id));
          if (existing.customerId && !allowedCustomerIds.has(existing.customerId)) {
            skipped++;
            reasons.error++;
            continue;
          }
        }
        await contactRepository.update(existing.id, {
          ...baseFields,
          updatedBy: modifiedByOverride || userName,
        });
        updated++;
      } else {
        const createPayload: InsertContact = {
          ...baseFields,
          firstName,
          lastName,
          customerId: customerId!,
          createdBy: createdByOverride || userName,
          updatedBy: modifiedByOverride || userName,
        };
        const createdContact = await contactRepository.create(createPayload);
        created++;
        if (externalId) externalIdMap.set(externalId, createdContact);
      }
    } catch (e: any) {
      console.error("[contacts/import] row error:", e?.message || e);
      reasons.error++;
      skipped++;
    }
  }

  res.json({
    created,
    updated,
    companiesCreated,
    skipped,
    reasons,
    unmatchedAssignees: Array.from(unmatchedAssignees),
    companiesCreatedNames,
    // Legacy field for older clients
    added: created,
    unmatchedCompanies: [],
  });
}));

router.get("/api/contacts/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const contact = await contactRepository.getByIdAndCompany(Number(req.params.id), req.companyId);
  if (!contact) throw new AppError(404, "Contact not found");
  if (contact.customerId) await enforceBackofficeCustomerAccess(req, contact.customerId);
  res.json(contact);
}));

router.post("/api/contacts", requireSalesRole, validate(contactCreateSchema), asyncHandler(async (req, res) => {
  await enforceBackofficeCustomerAccess(req, req.body.customerId);
  const company = await customerRepository.getById(req.body.customerId);
  if (!company || company.companyId !== req.companyId) {
    throw new AppError(400, "Invalid company reference");
  }
  const userName = await getPerformedBy(req);
  const contact = await contactRepository.create({ ...req.body, createdBy: userName, updatedBy: userName });
  res.status(201).json(contact);
}));

router.put("/api/contacts/:id", requireSalesRole, validate(contactUpdateSchema), asyncHandler(async (req, res) => {
  const existing = await contactRepository.getByIdAndCompany(Number(req.params.id), req.companyId);
  if (!existing) throw new AppError(404, "Contact not found");
  if (existing.customerId) await enforceBackofficeCustomerAccess(req, existing.customerId);
  if (req.body.customerId && req.body.customerId !== existing.customerId) {
    await enforceBackofficeCustomerAccess(req, req.body.customerId);
    const company = await customerRepository.getById(req.body.customerId);
    if (!company || company.companyId !== req.companyId) {
      throw new AppError(400, "Invalid company reference");
    }
  }
  const userName = await getPerformedBy(req);
  const contact = await contactRepository.update(Number(req.params.id), { ...req.body, updatedBy: userName });
  res.json(contact);
}));

router.delete("/api/contacts/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const existing = await contactRepository.getByIdAndCompany(Number(req.params.id), req.companyId);
  if (!existing) throw new AppError(404, "Contact not found");
  if (existing.customerId) await enforceBackofficeCustomerAccess(req, existing.customerId);
  await contactRepository.delete(Number(req.params.id));
  res.status(204).end();
}));

router.get("/api/customers/:customerId/offers", requireSalesRole, asyncHandler(async (req, res) => {
  const custId = Number(req.params.customerId);
  await enforceBackofficeCustomerAccess(req, custId);
  const customer = await customerRepository.getById(custId);
  if (!customer || customer.companyId !== req.companyId) throw new AppError(404, "Customer not found");
  const customerOffers = await db.select().from(offersTable)
    .where(and(eq(offersTable.customerId, custId), eq(offersTable.companyId, req.companyId)));
  res.json(customerOffers);
}));

// Production Facilities
router.get("/api/customers/:customerId/facilities", requireSalesRole, asyncHandler(async (req, res) => {
  const customerId = Number(req.params.customerId);
  await enforceBackofficeCustomerAccess(req, customerId);
  const customer = await customerRepository.getById(customerId);
  if (!customer || customer.companyId !== req.companyId) throw new AppError(404, "Customer not found");
  const facilities = await db.select().from(productionFacilities).where(eq(productionFacilities.customerId, customerId));
  res.json(facilities);
}));

router.post("/api/customers/:customerId/facilities", requireSalesRole, validate(facilityCreateSchema), asyncHandler(async (req, res) => {
  const customerId = Number(req.params.customerId);
  await enforceBackofficeCustomerAccess(req, customerId);
  const customer = await customerRepository.getById(customerId);
  if (!customer || customer.companyId !== req.companyId) throw new AppError(404, "Customer not found");
  const userName = await getPerformedBy(req);
  const { name, address, postalCode, city, country, region, province, phone, email, notes } = req.body;
  const [facility] = await db.insert(productionFacilities).values({
    customerId, name, address, postalCode, city, country, region, province, phone, email, notes,
    createdBy: userName, updatedBy: userName,
  }).returning();
  res.status(201).json(facility);
}));

router.put("/api/facilities/:id", requireSalesRole, validate(facilityUpdateSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(productionFacilities).where(eq(productionFacilities.id, id));
  if (!existing) throw new AppError(404, "Facility not found");
  await enforceBackofficeCustomerAccess(req, existing.customerId);
  const customer = await customerRepository.getById(existing.customerId);
  if (!customer || customer.companyId !== req.companyId) throw new AppError(404, "Facility not found");
  const userName = await getPerformedBy(req);
  const { name, address, postalCode, city, country, region, province, phone, email, notes } = req.body;
  const [updated] = await db.update(productionFacilities).set({
    name, address, postalCode, city, country, region, province, phone, email, notes,
    updatedBy: userName, updatedAt: new Date(),
  }).where(eq(productionFacilities.id, id)).returning();
  res.json(updated);
}));

router.delete("/api/facilities/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(productionFacilities).where(eq(productionFacilities.id, id));
  if (!existing) throw new AppError(404, "Facility not found");
  await enforceBackofficeCustomerAccess(req, existing.customerId);
  const customer = await customerRepository.getById(existing.customerId);
  if (!customer || customer.companyId !== req.companyId) throw new AppError(404, "Facility not found");
  await db.delete(productionFacilities).where(eq(productionFacilities.id, id));
  res.status(204).end();
}));

export default router;
