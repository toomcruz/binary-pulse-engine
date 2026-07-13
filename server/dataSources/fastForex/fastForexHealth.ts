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
        return ((prev.receivedAt ?? 0) > (current.receivedAt ?? 0)) ? prev : current;
      });
      if (newestTick && newestTick.receivedAt) {
        lastTickAt = newestTick.receivedAt;
        dataAgeMs = Date.now() - newestTick.receivedAt;
        isStaleData = dataAgeMs > 45000;
      }
    }
  }

  const hasEverReceivedTick = lastTickAt !== null;
  const connectionStatus: MarketDataHealth["connectionStatus"] = !hasEverReceivedTick
    ? "UNAVAILABLE"
    : isStaleData
      ? "STALE"
      : "CONNECTED";

  const errorMessage = !hasEverReceivedTick
    ? "FastForex feed has not delivered a tick yet (polling pending or upstream unavailable)."
    : isStaleData
      ? "FastForex data is stale (last tick older than 45s)."
      : undefined;

  return {
    provider: "fastforex",
    dataSourceType: "fastforex_rest",
    isConnected: hasEverReceivedTick && !isStaleData,
    lastRealTickAt: lastTickAt,
    dataAgeMs,
    isStaleData,
    isSyntheticData: false,
    connectionStatus,
    feedMode: "rest_polling",
    error: errorMessage,
    configured: true
  };
}
