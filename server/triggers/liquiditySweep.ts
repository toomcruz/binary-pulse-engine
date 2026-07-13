import { TriggerEvaluation, MarketFeatures, RegimeLabel } from '../types';

export function evaluateLiquiditySweep(features: MarketFeatures, regime: RegimeLabel): TriggerEvaluation {
  const { candles, currentPrice } = features;
  if (candles.length < 20) {
    return { signal: 'NEUTRAL', strategy: 'liquiditySweep', technicalScore: 0, reasons: ['Histórico insuficiente para Liquidity Sweep.'] };
  }

  // To find a sweep, we need a recent swing high or low.
  // 1. Identify a swing low in the past 5 to 15 candles.
  // 2. See if current candle went below it (swept) but closed above it.
  
  // Find swing low
  let swingLow = Infinity;
  let swingHigh = -Infinity;
  for (let i = candles.length - 15; i < candles.length - 3; i++) {
    if (candles[i].low < swingLow) swingLow = candles[i].low;
    if (candles[i].high > swingHigh) swingHigh = candles[i].high;
  }
  
  const current = candles[candles.length - 1];
  
  // Bullish Sweep
  if (current.low < swingLow && current.close > swingLow && current.close > current.open) {
    if (regime !== 'chaos') {
      return {
         signal: 'CALL',
         strategy: 'liquiditySweep',
         technicalScore: 82,
         reasons: ['Varredura de liquidez (fundo recente rompido com rejeição) e fechamento acima.']
      };
    }
  }
  
  // Bearish Sweep
  if (current.high > swingHigh && current.close < swingHigh && current.close < current.open) {
    if (regime !== 'chaos') {
       return {
         signal: 'PUT',
         strategy: 'liquiditySweep',
         technicalScore: 82,
         reasons: ['Varredura de liquidez (topo recente rompido com rejeição) e fechamento abaixo.']
       };
    }
  }

  return { signal: 'NEUTRAL', strategy: 'liquiditySweep', technicalScore: 0, reasons: [] };
}
