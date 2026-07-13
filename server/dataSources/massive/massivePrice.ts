import { MarketTick } from "../dataSourceTypes";
import { getMassiveConfig, fetchMassive, normalizeSymbolToPolygon } from "./massiveClient";
import { recordMassiveSuccess, recordMassiveFailure } from "./massiveHealth";
import { mapForexQuoteToTick, mapCryptoTradeToTick } from "./massiveMapper";

const latestTicks: Record<string, MarketTick> = {};
let lastFetchTime: number = 0;

export async function syncAllMassivePrices(): Promise<void> {
  const config = getMassiveConfig();
  if (!config.isConfigured) {
    return;
  }

  const now = Date.now();
  const timeStr = new Date(now).toISOString();

  try {
    // Attempt Snapshot fetching (high efficiency, fits within 5 req/min easily!)
    let snapshotSucceeded = false;
    try {
      // 1. Forex Snapshot
      const fxData = await fetchMassive("/v2/snapshot/locale/global/markets/forex/tickers");
      if (fxData && Array.isArray(fxData.tickers)) {
        fxData.tickers.forEach((tickerObj: any) => {
          const rawSymbol = tickerObj.ticker; // e.g. "C:EURUSD"
          if (rawSymbol.startsWith("C:")) {
            const cleanSymbol = rawSymbol.slice(2); // "EURUSD"
            if (cleanSymbol.length === 6) {
              const oandaKey = `${cleanSymbol.slice(0, 3)}_${cleanSymbol.slice(3)}`;
              // Is JPY pair?
              const isJpy = oandaKey.includes("JPY");
              const pipSize = isJpy ? 0.01 : 0.0001;
              const spread = pipSize * 1.5;
              const priceVal = tickerObj.lastQuote?.a ? (tickerObj.lastQuote.a + tickerObj.lastQuote.b) / 2 : tickerObj.min?.c || tickerObj.prevClose;
              
              if (priceVal && !isNaN(priceVal)) {
                latestTicks[oandaKey] = {
                  instrument: oandaKey,
                  mid: priceVal,
                  bid: tickerObj.lastQuote?.b || (priceVal - spread / 2),
                  ask: tickerObj.lastQuote?.a || (priceVal + spread / 2),
                  time: timeStr,
                  timestamp: now,
                  source: "massive_rest",
                  provider: "massive",
                  receivedAt: now
                };
              }
            }
          }
        });
        snapshotSucceeded = true;
      }

      // 2. Crypto Snapshot
      const cryptoData = await fetchMassive("/v2/snapshot/locale/global/markets/crypto/tickers");
      if (cryptoData && Array.isArray(cryptoData.tickers)) {
        cryptoData.tickers.forEach((tickerObj: any) => {
          const rawSymbol = tickerObj.ticker; // e.g. "X:BTCUSD"
          if (rawSymbol.startsWith("X:")) {
            const cleanSymbol = rawSymbol.slice(2); // "BTCUSD"
            // Find base asset e.g. "BTC" or "ETH" from ticker
            let oandaKey = "";
            if (cleanSymbol.endsWith("USD")) {
              oandaKey = `${cleanSymbol.replace("USD", "")}_USD`;
            } else {
              oandaKey = `${cleanSymbol.slice(0, 3)}_${cleanSymbol.slice(3)}`;
            }

            const priceVal = tickerObj.lastTrade?.p || tickerObj.min?.c || tickerObj.prevClose;
            if (priceVal && !isNaN(priceVal)) {
              const spread = priceVal * 0.0001;
              latestTicks[oandaKey] = {
                instrument: oandaKey,
                mid: priceVal,
                bid: priceVal - spread / 2,
                ask: priceVal + spread / 2,
                time: timeStr,
                timestamp: now,
                source: "massive_rest",
                provider: "massive",
                receivedAt: now
              };
            }
          }
        });
        snapshotSucceeded = true;
      }
    } catch (snapErr) {
      // Snapshot failed, fallback to individual fetching
      console.log("[Massive Price Sync] Snapshot failed, using individual fallback...");
    }

    if (!snapshotSucceeded) {
      // Fetch individually for Forex
      for (const symbol of config.symbolsForex) {
        try {
          const { from, to } = normalizeSymbolToPolygon(symbol);
          const response = await fetchMassive(`/v1/last/currencies/${from}/${to}`);
          const tick = mapForexQuoteToTick(symbol, response);
          latestTicks[tick.instrument] = tick;
        } catch (err: any) {
          console.warn(`[Massive Price Sync] Failed to sync forex ${symbol}:`, err.message || err);
        }
      }

      // Fetch individually for Crypto
      for (const symbol of config.symbolsCrypto) {
        try {
          const { from, to } = normalizeSymbolToPolygon(symbol);
          const response = await fetchMassive(`/v1/last/crypto/${from}/${to}`);
          const tick = mapCryptoTradeToTick(symbol, response);
          latestTicks[tick.instrument] = tick;
        } catch (err: any) {
          console.warn(`[Massive Price Sync] Failed to sync crypto ${symbol}:`, err.message || err);
        }
      }
    }

    lastFetchTime = now;
    recordMassiveSuccess();
  } catch (error: any) {
    const msg = error.message || String(error);
    console.warn("[Massive Price Sync Error]:", msg);
    recordMassiveFailure(msg);
    throw error;
  }
}

export function getLatestMassiveTickSync(symbol: string): MarketTick | null {
  const key = symbol.replace("/", "_").toUpperCase();
  return latestTicks[key] || null;
}

export async function getLatestMassiveTick(symbol: string): Promise<MarketTick | null> {
  const config = getMassiveConfig();
  if (!config.isConfigured) {
    return null;
  }

  const key = symbol.replace("/", "_").toUpperCase();
  const cachedTick = latestTicks[key];

  const now = Date.now();
  // Sync if empty or cache is older than 25 seconds
  if (!cachedTick || (now - lastFetchTime > 25000)) {
    try {
      await syncAllMassivePrices();
    } catch (e) {
      // Return cached tick if available
    }
  }

  return latestTicks[key] || null;
}
