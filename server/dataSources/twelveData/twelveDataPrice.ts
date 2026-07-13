import { MarketTick } from "../dataSourceTypes";
import { getTwelveDataConfig, fetchTwelveData, normalizeSymbolToTwelveData, normalizeSymbolFromTwelveData } from "./twelveDataClient";
import { recordTwelveDataSuccess, recordTwelveDataFailure } from "./twelveDataHealth";

const latestTicks: Record<string, MarketTick> = {};
let lastFetchTime: number = 0;

export async function syncAllTwelveDataPrices(): Promise<void> {
  const config = getTwelveDataConfig();
  if (!config.isConfigured) {
    return;
  }

  try {
    const symbolString = config.symbols.join(",");
    const data = await fetchTwelveData("price", { symbol: symbolString });

    const now = Date.now();
    const timeStr = new Date(now).toISOString();

    if (config.symbols.length === 1) {
      // Single symbol response format: { price: "1.08420" }
      const sym = config.symbols[0];
      const priceVal = parseFloat(data.price);
      if (!isNaN(priceVal)) {
        const oandaKey = normalizeSymbolFromTwelveData(sym);
        const isJpy = oandaKey.includes("JPY");
        const pipSize = isJpy ? 0.01 : 0.0001;
        const spread = pipSize * 1.5;

        latestTicks[oandaKey] = {
          instrument: oandaKey,
          mid: priceVal,
          bid: priceVal - spread / 2,
          ask: priceVal + spread / 2,
          time: timeStr,
          timestamp: now,
          source: "twelvedata_rest",
          provider: "twelvedata",
          receivedAt: now
        };
      }
    } else {
      // Multiple symbols response format: { "EUR/USD": { price: "1.0842" }, ... }
      Object.entries(data).forEach(([sym, val]: [string, any]) => {
        if (val && val.price) {
          const priceVal = parseFloat(val.price);
          if (!isNaN(priceVal)) {
            const oandaKey = normalizeSymbolFromTwelveData(sym);
            const isJpy = oandaKey.includes("JPY");
            const pipSize = isJpy ? 0.01 : 0.0001;
            const spread = pipSize * 1.5;

            latestTicks[oandaKey] = {
              instrument: oandaKey,
              mid: priceVal,
              bid: priceVal - spread / 2,
              ask: priceVal + spread / 2,
              time: timeStr,
              timestamp: now,
              source: "twelvedata_rest",
              provider: "twelvedata",
              receivedAt: now
            };
          }
        }
      });
    }

    lastFetchTime = now;
    recordTwelveDataSuccess();
  } catch (error: any) {
    const msg = error.message || String(error);
    const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("limit") || msg.toLowerCase().includes("request");
    if (isRateLimit) {
      console.log("[MarketData] Feed sync status: pending cooldown.");
    } else {
      console.log("[MarketData] Feed sync status: pending refresh.");
    }
    recordTwelveDataFailure(msg);
    throw error;
  }
}

export function getLatestTwelveDataTickSync(symbol: string): MarketTick | null {
  const oandaKey = symbol.replace("/", "_");
  return latestTicks[oandaKey] || null;
}

export async function getLatestTwelveDataTick(symbol: string): Promise<MarketTick | null> {
  const config = getTwelveDataConfig();
  if (!config.isConfigured) {
    return null;
  }

  const oandaKey = symbol.replace("/", "_");
  const cachedTick = latestTicks[oandaKey];

  const now = Date.now();
  if (!cachedTick || (now - lastFetchTime > 25000)) {
    try {
      await syncAllTwelveDataPrices();
    } catch (e) {
      // Ignore sync error and return cached if available
    }
  }

  return latestTicks[oandaKey] || null;
}
