import { MarketFeatures, RegimeLabel, TriggerEvaluation, Candle } from '../types';

export function evaluateDynamicBreakout(features: MarketFeatures, regime: RegimeLabel): TriggerEvaluation {
  const { closedCandle, indicators, candles = [] } = features;
  const { bollinger, atr } = indicators;
  const currentPrice = closedCandle.close;
  
  const evalResult: TriggerEvaluation = {
    strategy: 'dynamicBreakout',
    signal: 'NEUTRAL',
    technicalScore: 0,
    reasons: []
  };

  if (regime !== 'breakoutCandidate' && regime !== 'trend') {
    evalResult.reasons.push("Regime incompatível. Requer breakoutCandidate ou trend.");
    return evalResult;
  }

  // Volatility Filter (ATR low blocks, ATR extreme blocks)
  const relativeAtr = atr / currentPrice;
  if (relativeAtr < 0.0001) {
    evalResult.reasons.push("FILTRO: Baixa volatilidade bloqueia operação de breakout.");
    return evalResult;
  }

  let isCall = false;
  let isPut = false;
  let score = 50;

  // 1. FVG DETECTION (Fair Value Gap) - Imbalance detection
  let fvgBullishRetest = false;
  let fvgBearishRetest = false;

  if (candles.length >= 4) {
    // We check the 3 previous candles for FVG imbalance
    const c1 = candles[candles.length - 4];
    const c2 = candles[candles.length - 3];
    const c3 = candles[candles.length - 2];

    // Bullish FVG Imbalance: c1.high < c3.low
    const bullishImbalance = c1.high < c3.low;
    if (bullishImbalance) {
      // Retest: closedCandle touches this gap zone and rejects
      const gapMin = c1.high;
      const gapMax = c3.low;
      if (closedCandle.low <= gapMax && closedCandle.close >= gapMin && closedCandle.close > closedCandle.open) {
        fvgBullishRetest = true;
        evalResult.reasons.push("FVG de Alta detectado (imbalance preenchido com confirmação de alta).");
      }
    }

    // Bearish FVG Imbalance: c1.low > c3.high
    const bearishImbalance = c1.low > c3.high;
    if (bearishImbalance) {
      // Retest: closedCandle touches this gap zone and rejects
      const gapMin = c3.high;
      const gapMax = c1.low;
      if (closedCandle.high >= gapMin && closedCandle.close <= gapMax && closedCandle.close < closedCandle.open) {
        fvgBearishRetest = true;
        evalResult.reasons.push("FVG de Baixa detectado (imbalance preenchido com confirmação de baixa).");
      }
    }
  }

  const bodySize = Math.abs(closedCandle.close - closedCandle.open);
  const upperShadow = closedCandle.high - Math.max(closedCandle.open, closedCandle.close);
  const lowerShadow = Math.min(closedCandle.open, closedCandle.close) - closedCandle.low;

  // 2. STANDARD BOLLINGER BREAKOUTS
  if (closedCandle.close > bollinger.upper && closedCandle.close > closedCandle.open) {
    if (upperShadow < bodySize * 0.5) { // Body dominates
      isCall = true;
      score += 30;
      evalResult.reasons.push("Rompimento de banda superior com corpo forte (BOS confirmado).");
    } else {
      evalResult.reasons.push("Rompimento ignorado devido a pavio superior longo (possível falso rompimento).");
    }
  }

  if (closedCandle.close < bollinger.lower && closedCandle.close < closedCandle.open) {
    if (lowerShadow < bodySize * 0.5) {
      isPut = true;
      score += 30;
      evalResult.reasons.push("Rompimento de banda inferior com corpo forte (BOS confirmado).");
    } else {
      evalResult.reasons.push("Rompimento ignorado devido a pavio inferior longo (possível falso rompimento).");
    }
  }

  // Combine with FVG signals
  if (fvgBullishRetest) {
    isCall = true;
    score += 25;
  }
  if (fvgBearishRetest) {
    isPut = true;
    score += 25;
  }

  if (isCall && !isPut) {
    evalResult.signal = 'CALL';
    evalResult.technicalScore = Math.min(100, score);
  } else if (isPut && !isCall) {
    evalResult.signal = 'PUT';
    evalResult.technicalScore = Math.min(100, score);
  }

  return evalResult;
}
