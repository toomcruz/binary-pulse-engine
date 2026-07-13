import { MarketTick, DataSourceType } from "../dataSourceTypes";
import { FASTFOREX_API_KEY, FASTFOREX_BASE_URL, isFastForexConfigured, normalizeSymbolToFastForex, isCryptoSymbol } from "./fastForexClient";
import { fetchWithTimeout, isFastForexTimeoutError } from "./fetchWithTimeout";
import { mapFastForexQuoteToTick } from "./fastForexMapper";


// Local cache for price
let latestTicks: Record<string, MarketTick> = {};
let lastFetchTime: Record<string, number> = {};

export async function getFastForexPrice(symbol: string): Promise<MarketTick | null> {
  if (!isFastForexConfigured()) {
    console.warn("[FastForex] API Key not configured.");
    return null;
  }

  const now = Date.now();
  // Throttle per symbol to max 1 request every 1.5s
  if (lastFetchTime[symbol] && now - lastFetchTime[symbol] < 1500) {
    return latestTicks[symbol] || null;
  }
  
  lastFetchTime[symbol] = now;

  try {
    const isCrypto = isCryptoSymbol(symbol);
    const ffSymbol = normalizeSymbolToFastForex(symbol);
    const pairStr = ffSymbol.replace("-", "/");

    if (isCrypto) {
      // Crypto symbol: fetch using fetch-one
      const parts = symbol.toUpperCase().split(/[/|-]/);
      const fromCurrency = parts[0] || "BTC";
      const toCurrency = parts[1] || "USD";
      const url = `${FASTFOREX_BASE_URL}/fetch-one?from=${encodeURIComponent(fromCurrency)}&to=${encodeURIComponent(toCurrency)}&api_key=${FASTFOREX_API_KEY}`;

      const response = await fetchWithTimeout(url, {
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        console.warn(`[FastForex] fetch-one error for crypto ${symbol}: ${response.status} ${response.statusText}`);
        return latestTicks[symbol] || null;
      }

      const data = (await response.json()) as any;
      if (data && data.result) {
        const priceVal = data.result[toCurrency];
        if (priceVal !== undefined) {
          const mid = Number(priceVal);
          const rawTsp = data.updated;
          let timestamp = Date.now();
          if (rawTsp) {
            const dObj = new Date(rawTsp);
            if (!isNaN(dObj.getTime())) {
              timestamp = dObj.getTime();
            }
          }
          const tick: MarketTick = {
            instrument: symbol.replace("-", "/").toUpperCase(),
            bid: mid,
            ask: mid,
            mid: mid,
            time: new Date(timestamp).toISOString(),
            timestamp,
            source: "fastforex_rest" as DataSourceType,
            provider: "fastforex" as const,
            receivedAt: Date.now()
          };
          latestTicks[symbol] = tick;
          return tick;
        }
      }
      console.warn(`[FastForex] Unexpected result format for crypto ${symbol}:`, data);
      return latestTicks[symbol] || null;
    } else {
      // Forex symbol: fetch using fx/quote (with "pairs" param instead of "pair")
      const url = `${FASTFOREX_BASE_URL}/fx/quote?pairs=${encodeURIComponent(pairStr)}&api_key=${FASTFOREX_API_KEY}`;

      const response = await fetchWithTimeout(url, {
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        console.warn(`[FastForex] fx/quote error for ${symbol}: ${response.status} ${response.statusText}`);
        return latestTicks[symbol] || null;
      }

      const data = (await response.json()) as any;
      
      // Support either direct single-quote object, or the "quotes" root object
      let singleQuoteData = data;
      if (data && data.quotes) {
        const key = ffSymbol.replace("-", "").toUpperCase();
        if (data.quotes[key]) {
          singleQuoteData = data.quotes[key];
        } else {
          const firstKey = Object.keys(data.quotes)[0];
          if (firstKey) {
            singleQuoteData = data.quotes[firstKey];
          }
        }
      }

      const tick = mapFastForexQuoteToTick(symbol, singleQuoteData);
      latestTicks[symbol] = tick;
      return tick;
    }
  } catch (error) {
    if (isFastForexTimeoutError(error)) {
      throw error;
    }
    console.error(`[FastForex] Error fetching price for ${symbol}:`, error);
  }
  
  return latestTicks[symbol] || null;
}

export function getCachedFastForexTick(symbol: string): MarketTick | null {
  return latestTicks[symbol] || null;
}

export function getAllCachedFastForexTicks(): Record<string, MarketTick> {
  return latestTicks;
}
