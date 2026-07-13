import { Candle, MarketRegime, RegimeResult, RegimeThresholds } from "./types";
import { analyzeMarketStructure, detectRange, analyzeBreakout } from "./marketStructure";

export const defaultRegimeThresholds: RegimeThresholds = {
  highVolatilityAtrPercentile: 0.85,
  compressionAtrPercentile: 0.15,
  compressionBollingerPercentile: 0.15,
  trendMinStrength: 0.60,
  trendMinDirection: 0.60,
  rangeMaxStrength: 0.40,
  breakoutAtrMultiplier: 1.5,
  breakoutMinBodyRatio: 0.60,
  hysteresisConfirmationCandles: 2,
  hysteresisMinConfidence: 0.50,
  hysteresisMinDifference: 0.15
};

export function clip(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function detectMarketRegime(
  candles: Candle[],
  higherTimeframeCandles: Candle[] | null = null,
  thresholds: RegimeThresholds = defaultRegimeThresholds,
  historicalRegimes: MarketRegime[] = []
): RegimeResult {
  if (candles.length < 2) {
    return createDefaultRegimeResult();
  }

  const currentCandle = candles[candles.length - 1];
  const previousCandle = candles[candles.length - 2];
  const currentPrice = currentCandle.close;

  const atrValues = candles.map(c => c.atr || 0).filter(v => v > 0);
  const bwValues = candles.map(c => {
    if (!c.bollinger) return 0;
    return (c.bollinger.upper - c.bollinger.lower) / c.bollinger.middle;
  }).filter(v => v > 0);
  
  const currentAtr = currentCandle.atr || 0.0001;
  const currentBw = currentCandle.bollinger ? (currentCandle.bollinger.upper - currentCandle.bollinger.lower) / currentCandle.bollinger.middle : 0.0001;

  let atrPercentile = 0.5;
  if (atrValues.length > 20) {
    atrValues.sort((a,b) => a - b);
    let idx = atrValues.findIndex(v => v >= currentAtr);
    if (idx === -1) idx = atrValues.length - 1;
    atrPercentile = idx / atrValues.length;
  }
  
  let bollingerWidthPercentile = 0.5;
  if (bwValues.length > 20) {
    bwValues.sort((a,b) => a - b);
    let idx = bwValues.findIndex(v => v >= currentBw);
    if (idx === -1) idx = bwValues.length - 1;
    bollingerWidthPercentile = idx / bwValues.length;
  }

  // ADX and DI
  const adx = currentCandle.adx || 20;
  const adxNormalized = clip((adx - 18) / 17, 0, 1);
  const plusDI = (currentCandle as any).plusDI || 0;
  const minusDI = (currentCandle as any).minusDI || 0;
  
  let diDirection = 0;
  if (plusDI + minusDI > 0) {
    diDirection = (plusDI - minusDI) / (plusDI + minusDI);
  }

  const ema20 = currentCandle.sma21 || currentPrice;
  const ema20_5ago = candles.length >= 6 ? (candles[candles.length - 6].sma21 || ema20) : ema20;
  const absoluteNormalizedEmaSlope = clip(Math.abs(ema20 - ema20_5ago) / (currentAtr * 5), 0, 1);
  const emaDirection = Math.sign(ema20 - ema20_5ago) * absoluteNormalizedEmaSlope;

  // Efficiency Ratio
  let efficiencyRatio = 0.5;
  if (candles.length > 15) {
     const p15 = candles[candles.length - 15].close;
     const change = Math.abs(currentPrice - p15);
     let volatility = 0;
     for(let i=candles.length - 14; i<candles.length; i++) {
        volatility += Math.abs(candles[i].close - candles[i-1].close);
     }
     efficiencyRatio = volatility > 0 ? change / volatility : 0;
  }
  
  // Market Structure
  const structure = analyzeMarketStructure(candles);
  const priorCandles = candles.slice(0, -1);
  const rangeResult = detectRange(priorCandles);
  const breakoutResult = analyzeBreakout(candles, rangeResult);

  const trendStrength = 
    0.25 * adxNormalized + 
    0.25 * efficiencyRatio + 
    0.20 * absoluteNormalizedEmaSlope + 
    0.30 * structure.quality;

  const marketStructureDirection = structure.direction * structure.quality;
  const normalizedReturnDirection = clip((currentPrice - previousCandle.close) / currentAtr, -1, 1);
  
  const directionScore = 
    0.30 * emaDirection + 
    0.30 * diDirection + 
    0.25 * marketStructureDirection + 
    0.15 * normalizedReturnDirection;

  const rangeQuality = rangeResult.quality;

  let rawRegime: MarketRegime = "TRANSITION";
  let reasons: string[] = [];
  
  const candleRange = currentCandle.high - currentCandle.low;

  if (breakoutResult.confirmed && breakoutResult.direction !== "NONE") {
    rawRegime = breakoutResult.direction === "UP" ? "BREAKOUT_UP" : "BREAKOUT_DOWN";
    reasons.push(...breakoutResult.reasons);
  } else if (atrPercentile > thresholds.highVolatilityAtrPercentile || candleRange > 3.0 * currentAtr) {
    rawRegime = "HIGH_VOLATILITY";
    reasons.push("Volatilidade anormal ou movimento esticado demais.");
  } else if (atrPercentile < thresholds.compressionAtrPercentile && bollingerWidthPercentile < thresholds.compressionBollingerPercentile) {
    rawRegime = "COMPRESSION";
    reasons.push("Baixa volatilidade e compressão de preço.");
  } else if (trendStrength >= thresholds.trendMinStrength && directionScore >= thresholds.trendMinDirection) {
    rawRegime = "TREND_UP";
    reasons.push(`Tendência de alta estrutural.`);
  } else if (trendStrength >= thresholds.trendMinStrength && directionScore <= -thresholds.trendMinDirection) {
    rawRegime = "TREND_DOWN";
    reasons.push(`Tendência de baixa estrutural.`);
  } else if (rangeResult.valid && rangeQuality >= 0.5) {
    rawRegime = "RANGE";
    reasons.push(`Mercado lateral detectado.`);
  } else {
    rawRegime = "TRANSITION";
    reasons.push("Sem clareza direcional. Transição.");
  }
  
// Persistence calculation
  let temporalPersistence = 0;
  if (historicalRegimes && historicalRegimes.length > 0) {
    const windowSize = Math.min(historicalRegimes.length, 10);
    const recent = historicalRegimes.slice(-windowSize);
    const sameRegimeCount = recent.filter(r => r === rawRegime).length;
    
    const freq = sameRegimeCount / windowSize;
    // We can just use frequency as a proxy for now, but to satisfy the requirement:
    let alternations = 0;
    for(let i=1; i<recent.length; i++) {
       if(recent[i] !== recent[i-1]) alternations++;
    }
    const stability = 1 - (alternations / windowSize);
    
    temporalPersistence = 0.7 * freq + 0.3 * Math.max(0, stability);
  }

  // MultiTimeframe alignment
  let multiTimeframeAgreement = 0;
  let htfRegime = "UNKNOWN";
  let multiTimeframeConflict = false;
  if (higherTimeframeCandles && higherTimeframeCandles.length > 10) {
    const htfRegimeResult = detectMarketRegime(higherTimeframeCandles, null, thresholds, []);
    htfRegime = htfRegimeResult.rawRegime;
    if (
      (rawRegime.includes("UP") && htfRegime.includes("UP")) ||
      (rawRegime.includes("DOWN") && htfRegime.includes("DOWN")) ||
      (rawRegime === htfRegime)
    ) {
      multiTimeframeAgreement = 1;
    } else if (
      htfRegime === "TRANSITION" || htfRegime === "COMPRESSION" || htfRegime === "HIGH_VOLATILITY" || htfRegime === "UNKNOWN"
    ) {
      multiTimeframeAgreement = 0;
      reasons.push("higher_timeframe_not_confirming");
    } else if (
      (rawRegime.includes("UP") && htfRegime.includes("DOWN")) ||
      (rawRegime.includes("DOWN") && htfRegime.includes("UP"))
    ) {
      multiTimeframeAgreement = 0;
      multiTimeframeConflict = true;
    } else {
      multiTimeframeAgreement = 0;
    }
  }

  const classificationStrength = Math.abs(directionScore);
  let regimeConfidence = 0;
  if (rawRegime === "TREND_UP" || rawRegime === "TREND_DOWN") {
    regimeConfidence = 0.3 * trendStrength + 0.3 * classificationStrength + 0.2 * temporalPersistence + 0.2 * multiTimeframeAgreement;
  } else if (rawRegime === "RANGE") {
    regimeConfidence = 0.4 * rangeQuality + 0.4 * temporalPersistence + 0.2 * (1 - trendStrength);
  } else if (rawRegime === "COMPRESSION") {
    regimeConfidence = 0.4 * (1 - atrPercentile) + 0.4 * (1 - bollingerWidthPercentile) + 0.2 * temporalPersistence;
  } else if (rawRegime === "HIGH_VOLATILITY") {
    regimeConfidence = 0.6 * atrPercentile + 0.4 * temporalPersistence;
  } else if (rawRegime === "BREAKOUT_UP" || rawRegime === "BREAKOUT_DOWN") {
    regimeConfidence = Number.isFinite(breakoutResult.confidence) ? breakoutResult.confidence : 0; 
  } else {
    regimeConfidence = 0.5 * temporalPersistence;
  }

  return {
    regime: rawRegime, 
    rawRegime,
    previousRegime: null,
    candidateRegime: rawRegime,
    regimeConfidence: clip(regimeConfidence, 0, 1),
    trendStrength,
    directionScore,
    rangeQuality,
    atrPercentile,
    bollingerWidthPercentile,
    candlesInRegime: 1,
    candidateConfirmations: 1,
    changed: true,
    reasons,
    higherRegime: htfRegime,
    multiTimeframeAgreement,
    multiTimeframeConflict
  };
}

export function createDefaultRegimeResult(): RegimeResult {
  return {
    regime: "TRANSITION",
    rawRegime: "TRANSITION",
    previousRegime: null,
    candidateRegime: null,
    regimeConfidence: 0,
    trendStrength: 0,
    directionScore: 0,
    rangeQuality: 0,
    atrPercentile: 0,
    bollingerWidthPercentile: 0,
    candlesInRegime: 0,
    candidateConfirmations: 0,
    changed: false,
    reasons: ["Dados insuficientes"],
    higherRegime: "UNKNOWN",
    multiTimeframeAgreement: 0,
    multiTimeframeConflict: false
  };
}

export class RegimeStateManager {
  private currentRegime: MarketRegime | null = null;
  private candidateRegime: MarketRegime | null = null;
  private currentConfidence: number = 0;
  private candidateConfidence: number = 0;
  private candlesInRegime: number = 0;
  private candidateConfirmations: number = 0;
  private historicalRegimes: MarketRegime[] = [];
  
  public update(result: RegimeResult, thresholds: RegimeThresholds = defaultRegimeThresholds): RegimeResult {
    const raw = result.rawRegime;
    const rawConf = result.regimeConfidence;
    
    this.historicalRegimes.push(raw);
    if (this.historicalRegimes.length > 50) this.historicalRegimes.shift();
    
    let previousRegime = this.currentRegime;
    let changed = false;
    if (this.currentRegime === null) {
      this.currentRegime = raw;
      this.currentConfidence = rawConf;
      this.candlesInRegime = 1;
      changed = true;
    } else {
      if (raw === this.currentRegime) {
        this.candlesInRegime++;
        this.currentConfidence = rawConf;
        this.candidateRegime = null;
        this.candidateConfirmations = 0;
      } else {
        if (raw === this.candidateRegime) {
          this.candidateConfirmations++;
          this.candidateConfidence = rawConf;
          
          const minConfidence = thresholds.hysteresisMinConfidence;
          const minDifference = thresholds.hysteresisMinDifference;
          const strongPersistenceThreshold = 4;
          
          const confidenceDominates = 
            this.candidateConfidence >= minConfidence && 
            (this.candidateConfidence - this.currentConfidence) >= minDifference;
            
          const persistenceDominates = 
            this.candidateConfidence >= minConfidence && 
            this.candidateConfirmations >= strongPersistenceThreshold;

          if (confidenceDominates || persistenceDominates) {
            previousRegime = this.currentRegime;
            this.currentRegime = this.candidateRegime;
            this.currentConfidence = this.candidateConfidence;
            this.candlesInRegime = 1;
            this.candidateRegime = null;
            this.candidateConfirmations = 0;
            changed = true;
          } else {
            this.candlesInRegime++;
          }
        } else {
          this.candidateRegime = raw;
          this.candidateConfirmations = 1;
          this.candidateConfidence = rawConf;
          this.candlesInRegime++;
          this.currentConfidence = Math.max(0, this.currentConfidence - 0.05); // Gradual decay
        }
      }
    }
    
    return {
      ...result,
      regime: this.currentRegime || "TRANSITION",
      previousRegime,
      candidateRegime: this.candidateRegime,
      candlesInRegime: this.candlesInRegime,
      candidateConfirmations: this.candidateConfirmations,
      changed
    };
  }

  public getHistoricalRegimes(): MarketRegime[] {
    return this.historicalRegimes;
  }
}

// Global isolation by context
const regimeStateManagers = new Map<string, RegimeStateManager>();

export function createRegimeStateKey(
  asset: string,
  timeframe: string,
  marketType: string,
  engineVersion: string,
  executionMode: string
): string {
  return `${asset}_${timeframe}_${marketType}_${engineVersion}_${executionMode}`;
}

export function getRegimeStateManager(key: string): RegimeStateManager {
  if (!regimeStateManagers.has(key)) {
    regimeStateManagers.set(key, new RegimeStateManager());
  }
  return regimeStateManagers.get(key)!;
}

export function resetRegimeState(key: string) {
  regimeStateManagers.delete(key);
}

export function resetAllRegimeStates() {
  regimeStateManagers.clear();
}
