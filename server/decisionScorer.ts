import { Candle, MarketContext } from "./types";
import { RegimeResult } from "./types";
import { StrategyRoute } from "./strategyRouter";
import { detectPivots } from "./marketStructure";

export interface DirectionScore {
  structure: number;
  priceAction: number;
  momentum: number;
  volatilityTiming: number;
  higherTimeframe: number;
  context: number;
  penalties: number;
  total: number;
  reasons: string[];
  counterEvidence: string[];
}

export interface EntryQualityResult {
  regimeCompatibility: number;
  structuralLocation: number;
  triggerQuality: number;
  availableSpace: number;
  timingQuality: number;
  multiTimeframeAgreement: number;
  directionalSeparation: number;
  penalties: number;
  total: number;
  reasons: string[];
  blockers: string[];
}

export function calculateLevels(candles: Candle[]) {
  const pivots = detectPivots(candles, 5, 5);
  const currentPrice = candles[candles.length - 1].close;
  const atr = candles[candles.length - 1].atr || 0.0001;

  let nearestSupport: number | null = null;
  let nearestResistance: number | null = null;

  pivots.forEach(p => {
    if (p.type === "LOW" && p.price < currentPrice) {
      if (nearestSupport === null || p.price > nearestSupport) nearestSupport = p.price;
    }
    if (p.type === "HIGH" && p.price > currentPrice) {
      if (nearestResistance === null || p.price < nearestResistance) nearestResistance = p.price;
    }
  });

  const distSupport = nearestSupport !== null ? (currentPrice - nearestSupport) / atr : null;
  const distResistance = nearestResistance !== null ? (nearestResistance - currentPrice) / atr : null;

  return {
    supportAvailable: nearestSupport !== null,
    resistanceAvailable: nearestResistance !== null,
    support: nearestSupport,
    resistance: nearestResistance,
    supportStrength: nearestSupport !== null ? 1 : 0,
    resistanceStrength: nearestResistance !== null ? 1 : 0,
    distanceToSupportAtr: distSupport,
    distanceToResistanceAtr: distResistance
  };
}

export function calculateCallScore(
  candles: Candle[],
  higherTimeframeCandles: Candle[] | null,
  regime: RegimeResult
): DirectionScore {
  const reasons: string[] = [];
  const counterEvidence: string[] = [];
  let penalties = 0;

  if (candles.length < 2) {
    return { structure: 0, priceAction: 0, momentum: 0, volatilityTiming: 0, higherTimeframe: 0, context: 0, penalties: 0, total: 0, reasons: ["Dados insuficientes"], counterEvidence: [] };
  }

  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  // 1. Structure (0-30)
  let structure = 0;
  if (current.ema9 && current.sma21 && current.ema9 > current.sma21) {
    structure += 15;
    reasons.push("EMA 9 acima da SMA 21 (Estrutura de Alta).");
  } else {
    counterEvidence.push("EMA 9 abaixo da SMA 21 (Estrutura não favorável para CALL).");
  }
  if (current.close > (current.ema50 || current.sma21 || current.close)) {
    structure += 15;
    reasons.push("Preço acima da média de longo prazo.");
  }

  // 2. Price Action (0-25)
  let priceAction = 0;
  if (current.close > current.open) {
    priceAction += 15;
    reasons.push("Última vela fechou positiva (bullish).");
  } else {
    counterEvidence.push("Última vela fechou negativa (bearish).");
  }
  if (prev.close > prev.open) {
    priceAction += 10;
  }

  // 3. Momentum (0-15)
  let momentum = 0;
  if (current.rsi !== undefined) {
    if (current.rsi > 50 && current.rsi < 70) {
      momentum += 15;
      reasons.push(`RSI saudável a favor da alta (${current.rsi.toFixed(1)}).`);
    } else if (current.rsi >= 70) {
      counterEvidence.push("RSI sobrecomprado (risco de exaustão).");
      penalties += 10;
    } else {
      counterEvidence.push("RSI em região vendedora (< 50).");
    }
  }

  // 4. Volatility & Timing (0-15)
  let volatilityTiming = 0;
  if (regime.atrPercentile > 0.3 && regime.atrPercentile < 0.8) {
    volatilityTiming += 15;
    reasons.push("Volatilidade em nível saudável para progressão direcional.");
  }

  // 5. Higher Timeframe (0-10)
  let higherTimeframe = 0;
  if (higherTimeframeCandles && higherTimeframeCandles.length > 2) {
    const htf = higherTimeframeCandles[higherTimeframeCandles.length - 1];
    if (htf.close > htf.open && htf.ema9 && htf.sma21 && htf.ema9 > htf.sma21) {
      higherTimeframe += 10;
      reasons.push("Timeframe superior confirma tendência de alta.");
    }
  } else {
    counterEvidence.push("Sem dados suficientes do timeframe superior.");
  }

  // 6. Context (0-5)
  let context = 0;
  const levels = calculateLevels(candles);
  if (!levels.resistanceAvailable) {
    context = 0;
    counterEvidence.push("Resistência não disponível.");
  } else if (levels.distanceToResistanceAtr !== null && levels.distanceToResistanceAtr > 2) {
    context += 5;
    reasons.push("Espaço suficiente até a próxima resistência.");
  } else {
    counterEvidence.push("Preço próximo à resistência.");
    penalties += 15;
  }

  if (regime.regime === "TREND_DOWN" || regime.regime === "BREAKOUT_DOWN") {
    penalties += 30;
    counterEvidence.push("Regime de mercado desfavorável para CALL.");
  }

  const total = Math.max(0, structure + priceAction + momentum + volatilityTiming + higherTimeframe + context - penalties);
  return { structure, priceAction, momentum, volatilityTiming, higherTimeframe, context, penalties, total, reasons, counterEvidence };
}

