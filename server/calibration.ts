import { CalibrationResult, RegimeLabel } from './types';

export interface CalibrationRecord {
  asset: string;
  timeframe: string;
  strategy: string;
  regime: RegimeLabel;
  engineVersion: string;
  wins: number;
  losses: number;
  draws: number;
}

let calibrationDb: Record<string, CalibrationRecord> = {};

export function resetCalibrationSession() {
  calibrationDb = {};
}

export function registerTradeResult(
  asset: string,
  timeframe: string,
  strategy: string,
  regime: RegimeLabel,
  engineVersion: string,
  result: "WIN" | "LOSS" | "DRAW"
) {
  const cleanAsset = asset.replace("-", "/").toUpperCase();
  const cleanTf = timeframe.toUpperCase();
  const key = `${cleanAsset}|${cleanTf}|${strategy}|${engineVersion}|${regime}`;
  
  if (!calibrationDb[key]) {
    calibrationDb[key] = {
      asset: cleanAsset,
      timeframe: cleanTf,
      strategy,
      regime,
      engineVersion,
      wins: 0,
      losses: 0,
      draws: 0
    };
  }
  
  if (result === "WIN") {
    calibrationDb[key].wins++;
  } else if (result === "LOSS") {
    calibrationDb[key].losses++;
  } else if (result === "DRAW") {
    calibrationDb[key].draws++;
  }
}

export function calibrateProbability(
  asset: string,
  timeframe: string,
  strategy: string,
  regime: RegimeLabel,
  engineVersion: string,
  technicalScore: number
): CalibrationResult & { calibrationSource: "none" | "paper_trading" | "backtest_validated" | "backstage_train" } {
  const cleanAsset = asset.replace("-", "/").toUpperCase();
  const cleanTf = timeframe.toUpperCase();
  const key = `${cleanAsset}|${cleanTf}|${strategy}|${engineVersion}|${regime}`;
  const record = calibrationDb[key];
  
  if (!record) {
    return {
      calibratedProbability: null,
      calibrationAvailable: false,
      reliabilityScore: 0,
      sampleSize: 0,
      historicalWinRate: 0,
      hasSufficientHistory: false,
      historyStatusMsg: "Histórico insuficiente para assertividade estatística",
      calibrationSource: "none"
    };
  }

  const wins = record.wins;
  const losses = record.losses;
  const draws = record.draws;
  const sampleSize = wins + losses;
  const historicalWinRate = sampleSize > 0 ? (wins / sampleSize) * 100 : 0;
  
  const hasSufficientHistory = sampleSize >= 30;
  const historyStatusMsg = hasSufficientHistory 
    ? `Histórico estatístico real baseado em ${sampleSize} operações`
    : "Histórico insuficiente para assertividade estatística";

  const sampleWeight = Math.min(1, sampleSize / 100); 
  const winRateWeight = Math.max(0, (historicalWinRate - 50) / 50); 
  const reliabilityScore = Math.round((sampleWeight * 0.4 + winRateWeight * 0.6) * 100);

  const rawProbability = historicalWinRate * 0.7 + technicalScore * 0.3;
  const calibratedProbability = hasSufficientHistory ? Math.min(100, Math.max(0, Math.round(rawProbability))) : null;

  return {
    calibratedProbability,
    calibrationAvailable: hasSufficientHistory,
    reliabilityScore,
    sampleSize,
    historicalWinRate,
    hasSufficientHistory,
    historyStatusMsg,
    calibrationSource: hasSufficientHistory ? "backstage_train" : "none"
  };
}

export function resetCalibrationSessionForReplay(asset: string, timeframe: string, engineVersion: string) {
  const cleanAsset = asset.replace("-", "/").toUpperCase();
  const cleanTf = timeframe.toUpperCase();
  const prefix = `${cleanAsset}|${cleanTf}`;
  for (const key of Object.keys(calibrationDb)) {
    if (key.startsWith(prefix) && key.includes(engineVersion)) {
      delete calibrationDb[key];
    }
  }
}
