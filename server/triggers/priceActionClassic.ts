import { MarketFeatures, RegimeLabel, TriggerEvaluation } from '../types';

export function evaluatePriceActionClassic(features: MarketFeatures, regime: RegimeLabel): TriggerEvaluation {
  const { closedCandle, previousCandle } = features;
  
  const evalResult: TriggerEvaluation = {
    strategy: 'priceActionClassic',
    signal: 'NEUTRAL',
    technicalScore: 0,
    reasons: []
  };

  if (regime === 'chaos') {
    evalResult.reasons.push("Regime de caos. Price Action ignorado.");
    return evalResult;
  }

  let isCall = false;
  let isPut = false;
  let score = 50;

  const bodySize = Math.abs(closedCandle.close - closedCandle.open);
  const upperShadow = closedCandle.high - Math.max(closedCandle.open, closedCandle.close);
  const lowerShadow = Math.min(closedCandle.open, closedCandle.close) - closedCandle.low;

  const prevBodySize = Math.abs(previousCandle.close - previousCandle.open);

  // Bullish Engulfing
  if (previousCandle.close < previousCandle.open && closedCandle.close > closedCandle.open) {
    if (closedCandle.close > previousCandle.open && closedCandle.open < previousCandle.close) {
      isCall = true;
      score += 30;
      evalResult.reasons.push("Padrão Bullish Engulfing detectado.");
    }
  }

  // Hammer
  if (lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5) {
    isCall = true;
    score += 25;
    evalResult.reasons.push("Padrão Hammer (rejeição de fundo) detectado.");
  }

  // Bearish Engulfing
  if (previousCandle.close > previousCandle.open && closedCandle.close < closedCandle.open) {
    if (closedCandle.close < previousCandle.open && closedCandle.open > previousCandle.close) {
      isPut = true;
      score += 30;
      evalResult.reasons.push("Padrão Bearish Engulfing detectado.");
    }
  }

  // Shooting Star
  if (upperShadow > bodySize * 2 && lowerShadow < bodySize * 0.5) {
    isPut = true;
    score += 25;
    evalResult.reasons.push("Padrão Shooting Star (rejeição de topo) detectado.");
  }

  if (isCall && !isPut) {
    evalResult.signal = 'CALL';
    evalResult.technicalScore = Math.min(100, score);
  } else if (isPut && !isCall) {
    evalResult.signal = 'PUT';
    evalResult.technicalScore = Math.min(100, score);
  } else {
    evalResult.reasons.push("Nenhum padrão de Price Action claro detectado.");
  }

  return evalResult;
}
