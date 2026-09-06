import { useCallback, useMemo } from "react";
import { useHistory, useLocation } from "react-router-dom";

// Keep filters in the URL so refresh, bookmarks, and browser history agree.
export function useURLFilters() {
  const history = useHistory();
  const { search } = useLocation();
  const filters = useMemo(() => new URLSearchParams(search), [search]);
  const setFilters = useCallback((values: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(history.location.search);
    Object.entries(values).forEach(([key, value]) => {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    });
    const location = { ...history.location, search: next.toString() ? `?${next}` : "" };
    if (location.search === history.location.search) return;
    if (replace) history.replace(location); else history.push(location);
  }, [history]);
  return { filters, setFilters };
}

export function positiveInteger(value: string | null, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Metrics renders Unix seconds through Date APIs. Number-safe values can still
// exceed Date's smaller representable range and would make toISOString throw.
export function parseUnixTimeSeconds(value: string | null): number | null {
  const parsed = positiveInteger(value, 0);
  if (parsed === 0) return null;
  return Number.isFinite(new Date(parsed * 1000).getTime()) ? parsed : null;
}
