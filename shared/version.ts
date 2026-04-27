/**
 * QuotePilot version-display rules.
 *
 * Internal/storage rule: every "versionable" document (offer, job order,
 * order-version snapshot, etc.) is stored as a 1-indexed integer in the
 * database. The first version is `1`, the second `2`, and so on. This
 * matches Drizzle defaults and keeps `MAX(version) + 1` increments simple.
 *
 * User-facing rule: every document, in any context, must DISPLAY its
 * initial version as `V0` (subsequent versions: V1, V2, …). The helpers
 * below convert from the stored integer to the display integer/label so
 * the rule is enforced consistently across UI badges, PDFs, audit notes
 * and recap titles without touching the underlying data.
 *
 * The conversion is intentionally defensive: missing/non-finite inputs
 * fall back to "first version" (display 0) rather than rendering as NaN.
 */

export const VERSION_DISPLAY_OFFSET = 1;

export function displayVersion(stored: number | null | undefined): number {
  const n = typeof stored === "number" && Number.isFinite(stored) ? stored : 1;
  return Math.max(0, n - VERSION_DISPLAY_OFFSET);
}

export function formatVersionLabel(
  stored: number | null | undefined,
  prefix: "V" | "v" = "V",
): string {
  return `${prefix}${displayVersion(stored)}`;
}
