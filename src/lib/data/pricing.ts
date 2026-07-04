/**
 * Editable pricing on top of the parsed rows.
 *
 * Each price-list row carries two prices from the PDF:
 *   - DP  (dealer price)  — the total billing amount incl. GST the dealer pays.
 *   - RCP (customer price) — the recommended price to the customer.
 *
 * Two independent, editable percentages drive the maths:
 *   - a DP discount  → your NET COST      = DP  × (1 − dpPct / 100)
 *   - an RCP discount → your SELLING PRICE = RCP × (1 − rcpPct / 100)
 *                       (falls back to DP when the list has no RCP, e.g. Kelly)
 *   - margin = selling price − net cost
 *
 * Both percentages have a global default plus optional per-row overrides. The
 * preferences are persisted to IndexedDB and mirrored into the exported
 * `global.json`, so values typed in the table survive reloads and show in JSON.
 */
import { APP_CONFIG } from '@/config';
import { getSetting, setSetting } from '@/lib/storage/db';
import type { DataRecord, PricingSettings, RowOverride, RowPricing } from '@/types';
import { dealerPrice, retailPrice } from './columns';

export const DEFAULT_PRICING: PricingSettings = {
  defaultDpPct: 0,
  defaultRcpPct: 0,
  overrides: {},
};

/** Clamp a percentage into a sane 0–100 range with 2-decimal precision. */
export function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

/** Normalise one persisted override (tolerates the legacy single-number shape). */
function normalizeOverride(raw: unknown): RowOverride | null {
  if (typeof raw === 'number') {
    // Legacy format: a bare number was the RCP (customer) discount.
    return Number.isFinite(raw) ? { rcp: clampPct(raw) } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const out: RowOverride = {};
  if (Number.isFinite(Number(o.dp))) out.dp = clampPct(Number(o.dp));
  if (Number.isFinite(Number(o.rcp))) out.rcp = clampPct(Number(o.rcp));
  return out.dp !== undefined || out.rcp !== undefined ? out : null;
}

/** Load persisted pricing preferences (falls back to a zero-discount default). */
export async function loadPricing(): Promise<PricingSettings> {
  const raw = await getSetting<Record<string, unknown>>(APP_CONFIG.settingsKeys.pricing);
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PRICING };
  const overrides: Record<string, RowOverride> = {};
  if (raw.overrides && typeof raw.overrides === 'object') {
    for (const [id, ov] of Object.entries(raw.overrides as Record<string, unknown>)) {
      const norm = normalizeOverride(ov);
      if (norm) overrides[id] = norm;
    }
  }
  // `defaultDiscountPct` is the legacy key for what is now the RCP default.
  const defaultRcpPct = clampPct(Number(raw.defaultRcpPct ?? raw.defaultDiscountPct) || 0);
  const defaultDpPct = clampPct(Number(raw.defaultDpPct) || 0);
  return { defaultDpPct, defaultRcpPct, overrides };
}

/** Persist pricing preferences to IndexedDB. */
export function savePricing(pricing: PricingSettings): Promise<unknown> {
  return setSetting(APP_CONFIG.settingsKeys.pricing, pricing);
}

/** Effective DP discount for a row: its own override, else the global default. */
export function effectiveDpPct(id: string, pricing: PricingSettings): number {
  const own = pricing.overrides[id]?.dp;
  return clampPct(own ?? pricing.defaultDpPct);
}

/** Effective RCP discount for a row: its own override, else the global default. */
export function effectiveRcpPct(id: string, pricing: PricingSettings): number {
  const own = pricing.overrides[id]?.rcp;
  return clampPct(own ?? pricing.defaultRcpPct);
}

/**
 * Dealer/customer prices plus both discounted figures for one row:
 *   - dpFinal  = dealer price after the DP discount (your net cost)
 *   - rcpFinal = customer price after the RCP discount
 *   - margin   = rcpFinal − dpFinal (only when both prices exist)
 *
 * Each figure reflects the ACTUAL price printed in the PDF: RCP has no dealer
 * fallback, so a list without an RCP column (e.g. Kelly) simply shows no
 * customer price rather than reusing the dealer price.
 */
export function computeRowPricing(record: DataRecord, pricing: PricingSettings): RowPricing {
  const dp = record.dp ?? (record.fields ? dealerPrice(record.fields) : null);
  const rcp = record.rcp ?? (record.fields ? retailPrice(record.fields) : null);
  const dpPct = effectiveDpPct(record.id, pricing);
  const rcpPct = effectiveRcpPct(record.id, pricing);

  const dpFinal = dp !== null ? Math.round(dp * (1 - dpPct / 100)) : null;
  const rcpFinal = rcp !== null ? Math.round(rcp * (1 - rcpPct / 100)) : null;
  const margin = rcpFinal !== null && dpFinal !== null ? rcpFinal - dpFinal : null;

  const ov = pricing.overrides[record.id];
  return {
    dp,
    rcp,
    dpPct,
    rcpPct,
    dpFinal,
    rcpFinal,
    margin,
    dpOverridden: ov?.dp !== undefined,
    rcpOverridden: ov?.rcp !== undefined,
  };
}
