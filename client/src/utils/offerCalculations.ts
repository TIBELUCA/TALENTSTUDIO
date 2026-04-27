import type { CartItem, ExtraItem, LineDiscount, ServiceItems, InstallationConfig, WizardStep } from "@/types/offer";
import { SECTION_TO_STEP, DETAILS_STEP } from "@/constants/offer";

export const getItemOptionsTotal = (item: CartItem) =>
  item.selectedOptionIds.reduce(
    (sum, optId) => sum + (item.optionPrices[optId] ?? 0) * (item.optionQuantities?.[optId] ?? 1),
    0
  );

/**
 * Sum of unit-prices of options whose price is hidden ("Incl.") for this item.
 * This amount is folded into the machine's displayed unit price on customer-facing
 * surfaces, so the customer can reconcile machine + visible options = subtotal.
 */
export const getItemHiddenOptionsTotal = (item: CartItem) =>
  item.selectedOptionIds.reduce((sum, optId) => {
    if (!item.optionPriceHidden?.[optId]) return sum;
    return sum + (item.optionPrices[optId] ?? 0) * (item.optionQuantities?.[optId] ?? 1);
  }, 0);

/**
 * Per-unit machine price as the customer should see it: raw base price plus the
 * unit-prices of all hidden options. Multiplied by item.quantity at the call site.
 */
export const getDisplayedUnitPrice = (item: CartItem) =>
  item.basePrice + getItemHiddenOptionsTotal(item);

/**
 * For snapshot-based items (offer.items, used by OfferView/PDF/dealer-edit).
 * Returns the per-unit-machine sum of hidden options, given the per-item
 * `optionPriceHidden` map from `pricing.itemComments[index].optionPriceHidden`.
 */
export const getSnapshotItemHiddenOptionsTotal = (
  item: { options?: Array<{ machineOptionId?: number; snapshotPriceModifier?: string | number; quantity?: number }> },
  hiddenMap: Record<number, boolean> | undefined,
): number => {
  if (!hiddenMap) return 0;
  return (item.options ?? []).reduce((sum, opt) => {
    const moid = opt.machineOptionId;
    if (moid == null || !hiddenMap[moid]) return sum;
    const price = typeof opt.snapshotPriceModifier === "string"
      ? parseFloat(opt.snapshotPriceModifier) || 0
      : Number(opt.snapshotPriceModifier ?? 0);
    const qty = opt.quantity ?? 1;
    return sum + price * qty;
  }, 0);
};

export const calculateMachinesTotal = (cart: CartItem[]) =>
  cart.reduce((acc, item) => acc + (item.basePrice + getItemOptionsTotal(item)) * item.quantity, 0);

export const calculateInterlocking = (cartLength: number, pricePerPosition: number) =>
  cartLength * pricePerPosition;

export const calculateExtrasTotal = (extraItems: ExtraItem[]) =>
  extraItems.reduce((acc, item) => acc + item.price, 0);

export const calculateTravelBoardDays = (ic: InstallationConfig) =>
  ic.mechanicalDays + ic.electricalDays + ic.testingDays + ic.installTrainingDays;

export const calculateServicesTotal = (
  installationConfig: InstallationConfig,
  serviceItems: ServiceItems
) => {
  const instAmount = installationConfig.included ? installationConfig.totalPrice : 0;
  const tbDays = calculateTravelBoardDays(installationConfig);
  const boardAmount = serviceItems.boardLodging ? (serviceItems.boardLodgingDailyFee || 0) * tbDays : 0;
  const transportAmount = serviceItems.transportIncluded ? serviceItems.transportPrice : 0;
  return instAmount + boardAmount + transportAmount;
};

export const calculateTotalListPrice = (
  cart: CartItem[],
  interlockingPricePerPosition: number,
  extraItems: ExtraItem[]
) =>
  calculateMachinesTotal(cart) +
  calculateInterlocking(cart.length, interlockingPricePerPosition) +
  calculateExtrasTotal(extraItems);

export const calculateGrossTotal = (
  cart: CartItem[],
  interlockingPricePerPosition: number,
  extraItems: ExtraItem[],
  installationConfig: InstallationConfig,
  serviceItems: ServiceItems
) =>
  calculateTotalListPrice(cart, interlockingPricePerPosition, extraItems) +
  calculateServicesTotal(installationConfig, serviceItems);

