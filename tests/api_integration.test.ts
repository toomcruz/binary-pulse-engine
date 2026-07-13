// Set test environment variables FIRST
process.env.TEST_ENV = "true";
process.env.NODE_ENV = "test";
process.env.FASTFOREX_API_KEY = "mock_test_key";
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

    return originalFetch(url, init);
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
  const { app, setAnalyzeMarketDataProvider } = await import('../server');
  const { stopFastForexSync } = await import('../server/dataSources/marketDataService');
  setAnalyzeMarketDataProvider(createDeterministicTestMarketDataProvider());
  
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
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
});
