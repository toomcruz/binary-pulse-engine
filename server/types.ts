export interface Candle {
  time: string;
  timestamp?: number;
  complete?: boolean;
  volume?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  ema9?: number;
  sma21?: number;
  ema50?: number;
  ema200?: number;
  adx?: number;
  plusDI?: number;
  minusDI?: number;
  rsi?: number;
  macd?: { line: number; signal: number; histogram: number };
  bollinger?: { upper: number; middle: number; lower: number };
  stochastic?: { k: number; d: number };
  atr?: number;
  provider?: string;
  source?: string;
}

export interface MarketContext {
  marketType?: string;
  executionMode: string;
  newsRisk: "LOW" | "MEDIUM" | "HIGH";
  session: "SYDNEY" | "TOKYO" | "LONDON" | "NEWYORK" | "OVERLAP" | "CLOSED";
  minutesToHighImpactNews: number;
  engineVersion?: string;
  configured?: boolean;
  hasToken?: boolean;
  hasAccountId?: boolean;
  isSyntheticData?: boolean;
  isStaleData?: boolean;
  dataAgeMs?: number;
  includesActiveCandle?: boolean;
  dataSourceType?: string;
  priceProvider?: string;
  feedMode?: string;
  spread?: number;
  spreadPips?: number;
  maxAllowedSpreadPips?: number;
  executionPrice?: number;
  bid?: number;
  ask?: number;
  mid?: number;
  validationMode?: "live" | "backstage";
  disableConsecutiveLossVeto?: boolean;
  disableCalibrationVeto?: boolean;
  disableMockCalibration?: boolean;
  strategyMode?: string;
  precisionLevel?: "normal" | "high" | "elite";
}

export interface MarketFeatures {
  asset: string;
  timeframe: string;
  currentPrice: number;
  closedCandle: Candle;
  previousCandle: Candle;
  trendDirection: 'UP' | 'DOWN' | 'SIDEWAYS';
  indicators: {
    rsi: number;
    macd: { line: number; signal: number; histogram: number };
    bollinger: { upper: number; middle: number; lower: number };
    ema9: number;
    sma21: number;
    stochastic: { k: number; d: number };
    atr: number;
  };
  marketContext: MarketContext;
  candles?: Candle[];
}

export type RegimeLabel = 'trend' | 'range' | 'compression' | 'breakoutCandidate' | 'chaos';

export interface TriggerEvaluation {
  strategy: string;
  signal: 'CALL' | 'PUT' | 'NEUTRAL';
  technicalScore: number;
  reasons: string[];
}

export interface VetoResult {
  vetoed: boolean;
  vetoReasons: string[];
}

export interface CalibrationResult {
  calibratedProbability: number | null;
  calibrationAvailable?: boolean;
  reliabilityScore: number;
  sampleSize: number;
  historicalWinRate: number;
  hasSufficientHistory?: boolean;
  historyStatusMsg?: string;
}

export interface DriftStatus {
  driftFlag: boolean;
  higherTimeframeStatus?: string;
  higherTimeframe?: string | null;
  higherRegime?: string;
  multiTimeframeAgreement?: number;
  multiTimeframeConflict?: boolean;
  keyLevels?: any;
  driftReason: string | null;
}

export interface FinalSignalDecision {
  signal: 'CALL' | 'PUT' | 'NEUTRAL';
  strategy: string;
  regime: RegimeLabel;
  technicalScore: number;
  calibratedProbability: number | null;
  calibrationAvailable: boolean;
  reliabilityScore: number;
  sampleSize: number;
  historicalWinRate: number;
  calibrationSource?: "mock" | "paper_trading" | "backtest_validated" | "backstage_train" | "none";
  vetoReasons: string[];
  driftFlag: boolean;
  driftReason: string | null;
  reasons: string[];
}

export interface BackstageReplaySignal {
  id: string;
  dedupeKey: string;
  engineVersion: "v3.4-backstage-replay" | "v3.4-oanda-backstage" | "v3.5-twelvedata-backstage" | "v3.7-massive-backstage" | "v3.8-fastforex-backstage";
  dataSourceType?: string;
  historicalDataProvider?: string;
  validationSource: "historical_replay_closed_candles" | "oanda_historical_closed_candles" | "twelvedata_historical_closed_candles" | "massive_historical_closed_candles" | "fastforex_historical_closed_candles";
  timestamp: string;
  asset: string;
  timeframe: string;
  strategy: string;
  signal: "CALL" | "PUT" | "NEUTRAL";
  technicalScore: number;
  calibratedProbability: number | null;
  calibrationAvailable: boolean;
  reliabilityScore?: number;
  calibrationSource?: string;
  regime?: string;
  entryPrice: number;
  exitPrice?: number;
  result?: "WIN" | "LOSS" | "DRAW";
  reason: string[];
}

export interface BackstageReplayStatus {
  validationStatus: "BACKTEST_TESTING" | "BACKTEST_VALIDATED" | "BACKTEST_REJECTED";
  requiredSignals: number;
  currentSignals: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  maxConsecutiveLosses: number;
  byStrategy: Record<string, any>;
  byAsset: Record<string, any>;
  byTimeframe: Record<string, any>;
  byRegime: Record<string, any>;
}

export interface CombinedValidationStatus {
  backstageValidated: boolean;
  paperTradingValidated: boolean;
  finalStatus: "NOT_READY" | "BACKTEST_ONLY" | "PAPER_ONLY" | "READY_FOR_REVIEW";
}


export interface DecisionThresholds {
  minRegimeConfidence: number;
  minEntryQuality: number;
  minDirectionScore: number;
  minDirectionalDifference: number;
  minCandlesM1: number;
  minCandlesM5: number;
  minCandlesM15: number;
}
export const defaultDecisionThresholds: DecisionThresholds = {
  minRegimeConfidence: 0.60,
  minEntryQuality: 70,
  minDirectionScore: 65,
  minDirectionalDifference: 20,
  minCandlesM1: 20,
  minCandlesM5: 20,
  minCandlesM15: 20
};


export type MarketRegime = "TREND_UP" | "TREND_DOWN" | "RANGE" | "COMPRESSION" | "HIGH_VOLATILITY" | "TRANSITION" | "BREAKOUT_UP" | "BREAKOUT_DOWN";

export interface RegimeResult {
  regime: MarketRegime;
  rawRegime: MarketRegime;
  previousRegime: MarketRegime | null;
  candidateRegime: MarketRegime | null;
  regimeConfidence: number;
  trendStrength: number;
  directionScore: number;
  rangeQuality: number;
  atrPercentile: number;
  bollingerWidthPercentile: number;
  candlesInRegime: number;
  candidateConfirmations: number;
  changed: boolean;
  higherRegime?: string;
  multiTimeframeAgreement?: number;
  multiTimeframeConflict?: boolean;
  reasons: string[];
}

export interface RegimeThresholds {
  highVolatilityAtrPercentile: number;
  compressionAtrPercentile: number;
  compressionBollingerPercentile: number;
  trendMinStrength: number;
  trendMinDirection: number;
  rangeMaxStrength: number;
  breakoutAtrMultiplier: number;
  breakoutMinBodyRatio: number;
  hysteresisConfirmationCandles: number;
  hysteresisMinConfidence: number;
  hysteresisMinDifference: number;
}