/**
 * Compute the discount that applies to a single subtotal given a per-line
 * override + NET flag and the global default percent.
 */
export const computeLineDiscount = (
  subtotal: number,
  override: number | null | undefined,
  isNet: boolean | undefined,
  globalPercent: number,
): number => {
  if (isNet) return 0;
  const pct = override != null ? Number(override) : globalPercent;
  if (!pct || pct <= 0) return 0;
  return (subtotal * pct) / 100;
};

const DEFAULT_LINE: LineDiscount = { discountOverridePercent: null, isNet: false };

/**
 * Effective discount percent for a single line: 0 if NET, else override or global.
 */
export const effectiveLinePercent = (
  override: number | null | undefined,
  isNet: boolean | undefined,
  globalPercent: number,
): number => {
  if (isNet) return 0;
  const pct = override != null ? Number(override) : globalPercent;
  return pct > 0 ? pct : 0;
};

/**
 * Apply the effective line discount to a subtotal, returning the net amount.
 */
export const applyLineDiscount = (
  subtotal: number,
  override: number | null | undefined,
  isNet: boolean | undefined,
  globalPercent: number,
): number => subtotal * (1 - effectiveLinePercent(override, isNet, globalPercent) / 100);

/**
 * Aggregated discount for a salesman cart honouring per-machine, per-option
 * and per-extra overrides. Hidden options ("Incl.") follow the parent machine
 * since they are folded into the displayed unit price. Interlocking is always
 * discounted at the global percent (no per-line control).
 */
export const calculateDiscount = (
  cart: CartItem[],
  interlockingPricePerPosition: number,
  extraItems: ExtraItem[],
  discountPercent: number,
): number => {
  let total = 0;
  for (const item of cart) {
    const machineQty = item.quantity || 1;
    const hiddenSum = getItemHiddenOptionsTotal(item);
    const machineSubtotal = (item.basePrice + hiddenSum) * machineQty;
    total += computeLineDiscount(
      machineSubtotal,
      item.discountOverridePercent ?? null,
      item.isNet ?? false,
      discountPercent,
    );
    for (const optId of item.selectedOptionIds) {
      if (item.optionPriceHidden?.[optId]) continue;
      const unit = item.optionPrices[optId] ?? 0;
      const qty = item.optionQuantities?.[optId] ?? 1;
      const subtotal = unit * qty * machineQty;
      const cfg = item.optionDiscounts?.[optId] ?? DEFAULT_LINE;
      total += computeLineDiscount(subtotal, cfg.discountOverridePercent, cfg.isNet, discountPercent);
    }
  }
  for (const extra of extraItems) {
    total += computeLineDiscount(
      extra.price || 0,
      extra.discountOverridePercent ?? null,
      extra.isNet ?? false,
      discountPercent,
    );
  }
  const interlockingTotal = calculateInterlocking(cart.length, interlockingPricePerPosition);
  total += computeLineDiscount(interlockingTotal, null, false, discountPercent);
  return total;
};

/**
 * Snapshot-based discount calculator used by OfferView and the PDF builder.
 * `itemDiscounts` is the array stored in `pricing.itemDiscounts` (parallel to
 * `offer.items`); `optionPriceHidden` maps come from `pricing.itemComments`.
 */
