import { finiteNumber, formatInteger, formatNumber, formatRatioAsPercent } from "./format";
import type { ReplayEconomicMetrics, ReplayEconomicStatus } from "../types";

export type { ReplayEconomicMetrics, ReplayEconomicStatus };

export function parsePayoutPercentInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const normalized = trimmed.replace("%", "").replace(",", ".");
  const percent = Number(normalized);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("PAYOUT_PERCENT_OUT_OF_RANGE");
  }
  return percent / 100;
}

export function buildBackstageReplayPayload(input: {
  asset: string;
  timeframe: string;
  strategy: string;
  precisionLevel: string;
  payoutPercentInput: string;
}) {
  const payout = parsePayoutPercentInput(input.payoutPercentInput);
  return {
    asset: input.asset,
    timeframe: input.timeframe,
    strategy: input.strategy,
    precisionLevel: input.precisionLevel,
    ...(payout === undefined ? {} : { payout })
  };
}

export function translateEconomicStatus(status: ReplayEconomicStatus | string | null | undefined): string {
  switch (status) {
    case "ECONOMICALLY_PROFITABLE":
      return "Lucrativo";
    case "ECONOMICALLY_UNPROFITABLE":
      return "Não lucrativo";
    case "ECONOMIC_METRICS_UNAVAILABLE":
    default:
      return "Métricas indisponíveis";
  }
}

export function formatSignedNumber(value: unknown, decimals = 2): string {
  const n = finiteNumber(value);
  if (n === null) return "—";
  const formatted = formatNumber(n, decimals);
  return n > 0 ? `+${formatted}` : formatted;
}

export function formatReplayEconomicMetric(key: keyof ReplayEconomicMetrics, value: unknown): string {
  switch (key) {
    case "payout":
    case "breakEvenWinRate":
      return formatRatioAsPercent(value, 2);
    case "roiPercent": {
      const n = finiteNumber(value);
      return n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
    }
    case "grossProfit":
    case "netProfit":
    case "expectedValuePerTrade":
      return formatSignedNumber(value, 2);
    case "grossLoss":
      return formatNumber(value, 2);
    case "decidedTrades":
    case "draws":
      return formatInteger(value);
    default:
      return finiteNumber(value) === null ? "—" : String(value);
  }
}
