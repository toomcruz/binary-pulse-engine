import { MarketDataHealth } from "../dataSourceTypes";
import { getTwelveDataConfig } from "./twelveDataClient";

let lastSuccessTime: number = 0;
let lastError: string | null = null;

export function recordTwelveDataSuccess() {
  lastSuccessTime = Date.now();
  lastError = null;
}

export function recordTwelveDataFailure(err: string) {
  lastError = err;
}

export function getTwelveDataHealth(instrument?: string): MarketDataHealth {
  const config = getTwelveDataConfig();
  if (!config.isConfigured) {
    return {
      provider: "twelvedata",
      dataSourceType: "twelvedata_rest",
      isConnected: false,
      lastRealTickAt: null,
      dataAgeMs: null,
      isStaleData: true,
      isSyntheticData: false,
      connectionStatus: "DISCONNECTED",
      feedMode: "rest_polling",
      error: "TWELVE_DATA_NOT_CONFIGURED"
    };
  }

  const now = Date.now();
  const hasRecentSuccess = lastSuccessTime > 0 && (now - lastSuccessTime < 60000);
  const isStale = lastSuccessTime === 0 || (now - lastSuccessTime > 30000);
  
  return {
    provider: "twelvedata",
    dataSourceType: "twelvedata_rest",
    isConnected: hasRecentSuccess && !lastError,
    lastRealTickAt: lastSuccessTime > 0 ? lastSuccessTime : null,
    dataAgeMs: lastSuccessTime > 0 ? now - lastSuccessTime : null,
    isStaleData: isStale,
    isSyntheticData: false,
    connectionStatus: lastError ? "ERROR" : (isStale ? "STALE" : "CONNECTED"),
    feedMode: "rest_polling",
    error: lastError || undefined
  };
}
