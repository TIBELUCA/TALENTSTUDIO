export interface CustomOption {
  tempId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface LineDiscount {
  /** Override percent applied to this line. `null` means "use global discount". */
  discountOverridePercent: number | null;
  /** When true the line is excluded from any discount (gross == net). */
  isNet: boolean;
}

export interface CartItem {
  tempId: string;
  machineId: number;
  quantity: number;
  selectedOptionIds: number[];
  optionQuantities: Record<number, number>;
  basePrice: number;
  optionPrices: Record<number, number>;
  comment: string;
  optionComments: Record<number, string>;
  optionPriceHidden: Record<number, boolean>;
  /** Per-line discount config for the machine (applies to base + hidden options). */
  discountOverridePercent: number | null;
  isNet: boolean;
  /** Per-visible-option discount config keyed by option id. */
  optionDiscounts: Record<number, LineDiscount>;
  snapshotMachineName?: string;
  snapshotMachineDescription?: string;
  snapshotOptionNames?: Record<number, string>;
  isCustom?: boolean;
  customOptions?: CustomOption[];
  customMainImage?: string;
  customDetailImages?: string[];
}

export interface TechnicalSpecs {
  minMaxLength: string;
  maxWidth: string;
  minMaxThickness: string;
  averageLineSpeed: string;
  controlSide: string;
  maxBow: string;
  paint: string;
  substrate: string;
  finishing: string;
  standardVoltage: string;
  standardColors: string;
  components: string;
  precautions: string;
  airIntake: string;
  commissioning: string;
}

export interface ExtraItem {
  id: string;
  description: string;
  price: number;
  /** Per-line discount config. Optional for back-compat with old saved offers. */
  discountOverridePercent?: number | null;
  isNet?: boolean;
}

export interface ServiceItems {
  travelCosts: boolean;
  travelCostsDailyFee: number;
  travelCostsDays: number;
  travelFlightTicket: number;
  boardLodging: boolean;
  boardLodgingDailyFee: number;
  trainingDays: string;
  trainingIncluded: boolean;
  packaging: boolean;
  transportPrice: number;
  transportIncluded: boolean;
}

export interface InstallationConfig {
  dailyFee: number;
  travelDays: number;
  mechanicalDays: number;
  electricalDays: number;
  testingDays: number;
  installTrainingDays: number;
  totalDays: number;
  totalPrice: number;
  included: boolean;
  hideDailyFee: boolean;
  hideTotalDays: boolean;
  hideTotalPrice: boolean;
  hideBreakdownTravel: boolean;
  hideBreakdownMechanical: boolean;
  hideBreakdownElectrical: boolean;
  hideBreakdownTesting: boolean;
  hideBreakdownTraining: boolean;
}

export interface PriceComments {
  interlocking: string;
  installation: string;
  travel: string;
  boardLodging: string;
  training: string;
  packaging: string;
  transport: string;
  extras: Record<string, string>;
}

export interface PriceLabels {
  interlocking: string;
  totalListPrice: string;
  installation: string;
  travelCosts: string;
  boardLodging: string;
  training: string;
  packaging: string;
  transport: string;
  grossTotal: string;
  netTotal: string;
}

export interface WizardStep {
  id: string;
  label: string;
  intro: string;
  sectionLabels: Record<string, string>;
  readOnly?: boolean;
}

export interface OfferItemOption {
  id: number;
  machineOptionId: number;
  snapshotOptionName: string;
  snapshotPriceModifier: string;
  quantity: number;
}

export interface OfferItem {
  id: number;
  machineId: number;
  position: number;
  quantity: number;
  snapshotMachineName: string;
  snapshotBasePrice: string;
  options: OfferItemOption[];
}

export type OfferRole = "salesman" | "dealer";
export type OfferMode = "create" | "edit";
