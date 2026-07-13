import { Candle } from "./types";

export interface Pivot {
  type: "HIGH" | "LOW";
  price: number;
  index: number;
  timestamp: number;
}

export interface MarketStructureResult {
  direction: -1 | 0 | 1;
  quality: number;
  higherHighs: number;
  higherLows: number;
  lowerHighs: number;
  lowerLows: number;
  lastSwingHigh?: number;
  lastSwingLow?: number;
  breakOfStructure: "UP" | "DOWN" | "NONE";
  changeOfCharacter: "UP" | "DOWN" | "NONE";
  reasons: string[];
}

export interface BreakoutResult {
  direction: "UP" | "DOWN" | "NONE";
  confirmed: boolean;
  previousCondition: "RANGE" | "COMPRESSION" | "OTHER";
  breakoutLevel?: number;
  closeDistanceAtr: number;
  candleRangeAtr: number;
  bodyRatio: number;
  wickAgainstRatio: number;
  retestStatus: "NOT_REQUIRED" | "PENDING" | "CONFIRMED" | "FAILED";
  confidence: number;
  reasons: string[];
}

export interface RangeResult {
  quality: number;
  upperBoundary?: number;
  lowerBoundary?: number;
  midpoint?: number;
  position: number;
  upperRejections: number;
  lowerRejections: number;
  valid: boolean;
  reasons: string[];
}

// Simple left/right pivot detection
export function detectPivots(candles: Candle[], leftBars = 3, rightBars = 3): Pivot[] {
  const pivots: Pivot[] = [];
  
  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= leftBars; j++) {
      if (candles[i - j].high >= current.high) isHigh = false;
      if (candles[i - j].low <= current.low) isLow = false;
    }
    for (let j = 1; j <= rightBars; j++) {
      if (candles[i + j].high >= current.high) isHigh = false;
      if (candles[i + j].low <= current.low) isLow = false;
    }

    if (isHigh) {
      pivots.push({ type: "HIGH", price: current.high, index: i, timestamp: current.timestamp });
    }
    if (isLow) {
      pivots.push({ type: "LOW", price: current.low, index: i, timestamp: current.timestamp });
    }
  }
  
  return pivots;
}

export function analyzeMarketStructure(candles: Candle[]): MarketStructureResult {
  const result: MarketStructureResult = {
    direction: 0,
    quality: 0,
    higherHighs: 0,
    higherLows: 0,
    lowerHighs: 0,
    lowerLows: 0,
    breakOfStructure: "NONE",
    changeOfCharacter: "NONE",
    reasons: []
  };

  if (candles.length < 20) {
    result.reasons.push("Insufficient data for structure analysis");
    return result;
  }

  const pivots = detectPivots(candles, 3, 3);
  if (pivots.length < 4) {
    result.reasons.push("Not enough pivot points detected");
    return result;
  }

  const highs = pivots.filter(p => p.type === "HIGH");
  const lows = pivots.filter(p => p.type === "LOW");

  if (highs.length > 0) result.lastSwingHigh = highs[highs.length - 1].price;
  if (lows.length > 0) result.lastSwingLow = lows[lows.length - 1].price;

  // Detect HH, HL, LH, LL
  for (let i = 1; i < highs.length; i++) {
    if (highs[i].price > highs[i - 1].price) result.higherHighs++;
    else result.lowerHighs++;
  }
  for (let i = 1; i < lows.length; i++) {
    if (lows[i].price > lows[i - 1].price) result.higherLows++;
    else result.lowerLows++;
  }

  const upScore = result.higherHighs + result.higherLows;
  const downScore = result.lowerHighs + result.lowerLows;
  const total = upScore + downScore;

  if (total > 0) {
    if (upScore > downScore * 2) {
      result.direction = 1;
      result.quality = upScore / total;
      result.reasons.push("Consistent higher highs and higher lows");
    } else if (downScore > upScore * 2) {
      result.direction = -1;
      result.quality = downScore / total;
      result.reasons.push("Consistent lower highs and lower lows");
    } else {
      result.quality = 0;
      result.reasons.push("Mixed structure, possible consolidation");
    }
  }

  // Very basic BOS/CHOCH detection using last few pivots
  if (highs.length >= 2 && lows.length >= 2) {
    const lastHigh = highs[highs.length - 1];
    const prevHigh = highs[highs.length - 2];
    const lastLow = lows[lows.length - 1];
    const prevLow = lows[lows.length - 2];
    const lastCandle = candles[candles.length - 1];
    
    // Simple BoS UP (continuing trend)
    if (result.direction === 1 && lastCandle.close > lastHigh.price) {
      result.breakOfStructure = "UP";
    }
    // Simple BoS DOWN
    if (result.direction === -1 && lastCandle.close < lastLow.price) {
      result.breakOfStructure = "DOWN";
    }

    // ChoCh UP (breaking down trend)
    if (result.direction === -1 && lastCandle.close > lastHigh.price) {
      result.changeOfCharacter = "UP";
    }
    // ChoCh DOWN (breaking up trend)
    if (result.direction === 1 && lastCandle.close < lastLow.price) {
      result.changeOfCharacter = "DOWN";
    }
  }

  return result;
}

