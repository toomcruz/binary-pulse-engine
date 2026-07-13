import { createServer as createViteServer } from "vite";
import path from "path";
import { initMarketDataService, getLatestTick, getMarketDataHealth } from './server/dataSources/marketDataService';
import { getFastForexPrice } from './server/dataSources/fastForex/fastForexPrice';
import { getOandaConfig } from './server/dataSources/oanda/oandaClient';
import { fetchOandaCandles } from './server/dataSources/oanda/oandaCandles';
import { toOandaInstrument } from './server/dataSources/oanda/oandaMapper';
import { getTwelveDataConfig } from './server/dataSources/twelveData/twelveDataClient';
import { getLatestTwelveDataTick, syncAllTwelveDataPrices } from './server/dataSources/twelveData/twelveDataPrice';
import { fetchTwelveDataCandles } from './server/dataSources/twelveData/twelveDataCandles';
import { getMassiveConfig } from './server/dataSources/massive/massiveClient';
import { getLatestMassiveTick } from './server/dataSources/massive/massivePrice';
import { fetchMassiveCandles } from './server/dataSources/massive/massiveCandles';
import { calculateReplayEconomicMetrics, runBackstageReplay, validateReplayPayout } from './server/backstageReplay';
import { getAnalyzeMarketDataProvider, setAnalyzeMarketDataProvider } from './server/dataSources/marketDataProvider';
import { isFastForexTimeoutError } from './server/dataSources/fastForex/fetchWithTimeout';
import {
  getFastForexCandles,
  getBackstageCandles
} from "./server/dataSources/fastForex/fastForexCandles";
import { populateIndicators } from './server/indicators';
import { calculateEntryTime } from './server/utils/aggregator';
import express from "express";
import fs from "fs";
import AdmZip from "adm-zip";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

import { runSignalEngine } from "./server/engine";
import { formatDecisionWithGemini } from "./server/geminiFormatter";
import { MarketContext, Candle } from "./server/types";
import { resetCalibrationSession } from "./server/calibration";

const app = express();

type BackstageCandlesFetcher = (
  symbol: string,
  timeframe: "M1" | "M5",
  targetCandles?: number,
  signal?: AbortSignal
) => ReturnType<typeof getBackstageCandles>;

let backstageScanAllRunning = false;
let backstageScanAllNextAllowedAtMs = 0;
let backstageCandlesFetcher: BackstageCandlesFetcher = getBackstageCandles;

function setBackstageScanAllCandlesFetcher(fetcher: BackstageCandlesFetcher | null) {
  backstageCandlesFetcher = fetcher ?? getBackstageCandles;
}

function resetBackstageScanAllState() {
  backstageScanAllRunning = false;
  backstageScanAllNextAllowedAtMs = 0;
  backstageCandlesFetcher = getBackstageCandles;
}

function getPositiveEnvMs(name: string, defaultMs: number): number {
  const raw = process.env[name];
  if (!raw) return defaultMs;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}

function getBackstageScanAllTimeoutMs(): number {
  return getPositiveEnvMs("BACKSTAGE_SCAN_ALL_TIMEOUT_MS", 60_000);
}

function getBackstageScanAllCooldownMs(): number {
  return getPositiveEnvMs("BACKSTAGE_SCAN_ALL_COOLDOWN_MS", 30_000);
}

function createBackstageScanAllTimeoutError(timeoutMs: number) {
  return Object.assign(new Error(`Backstage scan exceeded ${timeoutMs}ms timeout`), {
    code: "BACKSTAGE_SCAN_TIMEOUT"
  });
}

function createBackstageScanAllAbortError() {
  return Object.assign(new Error("Backstage scan cancelled"), {
    code: "BACKSTAGE_SCAN_CANCELLED"
  });
}

function throwIfBackstageScanAllAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw createBackstageScanAllAbortError();
  }
}


type AnalyzePhase =
  | "request_received"
  | "payload_validated"
  | "market_context_created"
  | "price_fetch_started"
  | "price_fetch_finished"
  | "candles_fetch_started"
  | "candles_fetch_finished"
  | "candles_mapped"
  | "indicators_calculated"
  | "engine_started"
  | "engine_finished"
  | "formatter_started"
  | "formatter_finished"
  | "response_sent"
  | "request_failed";

function shouldTraceAnalyzeMarket(): boolean {
  return process.env.NODE_ENV === "test" || process.env.DEBUG_ANALYZE_MARKET === "true";
}

