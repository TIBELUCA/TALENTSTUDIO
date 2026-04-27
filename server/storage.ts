import { authStorage } from "./replit_integrations/auth/storage";
import {
  customerRepository,
  machineRepository,
  presetRepository,
  offerRepository,
  dealerRepository,
  userRepository,
  enquiryRepository,
  activityRepository,
  settingsRepository,
} from "./repositories";
import { DEFAULT_COMPANY_ID } from "./middlewares/company";

import type {
  User,
  Customer, InsertCustomer,
  Machine, InsertMachine,
  MachineOption, InsertMachineOption,
  MachineWithOptions,
  Preset, InsertPreset,
  Offer, InsertOffer,
  OfferWithDetails,
  DocumentFormatSettings,
  SalesmanUser, SalesmanLoginRecord,
  ActivityLog,
  DealerUser,
  EnquiryAttachment,
} from "@shared/schema";

export interface ActivityRecordParams {
  salesmanUserId?: number | null;
  dealerUserId?: number | null;
  performedBy: string;
  action: string;
  offerId?: number;
  offerReference?: string;
}

export interface SalesmanCreateData {
  email: string;
  name: string;
  surname: string;
  mobileNumber?: string;
  password: string;
  features: Record<string, boolean>;
  isMasterSalesman?: boolean;
}

export interface SalesmanUpdateData {
  email?: string;
  name?: string;
  surname?: string;
  mobileNumber?: string;
  password?: string;
  features?: Record<string, boolean>;
  isActive?: boolean;
  isMasterSalesman?: boolean;
}

export interface DealerCreateData {
  email: string;
  name: string;
  surname: string;
  mobileNumber?: string;
  password: string;
  linkedSalesmanId?: number | null;
}

export interface DealerUpdateData {
  email?: string;
  name?: string;
  surname?: string;
  mobileNumber?: string;
  password?: string;
  isActive?: boolean;
  linkedSalesmanId?: number | null;
}

export interface OfferItemData {
  machineId: number;
  quantity: number;
  optionIds: number[];
  customBasePrice?: number;
  customOptionPrices?: Record<number, number>;
  optionQuantities?: Record<number, number>;
}

export interface OfferUpdateData {
  customerId: number;
  subject: string;
  salesmanName: string;
  salesmanEmail?: string | null;
  salesmanMobile?: string | null;
  totalPrice: number;
  projectData?: Record<string, unknown>;
}

export interface AttachmentCreateData {
  enquiryId: number;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
}

