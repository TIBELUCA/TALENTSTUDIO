import { useState, useEffect, useCallback, useRef } from "react";
import { travelPackDB, type TravelPackMeta, type OfflineDraft } from "@/lib/travelPackDB";
import { useOnlineStatus } from "./use-online-status";
import { useToast } from "./use-toast";
import { apiRequest } from "@/lib/queryClient";

export function useTravelPack() {
  const { isOnline, checkConnection } = useOnlineStatus();
  const { toast } = useToast();
  const [meta, setMeta] = useState<TravelPackMeta | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasPack, setHasPack] = useState(false);
  const syncAttempted = useRef(false);

  useEffect(() => {
    travelPackDB.getMeta().then(m => {
      setMeta(m ?? null);
      setHasPack(!!m);
    });
  }, []);

  const download = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/travel-pack", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to download travel pack");
      const pack = await res.json();
      await travelPackDB.savePack(pack);
      const m = await travelPackDB.getMeta();
      setMeta(m ?? null);
      setHasPack(true);
      toast({ title: "Travel Pack downloaded", description: `${pack.machines?.length ?? 0} machines, ${pack.enquiries?.length ?? 0} enquiries, ${pack.customers?.length ?? 0} customers saved for offline use.` });
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }, [toast]);

  const syncDrafts = useCallback(async () => {
    const online = await checkConnection();
    if (!online) return;

    const unsynced = await travelPackDB.getUnsyncedDrafts();
    if (unsynced.length === 0) return;

    setSyncing(true);
    let syncedCount = 0;
    for (const draft of unsynced) {
      try {
        const res = await apiRequest("POST", "/api/offers", {
          offer: draft.offerData,
          items: draft.items,
        });
        const created = await res.json();
        await travelPackDB.markDraftSynced(draft.id, created.id);
        syncedCount++;
      } catch (err: any) {
        console.error("Sync failed for draft", draft.id, err);
      }
    }
    setSyncing(false);
    if (syncedCount > 0) {
      toast({ title: "Drafts synced", description: `${syncedCount} offline offer(s) uploaded to server.` });
    }
  }, [checkConnection, toast]);

  useEffect(() => {
    if (isOnline && hasPack && !syncAttempted.current) {
      syncAttempted.current = true;
      syncDrafts();
    }
    if (!isOnline) {
      syncAttempted.current = false;
    }
  }, [isOnline, hasPack, syncDrafts]);

  const clearPack = useCallback(async () => {
    await travelPackDB.clearAll();
    setMeta(null);
    setHasPack(false);
    toast({ title: "Travel Pack cleared" });
  }, [toast]);

  return {
    isOnline,
    hasPack,
    meta,
    downloading,
    syncing,
    download,
    syncDrafts,
    clearPack,
  };
}

export function useOfflineData() {
  const { isOnline } = useOnlineStatus();
  const [hasPack, setHasPack] = useState(false);

  useEffect(() => {
    travelPackDB.hasPack().then(setHasPack);
  }, []);

  const useOffline = !isOnline && hasPack;

  return { isOnline, hasPack, useOffline };
}

export function useOfflineDrafts() {
  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);

  const refresh = useCallback(async () => {
    const all = await travelPackDB.getOfflineDrafts();
    setDrafts(all);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const saveDraft = useCallback(async (draft: OfflineDraft) => {
    await travelPackDB.saveOfflineDraft(draft);
    await refresh();
  }, [refresh]);

  const deleteDraft = useCallback(async (id: string) => {
    await travelPackDB.deleteOfflineDraft(id);
    await refresh();
  }, [refresh]);

  return { drafts, saveDraft, deleteDraft, refresh };
}
