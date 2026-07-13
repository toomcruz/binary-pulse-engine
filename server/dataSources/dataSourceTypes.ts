export type DataSourceType =
  | "oanda_rest"
  | "oanda_stream"
  | "oanda_rest_pricing"
  | "tradingview_visual"
  | "synthetic_fallback"
  | "twelvedata_rest"
  | "massive_rest"
  | "massive_stream"
  | "fastforex_rest"
  | "fastforex_stream"
  | "deterministic_fixture"
  | "unknown";

export interface MarketCandle {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  complete: boolean;
  source: DataSourceType;
  provider: "oanda" | "twelvedata" | "tradingview" | "synthetic" | "massive" | "fastforex" | "test" | "unknown";
  instrument: string;
  granularity: "M1" | "M5" | "S5" | "S10" | "S15" | "M15" | "M30" | "H1";
  priceType: "mid" | "bid" | "ask";
}

export interface MarketTick {
  instrument: string;
  bid?: number;
  ask?: number;
  mid: number;
  time: string;
  timestamp: number;
  source: DataSourceType;
  provider: "oanda" | "twelvedata" | "tradingview" | "synthetic" | "massive" | "fastforex" | "test" | "unknown";
  receivedAt?: number;
}

export interface MarketDataHealth {
  provider: "oanda" | "twelvedata" | "tradingview" | "synthetic" | "massive" | "fastforex" | "test" | "unknown";
  dataSourceType: DataSourceType;
  isConnected: boolean;
  lastRealTickAt?: number | null;
  dataAgeMs: number | null;
  isStaleData: boolean;
  isSyntheticData: boolean;
  connectionStatus: "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "STALE" | "ERROR" | "NOT_CONFIGURED" | "UNAVAILABLE" | "RATE_LIMITED";
  feedMode?: "stream" | "rest_polling";
  error?: string;
  configured?: boolean;
}
