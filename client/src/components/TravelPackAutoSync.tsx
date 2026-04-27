import { useEffect, useRef, useCallback, useState } from "react";
import { travelPackDB } from "@/lib/travelPackDB";
import { useToast } from "@/hooks/use-toast";
import { isTravelPackEnabled } from "@/lib/travelPackSettings";

async function downloadPackSilently(): Promise<{ success: boolean; machines?: number; enquiries?: number; customers?: number; offers?: number }> {
  try {
    const res = await fetch("/api/travel-pack", { credentials: "include" });
    if (!res.ok) return { success: false };
    const pack = await res.json();
    await travelPackDB.savePack(pack);
    return {
      success: true,
      machines: pack.machines?.length ?? 0,
      enquiries: pack.enquiries?.length ?? 0,
      customers: pack.customers?.length ?? 0,
      offers: pack.offers?.length ?? 0,
    };
  } catch {
    return { success: false };
  }
}

export function TravelPackAutoSync() {
  const { toast } = useToast();
  const initialDone = useRef(false);
  const [enabled, setEnabled] = useState(() => isTravelPackEnabled());

  useEffect(() => {
    const handler = (e: Event) => setEnabled((e as CustomEvent).detail);
    window.addEventListener("travelPackToggle", handler);
    return () => window.removeEventListener("travelPackToggle", handler);
  }, []);

  const runAutoUpdate = useCallback(async () => {
    if (!navigator.onLine || !isTravelPackEnabled()) return;
    const result = await downloadPackSilently();
    if (result.success) {
      toast({
        title: "Travel Pack pronto",
        description: `${result.machines} macchine, ${result.customers} clienti, ${result.enquiries} enquiry, ${result.offers ?? 0} offerte disponibili offline.`,
      });
    }
  }, [toast]);

  useEffect(() => {
    if (!enabled) return;
    if (initialDone.current) return;
    initialDone.current = true;
    runAutoUpdate();
  }, [runAutoUpdate, enabled]);

  return null;
}
