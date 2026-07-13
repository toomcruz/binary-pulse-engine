export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  rsi?: number;
  macd?: {
    line: number;
    signal: number;
    histogram: number;
  };
  bollinger?: {
    upper: number;
    middle: number;
    lower: number;
  };
  ema9?: number;
  sma21?: number;
  ema50?: number;
  ema200?: number;
  adx?: number;
  stochastic?: {
    k: number;
    d: number;
  };
  atr?: number;
}

export type StrategyType = 'reversion' | 'trend' | 'price_action' | 'breakout' | 'candle_flow' | 'auto';

export interface AISignal {
  id: string;
  asset: string;
  timeframe: string;
  strategy?: StrategyType;
  signal: 'CALL' | 'PUT' | 'NEUTRAL';
  
  // New Robust Engine Fields
  regime?: string;
  technicalScore?: number;
  calibratedProbability: number | null;
  calibrationAvailable: boolean;
    reliabilityScore?: number;
  sampleSize?: number;
  historicalWinRate?: number;
  hasSufficientHistory?: boolean;
  historyStatusMsg?: string;
  vetoReasons?: string[];
  driftFlag?: boolean;
  driftReason?: string | null;

   // Will map to technicalScore in UI, but kept for compatibility
  expiry: string;
  entryTime?: string; // Horário específico recomendado para a entrada
  analysisTitle: string;
  reasoning: string[];
  keyLevels: {
    supportAvailable: boolean;
    resistanceAvailable: boolean;
    support: number | null;
    resistance: number | null;
    supportStrength: number;
    resistanceStrength: number;
    distanceToSupportAtr: number | null;
    distanceToResistanceAtr: number | null;
  };
  indicatorsStatus: {
    rsi: string;
    macd: string;
    bollinger: string;
    movingAverages: string;
    stochastic?: string;
    atr?: string;
  };
  entryPrice: number;
  entryMarketContext?: any;
  status: 'PENDING' | 'WIN' | 'LOSS' | 'DRAW' | 'INVALID_FEED';
  marketData?: {
    recommendAll: number;
    recommendMA: number;
    recommendOther: number;
  };
  exitPrice?: number;
  isSimulated: boolean;
  errorMsg?: string;
  message?: string;
  candleAnalysis?: {
    trendDirection: 'UP' | 'DOWN' | 'SIDEWAYS';
    consecutiveSameColorCount: number;
    lastCandleColor: 'GREEN' | 'RED' | 'DOJI';
    engulfingPattern: 'BULLISH' | 'BEARISH' | 'NONE';
    rejectionType: 'BUYING_PRESSURE' | 'SELLING_PRESSURE' | 'NONE';
    averageBodySize: number;
    averageShadowSize: number;
    recentHigh: number;
    recentLow: number;
    candlePatternName: string;
  };
  marketFit?: {
    status: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL_UNFIT';
    regime: 'TRENDING_BREAKOUT' | 'CONSOLIDATION_FLAT' | 'NORMAL_VOLATILITY';
    reason: string;
  };
  timestamp: string;
  expirySecondsRemaining?: number;
  historicalPerformance?: {
    winRate: number | null;
    wins: number;
    losses: number;
    totalSignals: number;
    consecutiveLosses: number;
    recentSequence: string[];
    isStrategyFit: boolean;
    reliabilityScore?: number;
  };
  isAutoSelected?: boolean;
  autoCalibrationResults?: Array<{
    strategy: string;
    winRate: number | null;
    wins: number;
    losses: number;
    totalSignals: number;
  }>;
}

export interface PaperTradingSignal {
  id?: string;
  dedupeKey?: string;
  tradingDate?: string;
  expiresAt?: string;
  resolvedAt?: string;
  entryTime?: string;
  timestamp: string;
  asset: string;
  timeframe: string;
  strategy: string;
  signal: "CALL" | "PUT" | "NEUTRAL";
  confidence: number;
  confidenceType: "technical_score";
  historicalWinRate?: number;
  sampleSize?: number;
  reliabilityScore?: number;
  entryPrice: number;
  exitPrice?: number;
  expiry: string;
  result?: "WIN" | "LOSS" | "DRAW" | "PENDING";
  reason: string[];
  engineVersion?: string;
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
  entryPriceProvider?: string;
  exitPriceProvider?: string;
  entryPriceDataSourceType?: string;
  exitPriceDataSourceType?: string;
  dataAgeMs?: number;
  lastRealTickAt?: number;
  validationSource?: "paper_trading_real_price" | "oanda_real_price" | "legacy" | "unknown";
}

export interface PaperTradingStatus {
  validationStatus: "PAPER_TESTING" | "VALIDATED" | "REJECTED";
  requiredSignals: number;
  currentSignals: number;
  isLiveTradingApproved: boolean;
  totalSignals: number;
  draws?: number;
  winRate: number | null;
  maxConsecutiveLosses: number;
  legacyIgnored?: number;
  pendingCount?: number;
  neutralCount?: number;
}

export interface Trade {
  id: string;
  asset: string;
  type: 'CALL' | 'PUT';
  amount: number;
  entryPrice: number;
  exitPrice?: number;
  expirySeconds: number; // Duration of trade in seconds
  secondsRemaining: number;
  status: 'ACTIVE' | 'WIN' | 'LOSS';
  timestamp: string;
  associatedSignalId?: string;
  isMartingale?: boolean;
  isSoros?: boolean;
}

export interface AssetConfig {
  symbol: string;
  name: string;
  basePrice: number;
  pipSize: number;
  decimals: number;
  volatility: number; // random walk standard deviation factor
  payout: number; // e.g. 0.85 (85%)
  isOtc?: boolean;
  broker?: string;
}

export interface StrategyCatalog {
  strategy: StrategyType;
  name: string;
  description: string;
  wins: number;
  losses: number;
  winRate: number | null;
}


export interface BackstageReplaySignal {
  id: string;
  dedupeKey: string;
  engineVersion: "v3.4-backstage-replay" | "v3.4-oanda-backstage";
  dataSourceType?: string;
  historicalDataProvider?: string;
  validationSource: "historical_replay_closed_candles" | "oanda_historical_closed_candles";
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
  winRate: number | null;
  maxConsecutiveLosses: number;
  byStrategy: Record<string, any>;
  byAsset: Record<string, any>;
  byTimeframe: Record<string, any>;
  byRegime: Record<string, any>;
}

export type ReplayEconomicStatus =
  | "ECONOMICALLY_PROFITABLE"
  | "ECONOMICALLY_UNPROFITABLE"
  | "ECONOMIC_METRICS_UNAVAILABLE";

export interface BackstageReplayEconomicContext {
  asset: string;
  timeframe: string;
  strategy: string;
  precisionLevel: string;
  payout: number | null;
}

export interface ReplayEconomicMetrics {
  economicMetricsAvailable: boolean;
  economicStatus: ReplayEconomicStatus;
  payout: number | null;
  breakEvenWinRate: number | null;
  grossProfit: number | null;
  grossLoss: number | null;
  netProfit: number | null;
  roiPercent: number | null;
  expectedValuePerTrade: number | null;
  decidedTrades: number;
  draws: number;
}

export interface BackstageEconomicMetricsRecord {
  context: BackstageReplayEconomicContext;
  executedAt: number;
  metrics: ReplayEconomicMetrics;
}

export interface CombinedValidationStatus {
  backstageValidated: boolean;
  paperTradingValidated: boolean;
  finalStatus: "NOT_READY" | "BACKTEST_ONLY" | "PAPER_ONLY" | "READY_FOR_REVIEW";
}
