import { Candle } from "./types";

/**
 * Calculates Simple Moving Average (SMA)
 */
export function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      sma.push(prices[i]); // Fallback for early items
    } else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((acc, val) => acc + val, 0);
      sma.push(sum / period);
    }
  }
  return sma;
}

/**
 * Calculates Exponential Moving Average (EMA)
 */
export function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  if (prices.length === 0) return ema;

  const k = 2 / (period + 1);
  let currentEma = prices[0];
  ema.push(currentEma);

  for (let i = 1; i < prices.length; i++) {
    currentEma = prices[i] * k + currentEma * (1 - k);
    ema.push(currentEma);
  }
  return ema;
}

/**
 * Calculates Bollinger Bands (period = 20, standard deviation = 2)
 */
export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): { upper: number; middle: number; lower: number }[] {
  const bands: { upper: number; middle: number; lower: number }[] = [];
  const sma = calculateSMA(prices, period);

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      bands.push({ upper: prices[i], middle: prices[i], lower: prices[i] });
    } else {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = sma[i];
      const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);

      bands.push({
        upper: mean + stdDevMultiplier * stdDev,
        middle: mean,
        lower: mean - stdDevMultiplier * stdDev,
      });
    }
  }
  return bands;
}

/**
 * Calculates Relative Strength Index (RSI 14)
 */
export function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  if (prices.length < 2) return Array(prices.length).fill(50);

  let gains = 0;
  let losses = 0;

  // First RSI value
  for (let i = 1; i <= period && i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) {
      gains += diff;
    } else {
      losses -= diff;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      rsi.push(50); // Fallback for early items
    } else {
      const diff = prices[i] - prices[i - 1];
      let gain = 0;
      let loss = 0;
      if (diff > 0) gain = diff;
      else loss = -diff;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - 100 / (1 + rs));
      }
    }
  }

  return rsi;
}

/**
 * Calculates MACD (12, 26, 9)
 */
export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { line: number; signal: number; histogram: number }[] {
  const macd: { line: number; signal: number; histogram: number }[] = [];
  if (prices.length === 0) return [];

  const fastEma = calculateEMA(prices, fastPeriod);
  const slowEma = calculateEMA(prices, slowPeriod);

  const macdLines: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    macdLines.push(fastEma[i] - slowEma[i]);
  }

  const signalEma = calculateEMA(macdLines, signalPeriod);

  for (let i = 0; i < prices.length; i++) {
    const line = macdLines[i];
    const signal = signalEma[i];
    macd.push({
      line,
      signal,
      histogram: line - signal,
    });
  }

  return macd;
}

/**
 * Calculates Stochastic Oscillator (14, 3, 3)
 */
export function calculateStochastic(
  candles: Candle[],
  period: number = 14,
  kSmooth: number = 3,
  dSmooth: number = 3
): { k: number; d: number }[] {
  const stoch: { k: number; d: number }[] = [];
  if (candles.length === 0) return [];

  const rawK: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      rawK.push(50);
    } else {
      const slice = candles.slice(i - period + 1, i + 1);
      const lowestLow = Math.min(...slice.map((c) => c.low));
      const highestHigh = Math.max(...slice.map((c) => c.high));
      const close = candles[i].close;

      const denominator = highestHigh - lowestLow;
      const k = denominator === 0 ? 50 : ((close - lowestLow) / denominator) * 100;
      rawK.push(k);
    }
  }

  // Smooth %K
  const smoothK: number[] = [];
  for (let i = 0; i < rawK.length; i++) {
    if (i < kSmooth - 1) {
      smoothK.push(rawK[i]);
    } else {
      const sum = rawK.slice(i - kSmooth + 1, i + 1).reduce((acc, v) => acc + v, 0);
      smoothK.push(sum / kSmooth);
    }
  }

  // Smooth %D (which is SMA of smooth %K)
  const smoothD: number[] = [];
  for (let i = 0; i < smoothK.length; i++) {
    if (i < dSmooth - 1) {
      smoothD.push(smoothK[i]);
    } else {
      const sum = smoothK.slice(i - dSmooth + 1, i + 1).reduce((acc, v) => acc + v, 0);
      smoothD.push(sum / dSmooth);
    }
  }

  for (let i = 0; i < candles.length; i++) {
    stoch.push({
      k: Number(smoothK[i].toFixed(2)),
      d: Number(smoothD[i].toFixed(2)),
    });
  }

  return stoch;
}

/**
 * Calculates Average True Range (ATR 14)
 */
export function calculateATR(candles: Candle[], period: number = 14): number[] {
  const atr: number[] = [];
  if (candles.length === 0) return [];

  const tr: number[] = [];
  tr.push(candles[0].high - candles[0].low); // First one has no prevClose

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);

    tr.push(Math.max(tr1, tr2, tr3));
  }

  // Calculate ATR as Simple Moving Average of TR
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) {
      atr.push(tr[i]);
    } else {
      const sum = tr.slice(i - period + 1, i + 1).reduce((acc, v) => acc + v, 0);
      atr.push(sum / period);
    }
  }

  return atr;
}

/**
 * Calculates Average Directional Index (ADX 14)
 */
export interface AdxResult {
  adx: number;
  plusDI: number;
  minusDI: number;
}

