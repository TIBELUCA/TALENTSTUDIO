import { useEffect, useRef, useCallback, useState } from "react";

const DEBOUNCE_MS = 2000;

export interface UseWizardDraftOptions<T> {
  key: string;
  state: T;
  enabled?: boolean;
}

export interface DraftEntry<T> {
  id: string;
  name: string;
  state: T;
  savedAt: string;
  customerName?: string;
  subject?: string;
  step?: number;
}

export interface UseWizardDraftReturn<T> {
  hasDraft: boolean;
  restore: () => T | null;
  discard: () => void;
  clearDraft: () => void;
  markReady: () => void;
  saveNow: () => void;
  saveNamedDraft: (name: string) => void;
  upsertDraft: (name: string) => void;
  loadDraft: (id: string) => T | null;
  deleteDraft: (id: string) => void;
  listDrafts: () => DraftEntry<T>[];
  lastSavedAt: Date | null;
}

interface StoredDraft<T> {
  state: T;
  savedAt: string;
}

function getDraftListKey(baseKey: string): string {
  return `${baseKey}:drafts`;
}

function loadDraftList<T>(baseKey: string): DraftEntry<T>[] {
  try {
    const raw = localStorage.getItem(getDraftListKey(baseKey));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveDraftList<T>(baseKey: string, list: DraftEntry<T>[]): void {
  try {
    localStorage.setItem(getDraftListKey(baseKey), JSON.stringify(list));
  } catch {}
}

export function useWizardDraft<T>({ key, state, enabled = true }: UseWizardDraftOptions<T>): UseWizardDraftReturn<T> {
  const [hasDraft, setHasDraft] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      JSON.parse(raw);
      return true;
    } catch {
      try { localStorage.removeItem(key); } catch {}
      return false;
    }
  });
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  const restoredRef = useRef(false);

  stateRef.current = state;

  useEffect(() => {
    if (!enabled || !restoredRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        const draft: StoredDraft<T> = {
          state: stateRef.current,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(key, JSON.stringify(draft));
        setLastSavedAt(new Date(draft.savedAt));
        setHasDraft(true);
      } catch {
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key, state, enabled]);

  const restore = useCallback((): T | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed: StoredDraft<T> = JSON.parse(raw);
      restoredRef.current = true;
      setLastSavedAt(new Date(parsed.savedAt));
      return parsed.state;
    } catch {
      return null;
    }
  }, [key]);

  const discard = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {}
    setHasDraft(false);
    setLastSavedAt(null);
    restoredRef.current = true;
  }, [key]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {}
    if (timerRef.current) clearTimeout(timerRef.current);
    setHasDraft(false);
    setLastSavedAt(null);
  }, [key]);

  const markReady = useCallback(() => {
    restoredRef.current = true;
  }, []);

  const saveNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      restoredRef.current = true;
      const draft: StoredDraft<T> = {
        state: stateRef.current,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(key, JSON.stringify(draft));
      setLastSavedAt(new Date(draft.savedAt));
      setHasDraft(true);
    } catch {}
  }, [key]);

  const saveNamedDraft = useCallback((name: string) => {
    const now = new Date().toISOString();
    const s = stateRef.current as any;
    const entry: DraftEntry<T> = {
      id: `draft-${Date.now()}`,
      name,
      state: stateRef.current,
      savedAt: now,
      customerName: s.headerCustomerName || undefined,
      subject: s.subject || undefined,
      step: s.step || undefined,
    };
    const list = loadDraftList<T>(key);
    list.unshift(entry);
    if (list.length > 20) list.length = 20;
    saveDraftList(key, list);
    restoredRef.current = true;
    setLastSavedAt(new Date(now));
  }, [key]);

  const upsertDraft = useCallback((name: string) => {
    const now = new Date().toISOString();
    const s = stateRef.current as any;
    const list = loadDraftList<T>(key);
    const existing = list.find(d => d.name === name);
    if (existing) {
      existing.state = stateRef.current;
      existing.savedAt = now;
      existing.customerName = s.headerCustomerName || undefined;
      existing.subject = s.subject || undefined;
      existing.step = s.step || undefined;
    } else {
      const entry: DraftEntry<T> = {
        id: `draft-${Date.now()}`,
        name,
        state: stateRef.current,
        savedAt: now,
        customerName: s.headerCustomerName || undefined,
        subject: s.subject || undefined,
        step: s.step || undefined,
      };
      list.unshift(entry);
      if (list.length > 20) list.length = 20;
    }
    saveDraftList(key, list);
    restoredRef.current = true;
    setLastSavedAt(new Date(now));
  }, [key]);

  const listDrafts = useCallback((): DraftEntry<T>[] => {
    return loadDraftList<T>(key);
  }, [key]);

  const loadDraft = useCallback((id: string): T | null => {
    const list = loadDraftList<T>(key);
    const found = list.find(d => d.id === id);
    if (!found) return null;
    restoredRef.current = true;
    setLastSavedAt(new Date(found.savedAt));
    return found.state;
  }, [key]);

  const deleteDraft = useCallback((id: string) => {
    const list = loadDraftList<T>(key);
    const filtered = list.filter(d => d.id !== id);
    saveDraftList(key, filtered);
  }, [key]);

  return { hasDraft, restore, discard, clearDraft, markReady, saveNow, saveNamedDraft, upsertDraft, loadDraft, deleteDraft, listDrafts, lastSavedAt };
}