export interface MediaImportInfo {
  filename: string;
  importedAt: string;
  machines: number;
  options: number;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: { id: string; email?: string; firstName?: string; lastName?: string; profileImageUrl?: string }): Promise<User>;

  getCustomers(): Promise<Customer[]>;
  getDealerCustomers(dealerId: number): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer>;
  deleteCustomer(id: number): Promise<void>;

  getMachines(): Promise<MachineWithOptions[]>;
  getMachine(id: number): Promise<MachineWithOptions | undefined>;
  createMachine(machine: InsertMachine): Promise<Machine>;
  updateMachine(id: number, machine: Partial<InsertMachine>): Promise<Machine>;
  deleteMachine(id: number): Promise<void>;
  createMachineOption(option: InsertMachineOption): Promise<MachineOption>;
  updateMachineOption(id: number, option: Partial<InsertMachineOption>): Promise<MachineOption>;
  deleteMachineOption(id: number): Promise<void>;
  importMachines(rows: Parameters<typeof machineRepository.importMachines>[0]): Promise<{ machinesCreated: number; optionsCreated: number; optionsSkipped: number; skippedCodes: string[] }>;

  getPresets(): Promise<Preset[]>;
  createPreset(preset: InsertPreset): Promise<Preset>;
  updatePreset(id: number, preset: Partial<InsertPreset>): Promise<Preset>;
  deletePreset(id: number): Promise<void>;

  getSalesmanUsers(): Promise<(SalesmanUser & { loginCount: number; lastLogin: Date | null })[]>;
  getSalesmanById(id: number): Promise<SalesmanUser | undefined>;
  getSalesmanByEmail(email: string): Promise<SalesmanUser | undefined>;
  createSalesmanUser(data: SalesmanCreateData): Promise<SalesmanUser>;
  updateSalesmanUser(id: number, data: SalesmanUpdateData): Promise<SalesmanUser>;
  deleteSalesmanUser(id: number): Promise<void>;
  recordSalesmanLogin(salesmanUserId: number, deviceInfo?: string, ipAddress?: string): Promise<void>;
  getSalesmanLoginHistory(salesmanUserId: number): Promise<SalesmanLoginRecord[]>;

  getOffers(salesmanUserId?: number | null): Promise<(Offer & { customer: Customer })[]>;
  getBinOffers(salesmanUserId?: number | null): Promise<(Offer & { customer: Customer })[]>;
  getOffer(id: number): Promise<OfferWithDetails | undefined>;
  createOffer(offer: InsertOffer & { salesmanEmail?: string | null; salesmanMobile?: string | null }, items: OfferItemData[]): Promise<Offer>;
  deleteOffer(id: number): Promise<void>;
  restoreOffer(id: number): Promise<void>;
  updateOfferStatus(id: number, status: string): Promise<Offer>;
  createOfferVersion(originalOfferId: number): Promise<Offer>;
  updateOffer(id: number, offerData: OfferUpdateData, itemsData: OfferItemData[]): Promise<Offer>;
  generateReferenceNumber(): Promise<string>;
  linkOfferToEnquiry(offerId: number, enquiryId: number): Promise<void>;

  getDocumentFormat(): Promise<DocumentFormatSettings>;
  saveDocumentFormat(settings: DocumentFormatSettings): Promise<void>;
  getMediaImportInfo(): Promise<MediaImportInfo | null>;
  saveMediaImportInfo(info: MediaImportInfo): Promise<void>;

  getDealers(): Promise<(DealerUser & { salesmanName?: string })[]>;
  getDealerById(id: number): Promise<DealerUser | undefined>;
  getDealerByEmail(email: string): Promise<DealerUser | undefined>;
  createDealer(data: DealerCreateData): Promise<DealerUser>;
  updateDealer(id: number, data: DealerUpdateData): Promise<DealerUser>;
  deleteDealer(id: number): Promise<void>;
  recordDealerLogin(dealerId: number): Promise<void>;

  getEnquiries(salesmanId?: number | null): Promise<ReturnType<typeof enquiryRepository.getAll> extends Promise<infer T> ? T : never>;
  getDealerEnquiries(dealerId: number): Promise<ReturnType<typeof enquiryRepository.getByDealerId> extends Promise<infer T> ? T : never>;
  getEnquiryAttachments(enquiryId: number): Promise<EnquiryAttachment[]>;
  addEnquiryAttachment(data: AttachmentCreateData): Promise<EnquiryAttachment>;
  deleteEnquiryAttachment(id: number): Promise<EnquiryAttachment | undefined>;

  recordActivity(params: ActivityRecordParams): Promise<void>;
  getActivityLogs(salesmanUserId: number): Promise<ActivityLog[]>;
  getAllActivityLogs(): Promise<ActivityLog[]>;
}

class StorageFacade implements IStorage {
  getUser = authStorage.getUser.bind(authStorage);
  upsertUser = authStorage.upsertUser.bind(authStorage);

  getCustomers = () => customerRepository.getAll(DEFAULT_COMPANY_ID);
  getDealerCustomers = (dealerId: number) => customerRepository.getByDealerId(dealerId);
  getCustomer = (id: number) => customerRepository.getById(id);
  createCustomer = (customer: InsertCustomer) => customerRepository.create(customer);
  updateCustomer = (id: number, customer: Partial<InsertCustomer>) => customerRepository.update(id, customer);
  deleteCustomer = (id: number) => customerRepository.delete(id);

  getMachines = () => machineRepository.getAll(DEFAULT_COMPANY_ID);
  getMachine = (id: number) => machineRepository.getById(id);
  createMachine = (machine: InsertMachine) => machineRepository.create(machine);
  updateMachine = (id: number, machine: Partial<InsertMachine>) => machineRepository.update(id, machine);
  deleteMachine = (id: number) => machineRepository.delete(id);
  createMachineOption = (option: InsertMachineOption) => machineRepository.createOption(option);
  updateMachineOption = (id: number, option: Partial<InsertMachineOption>) => machineRepository.updateOption(id, option);
  deleteMachineOption = (id: number) => machineRepository.deleteOption(id);
  importMachines = (rows: Parameters<typeof machineRepository.importMachines>[0]) => machineRepository.importMachines(rows, DEFAULT_COMPANY_ID);

