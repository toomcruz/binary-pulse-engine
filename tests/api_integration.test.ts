// Set test environment variables FIRST
process.env.TEST_ENV = "true";
process.env.NODE_ENV = "test";
process.env.FASTFOREX_API_KEY = "mock_test_key";
process.env.FASTFOREX_BASE_URL = "https://fastforex.test";
process.env.FASTFOREX_SYMBOLS_FOREX = "EUR/USD,GBP/USD";
process.env.FASTFOREX_SYMBOLS_CRYPTO = "BTC/USD";
process.env.FASTFOREX_TIMEOUT_MS = "500";
// Force Gemini formatter to take the deterministic fallback path (no real API calls in tests).
process.env.GEMINI_API_KEY = "";

import test from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { MarketDataProvider, createDeterministicTestMarketDataProvider } from '../server/dataSources/marketDataProvider';

const originalFetch = global.fetch;

function setupMockFetch() {
  global.fetch = (async (url: any, init?: any) => {
    const urlStr = String(url);

    if (urlStr.includes("127.0.0.1") || urlStr.includes("localhost")) {
      return originalFetch(url, init);
    }

    if (urlStr.includes("/fetch-one") || urlStr.includes("/fetch-all") || urlStr.includes("/fetch-multi")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            USD: 1.0850,
            EUR: 0.9200,
            GBP: 0.7800,
            JPY: 155.50,
            BTC: 62500.0,
            ETH: 3450.0
          },
          updated: new Date().toISOString()
        })
      } as any;
    }

    if (urlStr.includes("/fx/quote")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          quotes: {
            EURUSD: {
              bid: 1.0850,
              ask: 1.0852,
              price: 1.0851,
              timestamp: Date.now() / 1000
            },
            GBPUSD: {
              bid: 1.2850,
              ask: 1.2852,
              price: 1.2851,
              timestamp: Date.now() / 1000
            }
          }
        })
      } as any;
    }

    if (urlStr.includes("/fx/ohlc/time-series") || urlStr.includes("/candles") || urlStr.includes("/time-series") || urlStr.includes("/klines")) {
      const results: Array<{ d: number; o: number; h: number; l: number; c: number; v: number }> = [];
      const now = Math.floor(Date.now() / 300000) * 300000;
      // Generate enough candles to pass the checks
      // FastForex mapper expects { d, o, h, l, c, v }
      for (let i = 0; i < 500; i++) {
        const timestamp = now - (500 - i) * 60000;
        results.push({
          d: timestamp,
          o: 1.0850,
          h: 1.0860,
          l: 1.0840,
          c: 1.0852,
          v: 1000
        });
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results
        })
      } as any;
    }

    throw new Error(`Unexpected non-deterministic fetch in API integration test: ${urlStr}`);
  }) as any;
}

function restoreFetch() {
  global.fetch = originalFetch;
}

function fetchJson(url: string, init?: RequestInit): Promise<{ response: Response; data: any; durationMs: number }> {
  const startedAt = Date.now();
  return fetch(url, init).then(async (response) => ({
    response,
    data: await response.json(),
    durationMs: Date.now() - startedAt
  }));
}


function createBackstageScanCandles(count = 160): any[] {
  const now = Math.floor(Date.now() / 60000) * 60000;
  return Array.from({ length: count }, (_, i) => {
    const timestamp = now - (count - i + 1) * 60000;
    const base = 1.08 + i * 0.00001;
    return {
      time: new Date(timestamp).toISOString(),
      timestamp,
      open: base,
      high: base + 0.0005,
      low: base - 0.0005,
      close: base + (i % 2 === 0 ? 0.0001 : -0.0001),
      volume: 1000,
      complete: true,
      source: "test",
      provider: "test",
      instrument: "EUR/USD",
      granularity: "M1",
      priceType: "mid"
    };
  });
}

