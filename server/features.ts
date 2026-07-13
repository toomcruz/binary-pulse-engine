import { Candle, MarketContext, MarketFeatures } from './types';

export function extractFeatures(
  asset: string,
  timeframe: string,
  currentPrice: number,
  candles: Candle[],
  marketContext: MarketContext
): MarketFeatures {
  const validCandles = candles.filter(c => c.close !== undefined);
  const isSyntheticData = marketContext.isSyntheticData === true;

  
  if (validCandles.length < 2) {
    throw new Error("Insufficient closed candles for feature extraction.");
  }

  // Confirmar que o backend sempre faz:
  const completedCandles = marketContext.includesActiveCandle ? validCandles.slice(0, -1) : validCandles;
  const closedCandle = completedCandles[completedCandles.length - 1];
  const previousCandle = completedCandles[completedCandles.length - 2] || closedCandle;
  
  if (!closedCandle) {
    throw new Error("Insufficient closed candles for feature extraction.");
  }

  // Determine basic trend direction from EMAs
  const ema9 = closedCandle.ema9 || currentPrice;
  const sma21 = closedCandle.sma21 || currentPrice;
  const trendDirection = ema9 > sma21 ? 'UP' : (ema9 < sma21 ? 'DOWN' : 'SIDEWAYS');

  return {
    asset,
    timeframe,
    currentPrice,
    closedCandle,
    previousCandle,
    trendDirection,
    indicators: {
      rsi: closedCandle.rsi || 50,
      macd: closedCandle.macd || { line: 0, signal: 0, histogram: 0 },
      bollinger: closedCandle.bollinger || { upper: currentPrice * 1.001, middle: currentPrice, lower: currentPrice * 0.999 },
      ema9,
      sma21,
      stochastic: closedCandle.stochastic || { k: 50, d: 50 },
      atr: closedCandle.atr || (currentPrice * 0.0002)
    },
    marketContext,
    candles: completedCandles
  };
}
