const STORAGE_KEY = "travelPackEnabled";

export function isTravelPackEnabled(): boolean {
  const val = localStorage.getItem(STORAGE_KEY);
  return val !== "false";
}

export function setTravelPackEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent("travelPackToggle", { detail: enabled }));
}
