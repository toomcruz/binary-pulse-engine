/**
 * Numeric formatting helpers.
 *
 * Contract mapping (audit):
 *  - technicalScore, regimeConfidence  : score 0-100          -> formatScore / `X/100`
 *  - calibratedProbability             : ratio 0-1 | null      -> formatRatioAsPercent / "Indisponível"
 *  - winRate                           : percent 0-100 | null  -> formatPercent100
 *  - payout                            : ratio 0-1             -> formatRatioAsPercent
 *  - buyerSentiment / sellerSentiment  : percent 0-100         -> formatPercent100 + clampPercent for widths
 *  - avgConfidence                     : percent 0-100 | null  -> formatPercent100
 *  - progress bars width               : percent 0-100         -> clampPercent
 *  - price                             : monetary              -> formatPrice(value, decimals)
 *  - counts, sample sizes              : integer               -> formatInteger
 *
 * Rules:
 *  - 0 stays 0 ("0%", "0/100", "0")
 *  - null / undefined / NaN / Infinity render as "—"
 *  - Never `value || 0` for numeric values.
 *  - Never `calibratedProbability || technicalScore`.
 *  - Never auto-scale a value < 1 as a percent — use formatRatioAsPercent explicitly.
 */

export function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Value already expressed as a percentage in [0, 100] (may exceed). */
export function formatPercent100(value: unknown, decimals = 0): string {
  const n = finiteNumber(value);
  return n === null ? "—" : `${n.toFixed(decimals)}%`;
}

/** Value expressed as a ratio in [0, 1]; multiplied by 100 for display. */
export function formatRatioAsPercent(value: unknown, decimals = 0): string {
  const n = finiteNumber(value);
  return n === null ? "—" : `${(n * 100).toFixed(decimals)}%`;
}

/** Technical score in [0, 100] — always paired with "/100" downstream. */
export function formatScore(value: unknown): string {
  const n = finiteNumber(value);
  return n === null ? "—" : `${Math.round(n)}`;
}

/** Monetary / price value, fixed decimals. */
export function formatPrice(value: unknown, decimals = 2): string {
  const n = finiteNumber(value);
  return n === null ? "—" : n.toFixed(decimals);
}

/** Integer count. */
export function formatInteger(value: unknown): string {
  const n = finiteNumber(value);
  return n === null ? "—" : `${Math.trunc(n)}`;
}

/** Safe number formatter with fixed decimals (non-percent). */
export function formatNumber(value: unknown, decimals = 2): string {
  const n = finiteNumber(value);
  return n === null ? "—" : n.toFixed(decimals);
}

/**
 * Safe width in percent for CSS bars. Input MUST already be in the 0-100
 * domain. Clamps to [0, 100]; non-finite / null → 0 (never NaN%, never
 * Infinity%, never negative).
 */
export function clampPercent(value: unknown): number {
  const n = finiteNumber(value);
  if (n === null) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Backwards-compat alias — same behaviour as formatPercent100.
 * Kept because earlier iteration exported `formatPercent`.
 */
export const formatPercent = formatPercent100;