export function calculateADX(candles: Candle[], period: number = 14): AdxResult[] {
  const result: AdxResult[] = [];
  if (candles.length < period * 2) {
    return Array(candles.length).fill({ adx: NaN, plusDI: NaN, minusDI: NaN });
  }

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[0].high - candles[0].low);
      plusDM.push(0);
      minusDM.push(0);
    } else {
      const highDiff = candles[i].high - candles[i - 1].high;
      const lowDiff = candles[i - 1].low - candles[i].low;

      let pDM = 0;
      let mDM = 0;

      if (highDiff > lowDiff && highDiff > 0) {
        pDM = highDiff;
      } else if (lowDiff > highDiff && lowDiff > 0) {
        mDM = lowDiff;
      }

      plusDM.push(pDM);
      minusDM.push(mDM);

      const highLow = candles[i].high - candles[i].low;
      const highPrevClose = Math.abs(candles[i].high - candles[i - 1].close);
      const lowPrevClose = Math.abs(candles[i].low - candles[i - 1].close);
      
      tr.push(Math.max(highLow, highPrevClose, lowPrevClose));
    }
  }

  const smoothedTR: number[] = [];
  const smoothedPlusDM: number[] = [];
  const smoothedMinusDM: number[] = [];

  let trSum = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let pDmSum = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let mDmSum = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  smoothedTR.push(trSum);
  smoothedPlusDM.push(pDmSum);
  smoothedMinusDM.push(mDmSum);

  for (let i = 1; i < period; i++) {
    smoothedTR.unshift(0);
    smoothedPlusDM.unshift(0);
    smoothedMinusDM.unshift(0);
  }

  for (let i = period; i < candles.length; i++) {
    const lastTR = smoothedTR[i - 1];
    const lastPlusDM = smoothedPlusDM[i - 1];
    const lastMinusDM = smoothedMinusDM[i - 1];

    const currentTR = lastTR - (lastTR / period) + tr[i];
    const currentPlusDM = lastPlusDM - (lastPlusDM / period) + plusDM[i];
    const currentMinusDM = lastMinusDM - (lastMinusDM / period) + minusDM[i];

    smoothedTR.push(currentTR);
    smoothedPlusDM.push(currentPlusDM);
    smoothedMinusDM.push(currentMinusDM);
  }

  const dx: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      dx.push(0);
      result.push({ adx: NaN, plusDI: NaN, minusDI: NaN });
    } else {
      const trVal = smoothedTR[i];
      if (trVal === 0) {
        dx.push(0);
        result.push({ adx: NaN, plusDI: NaN, minusDI: NaN });
        continue;
      }

      const plusDI = (smoothedPlusDM[i] / trVal) * 100;
      const minusDI = (smoothedMinusDM[i] / trVal) * 100;

      const diSum = plusDI + minusDI;
      const diDiff = Math.abs(plusDI - minusDI);
      const dxVal = diSum === 0 ? 0 : (diDiff / diSum) * 100;
      dx.push(dxVal);

      let currentADX = NaN;
      if (i < period * 2 - 1) {
        currentADX = NaN;
      } else if (i === period * 2 - 1) {
        const dxSum = dx.slice(period, period * 2).reduce((a, b) => a + b, 0);
        currentADX = dxSum / period;
      } else {
        const lastADX = result[i - 1].adx;
        currentADX = (lastADX * (period - 1) + dxVal) / period;
      }
      result.push({ adx: currentADX, plusDI, minusDI });
    }
  }

  return result;
}

/**
 * Populates technical indicators into candles list
 */
export function populateIndicators(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const closes = candles.map((c) => c.close);

  const ema9 = calculateEMA(closes, 9);
  const sma21 = calculateSMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const rsi = calculateRSI(closes, 14);
  const bb = calculateBollingerBands(closes, 20, 2);
  const macd = calculateMACD(closes, 12, 26, 9);
  const stochastic = calculateStochastic(candles, 14, 3, 3);
  const atr = calculateATR(candles, 14);
  const adx = calculateADX(candles, 14);

  return candles.map((candle, idx) => {
    const hasEma9 = idx >= 8;
    const hasSma21 = idx >= 20;
    const hasEma50 = idx >= 49;
    const hasEma200 = idx >= 199;
    const hasRsi = idx >= 14;
    const hasBb = idx >= 19;
    const hasMacd = idx >= 34; // 26 + 9 signal smoothing
    const hasStochastic = idx >= 14;
    const hasAtr = idx >= 14;
    const hasAdx = idx >= 27 && !isNaN(adx[idx].adx);

    return {
      ...candle,
      ema9: hasEma9 ? ema9[idx] : undefined,
      sma21: hasSma21 ? sma21[idx] : undefined,
      ema50: hasEma50 ? ema50[idx] : undefined,
      ema200: hasEma200 ? ema200[idx] : undefined,
      rsi: hasRsi ? rsi[idx] : undefined,
      bollinger: hasBb ? bb[idx] : undefined,
      macd: hasMacd ? macd[idx] : undefined,
      stochastic: hasStochastic ? stochastic[idx] : undefined,
      atr: hasAtr ? atr[idx] : undefined,
      adx: hasAdx ? adx[idx].adx : undefined, plusDI: hasAdx ? adx[idx].plusDI : undefined, minusDI: hasAdx ? adx[idx].minusDI : undefined,
    };
  });
}

/**
 * Generates initial random-walk candles for simulation
 */
