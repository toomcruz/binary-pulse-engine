import { Candle } from "../types";
import { MarketCandle, MarketDataHealth, MarketTick } from "./dataSourceTypes";
import { getFastForexCandles } from "./fastForex/fastForexCandles";
import { getFastForexPrice } from "./fastForex/fastForexPrice";
import { getMarketDataHealth } from "./marketDataService";

export type AnalyzeMarketDataProviderId = "fastforex" | "test";

export interface MarketDataProvider {
  id: AnalyzeMarketDataProviderId;
  getPrice(symbol: string): Promise<MarketTick | null>;
  getCandles(symbol: string, timeframe: "M1" | "M5", limit: number): Promise<MarketCandle[] | Candle[] | null>;
  getHealth(symbol: string): MarketDataHealth;
}

class FastForexMarketDataProvider implements MarketDataProvider {
  id: AnalyzeMarketDataProviderId = "fastforex";

  async getPrice(symbol: string): Promise<MarketTick | null> {
    return getFastForexPrice(symbol);
  }

  async getCandles(symbol: string, timeframe: "M1" | "M5", limit: number): Promise<MarketCandle[] | null> {
    return getFastForexCandles(symbol, timeframe, limit);
  }

  getHealth(symbol: string): MarketDataHealth {
    return getMarketDataHealth(symbol);
  }
}

const defaultProvider = new FastForexMarketDataProvider();
let activeProvider: MarketDataProvider = defaultProvider;

export function getAnalyzeMarketDataProvider(): MarketDataProvider {
  return activeProvider;
}

export function setAnalyzeMarketDataProvider(provider: MarketDataProvider | null): void {
  activeProvider = provider ?? defaultProvider;
}

export function createDeterministicTestMarketDataProvider(): MarketDataProvider {
  return {
    id: "test",
    async getPrice(symbol: string): Promise<MarketTick> {
      const timestamp = Date.now() - 60_000;
      return {
        instrument: symbol.replace("-", "/").toUpperCase(),
        bid: 1.0849,
        ask: 1.0851,
        mid: 1.0850,
        time: new Date(timestamp).toISOString(),
        timestamp,
        source: "deterministic_fixture" as any,
        provider: "test" as any,
        receivedAt: Date.now()
      };
    },

    async getCandles(symbol: string, timeframe: "M1" | "M5", limit: number): Promise<MarketCandle[]> {
      const candleCount = Math.max(220, limit);
      const stepMs = timeframe === "M5" ? 300_000 : 60_000;
      const endTimestamp = Math.floor((Date.now() - stepMs * 3) / stepMs) * stepMs;
      let price = 1.0800;

      return Array.from({ length: candleCount }, (_, index) => {
        const wave = Math.sin(index / 9) * 0.00018;
        const drift = index * 0.000003;
        const open = price;
        const close = 1.0800 + drift + wave;
        const high = Math.max(open, close) + 0.00025;
        const low = Math.min(open, close) - 0.00025;
        price = close;

        const timestamp = endTimestamp - (candleCount - 1 - index) * stepMs;
        return {
          time: new Date(timestamp).toISOString(),
          timestamp,
          open,
          high,
          low,
          close,
          volume: 1000 + index,
          complete: true,
          source: "deterministic_fixture" as any,
          provider: "test" as any,
          instrument: symbol.replace("-", "/").toUpperCase(),
          granularity: timeframe,
          priceType: "mid"
        };
      });
    },

    getHealth(_symbol: string): MarketDataHealth {
      return {
        provider: "test" as any,
        dataSourceType: "deterministic_fixture" as any,
        isConnected: true,
        lastRealTickAt: Date.now(),
        dataAgeMs: 0,
        isStaleData: false,
        isSyntheticData: false,
        connectionStatus: "CONNECTED",
        feedMode: "rest_polling",
        configured: true
      };
    }
  };
}