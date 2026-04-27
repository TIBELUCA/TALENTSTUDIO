import { computeMachineStats, computeMachineStatsForOffer } from "./machineStats";
import { computeOptionStats, computeOptionStatsForOffer } from "./optionStats";
import { computePricingDistributions, computePricingForOffer } from "./pricingAnalysis";
import { detectPatterns, detectPatternsForOffer } from "./patternDetection";
import { generateInsights } from "./insightGenerator";

export async function refreshAllAnalytics(): Promise<void> {
  await computeMachineStats();
  await computeOptionStats();
  await computePricingDistributions();
  await detectPatterns();
  await generateInsights();
}

export async function refreshForOffer(offerId: number): Promise<void> {
  await computeMachineStatsForOffer(offerId);
  await computeOptionStatsForOffer(offerId);
  await computePricingForOffer(offerId);
  await detectPatternsForOffer(offerId);
  await generateInsights();
}
