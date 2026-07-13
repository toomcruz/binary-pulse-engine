import { MarketCandle } from "../dataSourceTypes";
import { getTwelveDataConfig, fetchTwelveData, normalizeSymbolToTwelveData, normalizeSymbolFromTwelveData } from "./twelveDataClient";
import { recordTwelveDataSuccess, recordTwelveDataFailure } from "./twelveDataHealth";

export async function fetchTwelveDataCandles(params: {
  instrument: string; // e.g., EUR_USD or EUR/USD
  granularity: "M1" | "M5" | "1min" | "5min";
  count?: number;
}): Promise<MarketCandle[]> {
  const config = getTwelveDataConfig();
  if (!config.isConfigured) {
    throw new Error("MARKET_CANDLES_UNAVAILABLE");
  }

  const symbol = normalizeSymbolToTwelveData(params.instrument);
  const rawInterval = params.granularity;
  const interval = (rawInterval === "M1" || rawInterval === "1min") ? "1min" : "5min";
  const mappedGranularity = interval === "1min" ? "M1" : "M5";
  const outputsize = params.count || 500;

  try {
    const data = await fetchTwelveData("time_series", {
      symbol,
      interval,
      outputsize: outputsize.toString()
    });

    if (!data || !Array.isArray(data.values)) {
      throw new Error("MARKET_CANDLES_UNAVAILABLE");
    }

    // Map and parse the values
    const candles: MarketCandle[] = data.values.map((val: any) => {
      const dateObj = new Date(val.datetime);
      const timestamp = dateObj.getTime();

      return {
        time: val.datetime,
        timestamp,
        open: parseFloat(val.open),
        high: parseFloat(val.high),
        low: parseFloat(val.low),
        close: parseFloat(val.close),
        volume: val.volume ? parseInt(val.volume, 10) : undefined,
        complete: true,
        source: "twelvedata_rest",
        provider: "twelvedata",
        instrument: normalizeSymbolFromTwelveData(symbol),
        granularity: mappedGranularity,
        priceType: "mid"
      };
    }).filter((c: any) => !isNaN(c.open) && !isNaN(c.close));

    // Sort ascending (oldest first) as expected by backtesting/technical indicators
    candles.sort((a, b) => a.timestamp - b.timestamp);

    recordTwelveDataSuccess();
    return candles;
  } catch (error: any) {
    console.error("[Twelve Data Candles Fetch Error]:", error);
    recordTwelveDataFailure(error.message || String(error));
    throw new Error("MARKET_CANDLES_UNAVAILABLE");
  }
}
