import type { ServiceItems, TechnicalSpecs, PriceLabels, PriceComments, InstallationConfig } from "@/types/offer";

export const DEFAULT_PRICE_LABELS: PriceLabels = {
  interlocking:    "Interlocking",
  totalListPrice:  "TOTAL LIST PRICE (ex works, installation excluded)",
  installation:    "Installation and start-up",
  travelCosts:     "Travel and flight costs",
  boardLodging:    "Board and lodging",
  training:        "Training",
  packaging:       "Packaging",
  transport:       "Transport",
  grossTotal:      "Gross Total",
  netTotal:        "NET TOTAL",
};

export const defaultServiceItems: ServiceItems = {
  travelCosts: false,
  travelCostsDailyFee: 120,
  travelCostsDays: 0,
  travelFlightTicket: 0,
  boardLodging: false,
  boardLodgingDailyFee: 0,
  trainingDays: "1",
  trainingIncluded: false,
  packaging: false,
  transportPrice: 0,
  transportIncluded: false,
};

export const defaultTechnicalSpecs: TechnicalSpecs = {
  minMaxLength: "",
  maxWidth: "",
  minMaxThickness: "",
  averageLineSpeed: "",
  controlSide: "",
  maxBow: "10 mm",
  paint: "",
  substrate: "",
  finishing: "",
  standardVoltage: "Working tension 400V/50 Hz. Commands 24V. Max. allowed oscillation +/- 5%",
  standardColors: "Light Grey RAL 7035",
  components: "Prices are based on the use of our standard mechanical (Bonfiglioli), electrical and electronic (Schneider Telemecanique) components. Requests for other manufactures equipment to be supplied instead of our standard components can be evaluated for performance, reliability and any extra costs that may be incurred",
  precautions: "Do not place near the machine substances which may cause danger of inflammability. User must foresee an adequate technical ventilation in the working environment in order to prevent any risk of inflammability. User must verify that the zone in which the machine or installation will be positioned is right for the purpose.",
  airIntake: "Air intake is always considered with environmental temperature above +4 °C; in case of air intake from the outside of the work environment or temperatures below +4 °C, the user will have to foresee motorized shutters or request additional antifreeze systems, so as to prevent damage to the installation",
  commissioning: "For single machines shipped when already assembled, commissioning and start-up are carried out at our premises. For disassembled machines or groups of machines, start-up will be carried out after commissioning."
};

export const defaultInstallationConfig: InstallationConfig = {
  dailyFee: 850,
  travelDays: 2,
  mechanicalDays: 0,
  electricalDays: 0,
  testingDays: 0,
  installTrainingDays: 0,
  totalDays: 2,
  totalPrice: 1700,
  included: false,
  hideDailyFee: false,
  hideTotalDays: false,
  hideTotalPrice: false,
  hideBreakdownTravel: true,
  hideBreakdownMechanical: true,
  hideBreakdownElectrical: true,
  hideBreakdownTesting: true,
  hideBreakdownTraining: true,
};

export const defaultPriceComments: PriceComments = {
  interlocking: '',
  installation: '',
  travel: '',
  boardLodging: '',
  training: '',
  packaging: '',
  transport: '',
  extras: {},
};

export const SECTION_TO_STEP: Record<string, { id: string; defaultLabel: string; alwaysShow?: boolean }> = {
  metadata:         { id: "customer",    defaultLabel: "Customer Details",        alwaysShow: true },
  offer_title:      { id: "subject",     defaultLabel: "Project Data",            alwaysShow: true },
  technical_specs:  { id: "specs",       defaultLabel: "Technical Specifications" },
  machine_line:     { id: "composition", defaultLabel: "Machines and Options",    alwaysShow: true },
  price_overview:   { id: "pricing",     defaultLabel: "Price Overview" },
  terms_conditions: { id: "terms",       defaultLabel: "Terms & Conditions" },
};

export const DETAILS_STEP = { id: "details", label: "Date & Parties", intro: "", sectionLabels: {} as Record<string,string> };

export const SECTION_LABELS: Record<string, string> = {
  metadata: "Customer Details",
  offer_title: "Offer Title",
  technical_specs: "Technical Specifications",
  machine_line: "Machines and Options",
  utilities_summary: "Utilities Summary",
  price_overview: "Price Overview",
  terms_conditions: "Terms & Conditions",
};