export function calculatePutScore(
  candles: Candle[],
  higherTimeframeCandles: Candle[] | null,
  regime: RegimeResult
): DirectionScore {
  const reasons: string[] = [];
  const counterEvidence: string[] = [];
  let penalties = 0;

  if (candles.length < 2) {
    return { structure: 0, priceAction: 0, momentum: 0, volatilityTiming: 0, higherTimeframe: 0, context: 0, penalties: 0, total: 0, reasons: ["Dados insuficientes"], counterEvidence: [] };
  }

  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  // 1. Structure (0-30)
  let structure = 0;
  if (current.ema9 && current.sma21 && current.ema9 < current.sma21) {
    structure += 15;
    reasons.push("EMA 9 abaixo da SMA 21 (Estrutura de Baixa).");
  } else {
    counterEvidence.push("EMA 9 acima da SMA 21 (Estrutura não favorável para PUT).");
  }
  if (current.close < (current.ema50 || current.sma21 || current.close)) {
    structure += 15;
    reasons.push("Preço abaixo da média de longo prazo.");
  }

  // 2. Price Action (0-25)
  let priceAction = 0;
  if (current.close < current.open) {
    priceAction += 15;
    reasons.push("Última vela fechou negativa (bearish).");
  } else {
    counterEvidence.push("Última vela fechou positiva (bullish).");
  }
  if (prev.close < prev.open) {
    priceAction += 10;
  }

  // 3. Momentum (0-15)
  let momentum = 0;
  if (current.rsi !== undefined) {
    if (current.rsi < 50 && current.rsi > 30) {
      momentum += 15;
      reasons.push(`RSI saudável a favor da baixa (${current.rsi.toFixed(1)}).`);
    } else if (current.rsi <= 30) {
      counterEvidence.push("RSI sobrevendido (risco de exaustão).");
      penalties += 10;
    } else {
      counterEvidence.push("RSI em região compradora (> 50).");
    }
  }

  // 4. Volatility & Timing (0-15)
  let volatilityTiming = 0;
  if (regime.atrPercentile > 0.3 && regime.atrPercentile < 0.8) {
    volatilityTiming += 15;
    reasons.push("Volatilidade em nível saudável para progressão direcional.");
  }

  // 5. Higher Timeframe (0-10)
  let higherTimeframe = 0;
  if (higherTimeframeCandles && higherTimeframeCandles.length > 2) {
    const htf = higherTimeframeCandles[higherTimeframeCandles.length - 1];
    if (htf.close < htf.open && htf.ema9 && htf.sma21 && htf.ema9 < htf.sma21) {
      higherTimeframe += 10;
      reasons.push("Timeframe superior confirma tendência de baixa.");
    }
  } else {
    counterEvidence.push("Sem dados suficientes do timeframe superior.");
  }

  // 6. Context (0-5)
  let context = 0;
  const levels = calculateLevels(candles);
  if (!levels.supportAvailable) {
    context = 0;
    counterEvidence.push("Suporte não disponível.");
  } else if (levels.distanceToSupportAtr !== null && levels.distanceToSupportAtr > 2) {
    context += 5;
    reasons.push("Espaço suficiente até o próximo suporte.");
  } else {
    counterEvidence.push("Preço próximo ao suporte.");
    penalties += 15;
  }

  if (regime.regime === "TREND_UP" || regime.regime === "BREAKOUT_UP") {
    penalties += 30;
    counterEvidence.push("Regime de mercado desfavorável para PUT.");
  }

  const total = Math.max(0, structure + priceAction + momentum + volatilityTiming + higherTimeframe + context - penalties);
  return { structure, priceAction, momentum, volatilityTiming, higherTimeframe, context, penalties, total, reasons, counterEvidence };
}

