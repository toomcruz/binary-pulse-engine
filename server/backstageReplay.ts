import { runSignalEngine } from './engine';
import { Candle, BackstageReplaySignal } from './types';
import { populateIndicators } from './indicators';
import { registerTradeResult, resetCalibrationSessionForReplay } from './calibration';
import { resetRegimeState, createRegimeStateKey } from './regimeEngine';
import crypto from 'crypto';


const STRATEGY_MAP: Record<string, string> = {
  reversion: "extremeRetrace",
  trend: "trendFollow",
  price_action: "priceActionClassic",
  breakout: "dynamicBreakout",
  candle_flow: "candleFlow",
  order_block: "orderBlock",
  liquidity_sweep: "liquiditySweep",
  fvg: "fairValueGap" // Wait, fvg or fairValueGap? Let's check engine triggers.
};

export interface InvalidExpiryGapEvent {
  timestamp: string;
  entryTimestamp: string;
  asset: string;
  timeframe: string;
  strategy: string;
  signal: "CALL" | "PUT";
  phase: "train" | "validation";
  reason: "INVALID_EXPIRY_GAP";
  expectedMs: number;
  actualMs: number;
}

export function getExpectedExpiryMs(timeframe: string): number {
  return timeframe === "M5" ? 300000 : 60000;
}

