import { DriftStatus } from './types';

export function detectDrift(
  strategy: string,
  asset: string,
  recentWinRate: number,
  longTermWinRate: number
): DriftStatus {
  // Drift detection requires real historical data
  return { 
    driftFlag: false, 
    driftReason: "drift_unavailable_insufficient_history" 
  };
}
