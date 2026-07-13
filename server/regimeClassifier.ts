import { MarketFeatures, RegimeLabel } from './types';

export function classifyRegime(features: MarketFeatures): RegimeLabel {
  const { currentPrice, indicators, marketContext, closedCandle, previousCandle } = features;
  const { bollinger, atr, ema9, sma21, macd } = indicators;
  
  // Basic heuristics for regime classification
  const bandWidth = (bollinger.upper - bollinger.lower) / bollinger.middle;
  const relativeAtr = atr / currentPrice;

  if (marketContext.newsRisk === 'HIGH' || marketContext.minutesToHighImpactNews <= 15) {
    return 'chaos';
  }

  if (relativeAtr > 0.002) {
    return 'chaos'; // Extreme volatility
  }

  // Compression detection
  if (bandWidth < 0.0008 && relativeAtr < 0.0003) {
    return 'compression';
  }

  // Trend detection
  const emaSlope = ema9 - sma21;
  const isUpTrend = emaSlope > 0 && closedCandle.close > ema9 && ema9 > sma21 && macd.histogram > 0;
  const isDownTrend = emaSlope < 0 && closedCandle.close < ema9 && ema9 < sma21 && macd.histogram < 0;

  if ((isUpTrend || isDownTrend) && bandWidth > 0.001) {
    return 'trend';
  }

  // Breakout Candidate detection (was compression, now expanding)
  const prevBandWidth = ((previousCandle.bollinger?.upper || 0) - (previousCandle.bollinger?.lower || 0)) / (previousCandle.bollinger?.middle || 1);
  if (prevBandWidth > 0 && prevBandWidth < 0.0008 && bandWidth > 0.0008) {
    return 'breakoutCandidate';
  }

  return 'range';
}
