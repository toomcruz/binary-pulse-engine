import { MarketDataHealth } from "../dataSourceTypes";
import { isFastForexConfigured } from "./fastForexClient";
import { getCachedFastForexTick, getAllCachedFastForexTicks } from "./fastForexPrice";

export function getFastForexHealth(instrument?: string): MarketDataHealth {
  const isConfigured = isFastForexConfigured();

  if (!isConfigured) {
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
      error: "FastForex is not configured.",
      configured: false
    };
  }

  let lastTickAt: number | null = null;
  let dataAgeMs: number | null = null;
  let isStaleData = true;

  if (instrument) {
    const tick = getCachedFastForexTick(instrument);
    if (tick && tick.receivedAt) {
      lastTickAt = tick.receivedAt;
      dataAgeMs = Date.now() - tick.receivedAt;
      isStaleData = dataAgeMs > 45000;
    }
  } else {
    const allTicks = getAllCachedFastForexTicks();
    const ticks = Object.values(allTicks);
    if (ticks.length > 0) {
      // Find the most recent tick
      const newestTick = ticks.reduce((prev, current) => {
        return (prev.receivedAt > current.receivedAt) ? prev : current;
      });
      if (newestTick && newestTick.receivedAt) {
        lastTickAt = newestTick.receivedAt;
        dataAgeMs = Date.now() - newestTick.receivedAt;
        isStaleData = dataAgeMs > 45000;
      }
    }
  }

  return {
    provider: "fastforex",
    dataSourceType: "fastforex_rest",
    isConnected: !isStaleData,
    lastRealTickAt: lastTickAt,
    dataAgeMs,
    isStaleData,
    isSyntheticData: false,
    connectionStatus: isStaleData ? "STALE" : "CONNECTED",
    feedMode: "rest_polling",
    error: isStaleData ? "FastForex data is stale or unavailable." : undefined,
    configured: true
  };
}