export function detectRange(candles: Candle[]): RangeResult {
  const result: RangeResult = {
    quality: 0,
    position: 0.5,
    upperRejections: 0,
    lowerRejections: 0,
    valid: false,
    reasons: []
  };

  if (candles.length < 20) {
    result.reasons.push("Insufficient data for range detection");
    return result;
  }

  const recent = candles.slice(-20);
  let max = -Infinity;
  let min = Infinity;
  recent.forEach(c => {
    if (c.high > max) max = c.high;
    if (c.low < min) min = c.low;
  });

  const atr = recent[recent.length - 1].atr || 0;
  if (atr === 0) return result;

  const rangeHeight = max - min;
  if (rangeHeight > atr * 5) {
    result.reasons.push("Range too wide compared to ATR");
    return result;
  }

  let upperRejections = 0;
  let lowerRejections = 0;

  const upperZone = max - (rangeHeight * 0.2);
  const lowerZone = min + (rangeHeight * 0.2);

  recent.forEach(c => {
    if (c.high >= upperZone && c.close < upperZone) upperRejections++;
    if (c.low <= lowerZone && c.close > lowerZone) lowerRejections++;
  });

  result.upperBoundary = max;
  result.lowerBoundary = min;
  result.midpoint = (max + min) / 2;
  result.upperRejections = upperRejections;
  result.lowerRejections = lowerRejections;

  const currentClose = candles[candles.length - 1].close;
  result.position = (currentClose - min) / rangeHeight;

  if (upperRejections >= 2 && lowerRejections >= 2) {
    result.valid = true;
    result.quality = Math.min((upperRejections + lowerRejections) / 10, 1);
    result.reasons.push("Clear defined boundaries with multiple rejections");
  } else {
    result.reasons.push("Not enough rejections on boundaries");
  }

  return result;
}

export function analyzeBreakout(candles: Candle[], rangeResult: RangeResult): BreakoutResult {
  const result: BreakoutResult = {
    direction: "NONE",
    confirmed: false,
    previousCondition: "OTHER",
    closeDistanceAtr: 0,
    candleRangeAtr: 0,
    bodyRatio: 0,
    wickAgainstRatio: 0,
    retestStatus: "NOT_REQUIRED",
    confidence: 0,
    reasons: []
  };

  if (candles.length < 2) return result;
  
  if (rangeResult.valid) {
    result.previousCondition = "RANGE";
  }

  const lastCandle = candles[candles.length - 1];
  const atr = lastCandle.atr || 0.0001; // Avoid div by 0

  if (rangeResult.upperBoundary && lastCandle.close > rangeHeightExt(rangeResult.upperBoundary, atr)) {
    result.direction = "UP";
    result.breakoutLevel = rangeResult.upperBoundary;
    result.closeDistanceAtr = (lastCandle.close - rangeResult.upperBoundary) / atr;
    const body = lastCandle.close - lastCandle.open;
    const range = lastCandle.high - lastCandle.low;
    result.bodyRatio = body / range;
    result.candleRangeAtr = range / atr;
    const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
    result.wickAgainstRatio = Math.max(0, upperWick / range);
  } else if (rangeResult.lowerBoundary && lastCandle.close < rangeHeightExt(rangeResult.lowerBoundary, atr, false)) {
    result.direction = "DOWN";
    result.breakoutLevel = rangeResult.lowerBoundary;
    result.closeDistanceAtr = (rangeResult.lowerBoundary - lastCandle.close) / atr;
    const body = lastCandle.open - lastCandle.close;
    const range = lastCandle.high - lastCandle.low;
    result.bodyRatio = body / range;
    result.candleRangeAtr = range / atr;
    const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
    result.wickAgainstRatio = Math.max(0, lowerWick / range);
  }

  function rangeHeightExt(level: number, _atr: number, isUpper = true) {
     return level;
  }

  if (result.direction !== "NONE") {
    if (result.closeDistanceAtr > 0.5 && result.bodyRatio > 0.6) {
      result.confirmed = true;
      result.confidence = Math.min((result.closeDistanceAtr + result.bodyRatio) / 2, 1);
      result.reasons.push("Strong close beyond breakout level");
    } else {
      result.reasons.push("Breakout lacks strength or conviction");
    }
  }

  return result;
}
