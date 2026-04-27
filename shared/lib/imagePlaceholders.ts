// Shared helpers for the inline image placeholders used in machine descriptions.
//
// Two forms exist:
//   [[IMG:filename.png]]  — fully-qualified filename, ready to render as <img>.
//   [[IMGn]]              — numeric index (1-based) into the machine's
//                           detailImages array (the photos column, second
//                           element onwards).
//
// New saves resolve [[IMGn]] → [[IMG:filename]] at write-time, but legacy
// snapshots may still contain the numeric form, so the renderers must expand
// them on the fly using the source machine's detailImages.

export const IMG_NUMERIC_RE = /\[\[IMG(\d+)\]\]/g;
export const IMG_NAMED_RE = /\[\[IMG:([^\]]+)\]\]/g;
export const IMG_ANY_RE = /\[\[IMG(?::[^\]]+|\d+)\]\]/g;

/**
 * Rewrite every [[IMGn]] into [[IMG:filename]] using the supplied detail-image
 * filenames (1-based). Indexes that have no corresponding filename are dropped.
 */
export function expandNumericImagePlaceholders(
  text: string | null | undefined,
  detailImages: string[] | null | undefined,
): string {
  const src = text ?? "";
  if (!src) return "";
  const list = detailImages ?? [];
  return src.replace(IMG_NUMERIC_RE, (_m, n: string) => {
    const idx = Number(n);
    if (!Number.isFinite(idx) || idx < 1 || idx > list.length) return "";
    const fn = list[idx - 1];
    return fn ? `[[IMG:${fn}]]` : "";
  });
}

/**
 * Strip every image placeholder ([[IMG:foo]] and [[IMGn]]) from the supplied
 * text. Used by the version-diff so placeholders don't make descriptions look
 * "modified" or appear as raw text in diff output.
 */
export function stripAllImagePlaceholders(text: string | null | undefined): string {
  return (text ?? "")
    .replace(IMG_ANY_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Same as stripAllImagePlaceholders but also normalises CRLF for diffs. */
export function normalizeForDiff(text: string | null | undefined): string {
  return stripAllImagePlaceholders((text ?? "").replace(/\r\n/g, "\n")).trim();
}