export function runBackstageReplay({
  asset,
  timeframe,
  candles,
  strategy,
  precisionLevel
}: {
  asset: string;
  timeframe: string;
  candles: Candle[];
  strategy: string;
  precisionLevel?: string;
}): { results: BackstageReplaySignal[], trainSignals: number, invalidExpiryGaps: number, invalidExpiryGapEvents: InvalidExpiryGapEvent[], datasetHash: string, configurationHash: string, resultsHash: string } {
  
  // 1. validar OHLC finito; 2. exigir high >= open/close/low; 3. exigir low <= open/close/high; 4. ordenar por timestamp; 5. deduplicar; 6. remover incompletos;
  function hasValidTimestamp(candle: Candle): candle is Candle & { timestamp: number } {
    return typeof candle.timestamp === "number" && Number.isFinite(candle.timestamp);
  }

  const uniqueCandles = new Map<number, Candle & { timestamp: number }>();
  for (const c of candles) {
    if (c && hasValidTimestamp(c) && c.complete === true && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close)) {
      if (c.high >= c.open && c.high >= c.close && c.high >= c.low && c.low <= c.open && c.low <= c.close && c.low <= c.high) {
        uniqueCandles.set(c.timestamp, c);
      }
    }
  }
  const validCandles = Array.from(uniqueCandles.values()).sort((a, b) => a.timestamp - b.timestamp);

  
  // Require at least 100 closed candles for a meaningful split
  if (validCandles.length < 100) {
    throw new Error("MARKET_CANDLES_UNAVAILABLE");
  }

  // Pre-calculate indicators for the entire valid set.
  // Because populateIndicators computes causally from index 0 to N without looking ahead,
  // we can do this once safely.
  const allEnriched = populateIndicators([...validCandles]);

  const results: BackstageReplaySignal[] = [];
  const invalidExpiryGapEvents: InvalidExpiryGapEvent[] = [];
  let trainSignalsCount = 0;
  
  // MIN_LOOKBACK is needed for indicator calculation
  const MIN_LOOKBACK = 35;
  const splitIndex = Math.floor(validCandles.length * 0.7);

  const engineVersion = "v3.8-fastforex-backstage";
  
  // Reset states before replay for determinism
  const stateKey = createRegimeStateKey(asset, timeframe, "OPEN", engineVersion, "backstage");
  resetRegimeState(stateKey);
  // Also reset calibration if supported
  resetCalibrationSessionForReplay(asset, timeframe, engineVersion);

  const gap = 5; // Gap between train and validation


  for (let i = MIN_LOOKBACK; i < validCandles.length - 1; i++) {
    // The engine only sees historySlice (from index 0 up to index i inclusive)
    const historySlice = allEnriched.slice(0, i + 1);
    const currentCandle = historySlice[historySlice.length - 1];
    
    // The next candle (i+1) is used as the entry/exit/future candle for result evaluation
    const entryCandle = validCandles[i + 1];
    const exitCandle = validCandles[i + 1];

    
    if (i >= splitIndex && i < splitIndex + gap) continue; // Gap
  const isTrainPhase = i < splitIndex;
    const decision = runSignalEngine(
      asset,
      timeframe,
      currentCandle.close,
      historySlice,
      null,
      {
        newsRisk: "LOW",
        session: "OVERLAP",
        minutesToHighImpactNews: 120,
        includesActiveCandle: false,
        isSyntheticData: false,
        isStaleData: false,
        validationMode: "backstage",
        marketType: "OPEN",
        executionMode: "backstage",
        dataSourceType: "fastforex_rest",
        priceProvider: "fastforex",
        configured: true,
        hasToken: true,
        hasAccountId: true,
        dataAgeMs: 1,
        disableConsecutiveLossVeto: true,
        disableCalibrationVeto: isTrainPhase,
        engineVersion: engineVersion,
        strategyMode: strategy
      },
      0
    );

    if (decision.signal === "NEUTRAL") continue;
    const expectedStrategy = STRATEGY_MAP[strategy] || strategy;
    if (strategy && strategy !== "all" && strategy !== "auto" && decision.strategy !== expectedStrategy) continue;

    const expectedExpiryMs = getExpectedExpiryMs(timeframe);
    const actualExpiryMs = entryCandle.timestamp - currentCandle.timestamp;
    if (actualExpiryMs !== expectedExpiryMs) {
      invalidExpiryGapEvents.push({
        timestamp: currentCandle.time
          ? new Date(currentCandle.time).toISOString()
          : `unknown-date-${i}`,
        entryTimestamp: entryCandle.time
          ? new Date(entryCandle.time).toISOString()
          : `unknown-entry-date-${i + 1}`,
        asset,
        timeframe,
        strategy: decision.strategy,
        signal: decision.signal,
        phase: isTrainPhase ? "train" : "validation",
        reason: "INVALID_EXPIRY_GAP",
        expectedMs: expectedExpiryMs,
        actualMs: actualExpiryMs
      });
      continue;
    }

    const entryPrice = entryCandle.open;
    const exitPrice = exitCandle.close;
    const entryTimestamp = entryCandle.time
      ? new Date(entryCandle.time).toISOString()
      : new Date(entryCandle.timestamp).toISOString();
    const expiryTimestamp = new Date(entryCandle.timestamp + expectedExpiryMs).toISOString();

    let result: "WIN" | "LOSS" | "DRAW" = "DRAW";
    if (decision.signal === "CALL") {
      result = exitPrice > entryPrice ? "WIN" : exitPrice < entryPrice ? "LOSS" : "DRAW";
    } else if (decision.signal === "PUT") {
      result = exitPrice < entryPrice ? "WIN" : exitPrice > entryPrice ? "LOSS" : "DRAW";
    }

    if (i < splitIndex) {
      // TRAIN/CALIBRATION phase
      if (result && decision.regime) {
        registerTradeResult(asset, timeframe, decision.strategy, decision.regime, engineVersion, result);
        trainSignalsCount++;
      }
    } else {
      // OUT-OF-SAMPLE VALIDATION phase
      const replayDate = currentCandle.time
        ? new Date(currentCandle.time).toISOString()
        : `unknown-date-${i}`;
      
      const dedupeKey = `${asset}-${timeframe}-${decision.strategy}-${decision.signal}-${replayDate}-${i}`;
      results.push({
        id: `bs-replay-${Buffer.from(dedupeKey).toString('base64').substring(0, 16)}`,
        dedupeKey,
        engineVersion: engineVersion,
        validationSource: "fastforex_historical_closed_candles",
        dataSourceType: "fastforex_rest",
        historicalDataProvider: "fastforex",
        timestamp: replayDate,
        asset,
        timeframe,
        strategy: decision.strategy,
        signal: decision.signal,
        technicalScore: decision.technicalScore,
        calibratedProbability: decision.calibratedProbability,
            calibrationAvailable: decision.calibrationAvailable,
        sampleSize: decision.sampleSize,
        reliabilityScore: decision.reliabilityScore,
        regime: decision.regime,
        entryPrice,
        entryTimestamp,
        exitPrice,
        expiryTimestamp,
        result,
        reason: decision.reasons || [],
      });
    }
  }

  
  // Generate Dataset Hash
  const hashCandles = validCandles.map(c => ({
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume ?? null,
    complete: c.complete
  }));
  const configurationHash = crypto.createHash('sha256').update(JSON.stringify({ asset, timeframe, strategy, engineVersion: "v3.8-fastforex-backstage" })).digest('hex').substring(0, 16);
  const datasetHash = crypto.createHash('sha256').update(JSON.stringify(hashCandles)).digest('hex').substring(0, 16);
  
  const resultsHashData = results.map(r => ({
    timestamp: r.timestamp,
    strategy: r.strategy,
    signal: r.signal,
    entryPrice: r.entryPrice,
    exitPrice: r.exitPrice,
    entryTimestamp: r.entryTimestamp,
    expiryTimestamp: r.expiryTimestamp,
    result: r.result
  }));
  const resultsHash = crypto.createHash('sha256').update(JSON.stringify(resultsHashData)).digest('hex').substring(0, 16);
  
  return { results, trainSignals: trainSignalsCount, invalidExpiryGaps: invalidExpiryGapEvents.length, invalidExpiryGapEvents, datasetHash, configurationHash, resultsHash };

}