export const calculateSnapshotDiscount = (
  items: Array<{
    quantity?: number;
    snapshotBasePrice?: string | number;
    options?: Array<{ machineOptionId?: number; snapshotPriceModifier?: string | number; quantity?: number }>;
  }>,
  itemDiscounts: Array<{ discountOverridePercent?: number | null; isNet?: boolean; optionDiscounts?: Record<number, { discountOverridePercent?: number | null; isNet?: boolean }> }> | undefined,
  itemComments: Array<{ optionPriceHidden?: Record<number, boolean> }> | undefined,
  extraItems: Array<{ price?: number; discountOverridePercent?: number | null; isNet?: boolean }>,
  interlockingTotal: number,
  globalPercent: number,
): number => {
  const toNum = (v: any) => (typeof v === "string" ? parseFloat(v) || 0 : Number(v ?? 0));
  let total = 0;
  items.forEach((item, idx) => {
    const machineQty = item.quantity ?? 1;
    const base = toNum(item.snapshotBasePrice);
    const hiddenMap = itemComments?.[idx]?.optionPriceHidden;
    const cfg = itemDiscounts?.[idx] ?? {};
    const hiddenSum = (item.options ?? []).reduce((s, opt) => {
      const moid = opt.machineOptionId;
      if (moid == null || !hiddenMap?.[moid]) return s;
      return s + toNum(opt.snapshotPriceModifier) * (opt.quantity ?? 1);
    }, 0);
    const machineSubtotal = (base + hiddenSum) * machineQty;
    total += computeLineDiscount(machineSubtotal, cfg.discountOverridePercent ?? null, cfg.isNet ?? false, globalPercent);
    for (const opt of item.options ?? []) {
      const moid = opt.machineOptionId;
      if (moid == null || hiddenMap?.[moid]) continue;
      const unit = toNum(opt.snapshotPriceModifier);
      const qty = opt.quantity ?? 1;
      const subtotal = unit * qty * machineQty;
      const optCfg = cfg.optionDiscounts?.[moid] ?? DEFAULT_LINE;
      total += computeLineDiscount(subtotal, optCfg.discountOverridePercent, optCfg.isNet, globalPercent);
    }
  });
  for (const extra of extraItems) {
    total += computeLineDiscount(extra.price || 0, extra.discountOverridePercent ?? null, extra.isNet ?? false, globalPercent);
  }
  total += computeLineDiscount(interlockingTotal, null, false, globalPercent);
  return total;
};

export const calculateNetTotal = (
  cart: CartItem[],
  interlockingPricePerPosition: number,
  extraItems: ExtraItem[],
  installationConfig: InstallationConfig,
  serviceItems: ServiceItems,
  discountPercent: number
) =>
  calculateGrossTotal(cart, interlockingPricePerPosition, extraItems, installationConfig, serviceItems) -
  calculateDiscount(cart, interlockingPricePerPosition, extraItems, discountPercent);

export const calculateFinalTotal = (
  cart: CartItem[],
  interlockingPricePerPosition: number,
  extraItems: ExtraItem[],
  installationConfig: InstallationConfig,
  serviceItems: ServiceItems,
  discountPercent: number
) =>
  // Always derive from net total: per-line overrides can apply discounts even
  // when the global discountPercent is 0.
  calculateNetTotal(cart, interlockingPricePerPosition, extraItems, installationConfig, serviceItems, discountPercent);

export function buildWizardSteps(
  formatSections: any[] | undefined,
  opts?: { includeComposition?: boolean; includeReview?: boolean; dealerEditReadOnly?: boolean }
): WizardStep[] {
  const { includeComposition = true, includeReview = true } = opts ?? {};
  const sections: any[] = formatSections ?? [];

  const defaultSteps: WizardStep[] = [
    { id: "customer", label: "Customer Details", intro: "", sectionLabels: {} },
    { ...DETAILS_STEP },
    { id: "subject", label: "Project Data", intro: "", sectionLabels: {} },
    { id: "specs", label: "Technical Specifications", intro: "", sectionLabels: {} },
    ...(includeComposition ? [{ id: "composition", label: "Machines and Options", intro: "", sectionLabels: {} }] : []),
    { id: "pricing", label: "Price Overview", intro: "", sectionLabels: {} },
    { id: "terms", label: "Terms & Conditions", intro: "", sectionLabels: {} },
  ];

  if (!sections.length) {
    defaultSteps.push({ id: "crm", label: "CRM", intro: "", sectionLabels: {} });
    if (includeReview) defaultSteps.push({ id: "review", label: "Review Sections", intro: "", sectionLabels: {} });
    return defaultSteps;
  }

  const steps: WizardStep[] = [];
  for (const sec of sections) {
    const def = SECTION_TO_STEP[sec.id];
    if (!def) continue;
    if (!sec.enabled && !def.alwaysShow) continue;
    if (def.id === "composition" && !includeComposition) continue;
    steps.push({
      id: def.id,
      label: def.defaultLabel,
      intro: sec.labels?.intro ?? "",
      sectionLabels: sec.labels ?? {},
    });
    if (def.id === "customer") steps.push({ ...DETAILS_STEP });
  }

  const result = steps.length ? steps : defaultSteps;
  result.push({ id: "crm", label: "CRM", intro: "", sectionLabels: {} });
  if (includeReview) result.push({ id: "review", label: "Review Sections", intro: "", sectionLabels: {} });
  return result;
}

export const formatPrice = (n: number) =>
  `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
