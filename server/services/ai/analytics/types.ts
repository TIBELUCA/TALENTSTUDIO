import type {
  MachineUsageStat,
  OptionUsageStat,
  PricingDistribution,
  OfferPattern,
  SalesInsight,
} from "@shared/schema";

export interface MachineStatsInput {
  machineId: number;
  machineName: string;
  macroType: string | null;
  snapshotBasePrice: string;
  quantity: number;
  offerDate: Date | null;
}

export interface OptionStatsInput {
  machineOptionId: number;
  optionName: string;
  machineId: number;
  quantity: number;
  coOccurringOptionIds: number[];
}

export interface PricingInput {
  machineId: number;
  machineName: string;
  macroType: string | null;
  totalPrice: number;
}

export interface PatternInput {
  offerId: number;
  machineIds: number[];
  optionIds: number[];
}

export interface AnalyticsResult {
  machineStats: MachineUsageStat[];
  optionStats: OptionUsageStat[];
  pricingDistributions: PricingDistribution[];
  offerPatterns: OfferPattern[];
  salesInsights: SalesInsight[];
}

export interface QuoteContextData {
  machineStats: MachineUsageStat[];
  pricingDistributions: PricingDistribution[];
  commonOptions: OptionUsageStat[];
}