async function postBackstageScanAll(baseUrl: string) {
  return fetchJson(`${baseUrl}/api/backstage-scan-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
}

function createNeverRespondingProvider(): MarketDataProvider {
  const deterministic = createDeterministicTestMarketDataProvider();
  return {
    ...deterministic,
    async getPrice() {
      return new Promise(() => undefined);
    }
  };
}

function createUnavailableProvider(): MarketDataProvider {
  const deterministic = createDeterministicTestMarketDataProvider();
  return {
    ...deterministic,
    async getPrice() {
      return null;
    },
    getHealth(symbol: string) {
      return {
        ...deterministic.getHealth(symbol),
        isConnected: false,
        isStaleData: true,
        dataAgeMs: null,
        connectionStatus: "ERROR",
        error: "Deterministic provider unavailable"
      };
    }
  };
}

test("API Integration Tests", async (t) => {
  setupMockFetch();

  // Import app dynamically after setting environment variables
  const { app, setAnalyzeMarketDataProvider, setBackstageScanAllCandlesFetcher, resetBackstageScanAllState } = await import('../server');
  const { stopFastForexSync } = await import('../server/dataSources/marketDataService');
  setAnalyzeMarketDataProvider(createDeterministicTestMarketDataProvider());
  
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    resetBackstageScanAllState();
    delete process.env.BACKSTAGE_SCAN_ALL_TIMEOUT_MS;
    setAnalyzeMarketDataProvider(null);
    stopFastForexSync();
    restoreFetch();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await t.test("1. GET /api/market/latest-price - Success and Missing Symbol", async () => {
    // Missing symbol should return 400
    const errRes = await fetch(`${baseUrl}/api/market/latest-price`);
    assert.strictEqual(errRes.status, 400);
    const errData = await errRes.json();
    assert.strictEqual(errData.ok, false);
    assert.strictEqual(errData.error, "MISSING_SYMBOL");

    // Valid symbol should return success
    const successRes = await fetch(`${baseUrl}/api/market/latest-price?symbol=EUR/USD`);
    assert.strictEqual(successRes.status, 200);
    const successData = await successRes.json();
    assert.strictEqual(successData.ok, true);
    assert.strictEqual(successData.symbol, "EUR/USD");
    assert.strictEqual(typeof successData.price, "number");
  });

  await t.test("2. GET /api/market/candles - Timeframes and limits", async () => {
    // Limits validation
    const successRes = await fetch(`${baseUrl}/api/market/candles?symbol=EUR/USD&timeframe=M5&limit=50`);
    assert.strictEqual(successRes.status, 200);
    const successData = await successRes.json();
    assert.strictEqual(successData.ok, true);
    assert.strictEqual(successData.timeframe, "M5");
    assert.ok(Array.isArray(successData.candles));
  });

  await t.test("3. POST /api/backstage-replay - input validation", async () => {
    const basePayload = {
      asset: "EUR/USD",
      timeframe: "M1",
      strategy: "reversion",
      precisionLevel: "normal",
      payout: 0.88
    };

    const invalidTimeframeRes = await fetch(`${baseUrl}/api/backstage-replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...basePayload, timeframe: "M15" })
    });
    assert.strictEqual(invalidTimeframeRes.status, 400);
    assert.strictEqual((await invalidTimeframeRes.json()).error, "INVALID_TIMEFRAME");

    const invalidAssetRes = await fetch(`${baseUrl}/api/backstage-replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...basePayload, asset: "DOGE/USD" })
    });
    assert.strictEqual(invalidAssetRes.status, 400);
    assert.strictEqual((await invalidAssetRes.json()).error, "INVALID_ASSET");

    const invalidStrategyRes = await fetch(`${baseUrl}/api/backstage-replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...basePayload, strategy: "martingale" })
    });
    assert.strictEqual(invalidStrategyRes.status, 400);
    assert.strictEqual((await invalidStrategyRes.json()).error, "INVALID_STRATEGY");

    const invalidPrecisionRes = await fetch(`${baseUrl}/api/backstage-replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...basePayload, precisionLevel: "turbo" })
    });
    assert.strictEqual(invalidPrecisionRes.status, 400);
    assert.strictEqual((await invalidPrecisionRes.json()).error, "INVALID_PRECISION_LEVEL");

    const validAliasRes = await fetch(`${baseUrl}/api/backstage-replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: { symbol: "eur/usd" },
        timeframe: "1min",
        strategy: "auto",
        precisionLevel: "ELITE",
        payout: 0.88
      })
    });
    assert.strictEqual(validAliasRes.status, 200);
    const validAliasData = await validAliasRes.json();
    assert.ok(["BACKSTAGE_TESTING", "BACKSTAGE_VALIDATED", "BACKSTAGE_REJECTED"].includes(validAliasData.status));
    assert.strictEqual(validAliasData.economicMetricsAvailable, true);
  });

  await t.test("3. POST /api/analyze-market - executionMode validation", async () => {
    // Invalid executionMode should return 400
    const errRes = await fetch(`${baseUrl}/api/analyze-market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: "EUR/USD",
        timeframe: "M5",
        currentPrice: 1.0850,
        marketContext: {
          executionMode: "invalid_mode_here"
        }
      })
    });
    assert.strictEqual(errRes.status, 400);
    const errData = await errRes.json();
    assert.strictEqual(errData.error, "INVALID_EXECUTION_MODE");

    // Valid executionMode (paper_trading) should work
    const { response: successRes, data: successData, durationMs } = await fetchJson(`${baseUrl}/api/analyze-market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: "EUR/USD",
        timeframe: "M5",
        currentPrice: 1.0850,
        marketContext: {
          executionMode: "paper_trading"
        }
      })
    });
    assert.strictEqual(successRes.status, 200);
    assert.ok(durationMs < 2000, `analysis took ${durationMs}ms`);
    assert.strictEqual(successData.ok, true);
    assert.strictEqual(successData.asset, "EUR/USD");
    assert.strictEqual(successData.timeframe, "M5");
    assert.strictEqual(typeof successData.regime, "string");
    assert.strictEqual(typeof successData.technicalScore, "number");
    assert.ok("calibratedProbability" in successData);
    assert.strictEqual(typeof successData.calibrationAvailable, "boolean");
    assert.ok(["CALL", "PUT", "NEUTRAL"].includes(successData.signal));
    assert.ok(Array.isArray(successData.blockReasons));
  });

  await t.test("4. POST /api/analyze-market - Calibration Gate Thresholds", async () => {
    // Calibration threshold above probability (gate blocks signal)
    const blockedRes = await fetch(`${baseUrl}/api/analyze-market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: "EUR/USD",
        timeframe: "M5",
        currentPrice: 1.0850,
        calibrationThreshold: 0.95, // extremely high, should force block
        marketContext: {
          executionMode: "paper_trading"
        }
      })
    });
    assert.strictEqual(blockedRes.status, 200);
    const blockedData = await blockedRes.json();
    if (blockedData.signal === "CALL" || blockedData.signal === "PUT") {
      assert.fail("Signal was not blocked by Calibration Gate");
    }
  });

  await t.test("5. POST /api/analyze-market - Invalid Strategy Mode", async () => {
    const errRes = await fetch(`${baseUrl}/api/analyze-market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: "EUR/USD",
        timeframe: "M5",
        currentPrice: 1.0850,
        strategy: "invalid_strategy_name"
      })
    });
    assert.strictEqual(errRes.status, 400);
    const errData = await errRes.json();
    assert.strictEqual(errData.error, "INVALID_STRATEGY_MODE");
  });

  await t.test("6. POST /api/analyze-market - provider timeout returns 504", async () => {
    setAnalyzeMarketDataProvider(createNeverRespondingProvider());
    const { response, data, durationMs } = await fetchJson(`${baseUrl}/api/analyze-market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: "EUR/USD",
        timeframe: "M5",
        currentPrice: 1.0850,
        marketContext: { executionMode: "paper_trading" }
      })
    });
    assert.strictEqual(response.status, 504);
    assert.strictEqual(data.ok, false);
    assert.strictEqual(data.error, "MARKET_DATA_TIMEOUT");
    assert.strictEqual(typeof data.requestId, "string");
    assert.ok(durationMs < 2000, `timeout response took ${durationMs}ms`);
    setAnalyzeMarketDataProvider(createDeterministicTestMarketDataProvider());
  });

  await t.test("7. POST /api/analyze-market - unavailable provider returns 503", async () => {
    setAnalyzeMarketDataProvider(createUnavailableProvider());
    const { response, data } = await fetchJson(`${baseUrl}/api/analyze-market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: "EUR/USD",
        timeframe: "M5",
        currentPrice: 1.0850,
        marketContext: { executionMode: "paper_trading" }
      })
    });
    assert.strictEqual(response.status, 503);
    assert.strictEqual(data.ok, false);
    assert.strictEqual(data.error, "MARKET_DATA_UNAVAILABLE");
    assert.strictEqual(typeof data.requestId, "string");
    setAnalyzeMarketDataProvider(createDeterministicTestMarketDataProvider());
  });

  await t.test("8. POST /api/analyze-market - Gemini absent uses deterministic formatter", async () => {
    const { response, data, durationMs } = await fetchJson(`${baseUrl}/api/analyze-market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: "EUR/USD",
        timeframe: "M5",
        currentPrice: 1.0850,
        marketContext: { executionMode: "paper_trading" }
      })
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.ok, true);
    assert.ok(Array.isArray(data.reasoning));
    assert.ok(durationMs < 2000, `Gemini-absent deterministic response took ${durationMs}ms`);
  });

  await t.test("9. POST /api/backstage-scan-all - normal execution", async () => {
    resetBackstageScanAllState();
    setBackstageScanAllCandlesFetcher(async () => ({
      candles: createBackstageScanCandles(),
      metrics: {
        batchesFetched: 1,
        requestedCandles: 2000,
        uniqueCandlesReceived: 160,
        duplicateCandlesDiscarded: 0,
        oldestTimestamp: null,
        newestTimestamp: null
      }
    }));

    const { response, data } = await postBackstageScanAll(baseUrl);
    assert.strictEqual(response.status, 200);
    assert.ok(Array.isArray(data.setups));
    assert.strictEqual(typeof data.stats.bestStrategy, "string");
    resetBackstageScanAllState();
  });

  await t.test("10. POST /api/backstage-scan-all - rejects simultaneous scans with 409", async () => {
    resetBackstageScanAllState();
    let releaseFirstFetch!: () => void;
    let fetchCalls = 0;
    const firstFetchStarted = new Promise<void>((resolve) => {
      setBackstageScanAllCandlesFetcher(async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) {
          resolve();
          await new Promise<void>((release) => { releaseFirstFetch = release; });
        }
        return {
          candles: createBackstageScanCandles(),
          metrics: {
            batchesFetched: 1,
            requestedCandles: 2000,
            uniqueCandlesReceived: 160,
            duplicateCandlesDiscarded: 0,
            oldestTimestamp: null,
            newestTimestamp: null
          }
        };
      });
    });

    const firstRequest = postBackstageScanAll(baseUrl);
    await firstFetchStarted;
    const { response: conflictResponse, data: conflictData } = await postBackstageScanAll(baseUrl);
    assert.strictEqual(conflictResponse.status, 409);
    assert.deepStrictEqual(conflictData, { error: "BACKSTAGE_SCAN_ALREADY_RUNNING" });

    releaseFirstFetch();
    const { response: firstResponse } = await firstRequest;
    assert.strictEqual(firstResponse.status, 200);
    resetBackstageScanAllState();
  });

  await t.test("11. POST /api/backstage-scan-all - releases lock after success", async () => {
    resetBackstageScanAllState();
    setBackstageScanAllCandlesFetcher(async () => ({
      candles: createBackstageScanCandles(),
      metrics: {
        batchesFetched: 1,
        requestedCandles: 2000,
        uniqueCandlesReceived: 160,
        duplicateCandlesDiscarded: 0,
        oldestTimestamp: null,
        newestTimestamp: null
      }
    }));

    assert.strictEqual((await postBackstageScanAll(baseUrl)).response.status, 200);
    assert.strictEqual((await postBackstageScanAll(baseUrl)).response.status, 200);
    resetBackstageScanAllState();
  });

  await t.test("12. POST /api/backstage-scan-all - releases lock after error", async () => {
    resetBackstageScanAllState();
    let calls = 0;
    setBackstageScanAllCandlesFetcher(async () => {
      calls += 1;
      if (calls === 1) throw new Error("TEST_BACKSTAGE_SCAN_FAILURE");
      return {
        candles: createBackstageScanCandles(),
        metrics: {
          batchesFetched: 1,
          requestedCandles: 2000,
          uniqueCandlesReceived: 160,
          duplicateCandlesDiscarded: 0,
          oldestTimestamp: null,
          newestTimestamp: null
        }
      };
    });

    const failed = await postBackstageScanAll(baseUrl);
    assert.strictEqual(failed.response.status, 500);
    assert.strictEqual(failed.data.error, "TEST_BACKSTAGE_SCAN_FAILURE");
    const recovered = await postBackstageScanAll(baseUrl);
    assert.strictEqual(recovered.response.status, 200);
    resetBackstageScanAllState();
  });

  await t.test("13. POST /api/backstage-scan-all - timeout stops fetching additional assets", async () => {
    resetBackstageScanAllState();
    process.env.BACKSTAGE_SCAN_ALL_TIMEOUT_MS = "25";
    let fetchCalls = 0;
    let resolveCancellation!: () => void;
    const cancellationFinished = new Promise<void>((resolve) => { resolveCancellation = resolve; });

    setBackstageScanAllCandlesFetcher(async (_symbol, _timeframe, _targetCandles, signal) => {
      fetchCalls += 1;
      await new Promise<void>((resolve) => {
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      resolveCancellation();
      return {
        candles: createBackstageScanCandles(),
        metrics: {
          batchesFetched: 1,
          requestedCandles: 2000,
          uniqueCandlesReceived: 160,
          duplicateCandlesDiscarded: 0,
          oldestTimestamp: null,
          newestTimestamp: null
        }
      };
    });

    const timedOut = await postBackstageScanAll(baseUrl);
    assert.strictEqual(timedOut.response.status, 504);
    assert.strictEqual(timedOut.data.error, "BACKSTAGE_SCAN_TIMEOUT");
    await cancellationFinished;

    const callsAfterTimeout = fetchCalls;
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(fetchCalls, callsAfterTimeout);

    delete process.env.BACKSTAGE_SCAN_ALL_TIMEOUT_MS;
    setBackstageScanAllCandlesFetcher(async () => ({
      candles: createBackstageScanCandles(),
      metrics: {
        batchesFetched: 1,
        requestedCandles: 2000,
        uniqueCandlesReceived: 160,
        duplicateCandlesDiscarded: 0,
        oldestTimestamp: null,
        newestTimestamp: null
      }
    }));
    assert.strictEqual((await postBackstageScanAll(baseUrl)).response.status, 200);
    resetBackstageScanAllState();
  });

  await t.test("14. POST /api/backstage-scan-all - keeps lock until cancelled scan finishes", async () => {
    resetBackstageScanAllState();
    process.env.BACKSTAGE_SCAN_ALL_TIMEOUT_MS = "25";
    let releaseCancelledWork!: () => void;
    const cancelledWorkReleased = new Promise<void>((resolve) => { releaseCancelledWork = resolve; });

    setBackstageScanAllCandlesFetcher(async (_symbol, _timeframe, _targetCandles, signal) => {
      await new Promise<void>((resolve) => {
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      await cancelledWorkReleased;
      return {
        candles: createBackstageScanCandles(),
        metrics: {
          batchesFetched: 1,
          requestedCandles: 2000,
          uniqueCandlesReceived: 160,
          duplicateCandlesDiscarded: 0,
          oldestTimestamp: null,
          newestTimestamp: null
        }
      };
    });

    const timedOut = await postBackstageScanAll(baseUrl);
    assert.strictEqual(timedOut.response.status, 504);
    assert.strictEqual(timedOut.data.error, "BACKSTAGE_SCAN_TIMEOUT");

    const stillLocked = await postBackstageScanAll(baseUrl);
    assert.strictEqual(stillLocked.response.status, 409);
    assert.deepStrictEqual(stillLocked.data, { error: "BACKSTAGE_SCAN_ALREADY_RUNNING" });

    delete process.env.BACKSTAGE_SCAN_ALL_TIMEOUT_MS;
    setBackstageScanAllCandlesFetcher(async () => ({
      candles: createBackstageScanCandles(),
      metrics: {
        batchesFetched: 1,
        requestedCandles: 2000,
        uniqueCandlesReceived: 160,
        duplicateCandlesDiscarded: 0,
        oldestTimestamp: null,
        newestTimestamp: null
      }
    }));
    releaseCancelledWork();

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual((await postBackstageScanAll(baseUrl)).response.status, 200);
    resetBackstageScanAllState();
  });

});
