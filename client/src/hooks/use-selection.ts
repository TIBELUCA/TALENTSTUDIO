import { useState, useCallback, useMemo } from "react";

export function useSelection<T extends number = number>() {
  const [active, setActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<T>>(new Set());

  const toggle = useCallback((id: T) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: T[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const enterSelectionMode = useCallback(() => {
    setActive(true);
    setSelectedIds(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setActive(false);
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id: T) => selectedIds.has(id), [selectedIds]);

  const count = selectedIds.size;

  const isAllSelected = useCallback(
    (visibleIds: T[]) => visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id)),
    [selectedIds]
  );

  const toggleAll = useCallback(
    (visibleIds: T[]) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
      if (allSelected) {
        setSelectedIds(prev => {
          const next = new Set(prev);
          visibleIds.forEach(id => next.delete(id));
          return next;
        });
      } else {
        setSelectedIds(prev => {
          const next = new Set(prev);
          visibleIds.forEach(id => next.add(id));
          return next;
        });
      }
    },
    [selectedIds]
  );

  return useMemo(() => ({
    active,
    selectedIds,
    count,
    toggle,
    selectAll,
    clearSelection,
    enterSelectionMode,
    exitSelectionMode,
    isSelected,
    isAllSelected,
    toggleAll,
  }), [active, selectedIds, count, toggle, selectAll, clearSelection, enterSelectionMode, exitSelectionMode, isSelected, isAllSelected, toggleAll]);
}
