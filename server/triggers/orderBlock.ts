import { TriggerEvaluation, MarketFeatures, RegimeLabel } from '../types';

export function evaluateOrderBlock(features: MarketFeatures, regime: RegimeLabel): TriggerEvaluation {
  const { candles, currentPrice } = features;
  if (!candles || candles.length < 15) {
    return { signal: 'NEUTRAL', strategy: 'orderBlock', technicalScore: 0, reasons: ['Histórico insuficiente para Order Block.'] };
  }

  // Simplified OB logic for the replay:
  // Detect recent strong impulse, look for the block before the impulse, and see if current candle rejects it.
  
  // We need to look back a few candles to define the OB zone, and see if the current candle is retesting and rejecting it.
  // A true OB implementation requires swinging logic (BOS).
  
  // Basic Bullish OB:
  // 1. Find a large bullish candle (impulse) in the last 10 candles.
  // 2. The bearish candle immediately before the impulse is the Bullish OB.
  // 3. Wait for price to retrace into the OB zone (high to low of the bearish candle).
  // 4. If current candle touches the zone, rejects it (wick), and closes bullish -> CALL.

  for (let i = candles.length - 10; i < candles.length - 2; i++) {
    const obCandle = candles[i];
    const impulseCandle = candles[i + 1];
    
    // Check if it's a bullish impulse
    const isObBearish = obCandle.close < obCandle.open;
    const isImpulseBullish = impulseCandle.close > impulseCandle.open && (impulseCandle.close - impulseCandle.open) > (obCandle.open - obCandle.close) * 1.5;
    
    if (isObBearish && isImpulseBullish) {
      // Zone is obCandle.low to obCandle.high
      const zoneHigh = obCandle.high;
      const zoneLow = obCandle.low;
      
      const current = candles[candles.length - 1];
      const isRetesting = current.low <= zoneHigh && current.low >= zoneLow - (zoneHigh - zoneLow)*0.5; // Touched zone
      const isRejecting = current.close > zoneHigh && current.close > current.open; // Closed bullish, rejecting lower prices
      
      if (isRetesting && isRejecting) {
        return {
           signal: 'CALL',
           strategy: 'orderBlock',
           technicalScore: 85,
           reasons: ['Reteste e rejeição de Bullish Order Block confirmados com fechamento comprador.']
        };
      }
    }

    // Check if it's a bearish impulse
    const isObBullish = obCandle.close > obCandle.open;
    const isImpulseBearish = impulseCandle.close < impulseCandle.open && (impulseCandle.open - impulseCandle.close) > (obCandle.close - obCandle.open) * 1.5;
    
    if (isObBullish && isImpulseBearish) {
      const zoneHigh = obCandle.high;
      const zoneLow = obCandle.low;
      
      const current = candles[candles.length - 1];
      const isRetesting = current.high >= zoneLow && current.high <= zoneHigh + (zoneHigh - zoneLow)*0.5;
      const isRejecting = current.close < zoneLow && current.close < current.open;
      
      if (isRetesting && isRejecting) {
        return {
           signal: 'PUT',
           strategy: 'orderBlock',
           technicalScore: 85,
           reasons: ['Reteste e rejeição de Bearish Order Block confirmados com fechamento vendedor.']
        };
      }
    }
  }

  return { signal: 'NEUTRAL', strategy: 'orderBlock', technicalScore: 0, reasons: [] };
}
