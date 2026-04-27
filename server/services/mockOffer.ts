import { machineRepository } from "../repositories";
import { DEFAULT_COMPANY_ID } from "../middlewares/company";

const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";

const FAKE_CUSTOMERS = [
  { name: "Arredamenti Rossi S.r.l.", contactPerson: "Marco Rossi", email: "m.rossi@arredamentirossi.it", address: "Via Milano 42, 20100 Milano, Italy" },
  { name: "WoodTech GmbH", contactPerson: "Hans Weber", email: "h.weber@woodtech.de", address: "Industriestr. 15, 80331 Munich, Germany" },
  { name: "Panelcraft Industries Ltd", contactPerson: "James Clarke", email: "j.clarke@panelcraft.co.uk", address: "12 Factory Road, Birmingham B15, UK" },
];

const FAKE_SALESMEN = [
  { name: "Giovanni Bianchi", email: "g.bianchi@example.com", mobile: "+39 335 1234567" },
  { name: "Luca Ferretti", email: "l.ferretti@example.com", mobile: "+39 338 7654321" },
  { name: "Alessandro Conti", email: "a.conti@example.com", mobile: "+39 340 9876543" },
];

const FAKE_SUBJECTS = [
  "Finishing Line for Flat Panel Production",
  "UV Coating System - New Factory Setup",
  "Complete Spray Line Upgrade 2026",
  "Edge Banding & Finishing Package",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function buildMockOffer(companyId: number = DEFAULT_COMPANY_ID) {
  const allMachines = await machineRepository.getAll(companyId);
  const machines = allMachines.length > 0
    ? allMachines.slice(0, Math.min(2, allMachines.length))
    : [];

  const customer = pick(FAKE_CUSTOMERS);
  const salesman = pick(FAKE_SALESMEN);
  const subject = pick(FAKE_SUBJECTS);

  const builtItems: any[] = machines.map((machine, idx) => {
    const qty = idx === 0 ? 1 : randBetween(1, 2);
    const basePrice = machine.basePrice ? Number(machine.basePrice) : randBetween(25000, 120000);

    const selectedOptions = (machine.options ?? []).slice(0, Math.min(2, (machine.options ?? []).length));
    const builtOptions = selectedOptions.map((opt: any) => ({
      machineOptionId: opt.id,
      quantity: 1,
      snapshotOptionName: opt.name ?? "Optional Accessory",
      snapshotPriceModifier: String(opt.priceModifier ?? randBetween(2000, 15000)),
      snapshotElectricalPower: opt.electricalPower ?? null,
      snapshotCompressedAir: opt.compressedAir ?? null,
      snapshotExhaustedAir: opt.exhaustedAir ?? null,
      snapshotAirIntroduced: opt.airIntroduced ?? null,
    }));

    return {
      id: idx,
      offerId: 0,
      machineId: machine.id,
      position: idx + 1,
      quantity: qty,
      snapshotMachineName: machine.name ?? `Machine Model ${idx + 1}`,
      snapshotMachineDescription: machine.description ?? "High-performance industrial finishing machine designed for continuous production environments.",
      snapshotMacroType: (machine as any).macroType ?? null,
      snapshotImageUrl: (machine as any).imageUrl ?? null,
      snapshotBasePrice: String(basePrice),
      snapshotElectricalPower: machine.electricalPower ?? "15 kW",
      snapshotCompressedAir: machine.compressedAir ?? "300 NL/min",
      snapshotExhaustedAir: machine.exhaustedAir ?? "8000 m³/h",
      snapshotAirIntroduced: machine.airIntroduced ?? "8500 m³/h",
      snapshotInstallationDays: machine.installationDays ?? 5,
      options: builtOptions,
      machine,
    };
  });

  if (builtItems.length === 0) {
    builtItems.push({
      id: 0,
      offerId: 0,
      machineId: 0,
      position: 1,
      quantity: 1,
      snapshotMachineName: "GST 1300 Spraying Machine",
      snapshotMachineDescription: "Automatic reciprocating spraying machine for flat panels with multi-axis spray heads and recirculation system.",
      snapshotMacroType: null,
      snapshotImageUrl: null,
      snapshotBasePrice: "85000",
      snapshotElectricalPower: "18 kW",
      snapshotCompressedAir: "350 NL/min",
      snapshotExhaustedAir: "9000 m³/h",
      snapshotAirIntroduced: "9500 m³/h",
      snapshotInstallationDays: 5,
      options: [
        {
          machineOptionId: 0,
          quantity: 1,
          snapshotOptionName: "Automatic Washing System",
          snapshotPriceModifier: "4500",
          snapshotElectricalPower: "2 kW",
          snapshotCompressedAir: "50 NL/min",
          snapshotExhaustedAir: null,
          snapshotAirIntroduced: null,
        },
      ],
      machine: null,
    });
  }

  const totalListPrice = builtItems.reduce((sum, item) => {
    const base = Number(item.snapshotBasePrice) * item.quantity;
    const optTotal = item.options.reduce((os: number, o: any) => os + Number(o.snapshotPriceModifier) * o.quantity, 0);
    return sum + base + optTotal;
  }, 0);

  const discountPercent = 5;
  const discountAmount = totalListPrice * (discountPercent / 100);
  const transportPrice = 3500;
  const installationPrice = 8000;
  const netTotal = totalListPrice - discountAmount + transportPrice + installationPrice;

  const draftOffer: any = {
    id: 0,
    referenceNumber: "OFF-2026-DEMO",
    subject,
    customerId: null,
    status: "Draft",
    totalPrice: String(netTotal),
    salesmanName: salesman.name,
    date: new Date().toISOString(),
    projectData: {
      layout: "3",
      headerInfo: {
        date: new Date().toISOString().split("T")[0],
        salesman,
        customer,
      },
      technicalSpecs: {
        minMaxLength: "300 – 2500",
        maxWidth: "1300",
        minMaxThickness: "8 – 50",
        averageLineSpeed: "5 – 15",
        controlSide: "Right",
        maxBow: "2 mm/m",
        paint: "UV / Water-based",
        substrate: "MDF / Chipboard",
        finishing: "Matt / High Gloss",
        standardVoltage: "400V 3Ph 50Hz",
        standardColors: "RAL 7035 / RAL 7016",
        components: "Siemens PLC, Nordson applicators, ABB drives",
        precautions: "The machinery must be installed on a flat, vibration-free concrete floor.",
        commissioning: "Commissioning and start-up by our technicians included.",
      },
      selectedPresets: [
        {
          title: "Terms of Payment",
          content: "30% with order confirmation\n40% before shipment\n30% within 30 days from commissioning",
        },
        {
          title: "Delivery Time",
          content: "Approximately 12-14 weeks from order confirmation and receipt of down payment.",
        },
        {
          title: "Warranty",
          content: LOREM,
        },
      ],
      pricing: {
        extraItems: [],
        discountPercent,
        serviceItems: {
          transportIncluded: true,
          transportPrice,
          installationPrice,
        },
        installationConfig: {
          included: true,
          totalPrice: installationPrice,
        },
        interlockingPricePerPosition: 0,
        interlockingTotal: 0,
        totalListPrice,
        grossTotal: totalListPrice,
        discountAmount,
        netTotal,
        itemComments: builtItems.map(() => ({
          machineComment: "",
          optionComments: {},
          optionPriceHidden: {},
        })),
        priceComments: {},
        priceLabels: {},
      },
    },
    customer: { id: 0, ...customer },
    items: builtItems,
    dealer: null,
  };

  return draftOffer;
}