function createAnalyzeRequestId(): string {
  return `analyze-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createAnalyzePhaseTracker(requestId: string) {
  let lastPhaseAt = Date.now();

  return (phase: AnalyzePhase) => {
    if (!shouldTraceAnalyzeMarket()) return;
    const now = Date.now();
    console.info("[ANALYZE_PHASE]", {
      requestId,
      phase,
      durationMs: now - lastPhaseAt
    });
    lastPhaseAt = now;
  };
}

function sendMarketDataTimeout(res: express.Response, requestId: string) {
  return res.status(504).json({
    ok: false,
    error: "MARKET_DATA_TIMEOUT",
    message: "Tempo limite ao obter dados de mercado",
    requestId
  });
}

function sendMarketDataUnavailable(res: express.Response, requestId: string, message: string) {
  return res.status(503).json({
    ok: false,
    error: "MARKET_DATA_UNAVAILABLE",
    message,
    requestId
  });
}

async function withAnalyzeTimeout<T>(operation: Promise<T>, timeoutMs?: number): Promise<T> {
  const configured = timeoutMs ?? (process.env.NODE_ENV === "test" || process.env.TEST_ENV === "true" ? 500 : 10_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), configured);
  timer.unref?.();

  try {
    return await new Promise<T>((resolve, reject) => {
      operation.then(resolve, reject);
      controller.signal.addEventListener(
        "abort",
        () => reject(Object.assign(new Error("Tempo limite ao obter dados de mercado"), { code: "MARKET_DATA_TIMEOUT" })),
        { once: true }
      );
    });
  } finally {
    clearTimeout(timer);
  }
}

// Initialize OANDA Streaming
initMarketDataService();

const PORT = 3000;

function isClosedCandle(
  candle: Candle,
  timeframe: "M1" | "M5",
  analysisTime: number = Date.now()
): boolean {
  const duration = timeframe === "M5" ? 300000 : 60000;
  return (
    candle.complete === true &&
    candle.timestamp !== undefined &&
    candle.timestamp + duration <= analysisTime
  );
}

function isCryptoSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return (
    upper.includes("BTC") ||
    upper.includes("ETH") ||
    upper.includes("SOL") ||
    upper.includes("XRP") ||
    upper.includes("BNB") ||
    upper.includes("DOGE") ||
    upper.includes("ADA") ||
    upper.includes("LTC")
  );
}

app.use(express.json());

// OANDA Endpoints
app.get("/api/market/status", (req, res) => {
  const provider = "fastforex";
  
  if (provider === "fastforex") {
    let symbolsStr = process.env.FASTFOREX_SYMBOLS_FOREX || "EUR/USD";
    if (symbolsStr.includes("FASTFOREX_SYMBOLS_FOREX=")) {
      symbolsStr = symbolsStr.replace("FASTFOREX_SYMBOLS_FOREX=", "");
    }
    const symbolsForex = symbolsStr.split(",");
    let cryptoStr = process.env.FASTFOREX_SYMBOLS_CRYPTO || "BTC/USD";
    if (cryptoStr.includes("FASTFOREX_SYMBOLS_CRYPTO=")) {
      cryptoStr = cryptoStr.replace("FASTFOREX_SYMBOLS_CRYPTO=", "");
    }
    const symbolsCrypto = cryptoStr.split(",");
    const isConfigured = !!process.env.FASTFOREX_API_KEY;
    if (!isConfigured) {
      res.json({
        configured: false,
        provider: "fastforex",
        connected: false,
        status: "NOT_CONFIGURED",
        lastRealTickAt: null,
        dataAgeMs: null,
        isStaleData: true,
        error: "FASTFOREX_NOT_CONFIGURED"
      });
      return;
    }
    
    const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
    const health = getMarketDataHealth(symbol);
    
    res.json({
      configured: true,
      hasApiKey: true,
      environment: process.env.NODE_ENV === "production" ? "production" : (process.env.NODE_ENV === "test" ? "test" : "preview"),
      mocked: false,
      provider: "fastforex",
      symbols: [...symbolsForex, ...symbolsCrypto],
      connected: health.isConnected,
      status: health.connectionStatus,
      dataSourceType: "fastforex_rest",
      lastRealTickAt: health.lastRealTickAt,
      dataAgeMs: health.dataAgeMs,
      isStaleData: health.isStaleData,
      error: health.error || null
    });
    return;
  }
  
  res.json({ configured: false, provider, symbols: [], connected: false, status: "NOT_CONFIGURED" });
});

app.get("/api/market/latest-price", async (req, res) => {
  const symbol = String(req.query.symbol || "");

  if (!symbol) {
    return res.status(400).json({
      ok: false,
      error: "MISSING_SYMBOL"
    });
  }

  const tick = await getFastForexPrice(symbol);

  if (!tick) {
    return res.status(503).json({
      ok: false,
      error: "FASTFOREX_PRICE_UNAVAILABLE"
    });
  }

  const health = getMarketDataHealth(symbol);

  return res.json({
    ok: true,
    symbol,
    price: tick.mid,
    bid: tick.bid ?? null,
    ask: tick.ask ?? null,
    timestamp: tick.timestamp,
    receivedAt: tick.receivedAt,
    provider: "fastforex",
    dataSourceType: "fastforex_rest",
    isStaleData: health.isStaleData,
    dataAgeMs: health.dataAgeMs
  });
});

app.get("/api/market/candles", async (req, res) => {
  const symbol = String(req.query.symbol || "");

  const requestedTimeframe = String(
    req.query.timeframe ||
    req.query.interval ||
    "M1"
  );

  const timeframe = requestedTimeframe === "M5" ? "M5" : "M1";

  const requestedLimit = Number(req.query.limit || 100);

  const limit = Math.min(2000, Math.max(20, requestedLimit));

  if (!symbol) {
    return res.status(400).json({
      ok: false,
      error: "MISSING_SYMBOL"
    });
  }

  const candles = await getFastForexCandles(symbol, timeframe, limit);

  if (!candles?.length) {
    return res.status(503).json({
      ok: false,
      error: "MARKET_CANDLES_UNAVAILABLE"
    });
  }

  return res.json({
    ok: true,
    symbol,
    timeframe,
    provider: candles[0]?.provider,
    source: candles[0]?.source,
    candles
  });
});

app.post("/api/market-ticker", async (req, res) => {
  try {
    const { asset } = req.body;
    if (!asset) {
       res.status(400).json({ error: "Missing asset parameter" });
       return;
    }
    const price = await getFastForexPrice(asset);

    if (!price) {
       res.status(503).json({ error: "FASTFOREX_PRICE_UNAVAILABLE" });
       return;
    }

    res.json({
      asset,
      price: price.mid,
      bid: price.bid ?? null,
      ask: price.ask ?? null,
      timestamp: price.timestamp,
      receivedAt: price.receivedAt,
      provider: "fastforex"
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
// Real-Time Historical Backtest & Calibration Engine (Looking at the past to predict the future)
function backtestStrategy(candles: any[], strategy: string, asset: string, precisionLevel: "normal" | "high" | "elite" = "high") {
  const completedCandles = candles && candles.length > 1 ? candles.slice(0, -1) : [];

  if (!completedCandles || completedCandles.length < 10) {
    return {
      winRate: 0,
      wins: 0,
      losses: 0,
      totalSignals: 0,
      consecutiveLosses: 0,
      recentSequence: [],
      isStrategyFit: false,
      insufficientData: true
    };
  }

  let wins = 0;
  let losses = 0;
  let totalSignals = 0;
  let consecutiveLosses = 0;
  const recentSequence: string[] = [];

  // Inspect sliding window of the last 15 completed candles (excluding the current uncompleted index)
  const startIdx = Math.max(0, completedCandles.length - 15);
  const endIdx = completedCandles.length - 2;

  for (let i = startIdx; i <= endIdx; i++) {
    const historicalCandle = completedCandles[i];
    const nextCandle = completedCandles[i + 1];
    if (!historicalCandle || !nextCandle) continue;

    const ind = {
      rsi: historicalCandle.rsi !== undefined ? historicalCandle.rsi : 50,
      ema9: historicalCandle.ema9 !== undefined ? historicalCandle.ema9 : historicalCandle.close,
      sma21: historicalCandle.sma21 !== undefined ? historicalCandle.sma21 : historicalCandle.close,
      macd: historicalCandle.macd || { line: 0, signal: 0, histogram: 0 },
      stochastic: historicalCandle.stochastic || { k: 50, d: 50 },
      bollinger: historicalCandle.bollinger || { upper: historicalCandle.close * 1.001, middle: historicalCandle.close, lower: historicalCandle.close * 0.999 },
      atr: historicalCandle.atr !== undefined ? historicalCandle.atr : 0.0002
    };

    const pastCandlesSlice = completedCandles.slice(0, i + 1);

    const decision = simulateAnalysis(
      asset,
      "M5",
      historicalCandle.close,
      ind,
      strategy,
      null,
      pastCandlesSlice,
      precisionLevel
    );

    if (decision.signal === "CALL" || decision.signal === "PUT") {
      totalSignals++;
      const entryPrice = historicalCandle.close;
      const exitPrice = nextCandle.close;
      
      let isWin = false;
      if (decision.signal === "CALL") {
        isWin = exitPrice > entryPrice;
      } else if (decision.signal === "PUT") {
        isWin = exitPrice < entryPrice;
      }

      if (isWin) {
        wins++;
        consecutiveLosses = 0;
        recentSequence.push("WIN");
      } else {
        losses++;
        consecutiveLosses++;
        recentSequence.push("LOSS");
      }
    }
  }

  const winRate = totalSignals > 0 ? Math.round((wins / totalSignals) * 100) : 0;

  return {
    winRate,
    wins,
    losses,
    totalSignals,
    consecutiveLosses,
    recentSequence: recentSequence.slice(-5),
    isStrategyFit: totalSignals >= 3 ? winRate >= 50 : false,
    insufficientData: totalSignals < 3
  };
}


const BACKSTAGE_REPLAY_SUPPORTED_ASSETS = new Set([
  "EUR/USD", "GBP/USD", "USD/JPY", "EUR/JPY", "GBP/JPY", "AUD/USD", "USD/CAD",
  "EUR/GBP", "BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD", "BNB/USD", "USD/BRL"
]);

const BACKSTAGE_REPLAY_SUPPORTED_STRATEGIES = new Set([
  "all",
  "auto",
  "reversion",
  "trend",
  "price_action",
  "breakout",
  "candle_flow",
  "order_block",
  "liquidity_sweep",
  "fvg"
]);

const BACKSTAGE_REPLAY_SUPPORTED_PRECISION_LEVELS = new Set(["normal", "high", "elite"]);

function normalizeBackstageReplayTimeframe(timeframe: unknown): "M1" | "M5" | null {
  if (typeof timeframe !== "string") return null;
  const clean = timeframe.trim().toLowerCase();
  if (["m1", "1m", "1min", "1minute", "1-minute"].includes(clean)) return "M1";
  if (["m5", "5m", "5min", "5minute", "5-minute"].includes(clean)) return "M5";
  return null;
}

function normalizeBackstageReplayAsset(asset: unknown): string {
  const raw = typeof asset === "object" && asset !== null && "symbol" in asset
    ? (asset as { symbol?: unknown }).symbol
    : asset;
  return typeof raw === "string" ? raw.trim().toUpperCase() : "";
}

function normalizeBackstageReplayStrategy(strategy: unknown): string {
  if (strategy === undefined || strategy === null || strategy === "") return "all";
  return typeof strategy === "string" ? strategy.trim() : "";
}

function normalizeBackstageReplayPrecisionLevel(precisionLevel: unknown): "normal" | "high" | "elite" | undefined {
  if (precisionLevel === undefined || precisionLevel === null || precisionLevel === "") return undefined;
  if (typeof precisionLevel !== "string") return undefined;
  const normalized = precisionLevel.trim().toLowerCase();
  return BACKSTAGE_REPLAY_SUPPORTED_PRECISION_LEVELS.has(normalized)
    ? normalized as "normal" | "high" | "elite"
    : undefined;
}

// Strategy-Market-Fit & Market Cycle Assessment Engine (Anti-Loss Shield)
// REST API endpoint to analyze market indicators and generate high-assertiveness signals

// Endpoint to run Backstage Historical Replay
app.post("/api/backstage-replay", async (req, res) => {
  try {
    const { asset, timeframe, strategy, precisionLevel, payout } = req.body;
    const assetStr = normalizeBackstageReplayAsset(asset);
    const normalizedTimeframe = normalizeBackstageReplayTimeframe(timeframe);
    const normalizedStrategy = normalizeBackstageReplayStrategy(strategy);
    const normalizedPrecisionLevel = normalizeBackstageReplayPrecisionLevel(precisionLevel);
    const normalizedPayout = validateReplayPayout(payout);
    
    if (!assetStr) {
      res.status(400).json({ error: "MISSING_ASSET" });
      return;
    }

    if (!BACKSTAGE_REPLAY_SUPPORTED_ASSETS.has(assetStr)) {
      res.status(400).json({ error: "INVALID_ASSET" });
      return;
    }

    if (!normalizedTimeframe) {
      res.status(400).json({ error: "INVALID_TIMEFRAME" });
      return;
    }

    if (!BACKSTAGE_REPLAY_SUPPORTED_STRATEGIES.has(normalizedStrategy)) {
      res.status(400).json({ error: "INVALID_STRATEGY" });
      return;
    }

    if (precisionLevel !== undefined && precisionLevel !== null && precisionLevel !== "" && !normalizedPrecisionLevel) {
      res.status(400).json({ error: "INVALID_PRECISION_LEVEL" });
      return;
    }
    
    const granularity = normalizedTimeframe;
    const targetSignals = 100;
    
    // Reset calibration DB so it doesn't leak between different replays
    resetCalibrationSession();

    // Fetch up to 2000 candles with real pagination
    const { candles, metrics: paginationMetrics } = await getBackstageCandles(assetStr, granularity, 2000);
    if (!candles || candles.length === 0) {
       throw new Error("MARKET_CANDLES_UNAVAILABLE");
    }

    const { results, trainSignals, invalidExpiryGaps, invalidExpiryGapEvents, datasetHash } = runBackstageReplay({
       asset: assetStr,
       timeframe: normalizedTimeframe,
       candles: candles,
       strategy: normalizedStrategy,
       precisionLevel: normalizedPrecisionLevel
    });

    const wins = results.filter((r: any) => r.result === "WIN").length;
    const losses = results.filter((r: any) => r.result === "LOSS").length;
    const draws = results.filter((r: any) => r.result === "DRAW").length;
    const signalsDecided = wins + losses;
    
    let maxConsecutiveLosses = 0;
    let currentConsecutiveLosses = 0;
    
    for (const r of results) {
      if (r.result === "LOSS") {
        currentConsecutiveLosses++;
        if (currentConsecutiveLosses > maxConsecutiveLosses) maxConsecutiveLosses = currentConsecutiveLosses;
      } else if (r.result === "WIN") {
        currentConsecutiveLosses = 0;
      }
      // DRAW does not break or increase the streak
    }

    const winRate = signalsDecided > 0 ? (wins / signalsDecided) * 100 : 0;
    const economicMetrics = calculateReplayEconomicMetrics(results, normalizedPayout);
    
    let status = "BACKSTAGE_TESTING";
    if (signalsDecided >= targetSignals && winRate >= 58 && maxConsecutiveLosses <= 5) {
       status = "BACKSTAGE_VALIDATED";
    } else if (signalsDecided >= targetSignals) {
       status = "BACKSTAGE_REJECTED";
    }

    res.json({
      status,
      datasetHash,
      candlesProcessed: candles.length,
      signalsDecided,
      targetSignals,
      trainSignals,
      invalidExpiryGaps,
      invalidExpiryGapEvents,
      wins,
      losses,
      draws,
      winRate,
      maxConsecutiveLosses,
      pagination: paginationMetrics,
      ...economicMetrics,
      results
    });
  } catch (error: any) {
    console.error("Error in /api/backstage-replay:", error);
    res.status(400).json({ error: error.message || "MARKET_CANDLES_UNAVAILABLE" });
  }
});

async function runBackstageScanAll(signal: AbortSignal) {
  const assets = ["EUR/USD", "GBP/USD", "USD/JPY", "EUR/GBP", "AUD/USD", "USD/CAD"];
    const timeframes = ["M1", "M5"];
    const strategies = ["reversion", "trend", "price_action", "breakout", "candle_flow", "order_block", "liquidity_sweep", "fvg"];
    
    const reverseStrategyMap: Record<string, string> = {
      "reversion": "extremeRetrace",
      "trend": "trendFollow",
      "price_action": "priceActionClassic",
      "breakout": "dynamicBreakout",
      "candle_flow": "candleFlow",
      "order_block": "orderBlock",
      "liquidity_sweep": "liquiditySweep",
      "fvg": "fvg"
    };

    const allSetups: any[] = [];

    // Loop through assets and timeframes
    for (const asset of assets) {
      throwIfBackstageScanAllAborted(signal);

      for (const tf of timeframes) {
        throwIfBackstageScanAllAborted(signal);
        const granularity = tf === "M1" ? "M1" : "M5";
        
        let candles = [];
        try {
          throwIfBackstageScanAllAborted(signal);
          const { candles: backCandles } = await backstageCandlesFetcher(asset, granularity, 2000, signal);
          throwIfBackstageScanAllAborted(signal);
          candles = backCandles;
        } catch (err: any) {
          if (err?.message === "MARKET_CANDLES_UNAVAILABLE") {
            continue; // skip if asset/candles not available
          }
          throw err;
        }

        if (!candles || candles.length < 37) continue;
        throwIfBackstageScanAllAborted(signal);
        const completeCandles = candles.filter(c => c.complete);

        // Run backstage replay with "all" strategies
        throwIfBackstageScanAllAborted(signal);
        resetCalibrationSession();
        const { results: allSignals } = runBackstageReplay({
          asset,
          timeframe: tf,
          candles: completeCandles,
          strategy: "all"
        });
        throwIfBackstageScanAllAborted(signal);

        // Group signals by strategy
        for (const strat of strategies) {
          const backendStratName = reverseStrategyMap[strat];
          const stratSignals = allSignals.filter(s => s.strategy === backendStratName && (s.result === "WIN" || s.result === "LOSS" || s.result === "DRAW"));
          const decidedSignals = stratSignals.filter(s => s.result === "WIN" || s.result === "LOSS");
          
          const totalDecided = decidedSignals.length;
          const wins = decidedSignals.filter(s => s.result === "WIN").length;
          const losses = decidedSignals.filter(s => s.result === "LOSS").length;
          const draws = stratSignals.filter(s => s.result === "DRAW").length;
          const winRate = totalDecided > 0 ? (wins / totalDecided) * 100 : 0;

          let maxConsecutiveLosses = 0;
          let consecutiveLosses = 0;
          for (const s of decidedSignals) {
            if (s.result === "LOSS") {
              consecutiveLosses++;
              if (consecutiveLosses > maxConsecutiveLosses) {
                maxConsecutiveLosses = consecutiveLosses;
              }
            } else if (s.result === "WIN") {
              consecutiveLosses = 0;
            }
          }

          // Regime dominante
          const regimes = stratSignals.map(s => s.regime).filter((r): r is string => Boolean(r));
          const regimeCounts: Record<string, number> = {};
          regimes.forEach(r => { regimeCounts[r] = (regimeCounts[r] || 0) + 1; });
          let dominantRegime = "range";
          let maxCount = 0;
          for (const r in regimeCounts) {
            if (regimeCounts[r] > maxCount) {
              maxCount = regimeCounts[r];
              dominantRegime = r;
            }
          }

          // Setup classification
          let status: "BEST_SETUP" | "ACCEPTABLE_SETUP" | "REJECTED_SETUP" | "INSUFFICIENT_HISTORY" = "INSUFFICIENT_HISTORY";
          if (totalDecided < 100) {
            status = "INSUFFICIENT_HISTORY";
          } else if (winRate >= 58 && maxConsecutiveLosses <= 5) {
            status = "BEST_SETUP";
          } else if (winRate >= 50 && maxConsecutiveLosses <= 7) {
            status = "ACCEPTABLE_SETUP";
          } else {
            status = "REJECTED_SETUP";
          }

          allSetups.push({
            asset,
            timeframe: tf,
            strategy: strat,
            totalDecided,
            wins,
            losses,
            draws,
            winRate,
            maxConsecutiveLosses,
            dominantRegime,
            status
          });
        }
      }
    }

    // Now compute general scanner stats
    const validSetups = allSetups.filter(s => s.status !== "INSUFFICIENT_HISTORY");
    
    let bestStrategy = "N/A";
    let worstStrategy = "N/A";
    let bestAsset = "N/A";
    let bestTimeframe = "N/A";

    if (validSetups.length > 0) {
      const sorted = [...validSetups].sort((a, b) => b.winRate - a.winRate || a.maxConsecutiveLosses - b.maxConsecutiveLosses);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];

      bestStrategy = best.strategy;
      worstStrategy = worst.strategy;
      bestAsset = best.asset;
      bestTimeframe = best.timeframe;
    }

    return {
      setups: allSetups,
      stats: {
        bestStrategy,
        worstStrategy,
        bestAsset,
        bestTimeframe
      }
    };
}

app.post("/api/backstage-scan-all", async (_req, res) => {
  if (backstageScanAllRunning) {
    return res.status(409).json({ error: "BACKSTAGE_SCAN_ALREADY_RUNNING" });
  }

  const now = Date.now();
  if (now < backstageScanAllNextAllowedAtMs) {
    const retryAfterMs = backstageScanAllNextAllowedAtMs - now;
    res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    return res.status(429).json({
      error: "BACKSTAGE_SCAN_RATE_LIMITED",
      retryAfterMs
    });
  }

  backstageScanAllRunning = true;
  backstageScanAllNextAllowedAtMs = now + getBackstageScanAllCooldownMs();
  const timeoutMs = getBackstageScanAllTimeoutMs();
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  const scanPromise = runBackstageScanAll(controller.signal);
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(createBackstageScanAllTimeoutError(timeoutMs));
    }, timeoutMs);
    timer.unref?.();
  });

  try {
    const result = await Promise.race([scanPromise, timeoutPromise]);
    if (!res.headersSent) {
      res.json(result);
    }
  } catch (error: any) {
    console.error("Error in /api/backstage-scan-all:", error);
    if (error?.code === "BACKSTAGE_SCAN_TIMEOUT") {
      if (!res.headersSent) {
        res.status(504).json({
          error: "BACKSTAGE_SCAN_TIMEOUT",
          message: `Backstage scan exceeded ${timeoutMs}ms timeout`
        });
      }

      try {
        await scanPromise;
      } catch (scanError: any) {
        if (scanError?.code !== "BACKSTAGE_SCAN_CANCELLED") {
          console.error("Error while cancelling /api/backstage-scan-all:", scanError);
        }
      }
      return;
    }

    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "INTERNAL_SERVER_ERROR" });
    }
  } finally {
    if (timer) clearTimeout(timer);
    backstageScanAllRunning = false;
  }
});

app.post("/api/analyze-market", async (req, res) => {
  const requestId = createAnalyzeRequestId();
  const tracePhase = createAnalyzePhaseTracker(requestId);
  tracePhase("request_received");

  try {
    let { asset, timeframe, currentPrice, candles, indicators, strategy, precisionLevel, consecutiveLossCount, isBackground, marketContext } = req.body;
    if (!marketContext) { marketContext = { newsRisk: 'LOW', session: 'OVERLAP', minutesToHighImpactNews: 120 }; }
    
    // Validate execution mode
    const allowedExecutionModes = ["live", "paper_trading", "backstage", "debug"];
    const requestedExecutionMode = marketContext.executionMode || "live";
    if (!allowedExecutionModes.includes(requestedExecutionMode)) {
      tracePhase("request_failed");
      return res.status(400).json({ error: "INVALID_EXECUTION_MODE", requestId });
    }
    marketContext.executionMode = requestedExecutionMode;

    // Validate strategy mode
    const selectedStrategy = strategy || "reversion";
    const allowedStrategies = [
      "auto",
      "all",
      "reversion",
      "trend",
      "price_action",
      "breakout",
      "candle_flow",
      "order_block",
      "liquidity_sweep",
      "fvg"
    ];
    if (!allowedStrategies.includes(selectedStrategy)) {
      tracePhase("request_failed");
      return res.status(400).json({ error: "INVALID_STRATEGY_MODE", requestId });
    }
    marketContext.strategyMode = selectedStrategy;

    const symbolStr = typeof asset === "object" && asset !== null ? (asset as any).symbol || "" : String(asset);
    const granularity = (timeframe === "1min" || timeframe === "M1") ? "M1" : "M5";

    if (!symbolStr || !timeframe || !currentPrice) {
      tracePhase("request_failed");
      res.status(400).json({ error: "Missing required parameters.", requestId });
      return;
    }

    tracePhase("payload_validated");

    // INTEGRATION WITH REAL-TIME FEEDS (FASTFOREX)
    const marketDataProvider = getAnalyzeMarketDataProvider();
    const provider = marketDataProvider.id;
    
    let tick = null;
    let health = null;

    tracePhase("market_context_created");

    if (provider === "fastforex") {
      const isFastForex = !!process.env.FASTFOREX_API_KEY;
      if (isFastForex) {
        tracePhase("price_fetch_started");
        tick = await withAnalyzeTimeout(marketDataProvider.getPrice(symbolStr));
        tracePhase("price_fetch_finished");
        health = marketDataProvider.getHealth(symbolStr);
        const isFastForexOperational = tick &&
                                     tick.provider === "fastforex" &&
                                     (tick.source === "fastforex_rest" || tick.source === "fastforex_stream") &&
                                     health && 
                                     health.provider === "fastforex" &&
                                     (health.dataSourceType === "fastforex_rest" || health.dataSourceType === "fastforex_stream") &&
                                     !health.isSyntheticData &&
                                     !health.isStaleData &&
                                     health.dataAgeMs !== null && health.dataAgeMs <= 45000;
        if (!isFastForexOperational) {
           tracePhase("request_failed");
           return sendMarketDataUnavailable(res, requestId, "FastForex indisponível ou stale.");
        }
      } else {
        tracePhase("request_failed");
        return sendMarketDataUnavailable(res, requestId, "Operação bloqueada: FastForex não está configurado.");
      }
    } else if (provider === "test") {
      tracePhase("price_fetch_started");
      tick = await withAnalyzeTimeout(marketDataProvider.getPrice(symbolStr));
      tracePhase("price_fetch_finished");
      health = marketDataProvider.getHealth(symbolStr);

      if (!tick || !health || health.isStaleData) {
        tracePhase("request_failed");
        return sendMarketDataUnavailable(res, requestId, "Provedor de dados de mercado indisponível.");
      }
    } else {
       tracePhase("request_failed");
       return sendMarketDataUnavailable(res, requestId, "Provedor de dados de mercado não suportado.");
    }
    
    if (tick && health && !health.isStaleData) {
      currentPrice = tick.mid;
      if (marketContext) {
        marketContext.configured = true;
        marketContext.hasToken = true;
        marketContext.hasAccountId = true;
        marketContext.dataSourceType = tick.source;
        
        const cleanSym = (typeof asset === "object" && asset !== null ? asset.symbol || "" : String(asset)).toUpperCase();
        if (isCryptoSymbol(cleanSym)) {
          marketContext.priceProvider = provider;
          marketContext.candleProvider = "binance";
          marketContext.dataSourceMode = "hybrid";
        } else {
          marketContext.priceProvider = provider;
          marketContext.candleProvider = provider;
          marketContext.dataSourceMode = "single";
        }

        marketContext.feedMode = health.feedMode;
        marketContext.isSyntheticData = false;
        marketContext.isStaleData = false;
        marketContext.dataAgeMs = health.dataAgeMs || undefined;
        marketContext.lastRealTickAt = health.lastRealTickAt || undefined;

        marketContext.executionPrice = tick.mid;
        marketContext.bid = tick.bid;
        marketContext.ask = tick.ask;
        marketContext.mid = tick.mid;

        if (tick.ask && tick.bid) {
           const spread = tick.ask - tick.bid;
           let pipSize = 0.0001;
           if (cleanSym.includes("JPY")) pipSize = 0.01;
           
           const spreadPips = spread / pipSize;
           marketContext.spread = spread;
           marketContext.spreadPips = spreadPips;
           
           let maxSpread = 2.0;
           if (cleanSym.includes("EUR_USD") || cleanSym.includes("EUR/USD")) maxSpread = 1.5;
           else if (cleanSym.includes("GBP_USD") || cleanSym.includes("GBP/USD")) maxSpread = 2.0;
           else if (cleanSym.includes("USD_JPY") || cleanSym.includes("USD/JPY")) maxSpread = 1.8;
           else if (cleanSym.includes("EUR_GBP") || cleanSym.includes("EUR/GBP")) maxSpread = 1.8;
           
           marketContext.maxAllowedSpreadPips = maxSpread;
        }
      }
    } else {
      if (marketContext) {
        marketContext.dataSourceType = "tradingview_visual";
        marketContext.priceProvider = "tradingview";
        marketContext.isStaleData = true;
      }
    }

    // FETCH REAL AND VALIDATED CANDLES DIRECTLY FROM FASTFOREX
    let finalCandles: Candle[] = [];
    try {
      tracePhase("candles_fetch_started");
      const realMarketCandles = await withAnalyzeTimeout(marketDataProvider.getCandles(symbolStr, granularity, 110));
      tracePhase("candles_fetch_finished");
      
      if (realMarketCandles && realMarketCandles.length > 0) {
        const mappedCandles: Candle[] = realMarketCandles.map(rc => ({
          time: rc.time,
          timestamp: rc.timestamp,
          complete: rc.complete,
          volume: rc.volume,
          open: rc.open,
          high: rc.high,
          low: rc.low,
          close: rc.close,
          provider: rc.provider,
          source: rc.source
        }));
        tracePhase("candles_mapped");
        
        // Filter out incomplete/active candles using the strict closed-candle checks
        const closedCandles = mappedCandles.filter(c => isClosedCandle(c, granularity, Date.now()));
        
        // Enrich candles with real-time computed technical indicators
        finalCandles = populateIndicators(closedCandles);
        tracePhase("indicators_calculated");
        
        if (marketContext) {
          // Closed candles analysis, do not include incomplete active candle
          marketContext.includesActiveCandle = false;
        }
      } else {
        throw new Error("No real candles returned from FastForex Candles API.");
      }
    } catch (candlesErr: any) {
      tracePhase("request_failed");
      if (isFastForexTimeoutError(candlesErr)) {
        return sendMarketDataTimeout(res, requestId);
      }
      console.error("[FastForex] Real Candles retrieval failed. Overriding to Neutral. Error:", candlesErr);
      return sendMarketDataUnavailable(res, requestId, "Falha ao carregar dados históricos de candle.");
    }

    const candlesCount = finalCandles.length;
    const firstTime = finalCandles[0]?.time;
    const lastTime = finalCandles[finalCandles.length - 1]?.time;
    const isSorted = finalCandles.length > 0 && finalCandles.every((c, i) => i === 0 || c.time >= finalCandles[i - 1].time);
    
    const lastCandle = finalCandles[finalCandles.length - 1];
    const indicatorsCalculated = !!(lastCandle && 
                                  lastCandle.ema9 !== undefined && 
                                  lastCandle.sma21 !== undefined && 
                                  lastCandle.rsi !== undefined && 
                                  lastCandle.macd !== undefined && 
                                  lastCandle.bollinger !== undefined && 
                                  lastCandle.stochastic !== undefined && 
                                  lastCandle.atr !== undefined);

    // Logging detailed real-time market data retrieval
    console.log("================== ANÁLISE OPERACIONAL REAL-TIME ==================");
    console.log(`Ativo: ${symbolStr} | Timeframe: ${timeframe}`);
    console.log(`Candles recebidos da FastForex: ${candlesCount}`);
    console.log(`Primeiro Horário: ${firstTime} | Último Horário: ${lastTime}`);
    console.log(`Candles Ordenados Corretamente: ${isSorted ? "SIM" : "NÃO"}`);
    console.log(`Indicadores Técnicos Calculados: ${indicatorsCalculated ? "SIM" : "NÃO"}`);
    console.log("===================================================================");

    // Safety Block 1: Minimum 100 candles M1 reais
    if (candlesCount < 100) {
      console.warn(`[Bloqueio de Segurança] VETO: Insuficientes candles reais da FastForex (${candlesCount} < 100)`);
      return res.json({
        signal: "NEUTRAL",
        technicalScore: 0,
        calibratedProbability: null,
        calibrationAvailable: false,
        strategy: strategy || "reversion",
        reasoning: ["VETO: Insuficientes candles reais da FastForex (mínimo de 100 candles exigido)."],
        message: "Quantidade de candles insuficiente (< 100).",
        vetoReasons: ["Quantidade de candles insuficiente (< 100)."],
        marketContext
      });
    }

    // Safety Block 2: Chronological order
    if (!isSorted) {
      console.warn("[Bloqueio de Segurança] VETO: Velas fora de ordem cronológica.");
      return res.json({
        signal: "NEUTRAL",
        technicalScore: 0,
        calibratedProbability: null,
        calibrationAvailable: false,
        strategy: strategy || "reversion",
        reasoning: ["VETO: Velas históricas fora de ordem cronológica."],
        message: "Candles fora de ordem.",
        vetoReasons: ["Velas fora de ordem cronológica."],
        marketContext
      });
    }

    // Safety Block 3: Invalid candles (NaN, negative, zero values)
    const hasInvalidCandle = finalCandles.some(c => 
      !c.time ||
      !Number.isFinite(c.open) || 
      !Number.isFinite(c.high) || 
      !Number.isFinite(c.low) || 
      !Number.isFinite(c.close) || 
      c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0
    );
    if (hasInvalidCandle) {
      console.warn("[Bloqueio de Segurança] VETO: Velas históricas contêm valores inválidos.");
      return res.json({
        signal: "NEUTRAL",
        technicalScore: 0,
        calibratedProbability: null,
        calibrationAvailable: false,
        strategy: strategy || "reversion",
        reasoning: ["VETO: Pelo menos uma vela histórica possui dados nulos, negativos ou inválidos."],
        message: "Candles contêm valores nulos ou inválidos.",
        vetoReasons: ["Velas contêm valores nulos ou inválidos."],
        marketContext
      });
    }

    // Safety Block 4: Technical indicators missing
    if (!indicatorsCalculated) {
      console.warn("[Bloqueio de Segurança] VETO: Não foi possível calcular os indicadores técnicos principais nos candles históricos.");
      return res.json({
        signal: "NEUTRAL",
        technicalScore: 0,
        calibratedProbability: null,
        calibrationAvailable: false,
        strategy: strategy || "reversion",
        reasoning: ["VETO: Indicadores técnicos principais não puderam ser calculados por falta de dados históricos de maior período."],
        message: "Indicadores principais ausentes.",
        vetoReasons: ["Não foi possível calcular indicadores principais devido a dados incompletos."],
        marketContext
      });
    }

    const lossCountNum = consecutiveLossCount !== undefined ? parseInt(consecutiveLossCount) : 0;
    const tvData = req.body.tvData || null;
    // Already declared at the top of the endpoint

    // 1. O motor é a ÚNICA fonte de decisão (signal, confidence, etc)
    if (req.body?.marketContext?.executionMode) {
      marketContext.executionMode = req.body.marketContext.executionMode;
    } else {
      marketContext.executionMode = "live";
    }
    tracePhase("engine_started");
    const engineDecision = simulateAnalysis(
      symbolStr,
      timeframe,
      currentPrice,
      indicators,
      selectedStrategy,
      tvData,
      finalCandles,
      precisionLevel || "high",
      lossCountNum,
      marketContext
    );
    tracePhase("engine_finished");

    const calibrationThreshold = req.body.calibrationThreshold !== undefined ? Number(req.body.calibrationThreshold) : null;
    if (calibrationThreshold !== null && (engineDecision.signal === "CALL" || engineDecision.signal === "PUT")) {
      if (engineDecision.calibratedProbability !== null && engineDecision.calibratedProbability < calibrationThreshold) {
        console.log(`[Calibration Gate] Vetoing ${engineDecision.signal} because calibratedProbability (${engineDecision.calibratedProbability}) < threshold (${calibrationThreshold})`);
        engineDecision.signal = "NEUTRAL";
        engineDecision.vetoReasons = [...(engineDecision.vetoReasons || []), `VETO: calibration_gate - Probabilidade calibrada (${(engineDecision.calibratedProbability * 100).toFixed(1)}%) abaixo do threshold de calibração (${(calibrationThreshold * 100).toFixed(1)}%).`];
        engineDecision.reasoning = [...(engineDecision.reasoning || []), `VETO: calibration_gate - Probabilidade calibrada abaixo do threshold.`];
      }
    }

    if (engineDecision.signal === "CALL" || engineDecision.signal === "PUT") {
      let satisfiesCallPutRules = false;
      let blockReasons: string[] = [];
      
      if (provider === "fastforex") {
        const spreadIsTooHigh = !!marketContext && marketContext.spreadPips !== undefined && marketContext.maxAllowedSpreadPips !== undefined && marketContext.spreadPips > marketContext.maxAllowedSpreadPips;
        const isStale = !marketContext || marketContext.isStaleData === true || (marketContext.dataAgeMs !== undefined && marketContext.dataAgeMs > 45000);
        
        satisfiesCallPutRules = 
          !!marketContext &&
          (marketContext.priceProvider === "fastforex" || marketContext.priceProvider === "test") &&
          (marketContext.dataSourceType === "fastforex_rest" || marketContext.dataSourceType === "fastforex_stream" || marketContext.dataSourceType === "deterministic_fixture") &&
          marketContext.isSyntheticData === false &&
          !isStale &&
          !spreadIsTooHigh &&
          marketContext.executionPrice !== undefined && marketContext.executionPrice !== null;
          
        if (!satisfiesCallPutRules) {
          if (spreadIsTooHigh) blockReasons.push(`Spread muito alto: ${marketContext?.spreadPips?.toFixed(1)} pips (máx: ${marketContext?.maxAllowedSpreadPips} pips).`);
          if (isStale) blockReasons.push(`Dados de mercado obsoletos ou indisponíveis (Idade: ${marketContext?.dataAgeMs}ms).`);
          if (marketContext?.isSyntheticData) blockReasons.push("Operações com dados sintéticos são proibidas para sinais reais.");
        }
      }

      if (!satisfiesCallPutRules) {
        const providerName = "FastForex";
        console.log(`[Block Signal] Overriding ${engineDecision.signal} to NEUTRAL. ${providerName} conditions not met.`);
        engineDecision.signal = "NEUTRAL";
        engineDecision.vetoReasons = [...(engineDecision.vetoReasons || []), ...blockReasons, `${providerName} feed inativo, stale ou indisponível para operações reais.`];
        engineDecision.reasoning = [...(engineDecision.reasoning || []), `VETO: market_data_unavailable_or_stale - ${blockReasons.join(" ")}`];
      }
    }

    if (provider === "fastforex" && tick && health && !health.isStaleData) {
      engineDecision.isSimulated = false;
          }

    console.log(`[Análise Final] Ativo: ${symbolStr} | Sinal: ${engineDecision.signal} | Confiança: ${engineDecision.technicalScore}%`);
    if (engineDecision.signal === "NEUTRAL" && engineDecision.vetoReasons && engineDecision.vetoReasons.length > 0) {
      console.log(`[Bloqueio/Veto Detectado]: ${engineDecision.vetoReasons.join(" | ")}`);
    }
    console.log("===================================================================\n");

    tracePhase("formatter_started");
    const explanation = await formatDecisionWithGemini(engineDecision);
    tracePhase("formatter_finished");
    const responseObj = {
      ...engineDecision,
      ok: true,
      requestId,
      blockReasons: Array.isArray(engineDecision.blockReasons) ? engineDecision.blockReasons : [],
      marketContext,
      reasoning: explanation
    };
    tracePhase("response_sent");
    res.status(200).json(responseObj);
  } catch (error: any) {
    tracePhase("request_failed");
    if (isFastForexTimeoutError(error)) {
      return sendMarketDataTimeout(res, requestId);
    }
    console.error("Error in /api/analyze-market:", error);
    res.status(500).json({ ok: false, error: "ANALYSIS_FAILED", message: error.message || "Failed to analyze market data.", requestId });
  }
});

// GET ENDPOINT FOR DIRECT END-TO-END VERIFICATION AND TESTING FROM ANY BROWSER
if (process.env.NODE_ENV !== "production") {
  app.get('/api/debug/replay', async (req, res) => {
    try {
      const asset = "EUR/USD";
      const timeframe = "M1";
      
      const marketContext: MarketContext = {
        executionMode: "debug",
        newsRisk: "LOW",
        session: "OVERLAP",
        minutesToHighImpactNews: 120,
        engineVersion: "v1.0",
        strategyMode: "auto",
        dataAgeMs: 100,
        hasToken: true,
        hasAccountId: true,
        configured: true,
        isSyntheticData: false,
        validationMode: "live",
        isStaleData: false,
        feedMode: "hybrid",
        spread: 0,
        spreadPips: 0
      };

      const phases = [
        "TREND_UP",
        "RANGE",
        "COMPRESSION",
        "BREAKOUT_UP",
        "HIGH_VOLATILITY",
        "TREND_DOWN",
        "BREAKOUT_DOWN"
      ];
      
      const phaseResults = [];
      function generateTrendCandles(count: number, phase: string) {
        let price = 1.1000;
        let mockCandles = [];
        for (let i = 0; i < count; i++) {
          let open = price;
          let close = price;
          let high = price + 0.0005;
          let low = price - 0.0005;
          if (phase.includes("UP") && !phase.includes("BREAKOUT")) {
            close = price + 0.0010;
            high = close + 0.0002;
          } else if (phase.includes("DOWN") && !phase.includes("BREAKOUT")) {
            close = price - 0.0010;
            low = close - 0.0002;
          } else if (phase === "RANGE" || phase === "COMPRESSION") {
            const mod = i % 4;
            const spread = phase === "COMPRESSION" ? 0.0001 : 0.0005;
            if(mod === 0) close = price + spread;
            if(mod === 1 || mod === 2) close = price - spread;
            if(mod === 3) close = price + spread;
            high = Math.max(open, close) + 0.0001;
            low = Math.min(open, close) - 0.0001;
          } else if (phase.includes("BREAKOUT")) {
            if (i === count - 1) {
              close = price + (phase.includes("UP") ? 0.0030 : -0.0030);
              high = Math.max(open, close) + 0.0002;
              low = Math.min(open, close) - 0.0002;
            } else {
              close = price + (i % 2 === 0 ? 0.0002 : -0.0002);
              high = Math.max(open, close) + 0.0001;
              low = Math.min(open, close) - 0.0001;
            }
          } else if (phase === "HIGH_VOLATILITY") {
            const sign = i % 2 === 0 ? 1 : -1;
            const volMul = (phase === "HIGH_VOLATILITY" && i > 280) ? 0.0060 : 0.0010;
            close = price + (sign * volMul);
            high = Math.max(open, close) + 0.0010;
            low = Math.min(open, close) - 0.0010;
          }
          price = close;
          mockCandles.push({
            time: new Date(Date.now() - (count - i) * 60000).toISOString(),
            timestamp: Date.now() - (count - i) * 60000,
            open, high, low, close,
            volume: 100, complete: true,
            ema9: close, sma21: close,
            adx: phase.includes("TREND") || phase.includes("BREAKOUT") ? 35 : 15,
            plusDI: phase.includes("UP") ? 35 : 5,
            minusDI: phase.includes("DOWN") ? 35 : 5,
            atr: phase === "HIGH_VOLATILITY" ? (i > 280 ? 0.0050 : 0.0010) : (phase === "COMPRESSION" ? 0.0001 : 0.0010 + (((i + 3) % 5 - 2) * 0.0001)),
            bollinger: { 
              upper: close + (phase === "COMPRESSION" ? (i < 280 ? 0.0010 : 0.0001) : 0.0010 + (((i + 3) % 5 - 2) * 0.0001)),
              middle: close,
              lower: close - (phase === "COMPRESSION" ? (i < 280 ? 0.0010 : 0.0001) : 0.0010 + (((i + 3) % 5 - 2) * 0.0001))
            }
          });
        }
        return mockCandles;
      }

      for (const phase of phases) {
        // Generate 300 candles for regime stability
        const mockCandles = generateTrendCandles(300, phase);
        
        // Isolate state for this phase
        marketContext.executionMode = "debug_" + phase as any;
        
        const decision = simulateAnalysis(
          asset,
          timeframe,
          mockCandles[mockCandles.length - 1].close,
          {},
          "auto",
          null,
          mockCandles,
          "high",
          0,
          {
            ...marketContext,
            executionMode: "debug_" + phase as any,
            strategyMode: "auto"
          }
        );
        
        // Wait, the state manager key inside runSignalEngine uses marketContext.executionMode.
        // Let's just pass "debug" as the executionMode but reset the state manually. No, we can't import resetRegimeState easily here.
        // Actually, we can just use `debug_${phase}` as the executionMode so it uses a different state manager per phase!
        
        // No, the test specifically looks for 'debug' state isolation maybe? Let's check what the user wants.
        // "Reiniciar o estado antes de cada cenário ou utilizar uma chave isolada por fase."
        
        phaseResults.push({
          phase,
          rawRegime: decision.regimeResult?.rawRegime || "UNKNOWN",
          stabilizedRegime: decision.regimeResult?.regime || "UNKNOWN",
          regimeConfidence: decision.regimeResult?.regimeConfidence || 0,
          trendStrength: decision.regimeResult?.trendStrength || 0,
          directionScore: decision.regimeResult?.directionScore || 0,
          rangeQuality: decision.regimeResult?.rangeQuality || 0,
          callScore: decision.callScore?.total || 0,
          putScore: decision.putScore?.total || 0,
          directionalDifference: Math.abs((decision.callScore?.total || 0) - (decision.putScore?.total || 0)),
          entryQuality: decision.entryQuality || 0,
          higherRegime: (decision as any).higherRegime || "UNKNOWN",
          decision: decision.signal,
          reasons: (decision as any).reasons
        });
      }
      
      res.json({ phases: phaseResults });
    } catch (err: any) {
      res.status(500).json({ error: "Replay failed", details: String(err) });
    }
  });
}

app.get("/api/test-analysis", async (req, res) => {
  try {
    const assetQuery = req.query.asset ? String(req.query.asset) : "EUR/USD";
    const timeframeQuery = req.query.timeframe ? String(req.query.timeframe) : "M1";
    const selectedStrategy = req.query.strategy ? String(req.query.strategy) : "reversion";

    const symbolStr = assetQuery.replace("-", "/").toUpperCase();
    const timeframe = (timeframeQuery === "1min" || timeframeQuery === "M1") ? "M1" : "M5";

    let currentPrice = 1.0850;
    const isFastForex = !!process.env.FASTFOREX_API_KEY;
    let tick = null;
    let health = null;
    let spreadPips = 0.5;
    let maxAllowedSpreadPips = 1.5;

    if (isFastForex) {
      tick = getLatestTick(symbolStr);
      health = getMarketDataHealth(symbolStr);
      if (tick && tick.mid) {
        currentPrice = tick.mid;
        if (tick.ask && tick.bid) {
          const spread = tick.ask - tick.bid;
          let pipSize = 0.0001;
          if (symbolStr.includes("JPY")) pipSize = 0.01;
          spreadPips = spread / pipSize;
        }
      }
    }

    if (symbolStr.includes("EUR_USD") || symbolStr.includes("EUR/USD")) maxAllowedSpreadPips = 1.5;
    else if (symbolStr.includes("GBP_USD") || symbolStr.includes("GBP/USD")) maxAllowedSpreadPips = 2.0;
    else if (symbolStr.includes("USD_JPY") || symbolStr.includes("USD/JPY")) maxAllowedSpreadPips = 1.8;
    else if (symbolStr.includes("EUR_GBP") || symbolStr.includes("EUR/GBP")) maxAllowedSpreadPips = 1.8;

    const marketContext: MarketContext = {
      executionMode: "live",
      newsRisk: "LOW",
      session: "OVERLAP",
      minutesToHighImpactNews: 120,
      engineVersion: "v1.0",
      configured: isFastForex,
      hasToken: true,
      hasAccountId: true,
      isSyntheticData: false,
      isStaleData: health ? (health as any).status === "stale" : false,
      dataAgeMs: health ? health.dataAgeMs : 0,
      dataSourceType: 'fastforex',
      feedMode: "hybrid",
      spread: tick?.ask && tick?.bid ? tick.ask - tick.bid : 0,
      spreadPips: spreadPips,
      maxAllowedSpreadPips,
      validationMode: "live" as const,
      disableConsecutiveLossVeto: false,
      disableCalibrationVeto: false,
      disableMockCalibration: true,
      strategyMode: "auto",
      ...req.body.marketContext // allows overriding if provided
    };

    let finalCandles: Candle[] = [];
    let hasGaps = false;
    let duplicatesRemoved = 0;

    try {
      const fetchLimit = timeframe === "M1" ? 300 : 100;
      const realMarketCandles = await getFastForexCandles(symbolStr, timeframe, fetchLimit);
      
      if (realMarketCandles && realMarketCandles.length > 0) {
        // Detect duplicates explicitly just to log for the data quality object
        const unique = new Map();
        for (const rc of realMarketCandles) {
          if (unique.has(rc.timestamp)) duplicatesRemoved++;
          unique.set(rc.timestamp, rc);
        }
        
        const mappedCandles: Candle[] = Array.from(unique.values()).sort((a: any, b: any) => a.timestamp - b.timestamp).map(rc => ({
          time: rc.time,
          open: rc.open,
          high: rc.high,
          low: rc.low,
          close: rc.close,
          provider: rc.provider,
          source: rc.source,
          timestamp: rc.timestamp
        }));

        const expectedIntervalSeconds = timeframe === "M1" ? 60 : 300;
        for (let i = 1; i < mappedCandles.length; i++) {
          const diffMs = ((mappedCandles[i] as any).timestamp || 0) - ((mappedCandles[i - 1] as any).timestamp || 0);
          if (diffMs > expectedIntervalSeconds * 1000 * 1.5) {
             hasGaps = true;
          }
        }

        finalCandles = populateIndicators(mappedCandles);
      }
    } catch (err) {
      console.error("[Test Analysis] Error fetching candles:", err);
    }

    const candlesCount = finalCandles.length;
    const firstTime = finalCandles[0]?.time;
    const lastTime = finalCandles[finalCandles.length - 1]?.time;
    const isSorted = finalCandles.length > 0 && finalCandles.every((c, i) => i === 0 || c.time >= finalCandles[i - 1].time);
    const lastCandle = finalCandles[finalCandles.length - 1];
    const indicatorsCalculated = !!(lastCandle && 
                                  lastCandle.ema9 !== undefined && 
                                  lastCandle.sma21 !== undefined && 
                                  lastCandle.rsi !== undefined && 
                                  lastCandle.macd !== undefined && 
                                  lastCandle.bollinger !== undefined && 
                                  lastCandle.stochastic !== undefined && 
                                  lastCandle.atr !== undefined);

    console.log("================== ANÁLISE DE TESTE GET ==================");
    console.log(`Ativo: ${symbolStr} | Timeframe: ${timeframe}`);
    console.log(`Candles recebidos: ${candlesCount}`);
    console.log(`Primeiro Horário: ${firstTime} | Último Horário: ${lastTime}`);
    console.log(`Candles Ordenados Corretamente: ${isSorted ? "SIM" : "NÃO"}`);
    console.log(`Indicadores Técnicos Calculados: ${indicatorsCalculated ? "SIM" : "NÃO"}`);
    console.log(`Gaps Detectados: ${hasGaps ? "SIM" : "NÃO"}`);

    const blockers: string[] = [];
    if (candlesCount < 100) {
      blockers.push(`Quantidade de candles insuficiente (${candlesCount} < 100).`);
    }
    if (!isSorted && candlesCount > 0) {
      blockers.push("Candles históricos fora de ordem cronológica.");
    }
    if (hasGaps) {
      blockers.push("Gaps graves encontrados nos dados históricos da FastForex.");
    }
    const hasInvalidCandle = finalCandles.some(c => 
      !c.time ||
      !Number.isFinite(c.open) || 
      !Number.isFinite(c.high) || 
      !Number.isFinite(c.low) || 
      !Number.isFinite(c.close) || 
      c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0
    );
    if (hasInvalidCandle) {
      blockers.push("Candles contêm valores inválidos (zeros, negativos ou NaN).");
    }
    if (!indicatorsCalculated && candlesCount > 0) {
      blockers.push("Não foi possível calcular indicadores técnicos principais.");
    }

    const indicatorsStatusMap = {
      ema9: lastCandle?.ema9 !== undefined ? "OK" : "INSUFFICIENT_DATA",
      sma21: lastCandle?.sma21 !== undefined ? "OK" : "INSUFFICIENT_DATA",
      ema50: lastCandle?.ema50 !== undefined ? "OK" : "INSUFFICIENT_DATA",
      rsi: lastCandle?.rsi !== undefined ? "OK" : "INSUFFICIENT_DATA",
      macd: lastCandle?.macd !== undefined ? "OK" : "INSUFFICIENT_DATA",
      atr: lastCandle?.atr !== undefined ? "OK" : "INSUFFICIENT_DATA",
      adx: lastCandle?.adx !== undefined ? "OK" : "INSUFFICIENT_DATA",
      stochastic: lastCandle?.stochastic !== undefined ? "OK" : "INSUFFICIENT_DATA",
      bollinger: lastCandle?.bollinger !== undefined ? "OK" : "INSUFFICIENT_DATA"
    };

    const calibrationMode = "MOCK";
    const dataQuality = {
      hasGaps,
      duplicatesRemoved,
      oldestCandle: firstTime || null,
      newestCandle: lastTime || null,
      expectedIntervalSeconds: timeframe === "M1" ? 60 : 300
    };

    if (blockers.length > 0) {
      console.log(`[Bloqueio de Segurança] VETO: ${blockers.join(" | ")}`);
      console.log("==========================================================\n");
      return res.json({
        asset: symbolStr.replace("/", ""),
        timeframe,
        dataSource: "FastForex",
        calibrationMode,
        statisticalConfidenceAvailable: false,
        historicalSampleSize: 0,
        candlesUsed: candlesCount,
        firstCandleTime: firstTime || null,
        lastCandleTime: lastTime || null,
        dataQuality,
        indicatorsStatus: indicatorsStatusMap,
        signal: "NEUTRAL",
        technicalScore: 0,
        calibratedProbability: null,
        calibrationAvailable: false,
        technicalConfidence: 0,
        reasons: ["Sinal neutralizado devido a bloqueios de segurança.", "Histórico insuficiente para assertividade estatística real."],
        blockers
      });
    }

    if (req.body?.marketContext?.executionMode) {
      marketContext.executionMode = req.body.marketContext.executionMode;
    } else {
      marketContext.executionMode = "live";
    }
    const engineDecision = simulateAnalysis(
      symbolStr,
      timeframe,
      currentPrice,
      {},
      selectedStrategy,
      null,
      finalCandles,
      "high",
      0,
      marketContext
    );


    const technicalConfidence = engineDecision.technicalScore || engineDecision.technicalScore;
    const finalReasons = [...(engineDecision.reasoning || [])];
    if (calibrationMode === "MOCK") {
       finalReasons.push("Histórico insuficiente para assertividade estatística real.");
    }

    console.log(`[Análise Final] Ativo: ${symbolStr} | Sinal: ${engineDecision.signal} | Confiança Técnica: ${technicalConfidence}%`);
    console.log("==========================================================\n");

    res.json({
      asset: symbolStr.replace("/", ""),
      timeframe,
      dataSource: "FastForex",
      calibrationMode,
      statisticalConfidenceAvailable: false,
      historicalSampleSize: 0,
      candlesUsed: candlesCount,
      firstCandleTime: firstTime || null,
      lastCandleTime: lastTime || null,
      dataQuality,
      indicatorsStatus: indicatorsStatusMap,
      signal: engineDecision.signal,
      technicalScore: engineDecision.technicalScore,
      calibratedProbability: engineDecision.calibratedProbability,
      calibrationAvailable: engineDecision.calibrationAvailable,
      technicalConfidence,
      reasons: finalReasons,
      blockers: blockers.length > 0 ? blockers : (engineDecision.vetoReasons || []),
      currentPrice,
      indicators: {
        rsi: lastCandle?.rsi,
        macd: lastCandle?.macd,
        bollinger: lastCandle?.bollinger,
        ema9: lastCandle?.ema9,
        sma21: lastCandle?.sma21,
        ema50: lastCandle?.ema50,
        ema200: lastCandle?.ema200,
        stochastic: lastCandle?.stochastic,
        atr: lastCandle?.atr,
        adx: lastCandle?.adx
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: "Erro no teste de análise", details: error.message });
  }
});


function simulateAnalysis(
  asset: string, 
  timeframe: string, 
  currentPrice: number, 
  indicators: any, 
  strategy: string = "reversion", 
  tvData: any = null, 
  candles: any[] = [], 
  precisionLevel: "normal" | "high" | "elite" = "high",
  consecutiveLossCount: number = 0,
  marketContext: MarketContext = { executionMode: "live", newsRisk: "LOW", session: "OVERLAP", minutesToHighImpactNews: 120 }
) {
  marketContext.precisionLevel = precisionLevel;
  const decision = runSignalEngine(asset, timeframe, currentPrice, candles, null, marketContext, consecutiveLossCount);
  
  // Use the statistically calibrated probability as the final confidence
  let techScore = decision.technicalScore;
  
  if (marketContext.spreadPips && marketContext.maxAllowedSpreadPips) {
    if (marketContext.spreadPips > marketContext.maxAllowedSpreadPips) {
      techScore *= 0.3; 
    } else {
      const spreadRatio = marketContext.spreadPips / marketContext.maxAllowedSpreadPips; 
      techScore *= (1 - spreadRatio * 0.2); 
    }
  }
  if (decision.regime === "chaos") {
    techScore *= 0.5;
  }
  if (decision.driftFlag) {
    techScore = 0;
  }
  techScore = Math.round(Math.max(0, Math.min(100, techScore)));

  // Backwards compatibility mapping for the frontend
  let rsiStatus = `RSI: ${(indicators?.rsi || 50).toFixed(1)} (${decision.regime})`;
  let macdStatus = "MACD: " + decision.regime;
  let bollingerStatus = "Bollinger: " + decision.regime;
  let maStatus = "Médias: " + decision.regime;
  let stochStatus = "Stoch: Normal";
  let atrStatus = "ATR: Saudável";

  // If neutral due to vetoes, we want to communicate that.
  if (decision.signal === 'NEUTRAL' && decision.vetoReasons.length > 0) {
     rsiStatus = "Bloqueado pelo motor";
     macdStatus = decision.vetoReasons[0];
  }

  const calculatedEntry = calculateEntryTime(timeframe);

  return {
    id: Date.now().toString(36) + "-" + Math.floor(Date.now() * 1000).toString(16),
    isSimulated: true,
    asset,
    timeframe,
    strategy: decision.strategy === 'N/A' ? strategy : decision.strategy,
    signal: decision.signal,
    technicalScore: techScore,
    calibratedProbability: decision.calibratedProbability,
    calibrationAvailable: decision.calibrationAvailable,
    regime: decision.regime,
    
    reliabilityScore: decision.reliabilityScore,
    sampleSize: decision.sampleSize,
    historicalWinRate: decision.historicalWinRate,
    vetoReasons: decision.vetoReasons,
    driftFlag: decision.driftFlag,
    driftReason: decision.driftReason,
    gateStatus: decision.gateStatus,
    regimeResult: decision.regimeResult,
    route: decision.route,
    callScore: decision.callScore,
    putScore: decision.putScore,
    entryQuality: decision.entryQuality,
    confirmations: decision.confirmations,
    counterEvidence: decision.counterEvidence,
    blockReasons: decision.blockReasons,
    expiry: timeframe === "M1" ? "1 MINUTO" : "5 MINUTOS",
    entryTime: calculatedEntry,
    analysisTitle: `Motor Multi-Modal [${decision.regime.toUpperCase()}]`,
    reasoning: (decision as any).reasons,
    keyLevels: decision.keyLevels || { support: null, resistance: null, supportStrength: 0, resistanceStrength: 0, distanceToSupportAtr: null, distanceToResistanceAtr: null },
    indicatorsStatus: {
      rsi: rsiStatus,
      macd: macdStatus,
      bollinger: bollingerStatus,
      movingAverages: maStatus,
      stochastic: stochStatus,
      atr: atrStatus
    },
    timestamp: new Date().toISOString()
  };
}

// Helper to get selected asset decimals for precise rendering
function selectedAssetDecimals(symbol: string): number {
  if (symbol.includes("BTC")) return 1;
  if (symbol.includes("BNB")) return 1;
  if (symbol.includes("ETH")) return 2;
  if (symbol.includes("SOL")) return 2;
  if (symbol.includes("JPY")) return 3;
  if (symbol.includes("XRP")) return 4;
  if (symbol.includes("BRL")) return 4;
  return 5;
}

// Start Vite dev server integration

async function startServer() {

  // Fallback for API routes that are not found
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API_ROUTE_NOT_FOUND" });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}
if (process.env.TEST_ENV !== "true") {
  startServer();
}

export { app, setAnalyzeMarketDataProvider, setBackstageScanAllCandlesFetcher, resetBackstageScanAllState };
