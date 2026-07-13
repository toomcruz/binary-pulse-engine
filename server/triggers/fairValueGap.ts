import { TriggerEvaluation, MarketFeatures, RegimeLabel } from '../types';

export function evaluateFairValueGap(features: MarketFeatures, regime: RegimeLabel): TriggerEvaluation {
  const { candles, currentPrice } = features;
  if (!candles || candles.length < 10) {
    return { signal: 'NEUTRAL', strategy: 'fvg', technicalScore: 0, reasons: ['Histórico insuficiente para FVG.'] };
  }

  // FVG is a 3-candle pattern.
  // Bullish FVG: candle 1 high < candle 3 low
  // Bearish FVG: candle 1 low > candle 3 high
  
  // We search the last 10 candles for a valid FVG.
  // Then we check if current candle is retesting the gap and rejecting it.
  
  for (let i = candles.length - 10; i < candles.length - 2; i++) {
    const c1 = candles[i];
    const c3 = candles[i+2];
    
    // Bullish FVG
    if (c1.high < c3.low && c3.close > c3.open) {
      const gapLow = c1.high;
      const gapHigh = c3.low;
      
      const current = candles[candles.length - 1];
      // Has price returned to gap?
      if (current.low <= gapHigh && current.low >= gapLow) {
        // Did it reject and close bullish?
        if (current.close > gapHigh && current.close > current.open) {
          return {
             signal: 'CALL',
             strategy: 'fvg',
             technicalScore: 80,
             reasons: ['Retorno e rejeição de Bullish Fair Value Gap confirmado.']
          };
        }
      }
    }
    
    // Bearish FVG
    if (c1.low > c3.high && c3.close < c3.open) {
      const gapLow = c3.high;
      const gapHigh = c1.low;
      
      const current = candles[candles.length - 1];
      if (current.high >= gapLow && current.high <= gapHigh) {
        if (current.close < gapLow && current.close < current.open) {
           return {
             signal: 'PUT',
             strategy: 'fvg',
             technicalScore: 80,
             reasons: ['Retorno e rejeição de Bearish Fair Value Gap confirmado.']
           };
        }
      }
    }
  }

  return { signal: 'NEUTRAL', strategy: 'fvg', technicalScore: 0, reasons: [] };
}