export function calculateEntryQuality(
  candles: Candle[],
  callScore: DirectionScore,
  putScore: DirectionScore,
  regime: RegimeResult,
  route: StrategyRoute
): number {
  let quality = 0;
  
  const compResult: EntryQualityResult = {
    regimeCompatibility: 0,
    structuralLocation: 0,
    triggerQuality: 0,
    availableSpace: 0,
    timingQuality: 0,
    multiTimeframeAgreement: 0,
    directionalSeparation: 0,
    penalties: 0,
    total: 0,
    reasons: [],
    blockers: []
  };

  if (route.preferredDirection === "NONE") {
    return 0; // Blocked
  }

  compResult.regimeCompatibility = regime.regimeConfidence * 25;

  const diff = Math.abs(callScore.total - putScore.total);
  if (diff > 30) compResult.directionalSeparation = 20;
  else if (diff > 15) compResult.directionalSeparation = 10;

  const levels = calculateLevels(candles);
  if (route.preferredDirection === "CALL") {
    if (levels.resistanceAvailable && levels.distanceToResistanceAtr !== null) {
        if (levels.distanceToResistanceAtr > 3) compResult.availableSpace = 20;
        else if (levels.distanceToResistanceAtr > 1.5) compResult.availableSpace = 10;
      }
    if (levels.supportAvailable && levels.distanceToSupportAtr !== null && levels.distanceToSupportAtr < 1) compResult.structuralLocation = 15;
  } else if (route.preferredDirection === "PUT") {
    if (levels.supportAvailable && levels.distanceToSupportAtr !== null) {
        if (levels.distanceToSupportAtr > 3) compResult.availableSpace = 20;
        else if (levels.distanceToSupportAtr > 1.5) compResult.availableSpace = 10;
      }
    if (levels.resistanceAvailable && levels.distanceToResistanceAtr !== null && levels.distanceToResistanceAtr < 1) compResult.structuralLocation = 15;
  }

  if (regime.atrPercentile > 0.3 && regime.atrPercentile < 0.8) {
    compResult.timingQuality = 20;
  }

  const baseQuality = 
    compResult.regimeCompatibility + 
    compResult.structuralLocation + 
    compResult.availableSpace + 
    compResult.timingQuality + 
    compResult.directionalSeparation;

  quality = Math.max(0, Math.min(100, Math.round(baseQuality)));

  return quality;
}
