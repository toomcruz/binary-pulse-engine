import { MarketCandle } from "../dataSourceTypes";
import { getMassiveConfig, fetchMassive, normalizeSymbolToPolygon, normalizeSymbolFromPolygon } from "./massiveClient";
import { recordMassiveSuccess, recordMassiveFailure } from "./massiveHealth";
import { mapPolygonAggsToCandles } from "./massiveMapper";

export async function fetchMassiveCandles(params: {
  instrument: string; // e.g., EUR_USD or EUR/USD
  granularity: "M1" | "M5" | "1min" | "5min";
  count?: number;
}): Promise<MarketCandle[]> {
  const config = getMassiveConfig();
  if (!config.isConfigured) {
    throw new Error("MARKET_CANDLES_UNAVAILABLE");
  }

  const { ticker } = normalizeSymbolToPolygon(params.instrument);
  const rawInterval = params.granularity;
  const isM1 = rawInterval === "M1" || rawInterval === "1min";
  
  const multiplier = isM1 ? 1 : 5;
  const timespan = "minute";
  const limit = params.count || 500;

  // Calculate dynamic timeframe based on limit (with extra padding to ensure we get exactly 'limit' closed candles)
  const nowMs = Date.now();
  const minutesNeeded = limit * multiplier;
  const extraPaddingMs = 2 * 60 * 60 * 1000; // 2 hours of padding
  const fromMs = nowMs - (minutesNeeded * 60 * 1000) - extraPaddingMs;

  try {
    // Aggregates Endpoint: /v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}
    // We can pass Unix millisecond timestamps directly as the {from} and {to} parameters in Polygon.
    const endpoint = `/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${fromMs}/${nowMs}`;
    
    const data = await fetchMassive(endpoint, {
      adjusted: "true",
      sort: "asc",
      limit: limit.toString()
    });

    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
      throw new Error("MARKET_CANDLES_UNAVAILABLE");
    }

    const candles = mapPolygonAggsToCandles(params.instrument, data.results, isM1 ? "M1" : "M5");

    // Ensure we have sorted correctly (ascending)
    candles.sort((a, b) => a.timestamp - b.timestamp);

    // Limit to the exact count requested
    const trimmedCandles = candles.slice(-limit);

    recordMassiveSuccess();
    return trimmedCandles;
  } catch (error: any) {
    console.error("[Massive Candles Fetch Error]:", error);
    recordMassiveFailure(error.message || String(error));
    throw new Error("MARKET_CANDLES_UNAVAILABLE");
  }
}
