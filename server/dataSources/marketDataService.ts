import { MarketTick, MarketDataHealth } from "./dataSourceTypes";
import { getFastForexHealth } from "./fastForex/fastForexHealth";
import { getCachedFastForexTick, getFastForexPrice } from "./fastForex/fastForexPrice";
import { isFastForexConfigured } from "./fastForex/fastForexClient";

let streamInitializationStarted = false;

async function syncAllFastForexPrices() {
  let symbolsStr = process.env.FASTFOREX_SYMBOLS_FOREX || "EUR/USD,GBP/USD,USD/JPY,EUR/GBP,AUD/USD,USD/CAD";
  if (symbolsStr.includes("FASTFOREX_SYMBOLS_FOREX=")) {
    symbolsStr = symbolsStr.replace("FASTFOREX_SYMBOLS_FOREX=", "");
  }
  let cryptoStr = process.env.FASTFOREX_SYMBOLS_CRYPTO || "BTC/USD,ETH/USD,XRP/USD,SOL/USD";
  if (cryptoStr.includes("FASTFOREX_SYMBOLS_CRYPTO=")) {
    cryptoStr = cryptoStr.replace("FASTFOREX_SYMBOLS_CRYPTO=", "");
  }
  const allSymbols = [...symbolsStr.split(","), ...cryptoStr.split(",")].map(s => s.trim()).filter(Boolean);
  
  for (const sym of allSymbols) {
    await getFastForexPrice(sym);
    // basic throttle
    await new Promise(r => setTimeout(r, 1600));
  }
}

export function initMarketDataService() {
  if (streamInitializationStarted) return;
  streamInitializationStarted = true;

  if (isFastForexConfigured()) {
    console.log("[MarketData] Initializing real-time FastForex price sync...");
    syncAllFastForexPrices().catch(() => {});
    // Polling every 15 seconds per batch
    setInterval(() => {
      syncAllFastForexPrices().catch(() => {});
    }, 15000);
  }
}

export function ensureOandaStreamStarted() {
  initMarketDataService();
}

export function normalizeInstrumentName(inst: string): string {
  let upper = inst.toUpperCase().trim();
  if (upper.includes("/")) return upper;
  if (upper.includes("-")) return upper.replace("-", "/");
  if (upper.length === 6) {
    return upper.slice(0, 3) + "/" + upper.slice(3);
  }
  return upper;
}

export function getLatestTick(instrument: string): MarketTick | null {
  const normInstrument = normalizeInstrumentName(instrument);
  if (isFastForexConfigured()) {
    return getCachedFastForexTick(normInstrument);
  }
  return null;
}

export function getMarketDataHealth(instrument?: string): MarketDataHealth {
  const normInstrument = instrument ? normalizeInstrumentName(instrument) : undefined;
  
  if (isFastForexConfigured()) {
    const ffHealth = getFastForexHealth(normInstrument);
    if (ffHealth.isConnected && !ffHealth.isStaleData && !ffHealth.error) {
      return { ...ffHealth, configured: true };
    }

    return {
      provider: "fastforex",
      dataSourceType: "fastforex_rest",
      isConnected: false,
      lastRealTickAt: ffHealth.lastRealTickAt || null,
      dataAgeMs: ffHealth.dataAgeMs || null,
      isStaleData: true,
      isSyntheticData: false,
      connectionStatus: ffHealth.error ? "ERROR" : "STALE",
      feedMode: "rest_polling",
      error: ffHealth.error || "FastForex feed unavailable or stale.",
      configured: true
    };
  }

  return {
    provider: "fastforex",
    dataSourceType: "fastforex_rest",
    isConnected: false,
    lastRealTickAt: null,
    dataAgeMs: null,
    isStaleData: true,
    isSyntheticData: false,
    connectionStatus: "NOT_CONFIGURED",
    feedMode: "rest_polling",
    error: "FastForex not configured. Please supply FASTFOREX_API_KEY.",
    configured: false
  };
}
