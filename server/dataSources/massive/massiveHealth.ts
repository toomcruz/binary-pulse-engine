import { MarketDataHealth } from "../dataSourceTypes";

let isMassiveConnected = false;
let lastMassiveTickAt: number | null = null;
let lastMassiveError: string | null = null;
let consecutiveMassiveFailures = 0;

export function recordMassiveSuccess(): void {
  isMassiveConnected = true;
  lastMassiveTickAt = Date.now();
  lastMassiveError = null;
  consecutiveMassiveFailures = 0;
}

export function recordMassiveFailure(error: string): void {
  consecutiveMassiveFailures++;
  lastMassiveError = error;
  if (consecutiveMassiveFailures >= 3) {
    isMassiveConnected = false;
  }
}

export function getMassiveHealth(symbol?: string): MarketDataHealth {
  const now = Date.now();
  const dataAgeMs = lastMassiveTickAt ? now - lastMassiveTickAt : null;
  const isStale = dataAgeMs !== null && dataAgeMs > 45000; // Stale after 10 seconds per requirements

  return {
    provider: "massive",
    dataSourceType: "massive_rest",
    isConnected: isMassiveConnected && !isStale,
    lastRealTickAt: lastMassiveTickAt,
    dataAgeMs,
    isStaleData: isStale,
    isSyntheticData: false,
    connectionStatus: (isMassiveConnected && !isStale) ? "CONNECTED" : isStale ? "STALE" : lastMassiveError ? "ERROR" : "CONNECTING",
    feedMode: "rest_polling",
    error: lastMassiveError || undefined
  };
}
