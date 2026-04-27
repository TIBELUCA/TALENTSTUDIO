export type CartItem = {
  tempId: string;
  machineName: string;
  qty: number;
  basePrice: number;
  options: { id: string; name: string; qty: number; price: number; hidden: boolean }[];
  comment?: string;
};

export const cart: CartItem[] = [
  {
    tempId: "p1",
    machineName: "GR400 — Granigliatrice automatica",
    qty: 1,
    basePrice: 184500,
    comment: "Sconto fedeltà già applicato",
    options: [
      { id: "o1", name: "Cabina di insonorizzazione 75 dB", qty: 1, price: 12800, hidden: false },
      { id: "o2", name: "Filtro a cartucce ad alta efficienza", qty: 1, price: 6400, hidden: false },
      { id: "o3", name: "Pacchetto manuali multilingua", qty: 1, price: 850, hidden: true },
    ],
  },
  {
    tempId: "p2",
    machineName: "GR250 — Linea di sabbiatura",
    qty: 2,
    basePrice: 92000,
    options: [
      { id: "o4", name: "Nastro trasportatore aggiuntivo 6 m", qty: 1, price: 4900, hidden: false },
      { id: "o5", name: "Sensori di temperatura ridondanti", qty: 2, price: 1200, hidden: false },
    ],
  },
];

export const interlockingPerPos = 250;
export const extras = [
  { id: "e1", description: "Documentazione tecnica aggiuntiva", price: 1200 },
];

export const installation = {
  dailyFee: 950,
  travelDays: 1,
  mechanicalDays: 4,
  electricalDays: 2,
  testingDays: 1,
  trainingDays: 1,
};
export const travel = { rentalDailyFee: 120, rentalDays: 7, flightTicket: 480 };
export const transportPrice = 3200;
export const packagingNote = "Casse termoretraibili";
export const trainingDays = installation.trainingDays;
export const discountPercent = 5;

export const labels = {
  installation: "Installazione e messa in servizio",
  travelCosts: "Trasferta tecnici",
  boardLodging: "Vitto e alloggio",
  training: "Formazione operatori",
  packaging: "Imballo",
  transport: "Trasporto in stabilimento",
  interlocking: "Interlocking",
  totalListPrice: "Total list price",
  grossTotal: "Gross total",
  netTotal: "Net total (after discount)",
};

export function fmt(n: number) {
  return n.toLocaleString("it-IT");
}

export function machineSubtotal(it: CartItem) {
  const opts = it.options.reduce((s, o) => s + o.price * o.qty, 0);
  return (it.basePrice + opts) * it.qty;
}
export function machineDisplayedUnit(it: CartItem) {
  const hidden = it.options.filter(o => o.hidden).reduce((s, o) => s + o.price * o.qty, 0);
  return it.basePrice + hidden;
}
export function machinesTotal() {
  return cart.reduce((s, i) => s + machineSubtotal(i), 0);
}
export function interlockingTotal() {
  return cart.length * interlockingPerPos;
}
export function extrasTotal() {
  return extras.reduce((s, e) => s + e.price, 0);
}
export function installationTotalDays() {
  return installation.travelDays + installation.mechanicalDays + installation.electricalDays + installation.testingDays + installation.trainingDays;
}
export function installationTotal() {
  return installation.dailyFee * installationTotalDays();
}
export function travelTotal() {
  return travel.rentalDailyFee * travel.rentalDays + travel.flightTicket;
}
export function servicesTotal(included: { installation: boolean; travel: boolean; board: boolean; training: boolean; packaging: boolean; transport: boolean }) {
  let t = 0;
  if (included.installation) t += installationTotal();
  if (included.travel) t += travelTotal();
  if (included.transport) t += transportPrice;
  return t;
}
export function listPriceTotal() {
  return machinesTotal() + interlockingTotal() + extrasTotal();
}
