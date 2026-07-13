import { populateIndicators } from "./indicators";
import { aggregateStrict } from "./utils/aggregator";
import { 
  MarketFeatures, 
  RegimeLabel, 
  TriggerEvaluation, 
  FinalSignalDecision, 
  Candle, 
  MarketContext 
} from './types';
import { extractFeatures } from './features';
import { checkDataIntegrity } from './dataIntegrityGate';
import { detectMarketRegime, RegimeStateManager, defaultRegimeThresholds } from './regimeEngine';
import { routeStrategies } from './strategyRouter';
import { calculateCallScore, calculatePutScore, calculateEntryQuality, calculateLevels } from "./decisionScorer";

import { evaluateExtremeRetrace } from './triggers/extremeRetrace';
import { evaluateTrendFollow } from './triggers/trendFollow';
import { evaluatePriceActionClassic } from './triggers/priceActionClassic';
import { evaluateDynamicBreakout } from './triggers/dynamicBreakout';
import { evaluateCandleFlow } from './triggers/candleFlow';
import { evaluateOrderBlock } from './triggers/orderBlock';
import { evaluateLiquiditySweep } from './triggers/liquiditySweep';
import { evaluateFairValueGap } from './triggers/fairValueGap';
import { applyMetaFilters } from './metaFilters';
import { calibrateProbability } from './calibration';
import { detectDrift } from './drift';
import { finalDecision } from './decisionPolicy';

import { getRegimeStateManager, createRegimeStateKey } from './regimeEngine';
import { defaultDecisionThresholds } from './types';



