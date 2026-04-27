import { z } from "zod";
import { USER_ROLES } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";

export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map(i => ({
        field: i.path.join("."),
        message: i.message,
      }));
      return res.status(400).json({ message: "Validation error", code: "VALIDATION_ERROR", errors });
    }
    req.body = result.data;
    next();
  };
}

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const userCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  surname: z.string().optional().default(""),
  mobileNumber: z.string().optional().default(""),
  password: z.string().min(4).optional(),
  features: z.record(z.boolean()).optional(),
  isMasterSalesman: z.boolean().optional().default(false),
  role: z.enum(USER_ROLES).optional().default("talent"),
  parentSalesmanIds: z.array(z.number().int().positive()).nullable().optional().default([]),
  assignedCountries: z.array(z.string()).nullable().optional().default(null),
});

export const userUpdateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  surname: z.string().optional(),
  mobileNumber: z.string().optional(),
  password: z.string().min(4).optional(),
  isActive: z.boolean().optional(),
  features: z.record(z.boolean()).optional(),
  isMasterSalesman: z.boolean().optional(),
  role: z.enum(USER_ROLES).optional(),
  parentSalesmanIds: z.array(z.number().int().positive()).nullable().optional(),
  assignedCountries: z.array(z.string()).nullable().optional(),
});

const optStr = z.string().optional().default("");
const optStrNull = z.string().nullable().optional().default(null);
const optStrArr = z.array(z.string()).optional().default([]);

export const customerCreateSchema = z.object({
  name: z.string().min(1),
  customerCode: optStr,
  accountStatus: optStr,
  structure: optStr,
  relatedAccount: optStr,
  language: optStr,
  type: optStr,
  description: optStr,
  email: optStr,
  contactPerson: optStr,
  address: optStr,
  postalCode: optStr,
  city: optStr,
  country: optStr,
  region: optStr,
  province: optStr,
  officePhone: optStr,
  fax: optStr,
  pec: optStr,
  webSite: optStr,
  fiscalCode: optStr,
  vatNumber: optStr,
  publicAdminCode: optStr,
  insolved: optStr,
  company: optStr,
  dealerId: z.number().nullable().optional().default(null),
  salesmanId: z.number().nullable().optional().default(null),
  customerCategory: optStrArr,
  materialType: optStrArr,
  industry: optStrArr,
  size: optStr,
  sales: optStr,
  abcAnalysis: optStr,
  groupAbcAnalysis: optStr,
  machineFamily: optStr,
  notes: optStr,
  conversionDate: optStr,
  directoryId: optStr,
});

export const customerUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  customerCode: z.string().optional(),
  accountStatus: z.string().optional(),
  structure: z.string().optional(),
  relatedAccount: z.string().optional(),
  language: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  email: z.string().optional(),
  contactPerson: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  province: z.string().optional(),
  officePhone: z.string().optional(),
  fax: z.string().optional(),
  pec: z.string().optional(),
  webSite: z.string().optional(),
  fiscalCode: z.string().optional(),
  vatNumber: z.string().optional(),
  publicAdminCode: z.string().optional(),
  insolved: z.string().optional(),
  company: z.string().optional(),
  dealerId: z.number().nullable().optional(),
  salesmanId: z.number().nullable().optional(),
  customerCategory: z.array(z.string()).optional(),
  materialType: z.array(z.string()).optional(),
  industry: z.array(z.string()).optional(),
  size: z.string().optional(),
  sales: z.string().optional(),
  abcAnalysis: z.string().optional(),
  groupAbcAnalysis: z.string().optional(),
  machineFamily: z.string().optional(),
  notes: z.string().optional(),
  conversionDate: z.string().optional(),
  directoryId: z.string().optional(),
});