  getPresets = () => presetRepository.getAll(DEFAULT_COMPANY_ID);
  createPreset = (preset: InsertPreset) => presetRepository.create(preset);
  updatePreset = (id: number, preset: Partial<InsertPreset>) => presetRepository.update(id, preset);
  deletePreset = (id: number) => presetRepository.delete(id);

  getSalesmanUsers = () => userRepository.getAll(DEFAULT_COMPANY_ID);
  getSalesmanById = (id: number) => userRepository.getById(id);
  getSalesmanByEmail = (email: string) => userRepository.getByEmail(email);
  createSalesmanUser = (data: SalesmanCreateData) => userRepository.create(DEFAULT_COMPANY_ID, data);
  updateSalesmanUser = (id: number, data: SalesmanUpdateData) => userRepository.update(id, data);
  deleteSalesmanUser = (id: number) => userRepository.delete(id);
  recordSalesmanLogin = (salesmanUserId: number, deviceInfo?: string, ipAddress?: string) => userRepository.recordLogin(salesmanUserId, deviceInfo, ipAddress);
  getSalesmanLoginHistory = (salesmanUserId: number) => userRepository.getLoginHistory(salesmanUserId);

  getOffers = (salesmanUserId?: number | null) => offerRepository.getAll(DEFAULT_COMPANY_ID, salesmanUserId);
  getBinOffers = (salesmanUserId?: number | null) => offerRepository.getBin(DEFAULT_COMPANY_ID, salesmanUserId);
  getOffer = (id: number) => offerRepository.getById(id);
  createOffer = (offer: InsertOffer & { salesmanEmail?: string | null; salesmanMobile?: string | null }, items: OfferItemData[]) => offerRepository.create(DEFAULT_COMPANY_ID, offer, items);
  deleteOffer = (id: number) => offerRepository.softDelete(id);
  restoreOffer = (id: number) => offerRepository.restore(id);
  updateOfferStatus = (id: number, status: string) => offerRepository.updateStatus(id, status);
  createOfferVersion = (originalOfferId: number) => offerRepository.createVersion(originalOfferId);
  updateOffer = (id: number, offerData: OfferUpdateData, itemsData: OfferItemData[]) => offerRepository.update(id, offerData, itemsData);
  generateReferenceNumber = () => offerRepository.generateReferenceNumber();
  linkOfferToEnquiry = (offerId: number, enquiryId: number) => offerRepository.linkToEnquiry(offerId, enquiryId);

  getDocumentFormat = () => settingsRepository.getDocumentFormat(DEFAULT_COMPANY_ID);
  saveDocumentFormat = (settings: DocumentFormatSettings) => settingsRepository.saveDocumentFormat(DEFAULT_COMPANY_ID, settings);
  getMediaImportInfo = () => settingsRepository.getMediaImportInfo();
  saveMediaImportInfo = (info: MediaImportInfo) => settingsRepository.saveMediaImportInfo(info);

  getDealers = () => dealerRepository.getAll(DEFAULT_COMPANY_ID);
  getDealerById = (id: number) => dealerRepository.getById(id);
  getDealerByEmail = (email: string) => dealerRepository.getByEmail(email);
  createDealer = (data: DealerCreateData) => dealerRepository.create(DEFAULT_COMPANY_ID, data);
  updateDealer = (id: number, data: DealerUpdateData) => dealerRepository.update(id, data);
  deleteDealer = (id: number) => dealerRepository.delete(id);
  recordDealerLogin = (dealerId: number) => dealerRepository.recordLogin(dealerId);

  getEnquiries = (salesmanId?: number | null) => enquiryRepository.getAll(DEFAULT_COMPANY_ID, salesmanId);
  getDealerEnquiries = (dealerId: number) => enquiryRepository.getByDealerId(DEFAULT_COMPANY_ID, dealerId);
  getEnquiryAttachments = (enquiryId: number) => enquiryRepository.getAttachments(enquiryId);
  addEnquiryAttachment = (data: AttachmentCreateData) => enquiryRepository.addAttachment(data);
  deleteEnquiryAttachment = (id: number) => enquiryRepository.deleteAttachment(id);

  recordActivity = (params: ActivityRecordParams) => activityRepository.record(params);
  getActivityLogs = (salesmanUserId: number) => activityRepository.getBySalesmanId(salesmanUserId);
  getAllActivityLogs = () => activityRepository.getAll(DEFAULT_COMPANY_ID);
}

export const storage = new StorageFacade();
