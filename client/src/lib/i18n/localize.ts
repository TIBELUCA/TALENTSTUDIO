export function getLocalizedField(
  titles: Record<string, string> | null | undefined,
  fallback: string,
  language: string
): string {
  if (!titles) return fallback;
  if (titles[language]) return titles[language];
  if (titles.it) return titles.it;
  const firstAvailable = Object.values(titles).find(v => v);
  return firstAvailable || fallback;
}