export const contactCreateSchema = z.object({
  customerId: z.number().int().positive(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  contactRole: optStrArr,
  contactStatus: optStr,
  email: optStr,
  mobile: optStr,
  fax: optStr,
  officePhone: optStr,
  dateOfBirth: optStr,
  language: optStr,
  newsletterBlock: optStr,
  description: optStr,
  commercial: optStr,
  expiringDateSales: optStr,
  newsletter: optStr,
  unsubscribeDate: optStr,
  profiling: optStr,
  expiringDateProfiling: optStr,
  privacyAcknowledged: optStr,
  anonymized: optStr,
  address: optStr,
  city: optStr,
  postalCode: optStr,
  country: optStr,
  region: optStr,
  district: optStr,
  company: optStr,
  salesmanId: z.number().nullable().optional().default(null),
  sourceOfContact: optStr,
  exhibitionYear: optStr,
  exhibitionName: optStr,
  areaOfInterest: optStr,
  areaOfInterestDescription: optStr,
  lastCall: optStr,
  nextRecall: optStr,
  tipo: optStr,
  nMarketing: optStr,
  conversionDate: optStr,
  isExternalRecord: optStr,
  phone: optStr,
  role: optStr,
  notes: optStr,
});

export const contactUpdateSchema = z.object({
  customerId: z.number().int().positive().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  contactRole: z.array(z.string()).optional(),
  contactStatus: z.string().optional(),
  email: z.string().optional(),
  mobile: z.string().optional(),
  fax: z.string().optional(),
  officePhone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  language: z.string().optional(),
  newsletterBlock: z.string().optional(),
  description: z.string().optional(),
  commercial: z.string().optional(),
  expiringDateSales: z.string().optional(),
  newsletter: z.string().optional(),
  unsubscribeDate: z.string().optional(),
  profiling: z.string().optional(),
  expiringDateProfiling: z.string().optional(),
  privacyAcknowledged: z.string().optional(),
  anonymized: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  district: z.string().optional(),
  company: z.string().optional(),
  salesmanId: z.number().nullable().optional(),
  sourceOfContact: z.string().optional(),
  exhibitionYear: z.string().optional(),
  exhibitionName: z.string().optional(),
  areaOfInterest: z.string().optional(),
  areaOfInterestDescription: z.string().optional(),
  lastCall: z.string().optional(),
  nextRecall: z.string().optional(),
  tipo: z.string().optional(),
  nMarketing: z.string().optional(),
  conversionDate: z.string().optional(),
  isExternalRecord: z.string().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  notes: z.string().optional(),
});

export const machineCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  basePrice: z.union([z.string(), z.number()]).optional().default("0"),
  machineCode: z.string().optional(),
  macroType: z.string().optional(),
  imageUrl: z.string().optional(),
  seqNum: z.number().optional(),
  electricalPower: z.union([z.string(), z.number()]).nullable().optional(),
  compressedAir: z.union([z.string(), z.number()]).nullable().optional(),
  exhaustedAir: z.union([z.string(), z.number()]).nullable().optional(),
  airIntroduced: z.union([z.string(), z.number()]).nullable().optional(),
  installationDays: z.union([z.string(), z.number()]).nullable().optional(),
  youtubeLinks: z.array(z.string().url()).nullable().optional(),
  catalogLinks: z.array(z.object({ label: z.string(), url: z.string().url() })).nullable().optional(),
  driveLinks: z.array(z.object({ label: z.string(), url: z.string().url() })).nullable().optional(),
});

export const machineUpdateSchema = machineCreateSchema.partial();

export const machineOptionCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceModifier: z.union([z.string(), z.number()]).optional().default("0"),
  seqNum: z.number().optional(),
  machineId: z.number().optional(),
  electricalPower: z.union([z.string(), z.number()]).nullable().optional(),
  compressedAir: z.union([z.string(), z.number()]).nullable().optional(),
  exhaustedAir: z.union([z.string(), z.number()]).nullable().optional(),
  airIntroduced: z.union([z.string(), z.number()]).nullable().optional(),
});

export const machineOptionUpdateSchema = machineOptionCreateSchema.partial();

