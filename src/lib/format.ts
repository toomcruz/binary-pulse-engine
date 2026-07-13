/**
 * Numeric formatting helpers.
 *
 * Rules:
 *  - 0 renders as "0%"
 *  - null / undefined / NaN / Infinity render as "—"
 *  - Never use `value || fallback` for numeric values elsewhere; use these helpers.
 */

export function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatPercent(value: unknown, decimals = 0): string {
  const n = finiteNumber(value);
  return n === null ? "—" : `${n.toFixed(decimals)}%`;
}

export function formatNumber(value: unknown, decimals = 2): string {
  const n = finiteNumber(value);
  return n === null ? "—" : n.toFixed(decimals);
}

/** Safe percentage for width/CSS. Clamped to [0, 100]. */
export function clampPercent(value: unknown): number {
  const n = finiteNumber(value);
  if (n === null) return 0;
  return Math.max(0, Math.min(100, n));
}
