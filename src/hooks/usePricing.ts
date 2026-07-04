import { useCallback, useEffect, useRef, useState } from 'react';
import type { PricingSettings } from '@/types';
import { DEFAULT_PRICING, clampPct, loadPricing, savePricing } from '@/lib/data/pricing';

export interface PricingApi {
  pricing: PricingSettings;
  loaded: boolean;
  /** Number of rows that carry at least one custom (overridden) percentage. */
  overrideCount: number;
  /** Set the global default DP discount (your buy-side discount off dealer price). */
  setDefaultDpPct: (pct: number) => void;
  /** Set the global default RCP discount (your sell-side discount off customer price). */
  setDefaultRcpPct: (pct: number) => void;
  /** Set (number) or clear (null) a single row's DP discount override. */
  setRowDp: (id: string, pct: number | null) => void;
  /** Set (number) or clear (null) a single row's RCP discount override. */
  setRowRcp: (id: string, pct: number | null) => void;
  /** Drop every per-row override, reverting all rows to the defaults. */
  clearOverrides: () => void;
}

const SAVE_DELAY_MS = 300;

/**
 * Manage editable pricing (default discount + per-row overrides) with an
 * optimistic UI: state updates immediately and the write to IndexedDB is
 * debounced so rapid typing stays smooth. The latest value is also flushed on
 * unmount so nothing is lost.
 */
export function usePricing(): PricingApi {
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef<PricingSettings>(pricing);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void loadPricing().then((p) => {
      if (!alive) return;
      latest.current = p;
      setPricing(p);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const commit = useCallback((next: PricingSettings) => {
    latest.current = next;
    setPricing(next); // optimistic
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void savePricing(next);
    }, SAVE_DELAY_MS);
  }, []);

  const setDefaultDpPct = useCallback(
    (pct: number) => {
      commit({ ...latest.current, defaultDpPct: clampPct(pct) });
    },
    [commit],
  );

  const setDefaultRcpPct = useCallback(
    (pct: number) => {
      commit({ ...latest.current, defaultRcpPct: clampPct(pct) });
    },
    [commit],
  );

  const setRowField = useCallback(
    (id: string, field: 'dp' | 'rcp', pct: number | null) => {
      const overrides = { ...latest.current.overrides };
      const cur = { ...(overrides[id] ?? {}) };
      if (pct === null || Number.isNaN(pct)) delete cur[field];
      else cur[field] = clampPct(pct);
      // Drop the whole entry once neither side is overridden.
      if (cur.dp === undefined && cur.rcp === undefined) delete overrides[id];
      else overrides[id] = cur;
      commit({ ...latest.current, overrides });
    },
    [commit],
  );

  const setRowDp = useCallback((id: string, pct: number | null) => setRowField(id, 'dp', pct), [setRowField]);
  const setRowRcp = useCallback((id: string, pct: number | null) => setRowField(id, 'rcp', pct), [setRowField]);

  const clearOverrides = useCallback(() => {
    commit({ ...latest.current, overrides: {} });
  }, [commit]);

  // Flush any pending write when the component using this hook unmounts.
  useEffect(
    () => () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        void savePricing(latest.current);
      }
    },
    [],
  );

  return {
    pricing,
    loaded,
    overrideCount: Object.keys(pricing.overrides).length,
    setDefaultDpPct,
    setDefaultRcpPct,
    setRowDp,
    setRowRcp,
    clearOverrides,
  };
}