export const dealerCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  surname: z.string().optional().default(""),
  mobileNumber: z.string().optional().default(""),
  password: z.string().min(4),
  linkedSalesmanId: z.number().nullable().optional().default(null),
});

export const dealerUpdateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  surname: z.string().optional(),
  mobileNumber: z.string().optional(),
  password: z.string().min(4).optional(),
  isActive: z.boolean().optional(),
  linkedSalesmanId: z.number().nullable().optional(),
});

export const dealerCompanyCreateSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  address: z.string().optional().default(""),
  vatNumber: z.string().optional().default(""),
  state: z.string().optional().default(""),
  city: z.string().optional().default(""),
  postalCode: z.string().optional().default(""),
  email: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  linkedSalesmanId: z.number().nullable().optional().default(null),
  assignedCountries: z.array(z.string()).nullable().optional().default(null),
});

export const dealerCompanyUpdateSchema = z.object({
  companyName: z.string().min(1).optional(),
  address: z.string().optional(),
  vatNumber: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  linkedSalesmanId: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
  docFooterLines: z.array(z.string()).nullable().optional(),
  docTermsText: z.string().nullable().optional(),
  assignedCountries: z.array(z.string()).nullable().optional(),
});

export const dealerContactCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1, "First name is required"),
  surname: z.string().optional().default(""),
  mobileNumber: z.string().optional().default(""),
  password: z.string().min(4, "Password must be at least 4 characters"),
  role: z.string().optional().default(""),
});

export const dealerContactUpdateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  surname: z.string().optional(),
  mobileNumber: z.string().optional(),
  password: z.string().min(4).optional(),
  role: z.string().optional(),
  isActive: z.boolean().optional(),
});

const ALLOWED_LANG_KEYS = ["it", "en", "de", "fr", "es", "pt"] as const;
const langKeySchema = z.enum(ALLOWED_LANG_KEYS);

const translationEntrySchema = z.object({
  title: z.string(),
  content: z.string(),
});

const translationsSchema = z.record(langKeySchema, translationEntrySchema).optional().nullable();

export const presetCreateSchema = z.object({
  type: z.string().optional().default("general"),
  title: z.string().min(1),
  content: z.string().optional().default(""),
  translations: translationsSchema,
});

export const presetUpdateSchema = z.object({
  type: z.string().optional(),
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  translations: translationsSchema,
});

export const offerStatusSchema = z.object({
  status: z.string().min(1, "Status required"),
});

export const revisionRequestSchema = z.object({
  notes: z.string().min(1, "Revision notes are required"),
});

export const facilityCreateSchema = z.object({
  name: z.string().min(1, "Facility name is required").transform(s => s.trim()),
  address: optStr,
  postalCode: optStr,
  city: optStr,
  country: optStr,
  region: optStr,
  province: optStr,
  phone: optStr,
  email: optStr,
  notes: optStr,
});

export const facilityUpdateSchema = facilityCreateSchema;

export const dealerCustomerCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  customerCode: z.string().optional(),
  accountStatus: z.string().optional(),
  structure: z.string().optional(),
  relatedAccount: z.string().optional(),
  language: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  contactPerson: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  province: z.string().optional(),
  officePhone: z.string().optional(),
  fax: z.string().optional(),
  pec: z.string().optional(),
  webSite: z.string().optional(),
  fiscalCode: z.string().optional(),
  vatNumber: z.string().optional(),
  publicAdminCode: z.string().optional(),
  insolved: z.string().optional(),
  company: z.string().optional(),
  customerCategory: z.array(z.string()).optional(),
  materialType: z.array(z.string()).optional(),
  industry: z.array(z.string()).optional(),
  size: z.string().optional(),
  sales: z.string().optional(),
  abcAnalysis: z.string().optional(),
  groupAbcAnalysis: z.string().optional(),
  conversionDate: z.string().optional(),
  directoryId: z.string().optional(),
  machineFamily: z.string().optional(),
  notes: z.string().optional(),
});
