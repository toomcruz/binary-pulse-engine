import { MarketFeatures, RegimeLabel, TriggerEvaluation } from '../types';

export function evaluateCandleFlow(features: MarketFeatures, regime: RegimeLabel): TriggerEvaluation {
  const { closedCandle, previousCandle, indicators } = features;
  
  const evalResult: TriggerEvaluation = {
    strategy: 'candleFlow',
    signal: 'NEUTRAL',
    technicalScore: 0,
    reasons: []
  };

  if (regime === 'chaos' || regime === 'range') {
    evalResult.reasons.push("Regime inadequado para fluxo de velas (caos ou range).");
    return evalResult;
  }

  const isGreen1 = previousCandle.close > previousCandle.open;
  const isGreen2 = closedCandle.close > closedCandle.open;
  const isRed1 = previousCandle.close < previousCandle.open;
  const isRed2 = closedCandle.close < closedCandle.open;

  const upperShadow2 = closedCandle.high - Math.max(closedCandle.open, closedCandle.close);
  const lowerShadow2 = Math.min(closedCandle.open, closedCandle.close) - closedCandle.low;
  const body2 = Math.abs(closedCandle.close - closedCandle.open);

  let score = 50;
  
  if (isGreen1 && isGreen2 && indicators.ema9 > indicators.sma21) {
    if (upperShadow2 < body2 * 0.5) {
      evalResult.signal = 'CALL';
      score += 25;
      evalResult.reasons.push("Fluxo de velas positivo (2 candles verdes consecutivos) com alinhamento de alta.");
    } else {
      evalResult.reasons.push("Fluxo rejeitado por pavio superior dominante.");
    }
  } else if (isRed1 && isRed2 && indicators.ema9 < indicators.sma21) {
    if (lowerShadow2 < body2 * 0.5) {
      evalResult.signal = 'PUT';
      score += 25;
      evalResult.reasons.push("Fluxo de velas negativo (2 candles vermelhos consecutivos) com alinhamento de baixa.");
    } else {
      evalResult.reasons.push("Fluxo rejeitado por pavio inferior dominante.");
    }
  } else {
    evalResult.reasons.push("Sem fluxo claro de continuidade.");
  }

  if (evalResult.signal !== 'NEUTRAL') {
    evalResult.technicalScore = Math.min(100, score);
  }

  return evalResult;
}