export function runSignalEngine(
  asset: string,
  timeframe: string,
  currentPrice: number,
  candles: Candle[],
  higherTimeframeCandles: Candle[] | null,
  marketContext: MarketContext,
  consecutiveLossCount: number = 0
): any {
  
  // 1. Validação dos dados (DataIntegrityGate)
  const integrity = checkDataIntegrity(asset, timeframe, candles, marketContext);
  if (integrity.status === "BLOCKED") {
    return {
    
      signal: 'NEUTRAL',
      strategy: 'N/A',
      regime: 'TRANSITION',
      technicalScore: 0,
      calibratedProbability: null,
      calibrationAvailable: false,
      reliabilityScore: 0,
      sampleSize: 0,
      historicalWinRate: 0,
      vetoReasons: [`VETO INTEGRITY: ${integrity.reasons.join(" | ")}`],
      keyLevels: null,
      driftFlag: false,
      driftReason: null,
      reasons: integrity.reasons,
      gateStatus: integrity.status
    };
  }

  // 2. Cálculo das features
  let features: MarketFeatures;
  try {
    features = extractFeatures(asset, timeframe, currentPrice, candles, marketContext);
  } catch (e: any) {
    return {
      signal: 'NEUTRAL',
      strategy: 'N/A',
      regime: 'TRANSITION',
      technicalScore: 0,
      calibratedProbability: null,
      calibrationAvailable: false,
      reliabilityScore: 0,
      sampleSize: 0,
      historicalWinRate: 0,
      vetoReasons: [`VETO FEATURES: ${e.message}`],
      driftFlag: false,
      driftReason: null,
      reasons: ["Não há dados de vela suficientes para análise estrutural."],
      gateStatus: "BLOCKED"
    };
  }

  // 3. Regime Engine & Histerese
  const stateKey = createRegimeStateKey(asset, timeframe, marketContext.marketType || "OPEN", marketContext.engineVersion || "v1.0", marketContext.executionMode);
  const stateManager = getRegimeStateManager(stateKey);
  
  let resolvedHtfCandles = higherTimeframeCandles;
  let htfStatus = "PROVIDED";
  
  if (!resolvedHtfCandles || resolvedHtfCandles.length === 0) {
    const lastCandle = candles[candles.length - 1];
    const sourceDurationMs = timeframe === "M1" ? 60_000 : timeframe === "M5" ? 300_000 : 0;
    const analysisTime = marketContext.executionMode === "live" ? Date.now() : ((lastCandle?.timestamp || Date.now()) + sourceDurationMs);
    
    if (timeframe === "M1") {
      resolvedHtfCandles = aggregateStrict(features.candles || candles, 1, 5, analysisTime).candles;
      htfStatus = "AGGREGATED_M5";
    } else if (timeframe === "M5") {
      resolvedHtfCandles = aggregateStrict(features.candles || candles, 5, 15, analysisTime).candles;
      htfStatus = "AGGREGATED_M15";
    } else {
      htfStatus = "UNSUPPORTED_TIMEFRAME";
    }
  }
  if (!resolvedHtfCandles || resolvedHtfCandles.length < 10) {
     resolvedHtfCandles = null; // Ensure we don't pass junk
     htfStatus = "INSUFFICIENT_DATA";
  }

  const rawRegimeResult = detectMarketRegime(features.candles || candles, resolvedHtfCandles, defaultRegimeThresholds, stateManager.getHistoricalRegimes());
  const regimeResult = stateManager.update(rawRegimeResult, defaultRegimeThresholds);
  
  // Backwards compatibility for old regime label
  let oldRegime: RegimeLabel = "chaos";
  if (regimeResult.regime.includes("TREND")) oldRegime = "trend";
  else if (regimeResult.regime.includes("BREAKOUT")) oldRegime = "breakoutCandidate";
  else if (regimeResult.regime === "COMPRESSION") oldRegime = "compression";
  else if (regimeResult.regime === "RANGE") oldRegime = "range";

  // 4. Strategy Router
  const route = routeStrategies(regimeResult.regime);

  // Selecionar SOMENTE estratégias permitidas pelo regime
  const evaluators: Record<string, Function> = {
    "reversion": evaluateExtremeRetrace,
    "trend": evaluateTrendFollow,
    "price_action": evaluatePriceActionClassic,
    "breakout": evaluateDynamicBreakout,
    "candle_flow": evaluateCandleFlow,
    "order_block": evaluateOrderBlock,
    "liquidity_sweep": evaluateLiquiditySweep,
    "fvg": evaluateFairValueGap
  };

  let rawEvaluations: TriggerEvaluation[] = [];
  
  let targetStrategies = route.allowedStrategies;
  if (marketContext.strategyMode && marketContext.strategyMode !== "all" && marketContext.strategyMode !== "auto") {
    if (!targetStrategies.includes(marketContext.strategyMode)) {
      return {
        signal: 'NEUTRAL',
        strategy: 'N/A',
        regime: regimeResult.regime,
        technicalScore: 0,
        calibratedProbability: null,
        calibrationAvailable: false,
        reliabilityScore: 0,
        sampleSize: 0,
        historicalWinRate: 0,
        vetoReasons: [`Estratégia solicitada (${marketContext.strategyMode}) é incompatível com o regime (${regimeResult.regime}).`],
        driftFlag: false,
        driftReason: null,
        reasons: ["requested_strategy_incompatible_with_regime"],
        gateStatus: "BLOCKED"
      };
    }
    targetStrategies = [marketContext.strategyMode];
  }

  for (const strat of targetStrategies) {
    if (evaluators[strat]) {
      rawEvaluations.push(evaluators[strat](features, oldRegime));
    }
  }

  if (rawEvaluations.length === 0) {
     rawEvaluations.push({ strategy: "N/A", signal: "NEUTRAL", technicalScore: 0, reasons: ["Nenhuma estratégia compatível com o regime atual."] });
  }

  // 5. Score CALL e Score PUT (Base scoring)
  const callScore = calculateCallScore(features.candles || candles, resolvedHtfCandles, regimeResult);
  const putScore = calculatePutScore(features.candles || candles, resolvedHtfCandles, regimeResult);
  
  // Agregar o peso das estratégias nos scores direcionais
  let stratCallBonus = 0;
  let stratPutBonus = 0;
  let activeStrategy = "N/A";
  let maxStratScore = 0;
  
  for (const ev of rawEvaluations) {
     if (ev.signal === "CALL") {
       stratCallBonus += ev.technicalScore;
       if (ev.technicalScore > maxStratScore) { maxStratScore = ev.technicalScore; activeStrategy = ev.strategy; }
       callScore.reasons.push(...ev.reasons);
     } else if (ev.signal === "PUT") {
       stratPutBonus += ev.technicalScore;
       if (ev.technicalScore > maxStratScore) { maxStratScore = ev.technicalScore; activeStrategy = ev.strategy; }
       putScore.reasons.push(...ev.reasons);
     }
  }
  
  // Normalizar bônus de estratégia
  callScore.total = Math.min(100, callScore.total + (stratCallBonus * 0.5));
  putScore.total = Math.min(100, putScore.total + (stratPutBonus * 0.5));

  // 6. Qualidade da entrada
  const entryQuality = calculateEntryQuality(features.candles || candles, callScore, putScore, regimeResult, route);

  // 7. CALL, PUT ou SEM SINAL
  let finalSignal: "CALL" | "PUT" | "NEUTRAL" = "NEUTRAL";
  let finalConfidence = 0;
  let blockReasons: string[] = [];
  let confirmations: string[] = [];
  let counterEvidence: string[] = [];

  const precisionProfiles = {
    normal: {
      minRegimeConfidence: 0.50,
      minEntryQuality: 60,
      minDirectionScore: 60,
      minDirectionalDifference: 10
    },
    high: {
      minRegimeConfidence: 0.60,
      minEntryQuality: 70,
      minDirectionScore: 70,
      minDirectionalDifference: 15
    },
    elite: {
      minRegimeConfidence: 0.70,
      minEntryQuality: 80,
      minDirectionScore: 80,
      minDirectionalDifference: 20
    }
  };

  const precision = marketContext.precisionLevel || "high";
  const profile = precisionProfiles[precision] || precisionProfiles.high;

  const minQuality = profile.minEntryQuality;
  const minScore = profile.minDirectionScore;
  const minRegimeConf = profile.minRegimeConfidence;
  const minDiff = profile.minDirectionalDifference;

  if (route.preferredDirection === "NONE") {
    blockReasons.push(...route.reasons);
  } else {
    const diff = Math.abs(callScore.total - putScore.total);
    let winningScore = 0;
    let attemptedSignal = "NEUTRAL";
    let scoreReasons: string[] = [];
    let scoreCounter: string[] = [];

    if (callScore.total > putScore.total && (route.preferredDirection === "CALL" || route.preferredDirection === "BOTH")) {
       winningScore = callScore.total;
       attemptedSignal = "CALL";
       scoreReasons = callScore.reasons;
       scoreCounter = callScore.counterEvidence;
    } else if (putScore.total > callScore.total && (route.preferredDirection === "PUT" || route.preferredDirection === "BOTH")) {
       winningScore = putScore.total;
       attemptedSignal = "PUT";
       scoreReasons = putScore.reasons;
       scoreCounter = putScore.counterEvidence;
    } else {
       blockReasons.push("Conflito direcional ou empate técnico.");
    }

    if (attemptedSignal !== "NEUTRAL") {
      let allowed = true;
      if (regimeResult.regimeConfidence < minRegimeConf) {
         allowed = false;
         blockReasons.push(`Confiança do regime (${Math.round(regimeResult.regimeConfidence*100)}%) abaixo do mínimo (${Math.round(minRegimeConf*100)}%).`);
      }
      if (entryQuality < minQuality) {
         allowed = false;
         blockReasons.push(`Qualidade da entrada (${Math.round(entryQuality)}) abaixo do mínimo (${minQuality}).`);
      }
      if (winningScore < minScore) {
         allowed = false;
         blockReasons.push(`Score direcional (${Math.round(winningScore)}) abaixo do mínimo (${minScore}).`);
      }
      if (diff < minDiff) {
         allowed = false;
         blockReasons.push(`Diferença direcional (${Math.round(diff)}) abaixo do mínimo (${minDiff}).`);
      }

      if (allowed) {
         finalSignal = attemptedSignal as "CALL" | "PUT";
         finalConfidence = Math.min(100, Math.round((winningScore + entryQuality) / 2));
         confirmations = scoreReasons;
         counterEvidence = scoreCounter;
      }
    }
  }

  // 8. Meta-Filters & Calibration & Drift for compatibility
  const vetoResult = applyMetaFilters(features, oldRegime, rawEvaluations, consecutiveLossCount);
  if (vetoResult.vetoed) {
     finalSignal = "NEUTRAL";
     blockReasons.push(...vetoResult.vetoReasons);
  }
  
  const calib = calibrateProbability(features.asset, features.timeframe, activeStrategy, oldRegime, marketContext.engineVersion || "v1.0", finalConfidence);
  const sampleSize = calib.sampleSize;
  const historicalWinRate = calib.historicalWinRate;
  const calibratedProbability = sampleSize > 0 ? calib.calibratedProbability : null;

  const drift = detectDrift(activeStrategy, features.asset, 0, 0);
  const mtfStatus = htfStatus || "UNKNOWN";
  const mtfTimeframe = resolvedHtfCandles ? (timeframe === "M1" ? "M5" : "M15") : null;
  const computedLevels = calculateLevels(features.candles || candles);


  const reasonsOut = finalSignal === "NEUTRAL" ? blockReasons : confirmations;

  return {
    signal: finalSignal,
    strategy: activeStrategy,
    regime: regimeResult.regime,
    technicalScore: finalConfidence,
    calibratedProbability: calib.calibratedProbability,
    calibrationAvailable: calib.calibrationAvailable || false,
    reliabilityScore: entryQuality,
    sampleSize: sampleSize,
    historicalWinRate: historicalWinRate,
    vetoReasons: finalSignal === "NEUTRAL" ? blockReasons : [],
    driftFlag: drift.driftFlag,
    higherTimeframeStatus: mtfStatus,
    higherTimeframe: mtfTimeframe,
    higherRegime: rawRegimeResult.higherRegime || "UNKNOWN",
    keyLevels: computedLevels,
    multiTimeframeAgreement: rawRegimeResult.multiTimeframeAgreement || 0,
    multiTimeframeConflict: rawRegimeResult.multiTimeframeConflict || false,
    driftReason: drift.driftReason,
    reasons: reasonsOut,
    gateStatus: integrity.status,
    regimeResult,
    route,
    callScore,
    putScore,
    entryQuality,
    confirmations,
    counterEvidence,
    blockReasons
  };
}
